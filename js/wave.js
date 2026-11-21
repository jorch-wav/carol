// WAVE view: how the bird's voice is built, stage by stage (for learning).
// Left: the labia's motion as a loop (the oscillator's "phase portrait"): a whistle is a smooth oval,
// a buzz a pinched loop with sharp corners. Right: the wave at each stage of the airway, a few
// cycles each, held still: (1) made by the syrinx, (2) after the windpipe, (3) after the throat,
// mouth and beak, which is what you hear. Same equation for every bird; the shape is the bird.
const STAGES = [
  ['1  SYRINX', 'the labia chop the airflow'],
  ['2  + WINDPIPE', 'echoes and resonances'],
  ['3  + THROAT · MOUTH · BEAK', 'what you hear'],
];
const AMBER = '#f2a93b', CREAM = '#f1ece2', DIM = 'rgba(241,236,226,.45)', GRID = 'rgba(241,236,226,.08)';

export class Wave {
  constructor(canvas) { this.cv = canvas; this.ctx = canvas.getContext('2d'); this.last = null; this.lastT = 0; }
  resize() {
    const r = this.cv.getBoundingClientRect(), d = Math.min(2, devicePixelRatio || 1);
    this.cv.width = Math.max(1, r.width * d); this.cv.height = Math.max(1, r.height * d); this.dpr = d;
  }
  /** The newest few cycles of one channel, starting on a rising zero crossing so the picture stands still. */
  cycles(ch, n, per, count) {
    const len = Math.min(n - 2, Math.max(48, Math.round(per * count)));
    let end = n - 2, i = end - len;
    // search back from the newest data for a rising zero crossing to start on
    for (let k = i; k > Math.max(1, i - per * 2); k--) if (ch[k - 1] < 0 && ch[k] >= 0) { i = k; break; }
    return ch.subarray(i, Math.min(n, i + len));
  }
  draw(scope, tele, info) {
    const ctx = this.ctx, W = this.cv.width, H = this.cv.height, d = this.dpr || 1;
    if (W < 2) return;
    ctx.fillStyle = '#141312'; ctx.fillRect(0, 0, W, H);
    const now = performance.now(), singing = tele[0] > 0.5;
    if (scope && singing) { this.last = scope; this.lastT = now; }
    const sc = this.last, fresh = now - this.lastT < 400;
    const portrait = W < H * 1.05;
    const pad = 10 * d, font = (px, w = 700) => `${w} ${Math.round(px * d)}px CarolLabel, sans-serif`;
    // small screens: the view switch sits over the top and the size buttons over the bottom
    const small = W / d < 700, top = small ? 52 * d : 0, bot = small ? 50 * d : 0;
    // layout: the loop on the left (or top on tall screens), three stages beside it
    const avail = (H - top - bot) / d, compact = avail < 330;
    const shown = compact ? [0, 2] : [0, 1, 2];   // short panels: the syrinx and what you hear
    const loopBox = compact ? [pad, top + 26 * d, Math.min(W * 0.3, H - top - bot - 40 * d), H - top - bot - 40 * d] : portrait ? [pad, top + 30 * d, W - 2 * pad, Math.min(H * 0.34, W * 0.6)] : [pad, top + 30 * d, Math.min(W * 0.34, H - top - bot - 60 * d), H - top - bot - 60 * d];
    const side = compact || !portrait;
    const stX = side ? loopBox[0] + loopBox[2] + pad * 2 : pad;
    const stY = side ? top + (compact ? 24 : 30) * d : loopBox[1] + loopBox[3] + 26 * d;
    const stW = W - stX - pad, stH = (side ? H - top - bot - (compact ? 34 : 76) * d : H - stY - bot - 46 * d) / shown.length;
    ctx.textBaseline = 'top';
    ctx.fillStyle = CREAM; ctx.font = font(12); ctx.fillText(compact ? 'LABIA' : 'THE LABIA’S MOTION', loopBox[0], top + 8 * d);
    if (!compact) ctx.fillText('THE WAVE, STAGE BY STAGE', stX, side ? top + 10 * d : stY - 18 * d);
    if (!sc) {
      ctx.fillStyle = DIM; ctx.font = font(15, 400); ctx.textAlign = 'center';
      ctx.fillText('Play a key or a pad to see the voice being made', W / 2, H / 2); ctx.textAlign = 'left';
      return;
    }
    const n = sc.n, data = sc.scope, ch = (k) => data.subarray(k * n, (k + 1) * n);
    const sr = 48000, f0 = Math.max(60, tele[3] || 1000), per = sr / f0;
    ctx.globalAlpha = fresh ? 1 : 0.45;
    // ---- the loop: labia position (x) against velocity (y), the last few cycles, newest brightest
    {
      const [bx, by, bw, bh] = loopBox, X = ch(0), Y = ch(1);
      const m = Math.min(n, Math.max(60, Math.round(per * 3)));
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (let i = n - m; i < n; i++) { x0 = Math.min(x0, X[i]); x1 = Math.max(x1, X[i]); y0 = Math.min(y0, Y[i]); y1 = Math.max(y1, Y[i]); }
      const sx = (bw * 0.9) / Math.max(1e-6, x1 - x0), sy = (bh * 0.9) / Math.max(1e-6, y1 - y0), s = Math.min(sx, sy);
      const cx = bx + bw / 2 - (x0 + x1) / 2 * s, cy = by + bh / 2 + (y0 + y1) / 2 * s;
      ctx.strokeStyle = GRID; ctx.lineWidth = d; ctx.strokeRect(bx, by, bw, bh);
      ctx.beginPath(); ctx.moveTo(bx, by + bh / 2); ctx.lineTo(bx + bw, by + bh / 2); ctx.moveTo(bx + bw / 2, by); ctx.lineTo(bx + bw / 2, by + bh); ctx.stroke();
      ctx.lineWidth = 2 * d; ctx.lineJoin = 'round';
      for (let i = n - m + 1; i < n; i++) {
        ctx.strokeStyle = `rgba(242,169,59,${0.15 + 0.85 * (i - (n - m)) / m})`;
        ctx.beginPath(); ctx.moveTo(cx + X[i - 1] * s, cy - Y[i - 1] * s); ctx.lineTo(cx + X[i] * s, cy - Y[i] * s); ctx.stroke();
      }
      ctx.fillStyle = DIM; ctx.font = font(10, 400);
      ctx.fillText('open →', bx + bw - 44 * d, by + bh / 2 + 3 * d); ctx.fillText('↑ opening fast', bx + bw / 2 + 4 * d, by + 3 * d);
    }
    // ---- three stages
    shown.forEach((k, row) => {
      const [title, sub] = STAGES[k];
      const y = stY + row * stH, h = stH - 22 * d, seg = this.cycles(ch(2 + k), n, per, 3);
      let pk = 1e-9; for (const v of seg) pk = Math.max(pk, Math.abs(v));
      ctx.fillStyle = k === 2 ? AMBER : CREAM; ctx.font = font(11); ctx.fillText(title, stX, y);
      if (!compact) { ctx.fillStyle = DIM; ctx.font = font(10, 400); ctx.fillText(sub, stX + ctx.measureText(title).width + 30 * d, y + 1 * d); }
      const mid = y + 16 * d + h / 2;
      ctx.strokeStyle = GRID; ctx.lineWidth = d; ctx.beginPath(); ctx.moveTo(stX, mid); ctx.lineTo(stX + stW, mid); ctx.stroke();
      ctx.strokeStyle = k === 2 ? AMBER : CREAM; ctx.lineWidth = (k === 2 ? 2.2 : 1.6) * d; ctx.beginPath();
      for (let i = 0; i < seg.length; i++) { const px = stX + i / (seg.length - 1) * stW, py = mid - seg[i] / pk * h * 0.45; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
      ctx.stroke();
    });
    ctx.globalAlpha = 1;
    // ---- what the shape means right now
    const b = tele[2], tense = b > 0.25, buzzy = b < -0.05 || (info.closure || 0) > 0.45;
    const msg = buzzy ? 'BUZZ: slack labia snap open and shut, making sharp pulses rich in overtones (the pinched loop).'
      : tense ? 'WHISTLE: tight labia swing smoothly, close to a pure tone (the round, oval loop).'
        : 'IN BETWEEN: part whistle, part buzz. Turn SYRINX TENSION and LABIAL CLOSURE and watch the loop change.';
    if (compact) return;   // the explanation needs the big panel
    ctx.fillStyle = DIM; ctx.font = font(11, 400); ctx.textBaseline = 'bottom';
    ctx.fillText(`${Math.round(f0)} Hz · ${msg}`, pad, H - bot - 8 * d, W - 2 * pad);
  }
}
