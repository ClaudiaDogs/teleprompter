// Importazione di file: .txt, .md, .rtf, .html, .pdf.
import { tidy } from './util.js';

export const fileExt = name => (name.match(/\.([^.]+)$/)?.[1] || '').toLowerCase();

export async function importFile(file) {
  const ext = fileExt(file.name);
  const title = file.name.replace(/\.[^.]+$/, '') || 'Importato';
  if (ext === 'docx' || ext === 'doc' || ext === 'pages') throw new Error('formato non supportato: salvalo come PDF, .rtf o .txt');
  if (ext === 'pdf' || file.type === 'application/pdf') {
    return { title, text: tidy(await pdfToText(await file.arrayBuffer())) };
  }

  const raw = await readText(file);
  let text;
  if (ext === 'rtf' || raw.startsWith('{\\rtf')) text = rtfToText(raw);
  else if (ext === 'html' || ext === 'htm' || /html/.test(file.type)) text = htmlToText(raw);
  else if (ext === 'md' || ext === 'markdown') text = markdownToText(raw);
  else text = raw;
  return { title, text: tidy(text) };
}

// UTF-8 se valido, altrimenti Windows-1252 (i .txt salvati dal Blocco note vecchio).
async function readText(file) {
  const buf = await file.arrayBuffer();
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); }
  catch { return new TextDecoder('windows-1252').decode(buf); }
}

const BLOCK = /^(P|DIV|H[1-6]|LI|UL|OL|TR|TABLE|BLOCKQUOTE|PRE|SECTION|ARTICLE|HEADER|FOOTER|ASIDE|NAV|DD|DT|DL|FIGURE|FIGCAPTION|HR|MAIN|ADDRESS)$/;

export function htmlToText(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script,style,noscript,template,head').forEach(n => n.remove());
  let out = '';
  const walk = node => {
    for (const c of node.childNodes) {
      if (c.nodeType === 3) out += c.nodeValue.replace(/\s+/g, ' ');
      else if (c.nodeType === 1) {
        const tag = c.tagName;
        if (tag === 'BR') { out += '\n'; continue; }
        const block = BLOCK.test(tag);
        if (block) out += '\n';
        if (tag === 'LI') out += '• ';
        walk(c);
        if (block) out += '\n';
      }
    }
  };
  walk(doc.body || doc.documentElement);
  return out.split('\n').map(l => l.trim()).join('\n').replace(/\n{3,}/g, '\n\n');
}

export function markdownToText(md) {
  return md
    .replace(/```[^\n]*\n([\s\S]*?)```/g, '$1')
    .replace(/^\s*([-*_])(\s*\1){2,}\s*$/gm, '')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s{0,3}>\s?/gm, '')
    .replace(/^(\s*)[-*+]\s+/gm, '$1• ')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/(^|[^\w*])\*(\S(?:.*?\S)?)\*/g, '$1$2')
    .replace(/(^|\W)_(\S(?:.*?\S)?)_(?=\W|$)/g, '$1$2')
    .replace(/`([^`]+)`/g, '$1');
}

// Parti dell'RTF che non sono testo da leggere.
const SKIP_DEST = new Set(['fonttbl', 'colortbl', 'stylesheet', 'info', 'pict', 'object', 'header', 'headerl',
  'headerr', 'headerf', 'footer', 'footerl', 'footerr', 'footerf', 'footnote', 'themedata', 'colorschememapping',
  'datastore', 'latentstyles', 'listtable', 'listoverridetable', 'rsidtbl', 'generator', 'xmlnstbl', 'fldinst',
  'filetbl', 'revtbl', 'pgdsctbl', 'listtext', 'pntext', 'pntxta', 'pntxtb', 'bkmkstart', 'bkmkend', 'expandedcolortbl']);
const RTF_CHARS = { emdash: '—', endash: '–', lquote: '‘', rquote: '’', ldblquote: '“', rdblquote: '”',
  bullet: '•', emspace: ' ', enspace: ' ', qmspace: ' ', tab: '\t', cell: '\t', par: '\n', line: '\n',
  sect: '\n\n', page: '\n\n', row: '\n' };
const cp1252 = new TextDecoder('windows-1252');

export function rtfToText(rtf) {
  let out = '';
  let st = { skip: false, uc: 1 };
  const stack = [];
  let pendingSkip = 0; // caratteri da saltare dopo \uN
  const emit = s => { if (pendingSkip > 0) { pendingSkip--; return; } if (!st.skip) out += s; };
  let i = 0;
  const n = rtf.length;
  while (i < n) {
    const ch = rtf[i];
    if (ch === '{') { stack.push(st); st = { ...st }; i++; continue; }
    if (ch === '}') { st = stack.pop() || st; pendingSkip = 0; i++; continue; }
    if (ch === '\r' || ch === '\n') { i++; continue; }
    if (ch !== '\\') { emit(ch); i++; continue; }
    // sequenza di controllo
    const nx = rtf[i + 1];
    if (nx === undefined) break;
    if (/[a-zA-Z]/.test(nx)) {
      let j = i + 1;
      while (j < n && /[a-zA-Z]/.test(rtf[j])) j++;
      const word = rtf.slice(i + 1, j);
      let k = j;
      if (rtf[k] === '-' || /\d/.test(rtf[k] || '')) { k++; while (k < n && /\d/.test(rtf[k])) k++; }
      const param = k > j ? parseInt(rtf.slice(j, k), 10) : null;
      if (rtf[k] === ' ') k++;
      i = k;
      if (SKIP_DEST.has(word)) st.skip = true;
      else if (word === 'uc') st.uc = param ?? 1;
      else if (word === 'u') {
        if (!st.skip) out += String.fromCharCode(param < 0 ? param + 65536 : param);
        pendingSkip = st.uc;
      } else if (RTF_CHARS[word] !== undefined) {
        pendingSkip = 0;
        if (!st.skip) out += RTF_CHARS[word];
      }
      continue;
    }
    if (nx === '*') { st.skip = true; i += 2; continue; }
    if (nx === "'") {
      const byte = parseInt(rtf.substr(i + 2, 2), 16);
      i += 4;
      if (!Number.isNaN(byte)) emit(cp1252.decode(new Uint8Array([byte])));
      continue;
    }
    if (nx === '\n' || nx === '\r') { emit('\n'); i += 2; continue; }
    if (nx === '~') { emit(' '); i += 2; continue; }
    if (nx === '_') { emit('-'); i += 2; continue; }
    if (nx === '-') { i += 2; continue; }
    emit(nx); i += 2; // \\ \{ \}
  }
  return out;
}

// ---------- PDF (pdf.js in web/vendor/pdfjs, caricato solo quando serve) ----------

let pdfjsP;
function loadPdfjs() {
  return pdfjsP ??= import('../vendor/pdfjs/pdf.min.mjs').then(m => {
    m.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;
    return m;
  });
}

const SENTENCE_END = /[.!?:;…»"”)\]]$/;

// Estrae il testo e ricuce le righe spezzate dall'impaginazione in paragrafi.
export async function pdfToText(buf) {
  const pdfjs = await loadPdfjs();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), isEvalSupported: false }).promise;
  const pages = [];
  try {
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      pages.push(groupLines((await page.getTextContent()).items));
      page.cleanup();
    }
  } finally {
    doc.destroy();
  }
  // misure dell'impaginazione prese su tutto il documento (una pagina corta non basta)
  const stats = layoutStats(pages);
  const paras = [];
  for (const lines of pages) {
    const pagePars = linesToParagraphs(lines, stats);
    // un paragrafo che continua alla pagina successiva
    if (pagePars.length && paras.length && !SENTENCE_END.test(paras.at(-1)) && /^\p{Ll}/u.test(pagePars[0])) {
      paras[paras.length - 1] = joinLine(paras.at(-1), pagePars.shift());
    }
    paras.push(...pagePars);
  }
  const text = paras.join('\n\n');
  if (!text.trim()) throw new Error('il PDF non contiene testo selezionabile (forse è una scansione)');
  return text;
}

// Raggruppa i pezzi di testo in righe usando la posizione verticale.
function groupLines(items) {
  const lines = [];
  let cur = null;
  for (const it of items) {
    if (typeof it.str !== 'string') continue;
    const t = it.transform;
    const x = t[4], y = t[5];
    const hgt = it.height || Math.hypot(t[2], t[3]) || 10;
    if (it.str.trim() === '') {
      if (cur && it.str) cur.text += ' ';
      if (it.hasEOL) cur = null;
      continue;
    }
    if (cur && Math.abs(y - cur.y) <= Math.max(2, hgt * 0.4)) {
      const gap = x - cur.x1;
      if (gap > hgt * 0.15 && !/\s$/.test(cur.text) && !/^\s/.test(it.str)) cur.text += ' ';
      cur.text += it.str;
      cur.x1 = Math.max(cur.x1, x + (it.width || 0));
    } else {
      cur = { y, h: hgt, x0: x, x1: x + (it.width || 0), text: it.str };
      lines.push(cur);
    }
    if (it.hasEOL) cur = null;
  }
  return lines
    .map(l => ({ ...l, text: l.text.replace(/\s+/g, ' ').trim() }))
    .filter(l => l.text && !/^(pag(\.|ina)?\s*)?\d+(\s*(\/|di|of)\s*\d+)?$/i.test(l.text)); // numeri di pagina
}

// Margine sinistro e destro del testo e distanza normale fra le righe.
function layoutStats(pages) {
  const all = pages.flat();
  if (!all.length) return { minX0: 0, maxX1: 1, width: 1, normalGap: 0 };
  const x0s = all.map(l => l.x0).sort((a, b) => a - b);
  const x1s = all.map(l => l.x1).sort((a, b) => a - b);
  // percentili, così un titolo spostato o una riga anomala non falsano i margini
  const minX0 = x0s[Math.floor(x0s.length * 0.05)];
  const maxX1 = x1s[Math.min(x1s.length - 1, Math.floor(x1s.length * 0.9))];
  const gaps = [];
  for (const lines of pages) {
    for (let i = 1; i < lines.length; i++) {
      const g = lines[i - 1].y - lines[i].y;
      if (g > 0) gaps.push(g);
    }
  }
  gaps.sort((a, b) => a - b);
  return { minX0, maxX1, width: Math.max(1, maxX1 - minX0), normalGap: gaps.length ? gaps[Math.floor(gaps.length / 2)] : 0 };
}

function linesToParagraphs(lines, { minX0, maxX1, width, normalGap }) {
  if (!lines.length) return [];
  const paras = [];
  let cur = lines[0].text;
  for (let i = 1; i < lines.length; i++) {
    const prev = lines[i - 1], l = lines[i];
    const gap = prev.y - l.y;
    const newPara =
      gap <= 0 ||                                            // salto di colonna o testo fuori ordine
      (normalGap && gap > normalGap * 1.45) ||               // spazio in più fra i paragrafi
      (prev.x1 < maxX1 - width * 0.2 && SENTENCE_END.test(prev.text)) || // riga corta che chiude una frase
      (l.x0 > minX0 + l.h * 1.2 && l.x0 < minX0 + width * 0.3 && prev.x0 <= minX0 + l.h * 0.5) || // rientro
      /^[•\-–—*]\s/.test(l.text);                            // elenco puntato
    if (newPara) { paras.push(cur); cur = l.text; }
    else cur = joinLine(cur, l.text);
  }
  paras.push(cur);
  return paras;
}

// Unisce due righe dello stesso paragrafo, togliendo la sillabazione a fine riga.
function joinLine(a, b) {
  if (/\p{L}-$/u.test(a) && /^\p{Ll}/u.test(b)) return a.slice(0, -1) + b;
  return a + ' ' + b;
}
