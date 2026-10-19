// Collegamento fra dispositivi con PeerJS (WebRTC). Il primo contatto passa dal server pubblico
// gratuito di PeerJS (serve internet); poi i dati viaggiano diretti fra i dispositivi.
//
// Messaggi
//   client → iPad: {t:'hello', pin, role:'remote'|'display'} · {t:'cmd', c, arg}
//   iPad → client: {t:'welcome'} · {t:'denied'} · {t:'status', ...} · {t:'library', items}
//                  {t:'script', id, title, text} · {t:'settings', s}
import { uid } from './util.js';

const PREFIX = 'slimdogs-tp-';
const HOST_KEY = 'tp.linkHost';
const CLIENT_KEY = 'tp.linkClient';

let peerjsP;
function loadPeerJS() {
  return peerjsP ??= new Promise((resolve, reject) => {
    if (self.Peer) return resolve(self.Peer);
    const s = document.createElement('script');
    s.src = 'vendor/peerjs/peerjs.min.js';
    s.onload = () => resolve(self.Peer);
    s.onerror = () => { peerjsP = null; reject(new Error('libreria PeerJS non caricata')); };
    document.head.append(s);
  });
}

const digits = n => Array.from(crypto.getRandomValues(new Uint32Array(n)), v => v % 10).join('');

function readJSON(key) { try { return JSON.parse(localStorage.getItem(key) || '{}'); } catch { return {}; } }
function writeJSON(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch {} }

export function clientCreds() { return readJSON(CLIENT_KEY); }
export function saveClientCreds(c) { writeJSON(CLIENT_KEY, c); }

// ---------- iPad (prompter) ----------

export class LinkHost {
  constructor({ onHello, onMessage, onChange }) {
    this.onHello = onHello;
    this.onMessage = onMessage;
    this.onChange = onChange;
    this.clients = new Set();
    this.state = 'off'; // off | starting | online | error
    this.error = '';
    const c = readJSON(HOST_KEY);
    this.code = c.code || digits(6);
    this.pin = c.pin || digits(4);
    this.enabled = !!c.enabled;
    this.save();
  }

  save() { writeJSON(HOST_KEY, { code: this.code, pin: this.pin, enabled: this.enabled }); }

  setEnabled(on) {
    this.enabled = on;
    this.save();
    on ? this.start() : this.stop();
  }

  newPin() {
    this.pin = digits(4);
    this.save();
    for (const c of this.clients) c.close();
    this.clients.clear();
    this.changed();
  }

  changed() { this.onChange?.(this); }

  counts() {
    let remote = 0, display = 0;
    for (const c of this.clients) c.role === 'display' ? display++ : remote++;
    return { remote, display };
  }

  async start() {
    if (!this.enabled || this.peer) return;
    this.state = 'starting';
    this.error = '';
    this.changed();
    let Peer;
    try { Peer = await loadPeerJS(); }
    catch (err) { this.fail(err.message + ' (sei offline?)'); return; }
    if (!this.enabled || this.peer) return;
    const peer = this.peer = new Peer(PREFIX + this.code, { debug: 0 });
    peer.on('open', () => { this.state = 'online'; this.error = ''; this.changed(); });
    peer.on('connection', conn => this.accept(conn));
    peer.on('disconnected', () => {
      if (this.peer !== peer) return;
      this.state = 'starting';
      this.changed();
      setTimeout(() => { if (this.peer === peer && !peer.destroyed) peer.reconnect(); }, 1500);
    });
    peer.on('error', err => {
      if (this.peer !== peer) return;
      // codice ancora registrato dalla sessione precedente, rete assente, server irraggiungibile:
      // si riprova da capo fra qualche secondo
      const retry = ['unavailable-id', 'network', 'server-error', 'socket-error', 'socket-closed'].includes(err.type);
      this.fail(err.type === 'unavailable-id' ? 'codice ancora occupato, riprovo…'
        : err.type === 'network' || err.type === 'server-error' ? 'nessuna connessione a internet, riprovo…'
        : 'errore: ' + err.type);
      if (retry) this.restartSoon();
    });
  }

  fail(msg) {
    this.state = 'error';
    this.error = msg;
    this.changed();
  }

  restartSoon() {
    const old = this.peer;
    this.peer = null;
    try { old?.destroy(); } catch {}
    clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => this.start(), 4000);
  }

  // Al ritorno in primo piano iPadOS può aver chiuso la connessione al server.
  wake() {
    if (!this.enabled) return;
    if (!this.peer || this.peer.destroyed) this.start();
    else if (this.peer.disconnected) this.peer.reconnect();
  }

  stop() {
    clearTimeout(this.retryTimer);
    for (const c of this.clients) c.close();
    this.clients.clear();
    try { this.peer?.destroy(); } catch {}
    this.peer = null;
    this.state = 'off';
    this.changed();
  }

  accept(conn) {
    let tries = 0;
    conn.on('data', msg => {
      if (!conn.ok) {
        if (msg?.t === 'hello' && String(msg.pin) === this.pin) {
          conn.ok = true;
          conn.role = msg.role === 'display' ? 'display' : 'remote';
          this.clients.add(conn);
          conn.send({ t: 'welcome' });
          this.changed();
          this.onHello?.(conn);
        } else if (++tries >= 1) {
          conn.send({ t: 'denied' });
          setTimeout(() => conn.close(), 400);
        }
        return;
      }
      this.onMessage?.(msg, conn);
    });
    const gone = () => { if (this.clients.delete(conn)) this.changed(); };
    conn.on('close', gone);
    conn.on('error', gone);
  }

  send(msg, role) {
    for (const c of this.clients) {
      if ((!role || c.role === role) && c.open) { try { c.send(msg); } catch {} }
    }
  }

  has(role) {
    for (const c of this.clients) if (c.role === role) return true;
    return false;
  }

  joinUrl() {
    const u = new URL(location.href);
    u.search = '';
    u.hash = 'collega=' + this.code;
    return u.href;
  }
}

// ---------- iPhone (telecomando) e secondo schermo ----------

export class LinkClient {
  constructor({ code, pin, role, onMessage, onState }) {
    Object.assign(this, { code, pin, role, onMessage, onState });
    this.stopped = false;
    this.state = 'connecting'; // connecting | connected | denied | error
  }

  set(state, msg = '') {
    this.state = state;
    this.onState?.(state, msg);
  }

  async start() {
    let Peer;
    try { Peer = await loadPeerJS(); }
    catch (err) { this.set('error', err.message + ' (sei offline?)'); this.retry(); return; }
    if (this.stopped) return;
    this.set('connecting', 'collegamento in corso…');
    const peer = this.peer = new Peer(PREFIX + 'c-' + uid().replace(/-/g, '').slice(0, 12), { debug: 0 });
    peer.on('open', () => this.connect());
    peer.on('disconnected', () => { if (!this.stopped && !peer.destroyed) setTimeout(() => peer.reconnect(), 1500); });
    peer.on('error', err => {
      if (this.stopped) return;
      if (err.type === 'peer-unavailable') {
        this.set('error', 'iPad non trovato: il prompter è aperto e il collegamento è attivo? Codice giusto?');
        this.retry(4000);
      } else if (['network', 'server-error', 'socket-error', 'socket-closed', 'unavailable-id'].includes(err.type)) {
        this.set('error', 'nessuna connessione a internet, riprovo…');
        this.restart();
      } else {
        this.set('error', 'errore: ' + err.type);
        this.retry(4000);
      }
    });
  }

  connect() {
    if (this.stopped || !this.peer || this.peer.destroyed) return;
    if (this.peer.disconnected) { this.peer.reconnect(); return; }
    try { this.conn?.close(); } catch {}
    const conn = this.conn = this.peer.connect(PREFIX + this.code, { reliable: true, serialization: 'json' });
    conn.on('open', () => conn.send({ t: 'hello', pin: this.pin, role: this.role }));
    conn.on('data', msg => {
      if (conn !== this.conn) return;
      if (msg?.t === 'welcome') this.set('connected');
      else if (msg?.t === 'denied') { this.set('denied', 'PIN errato'); this.stop(); }
      else this.onMessage?.(msg);
    });
    conn.on('close', () => {
      if (conn !== this.conn || this.stopped) return;
      this.set('connecting', 'collegamento perso, riprovo…');
      this.retry();
    });
  }

  retry(ms = 2500) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      if (this.stopped) return;
      if (!this.peer || this.peer.destroyed) this.start(); else this.connect();
    }, ms);
  }

  restart() {
    try { this.peer?.destroy(); } catch {}
    this.peer = null;
    this.retry(4000);
  }

  wake() {
    if (this.stopped) return;
    if (this.state !== 'connected' || !this.conn?.open) this.retry(100);
  }

  send(msg) {
    if (this.conn?.open && this.state === 'connected') { try { this.conn.send(msg); return true; } catch {} }
    return false;
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.timer);
    try { this.conn?.close(); } catch {}
    try { this.peer?.destroy(); } catch {}
    this.peer = null;
  }
}
