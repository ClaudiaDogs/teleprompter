// Collegamento fra iPad (prompter) e telefoni o secondi schermi, Android e iPhone.
//
// I messaggi passano da broker MQTT pubblici e gratuiti su WebSocket sicuro (wss): funziona con
// qualunque rete che porti a internet, anche con iPad in Wi-Fi e telefono in 4G, e con le reti
// che isolano i dispositivi fra loro. Ogni messaggio è cifrato (AES-GCM) con una chiave ricavata
// da codice e PIN: senza PIN non si legge e non si comanda niente.
// L'iPad resta collegato a tutti i broker insieme; il telefono usa il primo che risponde.
//
// Messaggi (dentro la cifratura)
//   telefono → iPad: {t:'hello'|'ping'|'bye', from, role} · {t:'cmd', from, c, arg}
//   iPad → telefono: {t:'welcome', to} · {t:'status'|'library'|'script'|'settings', to?, for?}
import { MqttWs } from './mqtt.js';

const BROKERS = [
  'wss://broker.emqx.io:8084/mqtt',
  'wss://test.mosquitto.org:8081/mqtt',
  'wss://broker.hivemq.com:8884/mqtt',
];
const TOPIC = code => `slimdogs-teleprompter/v1/${code}`;
const HOST_KEY = 'tp.linkHost';
const CLIENT_KEY = 'tp.linkClient';
const CLIENT_TIMEOUT = 15000; // un telefono che non si fa sentire per 15 s è considerato uscito

const digits = n => Array.from(crypto.getRandomValues(new Uint32Array(n)), v => v % 10).join('');
const randomId = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), b => b.toString(16).padStart(2, '0')).join('');

function readJSON(key) { try { return JSON.parse(localStorage.getItem(key) || '{}'); } catch { return {}; } }
function writeJSON(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch {} }

export function clientCreds() { return readJSON(CLIENT_KEY); }
export function saveClientCreds(c) { writeJSON(CLIENT_KEY, c); }

// ---------- cifratura ----------

const te = new TextEncoder(), td = new TextDecoder();

async function deriveKey(code, pin) {
  if (!crypto.subtle) throw new Error('serve una pagina https');
  const base = await crypto.subtle.importKey('raw', te.encode(`${code}:${pin}`), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: te.encode('slimdogs-teleprompter-v1'), iterations: 100000, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

async function seal(key, obj) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, te.encode(JSON.stringify(obj))));
  const out = new Uint8Array(12 + ct.length);
  out.set(iv);
  out.set(ct, 12);
  return out;
}

async function unseal(key, bytes) {
  if (bytes.length < 29) return null;
  try {
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.subarray(0, 12) }, key, bytes.subarray(12));
    return JSON.parse(td.decode(pt));
  } catch { return null; } // PIN diverso o messaggio altrui
}

// ---------- iPad (prompter) ----------

export class LinkHost {
  constructor({ onHello, onMessage, onChange }) {
    this.onHello = onHello;
    this.onMessage = onMessage;
    this.onChange = onChange;
    this.clients = new Map(); // id → {id, role, seen, send}
    this.state = 'off'; // off | starting | online | error
    this.error = '';
    this.brokers = [];
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

  async newPin() {
    this.pin = digits(4);
    this.save();
    this.clients.clear();
    if (this.enabled) { this.stop(); await this.start(); }
    this.changed();
  }

  changed() { this.onChange?.(this); }

  // dispositivi collegati con una versione diversa dell'app
  outdated() {
    let n = 0;
    for (const c of this.clients.values()) if (c.v !== self.APP_VERSION) n++;
    return n;
  }

  counts() {
    let remote = 0, display = 0;
    for (const c of this.clients.values()) c.role === 'display' ? display++ : remote++;
    return { remote, display };
  }

  has(role) {
    for (const c of this.clients.values()) if (c.role === role) return true;
    return false;
  }

  async start() {
    if (!this.enabled || this.brokers.length) return;
    this.state = 'starting';
    this.error = '';
    this.changed();
    try { this.key = await deriveKey(this.code, this.pin); }
    catch (err) { this.state = 'error'; this.error = err.message; this.changed(); return; }
    if (!this.enabled || this.brokers.length) return;
    const topic = TOPIC(this.code);
    this.topicIn = topic + '/c';
    this.topicOut = topic + '/h';
    this.brokers = BROKERS.map(url => {
      const b = new MqttWs(url, {
        onMessage: (_, bytes) => this.receive(bytes),
        onState: () => this.updateState(),
      });
      b.subscribe(this.topicIn);
      b.connect();
      return b;
    });
    clearTimeout(this.offlineTimer);
    this.offlineTimer = setTimeout(() => this.updateState(true), 10000);
    clearInterval(this.pruneTimer);
    this.pruneTimer = setInterval(() => this.prune(), 5000);
  }

  updateState(timeout = false) {
    if (!this.enabled) return;
    const up = this.brokers.filter(b => b.up).length;
    if (up) { this.state = 'online'; this.error = ''; }
    else if (timeout || this.state === 'online') {
      this.state = 'error';
      this.error = 'nessuna connessione a internet, riprovo…';
    }
    this.changed();
  }

  wake() {
    if (!this.enabled) return;
    if (!this.brokers.length) { this.start(); return; }
    for (const b of this.brokers) if (!b.up && !b.ws) b.connect();
  }

  stop() {
    clearTimeout(this.offlineTimer);
    clearInterval(this.pruneTimer);
    for (const b of this.brokers) b.close();
    this.brokers = [];
    this.clients.clear();
    this.state = 'off';
    this.changed();
  }

  prune() {
    const now = Date.now();
    let gone = false;
    for (const [id, c] of this.clients) if (now - c.seen > CLIENT_TIMEOUT) { this.clients.delete(id); gone = true; }
    if (gone) this.changed();
  }

  async receive(bytes) {
    const msg = await unseal(this.key, bytes);
    if (!msg || typeof msg.from !== 'string') return;
    const id = msg.from;
    if (msg.t === 'bye') { if (this.clients.delete(id)) this.changed(); return; }
    let conn = this.clients.get(id);
    if (msg.t === 'hello' || (!conn && msg.t === 'ping')) {
      const isNew = !conn;
      conn = conn || { id, send: m => this.send({ ...m, to: id }) };
      conn.role = msg.role === 'display' ? 'display' : 'remote';
      conn.v = typeof msg.v === 'string' ? msg.v : '';
      conn.seen = Date.now();
      this.clients.set(id, conn);
      this.send({ t: 'welcome', to: id, v: self.APP_VERSION });
      if (isNew) this.changed();
      this.onHello?.(conn, isNew);
      return;
    }
    if (!conn) return;
    conn.seen = Date.now();
    if (msg.t === 'cmd') this.onMessage?.(msg, conn);
  }

  // role: solo i dispositivi con quel ruolo lo usano; senza ruolo va a tutti
  async send(msg, role) {
    if (!this.key || !this.brokers.some(b => b.up)) return;
    const bytes = await seal(this.key, role ? { ...msg, for: role } : msg);
    for (const b of this.brokers) b.publish(this.topicOut, bytes);
  }

  joinUrl() {
    const u = new URL(location.href);
    u.search = '';
    u.hash = 'collega=' + this.code;
    return u.href;
  }
}

// ---------- telefono (telecomando) e secondo schermo ----------

export class LinkClient {
  constructor({ code, pin, role, onMessage, onState, onVersion }) {
    Object.assign(this, { code, pin, role, onMessage, onState, onVersion });
    this.id = randomId();
    this.stopped = false;
    this.state = 'connecting'; // connecting | connected | error
    this.brokerIndex = 0;
  }

  set(state, msg = '') {
    if (state === this.state && msg === this.msg) return;
    this.state = state;
    this.msg = msg;
    this.onState?.(state, msg);
  }

  async start() {
    this.set('connecting', 'collegamento in corso…');
    try { this.key = await deriveKey(this.code, this.pin); }
    catch (err) { this.set('error', err.message); return; }
    this.byeBytes = await seal(this.key, { t: 'bye', from: this.id });
    if (this.stopped) return;
    this.topicIn = TOPIC(this.code) + '/h';
    this.topicOut = TOPIC(this.code) + '/c';
    this.useBroker(0);
    clearInterval(this.beat);
    this.beat = setInterval(() => this.heartbeat(), 2500);
  }

  // un broker alla volta; se non risponde si passa al successivo
  useBroker(i) {
    this.broker?.close();
    this.brokerIndex = i % BROKERS.length;
    this.brokerSince = Date.now();
    const b = this.broker = new MqttWs(BROKERS[this.brokerIndex], {
      onMessage: (_, bytes) => this.receive(bytes),
      onState: () => { if (b === this.broker && b.up) this.hello(); },
    });
    b.subscribe(this.topicIn);
    b.connect();
  }

  heartbeat() {
    if (this.stopped) return;
    const now = Date.now();
    const b = this.broker;
    if (!b.up) {
      this.set('error', navigator.onLine === false ? 'il telefono non è connesso a internet' : 'collegamento al server in corso…');
      if (now - this.brokerSince > 7000) this.useBroker(this.brokerIndex + 1);
      return;
    }
    const silent = now - (this.lastHeard || 0);
    if (this.state === 'connected' && silent < 8000) { this.post({ t: 'ping', role: this.role }); return; }
    // nessuna risposta: si ripete il saluto e si spiega perché può non rispondere
    this.hello();
    if (now - this.brokerSince > 9000) {
      this.set('error', 'l\'iPad non risponde: sull\'iPad il collegamento è attivo e la pagina del prompter è aperta? Codice e PIN sono giusti?');
    }
    if (silent > 20000 && now - this.brokerSince > 20000) this.useBroker(this.brokerIndex + 1); // magari l'iPad è su un altro server
  }

  hello() { this.post({ t: 'hello', role: this.role, v: self.APP_VERSION }); }

  async post(msg) {
    if (!this.key || !this.broker?.up) return false;
    return this.broker.publish(this.topicOut, await seal(this.key, { ...msg, from: this.id }));
  }

  async receive(bytes) {
    const msg = await unseal(this.key, bytes);
    if (!msg) return;
    if (msg.to && msg.to !== this.id) return;
    if (msg.for && msg.for !== this.role) return;
    this.lastHeard = Date.now();
    this.brokerSince = Date.now();
    if (msg.t === 'welcome') { this.set('connected'); this.onVersion?.(msg.v || ''); return; }
    if (this.state !== 'connected') this.set('connected');
    this.onMessage?.(msg);
  }

  wake() {
    if (this.stopped || !this.broker) return;
    if (!this.broker.up && !this.broker.ws) this.broker.connect();
    else this.hello();
  }

  send(msg) {
    if (this.state !== 'connected' || !this.broker?.up) return false;
    this.post(msg);
    return true;
  }

  stop() {
    if (this.stopped) return;
    this.stopped = true;
    clearInterval(this.beat);
    // saluto già cifrato: si spedisce subito, anche se la pagina si sta chiudendo
    if (this.byeBytes && this.broker?.up) this.broker.publish(this.topicOut, this.byeBytes);
    setTimeout(() => this.broker?.close(), 300);
  }
}
