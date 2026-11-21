// "Import your own": decode recordings in the browser, fit them in a worker, store the
// result locally (IndexedDB) as a new bird in the "My Birds" collection.
const BODY = ['songbird', 'kingfisher', 'parrot', 'dove'];

export const store = {
  db: null,
  async open() {
    if (this.db) return this.db;
    this.db = await new Promise((res, rej) => {
      const r = indexedDB.open('carol', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('birds', { keyPath: 'id' });
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
    return this.db;
  },
  async all() {
    try {
      const db = await this.open();
      return await new Promise((res) => { const q = db.transaction('birds').objectStore('birds').getAll(); q.onsuccess = () => res(q.result || []); q.onerror = () => res([]); });
    } catch { return []; }
  },
  async put(b) { const db = await this.open(); return new Promise((res, rej) => { const t = db.transaction('birds', 'readwrite'); t.objectStore('birds').put(b); t.oncomplete = res; t.onerror = () => rej(t.error); }); },
  async del(id) { const db = await this.open(); return new Promise((res) => { const t = db.transaction('birds', 'readwrite'); t.objectStore('birds').delete(id); t.oncomplete = res; }); },
};

export class Importer {
  constructor(app) {
    this.app = app;
    this.el = document.getElementById('import');
    this.el.querySelector('[data-close]').onclick = () => { if (!this.busy) this.el.hidden = true; };
    document.getElementById('importBtn').onclick = () => { document.getElementById('presets').hidden = true; this.el.hidden = false; };
    document.getElementById('imGo').onclick = () => this.run();
  }
  status(t, frac) {
    document.getElementById('imProgress').hidden = false;
    document.getElementById('imStatus').textContent = t;
    if (frac != null) document.getElementById('imBar').style.width = Math.round(Math.min(1, frac) * 100) + '%';
  }
  async run() {
    if (this.busy) return;
    const files = [...document.getElementById('imFiles').files];
    const name = document.getElementById('imName').value.trim() || 'My bird';
    const body = Number(document.getElementById('imBody').value);
    const [fmin, fmax] = document.getElementById('imRange').value.split(',').map(Number);
    const credit = document.getElementById('imCredit').value.trim();
    if (!files.length) { this.status('Choose at least one recording.'); return; }
    this.busy = true;
    try {
      this.status('Decoding recordings…', 0.02);
      const ctx = new OfflineAudioContext(1, 1, 44100);
      const recs = [];
      for (const f of files) {
        const buf = await ctx.decodeAudioData(await f.arrayBuffer());
        const n = buf.length, mono = new Float32Array(n);
        for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < n; i++) mono[i] += d[i] / buf.numberOfChannels; }
        // keep it light: at most 90 s per file
        recs.push({ name: f.name, audio: mono.subarray(0, Math.min(n, buf.sampleRate * 90)), fs: buf.sampleRate });
      }
      const wasm = await (await fetch('carol.wasm')).arrayBuffer();
      const worker = new Worker('js/fitworker.js');
      const t0 = performance.now();
      let evals = 0;
      const json = await new Promise((res, rej) => {
        worker.onmessage = (e) => {
          const m = e.data;
          if (m.t === 'progress') { evals++; this.status(`${m.stage}… ${Math.round((performance.now() - t0) / 1000)} s`, Math.min(0.97, 0.05 + evals / 260)); }
          else if (m.t === 'done') res(m.json);
        };
        worker.onerror = (e) => rej(e.message || 'fit failed');
        worker.postMessage({ wasm, recs: recs.map((r) => ({ audio: r.audio, fs: r.fs })), body, fmin, fmax, items: 8, budget: 150 });
      });
      worker.terminate();
      const fit = JSON.parse(json);
      if (fit.error) throw new Error(fit.error);
      const id = 'user-' + Date.now().toString(36);
      const bird = {
        id, name, sci: 'Your recordings', body: BODY[body], collection: 'My Birds', user: true,
        tags: { features: ['imported'], region: [] },
        params: fit.params, scale: fit.scale, match: fit.match, look: null, image: null,
        calls: fit.calls.map((c, i) => ({ ...c, name: `${c.kind === 'phrase' ? 'Phrase' : 'Call'} ${i + 1}`, source: recs[Number(c.source.replace('rec', ''))]?.name || c.source })),
        info: { overview: `${name}: a bird you imported. Carol fitted its ${BODY[body]} model to ${files.length} recording(s), reaching a ${Math.round(fit.match.total)}% match.` },
        sources: { recordings: recs.map((r) => ({ id: r.name, recordist: credit || 'You', licence: credit ? '' : 'Your own recording' })), science: [] },
      };
      await store.put(bird);
      this.status(`Done: ${Math.round(fit.match.total)}% match.`, 1);
      await this.app.refreshIndex();
      this.app.loadBird(id);
      setTimeout(() => { this.el.hidden = true; document.getElementById('imProgress').hidden = true; }, 1500);
    } catch (e) {
      this.status('Could not fit: ' + (e.message || e));
    } finally { this.busy = false; }
  }
}
