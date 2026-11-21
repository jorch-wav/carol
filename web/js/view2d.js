// 2D side cutaway of the shared bird model.
import { PART_INFO, mixHex } from './birdmodel.js';

const LABEL_POS = { airsacs: [-0.6, -2.4], lungs: [-2.6, 1.0], syrinx: [-2.0, 2.0], trachea: [1.9, -0.9], oec: [-2.4, -0.4], beak: [0.6, 1.3], tongue: [1.4, -2.3], sac: [1.8, -1.6] };

export class View2D {
  constructor(canvas) {
    this.cv = canvas; this.ctx = canvas.getContext('2d');
    this.sel = null; this.labels = true; this.rings = [];
    this.style = 0;   // 0 cutaway (translucent), 1 plate (ink & watercolour), 2 field guide (solid + cutaway lens), 3 x-ray
    this.box = null;
    // pinch / wheel zoom and drag to pan, inside the bird panel only; double-tap resets
    this.zoom = 1; this.pan = [0, 0];
    const pts = new Map(); let pinch = null, lastTap = 0;
    canvas.addEventListener('pointerdown', (e) => {
      pts.set(e.pointerId, [e.clientX, e.clientY]);
      if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), z: this.zoom }; }
      const now = performance.now();
      if (pts.size === 1 && now - lastTap < 300) { this.zoom = 1; this.pan = [0, 0]; }
      lastTap = now;
    });
    canvas.addEventListener('pointermove', (e) => {
      const prev = pts.get(e.pointerId); if (!prev) return;
      pts.set(e.pointerId, [e.clientX, e.clientY]);
      if (pts.size === 2 && pinch) {
        const [a, b] = [...pts.values()];
        this.zoom = Math.min(5, Math.max(1, pinch.z * Math.hypot(a[0] - b[0], a[1] - b[1]) / pinch.d));
      } else if (pts.size === 1 && this.zoom > 1) {
        this.pan[0] += (e.clientX - prev[0]) * this.dpr; this.pan[1] += (e.clientY - prev[1]) * this.dpr;
      }
    });
    const up = (e) => { pts.delete(e.pointerId); if (pts.size < 2) pinch = null; if (this.zoom <= 1.01) { this.zoom = 1; this.pan = [0, 0]; } };
    canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('wheel', (e) => { e.preventDefault(); this.zoom = Math.min(5, Math.max(1, this.zoom * (e.deltaY < 0 ? 1.12 : 0.9))); if (this.zoom === 1) this.pan = [0, 0]; }, { passive: false });
  }
  resize() {
    const r = this.cv.getBoundingClientRect(), d = Math.min(2, devicePixelRatio || 1);
    this.cv.width = Math.max(1, r.width * d); this.cv.height = Math.max(1, r.height * d); this.dpr = d;
  }
  fit(parts) {
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (const p of parts) {
      const pts = p.kind === 'ell' ? [[p.c[0] - p.r[0], p.c[1] - p.r[1]], [p.c[0] + p.r[0], p.c[1] + p.r[1]]] : p.kind === 'tube' ? p.pts : [p.base, p.tip];
      for (const q of pts) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]); }
    }
    // keep a stable frame: only grow, shrink slowly
    const b = [x0 - 1.2, x1 + 2.2, y0 - 2.0, y1 + 1.2];
    if (!this.box) this.box = b; else for (let i = 0; i < 4; i++) this.box[i] += (b[i] - this.box[i]) * 0.08;
  }
  draw(model) {
    const { emit } = model;
    this.lastAir = model.air;
    const parts = model.parts.filter((p) => !p.far); // side view: the near side only
    const ctx = this.ctx, W = this.cv.width, H = this.cv.height;
    if (W < 2) return;
    this.fit(parts);
    const [x0, x1, y0, y1] = this.box;
    const s0 = Math.min(W / (x1 - x0), H / (y1 - y0));
    const ox0 = (W - (x1 - x0) * s0) / 2 - x0 * s0, oy0 = (H - (y1 - y0) * s0) / 2 + y1 * s0;
    // zoom about the panel centre, then pan
    const z = this.zoom, s = s0 * z;
    const ox = W / 2 + (ox0 - W / 2) * z + this.pan[0], oy = H / 2 + (oy0 - H / 2) * z + this.pan[1];
    const X = (x) => ox + x * s, Y = (y) => oy - y * s;
    this.tf = { X, Y, s, ox, oy };
    ctx.clearRect(0, 0, W, H);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';

    const skin = parts.filter((p) => p.layer === 0 && !p.wing);
    const inner = parts.filter((p) => p.layer > 0).sort((a, b) => zOf(a) - zOf(b));
    if (this.style) { this.drawStyled(parts, X, Y, s, W, H, emit); return; }
    // soft light behind the bird so dark plumage still reads
    const body = parts.find((p) => p.id === 'body');
    if (body) {
      const g = ctx.createRadialGradient(X(body.c[0] + 1), Y(body.c[1] + 1), 0, X(body.c[0] + 1), Y(body.c[1] + 1), s * 8);
      g.addColorStop(0, 'rgba(242,214,160,.16)'); g.addColorStop(1, 'rgba(242,214,160,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
    // skin silhouette: soft fill
    for (const p of parts.filter((q) => q.layer === 0)) this.shape(p, X, Y, s, p.color, p.wing ? 0.5 : 0.78, null);
    // organs
    for (const p of inner) {
      const hl = this.sel && p.part === this.sel;
      this.shape(p, X, Y, s, p.color, p.alpha ?? 1, hl ? '#ffcf7a' : 'rgba(0,0,0,.5)', hl ? 2.5 : 1);
    }
    // air flowing through the airway (no outlines: soft, bright dots)
    for (const a of model.air || []) {
      if (a.c[2] < -0.05) continue;   // the far bronchus is hidden in the side view
      ctx.fillStyle = a.hiss ? `rgba(255,255,255,${a.a * 0.8})` : `rgba(236,248,255,${a.a})`;
      ctx.strokeStyle = `rgba(20,60,110,${a.a * 0.7})`; ctx.lineWidth = this.dpr;
      ctx.beginPath(); ctx.arc(X(a.c[0]), Y(a.c[1]), Math.max(1.5 * this.dpr, a.r * s), 0, 6.283); ctx.fill(); if (!a.hiss) ctx.stroke();
    }
    // skin outline + wing as a dashed outline, so the cutaway reads
    ctx.save(); ctx.setLineDash([]);
    for (const p of skin) this.shape(p, X, Y, s, null, 0, 'rgba(241,236,226,.8)', 1.6);
    for (const p of parts.filter((q) => q.wing)) { ctx.setLineDash([6 * this.dpr, 5 * this.dpr]); this.shape(p, X, Y, s, null, 0, 'rgba(241,236,226,.8)', 1.6); }
    ctx.restore();

    // sound leaving the beak
    const now = performance.now() / 1000;
    if (emit.level > 0.02 && (!this.lastRing || now - this.lastRing > 0.09)) { this.rings.push({ t: now, a: Math.min(1, emit.level * 1.5) }); this.lastRing = now; }
    this.rings = this.rings.filter((r) => now - r.t < 1.2);
    for (const r of this.rings) {
      const age = now - r.t, rad = (0.5 + age * 6) * s;
      ctx.strokeStyle = `rgba(242,169,59,${(1 - age / 1.2) * r.a})`; ctx.lineWidth = 2 * this.dpr;
      ctx.beginPath(); ctx.arc(X(emit.pos[0]), Y(emit.pos[1]), rad, -0.6, 0.6); ctx.stroke();
    }
    // labels
    if (this.labels) {
      ctx.font = `bold ${Math.round(Math.max(10, Math.min(20, W / this.dpr / 32, s / this.dpr * 0.32)) * this.dpr)}px CarolLabel, sans-serif`; ctx.textBaseline = 'middle';
      const seen = new Set(), placed = [];
      // buttons floating over the bird panel are obstacles too
      const cr = this.cv.getBoundingClientRect(), sc = W / Math.max(1, cr.width);
      for (const el of document.querySelectorAll('.view #viewSeg, .view .view-size')) {
        const r = el.getBoundingClientRect();
        if (r.width && r.right > cr.left && r.left < cr.right && r.bottom > cr.top && r.top < cr.bottom)
          placed.push([(r.left - cr.left) * sc, (r.top - cr.top) * sc, (r.right - cr.left) * sc, (r.bottom - cr.top) * sc]);
      }
      const fh = parseInt(ctx.font.match(/(\d+)px/)[1], 10) * 1.25;
      const gap = 8 * this.dpr; // keep a little air between labels
      const hit = (b) => placed.some((q) => b[0] - gap < q[2] && b[2] + gap > q[0] && b[1] < q[3] && b[3] > q[1]);
      for (const p of inner.concat(parts.filter((q) => q.part === 'beak'))) {
        if (!p.part || seen.has(p.part) || !LABEL_POS[p.part]) continue;
        seen.add(p.part);
        const c = centre(p), off = LABEL_POS[p.part], text = PART_INFO[p.part].label;
        const tw = ctx.measureText(text).width;
        // labels never sit on each other or under the buttons: try the nearest free row, then the other side
        let pick = null;
        for (const left of [off[0] < 0, off[0] >= 0]) {
          const lx = X(c[0] + (left ? -Math.abs(off[0]) : Math.abs(off[0]))), ly0 = Y(c[1] + off[1]);
          const tx = lx + (left ? -4 : 4) * this.dpr;
          for (const k of [0, 1, -1, 2, -2, 3, -3, 4, -4, 5, 6, 7]) {
            const y = ly0 + k * fh, box = [left ? tx - tw : tx, y - fh / 2, left ? tx : tx + tw, y + fh / 2];
            if (!hit(box) && box[0] >= 0 && box[2] <= W && box[1] >= 0 && box[3] <= H) { pick = { left, lx, ly: y, tx, box }; break; }
          }
          if (pick) break;
        }
        if (!pick) continue; // no room: leave it out rather than draw it on top of something
        placed.push(pick.box);
        ctx.strokeStyle = 'rgba(241,236,226,.35)'; ctx.lineWidth = this.dpr;
        ctx.beginPath(); ctx.moveTo(X(c[0]), Y(c[1])); ctx.lineTo(pick.lx, pick.ly); ctx.stroke();
        ctx.fillStyle = this.sel === p.part ? '#ffcf7a' : 'rgba(241,236,226,.85)';
        ctx.textAlign = pick.left ? 'right' : 'left';
        ctx.fillText(text, pick.tx, pick.ly);
      }
    }
  }
  /** The alternative looks: 1 Gould plate (ink and watercolour on paper), 2 field guide (solid bird, a
   *  round cutaway onto the voice organs), 3 x-ray (glowing outline, vivid organs). */
  drawStyled(parts, X, Y, s, W, H, emit) {
    const ctx = this.ctx, d = this.dpr || 1, st = this.style;
    const OUTER = new Set(['body', 'neck', 'head', 'wing', 'tail', 'legs', 'eye', 'markings', 'beak', 'crest', 'streamers']);
    const outer = parts.filter((p) => OUTER.has(p.part) || p.layer === 0);
    const organs = parts.filter((p) => !outer.includes(p) && p.part).sort((a, b) => zOf(a) - zOf(b));
    const ordered = [...outer.filter((p) => p.layer === 0 && !p.wing), ...outer.filter((p) => p.wing), ...outer.filter((p) => p.layer > 0)];
    const shade = (p, light, dark) => {
      if (p.kind !== 'ell') return p.color;
      const cx = X(p.c[0] - p.r[0] * 0.35), cy = Y(p.c[1] + p.r[1] * 0.45), R = Math.max(p.r[0], p.r[1]) * s * 1.6;
      const g = ctx.createRadialGradient(cx, cy, R * 0.05, cx, cy, R);
      g.addColorStop(0, mixHex(p.color, '#ffffff', light)); g.addColorStop(0.55, p.color); g.addColorStop(1, mixHex(p.color, '#000000', dark));
      return g;
    };
    const fillShape = (p, fill, alpha, stroke, lw) => {
      if (p.kind === 'tube') { this.shape(p, X, Y, s, typeof fill === 'string' ? fill : p.color, alpha, null); return; }
      this.shape(p, X, Y, s, null, 0, null); ctx.globalAlpha = alpha; ctx.fillStyle = fill; ctx.fill(); ctx.globalAlpha = 1;
      if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw * d; ctx.stroke(); }
    };
    const bodyP = parts.find((p) => p.id === 'body');
    if (st === 1) {
      // paper, a soft vignette, then the bird in watercolour washes with an ink line, feathers hatched on the wing
      ctx.fillStyle = '#efe6d2'; ctx.fillRect(0, 0, W, H);
      const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75);
      v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(120,90,50,.18)'); ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
      for (const p of ordered) {
        fillShape(p, shade(p, 0.28, 0.28), 0.93, 'rgba(43,33,24,.85)', 1.25);
        if (p.wing && p.kind === 'ell') {
          ctx.save(); this.shape(p, X, Y, s, null, 0, null); ctx.clip();
          ctx.strokeStyle = 'rgba(43,33,24,.35)'; ctx.lineWidth = d;
          for (let k = -6; k <= 6; k++) { const ox = p.c[0] + k * p.r[0] * 0.16; ctx.beginPath(); ctx.moveTo(X(ox + p.r[0] * 0.5), Y(p.c[1] + p.r[1])); ctx.quadraticCurveTo(X(ox), Y(p.c[1]), X(ox - p.r[0] * 0.6), Y(p.c[1] - p.r[1])); ctx.stroke(); }
          ctx.restore();
        }
      }
    } else if (st === 2) {
      // a clean, solid bird; a round window on the chest shows the voice organs at work
      for (const p of ordered) fillShape(p, shade(p, 0.18, 0.18), 1, 'rgba(241,236,226,.55)', 1);
      if (bodyP) {
        const syr = organs.find((p) => p.part === 'syrinx'), cxm = syr ? (syr.c[0] + bodyP.c[0]) / 2 : bodyP.c[0], cym = syr ? (syr.c[1] + bodyP.c[1]) / 2 : bodyP.c[1];
        const R = bodyP.r[1] * 0.95 * s;
        ctx.save(); ctx.beginPath(); ctx.arc(X(cxm), Y(cym), R, 0, 6.283); ctx.clip();
        ctx.fillStyle = '#f4ecdc'; ctx.fillRect(0, 0, W, H);
        for (const p of organs) this.shape(p, X, Y, s, p.color, p.alpha ?? 1, this.sel === p.part ? '#ffcf7a' : 'rgba(0,0,0,.45)', this.sel === p.part ? 2.5 : 1);
        ctx.restore();
        ctx.strokeStyle = '#2b2118'; ctx.lineWidth = 3 * d; ctx.beginPath(); ctx.arc(X(cxm), Y(cym), R, 0, 6.283); ctx.stroke();
        ctx.strokeStyle = 'rgba(241,236,226,.8)'; ctx.lineWidth = 1.2 * d; ctx.setLineDash([5 * d, 4 * d]); ctx.beginPath(); ctx.arc(X(cxm), Y(cym), R + 4 * d, 0, 6.283); ctx.stroke(); ctx.setLineDash([]);
      }
    } else {
      // x-ray: the body as a glowing outline, the organs bright inside it
      ctx.fillStyle = '#0b1116'; ctx.fillRect(0, 0, W, H);
      ctx.save(); ctx.shadowColor = 'rgba(110,210,255,.9)'; ctx.shadowBlur = 10 * d;
      for (const p of ordered) { if (p.kind === 'tube') { this.shape(p, X, Y, s, 'rgba(120,210,255,.35)', 1, null); continue; } this.shape(p, X, Y, s, 'rgba(90,170,220,.05)', 1, 'rgba(140,220,255,.85)', 1.3); }
      ctx.restore();
      ctx.save(); ctx.shadowBlur = 6 * d;
      for (const p of organs) { ctx.shadowColor = p.color; this.shape(p, X, Y, s, mixHex(p.color, '#ffffff', 0.12), Math.min(1, (p.alpha ?? 1) + 0.2), this.sel === p.part ? '#ffcf7a' : null, 2); }
      ctx.restore();
    }
    // air (cutaway and x-ray only: the plate is a painting)
    if (st !== 1) for (const a of this.lastAir || []) {
      if (a.c[2] < -0.05) continue;
      ctx.fillStyle = `rgba(236,248,255,${a.a})`; ctx.beginPath(); ctx.arc(X(a.c[0]), Y(a.c[1]), Math.max(1.5 * d, a.r * s), 0, 6.283); ctx.fill();
    }
  }
  shape(p, X, Y, s, fill, alpha, stroke, lw = 1) {
    const ctx = this.ctx;
    ctx.beginPath();
    if (p.kind === 'ell') {
      ctx.ellipse(X(p.c[0]), Y(p.c[1]), Math.max(0.5, p.r[0] * s), Math.max(0.5, p.r[1] * s), -(p.rot || 0), 0, Math.PI * 2);
    } else if (p.kind === 'cone') {
      const dx = p.tip[0] - p.base[0], dy = p.tip[1] - p.base[1], len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len, ny = dx / len;
      const a = [p.base[0] + nx * p.h, p.base[1] + ny * p.h], b = [p.base[0] - nx * p.h, p.base[1] - ny * p.h];
      const mid = [p.base[0] + dx * 0.55 + nx * p.h * 0.45 * Math.sign(p.lift || 1), p.base[1] + dy * 0.55 + ny * p.h * 0.45 * Math.sign(p.lift || 1)];
      ctx.moveTo(X(a[0]), Y(a[1]));
      ctx.quadraticCurveTo(X(mid[0]), Y(mid[1]), X(p.tip[0]), Y(p.tip[1]));
      ctx.lineTo(X(b[0]), Y(b[1])); ctx.closePath();
    } else if (p.kind === 'tube') {
      ctx.moveTo(X(p.pts[0][0]), Y(p.pts[0][1]));
      for (const q of p.pts.slice(1)) ctx.lineTo(X(q[0]), Y(q[1]));
      if (fill) { ctx.globalAlpha = alpha; ctx.strokeStyle = fill; ctx.lineWidth = Math.max(1, p.r * 2 * s); ctx.stroke(); ctx.globalAlpha = 1; }
      if (p.rings) this.rings_(p, X, Y, s);
      if (stroke && stroke.startsWith('#')) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.globalAlpha = 0.6; ctx.beginPath(); ctx.moveTo(X(p.pts[0][0]), Y(p.pts[0][1])); for (const q of p.pts) ctx.lineTo(X(q[0]), Y(q[1])); ctx.stroke(); ctx.globalAlpha = 1; }
      return;
    }
    if (fill) { ctx.globalAlpha = alpha; ctx.fillStyle = fill; ctx.fill(); ctx.globalAlpha = 1; }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw * (this.dpr || 1); ctx.stroke(); }
  }
  rings_(p, X, Y, s) {
    // cartilage rings along the windpipe
    const ctx = this.ctx, pts = p.pts;
    let total = 0; const seg = [];
    for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); seg.push(d); total += d; }
    ctx.strokeStyle = 'rgba(90,70,40,.55)'; ctx.lineWidth = Math.max(1, s * 0.05);
    for (let k = 1; k < p.rings; k++) {
      let d = total * k / p.rings, i = 0;
      while (i < seg.length - 1 && d > seg[i]) { d -= seg[i]; i++; }
      const t = d / seg[i], a = pts[i], b = pts[i + 1];
      const x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t;
      const dx = (b[0] - a[0]) / seg[i], dy = (b[1] - a[1]) / seg[i];
      ctx.beginPath(); ctx.moveTo(X(x - dy * p.r), Y(y + dx * p.r)); ctx.lineTo(X(x + dy * p.r), Y(y - dx * p.r)); ctx.stroke();
    }
  }
  /** Which labelled part is under a screen point (CSS px)? */
  hit(px, py, parts) {
    if (!this.tf) return null;
    const { ox, oy, s } = this.tf;
    const x = (px * this.dpr - ox) / s, y = (oy - py * this.dpr) / s;
    // every shape under the finger; the smallest wins (an organ over the body behind it).
    // Exact hits first; finger-sized slack only when nothing is directly under the finger.
    const tol = 14 * this.dpr / s;
    const pick = (slack) => {
      let best = null, area = 1e9;
      for (const p of parts) {
        if (!p.part || p.far) continue;
        let inside = false, a = 1e9;
        if (p.kind === 'ell') {
          const c = Math.cos(-(p.rot || 0)), sn = Math.sin(-(p.rot || 0));
          const dx = x - p.c[0], dy = y - p.c[1], u = dx * c - dy * sn, v = dx * sn + dy * c;
          inside = (u / (p.r[0] + slack)) ** 2 + (v / (p.r[1] + slack)) ** 2 <= 1; a = Math.PI * p.r[0] * p.r[1];
        } else {
          const pts = p.kind === 'tube' ? p.pts : [p.base, p.tip];
          let d = 1e9, len = 0;
          for (let i = 1; i < pts.length; i++) { d = Math.min(d, segDist(x, y, pts[i - 1], pts[i])); len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); }
          const w = p.kind === 'tube' ? p.r : p.h;
          inside = d <= w + slack; a = len * w * 2;
        }
        if (inside && a < area) { area = a; best = p.part; }
      }
      return best;
    };
    return pick(0) || pick(tol);
  }
}

function centre(p) {
  if (p.kind === 'ell') return p.c;
  if (p.kind === 'cone') return [(p.base[0] + p.tip[0]) / 2, (p.base[1] + p.tip[1]) / 2, 0];
  return p.pts[Math.floor(p.pts.length / 2)];
}
function segDist(x, y, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], l = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / l));
  return Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy);
}
function zOf(p) { return p.kind === 'ell' ? p.c[2] : p.kind === 'tube' ? p.pts[0][2] : p.base[2]; }
