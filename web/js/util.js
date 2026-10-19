export const WPM = 150; // parole al minuto per la stima della durata

export function h(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export function uid() {
  if (self.crypto?.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

export function countWords(text) {
  const m = text.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu);
  return m ? m.length : 0;
}

// Durata stimata in secondi, arrotondata a 5 s.
export function estimateSeconds(text) {
  const w = countWords(text);
  if (!w) return 0;
  return Math.max(5, Math.round((w / WPM) * 60 / 5) * 5);
}

export function fmtTime(sec, round = Math.floor) {
  const neg = sec < 0;
  const t = round(Math.abs(sec) + 1e-6);
  const hh = Math.floor(t / 3600), mm = Math.floor((t % 3600) / 60), ss = t % 60;
  const p = n => String(n).padStart(2, '0');
  return (neg ? '−' : '') + (hh ? hh + ':' + p(mm) : p(mm)) + ':' + p(ss);
}

// Minuscole senza accenti, per la ricerca.
export function normalize(s) {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

// Pulizia del testo importato o incollato.
export function tidy(text) {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[   ]/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function titleFrom(text, fallback = 'Senza titolo') {
  const line = text.split('\n').map(l => l.trim()).find(Boolean) || fallback;
  return line.length > 60 ? line.slice(0, 57).trimEnd() + '…' : line;
}

let toastTimer;
export function toast(msg, ms = 1600) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}
