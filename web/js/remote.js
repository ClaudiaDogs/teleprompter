// Il telecomando sull'iPhone: comanda l'iPad e ne mostra avanzamento e tempi.
import { h, fmtTime } from './util.js';

export class RemoteView {
  constructor({ onExit }) {
    this.onExit = onExit;
    const q = id => document.getElementById(id);
    this.el = {
      title: q('rm-title'), state: q('rm-state'), msg: q('rm-msg'), library: q('rm-library'), list: q('rm-list'),
      main: q('rm-main'), elapsed: q('rm-elapsed'), remaining: q('rm-remaining'), progress: q('rm-progress'),
      play: q('rm-play'), speed: q('rm-speed'), flipH: q('rm-flipH'), flipV: q('rm-flipV'),
    };
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
    this.setState('connecting', 'collegamento in corso…');
    this.render();
    this.lockScreen();
  }

  close() {
    this.client = null;
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
    const labels = { connected: 'collegato', connecting: 'in collegamento', denied: 'PIN errato', error: 'non collegato' };
    this.el.state.textContent = labels[state] || state;
    this.el.state.dataset.state = state;
    this.el.msg.textContent = state === 'connected' ? '' : msg;
  }

  onMessage(m) {
    if (m.t === 'library') { this.items = m.items || []; this.render(); }
    else if (m.t === 'status') { this.status = m; this.render(); }
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
        : [h('li', 'empty', 'Nessuno script sull\'iPad.')]));
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
