// Sonogram: the way ornithologists read birdsong. Time scrolls right to left (~4 s across),
// 0-10 kHz up the side. The bird's call contour (the fitted gesture, transposed to the key you
// played) is drawn over it, and a slim scope strip runs along the bottom.
const FMAX = 10000;

function colour(v) { // 0..1 -> dark panel, ember, amber, cream
  const stops = [[20, 19, 18], [70, 32, 10], [180, 95, 20], [242, 169, 59], [255, 236, 200]];
  const x = Math.min(0.999, Math.max(0, v)) * (stops.length - 1), i = Math.floor(x), f = x - i;
  return stops[i].map((c, k) => Math.round(c + (stops[i + 1][k] - c) * f));
}

export class Sono {
  constructor(canvas) {
    this.cv = canvas; this.ctx = canvas.getContext('2d');
    this.hist = document.createElement('canvas'); this.hctx = this.hist.getContext('2d');
    this.bins = null; this.wave = null; this.acc = 0;
  }
  resize() {
    const r = this.cv.getBoundingClientRect(), d = Math.min(2, devicePixelRatio || 1);
    this.cv.width = Math.max(1, r.width * d); this.cv.height = Math.max(1, r.height * d); this.dpr = d;
    const old = this.hist.width ? this.hist : null;
    const nh = document.createElement('canvas'); nh.width = this.cv.width; nh.height = Math.round(this.cv.height * 0.8);
    const nctx = nh.getContext('2d'); nctx.fillStyle = '#141312'; nctx.fillRect(0, 0, nh.width, nh.height);
    if (old && old.width > 1) nctx.drawImage(old, 0, 0, nh.width, nh.height);
    this.hist = nh; this.hctx = nctx;
  }
  draw(analyser, tele, dt) {
    const ctx = this.ctx, W = this.cv.width, H = this.cv.height, d = this.dpr || 1;
    if (W < 2 || !this.hist.width) return;
    const SH = this.hist.height;
    // ---- new columns into the scrolling history
    if (analyser) {
      if (!this.bins || this.bins.length !== analyser.frequencyBinCount) this.bins = new Float32Array(analyser.frequencyBinCount);
      analyser.getFloatFrequencyData(this.bins);
      const nyq = analyser.context.sampleRate / 2, n = this.bins.length;
      this.acc += W / 4 * Math.min(0.1, dt);          // 4 seconds across the panel
      const step = Math.floor(this.acc); this.acc -= step;
      if (step > 0) {
        const h = this.hctx;
        h.drawImage(this.hist, -step, 0);
        const col = h.createImageData(step, SH);
        for (let y = 0; y < SH; y++) {
          const f = (1 - y / SH) * FMAX, b = Math.min(n - 1, Math.round(f / nyq * n));
          const v = (this.bins[b] + 95) / 70;          // -95..-25 dBFS
          const [r, g, bl] = colour(v);
          for (let x = 0; x < step; x++) { const o = (y * step + x) * 4; col.data[o] = r; col.data[o + 1] = g; col.data[o + 2] = bl; col.data[o + 3] = 255; }
        }
        h.putImageData(col, W - step, 0);
        // the bird's contour (fitted call shape at the played key)
        if (tele && tele[0] > 0.5 && tele[3] > 50 && tele[3] < FMAX) {
          h.fillStyle = 'rgba(160,220,255,.9)';
          h.fillRect(W - step, (1 - tele[3] / FMAX) * SH - d, step, 2 * d);
        }
      }
    }
    ctx.fillStyle = '#141312'; ctx.fillRect(0, 0, W, H);
    ctx.drawImage(this.hist, 0, 0);
    // ---- axis: kHz
    ctx.font = `${11 * d}px CarolLabel, sans-serif`; ctx.textBaseline = 'middle';
    for (let k = 2; k < FMAX / 1000; k += 2) {
      const y = (1 - k * 1000 / FMAX) * SH;
      ctx.strokeStyle = 'rgba(241,236,226,.12)'; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      ctx.fillStyle = 'rgba(241,236,226,.6)'; ctx.fillText(`${k} kHz`, 6 * d, y - 7 * d);
    }
    ctx.fillStyle = 'rgba(160,220,255,.85)'; ctx.textAlign = 'right'; ctx.fillText('— bird\'s call contour', W - 8 * d, SH - 10 * d); ctx.textAlign = 'left';
    // ---- scope strip
    const y0 = SH, sh = H - SH;
    ctx.fillStyle = '#1b1a18'; ctx.fillRect(0, y0, W, sh);
    ctx.strokeStyle = 'rgba(241,236,226,.15)'; ctx.beginPath(); ctx.moveTo(0, y0 + 0.5); ctx.lineTo(W, y0 + 0.5); ctx.stroke();
    if (!analyser) return;
    if (!this.wave || this.wave.length !== analyser.fftSize) this.wave = new Float32Array(analyser.fftSize);
    const b = this.wave; analyser.getFloatTimeDomainData(b);
    const sr = analyser.context.sampleRate, f0 = tele && tele[0] > 0.5 ? tele[3] : 0;
    const span = Math.min(b.length / 2, Math.max(48, Math.round(f0 > 50 ? sr * 4 / f0 : sr * 0.01)));
    let st = 0; for (let i = 1; i < b.length - span; i++) if (b[i - 1] < 0 && b[i] >= 0) { st = i; break; }
    let pk = 0; for (let i = st; i < st + span; i++) pk = Math.max(pk, Math.abs(b[i]));
    const g = pk > 1e-4 ? 0.42 / Math.max(pk, 0.02) : 0;
    ctx.strokeStyle = '#f2a93b'; ctx.lineWidth = 1.5 * d; ctx.beginPath();
    for (let i = 0; i < span; i++) { const x = i / (span - 1) * W, y = y0 + sh / 2 - b[st + i] * g * sh; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.stroke();
    ctx.fillStyle = 'rgba(241,236,226,.6)'; ctx.fillText(f0 > 50 ? `${Math.round(f0)} Hz` : '', 6 * d, y0 + 10 * d);
  }
}
