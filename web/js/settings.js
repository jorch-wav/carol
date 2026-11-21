// Settings (⚙): MIDI in / learn / out, tempo sync, tuning and playing, audio, sharing.
import { icon } from './icons.js';
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const $ = (id) => document.getElementById(id);

export const DEFAULTS = {
  midiIn: 'all', midiCh: 0, velCurve: 'linear', bendRange: 2,
  midiOut: '', outCh: 1, outNotes: true, outClock: false,
  learn: {}, a4: 440, voices: 6, latency: '', sync: 'off', rptRate: '1/8', prefArtist: '',
  callMode: 'traced', variety: 0.5,
};
export function loadSettings() {
  let s = {};
  try { s = JSON.parse(localStorage.getItem('carol-settings') || '{}'); } catch {}
  // calls are always the traced ones (generated calls are switched off; the code stays in gen.js for later)
  return Object.assign({}, DEFAULTS, s, { learn: Object.assign({}, s.learn || {}), callMode: 'traced' });
}
export function saveSettings(s) { try { localStorage.setItem('carol-settings', JSON.stringify(s)); } catch {} }

const sel = (id, opts, v) => `<select id="${id}">${opts.map(([val, lab]) => `<option value="${esc(val)}" ${String(val) === String(v) ? 'selected' : ''}>${esc(lab)}</option>`).join('')}</select>`;

export class SettingsUI {
  constructor(app) {
    this.app = app;
    this.el = $('settings'); this.body = $('stBody');
    this.el.querySelector('[data-close]').onclick = () => this.close();
    this.el.addEventListener('pointerdown', (e) => { if (e.target === this.el) this.close(); });
    app.midi.onDevices = () => { if (!this.el.hidden) this.render(); };
  }
  open() { this.el.hidden = false; this.render(); }
  close() { this.el.hidden = true; }
  set(k, v) { this.app.settings[k] = v; saveSettings(this.app.settings); this.app.settingsChanged(k); }
  render() {
    const s = this.app.settings, m = this.app.midi, app = this.app;
    const ins = (m.ins || []).filter((i) => !i.name.includes('Carol-Keys')).map((i) => [i.name, i.name]);
    const outs = (m.outs || []).map((o) => [o.name, o.name]);
    const chans = [[0, 'All channels'], ...Array.from({ length: 16 }, (_, i) => [i + 1, 'Channel ' + (i + 1)])];
    const learn = Object.entries(s.learn);
    const label = (k) => (app.defs.params.find((p) => p.key === k) || { label: k }).label;
    const noMidi = !navigator.requestMIDIAccess;
    this.body.innerHTML = `
      ${noMidi ? (/iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent))
        ? `<p class="st-note"><b>MIDI on iPhone and iPad:</b> Safari can't receive MIDI. Install the free app <b>Web MIDI Browser</b> from the App Store, open <b>${esc(location.href.split('?')[0].split('#')[0])}</b> in it, and plug your keyboard in (USB-C, or Apple's camera adapter). Carol then works with it like on the Pi: keys, pitch bend, sustain pedal and the Korg knobs.</p>`
        : `<p class="st-note">This browser has no Web MIDI. MIDI works on the Pi, in Chrome or Edge on a computer, and on iPhone/iPad in the free Web MIDI Browser app.</p>`) : ''}
      <h2>MIDI in</h2>
      <label class="field">Keyboard / controller ${sel('stIn', [['all', 'All devices'], ...ins], s.midiIn)}</label>
      <label class="field">Channel ${sel('stCh', chans, s.midiCh)}</label>
      <label class="field">Velocity ${sel('stVel', [['linear', 'Linear'], ['soft', 'Soft (light touch is louder)'], ['hard', 'Hard'], ['fixed', 'Fixed']], s.velCurve)}</label>
      <label class="field">Pitch bend range ${sel('stBend', [[1, '±1 semitone'], [2, '±2 semitones'], [5, '±5 semitones'], [7, '±7 semitones'], [12, '±12 semitones']], s.bendRange)}</label>
      <p class="st-note">Program change picks a bird (0 = the first in the bird menu, in menu order; My Presets come last). Sustain pedal (CC 64) holds notes. Mod wheel (CC 1) drives turbulence. Korg nanoKEY knobs and the Pi's own knobs work as before.</p>

      <h2>MIDI learn</h2>
      <p>Link any knob, fader or pedal to any of Carol's knobs: press <b>START</b>, touch a knob on screen, then move the controller. Do as many as you like, then press <b>DONE</b>.</p>
      <div class="im-actions" style="justify-content:flex-start"><button class="rocker" id="stLearn">${app.learning ? 'DONE' : 'START MIDI LEARN'}</button>${learn.length ? '<button class="rocker" id="stLearnClear">CLEAR ALL</button>' : ''}</div>
      ${learn.length ? `<ul class="st-list">${learn.map(([cc, k]) => { const [, ch, n] = cc.split(':'); return `<li><span>CC ${n} <small>ch ${Number(ch) + 1}</small> → <b>${esc(label(k))}</b></span><button class="x" data-unlearn="${esc(cc)}" aria-label="Remove">${icon('close')}</button></li>`; }).join('')}</ul>` : '<p class="st-note">No links yet.</p>'}

      <h2>MIDI out</h2>
      <p>Send what Carol plays (keys, pads and sequencer) as notes to another synth or a DAW.</p>
      <label class="field">Send to ${sel('stOut', [['', 'Nowhere (off)'], ...outs], s.midiOut)}</label>
      <label class="field">Channel ${sel('stOutCh', Array.from({ length: 16 }, (_, i) => [i + 1, 'Channel ' + (i + 1)]), s.outCh)}</label>
      <label class="check"><input type="checkbox" id="stOutNotes" ${s.outNotes ? 'checked' : ''}> Send notes</label>
      <label class="check"><input type="checkbox" id="stOutClock" ${s.outClock ? 'checked' : ''}> Send MIDI clock while the sequencer plays (when Carol leads)</label>

      <h2>Tempo</h2>
      <label class="field">Sequencer follows ${sel('stSync', [['off', 'Its own tempo'], ['audioview', 'AudioView (the Pi’s shared tempo, PLAY / STOP)'], ['midi', 'Incoming MIDI clock']], s.sync)}</label>

      <h2>Tuning and playing</h2>
      <label class="field">Concert pitch (A4) ${sel('stA4', [[432, '432 Hz'], [435, '435 Hz'], [438, '438 Hz'], [440, '440 Hz (standard)'], [442, '442 Hz'], [443, '443 Hz'], [444, '444 Hz']], s.a4)}</label>
      <label class="field">Voices ${sel('stVoices', [[1, '1 (mono)'], [2, '2'], [3, '3'], [4, '4'], [6, '6 (all)']], s.voices)}</label>
      <label class="field">Call repeater speed ${sel('stRpt', [['1/4', '1/4 note'], ['1/8', '1/8 note'], ['1/8T', '1/8 triplet'], ['1/16', '1/16 note']], s.rptRate)}</label>
      <p class="st-note">Key and scale lock: pick the scale in the play bar; keys, MIDI and the NeoKeys all snap to it. HOLD keeps notes sounding after you let go; RPT repeats the call in time while you hold a key.</p>

      <h2>Plates</h2>
      <label class="field">Preferred artist ${sel('stArtist', [['', 'None (the first plate)'], ...[...new Set(app.index.flatMap((b) => (b.plates || []).map((p) => p.artist)).filter(Boolean))].sort().map((a) => [a, a])], s.prefArtist || '')}</label>
      <p class="st-note">Birds with a plate by this artist show it first. You can still flip through every bird's plates in the PLATE view or the bird menu, and Carol remembers your pick for each bird.</p>

      <h2>Audio</h2>
      <label class="field">Latency ${sel('stLat', [['', 'Lowest (interactive)'], ['balanced', 'Balanced'], ['playback', 'Safest (playback)']], s.latency)}</label>
      <p class="st-note">Raise it if you hear crackles. Takes effect after a reload.</p>
      <div class="im-actions" style="justify-content:flex-start"><button class="rocker" id="stReload">RELOAD NOW</button></div>

      <h2>Share and save</h2>
      <p>Save the sound you've made (this bird plus your knob changes) to <b>My Presets</b> in the bird menu, or copy a link that opens Carol with it.</p>
      <div class="im-actions" style="justify-content:flex-start;gap:6px;flex-wrap:wrap"><button class="rocker" id="stSave">SAVE AS MY PRESET</button><button class="rocker" id="stLink">COPY LINK</button><button class="rocker" id="stExport">EXPORT PRESET FILE</button><button class="rocker" id="stImport">IMPORT PRESET FILE</button></div>
      <input type="file" id="stFile" accept=".json,application/json" hidden>
      <p class="st-note">Preset files (.carol.json) hold the bird and your knob changes, so you can keep them, send them to a friend or move them to another device.</p>
      <p class="st-note" id="stMsg"></p>`;
    const on = (id, k, num) => { const e = $(id); if (e) e.onchange = () => this.set(k, num ? Number(e.value) : e.value); };
    on('stIn', 'midiIn'); on('stCh', 'midiCh', 1); on('stVel', 'velCurve'); on('stBend', 'bendRange', 1);
    on('stOut', 'midiOut'); on('stOutCh', 'outCh', 1); on('stSync', 'sync'); on('stA4', 'a4', 1); on('stVoices', 'voices', 1);
    on('stRpt', 'rptRate'); on('stLat', 'latency'); on('stArtist', 'prefArtist');
    $('stOutNotes').onchange = (e) => this.set('outNotes', e.target.checked);
    $('stOutClock').onchange = (e) => this.set('outClock', e.target.checked);
    $('stLearn').onclick = () => { app.setLearning(!app.learning); if (app.learning) this.close(); else this.render(); };
    const clr = $('stLearnClear'); if (clr) clr.onclick = () => { this.set('learn', {}); this.render(); };
    this.body.querySelectorAll('[data-unlearn]').forEach((b) => b.onclick = () => { const l = { ...s.learn }; delete l[b.dataset.unlearn]; this.set('learn', l); this.render(); });
    $('stReload').onclick = () => location.reload();
    $('stSave').onclick = () => app.saveMyPreset().then((n) => { if (n) $('stMsg').textContent = `Saved as "${n}".`; });
    $('stExport').onclick = () => app.exportPreset();
    $('stImport').onclick = () => $('stFile').click();
    $('stFile').onchange = async (e) => { const f = e.target.files[0]; if (!f) return; const msg = await app.importPreset(f); e.target.value = ''; this.render(); $('stMsg').textContent = msg; };
    $('stLink').onclick = () => app.copyShareLink().then((msg) => { $('stMsg').textContent = msg; });
  }
}
