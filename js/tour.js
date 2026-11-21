// Guided tour: "press this, hear that". Each step lights a body part and its knobs, can move a knob
// to show what it does, and plays the bird's call. Every knob it touches is put back afterwards.
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function steps(app) {
  const b = app.bird, has = (k) => !!app.knobs[k];
  const lbl = (k) => (app.knobs[k] ? app.knobs[k].p.label : k);
  const out = [
    { part: null, text: `This is the <b>${esc(b.name)}</b>. Listen to its <b>${esc(b.calls[0].name.toLowerCase())}</b>, made by Carol's model of its body, not a recording. Press <b>▶ HEAR</b> any time.` },
    { part: 'airsacs', knobs: ['pressure'], demo: { pressure: 0.6 }, text: `It starts with air. The <b>air sacs</b> squeeze air up through the voice box. Hear it with less push: <b>${lbl('pressure')}</b> turned down, quieter and thinner.` },
    { part: 'syrinx', knobs: ['tension'], demo: { tension: -0.2 }, text: `The <b>syrinx</b> is the voice box, deep in the chest. With the muscles slack (<b>${lbl('tension')}</b> down) its labia buzz in pulses instead of whistling. Hear the buzz.` },
    { part: 'trachea', knobs: ['trachea'], demo: { trachea: (v) => Math.min(22, v * 2.2) }, text: `The sound travels up the <b>windpipe</b>, which adds echoes and resonances. Here it is with a windpipe twice as long.` },
  ];
  if (has('oec_track')) out.push({ part: 'oec', knobs: ['oec', 'oec_track'], demo: { oec_track: 0, oec_depth: (v) => Math.min(1, v + 0.2) }, text: `Many birds re-size the <b>throat sac</b> to follow every note, which keeps the tone pure. Stop the tracking and hear the tone change.` });
  out.push({ part: 'beak', knobs: ['beak', 'beak_track'], demo: { beak: 0, beak_track: 0 }, text: `Last, the <b>beak</b>: a wider gape lets out the high frequencies. Hear it with the beak nearly shut.` });
  const body = {
    songbird: { part: 'bronchi', knobs: ['two', 'two_int'], demo: { two: 0.8, two_int: 7 }, text: `Songbirds have <b>two voices</b>, one on each side of the syrinx. Hear both sides singing at once, a fifth apart.` },
    kingfisher: { part: 'syrinx', knobs: ['coupling'], demo: { coupling: 0.95 }, text: `This body has two sound membranes that push on each other. Turn <b>${lbl('coupling')}</b> up and they go rough and chaotic.` },
    parrot: { part: 'tongue', knobs: ['tongue_h', 'tongue_p'], demo: { tongue_h: 1, tongue_p: 0 }, text: `Parrots shape sound with their thick <b>tongue</b>, like we shape vowels. Hear the same call with the tongue moved.` },
    dove: { part: 'sac', knobs: ['sac', 'sac_q'], demo: { sac: 0.05 }, text: `Doves coo with the beak shut through an <b>inflated neck sac</b>. Let it go flat and the overtones it was filtering out come back.` },
  }[b.body];
  if (body && body.knobs.every(has)) out.push(body);
  if (b.model_note) out.push({ part: null, text: esc(b.model_note) });
  out.push({ part: null, end: true, text: `Now play: <b>KEYS</b> move the call to any note, <b>PADS</b> play each call as the bird sang it, and <b>SEQ</b> builds patterns, even a dawn chorus with several birds. Every knob on the panel is a real part of the bird.` });
  return out.map((s) => ({ ...s, knobs: (s.knobs || []).filter(has) }));
}

export class Tour {
  constructor(app) { this.app = app; this.el = $('tour'); this.i = 0; this.saved = null; this.list = []; }
  start() {
    this.list = steps(this.app); this.i = 0; this.el.hidden = false;
    this.app.learn.close();
    this.show();
  }
  restore() {
    if (!this.saved) return;
    for (const [k, v] of Object.entries(this.saved)) if (this.app.knobs[k]) { this.app.knobs[k].setValue(v); this.app.setValue(k, v, false); }
    this.saved = null;
  }
  close() { clearTimeout(this.t); this.restore(); this.el.hidden = true; this.app.v2.sel = this.app.v3.sel = null; }
  show() {
    const s = this.list[this.i], app = this.app;
    this.restore();
    app.v2.sel = app.v3.sel = s.part;
    for (const k of s.knobs) app.knobs[k].flash();
    this.el.innerHTML = `<div class="tr-card"><div class="tr-n">${this.i + 1} / ${this.list.length}</div><p>${s.text}</p>
      <div class="tr-btns"><button class="rocker" data-t="back" ${this.i ? '' : 'disabled'}>‹ BACK</button>${s.demo ? '<button class="rocker" data-t="orig">▶ ORIGINAL</button>' : ''}<button class="rocker" data-t="hear">▶ HEAR${s.demo ? ' THE CHANGE' : ''}</button><button class="rocker" data-t="next">${s.end ? 'FINISH' : 'NEXT ›'}</button><button class="x" data-t="close">✕</button></div></div>`;
    this.el.querySelectorAll('[data-t]').forEach((b) => b.onclick = () => this.act(b.dataset.t));
    if (s.demo || this.i === 0) this.hear(!!s.demo);
  }
  act(a) {
    if (a === 'close') return this.close();
    if (a === 'back') { this.i = Math.max(0, this.i - 1); return this.show(); }
    if (a === 'next') { if (this.list[this.i].end) { this.close(); this.app.playbar.setTab('pads'); this.app.playbar.open(true); return; } this.i++; return this.show(); }
    if (a === 'hear') this.hear(!!this.list[this.i].demo);
    if (a === 'orig') this.hear(false);
  }
  /** Play the bird's first call, with this step's knob change applied (or not). */
  hear(changed) {
    const s = this.list[this.i], app = this.app;
    this.restore();
    if (changed && s.demo) {
      this.saved = {};
      for (const [k, v] of Object.entries(s.demo)) {
        if (!app.knobs[k]) continue;
        const cur = app.values[k]; this.saved[k] = cur;
        const nv = typeof v === 'function' ? v(cur) : v;
        app.knobs[k].setValue(nv); app.setValue(k, nv, false); app.knobs[k].flash();
      }
    }
    app.playCall('tour', 0); setTimeout(() => app.release('tour'), 60);
    const c = app.bird.calls[0];
    clearTimeout(this.t);
    this.t = setTimeout(() => this.restore(), Math.min(6000, c.f.length * c.hop * 1000 + 400));
  }
}
