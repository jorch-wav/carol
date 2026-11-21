// Sequencer (SEQ tab): 16 steps, up to 6 rows. Each row is one call from any bird, so rows from
// different birds make a dawn chorus. Steps are scheduled ahead on the audio thread (sample-timed);
// tempo can follow AudioView (the Pi's shared tempo) or incoming MIDI clock.
import { icon } from './icons.js';
import { withCallMode } from './gen.js';
const ls = { get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const STEPS = 16, MAXROWS = 6, LOOK = 0.12;

// built-in patterns: rows pick a bird and the first call whose name starts with `call`
const S = (str) => [...str].map((c) => (c === 'x' ? 2 : c === 'o' ? 1 : 0));
const DEMOS = {
  'Dawn chorus': { bpm: 92, swing: 0.1, rows: [
    { bird: 'robin', call: 'Song', steps: S('x...............') },
    { bird: 'cardinal', call: 'Chip', steps: S('....x.....o.x...') },
    { bird: 'pigeon', call: 'Coo', steps: S('........x.......') },
    { bird: 'magpie', call: 'Carol', steps: S('..........x.....') },
    { bird: 'wattlebird', call: 'Call', steps: S('.x.....o.....x..') },
  ] },
  'Bush groove': { bpm: 104, swing: 0.2, rows: [
    { bird: 'kookaburra', call: 'Laugh', steps: S('x...............') },
    { bird: 'wattlebird', call: 'Call', steps: S('..x...x...x...xo') },
    { bird: 'rosella', call: 'Piping', steps: S('....x.......x...') },
    { bird: 'magpie', call: 'Warble', steps: S('........x.......') },
  ] },
  'Cloud forest': { bpm: 76, swing: 0, rows: [
    { bird: 'quetzal', call: 'Song', steps: S('x.......x.......') },
    { bird: 'quetzal', call: 'Call', steps: S('......x.......o.') },
    { bird: 'pigeon', call: 'Coo', steps: S('....x.......x...') },
  ] },
  'One bird': { bpm: 110, swing: 0.15, rows: [
    { bird: null, call: 0, steps: S('x...x...x...x...') },
    { bird: null, call: 1, steps: S('..x...x...x...x.') },
    { bird: null, call: 2, steps: S('......o.......x.') },
  ] },
};

export class Sequencer {
  constructor(app) {
    this.app = app;
    this.el = $('seq');
    this.st = ls.get('carol-seq', null) || { bpm: 100, swing: 0, cur: 'A', pats: {} };
    this.playing = false; this.step = 0; this.nextT = 0; this.id = 1e6;
    this.cache = {}; this.slotOf = {}; this.taps = []; this.ticks = 0; this.tickT = [];
    this.timer = null;
    if (!this.pat().rows.length) this.st.pats[this.st.cur] = this.fromDemo('One bird').pat;
    setInterval(() => this.followAudioView(), 600);
  }
  pat() { return (this.st.pats[this.st.cur] ||= { rows: [] }); }
  save() { ls.set('carol-seq', this.st); }
  sync() { return this.app.settings.sync; }

  // ------------------------------------------------------------ birds and slots
  async birdData(id) {
    if (!id || (this.app.bird && id === this.app.bird.id)) return this.app.bird;
    if (!this.cache[id]) this.cache[id] = withCallMode(this.app.userBirds[id] || await (await fetch(`presets/${id}.json`)).json(), this.app.settings.callMode);
    return this.cache[id];
  }
  rowBird(r) { return !r.bird || r.bird === this.app.bird?.id ? this.app.bird : this.cache[r.bird]; }
  rowSlot(r) { return !r.bird || r.bird === this.app.bird?.id ? 0 : this.slotOf[r.bird]; }
  /** Load every other bird the pattern uses into its own engine slot. */
  async slots() {
    const want = [...new Set(this.pat().rows.map((r) => r.bird).filter((b) => b && b !== this.app.bird?.id))];
    for (const id of Object.keys(this.slotOf)) if (!want.includes(id)) { this.app.audio.freeSlot(this.slotOf[id]); delete this.slotOf[id]; }
    const used = new Set(Object.values(this.slotOf));
    for (const id of want) {
      if (this.slotOf[id]) continue;
      let s = 1; while (used.has(s)) s++;
      used.add(s); this.slotOf[id] = s;
      try {
        const b = await this.birdData(id);
        this.app.audio.loadBird(b, s);
        const tw = ls.get('carol-tweaks-' + id, {});
        if (Object.keys(tw).length) this.app.audio.setParams(tw, s);
      } catch (e) { console.warn('seq: no bird', id, e); }
    }
  }
  /** The bird on screen changed: rows for it now use slot 0, the old one may need a slot. */
  birdChanged() { this.slots().then(() => this.render()); }

  // ------------------------------------------------------------ patterns
  fromDemo(name) {
    const d = DEMOS[name];
    return { bpm: d.bpm, swing: d.swing, pat: { rows: d.rows.map((r) => ({ bird: r.bird, call: r.call, tr: 0, steps: r.steps.slice() })) } };
  }
  async loadDemo(name) {
    const d = this.fromDemo(name);
    for (const r of d.pat.rows) {
      if (typeof r.call === 'string') {
        const b = await this.birdData(r.bird).catch(() => null);
        const i = b ? b.calls.findIndex((c) => c.name.startsWith(r.call)) : -1;
        r.call = Math.max(0, i);
      }
    }
    this.st.pats[this.st.cur] = d.pat; this.st.bpm = d.bpm; this.st.swing = d.swing;
    this.save(); await this.slots(); this.render();
    this.app.toast(name);
  }
  addRow() {
    const rows = this.pat().rows; if (rows.length >= MAXROWS) return;
    rows.push({ bird: null, call: Math.min(rows.length, (this.app.bird?.calls.length || 1) - 1), tr: 0, steps: new Array(STEPS).fill(0) });
    this.save(); this.render();
  }

  // ------------------------------------------------------------ transport
  stepDur() { return 60 / this.st.bpm / 4; }
  toggle() { this.playing ? this.stop() : this.start(); }
  async start() {
    if (this.playing) return;
    await this.app.audio.start().catch(() => {});
    await this.slots();
    this.playing = true; this.step = 0;
    if (this.sync() === 'midi') { this.ticks = 0; this.renderTransport(); return; }   // steps come from the clock
    this.nextT = this.app.audio.now + 0.06;
    this.app.midi.clockOut(0xfa, this.nextT);
    clearInterval(this.timer); this.timer = setInterval(() => this.pump(), 25);
    this.pump(); this.renderTransport();
  }
  stop() {
    if (!this.playing) return;
    this.playing = false; clearInterval(this.timer); this.timer = null;
    this.app.audio.unqueue('seq');
    this.app.midi.clockOut(0xfc);
    this.mark(-1); this.renderTransport();
  }
  pump() {
    const now = this.app.audio.now;
    if (this.nextT < now - 0.2) this.nextT = now + 0.02;   // fell behind (tab asleep): catch up without a burst
    while (this.nextT < now + LOOK) {
      const swing = this.step % 2 ? this.st.swing * this.stepDur() * 0.66 : 0;
      this.fire(this.step, this.nextT + swing);
      for (let k = 0; k < 6; k++) this.app.midi.clockOut(0xf8, this.nextT + k * this.stepDur() / 6);
      this.nextT += this.stepDur();
      this.step = (this.step + 1) % STEPS;
    }
  }
  fire(step, at) {
    const app = this.app, dur = this.stepDur();
    for (const r of this.pat().rows) {
      const v = r.steps[step]; if (!v) continue;
      const b = this.rowBird(r), s = this.rowSlot(r);
      if (!b || s === undefined || !b.calls.length) continue;
      const ci = Math.min(r.call, b.calls.length - 1), c = b.calls[ci];
      const note = 69 + 12 * Math.log2(c.ref_hz / 440) + (r.tr || 0) + 12 * (app.octave || 0);
      const vel = v === 2 ? 0.95 : 0.55, id = this.id++;
      app.audio.noteOn(id, ci, app.tune(note), vel, at, s, 'seq');
      app.audio.noteOff(id, at + dur * 0.95, s, 'seq');
      app.midi.noteOut(note, vel, true, at); app.midi.noteOut(note, 0, false, at + dur * 0.9);
    }
    const ms = Math.max(0, (at - app.audio.now) * 1000);
    setTimeout(() => this.mark(step), ms);
  }
  // MIDI clock in (24 per beat, 6 per step)
  clockTick() {
    if (this.sync() !== 'midi') return;
    const t = performance.now(); this.tickT.push(t); if (this.tickT.length > 48) this.tickT.shift();
    if (this.tickT.length > 12) { const dt = (t - this.tickT[0]) / (this.tickT.length - 1); const bpm = 60000 / (dt * 24); if (Math.abs(bpm - this.st.bpm) > 0.5) { this.st.bpm = Math.round(bpm * 10) / 10; this.renderTransport(); } }
    if (!this.playing) return;
    if (this.ticks % 6 === 0) { this.fire(this.step, this.app.audio.now + 0.005); this.step = (this.step + 1) % STEPS; }
    this.ticks++;
  }
  clockStart(cont) { if (this.sync() !== 'midi') return; if (!cont) { this.step = 0; this.ticks = 0; } this.start(); }
  clockStop() { if (this.sync() === 'midi') this.stop(); }
  // AudioView's shared tempo (Pi only): follow its BPM and PLAY / STOP
  async followAudioView() {
    if (this.sync() !== 'audioview') return;
    try {
      const t = await (await fetch('tempo', { cache: 'no-store' })).json();
      if (Math.abs(t.bpm - this.st.bpm) > 0.05) { this.st.bpm = t.bpm; this.save(); this.renderTransport(); }
      if (t.running && !this.playing) this.start(); else if (!t.running && this.playing && this._avRunning) this.stop();
      this._avRunning = t.running;
    } catch { /* not on the Pi */ }
  }
  setBpm(b) { this.st.bpm = Math.max(30, Math.min(240, Math.round(b * 10) / 10)); this.save(); this.renderTransport(); }
  tap() {
    const t = performance.now(); this.taps = this.taps.filter((x) => t - x < 2500); this.taps.push(t);
    if (this.taps.length >= 3) { const d = (t - this.taps[0]) / (this.taps.length - 1); this.setBpm(60000 / d); }
  }

  // ------------------------------------------------------------ UI
  mark(step) {
    this.el.querySelectorAll('.sq-cell.now').forEach((c) => c.classList.remove('now'));
    if (step >= 0) this.el.querySelectorAll(`.sq-cell[data-s="${step}"]`).forEach((c) => c.classList.add('now'));
  }
  renderTransport() {
    const p = this.el.querySelector('.sq-play'); if (!p) return;
    p.innerHTML = this.playing ? icon('stop') + ' STOP' : icon('play') + ' PLAY'; p.classList.toggle('on', this.playing);
    this.app.audio.fx && this.app.audio.fx.tempo(this.st.bpm);
    this.el.querySelector('.sq-bpm').textContent = this.st.bpm.toFixed(this.st.bpm % 1 ? 1 : 0);
    const follow = this.sync() !== 'off';
    this.el.querySelector('.sq-sync').textContent = follow ? (this.sync() === 'midi' ? 'MIDI CLOCK' : 'AUDIOVIEW') : '';
  }
  render() {
    const app = this.app, el = this.el, pat = this.pat();
    if (!app.bird) return;
    el.innerHTML = `
      <div class="sq-top">
        <button class="sq-play">${icon('play')} PLAY</button>
        <span class="sq-tempo"><button data-a="bpm-">−</button><b class="sq-bpm"></b><button data-a="bpm+">+</button><button data-a="tap">TAP</button></span>
        <label class="sq-swing">SWING <select data-a="swing">${[0, 0.1, 0.2, 0.3, 0.4, 0.5].map((v) => `<option value="${v}" ${Math.abs(v - this.st.swing) < 0.01 ? 'selected' : ''}>${v * 100}%</option>`).join('')}</select></label>
        <span class="sq-pats">${['A', 'B', 'C', 'D'].map((k) => `<button data-p="${k}" class="${k === this.st.cur ? 'on' : ''}">${k}</button>`).join('')}</span>
        <button data-a="midi" title="Save this pattern as a MIDI file">${icon('download')} MIDI</button>
        <select data-a="demo"><option value="">PATTERNS…</option>${Object.keys(DEMOS).map((k) => `<option>${k}</option>`).join('')}<option value="__clear">Clear</option></select>
        <small class="sq-sync"></small>
      </div>
      <div class="sq-grid"></div>`;
    const grid = el.querySelector('.sq-grid');
    pat.rows.forEach((r, ri) => {
      const b = this.rowBird(r);
      const row = document.createElement('div'); row.className = 'sq-row';
      const call = b && b.calls[Math.min(r.call, b.calls.length - 1)];
      const head = document.createElement('button'); head.className = 'sq-head';
      head.innerHTML = `${b && b.image ? `<img src="${esc(b.image)}" alt="">` : '<i></i>'}<span><b>${esc(call ? call.name : '…')}</b><small>${esc(b ? b.name : 'loading')}${r.tr ? ` ${r.tr > 0 ? '+' : ''}${r.tr}` : ''}</small></span>`;
      head.onclick = () => this.editRow(ri);
      row.appendChild(head);
      for (let s = 0; s < STEPS; s++) {
        const c = document.createElement('button');
        c.className = 'sq-cell' + (s % 4 === 0 ? ' beat' : '') + (r.steps[s] === 2 ? ' on' : r.steps[s] === 1 ? ' soft' : '');
        c.dataset.s = s;
        c.onpointerdown = (e) => { e.preventDefault(); r.steps[s] = (r.steps[s] + 2) % 3; this.save(); c.className = 'sq-cell' + (s % 4 === 0 ? ' beat' : '') + (r.steps[s] === 2 ? ' on' : r.steps[s] === 1 ? ' soft' : ''); };
        row.appendChild(c);
      }
      grid.appendChild(row);
    });
    if (pat.rows.length < MAXROWS) {
      const add = document.createElement('button'); add.className = 'sq-add'; add.textContent = '+ ROW'; add.onclick = () => this.addRow();
      grid.appendChild(add);
    }
    el.querySelector('.sq-play').onclick = () => this.toggle();
    el.querySelectorAll('[data-a]').forEach((x) => {
      const a = x.dataset.a;
      if (x.tagName === 'SELECT') x.onchange = () => {
        if (a === 'swing') { this.st.swing = Number(x.value); this.save(); }
        if (a === 'demo') { if (x.value === '__clear') { pat.rows.forEach((r) => r.steps.fill(0)); this.save(); this.render(); } else if (x.value) this.loadDemo(x.value); }
      };
      else x.onclick = () => { if (a === 'bpm-') this.setBpm(this.st.bpm - 1); if (a === 'bpm+') this.setBpm(this.st.bpm + 1); if (a === 'tap') this.tap(); if (a === 'midi') this.exportMidi(); };
    });
    el.querySelectorAll('[data-p]').forEach((x) => x.onclick = () => { this.st.cur = x.dataset.p; if (!this.pat().rows.length) this.pat().rows = this.fromDemo('One bird').pat.rows; this.save(); this.slots().then(() => this.render()); });
    this.renderTransport();
  }
  /** The current pattern as a MIDI file: one bar, each row's call pitch as a note (swing included). */
  async exportMidi() {
    const ev = [];
    for (const r of this.pat().rows) {
      const b = await this.birdData(r.bird).catch(() => null); if (!b) continue;
      const c = b.calls[Math.min(r.call, b.calls.length - 1)];
      const n = Math.max(0, Math.min(127, Math.round(69 + 12 * Math.log2(c.ref_hz / 440) + (r.tr || 0) + 12 * (this.app.octave || 0))));
      r.steps.forEach((v, s) => { if (v) ev.push({ t: s * 120 + (s % 2 ? Math.round(this.st.swing * 120 * 0.66) : 0), d: 110, n, v: v === 2 ? 110 : 64 }); });
    }
    if (!ev.length) return this.app.toast('The pattern is empty');
    const { midiBlob, saveFile } = await import('./fx.js');
    await saveFile(midiBlob(ev, this.st.bpm, `Carol pattern ${this.st.cur}`), `carol-pattern-${this.st.cur}.mid`);
  }
  /** Row editor: pick the bird and call, transpose, remove. */
  async editRow(ri) {
    const r = this.pat().rows[ri]; if (!r) return;
    const box = $('seqEdit');
    const birds = this.app.index;
    const b = await this.birdData(r.bird);
    box.innerHTML = `
      <div class="se-sheet">
        <div class="ll-head"><h2>ROW ${ri + 1}</h2><button class="x" data-close aria-label="Close">${icon('close')}</button></div>
        <label class="field">Bird <select id="seBird"><option value="">The bird on screen</option>${birds.map((x) => `<option value="${esc(x.id)}" ${x.id === r.bird ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>
        <label class="field">Call <select id="seCall">${(b ? b.calls : []).map((c, i) => `<option value="${i}" ${i === r.call ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
        <div class="field">Transpose <span class="se-tr"><button data-d="-12">−12</button><button data-d="-1">−1</button><b>${r.tr > 0 ? '+' : ''}${r.tr || 0}</b><button data-d="1">+1</button><button data-d="12">+12</button></span></div>
        <div class="im-actions"><button class="rocker" id="seHear">${icon('play')} HEAR</button><button class="rocker" id="seDel">REMOVE ROW</button><button class="rocker" id="seOk">DONE</button></div>
      </div>`;
    box.hidden = false;
    const close = () => { box.hidden = true; this.save(); this.slots().then(() => this.render()); };
    box.querySelector('[data-close]').onclick = close; $('seOk').onclick = close;
    box.onpointerdown = (e) => { if (e.target === box) close(); };
    $('seBird').onchange = async () => { r.bird = $('seBird').value || null; r.call = 0; await this.slots(); this.editRow(ri); };
    $('seCall').onchange = () => { r.call = Number($('seCall').value); };
    box.querySelectorAll('[data-d]').forEach((x) => x.onclick = () => { r.tr = Math.max(-24, Math.min(24, (r.tr || 0) + Number(x.dataset.d))); box.querySelector('.se-tr b').textContent = (r.tr > 0 ? '+' : '') + r.tr; });
    $('seDel').onclick = () => { this.pat().rows.splice(ri, 1); close(); };
    // HEAR plays just this row's call
    $('seHear').onclick = async () => {
      await this.slots();
      const bb = this.rowBird(r), s = this.rowSlot(r); if (!bb || s === undefined) return;
      const ci = Math.min(r.call, bb.calls.length - 1), c = bb.calls[ci];
      const note = 69 + 12 * Math.log2(c.ref_hz / 440) + (r.tr || 0) + 12 * (this.app.octave || 0), id = this.id++, at = this.app.audio.now + 0.02;
      this.app.audio.noteOn(id, ci, this.app.tune(note), 0.95, at, s); this.app.audio.noteOff(id, at + 0.3, s);
    };
  }
}
