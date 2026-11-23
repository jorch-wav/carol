// SCENE tab: a dawn chorus. Pick a habitat and its birds sing by themselves, each at its own pace, some near and
// some far, over a gentle generated ambience (breeze, creek or night). You can still play over the top: the bird on
// screen stays on its own engine slot; the scene's birds use slots SLOT0.. (the sequencer uses the low ones).
import { Knob } from './knob.js';
import { icon } from './icons.js';

const SLOT0 = 20;
const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ls = { get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };

export const HABITATS = {
  tasmania: { name: 'Tasmanian forest', amb: 'forest', birds: ['currawong', 'greenrosella', 'duskyrobin', 'yellowwattlebird', 'fairywren', 'shrikethrush', 'whistler', 'blackcockatoo'] },
  garden: { name: 'Australian garden', amb: 'garden', birds: ['magpie', 'wattlebird', 'lorikeet', 'wagtail', 'fairywren', 'kookaburra', 'galah'] },
  bush: { name: 'Eastern bush', amb: 'creek', birds: ['lyrebird', 'whipbird', 'bellminer', 'kookaburra', 'shrikethrush', 'whistler', 'butcherbird', 'rosella'] },
  parrots: { name: 'Parrot flock', amb: 'forest', birds: ['cockatoo', 'galah', 'lorikeet', 'rosella', 'gangang', 'blackcockatoo', 'greenrosella'] },
  night: { name: 'Night', amb: 'night', birds: ['boobook', 'frogmouth', 'curlew'] },
  europe: { name: 'European garden', amb: 'garden', birds: ['robin', 'pigeon'] },
};

export class Scene {
  constructor(app) {
    this.app = app;
    this.el = document.getElementById('scene');
    this.st = Object.assign({ habitat: 'tasmania', busy: 0.5, space: 0.45, amb: 0.35, off: {} }, ls.get('carol-scene', {}));
    this.playing = false; this.timer = null; this.birds = []; this.nextId = 1;
  }
  save() { ls.set('carol-scene', this.st); }
  hab() { return HABITATS[this.st.habitat] || HABITATS.tasmania; }
  ids() { return this.hab().birds.filter((id) => this.app.index.some((b) => b.id === id)); }

  render() {
    const el = this.el, h = this.hab();
    el.innerHTML = `
      <div class="sc-top">
        <button class="sc-go${this.playing ? ' on' : ''}">${icon(this.playing ? 'stop' : 'play')} ${this.playing ? 'STOP' : 'START'}</button>
        <div class="sc-habs">${Object.entries(HABITATS).map(([k, v]) => `<button data-h="${k}" class="${k === this.st.habitat ? 'on' : ''}">${esc(v.name)}</button>`).join('')}</div>
      </div>
      <div class="sc-mid"><div class="sc-knobs"></div><div class="sc-birds"></div></div>`;
    el.querySelector('.sc-go').onclick = () => (this.playing ? this.stop() : this.start());
    el.querySelectorAll('[data-h]').forEach((b) => b.onclick = () => this.setHabitat(b.dataset.h));
    const kb = el.querySelector('.sc-knobs');
    for (const [key, label, help] of [['busy', 'BUSY', 'How often the birds sing'], ['space', 'SPACE', 'Reverb: how open the place sounds'], ['amb', 'AMBIENCE', 'The breeze, creek or night sounds underneath']]) {
      const k = new Knob({ key, label, min: 0, max: 1, help }, { onChange: (v) => { this.st[key] = v; this.save(); this.apply(); } });
      k.setValue(this.st[key]); kb.appendChild(k.el);
    }
    const bl = el.querySelector('.sc-birds');
    for (const id of this.ids()) {
      const b = this.app.index.find((x) => x.id === id);
      const btn = document.createElement('button');
      btn.className = 'sc-bird' + (this.st.off[id] ? '' : ' on');
      btn.dataset.id = id;
      btn.innerHTML = `<img src="${esc(b.image)}" alt=""><span>${esc(b.name)}</span>`;
      btn.onclick = () => { this.st.off[id] = !this.st.off[id]; this.save(); btn.classList.toggle('on', !this.st.off[id]); };
      bl.appendChild(btn);
    }
  }
  setHabitat(k) {
    const was = this.playing;
    if (was) this.stop();
    this.st.habitat = k; this.save(); this.render();
    if (was) this.start();
  }

  async start() {
    const app = this.app, audio = app.audio;
    await audio.start().catch(() => {});
    if (!audio.ctx) return;
    this.playing = true; this.render();
    // the place: more reverb than the dry synth (put back on STOP)
    this.fxBefore = { fx_rmix: app.values.fx_rmix, fx_rsize: app.values.fx_rsize };
    // the birds: each on its own engine slot, singing whole calls (KEY MODE: ONE), some near and some far
    this.birds = [];
    const ids = this.ids();
    for (let i = 0; i < ids.length; i++) {
      const data = await app.seq.birdData(ids[i]).catch(() => null);
      if (!data || !this.playing) continue;
      const s = SLOT0 + i;
      audio.loadBird(data, s);
      const near = 0.35 + 0.6 * Math.random();
      audio.setParams({ mode: 0, volume: 0.25 + 0.6 * near }, s);
      this.birds.push({ id: ids[i], data, s, near, next: audio.now + 0.5 + Math.random() * 4 });
    }
    this.ambience(true);
    this.apply();
    this.timer = setInterval(() => this.tick(), 150);
  }
  stop() {
    const audio = this.app.audio;
    this.playing = false;
    clearInterval(this.timer); this.timer = null;
    for (const b of this.birds) { audio.allOff(b.s); audio.freeSlot(b.s); }
    this.birds = [];
    this.ambience(false);
    if (this.fxBefore) { for (const [k, v] of Object.entries(this.fxBefore)) if (v !== undefined) audio.setFx(k, v); this.fxBefore = null; }
    this.render();
  }
  /** BUSY / SPACE / AMBIENCE take effect now. */
  apply() {
    if (!this.playing) return;
    const audio = this.app.audio;
    audio.setFx('fx_rmix', 0.15 + 0.6 * this.st.space);
    audio.setFx('fx_rsize', 1.5 + 4 * this.st.space);
    if (this.amb) this.amb.gain.setTargetAtTime(0.5 * this.st.amb * this.st.amb, audio.ctx.currentTime, 0.3);
  }
  tick() {
    const audio = this.app.audio, now = audio.now;
    for (const b of this.birds) {
      if (now < b.next) continue;
      // the gap to this bird's next song: random (birds don't keep time), shorter when BUSY is up
      const mean = 2.5 + 16 * (1 - this.st.busy) * (1.2 - 0.4 * b.near);
      b.next = now + 0.6 + -Math.log(1 - Math.random()) * mean;
      if (this.st.off[b.id]) continue;
      this.sing(b, now + 0.05);
    }
  }
  sing(b, at) {
    const audio = this.app.audio, calls = b.data.calls;
    const ci = Math.floor(Math.random() * calls.length), c = calls[ci];
    const note = 69 + 12 * Math.log2(c.ref_hz / 440) + (Math.random() - 0.5) * 0.6;   // the bird's own pitch, a hair off
    const id = 900000 + this.nextId++, dur = c.f.length * c.hop;
    audio.noteOn(id, ci, this.app.tune(note), 0.55 + 0.4 * Math.random(), at, b.s, 'scene');
    audio.noteOff(id, at + dur + 0.2, b.s, 'scene');
    const chip = this.el.querySelector(`.sc-bird[data-id="${b.id}"]`);
    if (chip) { chip.classList.add('sing'); setTimeout(() => chip.classList.remove('sing'), Math.min(2500, dur * 1000 + 200)); }
  }

  /** A gentle bed under the birds, made from noise (nothing recorded): breeze, creek, garden or night. */
  ambience(on) {
    const ctx = this.app.audio.ctx;
    if (this.amb) { const g = this.amb; g.gain.setTargetAtTime(0, ctx.currentTime, 0.4); setTimeout(() => { try { this.ambNodes.forEach((n) => n.stop && n.stop()); g.disconnect(); } catch {} }, 2000); this.amb = null; }
    if (!on || !ctx) return;
    const kind = this.hab().amb, sr = ctx.sampleRate;
    const buf = ctx.createBuffer(2, sr * 4, sr);
    for (let c = 0; c < 2; c++) {   // pink-ish noise (a few one-pole stages), looped
      const d = buf.getChannelData(c); let b0 = 0, b1 = 0, b2 = 0;
      for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; b0 = 0.997 * b0 + 0.029 * w; b1 = 0.985 * b1 + 0.032 * w; b2 = 0.95 * b2 + 0.048 * w; d[i] = (b0 + b1 + b2 + w * 0.02) * 0.6; }
    }
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    const out = ctx.createGain(); out.gain.value = 0;
    const nodes = [src];
    const lfo = (rate, depth, param) => { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = rate; g.gain.value = depth; o.connect(g).connect(param); o.start(); nodes.push(o); };
    if (kind === 'creek') {
      // running water: bands of noise, each wobbling quickly
      for (const [f, q] of [[600, 1.2], [1400, 1.5], [2800, 2]]) {
        const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = q;
        const g = ctx.createGain(); g.gain.value = 0.5;
        lfo(5 + Math.random() * 9, 0.35, g.gain); lfo(0.3 + Math.random(), f * 0.25, bp.frequency);
        src.connect(bp).connect(g).connect(out);
      }
    } else {
      // breeze through leaves: dark noise rising and falling in slow gusts
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = kind === 'night' ? 500 : 900;
      const g = ctx.createGain(); g.gain.value = 0.55;
      lfo(0.07, 0.35, g.gain); lfo(0.11, 350, lp.frequency);
      src.connect(lp).connect(g).connect(out);
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 3500;   // leaves
      const g2 = ctx.createGain(); g2.gain.value = kind === 'night' ? 0.02 : 0.07; lfo(0.13, 0.05, g2.gain);
      src.connect(hp).connect(g2).connect(out);
      if (kind === 'night') {
        // crickets: a high tone chirping in short pulses
        const o = ctx.createOscillator(); o.frequency.value = 4600;
        const gate = ctx.createGain(); gate.gain.value = 0;
        const pulse = ctx.createOscillator(); pulse.type = 'square'; pulse.frequency.value = 28;
        const pg = ctx.createGain(); pg.gain.value = 0.02; pulse.connect(pg).connect(gate.gain);
        const slow = ctx.createOscillator(); slow.type = 'square'; slow.frequency.value = 0.9;
        const sg = ctx.createGain(); sg.gain.value = 0.02; slow.connect(sg).connect(gate.gain);
        o.connect(gate).connect(out); o.start(); pulse.start(); slow.start(); nodes.push(o, pulse, slow);
      }
    }
    src.start();
    out.connect(this.app.audio.fx.input);
    this.amb = out; this.ambNodes = nodes;
  }
}
