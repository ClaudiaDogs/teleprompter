// Impostazioni del prompter, salvate in localStorage.

export const FONTS = [
  ['system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif', 'San Francisco (sistema)'],
  ['"Helvetica Neue", Helvetica, Arial, sans-serif', 'Helvetica'],
  ['Arial, Helvetica, sans-serif', 'Arial'],
  ['Verdana, Geneva, sans-serif', 'Verdana'],
  ['"Avenir Next", Avenir, sans-serif', 'Avenir'],
  ['Georgia, serif', 'Georgia'],
  ['"Times New Roman", Times, serif', 'Times'],
  ['Menlo, "Courier New", monospace', 'Menlo (monospazio)'],
];

export const DEFAULTS = Object.freeze({
  // testo
  fontSize: 64, fontFamily: FONTS[0][0], bold: false, lineHeight: 1.35,
  textColor: '#ffffff', align: 'left',
  // specchio
  flipH: false, flipV: false,
  // margini in % dello schermo
  marginLeft: 8, marginRight: 8, marginTop: 0, marginBottom: 0,
  // scorrimento: 'speed' (righe al minuto), 'duration' (durata dello script) o 'voice' (segue chi parla)
  scrollMode: 'speed', speed: 20, jumpLines: 3, voiceLang: 'it-IT',
  // linea guida (posizione in % dell'area del testo)
  guideVisible: true, guideStyle: 'arrows', guidePos: 33, guideOpacity: 0.8, guideColor: '#ff3b30',
  // conto alla rovescia
  countdown: 3, countdownOnResume: false,
  // timer (posizione in % dello schermo, come la vede chi legge)
  timerVisible: true, timerMode: 'elapsed', timerSize: 40, timerOpacity: 0.6, timerX: 88, timerY: 6,
  // pannello impostazioni
  panelSide: 'right',
});

const KEY = 'tp.settings.v1';

// Al primo avvio il carattere si adatta allo schermo: 64 px su iPad, più piccolo sul telefono.
function firstDefaults() {
  const side = Math.min(screen.width || innerWidth, screen.height || innerHeight);
  return { ...DEFAULTS, fontSize: Math.round(Math.min(DEFAULTS.fontSize, Math.max(32, side / 12))) };
}

function load() {
  try {
    const saved = localStorage.getItem(KEY);
    return saved ? { ...DEFAULTS, ...JSON.parse(saved) } : firstDefaults();
  } catch { return { ...DEFAULTS }; }
}

let state = load();
const subs = new Set();
let saveTimer;

function writeNow() {
  clearTimeout(saveTimer);
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {}
}
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(writeNow, 300);
}
addEventListener('pagehide', writeNow);

export const settings = {
  get: () => state,
  set(patch) {
    state = { ...state, ...patch };
    persist();
    subs.forEach(f => f(patch));
  },
  reset() {
    state = firstDefaults();
    persist();
    subs.forEach(f => f(state));
  },
  subscribe(f) { subs.add(f); return () => subs.delete(f); },
};
