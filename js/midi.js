// MIDI in and out.
// In: any keyboard / controller (device + channel filter in Settings), velocity curve, pitch bend,
//   MIDI learn (any CC -> any knob), MIDI clock (the sequencer can follow it).
//   Hardware: Korg nanoKEY (K1-K8 = CC 20-27, XY = CC 19) and the Pi's own controls, which
//   AudioView's CarolMode sends as CCs on channel 16 (same scheme as Chimera):
//   CC 20-23 quad knobs (relative, 64 ± d) · 24 main encoder (relative) · 25 encoder click
//   CC 26-29 quad knob presses · CC 40-47 NeoKeys (127 down / 0 up)
// Out: the notes Carol plays (keys, pads, sequencer) and, optionally, MIDI clock.
const CURVES = {
  linear: (v) => v,
  soft: (v) => Math.pow(v, 0.6),      // light touch plays louder
  hard: (v) => Math.pow(v, 1.6),
  fixed: () => 0.85,
};

export class Midi {
  constructor(app) { this.app = app; this.acc = null; this.outs = []; this.ins = []; this.onDevices = null; this.clockN = 0; }
  get s() { return this.app.settings; }
  async start() {
    if (!navigator.requestMIDIAccess) return;
    try {
      this.acc = await navigator.requestMIDIAccess();
      this.bind(); this.acc.onstatechange = () => this.bind();
    } catch (e) { console.warn('MIDI unavailable', e); }
  }
  bind() {
    const only = new URLSearchParams(location.search).get('midi');
    this.ins = [...this.acc.inputs.values()];
    this.outs = [...this.acc.outputs.values()];
    for (const inp of this.ins) {
      const use = (!only || inp.name.includes(only)) && (this.s.midiIn === 'all' || inp.name === this.s.midiIn || inp.name.includes('Carol-Keys'));
      inp.onmidimessage = use ? (e) => this.msg(e.data, inp.name) : null;
    }
    this.onDevices && this.onDevices();
  }
  out() { return this.s.midiOut ? this.outs.find((o) => o.name === this.s.midiOut) : null; }
  /** AudioContext time -> performance.now() time for timestamped MIDI out. */
  stamp(at) {
    if (at === undefined || !this.app.audio.ctx) return undefined;
    return performance.now() + Math.max(0, (at - this.app.audio.ctx.currentTime) * 1000);
  }
  send(bytes, at) { const o = this.out(); if (!o) return; try { o.send(bytes, this.stamp(at)); } catch {} }
  noteOut(note, vel, on, at) {
    if (!this.s.outNotes) return;
    const n = Math.max(0, Math.min(127, Math.round(note))), ch = (this.s.outCh - 1) & 15;
    this.send(on ? [0x90 | ch, n, Math.max(1, Math.round(vel * 127))] : [0x80 | ch, n, 0], at);
  }
  clockOut(byte, at) { if (this.s.outClock) this.send([byte], at); }

  msg(d, name) {
    const app = this.app, st = d[0] & 0xf0, ch = d[0] & 0x0f;
    // realtime: clock / start / continue / stop
    if (d[0] >= 0xf8) {
      if (d[0] === 0xf8) app.seq && app.seq.clockTick();
      else if (d[0] === 0xfa) app.seq && app.seq.clockStart(false);
      else if (d[0] === 0xfb) app.seq && app.seq.clockStart(true);
      else if (d[0] === 0xfc) app.seq && app.seq.clockStop();
      return;
    }
    const hw = ch === 15 && name.includes('Carol-Keys');
    if (!hw && this.s.midiCh && ch !== this.s.midiCh - 1) return;
    const curve = CURVES[this.s.velCurve] || CURVES.linear;
    if (st === 0xc0) { app.programChange(d[1]); return; }
    if (st === 0x90 && d[2] > 0) { app.press('midi' + d[1], app.hwNote(d[1]), curve(d[2] / 127), false, d[1]); return; }
    if (st === 0x80 || (st === 0x90 && d[2] === 0)) { app.release('midi' + d[1]); return; }
    if (st === 0xe0) { app.bend(((d[2] << 7) | d[1]) / 8192 - 1); return; }
    if (st !== 0xb0) return;
    const cc = d[1], v = d[2];
    if (cc === 123 || cc === 120) { app.panic(); return; }
    if (hw || (ch === 15 && ((cc >= 20 && cc <= 47) || cc === 7) && !this.s.learn['cc:15:' + cc])) {
      const rel = v - 64;
      if (cc >= 20 && cc <= 23) app.hwKnob(cc - 20, rel);
      else if (cc === 24) app.hwEncoder(rel);
      else if (cc === 25 && v > 0) app.hwClick();
      else if (cc >= 26 && cc <= 29 && v > 0) app.hwKnobPress(cc - 26);
      else if (cc >= 40 && cc <= 47) app.neoKey(cc - 40, v > 0);
      else if (cc === 7) app.ccToKnob('volume', v / 127);   // the Pi's slider: Carol's VOLUME knob
      return;
    }
    // MIDI learn: the knob touched last takes the next controller moved
    const key = `cc:${ch}:${cc}`;
    if (app.learning && app.learnTarget) { app.bindCC(key, app.learnTarget); return; }
    const target = this.s.learn[key];
    if (target) { app.ccToKnob(target, v / 127); return; }
    if (cc === 64) { app.sustain(v >= 64); return; }
    if (cc >= 20 && cc <= 27) app.korgKnob(cc - 20, v / 127);
    else if (cc === 19 || cc === 1) app.expression(v / 127);
  }
}
