import { Library } from './library.js';
import { Editor } from './editor.js';
import { Prompter } from './prompter.js';
import { RemoteView } from './remote.js';
import { LinkHost, LinkClient, clientCreds, saveClientCreds } from './link.js';
import { db } from './db.js';
import { settings, DEFAULTS } from './settings.js';
import { h, toast } from './util.js';

const views = {
  library: document.getElementById('view-library'),
  editor: document.getElementById('view-editor'),
  prompter: document.getElementById('view-prompter'),
  remote: document.getElementById('view-remote'),
};
let current = 'library';
let reloadPending = false;
const RESUME_KEY = 'tp.resume';
let swReg = null;
function checkForUpdate() { swReg?.update().catch(() => {}); }

function show(name) {
  for (const [k, el] of Object.entries(views)) el.hidden = k !== name;
  current = name;
}

function backToLibrary() {
  show('library');
  if (reloadPending) { location.reload(); return; }
  library.refresh();
}

async function openPrompter(script) {
  if (current === 'editor') await editor.flush();
  show('prompter');
  prompter.open(script);
  if (host.clients.size) sendScript();
}

const prompter = new Prompter({
  onClose: () => {
    if (clientRole === 'display') stopClient();
    backToLibrary();
  },
});
const editor = new Editor({ onBack: backToLibrary, onRead: openPrompter });
const library = new Library({
  onEdit: (s, opts) => { show('editor'); editor.open(s, opts); },
  onRead: openPrompter,
  onChange: scripts => host.send({ t: 'library', items: libraryItems(scripts) }, 'remote'),
});

// =====================================================================
// iPad prompter: accetta telecomandi e secondi schermi
// =====================================================================

const hostUIs = new Set();

const host = new LinkHost({
  onHello: (conn, isNew) => {
    if (conn.role === 'remote') conn.send({ t: 'library', items: libraryItems(library.scripts) });
    // impostazioni a tutti: anche il telefono mostra il testo esattamente come il prompter
    conn.send({ t: 'settings', s: settings.get() });
    // il testo va anche al telecomando, che lo mostra in anteprima mentre scorre
    if (prompter.isOpen && !prompter.follower) sendScript(conn);
    conn.send({ t: 'status', ...prompter.status() });
    if (isNew) toast(conn.role === 'display' ? 'Secondo schermo collegato' : 'Telecomando collegato');
  },
  onMessage: msg => handleRemoteCommand(msg),
  onChange: () => { hostUIs.forEach(f => f()); updateTicker(); },
});

function libraryItems(scripts) {
  return scripts.map(s => ({ id: s.id, title: s.title }));
}

function sendScript(conn) {
  const s = prompter.script;
  const msg = { t: 'script', id: s.id, title: s.title, text: s.text };
  conn ? conn.send(msg) : host.send(msg);
}

async function handleRemoteCommand(msg) {
  if (msg?.t !== 'cmd' || clientRole) return;
  if (msg.c === 'open') {
    if (typeof msg.arg !== 'string') return;
    const s = await db.get(msg.arg);
    if (!s) return;
    if (prompter.isOpen) prompter.close();
    openPrompter(s);
    return;
  }
  // impostazioni del prompter cambiate dal telefono: solo chiavi note e del tipo giusto
  if (msg.c === 'settings' && msg.arg && typeof msg.arg === 'object') {
    const patch = {};
    for (const [k, v] of Object.entries(msg.arg)) {
      if (k in DEFAULTS && typeof v === typeof DEFAULTS[k] && (typeof v !== 'number' || Number.isFinite(v))) patch[k] = v;
    }
    if (Object.keys(patch).length) settings.set(patch);
    return;
  }
  if (msg.c === 'resetSettings') { settings.reset(); toast('Impostazioni ripristinate dal telefono'); return; }
  if (!prompter.isOpen || prompter.follower) return;
  if (msg.c === 'duration') { prompter.setScriptDuration(typeof msg.arg === 'number' ? msg.arg : null); return; }
  if (msg.c === 'close') { prompter.close(); return; }
  prompter.command(msg.c, typeof msg.arg === 'number' ? msg.arg : undefined);
  host.send({ t: 'status', ...prompter.status() }); // conferma immediata al telefono
}

// Stato verso i collegati: 10 volte al secondo se c'è un secondo schermo, altrimenti 5 (il telefono
// mostra il testo che scorre). Tra un aggiornamento e l'altro proseguono da soli con la velocità ricevuta.
let ticker = 0, tick = 0;
function updateTicker() {
  const need = host.clients.size > 0;
  if (need && !ticker) {
    ticker = setInterval(() => {
      if (host.has('display') || tick % 2 === 0) host.send({ t: 'status', ...prompter.status() });
      // ogni 2 s anche le impostazioni: chi ha perso un messaggio si rimette in pari da solo
      if (tick % 20 === 0) host.send({ t: 'settings', s: settings.get() });
      tick++;
    }, 100);
  } else if (!need && ticker) {
    clearInterval(ticker);
    ticker = 0;
  }
}

let settingsTimer;
settings.subscribe(() => {
  if (!host.clients.size) return;
  clearTimeout(settingsTimer);
  settingsTimer = setTimeout(() => host.send({ t: 'settings', s: settings.get() }), 80);
});

// Riquadro del collegamento (nel pannello impostazioni e nella finestra Collegamento).
function hostBox(root) {
  root.classList.add('host-box');
  const row = h('label', 'host-toggle');
  const tog = h('input', 'switch');
  tog.type = 'checkbox';
  row.append(h('span', null, 'Attiva telecomando e secondo schermo'), tog);
  const state = h('div', 'host-state');
  const creds = h('div', 'host-creds');
  const code = h('strong'), pin = h('strong');
  const c1 = h('div'), c2 = h('div');
  c1.append(h('span', 'muted', 'Codice'), code);
  c2.append(h('span', 'muted', 'PIN'), pin);
  creds.append(c1, c2);
  const acts = h('div', 'host-acts');
  const newPin = h('button', 'btn small', 'Nuovo PIN');
  const share = h('button', 'btn small', 'Invia link all\'iPhone');
  newPin.type = share.type = 'button';
  acts.append(share, newPin);
  const note = h('p', 'muted small', 'Funziona con iPhone e Android, anche su reti diverse (per esempio iPad in Wi-Fi e telefono in 4G): serve solo internet. Sul telefono apri il link, oppure apri il sito, tocca «Collegamento» e scrivi codice e PIN. Tieni aperta questa app sull\'iPad.');
  root.append(row, state, creds, acts, note);

  tog.addEventListener('change', () => host.setEnabled(tog.checked));
  newPin.addEventListener('click', () => { host.newPin(); toast('Nuovo PIN: chi era collegato deve ricollegarsi'); });
  share.addEventListener('click', async () => {
    const url = host.joinUrl();
    try {
      if (navigator.share) await navigator.share({ title: 'Telecomando prompter', text: `PIN ${host.pin}`, url });
      else { await navigator.clipboard.writeText(url); toast('Link copiato'); }
    } catch { /* condivisione annullata */ }
  });

  const update = () => {
    tog.checked = host.enabled;
    creds.hidden = acts.hidden = note.hidden = !host.enabled;
    code.textContent = host.code.replace(/(\d{3})(\d{3})/, '$1 $2');
    pin.textContent = host.pin;
    const { remote, display } = host.counts();
    const who = [remote && `${remote} telecomand${remote === 1 ? 'o' : 'i'}`, display && `${display} scherm${display === 1 ? 'o' : 'i'}`]
      .filter(Boolean).join(', ');
    const old = host.outdated();
    state.textContent = !host.enabled ? '' : host.state === 'online' ? 'Pronto' + (who ? ' · collegati: ' + who : ' · nessuno collegato')
      + (old ? ` · ${old === 1 ? 'un dispositivo ha' : old + ' dispositivi hanno'} una versione diversa: chiudi e riapri l'app su ${old === 1 ? 'quel dispositivo' : 'quei dispositivi'}` : '')
      : host.state === 'starting' ? 'Avvio…' : host.error;
    state.dataset.state = host.state;
  };
  hostUIs.add(update);
  update();
  return update;
}

prompter.addPanelSection({
  title: 'Telecomando e secondo schermo',
  items: [{ type: 'custom', label: '', render: row => { const box = h('div'); row.append(box); const up = hostBox(box); return () => up(); } }],
});

// indicatore nella barra dei comandi e sul pulsante della libreria
hostUIs.add(() => {
  const { remote, display } = host.counts();
  const n = remote + display;
  const op = document.getElementById('op-link');
  op.hidden = !n;
  op.textContent = n ? `● ${n} collegat${n === 1 ? 'o' : 'i'}` : '';
  document.getElementById('lib-link').classList.toggle('linked', host.enabled && host.state === 'online');
});
hostBox(document.getElementById('host-box-lib'));

// =====================================================================
// iPhone telecomando / secondo schermo
// =====================================================================

let client = null;
let clientRole = null;
const remoteView = new RemoteView({ onExit: () => { stopClient(); backToLibrary(); } });

const follow = { script: null, settings: null, status: null };

function openFollower(script) {
  follow.script = script;
  show('prompter');
  prompter.open(script || { id: '', title: '', text: '' }, {
    follow: {
      settings: follow.settings, status: follow.status, hostW: follow.status?.stageW || 0, at: performance.now(),
    },
  });
  views.prompter.classList.toggle('waiting', !script);
}

function displayMessage(m) {
  if (m.t === 'script') openFollower({ id: m.id, title: m.title, text: m.text, duration: null });
  else if (m.t === 'settings') { follow.settings = m.s; prompter.updateFollow({ settings: m.s }); }
  else if (m.t === 'status') {
    follow.status = m;
    if (!m.open && follow.script) openFollower(null);
    else prompter.updateFollow({ status: m });
  }
}

function setWaitMessage(state, msg) {
  document.getElementById('follow-wait-msg').textContent =
    (state === 'connected' ? 'Collegato. Apri uno script sull\'iPad.' : msg) + (versionNote ? ' ' + versionNote : '');
}

function startClient(role, creds) {
  const code = (creds?.code ?? document.getElementById('cl-code').value).replace(/\D/g, '');
  const pin = (creds?.pin ?? document.getElementById('cl-pin').value).replace(/\D/g, '');
  if (code.length !== 6 || pin.length !== 4) { toast('Servono il codice di 6 cifre e il PIN di 4'); return; }
  saveClientCreds({ code, pin });
  linkDialog.close();
  stopClient();
  clientRole = role;
  client = new LinkClient({
    code, pin, role,
    onMessage: m => (role === 'remote' ? remoteView.onMessage(m) : displayMessage(m)),
    onState: (st, msg) => {
      if (role === 'remote') remoteView.setState(st, msg);
      else setWaitMessage(st, msg);
    },
    onVersion: hostV => versionWarning(hostV),
  });
  if (role === 'remote') { show('remote'); remoteView.open(client); }
  else { follow.settings = follow.status = null; openFollower(null); }
  client.start();
}

// iPad e questo dispositivo con versioni diverse: si dice quale aggiornare invece di fallire in silenzio.
let versionNote = '';
function versionWarning(hostV) {
  const mine = self.APP_VERSION;
  if (hostV === mine) { versionNote = ''; return; }
  const ipadOlder = !hostV || hostV.localeCompare(mine, undefined, { numeric: true }) < 0;
  versionNote = `Versioni diverse: iPad ${hostV || 'vecchia'}, questo dispositivo ${mine}. `
    + (ipadOlder ? 'Aggiorna l\'iPad: chiudi lo script e torna alla libreria, oppure chiudi e riapri l\'app.'
      : 'Questo dispositivo si sta aggiornando…');
  toast(versionNote, 7000);
  if (role() === 'remote') remoteView.flash(versionNote, 7000);
  checkForUpdate();
}
const role = () => clientRole;

function stopClient() {
  client?.stop();
  client = null;
  if (clientRole === 'remote') remoteView.close();
  clientRole = null;
  views.prompter.classList.remove('waiting');
}

// =====================================================================
// Finestra Collegamento
// =====================================================================

const linkDialog = document.getElementById('link-dialog');
function openLinkDialog(code) {
  const saved = clientCreds();
  document.getElementById('cl-code').value = code || saved.code || '';
  document.getElementById('cl-pin').value = code && code !== saved.code ? '' : saved.pin || '';
  linkDialog.showModal();
}
document.getElementById('lib-link').addEventListener('click', () => openLinkDialog());
document.getElementById('link-close').addEventListener('click', () => linkDialog.close());
document.getElementById('cl-remote').addEventListener('click', () => startClient('remote'));
document.getElementById('cl-display').addEventListener('click', () => startClient('display'));

// link inviato dall'iPad: …/#collega=123456 (anche se la pagina era già aperta)
function checkJoinLink() {
  const join = location.hash.match(/collega=(\d{6})/);
  if (!join) return;
  history.replaceState(null, '', location.pathname + location.search);
  if (!linkDialog.open) openLinkDialog(join[1]);
}
checkJoinLink();
addEventListener('hashchange', checkJoinLink);

// I server pubblici non garantiscono la consegna: se manca qualcosa che si riceve una volta sola
// (impostazioni, testo dello script), lo si richiede all'iPad salutandolo di nuovo.
setInterval(() => {
  if (!client || client.state !== 'connected') return;
  const missing = clientRole === 'remote'
    ? !remoteView.hostSettings || (remoteView.status.open && remoteView.script?.id !== remoteView.status.scriptId)
    : !follow.settings || (follow.status?.open && follow.script?.id !== follow.status.scriptId);
  if (missing) client.hello();
}, 2000);

// pagina chiusa o ricaricata: l'iPad toglie subito questo dispositivo dai collegati
addEventListener('pagehide', () => client?.stop());

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  host.wake();
  client?.wake();
  checkForUpdate();
});

// =====================================================================

library.refresh();
host.start();
// dopo un aggiornamento il telefono o il secondo schermo riprendono da soli il collegamento
const resumeRole = sessionStorage.getItem(RESUME_KEY);
if (resumeRole) {
  sessionStorage.removeItem(RESUME_KEY);
  const c = clientCreds();
  if (c.code && c.pin) startClient(resumeRole, c);
}
document.getElementById('app-version').textContent = 'Versione ' + (self.APP_VERSION || '');

// Chiede al browser di non cancellare i dati salvati.
navigator.storage?.persist?.().catch(() => {});

// Niente zoom con due dita su iPad.
document.addEventListener('gesturestart', e => e.preventDefault());

// Funzionamento offline e aggiornamenti. Si cercano versioni nuove all'avvio, ogni volta che l'app torna
// in primo piano e ogni 15 minuti. Telefono e secondo schermo si aggiornano subito e si ricollegano;
// l'iPad aspetta che si chiuda lo script, per non ricaricare durante la lettura.
function applyUpdate() {
  if (clientRole) { try { sessionStorage.setItem(RESUME_KEY, clientRole); } catch {} }
  location.reload();
}

if ('serviceWorker' in navigator && (location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname))) {
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('sw.js').then(r => { swReg = r; }).catch(err => console.warn('Service worker:', err));
  setInterval(checkForUpdate, 15 * 60 * 1000);
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) return;
    if (clientRole || current === 'library') applyUpdate();
    else {
      reloadPending = true;
      toast('Nuova versione pronta: si applica quando torni alla libreria', 5000);
    }
  });
}
