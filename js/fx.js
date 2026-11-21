// Built-in effects after the engine: filter -> (dry + tempo-synced delay + reverb) -> limiter.
// Plain Web Audio nodes, so they run the same on the Pi, a computer and an iPhone.
export const DELAY_DIVS = [['1/16', 0.25], ['1/8', 0.5], ['1/8.', 0.75], ['1/4', 1], ['1/4.', 1.5], ['1/2', 2]];

export const FX_PARAMS = [
  { key: 'fx_cut', label: 'FILTER', section: 'FX', min: 150, max: 20000, default: 20000, unit: 'Hz', log: true, help: 'A low-pass filter after the bird: turn it down to darken and soften the sound.' },
  { key: 'fx_res', label: 'RESONANCE', section: 'FX', min: 0, max: 1, default: 0.1, unit: '', log: false, help: 'Peak at the filter frequency. High values ring.' },
  { key: 'fx_dtime', label: 'DELAY TIME', section: 'FX', min: 0, max: DELAY_DIVS.length - 1, default: 1, unit: '', log: false, steps: DELAY_DIVS.length, stepLabels: DELAY_DIVS.map((d) => d[0]), help: 'Echo time, in step with the sequencer tempo.' },
  { key: 'fx_fb', label: 'FEEDBACK', section: 'FX', min: 0, max: 0.9, default: 0.35, unit: '', log: false, help: 'How many echoes: each repeat feeds the next.' },
  { key: 'fx_dmix', label: 'DELAY MIX', section: 'FX', min: 0, max: 1, default: 0, unit: '', log: false, help: 'How loud the echoes are. 0 = no delay.' },
  { key: 'fx_rsize', label: 'REVERB SIZE', section: 'FX', min: 0.3, max: 8, default: 2.4, unit: 's', log: true, help: 'Length of the reverb tail, from a small room to a gorge.' },
  { key: 'fx_rmix', label: 'REVERB MIX', section: 'FX', min: 0, max: 1, default: 0, unit: '', log: false, help: 'How much reverb. 0 = dry, as fitted to the recordings.' },
];

export class FX {
  constructor(ctx) {
    this.ctx = ctx;
    const g = () => ctx.createGain();
    this.input = g();
    this.filter = ctx.createBiquadFilter(); this.filter.type = 'lowpass';
    this.dry = g(); this.dsend = g(); this.rsend = g(); this.out = g();
    this.delay = ctx.createDelay(4); this.fb = g();
    this.dtone = ctx.createBiquadFilter(); this.dtone.type = 'lowpass'; this.dtone.frequency.value = 5200;
    this.conv = ctx.createConvolver();
    this.lim = ctx.createDynamicsCompressor();
    Object.assign(this.lim, {});
    this.lim.threshold.value = -2; this.lim.knee.value = 0; this.lim.ratio.value = 20; this.lim.attack.value = 0.002; this.lim.release.value = 0.12;
    this.input.connect(this.filter);
    this.filter.connect(this.dry); this.dry.connect(this.out);
    this.filter.connect(this.dsend); this.dsend.connect(this.delay); this.delay.connect(this.dtone); this.dtone.connect(this.fb); this.fb.connect(this.delay); this.dtone.connect(this.out);
    this.filter.connect(this.rsend); this.rsend.connect(this.conv); this.conv.connect(this.out);
    this.out.connect(this.lim);
    this.output = this.lim;
    this.v = Object.fromEntries(FX_PARAMS.map((p) => [p.key, p.default]));
    this.bpm = 100;
    this.apply(true);
  }
  set(key, v) { this.v[key] = v; this.apply(key === 'fx_rsize'); }
  tempo(bpm) { this.bpm = bpm; this.apply(false); }
  apply(newIR) {
    const t = this.ctx.currentTime, v = this.v, ramp = (p, x) => p.setTargetAtTime(x, t, 0.02);
    ramp(this.filter.frequency, v.fx_cut);
    ramp(this.filter.Q, 0.7 + v.fx_res * 14);
    const div = DELAY_DIVS[Math.max(0, Math.min(DELAY_DIVS.length - 1, Math.round(v.fx_dtime)))][1];
    ramp(this.delay.delayTime, Math.min(3.9, 60 / this.bpm * div));
    ramp(this.fb.gain, v.fx_fb);
    ramp(this.dsend.gain, v.fx_dmix);
    ramp(this.rsend.gain, v.fx_rmix * 1.4);
    ramp(this.dry.gain, 1 - 0.35 * Math.max(v.fx_rmix, v.fx_dmix * 0.6));
    if (newIR) { clearTimeout(this._ir); this._ir = setTimeout(() => { this.conv.buffer = this.impulse(v.fx_rsize); }, newIR === true ? 0 : 150); }
  }
  /** A natural-sounding tail: decaying noise, darker as it fades, slightly different per ear. */
  impulse(sec) {
    const sr = this.ctx.sampleRate, n = Math.floor(sr * sec), b = this.ctx.createBuffer(2, n, sr);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c); let lp = 0;
      for (let i = 0; i < n; i++) {
        const k = i / n, a = Math.pow(1 - k, 2.2) * Math.exp(-3 * k);
        const x = (Math.random() * 2 - 1) * a;
        lp += (x - lp) * (0.9 - 0.75 * k);      // high frequencies die away first
        d[i] = i < sr * 0.004 ? 0 : lp;
      }
    }
    return b;
  }
}

/** WAV file (16-bit PCM) from planar float channels. */
export function wavBlob(chans, sr) {
  const n = chans[0].length, ch = chans.length, buf = new ArrayBuffer(44 + n * ch * 2), dv = new DataView(buf);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); dv.setUint32(4, 36 + n * ch * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, ch, true); dv.setUint32(24, sr, true);
  dv.setUint32(28, sr * ch * 2, true); dv.setUint16(32, ch * 2, true); dv.setUint16(34, 16, true); w(36, 'data'); dv.setUint32(40, n * ch * 2, true);
  let o = 44;
  for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) { const s = Math.max(-1, Math.min(1, chans[c][i])); dv.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true); o += 2; }
  return new Blob([buf], { type: 'audio/wav' });
}

/** Standard MIDI file (type 0) from note events [{t (ticks), d (ticks), n, v}], 480 ticks per beat. */
export function midiBlob(events, bpm, name) {
  const bytes = [], vlq = (x) => { const o = [x & 0x7f]; while ((x >>= 7)) o.unshift((x & 0x7f) | 0x80); return o; };
  const tr = [];
  const tempo = Math.round(60000000 / bpm);
  tr.push({ t: 0, b: [0xff, 0x51, 0x03, (tempo >> 16) & 255, (tempo >> 8) & 255, tempo & 255] });
  const nm = [...new TextEncoder().encode(name.slice(0, 60))];
  tr.push({ t: 0, b: [0xff, 0x03, ...vlq(nm.length), ...nm] });
  for (const e of events) { tr.push({ t: e.t, b: [0x90, e.n, e.v] }); tr.push({ t: e.t + e.d, b: [0x80, e.n, 0] }); }
  tr.sort((a, b) => a.t - b.t || (a.b[0] === 0x80 ? -1 : 1));
  let last = 0; const data = [];
  for (const e of tr) { data.push(...vlq(e.t - last), ...e.b); last = e.t; }
  data.push(0, 0xff, 0x2f, 0);
  const u32 = (x) => [(x >> 24) & 255, (x >> 16) & 255, (x >> 8) & 255, x & 255];
  bytes.push(...[0x4d, 0x54, 0x68, 0x64], ...u32(6), 0, 0, 0, 1, 0x01, 0xe0);
  bytes.push(...[0x4d, 0x54, 0x72, 0x6b], ...u32(data.length), ...data);
  return new Blob([new Uint8Array(bytes)], { type: 'audio/midi' });
}

/** Save a file: the share sheet on phones (so it can go to Files, AirDrop...), a download elsewhere. */
export async function saveFile(blob, name) {
  const file = new File([blob], name, { type: blob.type });
  if (navigator.canShare && /iPhone|iPad|Android/.test(navigator.userAgent) && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
