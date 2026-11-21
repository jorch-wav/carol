// Carol — app glue.
import { CarolAudio, PLAYER_KEYS } from './audio.js';
import { Knob, toNorm } from './knob.js';
import { compute, PART_INFO, mixHex } from './birdmodel.js';
import { View2D } from './view2d.js';
import { View3D } from './view3d.js';
import { Sono } from './sono.js';
import { Wave } from './wave.js';
import { zoomable } from './zoom.js';
import { PlayBar } from './playbar.js';
import { Presets } from './presets.js';
import { Learn } from './learn.js';
import { Midi } from './midi.js';
import { Importer, store } from './importer.js';
import { scalePCs, snap, degree, homeNote, noteName } from './scales.js';
import { Sequencer } from './seq.js';
import { SettingsUI, loadSettings, saveSettings } from './settings.js';
import { Tour } from './tour.js';
import { FX_PARAMS, saveFile } from './fx.js';
import { icon, applyIcons } from './icons.js';
import { withCallMode } from './gen.js';

const SECTIONS = ['LUNGS', 'SYRINX', 'WINDPIPE', 'THROAT', 'TONGUE', 'BEAK', 'PLAY', 'SHAPE', 'LFO', 'FX'];
// player controls: not part of the bird, so no amber "real bird" dot
const STEPPED = { mode: ['ONE', 'GATE', 'LOOP', 'SUSTAIN'], vmode: ['POLY', 'MONO', 'LEGATO'] };
// Order for hardware knob pages and the Korg K1-K8.
const HW_ORDER = ['pressure', 'tension', 'mass', 'trachea', 'oec', 'tongue_h', 'beak', 'turb', 'breath', 'echo', 'oec_track', 'tongue_p', 'beak_track', 'two', 'two_int', 'split', 'coupling', 'oec_depth', 'mouth_q', 'pulse', 'speed', 'sweep', 'mode', 'volume', 'sac', 'sac_q', 'closure', 'mouth', 'attack', 'release', 'glide', 'vmode', 'lfo_rate', 'vibrato', 'tremolo', 'fx_cut', 'fx_res', 'fx_dtime', 'fx_fb', 'fx_dmix', 'fx_rsize', 'fx_rmix'];
const ls = { get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };
const $ = (id) => document.getElementById(id);

class App {
  async init() {
    this.defs = await (await fetch('bodies.json')).json();
    // the built-in effects are knobs too (handled in the page, not the engine)
    for (const p of FX_PARAMS) this.defs.params.push({ ...p, bodies: this.defs.bodies.slice() });
    this.audio = new CarolAudio(this.defs);
    this.values = {}; this.knobs = {}; this.held = new Map(); this.latched = new Map(); this.nextId = 1;
    this.settings = loadSettings();
    this.audio.variety = this.settings.variety;
    // the player sections start folded (tap a title to open), so the bird's own knobs stay big
    if (!ls.get('carol-folded-v2', false)) { ls.set('carol-folded', [...new Set([...ls.get('carol-folded', []), 'SHAPE', 'LFO', 'FX'])]); ls.set('carol-folded-v2', true); }
    this.hold = false; this.sustainOn = false; this.rpt = false; this.learning = false; this.learnTarget = null;
    this.scale = ls.get('carol-scale', { type: 'bird', root: 0 });
    this.octave = 0; this.callIdx = 0; this.page = 0; this.bendV = 0;
    this.randomCalls = ls.get('carol-keys-random', false); this.lastRandom = -1;
    this.view = ls.get('carol-view', '2d');
    if (this.view === 'scope') this.view = 'sono';
    this.v2 = new View2D($('view2d'));
    this.v3 = new View3D($('view3d'));
    this.sono = new Sono($('sono'));
    this.wave = new Wave($('wave'));
    this.playbar = new PlayBar(this);
    this.presets = new Presets(this);
    this.learn = new Learn(this);
    this.importer = new Importer(this);
    this.midi = new Midi(this);
    this.seq = new Sequencer(this);
    this.settingsUI = new SettingsUI(this);
    this.tour = new Tour(this);
    applyIcons();
    this.buildMainKnob();
    this.bindTop();
    await this.refreshIndex();
    const last = ls.get('carol-bird', null);
    const shared = this.readShareLink();
    const first = this.index.find((b) => b.id === 'magpie') ? 'magpie' : this.index[0].id;
    await this.loadBird(shared ? shared.bird : this.index.find((b) => b.id === last) ? last : first);
    if (shared) this.applyTweaks(shared.t, true);
    this.setView(this.view);
    this.playbar.syncScale();
    addEventListener('resize', () => this.resize());
    new ResizeObserver(() => this.resize()).observe($('view'));
    this.resize();
    this.wake();
    this.midi.start();
    setInterval(() => this.rptPump(), 25);
    this.loop();
  }

  // ---------------------------------------------------------------- audio start
  wake() {
    const go = async () => {
      try { await this.audio.start(); } catch (e) { console.error(e); }
      if (this.audio.fx) this.audio.fx.tempo(this.seq.st.bpm);
      if (this.audio.running) { $('start').hidden = true; removeEventListener('pointerdown', go, true); removeEventListener('keydown', go, true); }
    };
    addEventListener('pointerdown', go, true); addEventListener('keydown', go, true);
    // iPhone: sound even with the ring/silent switch on silent (needs a real tap, so try on release too)
    const unmute = () => { this.audio.unmuteIOS(); if (this.audio._silent) { removeEventListener('touchend', unmute, true); removeEventListener('click', unmute, true); } };
    addEventListener('touchend', unmute, true); addEventListener('click', unmute, true);
    $('startBtn').onclick = go;
    go().then(() => { if (!this.audio.running) $('start').hidden = false; });
  }

  // ---------------------------------------------------------------- birds
  async refreshIndex() {
    const idx = await (await fetch('presets/index.json')).json();
    const mine = await store.all();
    this.userBirds = Object.fromEntries(mine.map((b) => [b.id, b]));
    this.index = idx.birds.concat(mine.map((b) => ({ id: b.id, name: b.name, sci: b.sci, body: b.body, tags: b.tags, collection: 'My Birds', match: b.match && b.match.total })));
    this.collections = (idx.collections || []).map((c) => typeof c === 'string' ? { name: c } : c);
    if (mine.length) this.collections.push({ name: 'My Birds', region: 'Your recordings', count: mine.length });
    // My Presets: a bird plus your knob changes, saved on this device
    this.myPresets = ls.get('carol-mypresets', []);
    for (const m of this.myPresets) {
      const base = this.index.find((b) => b.id === m.base);
      if (base) this.index.push({ id: m.id, name: m.name, sci: base.name, body: base.body, image: base.image, image_caption: base.image_caption, collection: 'My Presets', mine: true });
    }
    if (this.myPresets.length) this.collections.push({ name: 'My Presets', region: 'saved sounds', count: this.myPresets.length });
  }
  async loadBird(id) {
    const prevLook = this.bird && this.bird.look, prevVals = { ...this.values };
    const mine = (this.myPresets || []).find((m) => m.id === id);
    if (mine) { await this.loadBird(mine.base); this.applyTweaks(mine.t, true); ls.set('carol-bird', id); this.toast(mine.name); return; }
    const b = withCallMode(this.userBirds[id] || await (await fetch(`presets/${id}.json`)).json(), this.settings.callMode);
    this.bird = b;
    ls.set('carol-bird', id);
    this.audio.loadBird(b);
    this.callIdx = Math.min(ls.get('carol-call-' + id, 0), b.calls.length - 1);
    // header
    $('birdName').textContent = b.name; $('birdSci').textContent = b.sci || '';
    this.showPlate();
    $('matchBadge').innerHTML = b.match ? `<b>${Math.round(b.match.total)}%</b>MATCH TO BIRD` : '';
    this.buildPanel();
    // morph: the bird reshapes from the old one, and the knobs both birds share glide to their new settings
    if (prevLook && prevLook !== b.look) {
      this.morph = { from: prevLook, to: b.look, t0: performance.now() };
      const glide = {};
      for (const [k, kn] of Object.entries(this.knobs)) if (prevVals[k] !== undefined && !kn.steps) glide[k] = [toNorm(kn.p, prevVals[k]), kn.u];
      this.knobGlide = { keys: glide, t0: performance.now() };
      for (const [k, [u0]] of Object.entries(glide)) this.knobs[k].setU(u0, false);
    }
    // new bird: reframe both views right away, zoom back to 1
    this.v2.box = null; this.v2.zoom = 1; this.v2.pan = [0, 0]; this.v3.snap = true; this.v3.dist = 1;
    // restore this bird's tweaks
    const tweaks = ls.get('carol-tweaks-' + id, {});
    for (const [k, v] of Object.entries(tweaks)) if (this.knobs[k]) { this.knobs[k].setValue(v); this.setValue(k, v, false); }
    this.playbar.syncScale(); this.playbar.renderPads(); this.playbar.renderCall();
    if (this.learn.openNow) this.learn.show(this.learn.tab);
    if (this.seq) { this.seq.birdChanged(); }
    if (this.tour && !this.tour.el.hidden) this.tour.close();
    this.toast(b.name);
  }
  // ---------------------------------------------------------------- plates (each bird has a small gallery)
  /** A bird's plates (preset or index entry). */
  plates(b) {
    return (b.plates && b.plates.length ? b.plates : b.image ? [{ image: b.image, caption: b.image_caption || b.name, artist: '' }] : []).slice();
  }
  /** Which plate to show: the one you picked for this bird, else your preferred artist, else the first. */
  plateIndex(b) {
    const list = this.plates(b); if (!list.length) return -1;
    const pick = ls.get('carol-plate-' + b.id, null);
    if (pick !== null && pick < list.length) return pick;
    const pref = this.settings.prefArtist;
    const i = pref ? list.findIndex((p) => (p.artist || '').includes(pref)) : -1;
    return i >= 0 ? i : 0;
  }
  plateOf(b) { const list = this.plates(b), i = this.plateIndex(b); return i >= 0 ? list[i] : null; }
  setPlate(b, i) {
    const n = this.plates(b).length; if (!n) return;
    ls.set('carol-plate-' + b.id, ((i % n) + n) % n);
    if (this.bird && b.id === this.bird.id) this.showPlate();
    if (!this.presets.el.hidden) this.presets.showPlate();
  }
  /** Swipe on the plate: the bird's next / previous plate, with a moment's label saying whose it is. */
  swipePlate(d) {
    const b = this.bird, list = this.plates(b); if (list.length < 2) return;
    this.setPlate(b, this.plateIndex(b) + d);
    const p = this.plateOf(b), i = this.plateIndex(b), badge = $('plBadge');
    badge.textContent = `${(p.artist || '').split(/[;(]/)[0].trim()}${p.year ? ' · ' + p.year : ''} · ${i + 1}/${list.length}`;
    badge.hidden = false; badge.classList.remove('fade'); void badge.offsetWidth; badge.classList.add('fade');
    clearTimeout(this._badgeT); this._badgeT = setTimeout(() => { badge.hidden = true; }, 1800);
  }
  /** Show the chosen plate in the top bar thumbnail and the PLATE view. */
  showPlate() {
    const b = this.bird, p = this.plateOf(b), list = this.plates(b), i = this.plateIndex(b);
    const th = $('birdThumb'); if (p) { th.src = p.image; th.style.display = ''; } else th.style.display = 'none';
    const pi = $('plateImg'); if (p) pi.src = p.image; else pi.removeAttribute('src');
    $('plateCap').textContent = p ? p.caption : 'No illustration for this bird.';   // full credits: Learn > Sources
  }
  morphLook(now) {
    const m = this.morph; if (!m) return this.bird.look;
    const t = Math.min(1, (now - m.t0) / 1100), e = t * t * (3 - 2 * t);
    if (t >= 1) { this.morph = null; return this.bird.look; }
    return lerpLook(m.from, m.to, e);
  }
  morphKnobs(now) {
    const g = this.knobGlide; if (!g) return;
    const t = Math.min(1, (now - g.t0) / 900), e = t * t * (3 - 2 * t);
    for (const [k, [u0, u1]] of Object.entries(g.keys)) if (this.knobs[k]) this.knobs[k].setU(u0 + (u1 - u0) * e, false);
    if (t >= 1) this.knobGlide = null;
  }
  birdValue(p) { return PLAYER_KEYS.includes(p.key) ? p.default : (this.bird.params[p.key] ?? p.default); }
  buildPanel() {
    const box = $('knobs'); box.innerHTML = ''; this.knobs = {}; this.values = {};
    const body = this.bird.body;
    const ps = this.defs.params.filter((p) => p.bodies.includes(body));
    this.hwKnobs = HW_ORDER.filter((k) => ps.some((p) => p.key === k));
    for (const sec of SECTIONS) {
      const list = ps.filter((p) => p.section === sec);
      if (!list.length) continue;
      const s = document.createElement('div'); s.className = 'section';
      s.innerHTML = `<h3>${sec}</h3><div class="grid"></div>`;
      // tap a section title to fold it away
      const folded = new Set(ls.get('carol-folded', []));
      s.classList.toggle('collapsed', folded.has(sec));
      s.querySelector('h3').onclick = () => {
        const f = new Set(ls.get('carol-folded', []));
        f.has(sec) ? f.delete(sec) : f.add(sec);
        ls.set('carol-folded', [...f]);
        s.classList.toggle('collapsed', f.has(sec));
        this.fitKnobs();
      };
      const g = s.querySelector('.grid');
      g.style.gridTemplateRows = `repeat(${Math.min(3, list.length)}, auto)`;
      for (const p of list) {
        const k = new Knob(p, {
          steps: p.steps || (STEPPED[p.key] ? STEPPED[p.key].length : 0), stepLabels: p.stepLabels || STEPPED[p.key] || [],
          onChange: (v) => this.setValue(p.key, v, true),
          onTouch: (kn) => { this.hint(p); if (this.learning) { document.querySelectorAll('.kn.learn-target').forEach((e) => e.classList.remove('learn-target')); this.learnTarget = p.key; (kn || this.knobs[p.key]).el.classList.add('learn-target'); } },
        });
        const bv = this.birdValue(p);
        k.setBird(PLAYER_KEYS.includes(p.key) || p.key.startsWith('fx_') ? null : bv);
        if (p.key.startsWith('fx_')) this.audio.setFx(p.key, bv);
        k.setValue(bv);
        this.values[p.key] = bv;
        this.knobs[p.key] = k;
        g.appendChild(k.el);
      }
      box.appendChild(s);
    }
    this.markPage();
    this.fitKnobs();
  }
  /** Size the knobs to the space they have: one row of sections on wide screens
   *  (2 or 3 knob rows, whichever gives bigger knobs), stacked sections on a phone. */
  /** Wide, short screens (the Pi, a phone on its side): big knobs in a strip that scrolls sideways. */
  wideShort() { return innerWidth > innerHeight && innerHeight < 800 && innerWidth >= 560; }
  stripMode() { return this.wideShort() && ls.get('carol-knob-layout', 'strip') === 'strip'; }
  setKnobLayout(m) { ls.set('carol-knob-layout', m); this.fitKnobs(); }
  fitStrip(box, secs, counts) {
    const work = document.querySelector('.work');
    if (innerWidth > 900) work.style.gridTemplateColumns = '';   // the view keeps its usual width
    const H = box.clientHeight - 44, big = innerHeight >= 600;
    const kmax = big ? 104 : 96, want = big ? 82 : 56;
    let rows = 1, k = Math.floor(H - 36 - 64);
    for (const r of [3, 2]) { const kk = Math.floor((H - 36) / r - 64); if (kk >= want) { rows = r; k = kk; break; } }
    k = Math.max(40, Math.min(kmax, k));
    box.style.setProperty('--knob', k + 'px');
    secs.forEach((s, i) => { if (counts[i]) s.querySelector('.grid').style.gridTemplateRows = `repeat(${Math.min(rows, counts[i])}, auto)`; });
  }
  /** The chip bar over the knobs: jump to a section; switch between big knobs and see-all. */
  renderKbar() {
    const bar = $('kbar'), box = $('knobs'), on = this.wideShort() && this.viewSize !== 'big' && this.viewSize !== 'full' && this.viewSize !== 'hidden';
    document.body.classList.toggle('kbar-on', on);
    document.body.classList.toggle('kstrip', on && this.stripMode());
    if (!on) return;
    const strip = this.stripMode();
    const secs = [...box.children];
    bar.innerHTML = (strip ? secs.map((s, i) => `<button data-i="${i}">${s.querySelector('h3').textContent}</button>`).join('') : '') +
      `<button class="kb-mode" data-mode="${strip ? 'fit' : 'strip'}">${strip ? 'SEE ALL' : 'BIG KNOBS'}</button>`;
    bar.querySelectorAll('[data-i]').forEach((b) => b.onclick = () => { const s = secs[Number(b.dataset.i)]; if (s.classList.contains('collapsed')) s.querySelector('h3').click(); box.scrollTo({ left: s.offsetLeft - box.offsetLeft - 4, behavior: 'smooth' }); });
    bar.querySelector('[data-mode]').onclick = (e) => this.setKnobLayout(e.target.dataset.mode);
    // sit over the knobs column
    bar.style.left = box.offsetLeft + 'px'; bar.style.top = box.offsetTop + 'px'; bar.style.width = box.clientWidth + 'px';
    this.markKbar();
    if (!this._kbScroll) { this._kbScroll = true; box.addEventListener('scroll', () => this.markKbar(), { passive: true }); }
  }
  markKbar() {
    const box = $('knobs'), bar = $('kbar'); if (!document.body.classList.contains('kstrip')) return;
    const x = box.scrollLeft + box.offsetLeft + 12;
    const secs = [...box.children]; let cur = 0;
    secs.forEach((s, i) => { if (s.offsetLeft <= x) cur = i; });
    bar.querySelectorAll('[data-i]').forEach((b) => b.classList.toggle('on', Number(b.dataset.i) === cur));
  }
  fitKnobs() {
    const box = $('knobs'); this.renderKbar();
    if (!box || !box.children.length || this.viewSize === 'big' || this.viewSize === 'full') return;
    const work = document.querySelector('.work');
    const secs = [...box.children];
    const counts = secs.map((s) => s.classList.contains('collapsed') ? 0 : s.querySelector('.grid').children.length);
    const clamp = (v) => Math.max(40, Math.min(120, Math.floor(v)));
    if (document.body.classList.contains('kstrip')) { this.fitStrip(box, secs, counts); return; }
    if (innerWidth <= 600) {   // phones: stacked sections, 4 (or 5) knobs across
      work.style.gridTemplateColumns = '';
      const per = document.body.classList.contains('pb-open') ? 5 : 4;
      box.style.setProperty('--knob', Math.max(40, Math.min(72, Math.floor((box.clientWidth - 8) / per - 30))) + 'px');
      secs.forEach((s) => { s.querySelector('.grid').style.gridTemplateRows = ''; });
      return;
    }
    // Pack sections into lines (they may wrap) and find the biggest knob that fits.
    // For each knob size and rows-per-section, lay the sections out left to right.
    const fits = (W, H, k, rows) => {
      let lineW = 0, lineH = 0, total = 0;
      for (let i = 0; i < counts.length; i++) {
        const n = counts[i], r = n ? Math.min(rows, n) : 0;
        const c = n ? Math.ceil(n / r) : 0;
        const w = Math.max(c * (k + 24) + Math.max(0, c - 1) * 4, 86) + 13;   // knob columns + gaps + padding/border
        const h = (n ? r * (k + 62) : 0) + 34;
        if (lineW + w > W && lineW > 0) { total += lineH; lineW = 0; lineH = 0; }
        lineW += w; lineH = Math.max(lineH, h);
      }
      return total + lineH <= H;
    };
    const tablet = innerWidth <= 900, hidden = this.viewSize === 'hidden';
    const total = work.clientWidth, H = box.clientHeight - 12;
    let best = { k: 0, rows: 3, vw: 0 };
    // the bird panel keeps one width per screen size (chosen once), so it doesn't jump between birds
    const sizeKey = `${total}x${H}`;
    if (this._vwKey !== sizeKey) { this._vwKey = sizeKey; this._vwF = null; }
    const widths = tablet || hidden ? [0] : this._vwF ? [this._vwF] : [0.44, 0.4, 0.36, 0.32, 0.3, 0.28, 0.26];
    for (const f of widths) {
      const vw = tablet ? 0 : hidden ? 46 : Math.max(300, total * f), W = (tablet ? box.clientWidth : total - vw) - 14;
      for (const rows of [1, 2, 3, 4, 5]) {
        let lo = 40, hi = 120;                      // largest k that fits (binary search)
        if (!fits(W, H, lo, rows)) continue;
        while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (fits(W, H, mid, rows)) lo = mid; else hi = mid; }
        if (lo > best.k + 2) best = { k: lo, rows, vw };   // a narrower view must earn its keep
      }
    }
    if (!best.k) best = { k: 40, rows: 3, vw: tablet ? 0 : Math.max(300, total * (this._vwF || 0.3)) };
    if (!tablet && !hidden && !this._vwF) this._vwF = best.vw / total;
    if (!tablet && !hidden) { const cols = `${Math.round(best.vw)}px 1fr`; if (work.style.gridTemplateColumns !== cols) work.style.gridTemplateColumns = cols; }
    if (tablet) work.style.gridTemplateColumns = '';
    box.style.setProperty('--knob', clamp(best.k) + 'px');
    secs.forEach((s, i) => { if (counts[i]) s.querySelector('.grid').style.gridTemplateRows = `repeat(${Math.min(best.rows, counts[i])}, auto)`; });
  }
  setValue(key, v, user) {
    this.values[key] = v;
    if (key.startsWith('fx_')) this.audio.setFx(key, v);
    if (key === 'mass') v = v - this.bendV * (this.settings.bendRange || 2);
    this.audio.setParam(key, v);
    if (user) {
      const t = {};
      for (const [k, val] of Object.entries(this.values)) {
        const p = this.defs.params.find((q) => q.key === k);
        if (Math.abs(toNorm(p, val) - toNorm(p, this.birdValue(p))) > 0.004) t[k] = val;
      }
      ls.set('carol-tweaks-' + this.bird.id, t);
    }
  }
  resetToBird() {
    for (const p of this.defs.params) if (this.knobs[p.key]) { this.knobs[p.key].setValue(this.birdValue(p)); this.setValue(p.key, this.birdValue(p), false); }
    ls.set('carol-tweaks-' + this.bird.id, {});
    this.toast('Back to the real ' + this.bird.name.toLowerCase());
  }
  hint(p) {
    const part = Object.entries(PART_INFO).find(([, v]) => v.knobs.includes(p.key));
    this.v2.sel = this.v3.sel = part ? part[0] : null;
    clearTimeout(this._hl); this._hl = setTimeout(() => { this.v2.sel = this.v3.sel = null; }, 2500);
  }

  // ---------------------------------------------------------------- playing
  currentCall() { return this.bird && this.bird.calls[this.callIdx]; }
  /** The call a key press plays: the chosen one, or (RANDOM) any of the bird's calls, never twice in a row. */
  keyCall() {
    const n = this.bird.calls.length;
    if (!this.randomCalls || n < 2) return this.callIdx;
    let i = Math.floor(Math.random() * (n - 1)); if (i >= this.lastRandom && this.lastRandom >= 0) i++;
    return (this.lastRandom = Math.min(n - 1, i));
  }
  setRandomCalls(on) { this.randomCalls = on; ls.set('carol-keys-random', on); this.playbar.renderCall(); this.toast(on ? 'Keys play a random call' : 'Keys play ' + (this.currentCall()?.name || '')); }
  selectCall(i) {
    this.callIdx = i; ls.set('carol-call-' + this.bird.id, i);
    this.playbar.renderCall();
    [...$('pads').children].forEach((p, k) => p.classList.toggle('sel', k === i));
  }
  callNote(i) { const c = this.bird.calls[i]; return 69 + 12 * Math.log2(c.ref_hz / 440); }
  homeNote() { return homeNote(this.scale, this.bird) ?? Math.round(this.callNote(this.callIdx)); }
  keyCentre() { return this.homeNote() + 12 * this.octave; }
  pcs() { return scalePCs(this.scale, this.bird); }
  /** Hardware keyboards: C4 lands on the bird's home note's octave. */
  hwNote(n) { const h = this.homeNote(); return n + 12 * Math.round((h - 60) / 12) + 12 * this.octave; }
  /** Concert pitch: shift every note by the A4 setting. */
  tune(n) { const a4 = this.settings.a4 || 440; return a4 === 440 ? n : n + 12 * Math.log2(a4 / 440); }
  holding() { return this.hold || this.sustainOn; }
  /** Keep within the voice limit: the oldest latched, then the oldest held notes give way. */
  makeRoom() {
    const max = this.settings.voices || 6;
    while (this.held.size + this.latched.size >= max) {
      const [k, h] = this.latched.size ? this.latched.entries().next().value : this.held.entries().next().value;
      (this.latched.has(k) ? this.latched : this.held).delete(k); this.noteEnd(h);
    }
  }
  noteEnd(h) {
    this.audio.noteOff(h.id); this.audio.unqueue('rpt' + h.id);
    if (h.n !== null) this.playbar.light(h.n, false);
    if (h.out !== undefined) this.midi.noteOut(h.out, 0, false);
  }
  releaseLatched() { for (const h of this.latched.values()) this.noteEnd(h); this.latched.clear(); }
  press(src, note, vel, isTouch, rawNote) {
    if (!this.bird) return;
    this.release(src, true);
    if (this.holding() && this.held.size === 0) this.releaseLatched();
    this.makeRoom();
    const n = snap(note, this.pcs());
    const id = this.nextId++;
    const call = this.keyCall();
    const h = { id, n, call, note: this.tune(n), vel, out: n };
    this.held.set(src, h);
    this.audio.noteOn(id, call, h.note, vel);
    this.midi.noteOut(n, vel, true);
    if (this.rpt) h.next = this.audio.now + this.rptPeriod();
    if (!isTouch) this.playbar.light(n, true);
    this.lastNote = n;
  }
  playCall(src, i) {
    this.release(src, true);
    if (this.holding() && this.held.size === 0) this.releaseLatched();
    this.makeRoom();
    const id = this.nextId++, n = this.callNote(i);
    const h = { id, n: null, call: i, note: this.tune(n), vel: 0.9, out: Math.round(n) };
    this.held.set(src, h);
    this.audio.noteOn(id, i, h.note, 0.9);
    this.midi.noteOut(h.out, 0.9, true);
    if (this.rpt && src !== 'tour' && src !== 'enc') h.next = this.audio.now + this.rptPeriod();
  }
  release(src, replacing) {
    const h = this.held.get(src); if (!h) return;
    this.held.delete(src);
    if (!replacing && this.holding()) { h.next = undefined; this.latched.set(src + ':' + h.id, h); return; }
    this.noteEnd(h);
  }
  /** Call repeater: while a key or pad is held, retrigger its call in time with the sequencer tempo. */
  rptPeriod() { const q = { '1/4': 1, '1/8': 0.5, '1/8T': 1 / 3, '1/16': 0.25 }[this.settings.rptRate] || 0.5; return 60 / (this.seq.st.bpm || 100) * q; }
  rptPump() {
    if (!this.rpt || !this.audio.ctx) return;
    const now = this.audio.now, per = this.rptPeriod();
    for (const h of this.held.values()) {
      if (h.next === undefined) continue;
      if (h.next < now) h.next = now + 0.01;
      while (h.next < now + 0.1) {
        const id = this.nextId++;
        this.audio.noteOn(id, h.call, h.note, h.vel, h.next, 0, 'rpt' + h.id);
        this.audio.noteOff(id, h.next + per * 0.9, 0, 'rpt' + h.id);
        if (h.out !== undefined) { this.midi.noteOut(h.out, h.vel, true, h.next); this.midi.noteOut(h.out, 0, false, h.next + per * 0.9); }
        h.next += per;
      }
    }
  }
  // ---------------------------------------------------------------- record, program change, preset files
  async toggleRec() {
    const b = $('recBtn');
    if (!this.recording) {
      await this.audio.start().catch(() => {});
      if (!this.audio.startRec()) return;
      this.recording = performance.now(); b.classList.add('on');
      this._recT = setInterval(() => { const s = Math.floor((performance.now() - this.recording) / 1000); b.innerHTML = `${icon('stop')}<span> ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}</span>`; }, 250);
      return;
    }
    clearInterval(this._recT); this.recording = 0; b.classList.remove('on'); b.innerHTML = icon('rec') + '<span class="long"> REC</span>';
    const blob = await this.audio.stopRec();
    if (!blob) return this.toast('Nothing recorded');
    const d = new Date(), stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}${String(d.getSeconds()).padStart(2, '0')}`;
    await saveFile(blob, `carol-${this.bird.id}-${stamp}.wav`);
  }
  /** MIDI program change: 0 = the first bird in the menu, then the next ones (My Presets last). */
  programChange(n) { const b = this.index[n % this.index.length]; if (b) this.loadBird(b.id); }
  async exportPreset() {
    const name = (this.myPresets || []).find((m) => m.id === ls.get('carol-bird'))?.name || this.bird.name;
    const obj = { format: 'carol-preset', version: 1, name, bird: this.bird.id, t: this.currentTweaks() };
    if (this.bird.user) obj.user_bird = this.bird;
    await saveFile(new Blob([JSON.stringify(obj, null, 1)], { type: 'application/json' }), `${name.replace(/[^\w\- ]+/g, '').trim() || 'carol'}.carol.json`);
  }
  async importPreset(file) {
    let o; try { o = JSON.parse(await file.text()); } catch { return 'That file isn\'t a Carol preset.'; }
    if (!o || o.format !== 'carol-preset' || typeof o.bird !== 'string') return 'That file isn\'t a Carol preset.';
    if (o.user_bird && o.user_bird.id === o.bird && Array.isArray(o.user_bird.calls)) { await store.put({ ...o.user_bird, user: true }); }
    else if (!this.index.some((b) => b.id === o.bird)) return `This preset needs a bird Carol doesn't have (${o.bird}).`;
    const t = Object.fromEntries(Object.entries(o.t || {}).filter(([k, v]) => this.defs.params.some((p) => p.key === k) && Number.isFinite(v)));
    const list = ls.get('carol-mypresets', []);
    const id = 'my-' + Date.now().toString(36);
    list.push({ id, name: String(o.name || 'Imported').slice(0, 40), base: o.bird, t }); ls.set('carol-mypresets', list);
    await this.refreshIndex(); await this.loadBird(id);
    return `Imported "${o.name}" into My Presets.`;
  }
  setHold(on) { this.hold = on; $('holdBtn').classList.toggle('on', on); if (!on && !this.sustainOn) this.releaseLatched(); }
  setRpt(on) {
    this.rpt = on; $('rptBtn').classList.toggle('on', on);
    for (const h of this.held.values()) { h.next = on ? this.audio.now + this.rptPeriod() : undefined; if (!on) this.audio.unqueue('rpt' + h.id); }
  }
  sustain(on) { this.sustainOn = on; if (!on && !this.hold) this.releaseLatched(); }
  panic() { this.audio.allOff(); this.held.clear(); this.latched.clear(); this.seq && this.seq.stop(); }
  bend(b) { this.bendV = b; this.setValue('mass', this.values.mass ?? 0, false); }
  // ---------------------------------------------------------------- settings, MIDI learn
  settingsChanged(k) {
    if (['midiIn', 'midiOut'].includes(k) && this.midi.acc) this.midi.bind();
    if (k === 'sync' && this.seq.playing) this.seq.stop();
    if (k === 'sync') this.seq.renderTransport();
    if (k === 'prefArtist') this.showPlate();
    if (k === 'callMode' || k === 'variety') { this.audio.variety = this.settings.variety; }
    if (k === 'callMode') { this.seq.cache = {}; for (const id of Object.keys(this.seq.slotOf)) this.audio.freeSlot(this.seq.slotOf[id]); this.seq.slotOf = {}; if (this.bird) this.loadBird(ls.get('carol-bird', this.bird.id)); }
  }
  setLearning(on) {
    this.learning = on; this.learnTarget = null;
    document.body.classList.toggle('learning', on);
    $('learnBar').hidden = !on;
    document.querySelectorAll('.kn.learn-target').forEach((e) => e.classList.remove('learn-target'));
  }
  bindCC(cc, key) {
    const l = { ...this.settings.learn };
    for (const [c, k] of Object.entries(l)) if (k === key) delete l[c];
    l[cc] = key; this.settings.learn = l; saveSettings(this.settings);
    const [, ch, n] = cc.split(':');
    this.toast(`CC ${n} (ch ${Number(ch) + 1}) → ${this.knobs[key] ? this.knobs[key].p.label : key}`);
    this.knobs[key] && this.knobs[key].flash();
    this.learnTarget = null;
    document.querySelectorAll('.kn.learn-target').forEach((e) => e.classList.remove('learn-target'));
  }
  ccToKnob(key, u) { const k = this.knobs[key]; if (k) { k.setU(u, true); } }
  // ---------------------------------------------------------------- my presets, share links
  currentTweaks() { return ls.get('carol-tweaks-' + this.bird.id, {}); }
  applyTweaks(t, persist) {
    for (const [k, v] of Object.entries(t || {})) if (this.knobs[k] && Number.isFinite(v)) { this.knobs[k].setValue(v); this.setValue(k, v, false); }
    if (persist) ls.set('carol-tweaks-' + this.bird.id, { ...this.currentTweaks(), ...t });
  }
  async saveMyPreset() {
    if (!this.bird || this.bird.user === undefined && !this.bird.id) return null;
    const n = (this.myPresets || []).filter((m) => m.base === this.bird.id).length + 1;
    const name = prompt('Name for this sound', `My ${this.bird.name.toLowerCase()} ${n}`);
    if (!name) return null;
    const list = ls.get('carol-mypresets', []);
    list.push({ id: 'my-' + Date.now().toString(36), name: name.slice(0, 40), base: this.bird.id, t: this.currentTweaks() });
    ls.set('carol-mypresets', list);
    await this.refreshIndex();
    this.toast('Saved: ' + name);
    return name;
  }
  deleteMyPreset(id) { ls.set('carol-mypresets', ls.get('carol-mypresets', []).filter((m) => m.id !== id)); return this.refreshIndex(); }
  shareLink() {
    const t = this.currentTweaks(), q = new URLSearchParams({ bird: this.bird.id });
    if (Object.keys(t).length) q.set('t', btoa(JSON.stringify(Object.fromEntries(Object.entries(t).map(([k, v]) => [k, Math.round(v * 1e4) / 1e4])))).replace(/=+$/, ''));
    return location.origin + location.pathname + '?' + q;
  }
  async copyShareLink() {
    if (this.bird.user) return 'Your imported birds live only on this device, so they can\'t be shared by link.';
    const url = this.shareLink();
    try { await navigator.clipboard.writeText(url); return 'Link copied: ' + url; } catch { prompt('Copy this link', url); return url; }
  }
  readShareLink() {
    const q = new URLSearchParams(location.search), bird = q.get('bird');
    if (!bird || !this.index.some((b) => b.id === bird)) return null;
    let t = {};
    try { t = q.get('t') ? JSON.parse(atob(q.get('t'))) : {}; } catch { t = {}; }
    const keep = new URLSearchParams(location.search); keep.delete('bird'); keep.delete('t');
    history.replaceState(null, '', location.pathname + (keep.toString() ? '?' + keep : ''));
    return { bird, t };
  }
  expression(v) { if (this.knobs.turb) { this.knobs.turb.setU(v, true); } }
  setScale(s) { Object.assign(this.scale, s); ls.set('carol-scale', this.scale); this.playbar.syncScale(); }
  setOctave(o) { this.octave = Math.max(-3, Math.min(3, o)); this.playbar.syncScale(); }

  // ---------------------------------------------------------------- hardware
  neoKey(i, down) {
    const src = 'neo' + i;
    if (!down) { this.release(src); return; }
    const pcs = this.pcs(), home = this.homeNote() + 12 * this.octave;
    this.press(src, degree(i, home, pcs), 0.85, false);
  }
  pageKeys() { return this.hwKnobs.slice(this.page * 4, this.page * 4 + 4); }
  markPage() {
    const keys = this.pageKeys ? this.pageKeys() : [];
    for (const [k, kn] of Object.entries(this.knobs)) kn.el.style.outline = keys.includes(k) ? '1px dashed rgba(242,169,59,.45)' : '';
    // big-knob strip: bring the hardware knobs' page into view
    if (document.body.classList.contains('kstrip') && keys[0] && this.knobs[keys[0]]) {
      const box = $('knobs'), el = this.knobs[keys[0]].el, x = el.offsetLeft - box.offsetLeft;
      if (x < box.scrollLeft || x + el.offsetWidth > box.scrollLeft + box.clientWidth) box.scrollTo({ left: x - 40, behavior: 'smooth' });
    }
  }
  /** The Pi's quad knobs: about 40 clicks end to end, faster when you turn fast. */
  hwKnob(i, d) {
    const k = this.knobs[this.pageKeys()[i]]; if (!k) return;
    const now = performance.now(), dt = now - (this._hwT?.[i] || 0); (this._hwT ||= [])[i] = now;
    const accel = dt < 40 ? 3 : dt < 90 ? 2 : 1;
    if (k.steps) { k.nudge(Math.sign(d)); return; }
    k.setU(k.u + d * accel / 40, true); k.flash();
  }
  hwKnobPress(i) {
    const pages = Math.ceil(this.hwKnobs.length / 4);
    if (i === 0) this.page = (this.page + 1) % pages;
    else if (i === 1) this.page = (this.page - 1 + pages) % pages;
    else if (i === 2) { this.resetToBird(); return; }
    else if (i === 3) { this.playbar.toggle(); return; }
    this.markPage(); this.toast('KNOBS: ' + this.pageKeys().map((k) => this.knobs[k].p.label).join(' · '));
  }
  hwEncoder(d) { if (!this.presets.el.hidden) this.presets.step(d > 0 ? 1 : -1); else this.stepBird(d > 0 ? 1 : -1); }
  /** The BIRD knob / main encoder: straight to the next bird (no menu), which morphs into place. */
  stepBird(d) {
    const ids = this.index.map((b) => b.id);
    const cur = this._stepTarget ?? Math.max(0, ids.indexOf(ls.get('carol-bird', this.bird && this.bird.id)));
    const i = ((cur + d) % ids.length + ids.length) % ids.length;
    this._stepTarget = i;
    const b = this.index[i];
    this.toast(`${b.name} · ${b.collection || ''}`);
    clearTimeout(this._stepT);
    this._stepT = setTimeout(() => { this._stepTarget = null; this.loadBird(b.id); }, 180);   // turning fast: load where you stop
  }
  hwClick() {
    if (!this.presets.el.hidden) { this.presets.confirm(true); return; }
    // preview the selected call
    this.playCall('enc', this.callIdx); setTimeout(() => this.release('enc'), 50);
  }
  korgKnob(i, u) { const k = this.knobs[this.hwKnobs[i]]; if (k) { k.setU(u, true); k.flash(); } }

  // ---------------------------------------------------------------- UI
  /** Previous / next bird arrows (the on-screen stand-in for the Pi's BIRD encoder). */
  buildMainKnob() {
    $('birdPrev').onclick = () => this.stepBird(-1);
    $('birdNext').onclick = () => this.stepBird(1);
  }
  bindTop() {
    $('birdChip').onclick = () => this.presets.open();
    $('resetBtn').onclick = () => this.resetToBird();
    $('learnBtn').onclick = () => this.learn.open();
    $('setBtn').onclick = () => this.settingsUI.open();
    $('holdBtn').onclick = () => this.setHold(!this.hold);
    $('rptBtn').onclick = () => this.setRpt(!this.rpt);
    $('recBtn').onclick = () => this.toggleRec();
    $('learnDone').onclick = () => this.setLearning(false);
    $('saveMineBtn').onclick = () => this.saveMyPreset().then(() => this.presets.el.hidden || this.presets.render());
    zoomable($('plate'), $('plateImg'), { onSwipe: (d) => this.swipePlate(d) });
    $('viewHud').addEventListener('pointerdown', (e) => { e.stopPropagation(); const h = $('viewHud'); clearTimeout(this._hud); if (h.classList.contains('open')) { h.innerHTML = ''; h.classList.remove('open'); } else h.classList.add('open'); });
    document.querySelectorAll('#viewSize button').forEach((b) => b.onclick = () => this.setViewSize(this.viewSize === b.dataset.size ? '' : b.dataset.size));
    this.setViewSize(ls.get('carol-viewsize', ''));
    document.querySelectorAll('#viewSeg button').forEach((b) => b.onclick = () => this.setView(b.dataset.view));
    // a single tap on the bird panel (not on a part, not a drag or pinch) hides / shows its floating buttons
    {
      const view = $('view'); let t0 = null, n = 0;
      view.addEventListener('pointerdown', (e) => { n++; t0 = n === 1 ? { x: e.clientX, y: e.clientY, t: performance.now(), tgt: e.target } : null; });
      const end = (e) => {
        n = Math.max(0, n - 1);
        if (!t0 || e.type === 'pointercancel') { t0 = null; return; }
        const tap = Math.hypot(e.clientX - t0.x, e.clientY - t0.y) < 10 && performance.now() - t0.t < 350;
        const tgt = t0.tgt; t0 = null;
        if (!tap || tgt.closest('button, #viewSeg, .view-size, select, a') || document.body.dataset.viewsize === 'hidden') return;
        if (tgt.id === 'view2d' && this.v2.sel) return; // tapped a body part: that shows its info instead
        clearTimeout(this._bareT);
        this._bareT = setTimeout(() => view.classList.toggle('bare'), 260); // wait: a double tap resets zoom instead
      };
      view.addEventListener('pointerup', end); view.addEventListener('pointercancel', end);
      view.addEventListener('dblclick', () => clearTimeout(this._bareT));
      view.addEventListener('pointerdown', () => { if (performance.now() - (this._lastViewTap || 0) < 300) clearTimeout(this._bareT); this._lastViewTap = performance.now(); });
    }
    $('view2d').addEventListener('pointerdown', (e) => {
      const r = e.target.getBoundingClientRect();
      const part = this.v2.hit(e.clientX - r.left, e.clientY - r.top, this.model ? this.model.parts : []);
      this.v2.sel = part; this.showPart(part);
    });
    addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT') return;
      const map = 'awsedftgyhujkolp;'; const i = map.indexOf(e.key);
      if (i >= 0 && !e.repeat) this.press('kb' + e.key, this.keyCentre() - 7 + i, 0.85, false);
      if (e.key === 'Escape') { this.presets.close(); this.learn.close(); this.settingsUI.close(); this.tour.close(); this.setLearning(false); this.setViewSize(''); }
      if (e.key === ' ' && e.target === document.body) { e.preventDefault(); this.seq.toggle(); }
    });
    addEventListener('keyup', (e) => this.release('kb' + e.key));
  }
  showPart(part) {
    const hud = $('viewHud');
    if (!part) { hud.innerHTML = ''; return; }
    const info = PART_INFO[part];
    const names = info.knobs.filter((k) => this.knobs[k]).map((k) => this.knobs[k].p.label);
    hud.innerHTML = `<b>${info.label}</b> — ${info.text}<span class="hud-knobs"><br>${names.length ? 'Knobs: ' + names.join(', ') : ''}</span>`;
    hud.classList.remove('open');
    for (const k of info.knobs) this.knobs[k] && this.knobs[k].flash();
    clearTimeout(this._hud); this._hud = setTimeout(() => { hud.innerHTML = ''; this.v2.sel = null; }, 6000);
  }
  /** Bird panel size: '' normal, 'big' (knobs hidden), 'full' (whole screen). */
  setViewSize(m) {
    if (m === 'hidden') $('view').classList.remove('bare');
    this.viewSize = m; ls.set('carol-viewsize', m);
    document.body.dataset.viewsize = m;
    document.querySelectorAll('#viewSize button').forEach((b) => {
      const on = b.dataset.size === m; b.classList.toggle('on', on);
      const ic = { hidden: 'hide', big: 'expand', full: 'full' }, tip = { hidden: 'Hide the bird', big: 'Big bird: hide the knobs', full: 'Full screen' };
      b.innerHTML = icon(on ? (m === 'hidden' ? 'show' : 'shrink') : ic[b.dataset.size]);
      b.title = on ? (m === 'hidden' ? 'Show the bird' : 'Back to the synth') : tip[b.dataset.size];
    });
    requestAnimationFrame(() => this.resize());
  }
  setView(v) {
    this.view = v; ls.set('carol-view', v);
    document.querySelectorAll('#viewSeg button').forEach((b) => b.classList.toggle('on', b.dataset.view === v));
    $('view2d').classList.toggle('on', v === '2d');
    $('view3d').classList.toggle('on', v === '3d');
    $('sono').classList.toggle('on', v === 'sono');
    $('wave').classList.toggle('on', v === 'wave');
    this.audio.scopeOn(v === 'wave');
    $('plate').classList.toggle('on', v === 'plate');
    this.resize();
  }
  // send screen measurements to the Pi's page server (local/Tailscale only), to fix layout on real devices
  diag(h) {
    if (!/(\.ts\.net|localhost|127\.0\.0\.1)$/.test(location.hostname)) return;
    clearTimeout(this._diagT);
    this._diagT = setTimeout(() => {
      const pr = document.createElement('div');
      pr.style.cssText = 'position:fixed;top:env(safe-area-inset-top);bottom:env(safe-area-inset-bottom);left:0;width:1px;visibility:hidden';
      document.body.appendChild(pr); const r = pr.getBoundingClientRect(); pr.remove();
      const app = document.getElementById('app').getBoundingClientRect(), pb = document.querySelector('.playbar').getBoundingClientRect();
      const q = { ua: /iPhone|iPad/.test(navigator.userAgent) ? (navigator.userAgent.match(/(iPhone|iPad)[^)]*OS (\d+)/) || []).slice(1).join('-') : 'other', st: navigator.standalone ? 1 : 0,
        iw: innerWidth, ih: innerHeight, oh: outerHeight, sw: screen.width, sh: screen.height, vv: visualViewport ? Math.round(visualViewport.height) : 0,
        ch: document.documentElement.clientHeight, bh: Math.round(document.body.getBoundingClientRect().height), sat: Math.round(r.top), sab: Math.round(innerHeight - r.bottom),
        apph: h, appb: Math.round(app.bottom), pbb: Math.round(pb.bottom), dpr: devicePixelRatio };
      fetch('diag?' + new URLSearchParams(q)).catch(() => {});
    }, 1200);
  }
  resize() {
    // the real visible height (iOS home-screen apps disagree with 100vh / 100dvh)
    const h = innerHeight; // the html.standalone rule (carol.css) works around the iOS 26 short-viewport bug
    document.documentElement.style.setProperty('--app-h', h + 'px');
    this.diag(h);
    // phones: the 2D/3D/PLATE switch sits on the bird view to keep the top bar to one row
    const seg = $('viewSeg'), phone = innerWidth <= 900;
    if (phone && seg.parentElement.id !== 'view') $('view').appendChild(seg);
    else if (!phone && seg.parentElement.id === 'view') document.querySelector('.top-buttons').insertBefore(seg, $('learnBtn'));
    this.v2.resize(); this.v3.resize(); this.sono.resize(); this.wave.resize(); this.fitKnobs();
  }
  toast(t) {
    const el = $('toast'); el.textContent = t; el.hidden = false;
    clearTimeout(this._toast); this._toast = setTimeout(() => { el.hidden = true; }, 1600);
  }
  loop() {
    const fps = Number(new URLSearchParams(location.search).get('fps') || 30);
    let last = performance.now(), acc = 0;
    const frame = (now) => {
      requestAnimationFrame(frame);
      acc += now - last; const dt = (now - last) / 1000; last = now;
      if (acc < 1000 / fps - 2) return;
      acc = 0;
      if (!this.bird || this.view === 'plate' || document.hidden) return;
      if (this.view === 'sono') { this.sono.draw(this.audio.analyser, this.audio.tele, dt); return; }
      if (this.view === 'wave') { this.wave.draw(this.audio.scope, this.audio.tele, { closure: this.values.closure }); return; }
      const cc = this.currentCall();
      this.model = compute(this.bird.body, this.morphLook(now), this.values, this.audio.tele, now / 1000, { refHz: cc && cc.ref_hz });
      this.morphKnobs(now);
      if (this.view === '2d') this.v2.draw(this.model); else this.v3.draw(this.model, Math.min(0.1, dt * 2));
      this.frames = (this.frames || 0) + 1;
    };
    requestAnimationFrame(frame);
  }
}

/** Blend two birds' looks (sizes, beaks, colours; crests and streamers grow or shrink away). */
function lerpLook(a, b, t) {
  if (!a || !b) return b || a;
  const num = (x, y) => x + (y - x) * t;
  const any = (x, y) => {
    if (typeof x === 'number' && typeof y === 'number') return num(x, y);
    if (typeof x === 'string' && typeof y === 'string' && x[0] === '#' && y[0] === '#') return mixHex(x, y, t);
    if (Array.isArray(x) && Array.isArray(y)) return x.length === y.length && typeof x[0] === 'number' ? x.map((v, i) => num(v, y[i])) : (t < 0.5 ? x : y);
    if (x && y && typeof x === 'object' && typeof y === 'object') { const o = {}; for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) o[k] = k in x && k in y ? any(x[k], y[k]) : (k in y ? y[k] : x[k]); return o; }
    return t < 0.5 ? x : y;
  };
  const out = any(a, b);
  // a crest or tail streamers only one bird has: grow in / shrink away
  for (const k of ['crest', 'streamers']) {
    if (a[k] && !b[k]) out[k] = { ...a[k], len: a[k].len * (1 - t) };
    else if (!a[k] && b[k]) out[k] = { ...b[k], len: b[k].len * t };
  }
  return out;
}

// A synth panel, not a web page: no browser right-click / long-press menu anywhere.
if (navigator.standalone || matchMedia('(display-mode: standalone)').matches) document.documentElement.classList.add('standalone');
addEventListener('contextmenu', (e) => e.preventDefault(), { capture: true });
// The page never zooms; only the bird panel does (its own pinch / wheel zoom).
const inBird = (t) => t && t.closest && t.closest('#view');
// the bird panel's views zoom themselves, so the page itself never zooms (it could get stuck zoomed in)
for (const g of ['gesturestart', 'gesturechange', 'gestureend']) addEventListener(g, (e) => e.preventDefault(), { passive: false });
addEventListener('touchmove', (e) => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
addEventListener('wheel', (e) => { if (e.ctrlKey && !inBird(e.target)) e.preventDefault(); }, { passive: false });
let lastTouchEnd = 0;
addEventListener('touchend', (e) => { const now = Date.now(); if (now - lastTouchEnd < 300 && !inBird(e.target)) e.preventDefault(); lastTouchEnd = now; }, { passive: false });

const app = new App();
window.carol = app;
app.init().catch((e) => { console.error(e); document.body.insertAdjacentHTML('beforeend', `<pre style="position:fixed;top:0;left:0;color:#f88;z-index:99">${e.stack || e}</pre>`); });
