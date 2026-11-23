// Play bar: on-screen keys, call pads, scale picker, octave.
import { icon } from './icons.js';
import { SCALES, NOTE_NAMES, noteName, scalePCs, inScale } from './scales.js';

const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export class PlayBar {
  constructor(app) {
    this.app = app;
    this.el = document.getElementById('playbar');
    this.keysEl = document.getElementById('keys');
    this.padsEl = document.getElementById('pads');
    this.tab = 'keys';
    document.getElementById('pbHandle').onclick = () => this.toggle();
    document.querySelectorAll('#pbTabs button').forEach((b) => b.onclick = () => { this.setTab(b.dataset.tab); this.open(true); });
    const st = document.getElementById('scaleType');
    for (const [k, s] of Object.entries(SCALES)) st.add(new Option(s.label, k));
    const sr = document.getElementById('scaleRoot');
    NOTE_NAMES.forEach((n, i) => sr.add(new Option(n, i)));
    st.onchange = () => { app.setScale({ type: st.value }); };
    sr.onchange = () => { app.setScale({ root: Number(sr.value) }); };
    document.getElementById('octDown').onclick = () => app.setOctave(app.octave - 1);
    document.getElementById('octUp').onclick = () => app.setOctave(app.octave + 1);
    new ResizeObserver(() => this.tab === 'keys' && this.renderKeys()).observe(this.keysEl);
    this.setTab('keys');
  }
  toggle() { this.open(!this.el.classList.contains('open')); }
  open(on) { this.el.classList.toggle('open', on); document.body.classList.toggle('pb-open', on); setTimeout(() => this.app.resize(), 280); }
  setTab(t) {
    this.tab = t;
    document.querySelectorAll('#pbTabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === t));
    this.keysEl.classList.toggle('on', t === 'keys'); this.padsEl.classList.toggle('on', t === 'pads');
    document.getElementById('seq').classList.toggle('on', t === 'seq');
    document.getElementById('scene').classList.toggle('on', t === 'scene');
    document.body.classList.toggle('pb-seq', t === 'seq');
    document.body.classList.toggle('pb-scene', t === 'scene');
    if (t === 'keys') this.renderKeys(); else if (t === 'pads') this.renderPads(); else if (t === 'scene') this.app.scene && this.app.scene.render(); else this.app.seq && this.app.seq.render();
  }
  syncScale() {
    const s = this.app.scale;
    document.getElementById('scaleType').value = s.type;
    const sr = document.getElementById('scaleRoot');
    sr.value = s.root; sr.style.display = s.type === 'bird' || s.type === 'chromatic' ? 'none' : '';
    document.getElementById('octVal').textContent = 'OCT ' + (this.app.octave > 0 ? '+' : '') + this.app.octave;
    this.renderKeys();
  }
  renderCall() {
    const c = this.app.currentCall();
    const el = document.getElementById('pbCall'), rnd = this.app.randomCalls;
    el.innerHTML = c ? `<span>KEYS PLAY <b>${rnd ? 'RANDOM' : esc(c.name.toUpperCase())}</b></span><button class="pb-rand${rnd ? ' on' : ''}" title="Random: each key plays a random call" aria-label="Random">${icon('shuffle')}<span class="long"> RANDOM</span></button>` : '';
    const btn = el.querySelector('.pb-rand');
    if (btn) btn.onclick = () => this.app.setRandomCalls(!this.app.randomCalls);
  }
  renderKeys() {
    const el = this.keysEl, app = this.app;
    if (!app.bird) return;
    el.innerHTML = '';
    const W = el.clientWidth || 800;
    const nWhite = Math.max(8, Math.min(22, Math.round(W / 70)));
    const centre = app.keyCentre();
    // start on a C/F-ish white key so the layout looks like a keyboard
    let start = centre - Math.round(nWhite * 12 / 7 / 2);
    while ([1, 3, 6, 8, 10].includes(((start % 12) + 12) % 12)) start--;
    const pcs = scalePCs(app.scale, app.bird);
    const home = app.homeNote();
    const ww = W / nWhite;
    let wi = 0, n = start;
    this.keyEls = new Map();
    while (wi < nWhite) {
      const pc = ((n % 12) + 12) % 12, black = [1, 3, 6, 8, 10].includes(pc);
      const k = document.createElement('div');
      k.className = 'key ' + (black ? 'b' : 'w') + (inScale(n, pcs) ? '' : ' out') + (n === home ? ' home' : '');
      if (black) { k.style.left = (wi * ww - ww * 0.3) + 'px'; k.style.width = (ww * 0.6) + 'px'; }
      else { k.style.left = (wi * ww) + 'px'; k.style.width = ww + 'px'; wi++; }
      if (!black && (pc === 0 || n === home)) k.innerHTML = `<span>${noteName(n)}</span>`;
      const note = n;
      k.addEventListener('pointerdown', (e) => {
        e.preventDefault(); k.setPointerCapture(e.pointerId);
        const r = k.getBoundingClientRect();
        const vel = 0.45 + 0.55 * Math.min(1, (e.clientY - r.top) / r.height);
        k.classList.add('down');
        app.press('touch' + e.pointerId, note, vel, true);
      });
      const up = (e) => { k.classList.remove('down'); app.release('touch' + e.pointerId); };
      k.addEventListener('pointerup', up); k.addEventListener('pointercancel', up);
      el.appendChild(k); this.keyEls.set(n, k);
      n++;
    }
  }
  /** Light a key for hardware input. */
  light(note, on) { const k = this.keyEls && this.keyEls.get(note); if (k) k.classList.toggle('down', on); }
  renderPads() {
    const el = this.padsEl, app = this.app;
    el.innerHTML = '';
    if (!app.bird) return;
    app.bird.calls.forEach((c, i) => {
      const p = document.createElement('button');
      p.className = 'pad' + (i === app.callIdx ? ' sel' : '');
      const dur = (c.f.length * c.hop).toFixed(1);
      p.innerHTML = `<b>${c.name}</b><canvas></canvas><small>${c.kind.toUpperCase()} · ${dur}s · ${noteName(Math.round(69 + 12 * Math.log2(c.ref_hz / 440)))}${c.match ? ' · ' + Math.round(c.match.total) + '%' : ''}</small>`;
      p.addEventListener('pointerdown', (e) => {
        e.preventDefault(); p.setPointerCapture(e.pointerId);
        app.selectCall(i);
        p.classList.add('hit');
        app.playCall('pad' + e.pointerId, i);
      });
      const up = (e) => { p.classList.remove('hit'); app.release('pad' + e.pointerId); };
      p.addEventListener('pointerup', up); p.addEventListener('pointercancel', up);
      el.appendChild(p);
      requestAnimationFrame(() => sparkline(p.querySelector('canvas'), c));
    });
  }
  markPad(i, on) { const p = this.padsEl.children[i]; if (p) p.classList.toggle('hit', on); }
}

/** Pitch contour of a call, thickness = loudness. */
function sparkline(cv, c) {
  const r = cv.getBoundingClientRect(), d = devicePixelRatio || 1;
  cv.width = r.width * d; cv.height = r.height * d;
  const ctx = cv.getContext('2d');
  const lf = c.f.map((f) => Math.log2(Math.max(50, f)));
  const act = lf.filter((_, k) => c.p[k] > 30);
  const lo = Math.min(...act) - 0.1, hi = Math.max(...act) + 0.1;
  ctx.strokeStyle = '#f2a93b'; ctx.lineCap = 'round';
  for (let k = 1; k < lf.length; k++) {
    const a = c.p[k] / 1000; if (a < 0.03) continue;
    ctx.globalAlpha = Math.min(1, 0.3 + a);
    ctx.lineWidth = (1 + a * 3) * d;
    ctx.beginPath();
    ctx.moveTo((k - 1) / lf.length * cv.width, cv.height - (lf[k - 1] - lo) / (hi - lo || 1) * cv.height);
    ctx.lineTo(k / lf.length * cv.width, cv.height - (lf[k] - lo) / (hi - lo || 1) * cv.height);
    ctx.stroke();
  }
}
