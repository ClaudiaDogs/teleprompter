// Costruisce i controlli del pannello impostazioni da uno schema.
// Restituisce refresh(), che riallinea i controlli ai valori correnti.
import { h } from './util.js';

export function buildPanel(root, schema, store) {
  const updaters = [];
  root.replaceChildren();
  for (const sec of schema) {
    const box = h('section', 'psec');
    box.append(h('h3', null, sec.title));
    for (const it of sec.items) {
      const row = h('div', 'prow');
      const label = h('span', 'plabel', it.label);
      let up = null;

      if (it.type === 'range') {
        const val = h('span', 'pval');
        const head = h('div', 'phead');
        head.append(label, val);
        const inp = h('input');
        Object.assign(inp, { type: 'range', min: it.min, max: it.max, step: it.step });
        inp.addEventListener('input', () => store.set({ [it.key]: Number(inp.value) }));
        row.append(head, inp);
        up = s => { inp.value = s[it.key]; val.textContent = it.fmt ? it.fmt(s[it.key]) : s[it.key]; };

      } else if (it.type === 'toggle') {
        row.classList.add('inline');
        const inp = h('input', 'switch');
        inp.type = 'checkbox';
        inp.addEventListener('change', () => store.set({ [it.key]: inp.checked }));
        row.append(label, inp);
        up = s => { inp.checked = !!s[it.key]; };

      } else if (it.type === 'select') {
        const sel = h('select');
        for (const [v, t] of it.options) { const o = h('option', null, t); o.value = v; sel.append(o); }
        sel.addEventListener('change', () => store.set({ [it.key]: sel.value }));
        row.append(label, sel);
        up = s => { sel.value = s[it.key]; };

      } else if (it.type === 'segmented') {
        const seg = h('div', 'seg');
        const btns = it.options.map(([v, t]) => {
          const b = h('button', null, t);
          b.type = 'button';
          b.addEventListener('click', () => store.set({ [it.key]: v }));
          seg.append(b);
          return [v, b];
        });
        row.append(label, seg);
        up = s => btns.forEach(([v, b]) => b.classList.toggle('on', s[it.key] === v));

      } else if (it.type === 'color') {
        row.classList.add('inline');
        const inp = h('input');
        inp.type = 'color';
        inp.addEventListener('input', () => store.set({ [it.key]: inp.value }));
        row.append(label, inp);
        up = s => { inp.value = s[it.key]; };

      } else if (it.type === 'custom') {
        row.append(label);
        up = it.render(row);
      }

      if (it.show) {
        const base = up;
        up = s => { row.hidden = !it.show(s); base?.(s); };
      }
      updaters.push(up);
      box.append(row);
    }
    root.append(box);
  }
  const refresh = () => { const s = store.get(); updaters.forEach(u => u?.(s)); };
  refresh();
  return refresh;
}
