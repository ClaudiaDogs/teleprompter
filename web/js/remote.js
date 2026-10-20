// Il telecomando sul telefono: comanda l'iPad e ne mostra il testo che scorre, l'avanzamento e i tempi.
import { h, fmtTime, clamp } from './util.js';

const FONT_KEY = 'tp.remoteFont';

export class RemoteView {
  constructor({ onExit }) {
    this.onExit = onExit;
    const q = id => document.getElementById(id);
    this.el = {
      title: q('rm-title'), state: q('rm-state'), msg: q('rm-msg'), library: q('rm-library'), list: q('rm-list'),
      main: q('rm-main'), elapsed: q('rm-elapsed'), remaining: q('rm-remaining'), progress: q('rm-progress'),
      play: q('rm-play'), speed: q('rm-speed'), flipH: q('rm-flipH'), flipV: q('rm-flipV'),
      preview: q('rm-preview'), ptext: q('rm-ptext'), pguide: q('rm-pguide'), pwait: q('rm-pwait'),
    };
    this.script = null;
    this.offset = 0;
    this.maxOffset = 0;
    this.linePx = 30;
    this.padTop = 0;
    this.fontSize = Number(localStorage.getItem(FONT_KEY)) || 22;
    this.loop = this.loop.bind(this);
    this.bindPreview();
    q('rm-psmaller').addEventListener('click', () => this.setFont(-2));
    q('rm-pbigger').addEventListener('click', () => this.setFont(+2));
    new ResizeObserver(() => this.measure()).observe(this.el.preview);
    this.client = null;
    this.status = { open: false };
    this.items = [];
    this.showList = false;
    this.seeking = false;

    q('rm-exit').addEventListener('click', () => this.onExit());
    q('rm-scripts').addEventListener('click', () => { this.showList = true; this.render(); });
    this.el.main.addEventListener('click', e => {
      const b = e.target.closest('[data-rc]');
      if (b) this.send(b.dataset.rc);
    });
    this.el.list.addEventListener('click', e => {
      const li = e.target.closest('[data-id]');
      if (!li) return;
      this.showList = false;
      this.send('open', li.dataset.id);
    });
    const pr = this.el.progress;
    let lastSeek = 0;
    pr.addEventListener('input', () => {
      this.seeking = true;
      const now = Date.now();
      if (now - lastSeek > 120) { lastSeek = now; this.send('seek', pr.value / 1000); }
    });
    pr.addEventListener('change', () => { this.send('seek', pr.value / 1000); this.seeking = false; });
  }

  open(client) {
    this.client = client;
    this.status = { open: false };
    this.items = [];
    this.showList = false;
    this.script = null;
    this.el.ptext.replaceChildren();
    this.setState('connecting', 'collegamento in corso…');
    this.render();
    this.lockScreen();
    this.last = performance.now();
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(this.loop);
  }

  close() {
    this.client = null;
    cancelAnimationFrame(this.raf);
    this.wake?.release().catch(() => {});
    this.wake = null;
  }

  send(c, arg) {
    if (!this.client?.send({ t: 'cmd', c, arg })) this.flash('Non collegato');
  }

  flash(text) {
    this.el.msg.textContent = text;
    clearTimeout(this.flashTimer);
    this.flashTimer = setTimeout(() => this.setState(this.state, this.stateMsg), 1500);
  }

  setState(state, msg = '') {
    this.state = state;
    this.stateMsg = msg;
    const labels = { connected: 'collegato', connecting: 'in collegamento', error: 'non collegato' };
    this.el.state.textContent = labels[state] || state;
    this.el.state.dataset.state = state;
    this.el.msg.textContent = state === 'connected' ? '' : msg;
    this.render();
  }

  onMessage(m) {
    if (m.t === 'library') { this.items = m.items || []; this.render(); }
    else if (m.t === 'status') {
      const guideMoved = m.guidePos !== this.status.guidePos;
      this.status = m;
      this.statusAt = performance.now();
      if (guideMoved) this.measure();
      this.render();
    } else if (m.t === 'script') this.setScript(m);
  }

  // ---------- anteprima del testo che scorre ----------

  setScript(m) {
    this.script = { id: m.id, text: m.text || '' };
    const frag = document.createDocumentFragment();
    for (const line of this.script.text.split('\n')) frag.append(h('p', null, line.trim() === '' ? ' ' : line));
    this.el.ptext.replaceChildren(frag);
    this.offset = 0;
    this.measure();
    this.render();
  }

  setFont(d) {
    const progress = this.maxOffset > 0 ? this.offset / this.maxOffset : 0;
    this.fontSize = clamp(this.fontSize + d, 14, 44);
    try { localStorage.setItem(FONT_KEY, String(this.fontSize)); } catch {}
    this.measure();
    this.offset = progress * this.maxOffset;
  }

  measure() {
    const e = this.el;
    const boxH = e.preview.clientHeight;
    if (!boxH) return;
    const g = (this.status.guidePos ?? 33) / 100;
    e.ptext.style.fontSize = this.fontSize + 'px';
    this.linePx = this.fontSize * 1.35;
    this.padTop = g * boxH - this.linePx / 2;
    e.pguide.style.top = g * 100 + '%';
    this.maxOffset = Math.max(0, e.ptext.offsetHeight - this.linePx);
    this.boxH = boxH;
  }

  // Segue l'iPad: posizione ricevuta più la velocità per il tempo trascorso, con piccola correzione.
  loop(now) {
    this.raf = requestAnimationFrame(this.loop);
    const dt = clamp((now - this.last) / 1000, 0, 0.1);
    this.last = now;
    const e = this.el, st = this.status;
    if (e.main.hidden) return;
    if (e.preview.clientHeight !== this.boxH) this.measure();
    const ready = !!this.script && st.open && st.scriptId === this.script.id;
    e.pwait.hidden = ready;
    e.ptext.hidden = !ready;
    if (!ready || this.drag?.moved) return;
    const age = (now - (this.statusAt || now)) / 1000;
    const playing = st.phase === 'playing';
    const v = playing ? (st.velocity || 0) * this.maxOffset : 0;
    const target = clamp(st.progress * this.maxOffset + v * age, 0, this.maxOffset);
    const diff = target - this.offset;
    this.offset = Math.abs(diff) > this.linePx * 4 ? target
      : clamp(this.offset + v * dt + diff * Math.min(1, dt * 4), 0, this.maxOffset);
    this.place();
  }

  place() {
    const dpr = devicePixelRatio || 1;
    const y = Math.round((this.padTop - this.offset) * dpr) / dpr;
    this.el.ptext.style.transform = `translate3d(0,${y}px,0)`;
  }

  // Trascinando l'anteprima si sposta il testo sull'iPad; un tocco è play/pausa.
  bindPreview() {
    const p = this.el.preview;
    let lastSent = 0;
    p.addEventListener('pointerdown', e => {
      if (e.target.closest('button')) return;
      this.drag = { id: e.pointerId, y: e.clientY, start: this.offset, moved: false };
      try { p.setPointerCapture(e.pointerId); } catch {}
    });
    p.addEventListener('pointermove', e => {
      const d = this.drag;
      if (!d || d.id !== e.pointerId) return;
      const dy = e.clientY - d.y;
      if (!d.moved && Math.abs(dy) < 8) return;
      if (!d.moved) { d.moved = true; d.y = e.clientY; d.start = this.offset; return; }
      this.offset = clamp(d.start - dy, 0, this.maxOffset);
      this.place();
      const now = Date.now();
      if (now - lastSent > 120 && this.maxOffset > 0) { lastSent = now; this.send('seek', this.offset / this.maxOffset); }
    });
    const end = e => {
      const d = this.drag;
      if (!d || d.id !== e.pointerId) return;
      this.drag = null;
      if (d.moved) {
        if (this.maxOffset > 0) this.send('seek', this.offset / this.maxOffset);
        this.status = { ...this.status, progress: this.maxOffset > 0 ? this.offset / this.maxOffset : 0 };
        this.statusAt = performance.now();
      } else if (e.type === 'pointerup') this.send('toggle');
    };
    p.addEventListener('pointerup', end);
    p.addEventListener('pointercancel', end);
  }

  render() {
    const st = this.status, e = this.el;
    const list = !st.open || this.showList;
    e.title.textContent = st.open ? st.title : 'Telecomando';
    e.library.hidden = !list;
    e.main.hidden = list;
    if (list) {
      e.list.replaceChildren(...(this.items.length
        ? this.items.map(it => { const li = h('li', it.id === st.scriptId ? 'on' : null, it.title); li.dataset.id = it.id; return li; })
        : [h('li', 'empty', this.state === 'connected' ? 'Nessuno script sull\'iPad.' : 'In attesa dell\'iPad…')]));
      return;
    }
    e.play.classList.toggle('playing', st.phase !== 'paused');
    e.elapsed.textContent = fmtTime(st.elapsed);
    e.remaining.textContent = '−' + fmtTime(Math.max(0, st.remaining), Math.ceil);
    e.remaining.classList.toggle('warn', st.remaining <= 10 && (st.elapsed > 0 || st.phase !== 'paused'));
    e.speed.textContent = st.phase === 'countdown' ? 'parte fra ' + Math.max(1, Math.ceil(st.countLeft)) : st.speedLabel;
    e.flipH.classList.toggle('on', st.flipH);
    e.flipV.classList.toggle('on', st.flipV);
    if (!this.seeking) e.progress.value = Math.round(st.progress * 1000);
  }

  async lockScreen() {
    try { this.wake = await navigator.wakeLock?.request('screen'); } catch {}
  }
}
