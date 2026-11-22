// Carol AudioWorklet: runs the Rust engine (WebAssembly) on the audio thread.
// Slot 0 is the bird on screen; more slots (one engine each) let the sequencer's dawn chorus
// sing several birds at once. Messages may carry `at` (AudioContext time) to land on the beat.
class CarolProcessor extends AudioWorkletProcessor {
  constructor(opts) {
    super();
    this.module = opts.processorOptions.module;
    this.slots = [this.instance()];
    this.queue = [];
    this.n = 0;
    this.port.onmessage = (e) => this.post(e.data);
  }
  instance() {
    const w = new WebAssembly.Instance(this.module, { env: { carol_progress() {} } }).exports;
    w.carol_init(sampleRate);
    return { w, active: true };
  }
  slot(s) {
    s = s || 0;
    while (this.slots.length <= s) this.slots.push(null);
    if (!this.slots[s]) this.slots[s] = this.instance();
    return this.slots[s];
  }
  post(m) {
    if (Array.isArray(m)) { for (const x of m) this.post(x); return; }
    if (m.at !== undefined && m.at > currentTime) { this.queue.push(m); this.queue.sort((a, b) => a.at - b.at); return; }
    this.msg(m);
  }
  f32(w, k, arr) {
    const p = w.carol_scratch(k, arr.length);
    new Float32Array(w.memory.buffer, p, arr.length).set(arr);
  }
  msg(m) {
    if (m.t === 'scope') { this.scopeOn = m.on; return; }
    if (m.t === 'unqueue') { this.queue = this.queue.filter((q) => q.tag !== m.tag); return; }
    if (m.t === 'free') { if (m.s > 0 && this.slots[m.s]) this.slots[m.s] = null; return; }
    // only loading a bird ('body') creates a slot; anything else for a missing slot is dropped
    if (m.t !== 'body' && m.s > 0 && !this.slots[m.s]) return;
    const sl = this.slot(m.s), w = sl.w;
    sl.active = true;
    switch (m.t) {
      case 'body': w.carol_set_body(m.v); break;
      case 'param': w.carol_set_param(m.i, m.v); break;
      case 'params': for (const [i, v] of m.v) w.carol_set_param(i, v); break;
      case 'fit': w.carol_set_fit(m.tension, m.pressure); break;
      case 'fitsnap': w.carol_snapshot_fit(); break;
      case 'calls':
        w.carol_clear_calls();
        for (const c of m.v) {
          this.f32(w, 0, c.f); this.f32(w, 1, c.p); this.f32(w, 2, c.n); this.f32(w, 3, c.g); this.f32(w, 4, c.m); this.f32(w, 5, c.c);
          w.carol_add_call(c.f.length, c.hop, c.ref_hz);
        }
        break;
      case 'on': w.carol_note_on(m.id, m.call, m.note, m.vel); break;
      case 'off': w.carol_note_off(m.id); break;
      case 'alloff': w.carol_all_off(); break;
    }
  }
  process(_in, outputs) {
    const out = outputs[0];
    const n = out[0].length;
    // events due before the end of this block
    const end = currentTime + n / sampleRate;
    while (this.queue.length && this.queue[0].at < end) this.msg(this.queue.shift());
    const mix = out[0];
    mix.fill(0);
    for (let s = 0; s < this.slots.length; s++) {
      const sl = this.slots[s]; if (!sl) continue;
      const w = sl.w;
      const p = w.carol_process(n);
      const buf = new Float32Array(w.memory.buffer, p, n);
      for (let i = 0; i < n; i++) mix[i] += buf[i];
    }
    for (let c = 1; c < out.length; c++) out[c].set(mix);
    if (++this.n % 6 === 0) {
      const w0 = this.slots[0].w, t = w0.carol_telemetry();
      this.port.postMessage(new Float32Array(w0.memory.buffer, t, 20).slice());
      // the WAVE view's scope: the loudest voice at each stage (only while that view is open)
      if (this.scopeOn && this.n % 12 === 0) {
        const n = w0.carol_scope_n(), p = w0.carol_scope();
        this.port.postMessage({ scope: new Float32Array(w0.memory.buffer, p, 5 * n).slice(), n });
      }
    }
    return true;
  }
}
registerProcessor('carol', CarolProcessor);

// Recorder tap (after the effects): while on, sends the stereo output to the page in 4096-frame blocks.
class RecProcessor extends AudioWorkletProcessor {
  constructor() {
    super(); this.on = false; this.l = new Float32Array(4096); this.r = new Float32Array(4096); this.k = 0;
    this.port.onmessage = (e) => { this.on = e.data.on; if (!this.on) this.flush(); };
  }
  flush() { if (this.k) { this.port.postMessage([this.l.slice(0, this.k), this.r.slice(0, this.k)]); this.k = 0; } }
  process(inputs) {
    const inp = inputs[0];
    if (!this.on || !inp || !inp.length) return true;
    const L = inp[0], R = inp[1] || inp[0];
    for (let i = 0; i < L.length; i++) {
      this.l[this.k] = L[i]; this.r[this.k] = R[i];
      if (++this.k === 4096) this.flush();
    }
    return true;
  }
}
registerProcessor('carol-rec', RecProcessor);
