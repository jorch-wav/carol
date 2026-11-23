// XY pad: play the voice with a finger. Across = SYRINX TENSION (mostly pitch), up = AIR PRESSURE (louder,
// brighter). Touching it sings the current call if no key is held; letting go puts both knobs back where they were.
// Hidden behind the play bar's XY button; its expand button makes it fill the play area.
import { icon } from './icons.js';

export class XYPad {
  constructor(app) {
    this.app = app;
    this.el = document.getElementById('xy');
    this.cv = this.el.querySelector('canvas');
    this.ctx = this.cv.getContext('2d');
    this.touch = null; this.trail = [];
    this.el.querySelector('.xy-exp').onclick = () => this.expand(!document.body.classList.contains('xy-full'));
    this.el.querySelector('.xy-exp').innerHTML = icon('expand');
    const down = (e) => {
      e.preventDefault(); try { this.cv.setPointerCapture(e.pointerId); } catch {}
      const k = this.knobs(); if (!k) return;
      this.touch = { id: e.pointerId, saved: { tension: k.tension.u, pressure: k.pressure.u }, sang: false };
      if (this.app.held.size === 0) { this.app.press('xy', this.app.homeNote(), 0.85, true); this.touch.sang = true; }
      this.move(e);
    };
    const up = (e) => {
      if (!this.touch || e.pointerId !== this.touch.id) return;
      const k = this.knobs(), t = this.touch; this.touch = null;
      if (t.sang) this.app.release('xy');
      if (k) { k.tension.setU(t.saved.tension, true); k.pressure.setU(t.saved.pressure, true); }   // spring back
      this.draw();
    };
    this.cv.addEventListener('pointerdown', down);
    this.cv.addEventListener('pointermove', (e) => this.touch && e.pointerId === this.touch.id && this.move(e));
    this.cv.addEventListener('pointerup', up); this.cv.addEventListener('pointercancel', up);
    new ResizeObserver(() => this.size()).observe(this.el);
  }
  knobs() { const k = this.app.knobs; return k.tension && k.pressure ? { tension: k.tension, pressure: k.pressure } : null; }
  show(on) {
    if (on && this.app.playbar.tab !== 'keys') this.app.playbar.setTab('keys');
    if (on) this.app.playbar.open(true);
    document.body.classList.toggle('xy-on', on);
    if (!on) this.expand(false);
    document.getElementById('xyBtn').classList.toggle('on', on);
    try { localStorage.setItem('carol-xy', on ? '1' : '0'); } catch {}
    requestAnimationFrame(() => { this.size(); this.app.playbar.renderKeys(); });
  }
  expand(on) {
    document.body.classList.toggle('xy-full', on);
    this.el.querySelector('.xy-exp').innerHTML = icon(on ? 'shrink' : 'expand');
    requestAnimationFrame(() => { this.size(); this.app.playbar.renderKeys(); });
  }
  size() {
    const r = this.cv.getBoundingClientRect(), d = Math.min(2, devicePixelRatio || 1);
    if (r.width < 2) return;
    this.cv.width = r.width * d; this.cv.height = r.height * d; this.dpr = d; this.draw();
  }
  move(e) {
    const r = this.cv.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y = Math.min(1, Math.max(0, 1 - (e.clientY - r.top) / r.height));
    const k = this.knobs(); if (!k) return;
    k.tension.setU(x, true); k.pressure.setU(y, true);
    this.trail.push([x, y, performance.now()]); if (this.trail.length > 40) this.trail.shift();
    this.draw();
  }
  draw() {
    const c = this.ctx, W = this.cv.width, H = this.cv.height, d = this.dpr || 1, k = this.knobs();
    if (!W) return;
    c.clearRect(0, 0, W, H);
    c.strokeStyle = 'rgba(241,236,226,.08)'; c.lineWidth = d;
    for (let i = 1; i < 4; i++) { c.beginPath(); c.moveTo(W * i / 4, 0); c.lineTo(W * i / 4, H); c.moveTo(0, H * i / 4); c.lineTo(W, H * i / 4); c.stroke(); }
    c.font = `700 ${Math.round(10 * d)}px CarolLabel, sans-serif`; c.fillStyle = 'rgba(241,236,226,.45)';
    c.textBaseline = 'bottom'; c.fillText('SYRINX TENSION (PITCH)', 8 * d, H - 6 * d);
    c.save(); c.translate(W - 8 * d, H - 8 * d); c.rotate(-Math.PI / 2); c.textBaseline = 'bottom'; c.fillText('AIR PRESSURE', 0, 0); c.restore();
    if (!k) return;
    // the bird's own settings: a quiet cross
    const bx = (k.tension.birdU ?? k.tension.u) * W, by = (1 - (k.pressure.birdU ?? k.pressure.u)) * H;
    c.strokeStyle = 'rgba(242,169,59,.35)'; c.beginPath(); c.moveTo(bx - 8 * d, by); c.lineTo(bx + 8 * d, by); c.moveTo(bx, by - 8 * d); c.lineTo(bx, by + 8 * d); c.stroke();
    // the finger and its trail
    const now = performance.now();
    this.trail = this.trail.filter((p) => now - p[2] < 900);
    this.trail.forEach((p, i) => { c.fillStyle = `rgba(242,169,59,${0.06 + 0.3 * i / this.trail.length})`; c.beginPath(); c.arc(p[0] * W, (1 - p[1]) * H, 5 * d, 0, 6.283); c.fill(); });
    const x = k.tension.u * W, y = (1 - k.pressure.u) * H;
    c.fillStyle = this.touch ? '#f2a93b' : 'rgba(242,169,59,.5)';
    c.beginPath(); c.arc(x, y, (this.touch ? 13 : 8) * d, 0, 6.283); c.fill();
  }
}
