// Testo formattato degli script: grassetto, corsivo, sottolineato, barrato, evidenziato.
//
// Modello: un array di righe (come le righe del testo semplice); ogni riga è un array di pezzi
// { t: testo, b, i, u, s: vero/falso, hl: colore di evidenziazione '#rrggbb' oppure '' }.
// Nello script si salvano `text` (testo semplice: ricerca, conteggi, voce) e, se c'è almeno
// una formattazione, `html` nella forma canonica prodotta da toHTML().
// L'HTML non viene mai inserito così com'è: si rilegge sempre in righe e si ridisegna con il DOM.

const BLOCK = /^(P|DIV|H[1-6]|LI|UL|OL|TR|TABLE|BLOCKQUOTE|PRE|SECTION|ARTICLE|HEADER|FOOTER|ASIDE|NAV|DD|DT|DL|FIGURE|FIGCAPTION|HR|MAIN|ADDRESS)$/;
const SKIP = /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE|HEAD|TITLE|META|LINK|OBJECT|IFRAME|SVG|MATH|IMG|VIDEO|AUDIO|CANVAS)$/;
const PLAIN = { b: false, i: false, u: false, s: false, hl: '' };

// ---------- lettura ----------

// collapse: HTML che arriva da fuori (appunti, file .html): spazi e a capo del sorgente non contano.
export function fromHTML(html, { collapse = true } = {}) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return fromDOM(doc.body || doc.documentElement, { collapse });
}

export function fromDOM(root, { collapse = false } = {}) {
  const lines = [];
  let cur = [], touched = false;
  const push = () => { lines.push(cur); cur = []; touched = false; };
  const breakLine = () => { if (touched) push(); };

  const add = (t, f) => {
    if (!t) return;
    touched = true;
    const last = cur[cur.length - 1];
    if (last && sameFormat(last, f)) last.t += t;
    else cur.push({ t, b: f.b, i: f.i, u: f.u, s: f.s, hl: f.hl });
  };

  const walk = (node, f) => {
    for (const c of node.childNodes) {
      if (c.nodeType === 3) {
        let t = c.nodeValue;
        if (collapse) {
          t = t.replace(/[ \t\n\r\f]+/g, ' ');
          if (t === ' ' && !touched) continue; // spazi fra un blocco e l'altro nel sorgente
          add(t.replace(/ /g, ' '), f);
        } else {
          const parts = t.split('\n');
          parts.forEach((p, k) => { if (k) push(); add(p, f); });
        }
      } else if (c.nodeType === 1) {
        const tag = c.tagName.toUpperCase();
        if (SKIP.test(tag)) continue;
        if (tag === 'BR') { push(); continue; }
        const block = BLOCK.test(tag);
        if (block) breakLine();
        const g = formatOf(c, tag, f, collapse);
        if (tag === 'LI') add('• ', g);
        walk(c, g);
        if (block) breakLine();
      }
    }
  };
  walk(root, PLAIN);
  if (touched) push();
  return tidyLines(lines, collapse);
}

export function fromText(text) {
  return text.replace(/\r\n?/g, '\n').split('\n').map(l => (l ? [{ t: l, ...PLAIN }] : []));
}

// Righe dello script, dalla versione formattata se c'è.
export function scriptLines(script) {
  if (script.html) {
    try { return fromHTML(script.html, { collapse: false }); } catch { /* si ripiega sul testo */ }
  }
  return fromText(script.text || '');
}

// Formato di un elemento: prima il significato del tag, poi lo stile scritto sull'elemento
// (Google Documenti avvolge tutto in <b style="font-weight:normal">, Word usa spesso gli stili).
function formatOf(el, tag, f, collapse) {
  const g = { ...f };
  if (tag === 'B' || tag === 'STRONG' || (collapse && /^(H[1-6]|TH)$/.test(tag))) g.b = true;
  if (tag === 'I' || tag === 'EM') g.i = true;
  if (tag === 'U' || tag === 'INS') g.u = true;
  if (tag === 'S' || tag === 'STRIKE' || tag === 'DEL') g.s = true;
  if (tag === 'MARK') g.hl = highlight(el.style?.backgroundColor) || '#ffeb3b';

  const st = el.style;
  if (st) {
    const w = st.fontWeight;
    if (w) g.b = w === 'bold' || w === 'bolder' || (parseInt(w, 10) >= 600);
    const fs = st.fontStyle;
    if (fs) g.i = fs === 'italic' || fs === 'oblique';
    const dec = st.textDecorationLine || st.textDecoration || '';
    if (/underline/.test(dec)) g.u = true;
    if (/line-through/.test(dec)) g.s = true;
    const hl = highlight(st.backgroundColor); // gli sfondi neutri non cambiano niente
    if (hl) g.hl = hl;
  }
  return g;
}

function tidyLines(lines, collapse) {
  let out = lines.map(runs => {
    if (!collapse) return runs.filter(r => r.t);
    const rs = runs.map(r => ({ ...r }));
    if (rs.length) rs[0].t = rs[0].t.replace(/^\s+/, '');
    if (rs.length) rs[rs.length - 1].t = rs[rs.length - 1].t.replace(/\s+$/, '');
    return rs.filter(r => r.t);
  });
  if (collapse) {
    // come tidy(): niente righe vuote in cima e in fondo, al massimo una riga vuota di fila
    out = out.filter((l, k) => l.length || (k > 0 && out[k - 1].length));
    while (out.length && !out[0].length) out.shift();
    while (out.length && !out[out.length - 1].length) out.pop();
  } else {
    while (out.length > 1 && !out[out.length - 1].length) out.pop(); // righe vuote in fondo
  }
  return out;
}

const sameFormat = (a, b) => a.b === b.b && a.i === b.i && a.u === b.u && a.s === b.s && a.hl === b.hl;

// ---------- colori ----------

let ctx;
function toHex(color) {
  if (!color) return '';
  ctx ||= document.createElement('canvas').getContext('2d');
  ctx.fillStyle = '#010203';
  ctx.fillStyle = color;
  const v = ctx.fillStyle;
  if (v === '#010203') return '';
  if (v.startsWith('#')) return v.length === 7 ? v : '';
  const m = v.match(/rgba?\(([^)]+)\)/);
  if (!m) return '';
  const [r, g, b, a = 1] = m[1].split(',').map(Number);
  if (a < 0.3) return '';
  return '#' + [r, g, b].map(x => Math.round(x).toString(16).padStart(2, '0')).join('');
}

function rgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function luminance(hex) {
  const [r, g, b] = rgb(hex);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

// Uno sfondo conta come evidenziazione solo se non è bianco, grigio chiaro o quasi nero:
// sono gli sfondi della pagina, anche in modalità scura, non evidenziazioni.
function highlight(color) {
  const hex = toHex(color);
  if (!hex) return '';
  const [r, g, b] = rgb(hex);
  const l = luminance(hex);
  if (l < 0.12) return '';
  if (Math.max(r, g, b) - Math.min(r, g, b) < 24 && l > 0.8) return '';
  return hex;
}

// ---------- scrittura ----------

export function toText(lines) {
  return lines.map(runs => runs.map(r => r.t).join('')).join('\n');
}

export function hasFormat(lines) {
  return lines.some(runs => runs.some(r => r.b || r.i || r.u || r.s || r.hl));
}

const esc = t => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function toHTML(lines) {
  return lines.map(runs => '<p>' + (runs.length ? runs.map(runHTML).join('') : '<br>') + '</p>').join('');
}

function runHTML(r) {
  let s = esc(r.t);
  if (r.s) s = `<s>${s}</s>`;
  if (r.u) s = `<u>${s}</u>`;
  if (r.i) s = `<i>${s}</i>`;
  if (r.b) s = `<b>${s}</b>`;
  if (r.hl) s = `<mark style="background-color:${r.hl}">${s}</mark>`;
  return s;
}

// Disegna le righe come paragrafi <p>. editor: le righe vuote hanno un <br> (si possono scrivere);
// altrimenti uno spazio, come prima. Il testo evidenziato su sfondo chiaro diventa nero, come nel file.
export function renderLines(lines, { editor = false } = {}) {
  const frag = document.createDocumentFragment();
  for (const runs of lines) {
    const p = document.createElement('p');
    if (!runs.length) p.append(editor ? document.createElement('br') : ' ');
    for (const r of runs) p.append(runNode(r));
    frag.append(p);
  }
  return frag;
}

function runNode(r) {
  let n = document.createTextNode(r.t);
  const wrap = tag => { const e = document.createElement(tag); e.append(n); n = e; };
  if (r.s) wrap('s');
  if (r.u) wrap('u');
  if (r.i) wrap('i');
  if (r.b) wrap('b');
  if (r.hl) {
    wrap('mark');
    n.style.backgroundColor = r.hl;
    n.style.color = luminance(r.hl) > 0.5 ? '#000' : '#fff';
  }
  return n;
}

// Testo semplice e HTML da salvare nello script.
export function scriptFields(lines) {
  return { text: toText(lines), html: hasFormat(lines) ? toHTML(lines) : null };
}

// ---------- incolla ----------

// Incolla negli editor (editor dello script e riquadro «Incolla»): l'HTML degli appunti si
// riduce alle formattazioni ammesse prima di entrare nella pagina. Restituisce true se ha incollato.
export function pasteRich(e) {
  const cd = e.clipboardData;
  if (!cd) return false;
  const html = cd.getData('text/html'), text = cd.getData('text/plain');
  if (!html && !text) return false;
  e.preventDefault();
  insertLines(html ? fromHTML(html) : fromHTML(textToHTML(text)));
  return true;
}

const textToHTML = text => text.replace(/\r\n?/g, '\n').split('\n').map(l => '<p>' + esc(l) + '</p>').join('');

export async function readClipboard() {
  if (navigator.clipboard?.read) {
    try {
      for (const item of await navigator.clipboard.read()) {
        if (item.types.includes('text/html')) return fromHTML(await (await item.getType('text/html')).text());
      }
    } catch { /* si prova col testo semplice */ }
  }
  const text = await navigator.clipboard.readText();
  return text ? fromHTML(textToHTML(text)) : [];
}

// Inserisce le righe al punto del cursore. Una riga sola entra nel paragrafo dove si trova
// il cursore; più righe diventano paragrafi (si sistemano da sole al salvataggio).
export function insertLines(lines) {
  const sel = getSelection();
  if (!sel.rangeCount || !lines.length || (lines.length === 1 && !lines[0].length)) return;
  const range = sel.getRangeAt(0);
  range.deleteContents();
  const rendered = renderLines(lines, { editor: true });
  const frag = document.createDocumentFragment();
  if (lines.length === 1) frag.append(...rendered.firstChild.childNodes);
  else frag.append(rendered);
  const last = frag.lastChild;
  range.insertNode(frag);
  if (last) {
    range.setStartAfter(last);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  }
}
