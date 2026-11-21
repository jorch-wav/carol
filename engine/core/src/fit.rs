//! Automatic fitting: pick clean calls, turn them into gestures, then search
//! the body parameters until the synth sounds closest to the recordings.

use crate::analysis::*;
use crate::engine::*;
use crate::model::Table;
use std::sync::Arc;

pub struct Recording { pub name: String, pub audio: Vec<f32>, pub fs: f64 }

#[derive(Clone)]
pub struct Item {
    pub rec: usize, pub t0: usize, pub len: usize, pub kind: &'static str,
    pub call: Call, pub start_s: f64, pub end_s: f64, pub quality: f64,
}

pub struct Prepared { pub feats: Vec<Arc<Features>>, pub items: Vec<Item>, pub fs: f64, pub fmin: f64, pub fmax: f64 }

/// Analyse recordings and choose up to `max_items` calls / phrases.
pub fn prepare(recs: &[Recording], fmin: f64, fmax: f64, max_items: usize, max_len_s: f64) -> Prepared {
    let fs = 44100.0;
    let an = Analyzer::new(fs, fmin, fmax);
    let mut feats = Vec::new();
    let mut cands: Vec<Item> = Vec::new();
    let pad = 6;
    for (ri, r) in recs.iter().enumerate() {
        let x = resample(&r.audio, r.fs, fs);
        let f = an.analyze(&x);
        for gap in [0.12, 0.45] {
            for s in segment(&f, gap, 0.08, max_len_s) {
                let dur = (s.end - s.start) as f64 * f.hop;
                if s.snr < 15.0 { continue; }
                let (fv, p, n, rhz) = gesture(&f, &s, pad);
                let kind = if dur > 1.6 { "phrase" } else { "call" };
                // prefer loud, clean, tonal-enough, mid-length items
                let len_pref = if dur < 0.15 { 0.6 } else if dur > 5.0 { 0.7 } else { 1.0 };
                let quality = (s.snr / 40.0).min(1.2) * (0.5 + 0.5 * s.conf) * len_pref;
                let a = s.start.saturating_sub(pad);
                cands.push(Item {
                    rec: ri, t0: a, len: fv.len(), kind,
                    call: Call { g: vec![0.0; fv.len()], m: vec![0.0; fv.len()], c: vec![0.0; fv.len()], f: fv, p, n, hop: f.hop, ref_hz: rhz },
                    start_s: a as f64 * f.hop, end_s: (a + p_len(&f, &s, pad)) as f64 * f.hop, quality,
                });
            }
        }
        feats.push(Arc::new(f));
    }
    cands.sort_by(|a, b| b.quality.partial_cmp(&a.quality).unwrap());
    // diversity: at most 3 per recording, no overlapping duplicates, mix of calls and phrases
    let mut chosen: Vec<Item> = Vec::new();
    let nphr_max = (max_items / 3).max(1);
    for c in cands {
        if chosen.len() >= max_items { break; }
        if chosen.iter().filter(|x| x.rec == c.rec).count() >= 3 { continue; }
        if chosen.iter().any(|x| x.rec == c.rec && x.start_s < c.end_s && c.start_s < x.end_s) { continue; }
        if c.kind == "phrase" && chosen.iter().filter(|x| x.kind == "phrase").count() >= nphr_max { continue; }
        chosen.push(c);
    }
    Prepared { feats, items: chosen, fs, fmin, fmax }
}

fn p_len(f: &Features, s: &Segment, pad: usize) -> usize { (s.end + pad).min(f.db.len()) - s.start.saturating_sub(pad) }

pub fn free_params(body: u8) -> Vec<usize> {
    match body {
        SONGBIRD => vec![P_PRESSURE, P_CLOSURE, P_MOUTH_MIX, P_TONGUE_H, P_TONGUE_P, P_MOUTH_Q, P_TWO, P_TWO_INT, P_TENSION, P_TRACHEA, P_ECHO, P_OEC, P_OEC_TRACK, P_OEC_DEPTH, P_BEAK, P_BEAK_TRACK, P_TURB, P_BREATH],
        KINGFISHER => vec![P_PRESSURE, P_CLOSURE, P_MOUTH_MIX, P_TONGUE_H, P_TONGUE_P, P_MOUTH_Q, P_PULSE, P_TENSION, P_TRACHEA, P_ECHO, P_OEC, P_OEC_TRACK, P_OEC_DEPTH, P_BEAK, P_BEAK_TRACK, P_TURB, P_BREATH, P_TWO, P_TWO_INT, P_COUPLING],
        DOVE => vec![P_PRESSURE, P_CLOSURE, P_TENSION, P_TRACHEA, P_ECHO, P_OEC, P_OEC_TRACK, P_OEC_DEPTH, P_SAC, P_SAC_Q, P_BEAK, P_BEAK_TRACK, P_TURB, P_BREATH],
        _ => vec![P_PRESSURE, P_CLOSURE, P_TENSION, P_TRACHEA, P_ECHO, P_BEAK, P_BEAK_TRACK, P_TURB, P_BREATH, P_TONGUE_H, P_TONGUE_P, P_MOUTH_Q],
    }
}

pub fn to_norm(i: usize, v: f64) -> f64 {
    let d = &PARAMS[i];
    if d.log { (v / d.min).ln() / (d.max / d.min).ln() } else { (v - d.min) / (d.max - d.min) }
}
pub fn from_norm(i: usize, u: f64) -> f64 {
    let d = &PARAMS[i]; let u = u.clamp(0.0, 1.0);
    if d.log { d.min * (d.max / d.min).powf(u) } else { d.min + (d.max - d.min) * u }
}

/// Render one item with given params and score it.
pub fn render_item(table: &Arc<Table>, body: u8, params: &[f64; NPARAM], call: &Call, an: &Analyzer) -> (Vec<f32>, Features) {
    let mut e = Engine::new(44100.0, table.clone());
    e.body = body; e.params = *params; e.params[P_SPEED] = 1.0; e.params[P_SWEEP] = 1.0; e.params[P_MASS] = 0.0;
    e.params[P_VOLUME] = 1.0;
    e.fit_tension = params[P_TENSION]; e.fit_pressure = params[P_PRESSURE];
    e.add_call(call.clone());
    let audio = e.render_call(0, None);
    // gesture frame k describes the analysis window centred at k*hop + win/2
    let lead = 512usize;
    let mut x = vec![0.0f32; lead]; x.extend_from_slice(&audio);
    let f = an.analyze(&x);
    (audio, f)
}

pub fn score_item(table: &Arc<Table>, body: u8, params: &[f64; NPARAM], it: &Item, tf: &Features, an: &Analyzer) -> Score {
    let (_, sf) = render_item(table, body, params, &it.call, an);
    compare(tf, it.t0, it.len, &sf)
}

/// Analysis-by-synthesis correction of the gesture: pitch, pressure and tension tracks.
/// Beak gape follows each frame's brightness (wider gape = brighter), as birds do note by note.
pub fn refine_gesture(table: &Arc<Table>, body: u8, params: &[f64; NPARAM], it: &mut Item, tf: &Features, an: &Analyzer, iters: usize) {
    refine(table, body, params, it, tf, an, iters, false);
}

/// Loudness only (pitch and beak held): settles the pressure track at the end.
pub fn refine_level(table: &Arc<Table>, body: u8, params: &[f64; NPARAM], it: &mut Item, tf: &Features, an: &Analyzer, iters: usize) {
    refine(table, body, params, it, tf, an, iters, true);
}

fn refine(table: &Arc<Table>, body: u8, params: &[f64; NPARAM], it: &mut Item, tf: &Features, an: &Analyzer, iters: usize, level_only: bool) {
    for _ in 0..iters {
        let (_, sf) = render_item(table, body, params, &it.call, an);
        let n = it.len.min(sf.db.len());
        let thr = tf.floor_db + 8.0;
        let smax = sf.db.iter().cloned().fold(-200.0, f64::max);
        let tpk = (0..n).map(|k| tf.db[it.t0 + k]).fold(-200.0, f64::max);
        for k in 0..n {
            let tdb = tf.db[it.t0 + k];
            if tdb < thr { continue; }
            // pitch
            let tf0 = tf.f0[it.t0 + k]; let sf0 = sf.f0[k];
            if !level_only && tf0 > 0.0 && sf0 > 0.0 && tf.conf[it.t0 + k] > 0.3 && (sf0 / tf0).log2().abs() < 0.45 {
                let r = (tf0 / sf0).powf(0.9).clamp(0.88, 1.12);
                it.call.f[k] = (it.call.f[k] as f64 * r) as f32;
            }
            // level (relative to each peak)
            let d = ((tdb - tpk) - (sf.db[k].max(smax - 50.0) - smax)).clamp(-12.0, 12.0);
            let p = (it.call.p[k] as f64).max(0.02) * 10f64.powf(d / 20.0 * 0.7);
            it.call.p[k] = p.clamp(0.0, 1.8) as f32;
            // beak gape from brightness
            let f0 = it.call.f[k] as f64;
            if !level_only && tdb >= thr + 4.0 && sf.db[k] > smax - 30.0 {
                if let (Some(tb), Some(sb)) = (brightness(tf, it.t0 + k, f0, true), brightness(&sf, k, f0, false)) {
                    let v = it.call.g[k] as f64 - 0.5 * (sb - tb).clamp(-1.0, 1.0);
                    it.call.g[k] = v.clamp(-1.0, 1.0) as f32;
                }
            }
        }
        // smooth the gape track (the beak can't jump)
        let g0 = it.call.g.clone();
        for k in 0..g0.len() { let lo = k.saturating_sub(3); let hi = (k + 4).min(g0.len()); it.call.g[k] = g0[lo..hi].iter().sum::<f32>() / (hi - lo) as f32; }
    }
}

/// Per-frame search over the beak, mouth and roughness tracks: render the call with a
/// track nudged up and down, and keep, frame by frame, whichever is spectrally closer.
pub fn refine_tracks(table: &Arc<Table>, body: u8, params: &[f64; NPARAM], it: &mut Item, tf: &Features, an: &Analyzer, iters: usize) {
    let mouth = body == PARROT || params[P_MOUTH_MIX] > 0.0;
    let thr = tf.floor_db + 10.0;
    for iter in 0..iters {
        // coarse steps first, then finer ones
        let scale = 0.65f32.powi(iter as i32);
        for track in 0..4 {
            if track == 1 && !mouth { continue; }
            let (delta, lo, hi) = match track { 0 => (0.15f32, -1.0f32, 1.0f32), 1 => (0.15, -0.8, 0.8), 2 => (0.2, 0.0, 1.0), _ => (0.15, -1.0, 1.0) };
            let get = |c: &Call| -> Vec<f32> { match track { 0 => c.g.clone(), 1 => c.m.clone(), 2 => c.n.clone(), _ => c.c.clone() } };
            let set = |c: &mut Call, v: Vec<f32>| match track { 0 => c.g = v, 1 => c.m = v, 2 => c.n = v, _ => c.c = v };
            let cur = get(&it.call);
            let mut variants = Vec::new();
            let delta = delta * scale;
            for d in [0.0f32, delta, -delta] {
                let mut c = it.call.clone();
                set(&mut c, cur.iter().map(|v| (v + d).clamp(lo, hi)).collect());
                let (_, sf) = render_item(table, body, params, &c, an);
                variants.push((d, sf));
            }
            let n = it.len.min(variants.iter().map(|v| v.1.mel.len()).min().unwrap_or(0));
            let mut next = cur.clone();
            for k in 0..n {
                if tf.db[it.t0 + k] < thr { continue; }
                let errs: Vec<f64> = variants.iter().map(|(_, sf)| frame_spec_err(tf, it.t0 + k, sf, k, false)).collect();
                let (bi, be) = errs.iter().enumerate().fold((0, errs[0]), |a, (i, &e)| if e < a.1 { (i, e) } else { a });
                if bi != 0 && errs[0] - be > 0.15 { next[k] = (cur[k] + variants[bi].0).clamp(lo, hi); }
            }
            // smooth: beak, tongue and airflow change over tens of milliseconds, not per frame
            let sm: Vec<f32> = (0..next.len()).map(|k| { let a = k.saturating_sub(2); let b = (k + 3).min(next.len()); next[a..b].iter().sum::<f32>() / (b - a) as f32 }).collect();
            set(&mut it.call, sm);
        }
    }
}

pub struct FitResult { pub params: [f64; NPARAM], pub scores: Vec<Score>, pub total: f64, pub evals: usize }

fn par_map<T: Sync, R: Send>(xs: &[T], f: impl Fn(&T) -> R + Sync) -> Vec<R> {
    #[cfg(not(target_arch = "wasm32"))]
    {
        std::thread::scope(|s| {
            let hs: Vec<_> = xs.iter().map(|x| s.spawn(|| f(x))).collect();
            hs.into_iter().map(|h| h.join().unwrap()).collect()
        })
    }
    #[cfg(target_arch = "wasm32")]
    { xs.iter().map(f).collect() }
}

/// Nelder–Mead in the unit cube.
fn nelder_mead(f: &mut dyn FnMut(&[f64]) -> f64, x0: &[f64], step: f64, max_evals: usize) -> (Vec<f64>, f64, usize) {
    let d = x0.len();
    let clamp = |v: &mut Vec<f64>| for x in v.iter_mut() { *x = x.clamp(0.0, 1.0); };
    let mut pts: Vec<Vec<f64>> = vec![x0.to_vec()];
    for i in 0..d { let mut p = x0.to_vec(); p[i] += if p[i] > 0.5 { -step } else { step }; clamp(&mut p); pts.push(p); }
    let mut vals: Vec<f64> = pts.iter().map(|p| f(p)).collect();
    let mut evals = d + 1;
    while evals < max_evals {
        let mut idx: Vec<usize> = (0..=d).collect();
        idx.sort_by(|&a, &b| vals[a].partial_cmp(&vals[b]).unwrap());
        pts = idx.iter().map(|&i| pts[i].clone()).collect(); vals = idx.iter().map(|&i| vals[i]).collect();
        if (vals[d] - vals[0]).abs() < 1e-4 { break; }
        let mut c = vec![0.0; d];
        for p in &pts[..d] { for i in 0..d { c[i] += p[i] / d as f64; } }
        let mk = |t: f64| -> Vec<f64> { let mut v: Vec<f64> = (0..d).map(|i| c[i] + t * (pts[d][i] - c[i])).collect(); for x in v.iter_mut() { *x = x.clamp(0.0, 1.0); } v };
        let xr = mk(-1.0); let fr = f(&xr); evals += 1;
        if fr < vals[0] {
            let xe = mk(-2.0); let fe = f(&xe); evals += 1;
            if fe < fr { pts[d] = xe; vals[d] = fe; } else { pts[d] = xr; vals[d] = fr; }
        } else if fr < vals[d - 1] { pts[d] = xr; vals[d] = fr; }
        else {
            let xc = if fr < vals[d] { mk(-0.5) } else { mk(0.5) };
            let fc = f(&xc); evals += 1;
            if fc < vals[d].min(fr) { pts[d] = xc; vals[d] = fc; }
            else {
                for k in 1..=d { for i in 0..d { pts[k][i] = pts[0][i] + 0.5 * (pts[k][i] - pts[0][i]); } vals[k] = f(&pts[k]); evals += 1; }
            }
        }
    }
    let mut bi = 0; for i in 0..vals.len() { if vals[i] < vals[bi] { bi = i; } }
    (pts[bi].clone(), vals[bi], evals)
}

/// Full fit. `progress(stage, fraction, best_score)`.
pub fn fit(table: &Arc<Table>, body: u8, prep: &mut Prepared, budget: usize, seed: u32, init: Option<[f64; NPARAM]>, progress: &mut dyn FnMut(&str, f64, f64)) -> FitResult {
    let an = Analyzer::new(prep.fs, prep.fmin, prep.fmax);
    let mut params = [0.0; NPARAM];
    for (i, d) in PARAMS.iter().enumerate() { params[i] = d.default; }
    let warm = init.is_some();
    if let Some(p0) = init { params = p0; }
    let free = free_params(body);
    // fitting subset: up to 5 items, total <= 7 s, favour variety
    let mut subset: Vec<usize> = Vec::new(); let mut tot = 0.0;
    for (i, it) in prep.items.iter().enumerate() {
        let d = it.len as f64 * HOP_S;
        if subset.len() < 5 && tot + d <= 7.0 { subset.push(i); tot += d; }
    }
    let mut evals = 0;
    let mut rng = crate::dsp::Noise(seed | 1);
    let feats = prep.feats.clone();
    for round in 0..3 {
        progress("gestures", round as f64 / 3.0, 0.0);
        // invert gestures under the current body
        let p0 = params;
        let items: Vec<Item> = prep.items.clone();
        let refined = par_map(&items, |it| { let mut it = it.clone(); let tf = feats[it.rec].clone(); refine_gesture(table, body, &p0, &mut it, &tf, &an, if round == 0 { 5 } else { 3 }); if round > 0 { refine_tracks(table, body, &p0, &mut it, &tf, &an, 1); } it });
        prep.items = refined;
        let sub: Vec<Item> = subset.iter().map(|&i| prep.items[i].clone()).collect();
        let obj = |u: &[f64]| -> f64 {
            let mut pp = params;
            for (k, &i) in free.iter().enumerate() { pp[i] = from_norm(i, u[k]); }
            let sc = par_map(&sub, |it| score_item(table, body, &pp, it, &feats[it.rec], &an));
            // body search: spectrum and pitch only (loudness is the gesture's job)
            let v = sc.iter().map(|s| s.spec_db + s.pitch_cents / 40.0).sum::<f64>() / sc.len() as f64;
            if std::env::var("CAROL_DEBUG").is_ok() { eprintln!("obj {:.2} {:?}", v, u.iter().map(|x| (x * 100.0).round() / 100.0).collect::<Vec<_>>()); }
            v
        };
        let mut x0: Vec<f64> = free.iter().map(|&i| to_norm(i, params[i])).collect();
        let mut best = obj(&x0); evals += 1;
        // global probes first (first round only gets many)
        let global = round == 0 && !warm;
        let probes = if global { budget / 4 } else { budget / 12 };
        for _ in 0..probes {
            let x: Vec<f64> = x0.iter().map(|&v| if global { 0.5 + 0.5 * rng.next() } else { (v + 0.15 * rng.next()).clamp(0.0, 1.0) }).collect();
            let v = obj(&x); evals += 1;
            if v < best { best = v; x0 = x; }
            progress("search", evals as f64 / (budget as f64 * 1.5), best);
        }
        let mut wrapped = |u: &[f64]| { let v = obj(u); progress("refine", 0.0, v.min(best)); v };
        let (x, v, e) = nelder_mead(&mut wrapped, &x0, if global { 0.2 } else { 0.08 }, budget / 3);
        evals += e;
        if v <= best { x0 = x; }
        for (k, &i) in free.iter().enumerate() { params[i] = from_norm(i, x0[k]); }
    }
    // final gesture polish and full scoring
    let p0 = params;
    let items: Vec<Item> = prep.items.clone();
    prep.items = par_map(&items, |it| { let mut it = it.clone(); let tf = feats[it.rec].clone(); refine_gesture(table, body, &p0, &mut it, &tf, &an, 6); refine_tracks(table, body, &p0, &mut it, &tf, &an, 5); refine_level(table, body, &p0, &mut it, &tf, &an, 3); it });
    let scores = par_map(&prep.items, |it| score_item(table, body, &p0, it, &feats[it.rec], &an));
    let total = scores.iter().map(|s| s.total).sum::<f64>() / scores.len().max(1) as f64;
    progress("done", 1.0, total);
    FitResult { params, scores, total, evals }
}

/// Bird scale: the most-sung pitches (MIDI notes), loudness weighted.
pub fn bird_scale(items: &[Item], max_notes: usize) -> Vec<i32> {
    let mut hist = vec![0.0f64; 128];
    for it in items {
        for k in 0..it.call.f.len() {
            let p = it.call.p[k] as f64; if p <= 0.05 { continue; }
            let m = 69.0 + 12.0 * (it.call.f[k] as f64 / 440.0).log2();
            let mi = m.round() as i64; if (0..128).contains(&mi) { hist[mi as usize] += p * p; }
        }
    }
    let mut peaks: Vec<(usize, f64)> = (1..127).filter(|&i| hist[i] > 0.0 && hist[i] >= hist[i - 1] && hist[i] >= hist[i + 1]).map(|i| (i, hist[i])).collect();
    peaks.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap());
    let mut notes: Vec<i32> = peaks.into_iter().take(max_notes).map(|x| x.0 as i32).collect();
    notes.sort();
    notes
}
