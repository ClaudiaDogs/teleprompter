// Il prompter: scorrimento, linea guida, timer, conto alla rovescia, comandi.
//
// Coordinate: tutto ciò che vede chi legge (testo, guida, timer, countdown) sta dentro #mirror ed è
// disegnato dritto; il ribaltamento è un scale(-1) applicato a #mirror. `offset` sono i pixel di testo
// già passati sotto la linea guida: 0 = prima riga sulla guida, maxOffset = ultima riga sulla guida.
import { settings, FONTS } from './settings.js';
import { db } from './db.js';
import { h, clamp, toast, fmtTime, estimateSeconds } from './util.js';
import { buildPanel } from './panel.js';

const BAR_HIDE_MS = 2500;
const DRAG_THRESHOLD = 8;

export class Prompter {
  constructor({ onClose }) {
    this.onClose = onClose;
    const q = id => document.getElementById(id);
    this.el = {
      view: q('view-prompter'), stage: q('stage'), mirror: q('mirror'), viewport: q('viewport'),
      clip: q('clip'), text: q('text'), guide: q('guide'), timer: q('timer'), countdown: q('countdown'),
      bar: q('opbar'), play: q('op-play'), speed: q('op-speed'), time: q('op-time'), progress: q('op-progress'),
      flipH: q('op-flipH'), flipV: q('op-flipV'), settingsBtn: q('op-settings'), fullscreen: q('op-fullscreen'),
      panel: q('panel'), panelBody: q('panel-body'),
    };
    this.isOpen = false;
    this.phase = 'paused'; // 'paused' | 'countdown' | 'playing'
    this.offset = 0;
    this.maxOffset = 0;
    this.linePx = 1;
    this.padTop = 0;
    this.elapsed = 0;       // secondi di lettura (esclusi pause e conto alla rovescia)
    this.countLeft = 0;
    this.runDuration = 60;  // durata obiettivo di questa lettura (modalità durata)
    this.ptr = null;
    this.dragging = false;
    this.anim = null;
    this.seeking = false;
    this.panelOpen = false;
    this.last = 0;
    this.shown = {};
    this.statusSubs = new Set();
    this.lastStatus = 0;
    this.follower = null;   // secondo schermo: segue un iPad invece di scorrere da solo
    this.cfgCache = null;
    this.extraPanel = [];

    this.loop = this.loop.bind(this);
    this.onKey = this.onKey.bind(this);
    this.bindStage();
    this.bindBar();
    this.refreshPanel = () => {};
    settings.subscribe(() => { if (this.isOpen && !this.follower) { this.applyStyle(); this.refreshPanel(); } });
    new ResizeObserver(() => {
      this.cfgCache = null;
      if (this.isOpen) { this.layout(); this.render(true); }
    }).observe(this.el.clip);
    document.addEventListener('visibilitychange', () => {
      if (this.isOpen && document.visibilityState === 'visible') this.lockScreen();
    });
  }

  // ---------- apertura e chiusura ----------

  // Sezioni del pannello aggiunte da fuori (per esempio il collegamento con iPhone e secondo schermo).
  addPanelSection(section) { this.extraPanel.push(section); }

  open(script, { follow = null } = {}) {
    if (!this.panelBuilt) {
      this.panelBuilt = true;
      this.refreshPanel = buildPanel(this.el.panelBody, [...this.panelSchema(), ...this.extraPanel], settings);
    }
    this.follower = follow;
    this.cfgCache = null;
    this.el.view.classList.toggle('follower', !!follow);
    this.script = script;
    this.renderText(script.text);
    this.isOpen = true;
    this.phase = 'paused';
    this.offset = 0;
    this.maxOffset = 0;
    this.elapsed = 0;
    this.anim = null;
    this.runDuration = this.scriptDuration();
    this.shown = {};
    this.setPanel(false);
    this.applyStyle();
    this.refreshPanel();
    this.updatePlayButton();
    this.updateFullscreenButton();
    this.showBar();
    requestAnimationFrame(() => this.updateBarScrollHint());
    document.addEventListener('keydown', this.onKey);
    this.lockScreen();
    this.last = performance.now();
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(this.loop);
  }

  close() {
    this.pause();
    this.isOpen = false;
    this.follower = null;
    this.cfgCache = null;
    this.emitStatus();
    cancelAnimationFrame(this.raf);
    clearTimeout(this.barTimer);
    document.removeEventListener('keydown', this.onKey);
    if (Prompter.fsElement()) (document.exitFullscreen || document.webkitExitFullscreen)?.call(document)?.catch?.(() => {});
    this.releaseScreen();
    this.onClose();
  }

  renderText(text) {
    const frag = document.createDocumentFragment();
    for (const line of text.replace(/\r\n?/g, '\n').split('\n')) {
      frag.append(h('p', null, line.trim() === '' ? ' ' : line));
    }
    this.el.text.replaceChildren(frag);
  }

  scriptDuration() {
    return this.script.duration || estimateSeconds(this.script.text) || 60;
  }

  // ---------- aspetto e misure ----------

  // Impostazioni in uso: le proprie oppure, sul secondo schermo, quelle dell'iPad riscalate
  // sulla larghezza di questo schermo (così le righe vanno a capo negli stessi punti).
  cfg() {
    const f = this.follower;
    if (!f) return settings.get();
    if (this.cfgCache) return this.cfgCache;
    const hs = f.settings || settings.get();
    const k = f.hostW > 0 ? this.el.stage.clientWidth / f.hostW : 1;
    return this.cfgCache = { ...hs, fontSize: hs.fontSize * k, timerSize: hs.timerSize * k, flipH: f.flipH, flipV: f.flipV };
  }

  // Secondo schermo: nuove impostazioni o nuova posizione dall'iPad.
  updateFollow({ settings: hs, status } = {}) {
    const f = this.follower;
    if (!f) return;
    let restyle = false;
    if (hs) { f.settings = hs; restyle = true; }
    if (status) {
      f.status = status;
      f.at = performance.now();
      if (status.stageW && status.stageW !== f.hostW) { f.hostW = status.stageW; restyle = true; }
    }
    if (restyle && this.isOpen) { this.cfgCache = null; this.applyStyle(); }
  }

  followStep(dt) {
    const f = this.follower, st = f.status;
    if (!st) return;
    const age = (performance.now() - f.at) / 1000;
    const playing = st.phase === 'playing';
    const v = playing ? st.velocity * this.maxOffset : 0;
    const target = clamp(st.progress * this.maxOffset + v * age, 0, this.maxOffset);
    const diff = target - this.offset;
    // salti grandi (ricomincia, avanti, barra) subito; il resto con avanzamento continuo e piccola correzione
    this.offset = Math.abs(diff) > this.linePx * 4 ? target : clamp(this.offset + v * dt + diff * Math.min(1, dt * 4), 0, this.maxOffset);
    this.phase = st.phase;
    this.elapsed = st.elapsed + (playing ? age : 0);
    this.countLeft = st.countLeft - (st.phase === 'countdown' ? age : 0);
  }

  applyStyle() {
    const s = this.cfg(), e = this.el;
    e.mirror.style.transform = `scale(${s.flipH ? -1 : 1}, ${s.flipV ? -1 : 1})`;
    Object.assign(e.viewport.style, {
      left: s.marginLeft + '%', right: s.marginRight + '%', top: s.marginTop + '%', bottom: s.marginBottom + '%',
    });
    const arrowPx = Math.round(s.fontSize * 0.45);
    const arrows = s.guideVisible && s.guideStyle === 'arrows';
    Object.assign(e.text.style, {
      fontSize: s.fontSize + 'px', fontFamily: s.fontFamily, fontWeight: s.bold ? '700' : '400',
      lineHeight: String(s.lineHeight), color: s.textColor, textAlign: s.align,
      padding: arrows ? `0 ${arrowPx * 1.1 + 12}px` : '0',
    });
    e.guide.hidden = !s.guideVisible;
    e.guide.dataset.style = s.guideStyle;
    e.guide.style.top = s.guidePos + '%';
    e.guide.style.opacity = s.guideOpacity;
    e.guide.style.setProperty('--gc', s.guideColor);
    e.guide.style.setProperty('--band', s.fontSize * s.lineHeight + 'px');
    e.guide.style.setProperty('--arrow', arrowPx + 'px');
    e.timer.hidden = !s.timerVisible;
    Object.assign(e.timer.style, {
      left: s.timerX + '%', top: s.timerY + '%', fontSize: s.timerSize + 'px', opacity: s.timerOpacity,
    });
    e.panel.dataset.side = s.panelSide;
    e.flipH.classList.toggle('on', s.flipH);
    e.flipV.classList.toggle('on', s.flipV);
    this.layout();
    this.render(true);
  }

  // Ricalcola le misure mantenendo il punto di lettura (in percentuale).
  layout() {
    const s = this.cfg();
    const vpH = this.el.clip.clientHeight;
    const progress = this.maxOffset > 0 ? this.offset / this.maxOffset : 0;
    this.linePx = s.fontSize * s.lineHeight;
    this.padTop = (s.guidePos / 100) * vpH - this.linePx / 2;
    this.maxOffset = Math.max(0, this.el.text.offsetHeight - this.linePx);
    this.offset = clamp(progress * this.maxOffset, 0, this.maxOffset);
    if (this.anim) this.anim.to = clamp(this.anim.to, 0, this.maxOffset);
  }

  // ---------- ciclo di animazione ----------

  loop(now) {
    if (!this.isOpen) return;
    this.raf = requestAnimationFrame(this.loop);
    const dt = clamp((now - this.last) / 1000, 0, 0.1);
    this.last = now;

    if (this.follower) { this.followStep(dt); this.render(); return; }

    if (this.phase === 'countdown') {
      this.countLeft -= dt;
      if (this.countLeft <= 0) this.setPhase('playing');
    } else if (this.phase === 'playing') {
      this.elapsed += dt;
    }

    if (this.anim) {
      const t = clamp((now - this.anim.t0) / this.anim.dur, 0, 1);
      const k = 1 - Math.pow(1 - t, 3);
      this.offset = this.anim.from + (this.anim.to - this.anim.from) * k;
      if (t >= 1) this.anim = null;
    } else if (this.phase === 'playing' && !this.dragging) {
      this.offset += this.pxPerSec() * dt;
      if (this.offset >= this.maxOffset) {
        this.offset = this.maxOffset;
        this.setPhase('paused');
        toast('Fine dello script');
      }
    }
    this.render();
    if (now - this.lastStatus > 50) { this.lastStatus = now; this.emitStatus(); }
  }

  pxPerSec() {
    const s = this.cfg();
    if (s.scrollMode === 'duration') {
      const left = Math.max(0.5, this.runDuration - this.elapsed);
      return Math.max(0, this.maxOffset - this.offset) / left;
    }
    return (s.speed / 60) * this.linePx;
  }

  remaining() {
    const f = this.follower;
    if (f) {
      if (!f.status) return 0;
      return f.status.remaining - (f.status.phase === 'playing' ? (performance.now() - f.at) / 1000 : 0);
    }
    const s = this.cfg();
    if (s.scrollMode === 'duration') return this.runDuration - this.elapsed;
    const v = (s.speed / 60) * this.linePx;
    return v > 0 ? Math.max(0, this.maxOffset - this.offset) / v : 0;
  }

  render(force = false) {
    const e = this.el, s = this.cfg(), sh = this.shown;
    const dpr = window.devicePixelRatio || 1;
    const y = Math.round((this.padTop - this.offset) * dpr) / dpr;
    if (force || y !== sh.y) { sh.y = y; e.text.style.transform = `translate3d(0,${y}px,0)`; }

    // timer
    const rem = this.remaining();
    const el = fmtTime(this.elapsed);
    const re = '−' + fmtTime(Math.max(0, rem), Math.ceil);
    const txt = s.timerMode === 'elapsed' ? el : s.timerMode === 'remaining' ? re : `${el}  ${re}`;
    const warn = rem <= 10 && (this.elapsed > 0 || this.phase !== 'paused');
    if (force || txt !== sh.timer || warn !== sh.warn) {
      sh.timer = txt; sh.warn = warn;
      e.timer.textContent = txt;
      e.timer.classList.toggle('warn', warn);
      e.time.textContent = `${el} / ${re}`;
      e.time.classList.toggle('warn', warn);
    }

    // conto alla rovescia
    const cd = this.phase === 'countdown' ? Math.max(1, Math.ceil(this.countLeft)) : 0;
    if (force || cd !== sh.cd) {
      sh.cd = cd;
      e.countdown.hidden = !cd;
      e.countdown.textContent = cd || '';
    }

    // velocità e avanzamento per l'operatore
    const sp = s.scrollMode === 'duration' ? 'durata ' + fmtTime(this.runDuration) : s.speed + ' righe/min';
    if (force || sp !== sh.sp) { sh.sp = sp; e.speed.textContent = sp; }
    if (!this.seeking) {
      const p = this.maxOffset > 0 ? Math.round((this.offset / this.maxOffset) * 1000) : 0;
      if (force || p !== sh.p) { sh.p = p; e.progress.value = p; }
    }
  }

  // ---------- comandi ----------

  command(name, arg) {
    const s = this.cfg();
    if (this.follower) {
      // il secondo schermo ha solo ribaltamenti propri e chiusura
      if (name === 'flipH' || name === 'flipV') {
        this.follower[name] = !this.follower[name];
        this.follower.onFlip?.(this.follower);
        this.cfgCache = null;
        this.applyStyle();
      } else if (name === 'fullscreen') this.toggleFullscreen();
      else if (name === 'close') { this.close(); return; }
      this.showBar();
      return;
    }
    switch (name) {
      case 'fontSmaller': this.adjustFont(-1); break;
      case 'fontBigger': this.adjustFont(+1); break;
      case 'fullscreen': this.toggleFullscreen(); break;
      case 'toggle': this.toggle(); break;
      case 'play': if (this.phase === 'paused') this.play(); break;
      case 'pause': this.pause(); break;
      case 'faster': this.adjustSpeed(+1); break;
      case 'slower': this.adjustSpeed(-1); break;
      case 'back': this.jump(-1); break;
      case 'forward': this.jump(+1); break;
      case 'restart': this.restart(); break;
      case 'flipH': settings.set({ flipH: !s.flipH }); break;
      case 'flipV': settings.set({ flipV: !s.flipV }); break;
      case 'settings': this.setPanel(!this.panelOpen); break;
      case 'seek': this.seek(arg); break;
      case 'close': if (this.panelOpen) this.setPanel(false); else this.close(); return;
    }
    this.showBar();
  }

  toggle() { this.phase === 'paused' ? this.play() : this.pause(); }

  play() {
    if (this.maxOffset > 0 && this.offset >= this.maxOffset - 0.5) {
      this.offset = 0;
      this.elapsed = 0;
      this.runDuration = this.scriptDuration();
    }
    const s = this.cfg();
    if (s.countdown > 0 && (this.elapsed === 0 || s.countdownOnResume)) {
      this.countLeft = s.countdown;
      this.setPhase('countdown');
    } else {
      this.setPhase('playing');
    }
    this.lockScreen();
  }

  pause() { if (this.phase !== 'paused') this.setPhase('paused'); }

  setPhase(p) {
    this.phase = p;
    this.updatePlayButton();
    this.render(true);
    this.showBar();
    this.emitStatus();
  }

  restart() {
    this.pause();
    this.anim = null;
    this.offset = 0;
    this.elapsed = 0;
    this.runDuration = this.scriptDuration();
    this.render(true);
    this.emitStatus();
    toast('Dall\'inizio');
  }

  jump(dir) {
    const s = this.cfg();
    const from = this.offset;
    const base = this.anim ? this.anim.to : this.offset;
    const to = clamp(base + dir * s.jumpLines * this.linePx, 0, this.maxOffset);
    this.anim = { from, to, t0: performance.now(), dur: 220 };
  }

  seek(frac) {
    this.anim = null;
    this.offset = clamp(frac, 0, 1) * this.maxOffset;
    this.render(true);
    this.emitStatus();
  }

  adjustSpeed(dir) {
    const s = this.cfg();
    if (s.scrollMode === 'duration') {
      // In modalità durata, + e − accorciano o allungano la lettura in corso di 5 s (non si salva).
      this.runDuration = Math.max(Math.ceil(this.elapsed) + 5, this.runDuration - dir * 5);
      toast('Durata ' + fmtTime(this.runDuration));
    } else {
      const step = Math.max(1, Math.round(s.speed * 0.08));
      const v = clamp(s.speed + dir * step, 1, 200);
      settings.set({ speed: v });
      toast(v + ' righe/min');
    }
    this.render(true);
  }

  adjustFont(dir) {
    const s = this.cfg();
    const step = Math.max(2, Math.round(s.fontSize * 0.08));
    const v = clamp(Math.round(s.fontSize + dir * step), 16, 220);
    settings.set({ fontSize: v });
    toast('Testo ' + v + ' px');
  }

  // ---------- schermo intero ----------

  static fsElement() { return document.fullscreenElement || document.webkitFullscreenElement || null; }
  static fsSupported() {
    const el = document.documentElement;
    return !!(el.requestFullscreen || el.webkitRequestFullscreen) && (document.fullscreenEnabled ?? document.webkitFullscreenEnabled ?? true);
  }
  static standalone() { return matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches || navigator.standalone === true; }

  async toggleFullscreen() {
    const d = document, el = d.documentElement;
    if (Prompter.fsElement()) {
      await (d.exitFullscreen || d.webkitExitFullscreen)?.call(d)?.catch?.(() => {});
      return;
    }
    if (Prompter.fsSupported()) {
      try { await (el.requestFullscreen || el.webkitRequestFullscreen).call(el, { navigationUI: 'hide' }); return; }
      catch { /* rifiutato: si spiega l'alternativa */ }
    }
    toast(Prompter.standalone()
      ? 'L\'app è già a tutto schermo: la barra sparisce da sola durante lo scorrimento'
      : 'Questo browser non permette lo schermo intero. Aggiungi l\'app alla schermata Home (Condividi › Aggiungi alla schermata Home): si apre a tutto schermo.', 6000);
  }

  updateFullscreenButton() {
    const fs = !!Prompter.fsElement();
    this.el.fullscreen.classList.toggle('on', fs);
    this.el.fullscreen.setAttribute('aria-label', fs ? 'Esci dallo schermo intero' : 'Schermo intero');
    // nell'app installata senza schermo intero del browser il tasto non serve
    this.el.fullscreen.hidden = !fs && !Prompter.fsSupported() && Prompter.standalone();
  }

  // Sfumatura ai lati della barra quando ci sono altri tasti da scorrere.
  updateBarScrollHint() {
    const r = this.el.bar.querySelector('.op-row');
    this.el.bar.classList.toggle('more-left', r.scrollLeft > 2);
    this.el.bar.classList.toggle('more-right', r.scrollLeft + r.clientWidth < r.scrollWidth - 2);
  }

  updatePlayButton() {
    const playing = this.phase !== 'paused';
    this.el.play.classList.toggle('playing', playing);
    this.el.play.setAttribute('aria-label', playing ? 'Pausa' : 'Play');
  }

  // ---------- barra, pannello, tastiera ----------

  showBar() {
    const bar = this.el.bar;
    bar.classList.remove('hidden');
    clearTimeout(this.barTimer);
    if (this.phase !== 'paused' && !this.panelOpen && !this.seeking) {
      this.barTimer = setTimeout(() => bar.classList.add('hidden'), BAR_HIDE_MS);
    }
  }

  setPanel(open) {
    this.panelOpen = open;
    this.el.panel.hidden = !open;
    this.el.settingsBtn.classList.toggle('on', open);
    if (open) {
      this.el.panel.style.bottom = this.el.bar.offsetHeight + 'px';
      this.refreshPanel();
    }
    this.showBar();
  }

  bindBar() {
    const e = this.el;
    e.bar.addEventListener('click', ev => {
      const b = ev.target.closest('[data-cmd]');
      if (!b) return;
      this.command(b.dataset.cmd);
      b.blur();
    });
    e.progress.addEventListener('input', () => {
      this.seeking = true;
      this.seek(e.progress.value / 1000);
      this.showBar();
    });
    e.progress.addEventListener('change', () => { this.seeking = false; this.showBar(); });
    const row = e.bar.querySelector('.op-row');
    row.addEventListener('scroll', () => { this.updateBarScrollHint(); this.showBar(); }, { passive: true });
    new ResizeObserver(() => this.updateBarScrollHint()).observe(row);
    for (const ev of ['fullscreenchange', 'webkitfullscreenchange']) {
      document.addEventListener(ev, () => this.updateFullscreenButton());
    }
    document.getElementById('panel-close').addEventListener('click', () => this.setPanel(false));
    document.getElementById('panel-reset').addEventListener('click', () => {
      if (confirm('Ripristinare tutte le impostazioni predefinite?')) { settings.reset(); toast('Impostazioni ripristinate'); }
    });
  }

  onKey(e) {
    if (e.target.closest?.('input:not([type=range]):not([type=checkbox]), textarea, select')) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const map = {
      ' ': 'toggle', Enter: 'toggle', ArrowUp: 'faster', ArrowDown: 'slower',
      ArrowLeft: 'back', PageUp: 'back', ArrowRight: 'forward', PageDown: 'forward',
      r: 'restart', R: 'restart', h: 'flipH', H: 'flipH', v: 'flipV', V: 'flipV', Escape: 'close',
      '+': 'fontBigger', '=': 'fontBigger', '-': 'fontSmaller', f: 'fullscreen', F: 'fullscreen',
    };
    // con lo schermo intero attivo Esc lo chiude già il browser
    if (e.key === 'Escape' && Prompter.fsElement()) return;
    const c = map[e.key];
    if (!c) return;
    e.preventDefault();
    if (e.repeat && !['faster', 'slower', 'back', 'forward'].includes(c)) return;
    this.command(c);
  }

  // ---------- tocco e trascinamento ----------

  bindStage() {
    const st = this.el.stage;
    st.addEventListener('pointerdown', e => {
      if (e.button > 0 || this.ptr) return;
      if (this.follower) { this.showBar(); return; }
      const handle = e.target.closest('[data-drag]');
      this.ptr = { id: e.pointerId, x: e.clientX, y: e.clientY, kind: handle ? handle.dataset.drag : 'text',
        moved: !!handle, start: this.offset };
      try { st.setPointerCapture(e.pointerId); } catch { /* puntatore già rilasciato */ }
    });
    st.addEventListener('pointermove', e => {
      const p = this.ptr;
      if (!p || p.id !== e.pointerId) { if (e.pointerType === 'mouse') this.showBar(); return; }
      const s = this.cfg();
      if (p.kind === 'text') {
        if (!p.moved) {
          if (Math.abs(e.clientY - p.y) < DRAG_THRESHOLD && Math.abs(e.clientX - p.x) < DRAG_THRESHOLD) return;
          Object.assign(p, { moved: true, y: e.clientY, start: this.offset });
          this.dragging = true;
          this.anim = null;
          return;
        }
        // il testo segue il dito anche a schermo ribaltato
        const dy = e.clientY - p.y;
        this.offset = clamp(p.start - dy * (s.flipV ? -1 : 1), 0, this.maxOffset);
        this.render();
      } else if (p.kind === 'guide') {
        const r = this.el.viewport.getBoundingClientRect();
        let f = (e.clientY - r.top) / r.height;
        if (s.flipV) f = 1 - f;
        settings.set({ guidePos: Math.round(clamp(f * 100, 3, 97) * 2) / 2 });
      } else if (p.kind === 'timer') {
        const r = st.getBoundingClientRect();
        let fx = (e.clientX - r.left) / r.width, fy = (e.clientY - r.top) / r.height;
        if (s.flipH) fx = 1 - fx;
        if (s.flipV) fy = 1 - fy;
        settings.set({ timerX: Math.round(clamp(fx * 100, 2, 98)), timerY: Math.round(clamp(fy * 100, 2, 98)) });
      }
    });
    const end = e => {
      const p = this.ptr;
      if (!p || p.id !== e.pointerId) return;
      this.ptr = null;
      this.dragging = false;
      if (!p.moved && e.type === 'pointerup') this.toggle();
    };
    st.addEventListener('pointerup', end);
    st.addEventListener('pointercancel', end);
    // rotellina del mouse (computer)
    st.addEventListener('wheel', e => {
      e.preventDefault();
      if (this.follower) return;
      this.anim = null;
      const dir = this.cfg().flipV ? -1 : 1;
      this.offset = clamp(this.offset + e.deltaY * dir, 0, this.maxOffset);
      this.render();
    }, { passive: false });
  }

  // ---------- pannello impostazioni ----------

  panelSchema() {
    const pct = v => v + '%';
    return [
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
        { type: 'segmented', key: 'scrollMode', label: 'Modalità', options: [['speed', 'Velocità'], ['duration', 'Durata']] },
        { type: 'range', key: 'speed', label: 'Velocità', min: 1, max: 200, step: 1, fmt: v => v + ' righe/min',
          show: s => s.scrollMode === 'speed' },
        { type: 'custom', label: 'Durata di questo script', show: s => s.scrollMode === 'duration',
          render: row => this.durationControl(row) },
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
      { title: 'Pannello', items: [
        { type: 'segmented', key: 'panelSide', label: 'Lato', options: [['left', 'Sinistra'], ['right', 'Destra']] },
      ] },
    ];
  }

  durationControl(row) {
    const box = h('div', 'dur');
    const min = h('input'), sec = h('input');
    for (const [inp, max] of [[min, 599], [sec, 59]]) Object.assign(inp, { type: 'number', min: 0, max, inputMode: 'numeric' });
    const est = h('button', 'btn small', 'Stima');
    est.type = 'button';
    const note = h('div', 'pnote');
    box.append(min, h('span', null, 'min'), sec, h('span', null, 's'), est);
    row.append(box, note);

    const save = async v => {
      if (!this.script) return;
      this.script.duration = v;
      this.script.updatedAt = Date.now();
      this.runDuration = this.scriptDuration();
      this.render(true);
      await db.put(this.script);
    };
    const read = () => {
      if (min.value === '' && sec.value === '') return null;
      const v = (parseInt(min.value, 10) || 0) * 60 + (parseInt(sec.value, 10) || 0);
      return v > 0 ? v : null;
    };
    min.addEventListener('change', () => save(read()));
    sec.addEventListener('change', () => save(read()));
    est.addEventListener('click', () => { save(null); fill(); });

    const fill = () => {
      if (!this.script) return;
      const d = this.script.duration, e = estimateSeconds(this.script.text);
      min.value = d == null ? '' : Math.floor(d / 60);
      sec.value = d == null ? '' : d % 60;
      min.placeholder = Math.floor(e / 60);
      sec.placeholder = String(e % 60).padStart(2, '0');
      note.textContent = d == null
        ? `Stima a 150 parole/min: ${fmtTime(e)}. Scrivi una durata per fissarla.`
        : `Salvata con lo script. Durante la lettura + e − tolgono o aggiungono 5 s.`;
    };
    return fill;
  }

  // ---------- schermo sempre acceso ----------

  async lockScreen() {
    if (!('wakeLock' in navigator) || this.wake || document.visibilityState !== 'visible') return;
    try {
      this.wake = await navigator.wakeLock.request('screen');
      this.wake.addEventListener('release', () => { this.wake = null; });
    } catch { /* non disponibile: tenere il blocco automatico su «Mai» */ }
  }

  releaseScreen() {
    this.wake?.release().catch(() => {});
    this.wake = null;
  }

  // ---------- stato per telecomando e secondo schermo ----------

  onStatus(fn) { this.statusSubs.add(fn); return () => this.statusSubs.delete(fn); }

  status() {
    if (!this.isOpen || this.follower) return { open: false };
    const s = this.cfg();
    const moving = this.phase === 'playing' && !this.dragging && !this.anim && this.maxOffset > 0;
    return {
      open: true, scriptId: this.script.id, title: this.script.title, phase: this.phase,
      progress: this.maxOffset > 0 ? this.offset / this.maxOffset : 0,
      velocity: moving ? this.pxPerSec() / this.maxOffset : 0, // frazione di script al secondo
      elapsed: this.elapsed, remaining: this.remaining(), countLeft: this.countLeft,
      speedLabel: s.scrollMode === 'duration' ? 'durata ' + fmtTime(this.runDuration) : s.speed + ' righe/min',
      flipH: s.flipH, flipV: s.flipV, stageW: this.el.stage.clientWidth,
    };
  }

  emitStatus() {
    if (!this.statusSubs.size) return;
    const st = this.status();
    this.statusSubs.forEach(f => f(st));
  }
}
