// Audio: AudioContext + the Carol worklet. Same code on the Pi (Chromium) and the web.
import { FX, wavBlob } from './fx.js';
// player controls: not part of the fitted bird - a preset's stored value is ignored, the default is used
export const PLAYER_KEYS = ['mode', 'volume', 'speed', 'sweep', 'attack', 'release', 'glide', 'vmode', 'lfo_rate', 'vibrato', 'tremolo'];
export const BODY_INDEX = { songbird: 0, kingfisher: 1, parrot: 2, dove: 3 };

export class CarolAudio {
  constructor(defs) {
    this.defs = defs;              // bodies.json
    this.index = Object.fromEntries(defs.params.map((p) => [p.key, p.index]));
    this.node = null; this.ctx = null;
    this.tele = new Float32Array(16);
    this.onTele = null;
    this.pending = [];
  }
  async start() {
    if (this.ctx) { if (this.ctx.state !== 'running') await this.ctx.resume(); return; }
    const q = new URLSearchParams(location.search);
    let lat = q.get('latency');
    if (!lat) { try { lat = JSON.parse(localStorage.getItem('carol-settings') || '{}').latency || ''; } catch { lat = ''; } }
    const opts = { latencyHint: !lat ? 'interactive' : (isNaN(Number(lat)) ? lat : Number(lat)) };
    if (q.get('rate')) opts.sampleRate = Number(q.get('rate'));
    this.ctx = new AudioContext(opts);
    await this.ctx.audioWorklet.addModule('js/worklet.js');
    const bytes = await (await fetch('carol.wasm')).arrayBuffer();
    const module = await WebAssembly.compile(bytes);
    this.node = new AudioWorkletNode(this.ctx, 'carol', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2], processorOptions: { module } });
    // effects, then the speakers; the recorder listens after the effects
    this.fx = new FX(this.ctx);
    this.node.connect(this.fx.input);
    this.fx.output.connect(this.ctx.destination);
    for (const [k, v] of Object.entries(this.fxPending || {})) this.fx.set(k, v);
    this.rec = new AudioWorkletNode(this.ctx, 'carol-rec', { numberOfInputs: 1, numberOfOutputs: 0, channelCount: 2, channelCountMode: 'explicit' });
    this.fx.output.connect(this.rec);
    this.rec.port.onmessage = (e) => { if (this.recBufs) this.recBufs.push(e.data); };
    // for the oscilloscope
    this.analyser = this.ctx.createAnalyser(); this.analyser.fftSize = 2048; this.analyser.smoothingTimeConstant = 0;
    this.node.connect(this.analyser);
    this.node.port.onmessage = (e) => {
      if (e.data && e.data.scope) { this.scope = e.data; return; }
      this.tele = e.data; this.onTele && this.onTele(e.data);
    };
    for (const m of this.pending) this.node.port.postMessage(m);
    this.pending = [];
    if (this.ctx.state !== 'running') await this.ctx.resume().catch(() => {});
  }
  get running() { return this.ctx && this.ctx.state === 'running'; }
  send(m) { if (this.node) this.node.port.postMessage(m); else this.pending.push(m); }

  /** Load a bird into a slot (0 = the bird on screen; 1+ = extra birds for the dawn chorus). */
  loadBird(bird, s = 0) {
    const m = [];
    m.push({ t: 'alloff', s });
    m.push({ t: 'body', v: BODY_INDEX[bird.body] ?? 0, s });
    const vals = [];
    for (const p of this.defs.params) if (p.index !== undefined) vals.push([p.index, PLAYER_KEYS.includes(p.key) ? p.default : (bird.params[p.key] ?? p.default)]);
    m.push({ t: 'params', v: vals, s });
    m.push({ t: 'fit', tension: bird.params.tension ?? 0.3, pressure: bird.params.pressure ?? 1, s });
    m.push({ t: 'fitsnap', s });   // these are the bird's own settings: knob moves away from them are emphasised
    m.push({ t: 'calls', s, v: bird.calls.map((c) => ({
      f: Float32Array.from(c.f), p: Float32Array.from(c.p, (v) => v / 1000), n: Float32Array.from(c.n, (v) => v / 100), g: Float32Array.from(c.g || [], (v) => v / 1000), m: Float32Array.from(c.m || [], (v) => v / 1000), c: Float32Array.from(c.c || [], (v) => v / 1000), hop: c.hop, ref_hz: c.ref_hz,
    })) });
    for (const x of m) this.send(x);
  }
  /** Apply knob values (key -> value) to a slot. */
  setParams(vals, s = 0) { const v = []; for (const [k, x] of Object.entries(vals)) if (this.index[k] !== undefined) v.push([this.index[k], x]); this.send({ t: 'params', v, s }); }
  freeSlot(s) { if (s > 0) this.send({ t: 'free', s }); }
  setParam(key, v) { const i = this.index[key]; if (i !== undefined) this.send({ t: 'param', i, v }); }
  noteOn(id, call, note, vel = 0.9, at, s = 0, tag) { this.send({ t: 'on', id, call, note, vel, at, s, tag }); }
  noteOff(id, at, s = 0, tag) { this.send({ t: 'off', id, at, s, tag }); }
  /** Drop scheduled (not yet played) events with this tag. */
  unqueue(tag) { this.send({ t: 'unqueue', tag }); }
  allOff(s) { if (s === undefined) for (let k = 0; k < 8; k++) this.send({ t: 'alloff', s: k }); else this.send({ t: 'alloff', s }); }
  /** Ask the audio thread for the scope (the WAVE view) or stop. */
  scopeOn(on) { this.send({ t: 'scope', on }); }
  setFx(key, v) { if (this.fx) this.fx.set(key, v); else (this.fxPending ||= {})[key] = v; }
  startRec() { if (!this.rec) return false; this.recBufs = []; this.rec.port.postMessage({ on: true }); return true; }
  /** Stop recording; resolves to a WAV blob (or null if nothing was recorded). */
  stopRec() {
    if (!this.rec || !this.recBufs) return Promise.resolve(null);
    this.rec.port.postMessage({ on: false });
    return new Promise((res) => setTimeout(() => {
      const bufs = this.recBufs; this.recBufs = null;
      const n = bufs.reduce((a, b) => a + b[0].length, 0); if (!n) return res(null);
      const L = new Float32Array(n), R = new Float32Array(n); let o = 0;
      for (const [l, r] of bufs) { L.set(l, o); R.set(r, o); o += l.length; }
      res(wavBlob([L, R], this.ctx.sampleRate));
    }, 150));
  }
  get now() { return this.ctx ? this.ctx.currentTime : 0; }
}
