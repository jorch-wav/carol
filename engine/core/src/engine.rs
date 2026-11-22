//! Carol's voice engine: body (params) + call gestures -> audio.

use crate::dsp::*;
use crate::model::{Osc, Table};
use std::sync::Arc;

pub const SONGBIRD: u8 = 0;
pub const KINGFISHER: u8 = 1;
pub const PARROT: u8 = 2;
pub const DOVE: u8 = 3;
pub const BODY_NAMES: [&str; 4] = ["songbird", "kingfisher", "parrot", "dove"];

const SB: u8 = 1; const KF: u8 = 2; const PR: u8 = 4; const DV: u8 = 8; const ALL: u8 = 15;

pub struct ParamDef {
    pub key: &'static str, pub label: &'static str, pub section: &'static str,
    pub min: f64, pub max: f64, pub default: f64, pub unit: &'static str,
    pub log: bool, pub bodies: u8, pub help: &'static str,
}

macro_rules! p {
    ($k:expr,$l:expr,$s:expr,$mn:expr,$mx:expr,$d:expr,$u:expr,$log:expr,$b:expr,$h:expr) => {
        ParamDef { key: $k, label: $l, section: $s, min: $mn, max: $mx, default: $d, unit: $u, log: $log, bodies: $b, help: $h }
    };
}

pub const P_PRESSURE: usize = 0;
pub const P_TENSION: usize = 1;
pub const P_MASS: usize = 2;
pub const P_TRACHEA: usize = 3;
pub const P_ECHO: usize = 4;
pub const P_OEC: usize = 5;
pub const P_OEC_TRACK: usize = 6;
pub const P_BEAK: usize = 7;
pub const P_BEAK_TRACK: usize = 8;
pub const P_TURB: usize = 9;
pub const P_BREATH: usize = 10;
pub const P_TWO: usize = 11;
pub const P_TWO_INT: usize = 12;
pub const P_SPLIT: usize = 13;
pub const P_COUPLING: usize = 14;
pub const P_TONGUE_H: usize = 15;
pub const P_TONGUE_P: usize = 16;
pub const P_MOUTH_Q: usize = 17;
pub const P_PULSE: usize = 18;
pub const P_SPEED: usize = 19;
pub const P_SWEEP: usize = 20;
pub const P_MODE: usize = 21;
pub const P_VOLUME: usize = 22;
pub const P_OEC_DEPTH: usize = 23;
pub const P_CLOSURE: usize = 24;
pub const P_MOUTH_MIX: usize = 25;
pub const P_SAC: usize = 26;
pub const P_SAC_Q: usize = 27;
pub const P_ATTACK: usize = 28;
pub const P_RELEASE: usize = 29;
pub const P_GLIDE: usize = 30;
pub const P_VMODE: usize = 31;
pub const P_LFO_RATE: usize = 32;
pub const P_VIBRATO: usize = 33;
pub const P_TREMOLO: usize = 34;
pub const P_EQ0: usize = 35;
pub const EQ_HZ: [f64; 8] = [400.0, 624.0, 973.0, 1517.0, 2366.0, 3690.0, 5755.0, 8975.0];
pub const NPARAM: usize = 43;

pub static PARAMS: [ParamDef; NPARAM] = [
    p!("pressure", "AIR PRESSURE", "LUNGS", 0.4, 1.6, 1.0, "x", false, ALL, "How hard the air sacs squeeze. More pressure: louder, and the labia swing wider."),
    p!("tension", "SYRINX TENSION", "SYRINX", -0.5, 0.85, 0.3, "", false, ALL, "Muscle tension on the labia. High: pure whistle (Hopf regime). Low: buzzy pulses (saddle-node regime)."),
    p!("mass", "LABIA MASS", "SYRINX", -12.0, 12.0, 0.0, "st", false, ALL, "Lighter labia vibrate faster. Shifts the whole bird's pitch."),
    p!("trachea", "WINDPIPE LENGTH", "WINDPIPE", 1.5, 22.0, 6.0, "cm", true, ALL, "Length of the trachea. Sets its resonances and echo time."),
    p!("echo", "WINDPIPE ECHO", "WINDPIPE", -0.8, 0.8, 0.2, "", false, ALL, "How much sound reflects back down the windpipe to the syrinx."),
    p!("oec", "THROAT SAC", "THROAT", 400.0, 9000.0, 2500.0, "Hz", true, SB | KF | DV, "Resonance of the oropharyngeal-oesophageal cavity (OEC), the throat space behind the beak."),
    p!("oec_track", "THROAT TRACKING", "THROAT", 0.0, 1.0, 0.6, "", false, SB | KF | DV, "How much the bird re-sizes its throat to follow the note. High = purer tone."),
    p!("beak", "BEAK OPENING", "BEAK", 0.0, 1.0, 0.5, "", false, ALL, "Beak gape. Wider opens up the high frequencies."),
    p!("beak_track", "BEAK FOLLOWS PITCH", "BEAK", 0.0, 1.0, 0.4, "", false, ALL, "Birds open the beak wider for higher notes. This is how much."),
    p!("turb", "TURBULENCE", "LUNGS", 0.0, 1.0, 0.1, "", false, ALL, "Irregular airflow that shakes the labia. Makes calls rough and harsh."),
    p!("breath", "BREATH NOISE", "LUNGS", 0.0, 1.0, 0.05, "", false, ALL, "Hiss of air rushing through the syrinx."),
    p!("two", "SECOND VOICE", "SYRINX", 0.0, 1.0, 0.0, "", false, SB | KF, "The other side of the syrinx singing at the same time."),
    p!("two_int", "VOICE INTERVAL", "SYRINX", -12.0, 12.0, 7.0, "st", false, SB | KF, "Pitch of the second voice relative to the first."),
    p!("split", "SIDE SWITCH", "SYRINX", 400.0, 8000.0, 2000.0, "Hz", true, SB, "Songbirds sing low notes on the left side and high notes on the right. This is the crossover."),
    p!("coupling", "MEMBRANE COUPLING", "SYRINX", 0.0, 1.0, 0.3, "", false, KF, "How strongly the two sound membranes push on each other. High coupling gives the rough, chaotic laugh."),
    p!("tongue_h", "TONGUE HEIGHT", "TONGUE", 0.0, 1.0, 0.5, "", false, SB | KF | PR, "Raising the tongue shrinks the mouth and lifts the first resonance."),
    p!("tongue_p", "TONGUE FRONT/BACK", "TONGUE", 0.0, 1.0, 0.5, "", false, SB | KF | PR, "Moving the tongue forward lifts the second resonance."),
    p!("mouth_q", "MOUTH RESONANCE", "TONGUE", 0.0, 1.0, 0.5, "", false, SB | KF | PR, "How sharply the mouth rings at its resonances."),
    p!("pulse", "BREATH PULSE", "LUNGS", 0.0, 1.0, 0.0, "", false, KF | PR, "Sharpens each breath pulse, like the chopped 'ha-ha' of a laugh."),
    p!("speed", "CALL SPEED", "PLAY", 0.25, 2.0, 1.0, "x", true, ALL, "Plays the call faster or slower without changing its pitch."),
    p!("sweep", "PITCH SWEEP", "PLAY", 0.0, 2.0, 1.0, "x", false, ALL, "Depth of the call's pitch movement. 1 = as the bird sings it."),
    p!("mode", "KEY MODE", "PLAY", 0.0, 3.0, 3.0, "", false, ALL, "ONE: the whole call plays once. GATE: it stops when you let go. LOOP: the whole call repeats while held. SUSTAIN: like a synth - the call starts, then rocks back and forth through its loudest stretch for as long as you hold the key, and plays its ending when you let go."),
    p!("volume", "VOLUME", "PLAY", 0.0, 1.0, 0.8, "", false, ALL, "Output level."),
    p!("oec_depth", "THROAT FILTER", "THROAT", 0.0, 1.0, 0.7, "", false, SB | KF | DV, "How strongly the throat cavity filters the sound. Low lets the raw buzz of the syrinx through."),
    p!("closure", "LABIAL CLOSURE", "SYRINX", 0.0, 1.0, 0.15, "", false, ALL, "How fully the labia shut the airway on each cycle. Closing chops the airflow into pulses: a bright, buzzy, harmonic-rich voice."),
    p!("mouth", "MOUTH SHAPING", "TONGUE", 0.0, 1.0, 0.0, "", false, SB | KF, "How much the mouth and tongue shape the sound after the throat. Parrots always use theirs; other birds use it less."),
    p!("sac", "NECK INFLATION", "THROAT", 0.0, 1.0, 0.6, "", false, DV, "Doves coo with the beak shut and the oesophagus blown up like a balloon. The thin neck wall then rings at the note and radiates it: a soft, pure hoot. This is how much of the sound leaves through the neck instead of the beak."),
    p!("sac_q", "SAC RESONANCE", "THROAT", 0.0, 1.0, 0.4, "", false, DV, "How sharply the inflated neck sac rings. Higher: purer, more hollow coo."),
    // ---- player controls (not part of the bird; the fitter leaves them alone)
    p!("attack", "ATTACK", "SHAPE", 0.002, 2.0, 0.002, "s", true, ALL, "How long each note takes to fade in. Long attack: the call swells up softly."),
    p!("release", "RELEASE", "SHAPE", 0.02, 4.0, 0.02, "s", true, ALL, "How long a note takes to fade out after the call ends or you let go (in GATE mode)."),
    p!("glide", "GLIDE", "SHAPE", 0.0, 1.0, 0.0, "s", false, ALL, "Portamento: each new note slides from the last note's pitch. 0 = jump straight there."),
    p!("vmode", "VOICES", "SHAPE", 0.0, 2.0, 0.0, "", false, ALL, "POLY: every key its own bird. MONO: one bird; a new key restarts the call at the new pitch. LEGATO: one bird; a new key while one is held just bends the call to the new pitch."),
    p!("lfo_rate", "LFO RATE", "LFO", 0.1, 12.0, 5.0, "Hz", true, ALL, "Speed of the wobble used by vibrato and tremolo."),
    p!("vibrato", "VIBRATO", "LFO", 0.0, 100.0, 0.0, "c", false, ALL, "Wobbles the pitch, in cents (100 = a semitone)."),
    p!("tremolo", "TREMOLO", "LFO", 0.0, 1.0, 0.0, "", false, ALL, "Wobbles the air pressure, so the loudness and tone pulse together, the way a bird's breathing would."),
    // recording tone: a fixed correction fitted per bird for what the model's body doesn't make (the microphone,
    // the distance, the habitat). Not knobs: part of the preset.
    p!("eq0", "TONE 400", "TONE", -12.0, 12.0, 0.0, "dB", false, ALL, "Recording tone correction at 400 Hz."),
    p!("eq1", "TONE 620", "TONE", -12.0, 12.0, 0.0, "dB", false, ALL, "Recording tone correction at 620 Hz."),
    p!("eq2", "TONE 970", "TONE", -12.0, 12.0, 0.0, "dB", false, ALL, "Recording tone correction at 970 Hz."),
    p!("eq3", "TONE 1.5k", "TONE", -12.0, 12.0, 0.0, "dB", false, ALL, "Recording tone correction at 1.5 kHz."),
    p!("eq4", "TONE 2.4k", "TONE", -12.0, 12.0, 0.0, "dB", false, ALL, "Recording tone correction at 2.4 kHz."),
    p!("eq5", "TONE 3.7k", "TONE", -12.0, 12.0, 0.0, "dB", false, ALL, "Recording tone correction at 3.7 kHz."),
    p!("eq6", "TONE 5.8k", "TONE", -12.0, 12.0, 0.0, "dB", false, ALL, "Recording tone correction at 5.8 kHz."),
    p!("eq7", "TONE 9k", "TONE", -12.0, 12.0, 0.0, "dB", false, ALL, "Recording tone correction at 9 kHz."),
];

pub fn body_has(body: u8, i: usize) -> bool { PARAMS[i].bodies & (1 << body) != 0 }

/// A call gesture: per-frame fundamental (Hz), pressure (0..1), roughness (0..1).
#[derive(Clone)]
/// `g` is the beak gesture: per-frame offset added to the beak gape (may be empty = 0).
/// `m` is the mouth gesture: per-frame offset to tongue height (the first mouth resonance), e.g. "koo" vs "kaa".
pub struct Call { pub f: Vec<f32>, pub p: Vec<f32>, pub n: Vec<f32>, pub g: Vec<f32>, pub m: Vec<f32>, pub c: Vec<f32>, pub hop: f64, pub ref_hz: f64 }

const NVOICE: usize = 6;
pub const SCOPE_N: usize = 2048;
const OS: usize = 2;
const A_SPAN: f64 = 0.55;
const P_ON: f64 = 0.05;
const HMAX: f64 = 0.3;
const MASTER: f64 = 0.35;

#[derive(Clone)]
struct Side { osc: Osc, dc: OnePole, last: f64, gate: f64, prev_r: f64 }

#[derive(Clone)]
struct Voice {
    on: bool, id: i32, call: usize, pos: f64, ratio: f64, vel: f64, age: u64,
    held: bool, rel: f64, env: f64, target: f64, lfo: f64, dir: f64,
    side: [Side; 2],
    tr: Delay, tr_lp: OnePole,
    oec: Biquad, sac: Biquad, f1: Biquad, f2: Biquad, beak: Biquad, rad: OnePole,
    turb_lp: OnePole, ctl: u32,
    // telemetry
    t_p: f64, t_f: f64, t_w: [f64; 2], t_x: [f64; 2], t_beak: f64, t_oec: f64, t_f1: f64, t_f2: f64, t_lvl: f64, t_b: f64,
}

impl Voice {
    fn new(fsi: f64) -> Voice {
        let side = Side { osc: Osc { x: 1.4, y: 0.0 }, dc: OnePole::default(), last: 0.0, gate: 0.0, prev_r: 0.0 };
        let mut v = Voice {
            on: false, id: -1, call: 0, pos: 0.0, ratio: 1.0, vel: 1.0, age: 0, held: false, rel: 0.0, env: 0.0, target: 1.0, lfo: 0.0, dir: 1.0,
            side: [side.clone(), side],
            tr: Delay::new((0.5 * fsi / 343.0 * 2.0 + 16.0) as usize), tr_lp: OnePole::default(),
            oec: Biquad::default(), sac: Biquad::default(), f1: Biquad::default(), f2: Biquad::default(), beak: Biquad::default(), rad: OnePole::default(),
            turb_lp: OnePole::default(), ctl: 0,
            t_p: 0.0, t_f: 0.0, t_w: [0.0; 2], t_x: [0.0; 2], t_beak: 0.0, t_oec: 0.0, t_f1: 0.0, t_f2: 0.0, t_lvl: 0.0, t_b: 0.0,
        };
        for s in v.side.iter_mut() { s.dc.set_lp(60.0, fsi); }
        v.tr_lp.set_lp(9000.0, fsi);
        v.rad.set_lp(350.0, fsi);
        v.turb_lp.set_lp(4000.0, fsi);
        v
    }
}

pub struct Engine {
    pub fs: f64, fsi: f64,
    pub body: u8,
    pub params: [f64; NPARAM],
    pub fit_tension: f64, pub fit_pressure: f64,
    /// the bird's own knob settings (snapshot at load): knob moves away from these are emphasised
    pub fit_params: [f64; NPARAM],
    /// per call: the stretch SUSTAIN rocks through (frame indices)
    loops: Vec<(f64, f64)>,
    /// oscilloscope of the loudest voice, at the output rate: [labia x, labia y, syrinx, windpipe, heard] x SCOPE_N
    scope: Vec<f32>, scope_pos: usize, scope_v: usize, scope_tick: u32,
    pub calls: Vec<Call>,
    table: Arc<Table>,
    voices: Vec<Voice>,
    noise: Noise,
    dec: Decim2,
    /// the recording-tone correction (eq0..eq7) as filters, and the gains they were built for
    eq: [Biquad; 8], eq_db: [f64; 8], eq_on: bool,
    age: u64,
    os_buf: Vec<f64>,
    last_note: f64,
}

#[inline] fn lerp(a: f64, b: f64, t: f64) -> f64 { a + (b - a) * t }

/// SUSTAIN's loop: the longest loud stretch of the call (pressure above 40% of its peak), trimmed
/// to its middle so the call's attack and ending stay outside it.
fn sustain_loop(c: &Call) -> (f64, f64) {
    let n = c.p.len();
    if n < 4 { return (0.0, (n.max(1) - 1) as f64); }
    let peak = c.p.iter().cloned().fold(0.0f32, f32::max).max(1e-6);
    let (mut best, mut cur) = ((0usize, 0usize), None::<usize>);
    for i in 0..=n {
        let loud = i < n && c.p[i] >= 0.4 * peak;
        match (loud, cur) {
            (true, None) => cur = Some(i),
            (false, Some(a)) => { if i - a > best.1 - best.0 { best = (a, i); } cur = None; }
            _ => {}
        }
    }
    let (a, b) = best;
    let len = (b - a) as f64;
    if len < 3.0 { return (a as f64, (b.max(a + 1) - 1) as f64); }
    (a as f64 + len * 0.2, a as f64 + len * 0.8)
}
#[inline] fn smooth(t: f64) -> f64 { let t = t.clamp(0.0, 1.0); t * t * (3.0 - 2.0 * t) }

impl Engine {
    pub fn new(fs: f64, table: Arc<Table>) -> Engine {
        let fsi = fs * OS as f64;
        let mut params = [0.0; NPARAM];
        for (i, d) in PARAMS.iter().enumerate() { params[i] = d.default; }
        Engine {
            fs, fsi, body: SONGBIRD, params, fit_tension: 0.3, fit_pressure: 1.0, fit_params: params, loops: Vec::new(), scope: vec![0.0; 5 * SCOPE_N], scope_pos: 0, scope_v: 0, scope_tick: 0, calls: Vec::new(), table,
            voices: (0..NVOICE).map(|_| Voice::new(fsi)).collect(),
            noise: Noise(0x1234567), dec: Decim2::new(), eq: [Biquad::default(); 8], eq_db: [0.0; 8], eq_on: false, age: 0, os_buf: Vec::new(), last_note: -1.0,
        }
    }
    pub fn set_param(&mut self, i: usize, v: f64) {
        if i < NPARAM { self.params[i] = v.clamp(PARAMS[i].min.min(PARAMS[i].max), PARAMS[i].max.max(PARAMS[i].min)); }
    }
    pub fn add_call(&mut self, c: Call) { self.loops.push(sustain_loop(&c)); self.calls.push(c); }
    /// Put a call in slot i (replacing what was there, or growing the list), without stopping other voices.
    /// Used by GENERATED calls: each key press writes a fresh phrase into a spare slot and plays it.
    pub fn set_call(&mut self, i: usize, c: Call) {
        let l = sustain_loop(&c);
        if i < self.calls.len() { self.calls[i] = c; self.loops[i] = l; return; }
        while self.calls.len() < i { self.calls.push(c.clone()); self.loops.push(l); }
        self.calls.push(c); self.loops.push(l);
    }
    pub fn clear_calls(&mut self) { self.all_off(); self.calls.clear(); self.loops.clear(); }
    /// Remember the current knobs as the bird's own (call after loading a bird).
    pub fn snapshot_fit(&mut self) { self.fit_params = self.params; }
    pub fn all_off(&mut self) { for v in self.voices.iter_mut() { v.on = false; v.id = -1; } }

    /// Start `call` transposed so its reference pitch lands on `note` (MIDI, fractional ok).
    /// VOICES = MONO / LEGATO reuse one voice; GLIDE slides from the previous note.
    pub fn note_on(&mut self, id: i32, call: usize, note: f64, vel: f64) {
        if call >= self.calls.len() { return; }
        let ref_note = 69.0 + 12.0 * (self.calls[call].ref_hz / 440.0).log2();
        let ratio = 2f64.powf((note - ref_note) / 12.0);
        let glide = self.params[P_GLIDE] > 0.001;
        let from = if glide && self.last_note >= 0.0 { 2f64.powf((self.last_note - ref_note) / 12.0) } else { ratio };
        self.last_note = note;
        self.age += 1;
        let vmode = self.params[P_VMODE].round() as i32;
        if vmode > 0 {
            // the newest sounding voice carries on; any others are let go
            let mut k: Option<usize> = None;
            for (i, v) in self.voices.iter().enumerate() {
                if v.on && v.rel == 0.0 && k.map_or(true, |j| v.age > self.voices[j].age) { k = Some(i); }
            }
            if let Some(k) = k {
                for (i, v) in self.voices.iter_mut().enumerate() { if i != k && v.on { v.rel = v.rel.max(1e-9); } }
                let age = self.age;
                let v = &mut self.voices[k];
                let legato = vmode == 2 && v.held && v.call == call;
                if !glide { v.ratio = ratio; }
                v.target = ratio; v.id = id; v.held = true; v.age = age; v.vel = vel.clamp(0.0, 1.0);
                if !legato { v.call = call; v.pos = 0.0; }
                return;
            }
        }
        // free voice, else steal the oldest
        let mut k = 0; let mut best = u64::MAX;
        for (i, v) in self.voices.iter().enumerate() {
            if !v.on { k = i; break; }
            if v.age < best { best = v.age; k = i; }
        }
        let fsi = self.fsi;
        let v = &mut self.voices[k];
        let fresh = !v.on;
        if fresh { *v = Voice::new(fsi); }
        v.on = true; v.id = id; v.call = call; v.pos = 0.0; v.ratio = from; v.target = ratio; v.vel = vel.clamp(0.0, 1.0);
        v.age = self.age; v.held = true; v.rel = 0.0; v.lfo = 0.0;
        if !fresh { v.env = v.env.min(0.3); }
    }
    pub fn note_off(&mut self, id: i32) {
        for v in self.voices.iter_mut() { if v.on && v.id == id { v.held = false; } }
    }
    pub fn active(&self) -> usize { self.voices.iter().filter(|v| v.on).count() }

    /// Telemetry for the visuals, from the loudest voice.
    /// [active, pressure, tension b, f0, left w, right w, left x, right x, beak gape, oec Hz, F1, F2, level, call, call progress, voices]
    pub fn telemetry(&self, out: &mut [f32; 16]) {
        let mut best: Option<&Voice> = None;
        for v in self.voices.iter().filter(|v| v.on) {
            if best.map_or(true, |b| v.t_lvl > b.t_lvl) { best = Some(v); }
        }
        *out = [0.0; 16];
        out[15] = self.active() as f32;
        out[2] = self.params[P_TENSION] as f32;
        out[8] = self.params[P_BEAK] as f32;
        if let Some(v) = best {
            let len = self.calls.get(v.call).map_or(1, |c| c.f.len()) as f64;
            out[0] = 1.0; out[1] = v.t_p as f32; out[2] = v.t_b as f32; out[3] = v.t_f as f32;
            out[4] = v.t_w[0] as f32; out[5] = v.t_w[1] as f32; out[6] = v.t_x[0] as f32; out[7] = v.t_x[1] as f32;
            out[8] = v.t_beak as f32; out[9] = v.t_oec as f32; out[10] = v.t_f1 as f32; out[11] = v.t_f2 as f32;
            out[12] = v.t_lvl as f32; out[13] = v.call as f32; out[14] = (v.pos / len) as f32;
        }
    }

    /// Rebuild the tone-correction filters when their gains changed.
    fn update_eq(&mut self) {
        let mut on = false;
        for k in 0..8 {
            let g = self.params[P_EQ0 + k];
            if g != self.eq_db[k] { self.eq[k].peak(EQ_HZ[k], 1.1, g, self.fs); self.eq_db[k] = g; }
            on |= g.abs() > 0.05;
        }
        self.eq_on = on;
    }
    pub fn process(&mut self, out: &mut [f32]) {
        let n = out.len();
        if (0..8).any(|k| self.params[P_EQ0 + k] != self.eq_db[k]) { self.update_eq(); }
        if self.os_buf.len() < n * OS { self.os_buf.resize(n * OS, 0.0); }
        for s in self.os_buf[..n * OS].iter_mut() { *s = 0.0; }
        let mut buf = std::mem::take(&mut self.os_buf);
        // the scope watches the loudest voice
        let mut best = -1.0;
        for (i, v) in self.voices.iter().enumerate() { if v.on && v.t_lvl > best { best = v.t_lvl; self.scope_v = i; } }
        for vi in 0..NVOICE {
            if self.voices[vi].on { self.run_voice(vi, &mut buf[..n * OS]); }
        }
        let vol = self.params[P_VOLUME];
        for i in 0..n {
            let mut y = self.dec.run(buf[2 * i], buf[2 * i + 1]) * vol;
            if self.eq_on { for b in self.eq.iter_mut() { y = b.run(y); } }
            // gentle safety saturation
            out[i] = (y / (1.0 + y.abs() * 0.25)) as f32;
        }
        self.os_buf = buf;
    }

    fn run_voice(&mut self, vi: usize, buf: &mut [f64]) {
        let p = self.params;
        let body = self.body;
        let fsi = self.fsi;
        let table = self.table.clone();
        let fit_b = self.fit_tension; let fit_p = self.fit_pressure;
        let call = &self.calls[self.voices[vi].call];
        let nfr = call.f.len();
        let ref_hz = call.ref_hz;
        let mode = p[P_MODE].round() as i32;
        let (la, lb) = self.loops.get(self.voices[vi].call).copied().unwrap_or((0.0, 0.0));
        // knob moves away from the bird's own settings count extra for these gentle controls
        let fp = self.fit_params;
        let emph = |i: usize, k: f64| fp[i] + (p[i] - fp[i]) * k;
        let beak_extra = (p[P_BEAK] - fp[P_BEAK]) * 2.2;
        let breath = emph(P_BREATH, 4.0).clamp(0.0, 2.5);
        let turb_k = emph(P_TURB, 1.8).clamp(0.0, 1.6);
        let press_gain = if fp[P_PRESSURE] > 0.0 { (p[P_PRESSURE] / fp[P_PRESSURE]).powf(1.5) } else { 1.0 };
        let step = p[P_SPEED] / (call.hop * fsi);
        let mass = 2f64.powf(-p[P_MASS] / 12.0); // heavier (positive) = lower
        let pulse_pow = 1.0 + 2.5 * p[P_PULSE];
        let two_ratio = 2f64.powf(p[P_TWO_INT] / 12.0);
        let tr_len = p[P_TRACHEA] / 100.0 / 343.0 * fsi; // one-way delay, samples
        let echo = emph(P_ECHO, 1.6).clamp(-0.95, 0.95);
        let tongue_q = lerp(1.5, 14.0, p[P_MOUTH_Q]);
        let att = 1.0 / (p[P_ATTACK].max(0.002) * fsi);
        let relr = 1.0 / (p[P_RELEASE].max(0.02) * fsi);
        let gcoef = if p[P_GLIDE] > 0.001 { 1.0 - (-1.0 / (p[P_GLIDE] * 0.35 * fsi)).exp() } else { 1.0 };
        let lfo_step = p[P_LFO_RATE] / fsi;
        let vib = p[P_VIBRATO] / 1200.0;
        let trem = p[P_TREMOLO];
        let watch = vi == self.scope_v;
        let mut sc = std::mem::take(&mut self.scope);
        let (mut sp, mut stick) = (self.scope_pos, self.scope_tick);
        let noise = &mut self.noise;
        let v = &mut self.voices[vi];
        let mut lvl = v.t_lvl;
        for s in buf.iter_mut() {
            // ---- gesture read ----
            let fpos = v.pos;
            if fpos >= (nfr - 1) as f64 {
                if mode == 2 && v.held { v.pos = 0.0; } else { v.rel = v.rel.max(1e-9); }
            }
            if mode == 1 && !v.held { v.rel = v.rel.max(1e-9); }
            // SUSTAIN: while held, rock back and forth through the loop (forward, then backward: no jumps)
            if mode == 3 {
                if v.held && v.rel == 0.0 {
                    if v.dir > 0.0 && fpos >= lb { v.dir = -1.0; }
                    else if v.dir < 0.0 && fpos <= la { v.dir = 1.0; }
                } else { v.dir = 1.0; }
            } else { v.dir = 1.0; }
            let i0 = (fpos as usize).min(nfr - 1);
            let i1 = (i0 + 1).min(nfr - 1);
            let fr = (fpos - i0 as f64).clamp(0.0, 1.0);
            let f_raw = lerp(call.f[i0] as f64, call.f[i1] as f64, fr).max(20.0);
            let pr = lerp(call.p[i0] as f64, call.p[i1] as f64, fr).max(0.0);
            let rough = lerp(call.n[i0] as f64, call.n[i1] as f64, fr);
            let goff = if call.g.len() == nfr { lerp(call.g[i0] as f64, call.g[i1] as f64, fr) } else { 0.0 };
            let moff = if call.m.len() == nfr { lerp(call.m[i0] as f64, call.m[i1] as f64, fr) } else { 0.0 };
            let coff = if call.c.len() == nfr { lerp(call.c[i0] as f64, call.c[i1] as f64, fr) } else { 0.0 };
            v.pos = (v.pos + step * v.dir).max(0.0);

            // ---- envelope (declick / release) ----
            if v.rel > 0.0 { v.env -= relr; if v.env <= 0.0 { v.on = false; v.env = 0.0; break; } }
            else if v.env < 1.0 { v.env = (v.env + att).min(1.0); }
            v.ratio += (v.target - v.ratio) * gcoef;
            v.lfo += lfo_step; if v.lfo >= 1.0 { v.lfo -= 1.0; }
            let lfo = (2.0 * core::f64::consts::PI * v.lfo).sin();

            let f0 = ref_hz * (f_raw / ref_hz).powf(p[P_SWEEP]) * v.ratio * mass * if vib > 0.0 { 2f64.powf(vib * lfo) } else { 1.0 };
            let pp = pr.powf(pulse_pow) * (0.85 + 0.15 * v.vel) * (1.0 - trem * 0.5 * (1.0 - lfo));
            // turbulence: noisy airflow modulating pressure & tension
            let tn = v.turb_lp.lp(noise.next()) * 3.0;
            let turb = turb_k * (0.35 + rough) * pp.sqrt();
            let b = p[P_TENSION] + turb * tn * 0.4;

            // ---- which sides sing ----
            // w = loudness weight per side, iv = side sings the second-voice interval
            let mut w = [1.0, 0.0];
            let mut iv = [false, false];
            match body {
                SONGBIRD => {
                    let r = smooth(((f0 / p[P_SPLIT]).log2() + 0.15) / 0.3);
                    let sw = [1.0 - r, r];
                    let main = if r < 0.5 { 0 } else { 1 };
                    let two = p[P_TWO];
                    w = sw;
                    // the other side can sing a second voice at the interval
                    if two > sw[1 - main] { w[1 - main] = two; iv[1 - main] = true; }
                }
                KINGFISHER => { w = [1.0, p[P_TWO]]; iv = [false, true]; }
                _ => {}
            }
            let mut src = 0.0;
            for k in 0..2 {
                let sd = &mut v.side[k];
                let wk = w[k];
                if wk < 1e-3 && sd.gate < 1e-4 { sd.last = 0.0; continue; }
                sd.gate += (wk - sd.gate) * 0.002;
                let fk = if iv[k] { f0 * two_ratio } else { f0 };
                let pk = pp * sd.gate;
                let u = (pk * p[P_PRESSURE] - P_ON) * A_SPAN;
                let u_ref = (pk * fit_p - P_ON) * A_SPAN;
                let mut a = table.threshold(b) + u + turb * tn * 0.15;
                if body == KINGFISHER {
                    let other = v.side[1 - k].last;
                    a += p[P_COUPLING] * 0.35 * other;
                }
                let sd = &mut v.side[k];
                let wref = table.omega(u_ref, fit_b, 0.12);
                let gamma = 2.0 * core::f64::consts::PI * fk / wref;
                sd.osc.advance(a, b, gamma / fsi, HMAX);
                let x = sd.osc.x - table.mean_x(u, b);
                sd.last = x;
                // labial closure: the airflow is cut while the labia are shut, and the
                // abrupt cut-off radiates strongly (flow derivative)
                let cl = (p[P_CLOSURE] + coff).clamp(0.0, 1.0);
                let a_est = table.amplitude(u, b).max(0.05);
                let r = x.max(-a_est * (1.0 - cl));
                let dr = (r - sd.prev_r) * fsi / (2.0 * core::f64::consts::PI * fk);
                sd.prev_r = r;
                let y = sd.dc.hp(r + cl * 0.9 * dr) * pk;
                // turbulent jet noise, strongest while the labia are open
                let open = (sd.osc.x - 0.2).max(0.0).min(2.0);
                src += y + noise.next() * breath * pk * (0.15 + 0.85 * open) * 5.0;
                v.t_x[k] = sd.osc.x;
            }
            // breath noise enters at the syrinx
            src += noise.next() * breath * 0.08 * pp;

            // ---- windpipe (Amador et al.: p_i(t) = s(t) - r p_i(t - T)) ----
            let back = v.tr_lp.lp(v.tr.read(2.0 * tr_len - 1.0));
            let pi = src - echo * back;
            v.tr.push(pi);
            let tr_out = (1.0 - echo.abs() * 0.5) * v.tr.read(tr_len);

            // ---- control-rate filter updates ----
            if v.ctl == 0 {
                let oct = (f0 / 1000.0).log2();
                // the fitted gape, then the extra from moving BEAK OPENING away from the bird's value
                let gape = ((p[P_BEAK] + p[P_BEAK_TRACK] * oct * 0.35 + goff).clamp(0.0, 1.0) + beak_extra).clamp(-1.0, 1.25);
                let fb = 1500.0 * 2f64.powf(gape * 3.4);
                v.beak.lowpass(fb, 0.55, fsi);
                v.t_beak = gape;
                if body == PARROT || p[P_MOUTH_MIX] > 0.0 {
                    let f1 = 800.0 * 2f64.powf(1.6 * (p[P_TONGUE_H] + moff).clamp(-0.3, 1.3));
                    let f2 = 2000.0 * 2f64.powf(1.4 * p[P_TONGUE_P]);
                    v.f1.bandpass(f1, tongue_q, fsi);
                    v.f2.bandpass(f2, tongue_q, fsi);
                    v.t_f1 = f1; v.t_f2 = f2;
                }
                if body != PARROT {
                    let fo = 2f64.powf(lerp(p[P_OEC].log2(), (f0 * 1.08).log2(), p[P_OEC_TRACK]));
                    v.oec.lowpass(fo, 2.2, fsi);
                    v.t_oec = fo;
                    if body == DOVE {
                        // sac resonance: follows the note as the oesophagus inflates (tracking)
                        let fs_ = 2f64.powf(lerp(p[P_OEC].log2(), f0.log2(), p[P_OEC_TRACK]));
                        v.sac.bandpass(fs_, lerp(1.2, 9.0, p[P_SAC_Q]), fsi);
                    }
                }
                v.t_p = pp * p[P_PRESSURE]; v.t_f = f0; v.t_w = w; v.t_b = b;
            }
            v.ctl = (v.ctl + 1) & 15;

            let shaped = if body == PARROT {
                0.3 * tr_out + 1.6 * v.f1.run(tr_out) + 1.1 * v.f2.run(tr_out)
            } else {
                let d = p[P_OEC_DEPTH];
                let base = (1.0 - d) * 0.5 * tr_out + d * v.oec.run(tr_out);
                // mouth and tongue resonances after the throat (the parrot model's tract)
                let m = p[P_MOUTH_MIX];
                if m > 0.0 { (1.0 - m) * base + m * (0.3 * base + 1.6 * v.f1.run(base) + 1.1 * v.f2.run(base)) } else { base }
            };
            let mut radiated = v.beak.run(v.rad.hp(shaped));
            if body == DOVE {
                // closed-beak coo: the inflated oesophagus is a resonator tuned near the
                // fundamental whose wall radiates through the neck (Riede et al. 2004; Fletcher et al. 2004)
                let s_mix = p[P_SAC];
                radiated = (1.0 - s_mix) * radiated + s_mix * 1.4 * v.sac.run(tr_out);
            }
            let y = radiated * MASTER * v.env * (0.35 + 0.65 * v.vel) * press_gain;
            lvl += (y.abs() - lvl) * 0.0005;
            *s += y;
            if watch {
                stick += 1;
                if stick % OS as u32 == 0 {   // one scope sample per output sample
                    let k = if v.t_w[1] > v.t_w[0] { 1 } else { 0 };
                    sc[sp] = v.side[k].osc.x as f32; sc[SCOPE_N + sp] = v.side[k].osc.y as f32;
                    sc[2 * SCOPE_N + sp] = src as f32; sc[3 * SCOPE_N + sp] = tr_out as f32; sc[4 * SCOPE_N + sp] = y as f32;
                    sp = (sp + 1) % SCOPE_N;
                }
            }
        }
        v.t_lvl = lvl;
        self.scope = sc; self.scope_pos = sp; self.scope_tick = stick;
    }

    /// The scope in time order: 5 channels of SCOPE_N samples (labia x, labia y, syrinx, windpipe, heard).
    pub fn scope(&self, out: &mut [f32]) {
        for ch in 0..5 {
            for i in 0..SCOPE_N {
                out[ch * SCOPE_N + i] = self.scope[ch * SCOPE_N + (self.scope_pos + i) % SCOPE_N];
            }
        }
    }

    /// Offline render of one call at its reference pitch (used by the fitter).
    pub fn render_call(&mut self, call: usize, ratio_note: Option<f64>) -> Vec<f32> {
        self.all_off();
        let c = &self.calls[call];
        let note = ratio_note.unwrap_or(69.0 + 12.0 * (c.ref_hz / 440.0).log2());
        let len = ((c.f.len() as f64 * c.hop / self.params[P_SPEED]) * self.fs) as usize + (0.05 * self.fs) as usize;
        let mode = self.params[P_MODE];
        self.params[P_MODE] = 0.0;
        self.note_on(1, call, note, 1.0);
        let mut out = vec![0.0f32; len];
        for chunk in out.chunks_mut(256) { self.process(chunk); }
        self.params[P_MODE] = mode;
        self.all_off();
        self.dec.clear();
        for b in self.eq.iter_mut() { b.reset(); }
        out
    }
}
