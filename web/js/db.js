// Script salvati nel browser (IndexedDB), solo su questo dispositivo.
import { uid } from './util.js';

const DB_NAME = 'teleprompter', STORE = 'scripts';
let dbp;

function open() {
  return dbp ??= new Promise((resolve, reject) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id' });
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

function tx(mode, fn) {
  return open().then(d => new Promise((resolve, reject) => {
    const t = d.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(req?.result);
    t.onerror = t.onabort = () => reject(t.error);
  }));
}

export const db = {
  all: () => tx('readonly', st => st.getAll()),
  get: id => tx('readonly', st => st.get(id)),
  put: s => tx('readwrite', st => st.put(s)),
  del: id => tx('readwrite', st => st.delete(id)),
};

// duration: secondi, oppure null = usa la stima a 150 parole/min.
export function newScript(title = 'Nuovo script', text = '') {
  const now = Date.now();
  return { id: uid(), title, text, duration: null, createdAt: now, updatedAt: now };
}
