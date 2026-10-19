// Importazione di file di testo: .txt, .md, .rtf, .html. (Il PDF arriva nel passo successivo.)
import { tidy } from './util.js';

export async function importFile(file) {
  const ext = (file.name.match(/\.([^.]+)$/)?.[1] || '').toLowerCase();
  const title = file.name.replace(/\.[^.]+$/, '') || 'Importato';
  if (ext === 'pdf' || file.type === 'application/pdf') throw new Error('i PDF arrivano nel prossimo aggiornamento');
  if (ext === 'docx' || ext === 'doc' || ext === 'pages') throw new Error('formato non supportato: salvalo come .rtf o .txt');

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
