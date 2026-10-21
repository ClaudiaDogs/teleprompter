// Elenco delle impostazioni del prompter, usato dal pannello sull'iPad e da quello del telecomando.
import { FONTS } from './settings.js';
import { VOICE_LANGS, voiceSupported } from './voice.js';
import { h, fmtTime } from './util.js';

// duration: { get() → {duration, estimate} | null, save(secondi | null) } per la durata dello script aperto.
// remote: true sul telefono (niente lato del pannello, testi riferiti all'iPad).
export function settingsSchema({ duration, remote = false }) {
  const pct = v => v + '%';
  const voiceNote = remote
    ? 'Il microfono è quello dell\'iPad: con play il testo avanza mentre chi legge parla, e aspetta se improvvisa.'
    : voiceSupported()
      ? 'Con play il microfono ascolta e il testo avanza mentre leggi. Se salti o improvvisi, aspetta e si riaggancia quando torni allo script. Serve internet (su alcuni dispositivi funziona anche senza).'
      : 'Questo browser non ha il riconoscimento vocale: usa Safari su iPad e iPhone, oppure Chrome.';
  const sections = [
    { title: 'Testo', items: [
      { type: 'range', key: 'fontSize', label: 'Dimensione', min: 16, max: 220, step: 1, fmt: v => v + ' px' },
      { type: 'select', key: 'fontFamily', label: 'Carattere', options: FONTS },
      { type: 'toggle', key: 'bold', label: 'Grassetto' },
      { type: 'range', key: 'lineHeight', label: 'Interlinea', min: 1, max: 2.5, step: 0.05, fmt: v => v.toFixed(2) },
      { type: 'segmented', key: 'align', label: 'Allineamento', options: [['left', 'Sinistra'], ['center', 'Centro'], ['right', 'Destra']] },
      { type: 'color', key: 'textColor', label: 'Colore del testo' },
    ] },
    { title: 'Specchio', items: [
      { type: 'toggle', key: 'flipH', label: 'Ribalta orizzontale' },
      { type: 'toggle', key: 'flipV', label: 'Ribalta verticale' },
    ] },
    { title: 'Margini', items: [
      { type: 'range', key: 'marginLeft', label: 'Sinistro', min: 0, max: 40, step: 0.5, fmt: pct },
      { type: 'range', key: 'marginRight', label: 'Destro', min: 0, max: 40, step: 0.5, fmt: pct },
      { type: 'range', key: 'marginTop', label: 'Alto', min: 0, max: 45, step: 0.5, fmt: pct },
      { type: 'range', key: 'marginBottom', label: 'Basso', min: 0, max: 45, step: 0.5, fmt: pct },
    ] },
    { title: 'Scorrimento', items: [
      { type: 'segmented', key: 'scrollMode', label: 'Modalità', options: [['speed', 'Velocità'], ['duration', 'Durata'], ['voice', 'Voce']] },
      { type: 'select', key: 'voiceLang', label: 'Lingua di chi parla', options: VOICE_LANGS,
        show: s => s.scrollMode === 'voice' },
      { type: 'custom', label: '', show: s => s.scrollMode === 'voice', render: row => {
        row.append(h('div', 'pnote', voiceNote));
        return null;
      } },
      { type: 'range', key: 'speed', label: 'Velocità', min: 1, max: 200, step: 1, fmt: v => v + ' righe/min',
        show: s => s.scrollMode === 'speed' },
      { type: 'custom', label: 'Durata di questo script', show: s => s.scrollMode === 'duration',
        render: row => durationControl(row, duration) },
      { type: 'range', key: 'jumpLines', label: 'Salto di frecce e telecomandi', min: 1, max: 15, step: 1,
        fmt: v => v + (v === 1 ? ' riga' : ' righe') },
    ] },
    { title: 'Linea guida', items: [
      { type: 'toggle', key: 'guideVisible', label: 'Mostra' },
      { type: 'segmented', key: 'guideStyle', label: 'Stile', options: [['arrows', 'Frecce'], ['line', 'Linea'], ['band', 'Fascia']] },
      { type: 'range', key: 'guidePos', label: 'Posizione', min: 3, max: 97, step: 0.5, fmt: pct },
      { type: 'range', key: 'guideOpacity', label: 'Opacità', min: 0.05, max: 1, step: 0.05, fmt: v => Math.round(v * 100) + '%' },
      { type: 'color', key: 'guideColor', label: 'Colore' },
    ] },
    { title: 'Conto alla rovescia', items: [
      { type: 'range', key: 'countdown', label: 'Durata', min: 0, max: 10, step: 1, fmt: v => v ? v + ' s' : 'spento' },
      { type: 'toggle', key: 'countdownOnResume', label: 'Anche alla ripresa dopo una pausa' },
    ] },
    { title: 'Timer', items: [
      { type: 'toggle', key: 'timerVisible', label: 'Mostra' },
      { type: 'segmented', key: 'timerMode', label: 'Mostra il tempo', options: [['elapsed', 'Trascorso'], ['remaining', 'Rimanente'], ['both', 'Entrambi']] },
      { type: 'range', key: 'timerSize', label: 'Dimensione', min: 14, max: 200, step: 1, fmt: v => v + ' px' },
      { type: 'range', key: 'timerOpacity', label: 'Opacità', min: 0.1, max: 1, step: 0.05, fmt: v => Math.round(v * 100) + '%' },
      { type: 'range', key: 'timerX', label: 'Posizione orizzontale', min: 2, max: 98, step: 1, fmt: pct },
      { type: 'range', key: 'timerY', label: 'Posizione verticale', min: 2, max: 98, step: 1, fmt: pct },
    ] },
  ];
  if (!remote) {
    sections.push({ title: 'Pannello', items: [
      { type: 'segmented', key: 'panelSide', label: 'Lato', options: [['left', 'Sinistra'], ['right', 'Destra']] },
    ] });
  }
  return sections;
}

// Minuti e secondi della durata dello script aperto, con la stima a 150 parole al minuto.
function durationControl(row, duration) {
  const box = h('div', 'dur');
  const min = h('input'), sec = h('input');
  for (const [inp, max] of [[min, 599], [sec, 59]]) Object.assign(inp, { type: 'number', min: 0, max, inputMode: 'numeric' });
  const est = h('button', 'btn small', 'Stima');
  est.type = 'button';
  const note = h('div', 'pnote');
  box.append(min, h('span', null, 'min'), sec, h('span', null, 's'), est);
  row.append(box, note);

  const read = () => {
    if (min.value === '' && sec.value === '') return null;
    const v = (parseInt(min.value, 10) || 0) * 60 + (parseInt(sec.value, 10) || 0);
    return v > 0 ? v : null;
  };
  min.addEventListener('change', () => duration.save(read()));
  sec.addEventListener('change', () => duration.save(read()));
  est.addEventListener('click', () => { duration.save(null); min.value = sec.value = ''; });

  return () => {
    const cur = duration.get();
    if (!cur) return;
    const d = cur.duration, e = cur.estimate;
    // non si sovrascrive quello che si sta scrivendo
    if (document.activeElement !== min && document.activeElement !== sec) {
      min.value = d == null ? '' : Math.floor(d / 60);
      sec.value = d == null ? '' : d % 60;
    }
    min.placeholder = Math.floor(e / 60);
    sec.placeholder = String(e % 60).padStart(2, '0');
    note.textContent = d == null
      ? `Stima a 150 parole/min: ${fmtTime(e)}. Scrivi una durata per fissarla.`
      : `Salvata con lo script. Durante la lettura + e − tolgono o aggiungono 5 s.`;
  };
}
