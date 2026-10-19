// Backup degli script (e delle impostazioni) in un file .json, e ripristino.
import { db } from './db.js';
import { settings, DEFAULTS } from './settings.js';

const LAST_KEY = 'tp.lastBackup';

export function lastBackup() {
  const v = Number(localStorage.getItem(LAST_KEY));
  return v ? new Date(v) : null;
}

// Sincrona fino a share(): Safari accetta la condivisione solo subito dopo il tocco.
export async function exportBackup(scripts) {
  const now = new Date();
  const p = n => String(n).padStart(2, '0');
  const name = `teleprompter-backup-${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}_${p(now.getHours())}${p(now.getMinutes())}.json`;
  const data = { app: 'teleprompter', format: 1, exportedAt: now.toISOString(), scripts, settings: settings.get() };
  const file = new File([JSON.stringify(data, null, 1)], name, { type: 'application/json' });

  const touch = matchMedia('(pointer: coarse)').matches;
  if (touch && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
    } catch (err) {
      if (err.name === 'AbortError') return false;
      throw err;
    }
  } else {
    const url = URL.createObjectURL(file);
    const a = Object.assign(document.createElement('a'), { href: url, download: name });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
  try { localStorage.setItem(LAST_KEY, String(now.getTime())); } catch {}
  return true;
}

// Unisce il backup alla libreria: aggiunge gli script nuovi e aggiorna quelli più vecchi.
// Non cancella niente.
export async function restoreBackup(file, { askSettings = true } = {}) {
  let data;
  try { data = JSON.parse(await file.text()); }
  catch { throw new Error('non è un file di backup valido'); }
  if (data?.app !== 'teleprompter' || !Array.isArray(data.scripts)) throw new Error('non è un backup del Teleprompter');

  let added = 0, updated = 0, same = 0;
  for (const s of data.scripts) {
    if (!s || typeof s.id !== 'string' || typeof s.text !== 'string') continue;
    const clean = {
      id: s.id,
      title: String(s.title || 'Senza titolo'),
      text: s.text,
      duration: Number.isFinite(s.duration) && s.duration > 0 ? s.duration : null,
      createdAt: Number(s.createdAt) || Date.now(),
      updatedAt: Number(s.updatedAt) || Date.now(),
    };
    const old = await db.get(clean.id);
    if (!old) { await db.put(clean); added++; }
    else if (clean.updatedAt > old.updatedAt) { await db.put(clean); updated++; }
    else same++;
  }

  let settingsRestored = false;
  if (data.settings && typeof data.settings === 'object' && askSettings
      && confirm('Ripristinare anche le impostazioni del prompter salvate nel backup?')) {
    const patch = {};
    for (const k of Object.keys(DEFAULTS)) {
      if (k in data.settings && typeof data.settings[k] === typeof DEFAULTS[k]) patch[k] = data.settings[k];
    }
    settings.set(patch);
    settingsRestored = true;
  }
  return { added, updated, same, settingsRestored };
}
