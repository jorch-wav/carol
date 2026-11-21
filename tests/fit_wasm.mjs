// Test the in-browser fitter (wasm) on a WAV: node fit_wasm.mjs file.wav body
import fs from 'fs';
const [file, body = '0'] = process.argv.slice(2);
const wav = fs.readFileSync(file); const dv = new DataView(wav.buffer, wav.byteOffset);
let off = 12, fs_ = 44100, data = null;
while (off < wav.length) { const id = wav.toString('ascii', off, off + 4), sz = dv.getUint32(off + 4, true);
  if (id === 'fmt ') fs_ = dv.getUint32(off + 12, true); if (id === 'data') { data = new Int16Array(wav.buffer.slice(wav.byteOffset + off + 8, wav.byteOffset + off + 8 + sz)); break; } off += 8 + sz; }
const audio = Float32Array.from(data, (v) => v / 32768);
const t0 = Date.now(); let n = 0;
const { instance } = await WebAssembly.instantiate(fs.readFileSync(new URL('../web/carol.wasm', import.meta.url)), { env: { carol_progress: (st, f, b) => { if (++n % 40 === 0) console.log('progress', st, b.toFixed(2), ((Date.now() - t0) / 1000).toFixed(0) + 's'); } } });
const w = instance.exports;
w.carol_fit_reset();
const p = w.carol_scratch(0, audio.length); new Float32Array(w.memory.buffer, p, audio.length).set(audio); w.carol_fit_add(audio.length, fs_);
const len = w.carol_fit_run(+body, 300, 6000, 6, 150);
const out = JSON.parse(new TextDecoder().decode(new Uint8Array(w.memory.buffer, w.carol_fit_result(), len)));
console.log('done in', (Date.now() - t0) / 1000, 's; match', out.match, 'calls', out.calls.length, 'scale', out.scale);
