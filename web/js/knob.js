// Chunky Minimoog-style knob: touch/mouse drag, wheel, double-tap = back to the bird's value.
const SVGNS = 'http://www.w3.org/2000/svg';

export function toNorm(p, v) {
  if (p.log) return Math.log(v / p.min) / Math.log(p.max / p.min);
  return (v - p.min) / (p.max - p.min);
}
export function fromNorm(p, u) {
  u = Math.min(1, Math.max(0, u));
  if (p.log) return p.min * Math.pow(p.max / p.min, u);
  return p.min + (p.max - p.min) * u;
}
export function fmt(p, v) {
  if (p.key === 'mode') return ['ONE-SHOT', 'GATE', 'LOOP'][Math.round(v)];
  if (p.unit === 'Hz') return v >= 1000 ? (v / 1000).toFixed(2) + ' kHz' : Math.round(v) + ' Hz';
  if (p.unit === 'st') return (v > 0 ? '+' : '') + v.toFixed(1) + ' st';
  if (p.unit === 'cm') return v.toFixed(1) + ' cm';
  if (p.unit === 'x') return '×' + v.toFixed(2);
  return v.toFixed(2);
}

export class Knob {
  /** p: param def {key,label,min,max,log,unit}; opts: {steps, onChange, onTouch} */
  constructor(p, opts = {}) {
    this.p = p; this.opts = opts;
    this.steps = opts.steps || 0;
    this.u = 0; this.birdU = null;
    const el = this.el = document.createElement('div');
    el.className = 'kn' + (this.steps ? ' switch' : '');
    el.innerHTML = `<div class="val"></div><div class="dial"><svg class="scale" viewBox="0 0 100 100"></svg><div class="skirt"><div class="cap"></div></div></div><label></label>`;
    el.querySelector('label').textContent = p.label;
    if (p.help) el.title = p.help;
    this.cap = el.querySelector('.cap');
    this.valEl = el.querySelector('.val');
    this.svg = el.querySelector('svg');
    this.drawScale();
    const dial = el.querySelector('.dial');
    let start = null, lastTap = 0;
    dial.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      dial.setPointerCapture(e.pointerId);
      const now = performance.now();
      if (now - lastTap < 300) { this.resetToBird(); lastTap = 0; return; }
      lastTap = now;
      start = { y: e.clientY, x: e.clientX, u: this.u };
      el.classList.add('active'); this.showVal();
      opts.onTouch && opts.onTouch(this);
    });
    dial.addEventListener('pointermove', (e) => {
      if (!start) return;
      const d = (start.y - e.clientY) + (e.clientX - start.x) * 0.5;
      const fine = e.shiftKey || e.ctrlKey ? 0.2 : 1;
      this.setU(start.u + d / 200 * fine, true);
    });
    const end = () => { if (start) { start = null; setTimeout(() => el.classList.remove('active'), 600); } };
    dial.addEventListener('pointerup', end); dial.addEventListener('pointercancel', end);
    dial.addEventListener('wheel', (e) => { e.preventDefault(); this.nudge(e.deltaY < 0 ? 1 : -1); }, { passive: false });
  }
  drawScale() {
    const s = this.svg; s.innerHTML = '';
    const n = this.steps || 11;
    for (let i = 0; i < n; i++) {
      const u = n === 1 ? 0 : i / (n - 1);
      const a = (-150 + 300 * u - 90) * Math.PI / 180;
      const r1 = 39, r2 = 43, rt = 49;
      const ln = document.createElementNS(SVGNS, 'line');
      ln.setAttribute('x1', 50 + r1 * Math.cos(a)); ln.setAttribute('y1', 50 + r1 * Math.sin(a));
      ln.setAttribute('x2', 50 + r2 * Math.cos(a)); ln.setAttribute('y2', 50 + r2 * Math.sin(a));
      s.appendChild(ln);
      const t = document.createElementNS(SVGNS, 'text');
      t.setAttribute('x', 50 + rt * Math.cos(a)); t.setAttribute('y', 50 + rt * Math.sin(a));
      t.textContent = this.steps ? (this.opts.stepLabels || [])[i] || i : i;
      s.appendChild(t);
    }
    this.birdDot = document.createElementNS(SVGNS, 'circle');
    this.birdDot.setAttribute('r', 2.6); this.birdDot.setAttribute('class', 'bird');
    this.birdDot.style.display = 'none';
    const tt = document.createElementNS(SVGNS, 'title'); tt.textContent = 'The real bird';
    this.birdDot.appendChild(tt);
    s.appendChild(this.birdDot);
  }
  get value() { return fromNorm(this.p, this.steps ? Math.round(this.u * (this.steps - 1)) / (this.steps - 1) : this.u); }
  setU(u, fire) {
    u = Math.min(1, Math.max(0, u));
    if (this.steps) u = Math.round(u * (this.steps - 1)) / (this.steps - 1);
    if (u === this.u && !fire) return;
    const changed = u !== this.u;
    this.u = u;
    this.cap.style.transform = `rotate(${-150 + 300 * u}deg)`;
    this.el.classList.toggle('changed', this.birdU !== null && Math.abs(u - this.birdU) > 0.004);
    this.showVal();
    if (fire && changed && this.opts.onChange) this.opts.onChange(this.value, this);
  }
  setValue(v, fire = false) { this.setU(toNorm(this.p, v), fire); }
  setBird(v) {
    this.birdU = v === null ? null : toNorm(this.p, v);
    if (this.birdU === null) { this.birdDot.style.display = 'none'; return; }
    const a = (-150 + 300 * this.birdU - 90) * Math.PI / 180;
    this.birdDot.setAttribute('cx', 50 + 35 * Math.cos(a)); this.birdDot.setAttribute('cy', 50 + 35 * Math.sin(a));
    this.birdDot.style.display = '';
  }
  resetToBird() { if (this.birdU !== null) { this.setU(this.birdU, true); this.flash(); } }
  nudge(d) {
    const step = this.steps ? 1 / (this.steps - 1) : 0.01;
    this.setU(this.u + d * step, true);
    this.flash();
  }
  flash() {
    this.el.classList.add('active');
    clearTimeout(this._t); this._t = setTimeout(() => this.el.classList.remove('active'), 900);
  }
  showVal() { this.valEl.textContent = fmt(this.p, this.value); }
}
