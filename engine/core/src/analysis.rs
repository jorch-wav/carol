//! Analysis: WAV I/O, STFT features (pitch, loudness, harmonicity, spectrum),
//! call segmentation, gesture extraction and the match score.

use crate::dsp::Biquad;
use core::f64::consts::PI;

pub const HOP_S: f64 = 0.005;

// ------------------------------------------------------------------ WAV
pub fn read_wav(bytes: &[u8]) -> Option<(Vec<f32>, f64)> {
    if bytes.len() < 44 || &bytes[0..4] != b"RIFF" || &bytes[8..12] != b"WAVE" { return None; }
    let mut i = 12; let mut fs = 44100.0; let mut ch = 1usize; let mut bits = 16u16; let mut fmt = 1u16;
    while i + 8 <= bytes.len() {
        let id = &bytes[i..i + 4];
        let sz = u32::from_le_bytes([bytes[i + 4], bytes[i + 5], bytes[i + 6], bytes[i + 7]]) as usize;
        let d = &bytes[i + 8..(i + 8 + sz).min(bytes.len())];
        if id == b"fmt " && d.len() >= 16 {
            fmt = u16::from_le_bytes([d[0], d[1]]);
            ch = u16::from_le_bytes([d[2], d[3]]) as usize;
            fs = u32::from_le_bytes([d[4], d[5], d[6], d[7]]) as f64;
            bits = u16::from_le_bytes([d[14], d[15]]);
        } else if id == b"data" {
            let mut out = Vec::new();
            let bps = (bits / 8) as usize; let frame = bps * ch;
            for f in d.chunks_exact(frame) {
                let mut acc = 0.0f32;
                for c in 0..ch {
                    let s = &f[c * bps..(c + 1) * bps];
                    acc += match (fmt, bits) {
                        (1, 16) => i16::from_le_bytes([s[0], s[1]]) as f32 / 32768.0,
                        (1, 24) => ((i32::from_le_bytes([0, s[0], s[1], s[2]])) >> 8) as f32 / 8388608.0,
                        (3, 32) => f32::from_le_bytes([s[0], s[1], s[2], s[3]]),
                        (1, 32) => i32::from_le_bytes([s[0], s[1], s[2], s[3]]) as f32 / 2147483648.0,
                        _ => 0.0,
                    };
                }
                out.push(acc / ch as f32);
            }
            return Some((out, fs));
        }
        i += 8 + sz + (sz & 1);
    }
    None
}

pub fn write_wav(x: &[f32], fs: u32) -> Vec<u8> {
    let mut b = Vec::with_capacity(44 + x.len() * 2);
    let n = (x.len() * 2) as u32;
    b.extend_from_slice(b"RIFF"); b.extend_from_slice(&(36 + n).to_le_bytes()); b.extend_from_slice(b"WAVEfmt ");
    b.extend_from_slice(&16u32.to_le_bytes()); b.extend_from_slice(&1u16.to_le_bytes()); b.extend_from_slice(&1u16.to_le_bytes());
    b.extend_from_slice(&fs.to_le_bytes()); b.extend_from_slice(&(fs * 2).to_le_bytes());
    b.extend_from_slice(&2u16.to_le_bytes()); b.extend_from_slice(&16u16.to_le_bytes());
    b.extend_from_slice(b"data"); b.extend_from_slice(&n.to_le_bytes());
    for &s in x { b.extend_from_slice(&((s.clamp(-1.0, 1.0) * 32767.0) as i16).to_le_bytes()); }
    b
}

/// Linear-interpolation resampler (adequate for analysis; recordings are converted by ffmpeg anyway).
pub fn resample(x: &[f32], from: f64, to: f64) -> Vec<f32> {
    if (from - to).abs() < 0.5 { return x.to_vec(); }
    let n = (x.len() as f64 * to / from) as usize;
    (0..n).map(|i| {
        let t = i as f64 * from / to; let k = t as usize; let f = (t - k as f64) as f32;
        let a = x[k.min(x.len() - 1)]; let b = x[(k + 1).min(x.len() - 1)]; a + (b - a) * f
    }).collect()
}

// ------------------------------------------------------------------ FFT
pub struct Fft { n: usize, cos: Vec<f64>, sin: Vec<f64>, rev: Vec<usize> }
impl Fft {
    pub fn new(n: usize) -> Fft {
        let bits = n.trailing_zeros();
        let rev = (0..n).map(|i| i.reverse_bits() >> (usize::BITS - bits)).collect();
        let cos = (0..n / 2).map(|i| (2.0 * PI * i as f64 / n as f64).cos()).collect();
        let sin = (0..n / 2).map(|i| -(2.0 * PI * i as f64 / n as f64).sin()).collect();
        Fft { n, cos, sin, rev }
    }
    pub fn run(&self, re: &mut [f64], im: &mut [f64]) {
        let n = self.n;
        for i in 0..n { let j = self.rev[i]; if j > i { re.swap(i, j); im.swap(i, j); } }
        let mut len = 2;
        while len <= n {
            let step = n / len;
            for s in (0..n).step_by(len) {
                for k in 0..len / 2 {
                    let (c, si) = (self.cos[k * step], self.sin[k * step]);
                    let (a, b) = (s + k, s + k + len / 2);
                    let tr = re[b] * c - im[b] * si; let ti = re[b] * si + im[b] * c;
                    re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
                }
            }
            len <<= 1;
        }
    }
}

// ------------------------------------------------------------------ features
pub const NMEL: usize = 32;
pub const MEL_LO: f64 = 300.0;
pub const MEL_HI: f64 = 12000.0;

#[derive(Clone, Default)]
pub struct Features {
    pub hop: f64,
    pub f0: Vec<f64>,     // Hz (0 = none)
    pub conf: Vec<f64>,   // harmonicity 0..1
    pub db: Vec<f64>,     // band level dB
    pub mel: Vec<[f32; NMEL]>, // band power dB
    pub floor_db: f64,
    pub noise_mel: [f32; NMEL],
}

pub struct Analyzer { fs: f64, win: usize, nfft: usize, hop: usize, fft: Fft, w: Vec<f64>, mel_edges: Vec<usize>, pub fmin: f64, pub fmax: f64 }

fn mel(f: f64) -> f64 { 2595.0 * (1.0 + f / 700.0).log10() }
fn imel(m: f64) -> f64 { 700.0 * (10f64.powf(m / 2595.0) - 1.0) }

impl Analyzer {
    pub fn new(fs: f64, fmin: f64, fmax: f64) -> Analyzer {
        let win = if fs > 30000.0 { 1024 } else { 512 };
        let nfft = win * 4;
        let hop = (HOP_S * fs).round() as usize;
        let w = (0..win).map(|i| 0.5 - 0.5 * (2.0 * PI * i as f64 / win as f64).cos()).collect();
        let (m0, m1) = (mel(MEL_LO), mel(MEL_HI.min(fs * 0.45)));
        let mel_edges = (0..=NMEL).map(|i| ((imel(m0 + (m1 - m0) * i as f64 / NMEL as f64) / fs * nfft as f64).round() as usize).max(1)).collect();
        Analyzer { fs, win, nfft, hop, fft: Fft::new(nfft), w, mel_edges, fmin, fmax }
    }
    pub fn hop_s(&self) -> f64 { self.hop as f64 / self.fs }

    pub fn analyze(&self, x_in: &[f32]) -> Features {
        // high-pass to remove wind / handling noise
        let mut hp1 = Biquad::default(); hp1.highpass((self.fmin * 0.7).max(150.0), 0.707, self.fs);
        let mut hp2 = hp1;
        let x: Vec<f64> = x_in.iter().map(|&s| hp2.run(hp1.run(s as f64))).collect();
        let nfr = if x.len() > self.win { (x.len() - self.win) / self.hop + 1 } else { 1 };
        let half = self.nfft / 2;
        let bin_hz = self.fs / self.nfft as f64;
        let mut re = vec![0.0; self.nfft]; let mut im = vec![0.0; self.nfft];
        let mut mag = vec![0.0; half];
        // candidate f0 grid, 1/8 semitone
        let ncand = ((self.fmax / self.fmin).log2() * 96.0) as usize + 1;
        let cands: Vec<f64> = (0..ncand).map(|i| self.fmin * 2f64.powf(i as f64 / 96.0)).collect();
        let mut feats = Features { hop: self.hop_s(), ..Default::default() };
        let lo_bin = (self.fmin * 0.7 / bin_hz) as usize; let hi_bin = ((16000.0f64).min(self.fs * 0.45) / bin_hz) as usize;
        let mut tops: Vec<Vec<(f64, f64)>> = Vec::with_capacity(nfr);
        for fi in 0..nfr {
            let off = fi * self.hop;
            for i in 0..self.nfft { re[i] = 0.0; im[i] = 0.0; }
            for i in 0..self.win { re[i] = x.get(off + i).copied().unwrap_or(0.0) * self.w[i]; }
            self.fft.run(&mut re, &mut im);
            let mut tot = 0.0;
            for k in 0..half { let p = re[k] * re[k] + im[k] * im[k]; mag[k] = p; if k >= lo_bin && k < hi_bin { tot += p; } }
            let norm = (self.win as f64 * 0.5).powi(2);
            feats.db.push(10.0 * (tot / norm + 1e-12).log10());
            let mut m = [0f32; NMEL];
            for b in 0..NMEL {
                let (a, c) = (self.mel_edges[b], self.mel_edges[b + 1].max(self.mel_edges[b] + 1));
                let s: f64 = mag[a.min(half - 1)..c.min(half)].iter().sum::<f64>() / (c - a) as f64;
                m[b] = (10.0 * (s / norm + 1e-12).log10()) as f32;
            }
            feats.mel.push(m);
            // harmonic-sum pitch candidates on compressed magnitude
            let cm = |f: f64| -> f64 {
                let k = f / bin_hz; let i = k as usize; if i + 1 >= half { return 0.0; }
                let fr = k - i as f64; (mag[i] * (1.0 - fr) + mag[i + 1] * fr).powf(0.25)
            };
            let mut best: Vec<(f64, f64)> = Vec::new();
            let mut scores = vec![0.0; ncand];
            for (ci, &f) in cands.iter().enumerate() {
                let mut s = 0.0; let mut h = 1.0;
                while h * f < self.fs * 0.45 && h <= 8.0 {
                    s += cm(h * f) / h.sqrt();
                    if h >= 1.0 { s -= 0.6 * cm((h - 0.5) * f) / h.sqrt(); }
                    h += 1.0;
                }
                scores[ci] = s;
            }
            for ci in 1..ncand.saturating_sub(1) {
                if scores[ci] > scores[ci - 1] && scores[ci] >= scores[ci + 1] { best.push((cands[ci], scores[ci])); }
            }
            best.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap());
            best.truncate(5);
            // harmonicity of the best candidate: energy near harmonics / total
            let conf = if let Some(&(f, _)) = best.first() {
                let mut hsum = 0.0; let mut h = 1.0;
                while h * f < 16000.0f64.min(self.fs * 0.45) {
                    let c = (h * f / bin_hz) as usize; let wdt = 6usize;
                    for k in c.saturating_sub(wdt)..(c + wdt + 1).min(half) { if k >= lo_bin && k < hi_bin { hsum += mag[k]; } }
                    h += 1.0;
                }
                (hsum / (tot + 1e-20)).clamp(0.0, 1.0)
            } else { 0.0 };
            feats.conf.push(conf);
            tops.push(best);
        }
        // noise floor & noise spectrum
        let mut sorted = feats.db.clone(); sorted.sort_by(|a, b| a.partial_cmp(b).unwrap());
        let mx = *sorted.last().unwrap();
        feats.floor_db = sorted[(sorted.len() as f64 * 0.15) as usize].min(mx - 30.0);
        let quiet: Vec<usize> = (0..nfr).filter(|&i| feats.db[i] <= feats.floor_db + 3.0).collect();
        for b in 0..NMEL {
            let mut v: Vec<f32> = quiet.iter().map(|&i| feats.mel[i][b]).collect();
            v.sort_by(|a, c| a.partial_cmp(c).unwrap());
            feats.noise_mel[b] = if v.is_empty() { -120.0 } else { v[v.len() / 2] };
        }
        // Viterbi over candidates for a continuous track
        feats.f0 = viterbi(&tops);
        for i in 0..nfr { if feats.db[i] < feats.floor_db + 6.0 { feats.f0[i] = 0.0; } }
        feats
    }
}

fn viterbi(tops: &[Vec<(f64, f64)>]) -> Vec<f64> {
    let n = tops.len();
    if n == 0 { return vec![]; }
    let mut cost: Vec<Vec<f64>> = Vec::with_capacity(n);
    let mut back: Vec<Vec<usize>> = Vec::with_capacity(n);
    for (t, c) in tops.iter().enumerate() {
        let maxs = c.first().map_or(1.0, |x| x.1.max(1e-9));
        let local: Vec<f64> = c.iter().map(|x| 1.0 - x.1 / maxs).collect();
        if t == 0 || tops[t - 1].is_empty() {
            cost.push(local); back.push(vec![0; c.len()]); continue;
        }
        let mut cc = Vec::with_capacity(c.len()); let mut bb = Vec::with_capacity(c.len());
        for (j, x) in c.iter().enumerate() {
            let mut best = f64::MAX; let mut bi = 0;
            for (k, y) in tops[t - 1].iter().enumerate() {
                let jump = (x.0 / y.0).log2().abs() * 12.0; // semitones
                let v = cost[t - 1][k] + 0.08 * jump.min(24.0);
                if v < best { best = v; bi = k; }
            }
            cc.push(best + local[j]); bb.push(bi);
        }
        cost.push(cc); back.push(bb);
    }
    let mut out = vec![0.0; n];
    let mut t = n - 1;
    loop {
        if !tops[t].is_empty() {
            let mut j = (0..tops[t].len()).min_by(|&a, &b| cost[t][a].partial_cmp(&cost[t][b]).unwrap()).unwrap();
            // walk back while candidates exist
            loop {
                out[t] = tops[t][j].0;
                if t == 0 || tops[t - 1].is_empty() { break; }
                j = back[t][j]; t -= 1;
            }
        }
        if t == 0 { break; }
        t -= 1;
    }
    out
}

// ------------------------------------------------------------------ segmentation
#[derive(Clone, Debug)]
pub struct Segment { pub start: usize, pub end: usize, pub snr: f64, pub conf: f64 }

pub fn segment(f: &Features, gap_s: f64, min_s: f64, max_s: f64) -> Vec<Segment> {
    let thr = f.floor_db + 10.0;
    let n = f.db.len();
    let gap = (gap_s / f.hop) as usize; let minl = (min_s / f.hop) as usize; let maxl = (max_s / f.hop) as usize;
    let mut segs = Vec::new();
    let mut i = 0;
    while i < n {
        if f.db[i] < thr { i += 1; continue; }
        let s = i; let mut e = i; let mut j = i;
        while j < n && j - e <= gap && j - s < maxl { if f.db[j] >= thr { e = j; } j += 1; }
        if e - s + 1 >= minl {
            let act: Vec<usize> = (s..=e).filter(|&k| f.db[k] >= thr).collect();
            let snr = act.iter().map(|&k| f.db[k]).sum::<f64>() / act.len() as f64 - f.floor_db;
            let conf = act.iter().map(|&k| f.conf[k]).sum::<f64>() / act.len() as f64;
            segs.push(Segment { start: s, end: e + 1, snr, conf });
        }
        i = e + 1;
    }
    segs
}

/// Gesture tracks for a segment: (f Hz, pressure 0..1, roughness 0..1, ref Hz).
pub fn gesture(f: &Features, s: &Segment, pad: usize) -> (Vec<f32>, Vec<f32>, Vec<f32>, f64) {
    let a = s.start.saturating_sub(pad); let b = (s.end + pad).min(f.db.len());
    let peak = (a..b).map(|i| f.db[i]).fold(-200.0, f64::max);
    let gate = f.floor_db + 6.0;
    let mut fv: Vec<f64> = (a..b).map(|i| f.f0[i]).collect();
    // fill gaps in pitch by interpolation / hold
    let known: Vec<usize> = (0..fv.len()).filter(|&i| fv[i] > 0.0).collect();
    if known.is_empty() { fv.iter_mut().for_each(|v| *v = 1000.0); } else {
        for i in 0..fv.len() {
            if fv[i] > 0.0 { continue; }
            let prev = known.iter().rev().find(|&&k| k < i).copied();
            let next = known.iter().find(|&&k| k > i).copied();
            fv[i] = match (prev, next) {
                (Some(p), Some(q)) => { let t = (i - p) as f64 / (q - p) as f64; (fv[p].ln() * (1.0 - t) + fv[q].ln() * t).exp() }
                (Some(p), None) => fv[p], (None, Some(q)) => fv[q], _ => 1000.0,
            };
        }
    }
    let p: Vec<f32> = (a..b).map(|i| if f.db[i] < gate { 0.0 } else {
        let g = ((f.db[i] - gate) / 6.0).clamp(0.0, 1.0);
        (10f64.powf((f.db[i] - peak) / 20.0) * g) as f32
    }).collect();
    let mut n: Vec<f32> = (a..b).map(|i| (1.0 - f.conf[i]).clamp(0.0, 1.0) as f32).collect();
    // smooth roughness
    let n2 = n.clone();
    for i in 0..n.len() { let lo = i.saturating_sub(4); let hi = (i + 5).min(n.len()); n[i] = n2[lo..hi].iter().sum::<f32>() / (hi - lo) as f32; }
    // reference pitch: loudness-weighted median of log f
    let mut wl: Vec<(f64, f64)> = (0..fv.len()).filter(|&i| p[i] > 0.0).map(|i| (fv[i].ln(), (p[i] as f64).powi(2))).collect();
    wl.sort_by(|x, y| x.0.partial_cmp(&y.0).unwrap());
    let tot: f64 = wl.iter().map(|x| x.1).sum();
    let mut acc = 0.0; let mut r = 1000f64.ln();
    for (v, w) in &wl { acc += w; if acc >= tot * 0.5 { r = *v; break; } }
    (fv.iter().map(|&v| v as f32).collect(), p, n, r.exp())
}

// ------------------------------------------------------------------ match score
#[derive(Clone, Copy, Debug, Default)]
pub struct Score { pub pitch_cents: f64, pub loud_db: f64, pub spec_db: f64, pub total: f64 }

/// Compare synth features against a target segment's features (frames aligned at t0 of both).
pub fn compare(target: &Features, t0: usize, len: usize, synth: &Features) -> Score {
    let n = len.min(synth.db.len()).min(target.db.len().saturating_sub(t0));
    let thr = target.floor_db + 12.0;
    let act: Vec<usize> = (0..n).filter(|&i| target.db[t0 + i] >= thr).collect();
    if act.is_empty() { return Score { total: 0.0, ..Default::default() }; }
    // pitch: frames where target is tonal
    let mut cents: Vec<f64> = act.iter().filter(|&&i| target.conf[t0 + i] > 0.35 && target.f0[t0 + i] > 0.0)
        .map(|&i| { let s = synth.f0[i]; if s <= 0.0 { 600.0 } else { (1200.0 * (s / target.f0[t0 + i]).log2()).abs().min(600.0) } }).collect();
    cents.sort_by(|a, b| a.partial_cmp(b).unwrap());
    let pc = if cents.is_empty() { 0.0 } else { cents[cents.len() / 2] * 0.5 + cents.iter().sum::<f64>() / cents.len() as f64 * 0.5 };
    // loudness shape (level offset free), over frames where either is active
    let rng: Vec<usize> = (0..n).filter(|&i| target.db[t0 + i] >= thr || synth.db[i] > synth.db.iter().cloned().fold(-200.0, f64::max) - 25.0).collect();
    let tl: Vec<f64> = rng.iter().map(|&i| target.db[t0 + i].max(target.floor_db + 6.0)).collect();
    let smax = synth.db.iter().cloned().fold(-200.0, f64::max);
    let sl: Vec<f64> = rng.iter().map(|&i| synth.db[i].max(smax - 40.0)).collect();
    let off = tl.iter().zip(&sl).map(|(a, b)| a - b).sum::<f64>() / tl.len().max(1) as f64;
    let ld = tl.iter().zip(&sl).map(|(a, b)| (a - b - off).abs().min(30.0)).sum::<f64>() / tl.len().max(1) as f64;
    // spectral shape on active frames, noise-subtracted target
    let legacy = std::env::var("CAROL_LEGACY_METRIC").is_ok();
    let mut sd = 0.0; let mut cnt = 0.0;
    for &i in &act { sd += frame_spec_err(target, t0 + i, synth, i, legacy); cnt += 1.0; }
    let sdb = sd / cnt;
    let s_p = (-pc / 120.0).exp(); let s_l = (-ld / 6.0).exp(); let s_s = (-sdb / 9.0).exp();
    let total = 100.0 * (0.35 * s_p + 0.25 * s_l + 0.40 * s_s);
    Score { pitch_cents: pc, loud_db: ld, spec_db: sdb, total }
}

/// Mean spectral shapes (dB re. frame max) of target and synth over target-active frames. For diagnostics.
pub fn shape_profiles(target: &Features, t0: usize, len: usize, synth: &Features) -> (Vec<f64>, Vec<f64>) {
    let n = len.min(synth.db.len()).min(target.db.len().saturating_sub(t0));
    let thr = target.floor_db + 12.0;
    let mut ta = vec![0.0; NMEL]; let mut sa = vec![0.0; NMEL]; let mut c = 0.0;
    for i in (0..n).filter(|&i| target.db[t0 + i] >= thr) {
        let t = &target.mel[t0 + i]; let s = &synth.mel[i];
        let tv: Vec<f64> = (0..NMEL).map(|b| { let tp = 10f64.powf(t[b] as f64 / 10.0) - 10f64.powf(target.noise_mel[b] as f64 / 10.0); 10.0 * tp.max(10f64.powf(t[b] as f64 / 10.0) * 0.03).log10() }).collect();
        let tm = tv.iter().cloned().fold(-300.0, f64::max); let sm = s.iter().map(|&v| v as f64).fold(-300.0, f64::max);
        for b in 0..NMEL { ta[b] += (tv[b] - tm).max(-45.0); sa[b] += (s[b] as f64 - sm).max(-45.0); }
        c += 1.0;
    }
    (ta.iter().map(|v| v / c).collect(), sa.iter().map(|v| v / c).collect())
}

/// Brightness of a frame: loudness-weighted mean log2 frequency of the mel bands above
/// 0.7 x f0, minus log2 f0 (octaves). Target frames can be noise-subtracted. Assumes 44.1 kHz.
pub fn brightness(f: &Features, k: usize, f0: f64, denoise: bool) -> Option<f64> {
    let m = f.mel.get(k)?;
    let (m0, m1) = (mel(MEL_LO), mel(MEL_HI.min(44100.0 * 0.45)));
    let (mut w, mut acc) = (0.0, 0.0);
    for b in 0..NMEL {
        let fc = imel(m0 + (m1 - m0) * (b as f64 + 0.5) / NMEL as f64);
        if fc < f0 * 0.7 { continue; }
        let mut pw = 10f64.powf(m[b] as f64 / 10.0);
        if denoise { pw = (pw - 10f64.powf(f.noise_mel[b] as f64 / 10.0)).max(0.0); }
        w += pw; acc += pw * fc.log2();
    }
    if w <= 0.0 { None } else { Some(acc / w - f0.log2()) }
}

/// Spectral-shape error (dB, mean over mel bands) of one synth frame against one target
/// frame. Bands under the recording's noise floor only count if the synth is louder.
pub fn frame_spec_err(target: &Features, ti: usize, synth: &Features, si: usize, legacy: bool) -> f64 {
    let (t, s) = match (target.mel.get(ti), synth.mel.get(si)) { (Some(t), Some(s)) => (t, s), _ => return 0.0 };
    let mut tv = [0.0f64; NMEL]; let mut sv = [0.0f64; NMEL]; let mut hidden = [false; NMEL];
    for b in 0..NMEL {
        let raw = 10f64.powf(t[b] as f64 / 10.0); let nz = 10f64.powf(target.noise_mel[b] as f64 / 10.0);
        tv[b] = 10.0 * (raw - nz).max(raw * 0.03).log10();
        hidden[b] = raw < nz * 2.0;
        sv[b] = s[b] as f64;
    }
    let tm = tv.iter().cloned().fold(-300.0, f64::max); let sm = sv.iter().cloned().fold(-300.0, f64::max);
    let mut d = 0.0;
    for b in 0..NMEL {
        let (tr, sr) = ((tv[b] - tm).max(-45.0), (sv[b] - sm).max(-45.0));
        if hidden[b] && !legacy {
            let nr = (target.noise_mel[b] as f64 - tm).max(-45.0);
            d += (sr - nr).max(0.0);
        } else { d += (tr - sr).abs(); }
    }
    d / NMEL as f64
}
