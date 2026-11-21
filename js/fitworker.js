// Fitting worker: the same Rust fitter as the offline tool, compiled to WebAssembly.
let w = null;
const STAGES = ['Shaping calls', 'Searching body settings', 'Refining', 'Done'];
self.onmessage = async (e) => {
  const m = e.data;
  if (!w) {
    const { instance } = await WebAssembly.instantiate(m.wasm, {
      env: { carol_progress: (st, frac, best) => self.postMessage({ t: 'progress', stage: STAGES[st] || '', frac, best }) },
    });
    w = instance.exports;
  }
  w.carol_fit_reset();
  for (const r of m.recs) {
    const p = w.carol_scratch(0, r.audio.length);
    new Float32Array(w.memory.buffer, p, r.audio.length).set(r.audio);
    w.carol_fit_add(r.audio.length, r.fs);
  }
  const n = w.carol_fit_run(m.body, m.fmin, m.fmax, m.items, m.budget);
  const bytes = new Uint8Array(w.memory.buffer, w.carol_fit_result(), n).slice();
  self.postMessage({ t: 'done', json: new TextDecoder().decode(bytes) });
};
