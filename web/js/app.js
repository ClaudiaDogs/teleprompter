import { Library } from './library.js';
import { Editor } from './editor.js';
import { Prompter } from './prompter.js';

const views = {
  library: document.getElementById('view-library'),
  editor: document.getElementById('view-editor'),
  prompter: document.getElementById('view-prompter'),
};
let current = 'library';
let reloadPending = false;

function show(name) {
  for (const [k, el] of Object.entries(views)) el.hidden = k !== name;
  current = name;
}

function backToLibrary() {
  show('library');
  if (reloadPending) { location.reload(); return; }
  library.refresh();
}

function openPrompter(script) {
  show('prompter');
  prompter.open(script);
}

const prompter = new Prompter({ onClose: backToLibrary });
const editor = new Editor({ onBack: backToLibrary, onRead: openPrompter });
const library = new Library({
  onEdit: (s, opts) => { show('editor'); editor.open(s, opts); },
  onRead: openPrompter,
});

library.refresh();
document.getElementById('app-version').textContent = 'Versione ' + (self.APP_VERSION || '');

// Chiede al browser di non cancellare i dati salvati.
navigator.storage?.persist?.().catch(() => {});

// Niente zoom con due dita su iPad.
document.addEventListener('gesturestart', e => e.preventDefault());

// Funzionamento offline. Una versione nuova si carica appena si torna alla libreria.
if ('serviceWorker' in navigator && (location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname))) {
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('sw.js').catch(err => console.warn('Service worker:', err));
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) return;
    if (current === 'library') location.reload();
    else reloadPending = true;
  });
}
