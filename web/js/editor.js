import { db } from './db.js';
import { toast, fmtTime, estimateSeconds, countWords, WPM } from './util.js';
import { fromDOM, scriptLines, renderLines, scriptFields, pasteRich } from './rich.js';

// Comandi della barra di formattazione (document.execCommand: l'unico modo che funziona
// in tutti i browser, Safari compreso, per formattare la selezione di un campo modificabile).
const COMMANDS = { bold: 'bold', italic: 'italic', underline: 'underline', strike: 'strikeThrough' };
const HIGHLIGHT = '#ffeb3b';

export class Editor {
  constructor({ onBack, onRead }) {
    const q = id => document.getElementById(id);
    this.el = { title: q('ed-title'), text: q('ed-text'), min: q('ed-min'), sec: q('ed-sec'),
      stats: q('ed-stats'), saved: q('ed-saved'), tools: q('ed-tools') };
    this.script = null;
    this.isDirty = false;

    const onInput = () => { this.markDirty(); this.updateStats(); };
    for (const k of ['title', 'text', 'min', 'sec']) this.el[k].addEventListener('input', onInput);
    this.el.text.addEventListener('paste', e => { if (pasteRich(e)) onInput(); });

    // I pulsanti non devono togliere la selezione al testo.
    this.el.tools.addEventListener('pointerdown', e => { if (e.target.closest('[data-fmt]')) e.preventDefault(); });
    this.el.tools.addEventListener('mousedown', e => { if (e.target.closest('[data-fmt]')) e.preventDefault(); });
    this.el.tools.addEventListener('click', e => {
      const b = e.target.closest('[data-fmt]');
      if (!b) return;
      this.format(b.dataset.fmt);
      onInput();
    });

    q('ed-estimate').addEventListener('click', () => {
      const est = estimateSeconds(this.fields().text);
      this.el.min.value = Math.floor(est / 60);
      this.el.sec.value = est % 60;
      onInput();
    });
    q('ed-back').addEventListener('click', async () => {
      await this.flush();
      const s = this.script;
      if (!s.text.trim() && (s.title === 'Nuovo script' || s.title === 'Senza titolo')) await db.del(s.id);
      onBack();
    });
    q('ed-read').addEventListener('click', async () => {
      await this.flush();
      if (!this.script.text.trim()) { toast('Lo script è vuoto'); return; }
      onRead(this.script);
    });
  }

  open(script, { focus = false } = {}) {
    this.script = script;
    this.isDirty = false;
    this.el.title.value = script.title;
    this.el.text.replaceChildren(renderLines(scriptLines(script), { editor: true }));
    const d = script.duration;
    this.el.min.value = d == null ? '' : Math.floor(d / 60);
    this.el.sec.value = d == null ? '' : d % 60;
    this.el.saved.textContent = '';
    this.updateStats();
    this.el.text.scrollTop = 0;
    if (focus) setTimeout(() => this.el.text.focus(), 50);
  }

  // Testo semplice e, se serve, HTML formattato del contenuto dell'editor.
  fields() {
    return scriptFields(fromDOM(this.el.text));
  }

  format(kind) {
    this.el.text.focus();
    if (kind === 'clear') document.execCommand('removeFormat');
    else if (kind === 'highlight') {
      if (!document.execCommand('hiliteColor', false, HIGHLIGHT)) document.execCommand('backColor', false, HIGHLIGHT);
    } else document.execCommand(COMMANDS[kind]);
  }

  readDuration() {
    const { min, sec } = this.el;
    if (min.value === '' && sec.value === '') return null;
    const v = (parseInt(min.value, 10) || 0) * 60 + (parseInt(sec.value, 10) || 0);
    return v > 0 ? v : null;
  }

  updateStats() {
    const text = this.fields().text;
    const w = countWords(text);
    const est = estimateSeconds(text);
    this.el.text.classList.toggle('empty', !text.trim());
    this.el.stats.textContent = `${w} parole · stima ${fmtTime(est)} a ${WPM} parole/min`;
    this.el.min.placeholder = Math.floor(est / 60);
    this.el.sec.placeholder = String(est % 60).padStart(2, '0');
  }

  markDirty() {
    this.isDirty = true;
    this.el.saved.textContent = '…';
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 600);
  }

  async flush() {
    clearTimeout(this.timer);
    if (!this.isDirty || !this.script) return;
    const s = this.script;
    const { text, html } = this.fields();
    s.title = this.el.title.value.trim() || 'Senza titolo';
    s.text = text;
    s.html = html;
    s.duration = this.readDuration();
    s.updatedAt = Date.now();
    this.isDirty = false;
    await db.put(s);
    this.el.saved.textContent = 'Salvato';
  }
}
