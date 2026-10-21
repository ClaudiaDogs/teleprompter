// Il telecomando sul telefono: comanda l'iPad e ne mostra una copia fedele dello schermo
// (stesse proporzioni, carattere, colori, margini, linea guida, timer e conto alla rovescia),
// senza l'effetto specchio, insieme ad avanzamento e tempi.
import { h, fmtTime, clamp } from './util.js';
import { buildPanel } from './panel.js';
import { settingsSchema } from './settings-schema.js';

export class RemoteView {
  constructor({ onExit }) {
    this.onExit = onExit;
    const q = id => document.getElementById(id);
    this.el = {
      title: q('rm-title'), state: q('rm-state'), msg: q('rm-msg'), library: q('rm-library'), list: q('rm-list'),
      main: q('rm-main'), elapsed: q('rm-elapsed'), remaining: q('rm-remaining'), progress: q('rm-progress'),
      play: q('rm-play'), speed: q('rm-speed'), flipH: q('rm-flipH'), flipV: q('rm-flipV'),
      preview: q('rm-preview'), pview: q('rm-pview'), ptext: q('rm-ptext'), pguide: q('rm-pguide'),
      ptimer: q('rm-ptimer'), pcount: q('rm-pcount'), pwait: q('rm-pwait'),
      controls: q('rm-controls'), settings: q('rm-settings'), settingsBody: q('rm-settings-body'),
    };
    this.client = null;
    this.status = { open: false };
    this.hostSettings = null;
    this.items = [];
    this.showList = false;
    this.seeking = false;
    this.script = null;
    this.offset = 0;
    this.maxOffset = 0;
    this.linePx = 30;
    this.padTop = 0;
    this.shown = {};

    this.loop = this.loop.bind(this);
    this.bindPreview();
    new ResizeObserver(() => this.layout()).observe(this.el.main);

    // impostazioni del prompter: il pannello legge e scrive quelle dell'iPad
    this.store = { get: () => this.hostSettings || {}, set: patch => this.changeSettings(patch) };
    this.pending = {};
    this.outgoing = {};
    q('rm-settings-open').addEventListener('click', () => this.openSettings(true));
    q('rm-settings-done').addEventListener('click', () => this.openSettings(false));
    q('rm-settings-reset').addEventListener('click', () => {
      if (confirm('Ripristinare tutte le impostazioni predefinite del prompter?')) this.send('resetSettings');
    });

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
    this.hostSettings = null;
    this.items = [];
    this.showList = false;
    this.script = null;
    this.el.ptext.replaceChildren();
    this.openSettings(false);
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
    else if (m.t === 'settings') {
      // le modifiche appena fatte qui vincono sull'eco un po' più vecchia che torna dall'iPad
      const recent = performance.now() - (this.pendingAt || 0) < 800;
      this.hostSettings = { ...m.s, ...(recent ? this.pending : {}) };
      if (!recent) this.pending = {};
      this.layout();
      this.refreshPanel?.();
    }
    else if (m.t === 'status') {
      const old = this.status;
      this.status = m;
      this.statusAt = performance.now();
      if (m.stageW !== old.stageW || m.stageH !== old.stageH || m.guidePos !== old.guidePos) this.layout();
      if (this.settingsOpen && (m.duration !== old.duration || m.estimate !== old.estimate)) this.refreshPanel?.();
      this.render();
    } else if (m.t === 'script') this.setScript(m);
  }

  render() {
    const st = this.status, e = this.el;
    const list = !st.open || this.showList;
    const wasHidden = e.main.hidden;
    e.title.textContent = st.open ? st.title : 'Telecomando';
    e.library.hidden = !list;
    e.main.hidden = list;
    if (list) {
      e.list.replaceChildren(...(this.items.length
        ? this.items.map(it => { const li = h('li', it.id === st.scriptId ? 'on' : null, it.title); li.dataset.id = it.id; return li; })
        : [h('li', 'empty', this.state === 'connected' ? 'Nessuno script sull\'iPad.' : 'In attesa dell\'iPad…')]));
      return;
    }
    if (wasHidden) this.layout(); // da nascosto non si può misurare
    e.play.classList.toggle('playing', st.phase !== 'paused');
    e.elapsed.textContent = fmtTime(st.elapsed);
    e.remaining.textContent = '−' + fmtTime(Math.max(0, st.remaining), Math.ceil);
    e.remaining.classList.toggle('warn', st.remaining <= 10 && (st.elapsed > 0 || st.phase !== 'paused'));
    e.speed.textContent = st.phase === 'countdown' ? 'parte fra ' + Math.max(1, Math.ceil(st.countLeft)) : st.speedLabel;
    e.flipH.classList.toggle('on', st.flipH);
    e.flipV.classList.toggle('on', st.flipV);
    if (!this.seeking) e.progress.value = Math.round(st.progress * 1000);
  }

  // ---------- impostazioni del prompter ----------

  openSettings(open) {
    const e = this.el;
    if (open && !this.hostSettings) { this.flash("In attesa delle impostazioni dall'iPad…"); return; }
    if (open && !this.refreshPanel) {
      this.refreshPanel = buildPanel(e.settingsBody, settingsSchema({
        remote: true,
        duration: {
          get: () => (this.status.open ? { duration: this.status.duration ?? null, estimate: this.status.estimate || 0 } : null),
          save: v => this.send('duration', v),
        },
      }), this.store);
    }
    this.settingsOpen = open;
    e.settings.hidden = !open;
    e.controls.hidden = open;
    e.main.classList.toggle('editing', open);
    this.layout();
    if (open) { this.refreshPanel(); e.main.scrollTop = 0; }
  }

  // Si vede subito sul telefono e si manda all'iPad al massimo 12 volte al secondo.
  changeSettings(patch) {
    this.hostSettings = { ...this.hostSettings, ...patch };
    this.pending = { ...this.pending, ...patch };
    this.pendingAt = performance.now();
    Object.assign(this.outgoing, patch);
    this.layout();
    this.refreshPanel?.();
    if (!this.sendTimer) {
      this.sendTimer = setTimeout(() => {
        this.sendTimer = null;
        const out = this.outgoing;
        this.outgoing = {};
        this.send('settings', out);
      }, 80);
    }
  }

  // ---------- copia dello schermo del prompter ----------

  setScript(m) {
    this.script = { id: m.id, text: m.text || '' };
    const frag = document.createDocumentFragment();
    for (const line of this.script.text.split('\n')) frag.append(h('p', null, line.trim() === '' ? ' ' : line));
    this.el.ptext.replaceChildren(frag);
    this.offset = 0;
    this.layout();
    this.render();
  }

  // Riquadro con le proporzioni dello schermo dell'iPad; tutto il resto in scala, come sul prompter.
  layout() {
    const e = this.el, st = this.status, s = this.hostSettings;
    if (e.main.hidden) return;
    const hostW = st.stageW || 1024, hostH = st.stageH || 768;
    const cs = getComputedStyle(e.main);
    const availW = e.main.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    if (availW <= 0) return;
    let w = availW, ht = (w * hostH) / hostW;
    const maxH = innerHeight * (this.settingsOpen ? 0.36 : 0.5); // più spazio al pannello mentre si modifica
    if (ht > maxH) { ht = maxH; w = (ht * hostW) / hostH; }
    e.preview.style.width = w + 'px';
    e.preview.style.height = ht + 'px';
    const k = w / hostW;
    e.pcount.style.fontSize = Math.min(ht, w) * 0.42 + 'px';
    if (!s) return;

    const fontPx = s.fontSize * k;
    const arrowPx = Math.round(s.fontSize * 0.45) * k;
    const arrows = s.guideVisible && s.guideStyle === 'arrows';
    Object.assign(e.pview.style, {
      left: s.marginLeft + '%', right: s.marginRight + '%', top: s.marginTop + '%', bottom: s.marginBottom + '%',
    });
    Object.assign(e.ptext.style, {
      fontSize: fontPx + 'px', fontFamily: s.fontFamily, fontWeight: s.bold ? '700' : '400',
      lineHeight: String(s.lineHeight), color: s.textColor, textAlign: s.align,
      padding: arrows ? `0 ${arrowPx * 1.1 + 12 * k}px` : '0',
    });
    const g = e.pguide;
    g.hidden = !s.guideVisible;
    g.dataset.style = s.guideStyle;
    g.style.top = s.guidePos + '%';
    g.style.opacity = s.guideOpacity;
    g.style.setProperty('--gc', s.guideColor);
    g.style.setProperty('--band', fontPx * s.lineHeight + 'px');
    g.style.setProperty('--arrow', arrowPx + 'px');
    e.ptimer.hidden = !s.timerVisible;
    Object.assign(e.ptimer.style, {
      left: s.timerX + '%', top: s.timerY + '%', fontSize: s.timerSize * k + 'px', opacity: s.timerOpacity,
    });

    const progress = this.maxOffset > 0 ? this.offset / this.maxOffset : 0;
    this.linePx = fontPx * s.lineHeight;
    this.padTop = (s.guidePos / 100) * e.pview.clientHeight - this.linePx / 2;
    this.maxOffset = Math.max(0, e.ptext.offsetHeight - this.linePx);
    this.offset = progress * this.maxOffset;
    this.place();
  }

  // Segue l'iPad: posizione ricevuta più la velocità per il tempo trascorso, con piccola correzione.
  loop(now) {
    this.raf = requestAnimationFrame(this.loop);
    const dt = clamp((now - this.last) / 1000, 0, 0.1);
    this.last = now;
    const e = this.el, st = this.status;
    if (e.main.hidden) return;
    const ready = !!this.script && !!this.hostSettings && st.open && st.scriptId === this.script.id;
    e.pwait.hidden = ready;
    if (!ready) return;
    const age = (now - (this.statusAt || now)) / 1000;
    const playing = st.phase === 'playing';
    if (!this.drag?.moved) {
      const v = playing ? (st.velocity || 0) * this.maxOffset : 0;
      const target = clamp(st.progress * this.maxOffset + v * age, 0, this.maxOffset);
      const diff = target - this.offset;
      this.offset = Math.abs(diff) > this.linePx * 4 ? target
        : clamp(this.offset + v * dt + diff * Math.min(1, dt * 4), 0, this.maxOffset);
      this.place();
    }
    this.renderOverlays(age, playing);
  }

  place() {
    const dpr = devicePixelRatio || 1;
    const y = Math.round((this.padTop - this.offset) * dpr) / dpr;
    if (y !== this.shown.y) { this.shown.y = y; this.el.ptext.style.transform = `translate3d(0,${y}px,0)`; }
  }

  // Timer e conto alla rovescia come li vede chi legge.
  renderOverlays(age, playing) {
    const e = this.el, st = this.status, s = this.hostSettings, sh = this.shown;
    const elapsed = st.elapsed + (playing ? age : 0);
    const rem = st.remaining - (playing ? age : 0);
    const el = fmtTime(elapsed), re = '−' + fmtTime(Math.max(0, rem), Math.ceil);
    const txt = s.timerMode === 'elapsed' ? el : s.timerMode === 'remaining' ? re : `${el}  ${re}`;
    const warn = rem <= 10 && (elapsed > 0 || st.phase !== 'paused');
    if (txt !== sh.timer || warn !== sh.warn) {
      sh.timer = txt; sh.warn = warn;
      e.ptimer.textContent = txt;
      e.ptimer.classList.toggle('warn', warn);
    }
    const cd = st.phase === 'countdown' ? Math.max(1, Math.ceil(st.countLeft - age)) : 0;
    if (cd !== sh.cd) { sh.cd = cd; e.pcount.hidden = !cd; e.pcount.textContent = cd || ''; }
  }

  // Trascinando il testo si sposta il punto di lettura sull'iPad. Il tocco non fa nulla:
  // play e pausa solo dal tasto apposito.
  bindPreview() {
    const p = this.el.preview;
    let lastSent = 0;
    p.addEventListener('pointerdown', e => {
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
      if (!d.moved || this.maxOffset <= 0) return;
      this.send('seek', this.offset / this.maxOffset);
      this.status = { ...this.status, progress: this.offset / this.maxOffset };
      this.statusAt = performance.now();
    };
    p.addEventListener('pointerup', end);
    p.addEventListener('pointercancel', end);
  }

  async lockScreen() {
    try { this.wake = await navigator.wakeLock?.request('screen'); } catch {}
  }
}
