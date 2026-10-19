// Scorrimento che segue la voce: riconoscimento vocale del browser (Web Speech API) e aggancio
// delle ultime parole sentite a una finestra di script poco più avanti. Avanza solo in avanti:
// se chi legge salta o improvvisa, il testo aspetta finché le parole tornano a coincidere.

const getSR = () => self.SpeechRecognition || self.webkitSpeechRecognition;

export const VOICE_LANGS = [
  ['it-IT', 'Italiano'], ['en-US', 'Inglese (USA)'], ['en-GB', 'Inglese (Regno Unito)'], ['fr-FR', 'Francese'],
  ['de-DE', 'Tedesco'], ['es-ES', 'Spagnolo'], ['pt-BR', 'Portoghese (Brasile)'], ['pt-PT', 'Portoghese'],
];

export const voiceSupported = () => !!getSR();

// Parole normalizzate: minuscole, senza accenti né punteggiatura; l'apostrofo separa («dell'acqua» → dell acqua).
export const WORD_RE = /[\p{L}\p{N}]+/gu;
export function norm(w) {
  return w.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}
export function spokenWords(text) {
  return (text.match(WORD_RE) || []).map(norm);
}

function editDistanceAtMost1(a, b) {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else { i++; j++; }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

// Due parole «uguali» per il riconoscimento: identiche, una che inizia l'altra (parola ancora
// in corso di riconoscimento) o con una sola lettera diversa.
export function same(a, b) {
  if (a === b) return true;
  if (a.length >= 4 && b.length >= 4 && (a.startsWith(b) || b.startsWith(a))) return true;
  return a.length >= 5 && b.length >= 5 && editDistanceAtMost1(a, b);
}

const weight = w => (w.length >= 3 ? 1 : 0.5); // articoli e preposizioni contano meno

// Quanto le parole sentite coincidono, in ordine, con lo script che finisce alla parola j.
function alignScore(spoken, words, j) {
  const from = Math.max(0, j - spoken.length - 3);
  const script = [];
  for (let k = from; k <= j; k++) script.push(words[k].n);
  const m = spoken.length, n = script.length;
  let prev = new Array(n + 1).fill(0);
  for (let a = 1; a <= m; a++) {
    const cur = new Array(n + 1).fill(0);
    for (let b = 1; b <= n; b++) {
      cur[b] = Math.max(prev[b], cur[b - 1],
        same(spoken[a - 1], script[b - 1]) ? prev[b - 1] + weight(script[b - 1]) : 0);
    }
    prev = cur;
  }
  return prev[n];
}

// Indice della parola dello script appena pronunciata, oppure -1 se non c'è un aggancio sicuro.
// `from` è l'ultima parola già agganciata; si cerca solo più avanti.
export function findMatch(words, spoken, from) {
  const sp = spoken.slice(-5);
  if (!sp.length) return -1;
  const last = sp[sp.length - 1];
  const search = (a, b, minScore) => {
    for (let j = Math.max(0, a); j <= b && j < words.length; j++) {
      if (same(words[j].n, last) && alignScore(sp, words, j) >= minScore) return j;
    }
    return -1;
  };
  // vicino: bastano due parole piene (le paroline da sole non spostano il testo);
  // lontano (salto di qualche riga): serve un aggancio più lungo
  let j = search(from + 1, from + 30, 2);
  if (j < 0 && sp.length >= 4) j = search(from + 31, from + 150, 3.5);
  return j;
}

// Riconoscimento continuo che si riavvia da solo (Safari e Chrome lo chiudono dopo un silenzio).
export class VoiceListener {
  constructor({ onWords, onState }) {
    this.onWords = onWords;
    this.onState = onState;
    this.active = false;
  }

  start(lang) {
    if (!getSR()) { this.onState('unsupported'); return; }
    this.lang = lang;
    if (this.active) return;
    this.active = true;
    this.launch();
  }

  launch() {
    if (!this.active) return;
    const SR = getSR();
    const rec = this.rec = new SR();
    rec.lang = this.lang;
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec.onstart = () => this.onState('listening');
    rec.onresult = e => {
      // ultime frasi riconosciute, comprese quelle ancora provvisorie
      let text = '';
      for (let i = Math.max(0, e.results.length - 3); i < e.results.length; i++) text += ' ' + e.results[i][0].transcript;
      const w = spokenWords(text);
      if (w.length) this.onWords(w.slice(-8));
    };
    rec.onerror = e => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        this.active = false;
        this.onState('denied');
      } else if (e.error === 'network') {
        this.onState('network');
      } else if (e.error === 'language-not-supported') {
        this.active = false;
        this.onState('language');
      }
      // no-speech, aborted, audio-capture: ci pensa il riavvio
    };
    rec.onend = () => {
      if (this.rec !== rec) return;
      if (this.active) {
        this.onState('restarting');
        clearTimeout(this.timer);
        this.timer = setTimeout(() => this.launch(), 250);
      } else {
        this.onState('off');
      }
    };
    try { rec.start(); } catch { this.timer = setTimeout(() => this.launch(), 500); }
  }

  stop() {
    this.active = false;
    clearTimeout(this.timer);
    const rec = this.rec;
    this.rec = null;
    try { rec?.abort(); } catch {}
    this.onState('off');
  }
}
