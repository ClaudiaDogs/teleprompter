import { db, newScript } from './db.js';
import { h, toast, fmtTime, estimateSeconds, countWords, normalize, tidy, titleFrom } from './util.js';
import { importFile, fileExt } from './importers.js';
import { exportBackup, restoreBackup, lastBackup } from './backup.js';

const BACKUP_WARN_DAYS = 14;

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
    this.backupInfo = q('lib-backup-info');
    this.restoreFile = q('lib-restore-file');
    q('lib-backup').addEventListener('click', () => this.backup());
    q('lib-restore').addEventListener('click', () => this.restoreFile.click());
    this.restoreFile.addEventListener('change', async () => {
      await this.importFiles([...this.restoreFile.files]);
      this.restoreFile.value = '';
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
    this.renderBackupInfo();
  }

  renderBackupInfo() {
    const last = lastBackup();
    const old = this.scripts.length > 0 && (!last || Date.now() - last > BACKUP_WARN_DAYS * 864e5);
    this.backupInfo.textContent = last
      ? 'Ultimo backup: ' + last.toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' })
      : (this.scripts.length ? 'Nessun backup: gli script sono solo su questo dispositivo' : '');
    this.backupInfo.classList.toggle('old', old);
  }

  async backup() {
    if (!this.scripts.length) { toast('Non ci sono script da salvare'); return; }
    try {
      if (await exportBackup(this.scripts)) toast(`Backup di ${this.scripts.length} script pronto`);
    } catch (err) {
      alert('Backup non riuscito: ' + err.message);
    }
    this.renderBackupInfo();
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
    const notes = [];
    if (files.some(f => fileExt(f.name) === 'pdf')) toast('Lettura del PDF…', 4000);
    for (const f of files) {
      try {
        if (fileExt(f.name) === 'json') {
          const r = await restoreBackup(f);
          notes.push(`${f.name}: ${r.added} script aggiunti, ${r.updated} aggiornati, ${r.same} già presenti`
            + (r.settingsRestored ? ', impostazioni ripristinate' : ''));
          ok++;
          continue;
        }
        const { title, text } = await importFile(f);
        if (!text) throw new Error('file vuoto');
        await db.put(newScript(title, text));
        ok++;
      } catch (err) {
        errors.push(`${f.name}: ${err.message}`);
      }
    }
    await this.refresh();
    if (errors.length || notes.length) {
      alert([errors.length ? `Importati ${ok} file su ${files.length}.` : '', ...notes, ...errors].filter(Boolean).join('\n\n'));
    } else {
      toast(ok === 1 ? 'Script importato' : `Importati ${ok} script`);
    }
  }
}
