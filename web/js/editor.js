import { db } from './db.js';
import { toast, fmtTime, estimateSeconds, countWords, WPM } from './util.js';

export class Editor {
  constructor({ onBack, onRead }) {
    const q = id => document.getElementById(id);
    this.el = { title: q('ed-title'), text: q('ed-text'), min: q('ed-min'), sec: q('ed-sec'),
      stats: q('ed-stats'), saved: q('ed-saved') };
    this.script = null;
    this.isDirty = false;

    const onInput = () => { this.markDirty(); this.updateStats(); };
    for (const k of ['title', 'text', 'min', 'sec']) this.el[k].addEventListener('input', onInput);

    q('ed-estimate').addEventListener('click', () => {
      const est = estimateSeconds(this.el.text.value);
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
    this.el.text.value = script.text;
    const d = script.duration;
    this.el.min.value = d == null ? '' : Math.floor(d / 60);
    this.el.sec.value = d == null ? '' : d % 60;
    this.el.saved.textContent = '';
    this.updateStats();
    this.el.text.scrollTop = 0;
    if (focus) setTimeout(() => this.el.text.focus(), 50);
  }

  readDuration() {
    const { min, sec } = this.el;
    if (min.value === '' && sec.value === '') return null;
    const v = (parseInt(min.value, 10) || 0) * 60 + (parseInt(sec.value, 10) || 0);
    return v > 0 ? v : null;
  }

  updateStats() {
    const text = this.el.text.value;
    const w = countWords(text);
    const est = estimateSeconds(text);
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
    s.title = this.el.title.value.trim() || 'Senza titolo';
    s.text = this.el.text.value;
    s.duration = this.readDuration();
    s.updatedAt = Date.now();
    this.isDirty = false;
    await db.put(s);
    this.el.saved.textContent = 'Salvato';
  }
}
