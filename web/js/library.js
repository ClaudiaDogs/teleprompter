import { db, newScript } from './db.js';
import { h, toast, fmtTime, estimateSeconds, countWords, normalize, tidy, titleFrom } from './util.js';
import { importFile } from './importers.js';

const PLAY = '▶︎';

export class Library {
  constructor({ onEdit, onRead }) {
    this.onEdit = onEdit;
    this.onRead = onRead;
    this.scripts = [];
    const q = id => document.getElementById(id);
    this.view = q('view-library');
    this.list = q('lib-list');
    this.empty = q('lib-empty');
    this.search = q('lib-search');
    this.file = q('lib-file');

    q('lib-new').addEventListener('click', async () => {
      const s = newScript();
      await db.put(s);
      this.onEdit(s, { focus: true });
    });
    q('lib-paste').addEventListener('click', () => this.paste());
    q('lib-import').addEventListener('click', () => this.file.click());
    this.file.addEventListener('change', async () => {
      await this.importFiles([...this.file.files]);
      this.file.value = '';
    });
    this.search.addEventListener('input', () => this.render());
    this.list.addEventListener('click', e => this.onClick(e));

    // trascinamento di file sulla libreria (computer)
    this.view.addEventListener('dragover', e => { e.preventDefault(); });
    this.view.addEventListener('drop', e => {
      e.preventDefault();
      if (e.dataTransfer?.files?.length) this.importFiles([...e.dataTransfer.files]);
    });
  }

  async refresh() {
    this.scripts = (await db.all()).sort((a, b) => b.updatedAt - a.updatedAt);
    this.render();
  }

  render() {
    const q = normalize(this.search.value.trim());
    const items = q ? this.scripts.filter(s => normalize(s.title + '\n' + s.text).includes(q)) : this.scripts;
    this.list.replaceChildren(...items.map(s => this.item(s)));
    this.empty.hidden = this.scripts.length > 0;
    if (q && !items.length) this.list.append(h('li', 'empty', 'Nessuno script trovato.'));
  }

  item(s) {
    const li = h('li', 'script-item');
    li.dataset.id = s.id;
    const main = h('button', 'item-main');
    main.dataset.act = 'edit';
    const words = countWords(s.text);
    const dur = s.duration ?? estimateSeconds(s.text);
    const date = new Date(s.updatedAt).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' });
    main.append(
      h('span', 'item-title', s.title || 'Senza titolo'),
      h('span', 'item-meta', `${words} parole · ${fmtTime(dur)}${s.duration == null ? ' (stima)' : ''} · ${date}`),
      h('span', 'item-preview', s.text.slice(0, 160).replace(/\s+/g, ' ')),
    );
    const acts = h('div', 'item-actions');
    for (const [act, label, cls] of [['read', PLAY + ' Leggi', 'btn primary'], ['dup', 'Duplica', 'btn'], ['del', 'Elimina', 'btn danger']]) {
      const b = h('button', cls, label);
      b.dataset.act = act;
      acts.append(b);
    }
    li.append(main, acts);
    return li;
  }

  async onClick(e) {
    const btn = e.target.closest('[data-act]');
    const li = e.target.closest('.script-item');
    if (!btn || !li) return;
    const s = this.scripts.find(x => x.id === li.dataset.id);
    if (!s) return;
    switch (btn.dataset.act) {
      case 'edit': this.onEdit(s); break;
      case 'read': this.onRead(s); break;
      case 'dup': {
        const c = { ...newScript(s.title + ' (copia)', s.text), duration: s.duration };
        await db.put(c);
        toast('Script duplicato');
        this.refresh();
        break;
      }
      case 'del':
        if (confirm(`Eliminare «${s.title}»?\nL'operazione non si può annullare.`)) {
          await db.del(s.id);
          toast('Script eliminato');
          this.refresh();
        }
        break;
    }
  }

  async paste() {
    let text = '';
    try { text = await navigator.clipboard.readText(); } catch { /* permesso negato o non disponibile */ }
    text = tidy(text || '');
    const s = text ? newScript(titleFrom(text), text) : newScript();
    await db.put(s);
    if (text) toast('Script creato dagli appunti');
    else toast('Incolla il testo nell\'editor', 2500);
    this.onEdit(s, { focus: !text });
  }

  async importFiles(files) {
    let ok = 0;
    const errors = [];
    for (const f of files) {
      try {
        const { title, text } = await importFile(f);
        if (!text) throw new Error('file vuoto');
        await db.put(newScript(title, text));
        ok++;
      } catch (err) {
        errors.push(`${f.name}: ${err.message}`);
      }
    }
    await this.refresh();
    if (errors.length) alert(`Importati ${ok} file su ${files.length}.\n\n${errors.join('\n')}`);
    else toast(ok === 1 ? 'Script importato' : `Importati ${ok} script`);
  }
}
