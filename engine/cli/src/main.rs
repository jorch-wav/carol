//! carol: offline tools — model table, benchmark, fitting.
use carol_core::analysis::*;
use carol_core::engine::*;
use carol_core::fit::*;
use carol_core::model::Table;
use serde_json::{json, Value};
use std::sync::Arc;

fn arg(args: &[String], k: &str, d: &str) -> String {
    args.iter().position(|a| a == k).and_then(|i| args.get(i + 1)).cloned().unwrap_or_else(|| d.to_string())
}

fn test_call(f: f64, dur: f64, glide: f64) -> Call {
    let n = (dur / HOP_S) as usize;
    let mut c = Call { f: vec![], p: vec![], n: vec![], g: vec![], m: vec![], c: vec![], hop: HOP_S, ref_hz: f };
    for k in 0..n {
        let t = k as f64 / n as f64;
        c.f.push((f * 2f64.powf(glide * (t - 0.5))) as f32);
        c.p.push((t * 12.0).min(1.0).min((1.0 - t) * 8.0).max(0.0) as f32);
        c.n.push(0.0);
    }
    c
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let table = Arc::new(Table::embedded());
    match args.get(1).map(|s| s.as_str()) {
        Some("gen-table") => {
            let t = Table::build();
            std::fs::write(&args[2], t.to_bytes()).unwrap();
        }
        Some("bodies") => {
            let ps: Vec<Value> = PARAMS.iter().enumerate().map(|(i, d)| json!({
                "index": i, "key": d.key, "label": d.label, "section": d.section, "min": d.min, "max": d.max,
                "default": d.default, "unit": d.unit, "log": d.log,
                "bodies": (0..BODY_NAMES.len()).filter(|b| d.bodies & (1 << b) != 0).map(|b| BODY_NAMES[b]).collect::<Vec<_>>(),
                "help": d.help })).collect();
            println!("{}", serde_json::to_string_pretty(&json!({"params": ps, "bodies": BODY_NAMES})).unwrap());
        }
        Some("tone") => {
            // carol tone out.wav --body 0 --f 2000 --tension 0.3 ...
            let mut e = Engine::new(44100.0, table.clone());
            e.body = arg(&args, "--body", "0").parse().unwrap();
            for (i, d) in PARAMS.iter().enumerate() {
                let v = arg(&args, &format!("--{}", d.key), "");
                if !v.is_empty() { e.set_param(i, v.parse().unwrap()); }
            }
            e.fit_tension = e.params[P_TENSION]; e.fit_pressure = e.params[P_PRESSURE]; e.snapshot_fit();
            let f: f64 = arg(&args, "--f", "2000").parse().unwrap();
            e.add_call(test_call(f, 1.0, arg(&args, "--glide", "0").parse().unwrap()));
            let a = e.render_call(0, None);
            std::fs::write(&args[2], write_wav(&a, 44100)).unwrap();
            let an = Analyzer::new(44100.0, 200.0, 10000.0);
            let ft = an.analyze(&a);
            let mid = ft.f0.len() / 2;
            let pk = a.iter().fold(0.0f32, |m, &v| m.max(v.abs()));
            eprintln!("f0 mid {:.1} Hz (target {}), conf {:.2}, peak {:.3}", ft.f0[mid], f, ft.conf[mid], pk);
        }
        Some("bench") => {
            let mut e = Engine::new(48000.0, table.clone());
            e.body = arg(&args, "--body", "0").parse().unwrap();
            let f: f64 = arg(&args, "--f", "3000").parse().unwrap();
            e.add_call(test_call(f, 10.0, 1.0));
            e.fit_tension = e.params[P_TENSION];
            let voices: usize = arg(&args, "--voices", "1").parse().unwrap();
            for v in 0..voices { e.note_on(v as i32, 0, 69.0 + 12.0 * (f / 440.0).log2() + v as f64 * 4.0, 1.0); }
            let mut buf = vec![0.0f32; 128];
            let t0 = std::time::Instant::now();
            let n = 48000 * 5 / 128;
            for _ in 0..n { e.process(&mut buf); }
            let el = t0.elapsed().as_secs_f64();
            eprintln!("{} voice(s) @ {} Hz: {:.1}% of one core", voices, f, el / 5.0 * 100.0);
        }
        Some("fit") => cmd_fit(&args, &table),
        Some("analyse") => cmd_analyse(&args),
        Some("render") => cmd_render(&args, &table),
        Some("polish") => cmd_polish(&args, &table),
        _ => eprintln!("usage: carol gen-table <out> | bodies | tone <out.wav> [--f --body --<param>] | bench | fit <dir> --body N --out preset.json | analyse <dir> --fmin --fmax --out g.json | render <preset.json> <calls.json> <out.wav>"),
    }
}

fn cmd_fit(args: &[String], table: &Arc<Table>) {
    let dir = std::path::PathBuf::from(&args[2]);
    let body: u8 = arg(args, "--body", "0").parse().unwrap();
    let fmin: f64 = arg(args, "--fmin", "250").parse().unwrap();
    let fmax: f64 = arg(args, "--fmax", "9000").parse().unwrap();
    let budget: usize = arg(args, "--budget", "300").parse().unwrap();
    let nitems: usize = arg(args, "--items", "10").parse().unwrap();
    let maxlen: f64 = arg(args, "--maxlen", "6").parse().unwrap();
    let out = arg(args, "--out", "fit.json");
    let only = arg(args, "--only", "");
    let init_path = arg(args, "--init", "");
    let init = if init_path.is_empty() { None } else {
        let v: Value = serde_json::from_str(&std::fs::read_to_string(&init_path).unwrap()).unwrap();
        let mut p = [0.0; NPARAM];
        for (i, d) in PARAMS.iter().enumerate() { p[i] = v["params"][d.key].as_f64().unwrap_or(d.default); }
        eprintln!("warm start from {}", init_path);
        Some(p)
    };
    let mut recs = Vec::new();
    let mut paths: Vec<_> = std::fs::read_dir(dir.join("rec")).unwrap().filter_map(|e| e.ok()).map(|e| e.path())
        .filter(|p| p.extension().map_or(false, |x| x == "wav")).collect();
    paths.sort();
    for p in paths {
        let name = p.file_stem().unwrap().to_string_lossy().to_string();
        if !only.is_empty() && !only.split(',').any(|o| o == name) { continue; }
        let b = std::fs::read(&p).unwrap();
        if let Some((a, fs)) = read_wav(&b) { recs.push(Recording { name, audio: a, fs }); }
    }
    eprintln!("{} recordings", recs.len());
    let t0 = std::time::Instant::now();
    let mut prep = prepare(&recs, fmin, fmax, nitems, maxlen);
    eprintln!("{} items chosen ({:?})", prep.items.len(), t0.elapsed());
    for it in &prep.items { eprintln!("  {} {:.2}-{:.2}s {} ref {:.0} Hz q {:.2}", recs[it.rec].name, it.start_s, it.end_s, it.kind, it.call.ref_hz, it.quality); }
    let mut last = std::time::Instant::now();
    let res = fit(table, body, &mut prep, budget, 0x9e3779b9, init, &mut |st, _f, best| {
        if last.elapsed().as_secs_f64() > 5.0 { eprintln!("  [{}] best {:.1}", st, best); last = std::time::Instant::now(); }
    });
    eprintln!("fit done in {:?}, {} evals, total match {:.1}%", t0.elapsed(), res.evals, res.total);
    for (it, s) in prep.items.iter().zip(&res.scores) {
        eprintln!("  {} {:.2}s {:>6}: {:.1}%  pitch {:.0} c  loud {:.1} dB  spec {:.1} dB", recs[it.rec].name, it.start_s, it.kind, s.total, s.pitch_cents, s.loud_db, s.spec_db);
    }
    // the same fit under the old (unmasked) spectral metric, for honest comparison
    {
        std::env::set_var("CAROL_LEGACY_METRIC", "1");
        let an = Analyzer::new(44100.0, fmin, fmax);
        let ls: Vec<f64> = prep.items.iter().map(|it| score_item(table, body, &res.params, it, &prep.feats[it.rec], &an).total).collect();
        eprintln!("legacy metric total {:.1}%", ls.iter().sum::<f64>() / ls.len() as f64);
        std::env::remove_var("CAROL_LEGACY_METRIC");
    }
    // comparison renders for listening
    let cmp = dir.join("compare"); std::fs::create_dir_all(&cmp).ok();
    let an = Analyzer::new(44100.0, fmin, fmax);
    for (k, it) in prep.items.iter().enumerate() {
        let (a, sf) = render_item(table, body, &res.params, &it.call, &an);
        let (ta, sa) = shape_profiles(&prep.feats[it.rec], it.t0, it.len, &sf);
        eprintln!("  shape {} T: {}", k, ta.iter().map(|v| format!("{:>4.0}", v)).collect::<String>());
        eprintln!("  shape {} S: {}", k, sa.iter().map(|v| format!("{:>4.0}", v)).collect::<String>());
        let r = &recs[it.rec];
        let s0 = (it.start_s * r.fs) as usize; let s1 = ((it.end_s * r.fs) as usize).min(r.audio.len());
        let mut both: Vec<f32> = r.audio[s0..s1].to_vec();
        let pk = both.iter().fold(1e-6f32, |m, &v| m.max(v.abs()));
        for v in both.iter_mut() { *v *= 0.5 / pk; }
        both.extend(std::iter::repeat(0.0).take(11025));
        let pk2 = a.iter().fold(1e-6f32, |m, &v| m.max(v.abs()));
        both.extend(a.iter().map(|v| v * 0.5 / pk2));
        std::fs::write(cmp.join(format!("{:02}_{}.wav", k, r.name)), write_wav(&both, 44100)).ok();
    }
    let params: serde_json::Map<String, Value> = PARAMS.iter().enumerate().filter(|(i, _)| body_has(body, *i))
        .map(|(i, d)| (d.key.to_string(), json!((res.params[i] * 1000.0).round() / 1000.0))).collect();
    let calls: Vec<Value> = prep.items.iter().zip(&res.scores).map(|(it, s)| json!({
        "kind": it.kind, "source": recs[it.rec].name, "start": (it.start_s * 1000.0).round() / 1000.0, "end": (it.end_s * 1000.0).round() / 1000.0,
        "hop": it.call.hop, "ref_hz": it.call.ref_hz.round(),
        "f": it.call.f.iter().map(|v| v.round() as i32).collect::<Vec<_>>(),
        "p": it.call.p.iter().map(|v| (v * 1000.0).round() as i32).collect::<Vec<_>>(),
        "n": it.call.n.iter().map(|v| (v * 100.0).round() as i32).collect::<Vec<_>>(),
        "g": it.call.g.iter().map(|v| (v * 1000.0).round() as i32).collect::<Vec<_>>(),
        "m": it.call.m.iter().map(|v| (v * 1000.0).round() as i32).collect::<Vec<_>>(),
        "c": it.call.c.iter().map(|v| (v * 1000.0).round() as i32).collect::<Vec<_>>(),
        "match": {"total": (s.total * 10.0).round() / 10.0, "pitch_cents": s.pitch_cents.round(), "loud_db": (s.loud_db * 10.0).round() / 10.0, "spec_db": (s.spec_db * 10.0).round() / 10.0},
    })).collect();
    let v = json!({
        "body": BODY_NAMES[body as usize], "params": params, "scale": bird_scale(&prep.items, 7),
        "match": {"total": (res.total * 10.0).round() / 10.0, "evals": res.evals,
                  "pitch_cents": (res.scores.iter().map(|s| s.pitch_cents).sum::<f64>() / res.scores.len() as f64).round(),
                  "loud_db": (res.scores.iter().map(|s| s.loud_db).sum::<f64>() / res.scores.len() as f64 * 10.0).round() / 10.0,
                  "spec_db": (res.scores.iter().map(|s| s.spec_db).sum::<f64>() / res.scores.len() as f64 * 10.0).round() / 10.0},
        "calls": calls,
    });
    std::fs::write(&out, serde_json::to_string(&v).unwrap()).unwrap();
    eprintln!("wrote {}", out);
}

/// Phrases from every recording of a bird, as gesture tracks (pitch, loudness, roughness) for the style learner
/// (tools/style.py). Only clean, loud stretches are kept. Output: JSON list of {src, start, hop, ref_hz, f, p, n}.
fn cmd_analyse(args: &[String]) {
    let dir = std::path::PathBuf::from(&args[2]);
    let fmin: f64 = arg(args, "--fmin", "300").parse().unwrap();
    let fmax: f64 = arg(args, "--fmax", "9000").parse().unwrap();
    let out = arg(args, "--out", "gestures.json");
    let fs = 44100.0;
    let an = Analyzer::new(fs, fmin, fmax);
    let mut paths: Vec<_> = std::fs::read_dir(dir.join("rec")).unwrap().filter_map(|e| e.ok()).map(|e| e.path())
        .filter(|p| p.extension().map_or(false, |x| x == "wav")).collect();
    paths.sort();
    let mut all = Vec::new();
    for p in paths {
        let name = p.file_stem().unwrap().to_string_lossy().to_string();
        let b = std::fs::read(&p).unwrap();
        let Some((a, rfs)) = read_wav(&b) else { continue };
        let x = resample(&a, rfs, fs);
        let f = an.analyze(&x);
        let mut n = 0;
        for s in segment(&f, 0.45, 0.05, 6.0) {
            if s.snr < 15.0 || s.conf < 0.3 { continue; }
            let (fv, pv, nv, rhz) = gesture(&f, &s, 4);
            let q = |v: &Vec<f32>, k: f32| v.iter().map(|x| (x * k).round() as i32).collect::<Vec<_>>();
            all.push(json!({"src": name, "start": (s.start as f64 * f.hop * 1000.0).round() / 1000.0, "hop": f.hop, "ref_hz": rhz.round(),
                "snr": (s.snr * 10.0).round() / 10.0, "conf": (s.conf * 100.0).round() / 100.0,
                "f": q(&fv, 1.0), "p": q(&pv, 1000.0), "n": q(&nv, 100.0)}));
            n += 1;
        }
        eprintln!("{}: {} phrases", name, n);
    }
    std::fs::write(&out, serde_json::to_string(&all).unwrap()).unwrap();
    eprintln!("wrote {} ({} phrases)", out, all.len());
}

/// Render calls (JSON list of {f,p,n,g,m,c,hop,ref_hz} in the preset's integer units) with a preset's body and
/// settings, one after another with a short gap, to a WAV: for listening to generated phrases offline.
fn cmd_render(args: &[String], table: &Arc<Table>) {
    let preset: Value = serde_json::from_str(&std::fs::read_to_string(&args[2]).unwrap()).unwrap();
    let calls: Vec<Value> = serde_json::from_str(&std::fs::read_to_string(&args[3]).unwrap()).unwrap();
    let mut e = Engine::new(44100.0, table.clone());
    let body = preset["body"].as_str().map(|b| BODY_NAMES.iter().position(|x| *x == b).unwrap_or(0)).or(preset["body"].as_u64().map(|x| x as usize)).unwrap_or(0);
    e.body = body as u8;
    for (i, d) in PARAMS.iter().enumerate() { if let Some(v) = preset["params"][d.key].as_f64() { e.set_param(i, v); } }
    e.fit_tension = e.params[P_TENSION]; e.fit_pressure = e.params[P_PRESSURE]; e.snapshot_fit();
    let tr = |c: &Value, k: &str, s: f32| -> Vec<f32> { c[k].as_array().map(|a| a.iter().map(|x| x.as_f64().unwrap_or(0.0) as f32 / s).collect()).unwrap_or_default() };
    let mut audio: Vec<f32> = Vec::new();
    for (i, c) in calls.iter().enumerate() {
        let f = tr(c, "f", 1.0); let n = f.len();
        let pad = |v: Vec<f32>| if v.len() == n { v } else { vec![0.0; n] };
        e.add_call(Call { f, p: pad(tr(c, "p", 1000.0)), n: pad(tr(c, "n", 100.0)), g: pad(tr(c, "g", 1000.0)), m: pad(tr(c, "m", 1000.0)), c: pad(tr(c, "c", 1000.0)),
            hop: c["hop"].as_f64().unwrap_or(HOP_S), ref_hz: c["ref_hz"].as_f64().unwrap_or(1000.0) });
        let a = e.render_call(i, None);
        audio.extend_from_slice(&a); audio.extend(std::iter::repeat(0.0).take(44100 / 3));
    }
    std::fs::write(&args[4], write_wav(&audio, 44100)).unwrap();
    eprintln!("rendered {} calls, {:.1} s", calls.len(), audio.len() as f64 / 44100.0);
}

/// Polish an existing fit: the body settings stay, each call's gesture tracks get a long extra refinement
/// (pitch with octave correction, beak / mouth / closure / roughness, loudness), and a change is kept only if that
/// call's match improves. carol polish <dir> --fit fits/<id>.json --fmin --fmax --rounds 4 --out polished.json
fn cmd_polish(args: &[String], table: &Arc<Table>) {
    let dir = std::path::PathBuf::from(&args[2]);
    let fit_path = arg(args, "--fit", "");
    let fmin: f64 = arg(args, "--fmin", "250").parse().unwrap();
    let fmax: f64 = arg(args, "--fmax", "9000").parse().unwrap();
    let rounds: usize = arg(args, "--rounds", "4").parse().unwrap();
    let out = arg(args, "--out", "polished.json");
    let mut v: Value = serde_json::from_str(&std::fs::read_to_string(&fit_path).unwrap()).unwrap();
    let body = v["body"].as_str().and_then(|b| BODY_NAMES.iter().position(|x| *x == b)).unwrap_or(0) as u8;
    let mut params = [0.0; NPARAM];
    for (i, d) in PARAMS.iter().enumerate() { params[i] = v["params"][d.key].as_f64().unwrap_or(d.default); }
    let an = Analyzer::new(44100.0, fmin, fmax);
    // the recordings the calls come from
    let calls = v["calls"].as_array().unwrap().clone();
    let mut names: Vec<String> = calls.iter().map(|c| c["source"].as_str().unwrap().to_string()).collect();
    names.sort(); names.dedup();
    let feats: Vec<Arc<Features>> = names.iter().map(|n| {
        let b = std::fs::read(dir.join("rec").join(format!("{}.wav", n))).unwrap();
        let (a, rfs) = read_wav(&b).unwrap();
        Arc::new(an.analyze(&resample(&a, rfs, 44100.0)))
    }).collect();
    let tr = |c: &Value, k: &str, s: f32| -> Vec<f32> { c[k].as_array().map(|a| a.iter().map(|x| x.as_f64().unwrap_or(0.0) as f32 / s).collect()).unwrap_or_default() };
    let items: Vec<Item> = calls.iter().map(|c| {
        let f = tr(c, "f", 1.0); let n = f.len(); let hop = c["hop"].as_f64().unwrap_or(HOP_S);
        let pad = |x: Vec<f32>| if x.len() == n { x } else { vec![0.0; n] };
        let start = c["start"].as_f64().unwrap();
        Item { rec: names.iter().position(|x| x == c["source"].as_str().unwrap()).unwrap(), t0: (start / hop).round() as usize, len: n,
               kind: if c["kind"] == "phrase" { "phrase" } else { "call" },
               call: Call { f, p: pad(tr(c, "p", 1000.0)), n: pad(tr(c, "n", 100.0)), g: pad(tr(c, "g", 1000.0)), m: pad(tr(c, "m", 1000.0)), c: pad(tr(c, "c", 1000.0)), hop, ref_hz: c["ref_hz"].as_f64().unwrap_or(1000.0) },
               start_s: start, end_s: c["end"].as_f64().unwrap_or(start), quality: 1.0 }
    }).collect();
    let t0 = std::time::Instant::now();
    let p0 = params;
    // --dump k: frame by frame, the target's pitch, what Carol was told, and what it made (for diagnosis)
    if let Ok(k) = arg(args, "--dump", "x").parse::<usize>() {
        let it = &items[k]; let tf = &feats[it.rec];
        let (_, sf) = render_item(table, body, &p0, &it.call, &an);
        for i in 0..it.len.min(sf.f0.len()) {
            if tf.db[it.t0 + i] < tf.floor_db + 8.0 { continue; }
            println!("{:4} tgt {:6.0} conf {:.2} | cmd {:6.0} | synth {:6.0} conf {:.2} | p {:.2} | {:+5.0}c", i, tf.f0[it.t0 + i], tf.conf[it.t0 + i], it.call.f[i], sf.f0[i], sf.conf[i], it.call.p[i],
                if tf.f0[it.t0 + i] > 0.0 && sf.f0[i] > 0.0 { 1200.0 * (sf.f0[i] / tf.f0[it.t0 + i]).log2() } else { 0.0 });
        }
        return;
    }
    // --harsh-sweep "0,0.05,0.1": the average match at each harshness (body as it is), then stop
    let sweep = arg(args, "--harsh-sweep", "");
    if !sweep.is_empty() {
        for hv in sweep.split(',').filter_map(|x| x.parse::<f64>().ok()) {
            let mut pp = p0; pp[P_HARSH] = hv;
            let sc = par_map(&items, |it| score_item(table, body, &pp, it, &feats[it.rec], &an));
            let n = sc.len() as f64;
            eprintln!("harsh {:.2}: {:.1}%  (pitch {:.0} c, loud {:.1} dB, spec {:.1} dB)", hv, sc.iter().map(|s| s.total).sum::<f64>() / n,
                sc.iter().map(|s| s.pitch_cents).sum::<f64>() / n, sc.iter().map(|s| s.loud_db).sum::<f64>() / n, sc.iter().map(|s| s.spec_db).sum::<f64>() / n);
        }
        return;
    }
    // --body N: first re-tune the bird's body settings (the fitter's free parameters) against these calls as they are,
    // with up to N evaluations; kept only if the average match improves
    let mut p0 = p0;
    let body_evals: usize = arg(args, "--body", "0").parse().unwrap_or(0);
    // --harsh x: also tune HARSHNESS, starting from x (for the harsh callers)
    let harsh0: f64 = arg(args, "--harsh", "-1").parse().unwrap_or(-1.0);
    if body_evals > 0 {
        let mut free = free_params(body);
        // the baseline is the bird as it is (no harshness); the search then starts from the given harshness
        let base: f64 = par_map(&items, |it| score_item(table, body, &p0, it, &feats[it.rec], &an).total).iter().sum::<f64>() / items.len() as f64;
        if harsh0 >= 0.0 { free.push(P_HARSH); p0[P_HARSH] = harsh0; }
        let x0: Vec<f64> = free.iter().map(|&i| to_norm(i, p0[i])).collect();
        let pbase = p0;
        let mut obj = |u: &[f64]| -> f64 {
            let mut pp = pbase; for (k, &i) in free.iter().enumerate() { pp[i] = from_norm(i, u[k].clamp(0.0, 1.0)); }
            -(par_map(&items, |it| score_item(table, body, &pp, it, &feats[it.rec], &an).total).iter().sum::<f64>() / items.len() as f64)
        };
        let (x, v, e) = nelder_mead(&mut obj, &x0, 0.05, body_evals);
        eprintln!("  body re-tune: {:.1}% -> {:.1}% ({} evals)", base, -v, e);
        if -v > base + 0.2 { for (k, &i) in free.iter().enumerate() { p0[i] = from_norm(i, x[k].clamp(0.0, 1.0)); } }
        else if harsh0 >= 0.0 { p0[P_HARSH] = 0.0; }
        if p0[P_HARSH] > 0.0 { eprintln!("  harshness {:.2}", p0[P_HARSH]); }
    }
    let results: Vec<(Item, Score, Score)> = par_map(&items, |it| {
        let tf = &feats[it.rec];
        let before = score_item(table, body, &p0, it, tf, &an);
        let (mut best, mut bs) = (it.clone(), before);
        for round in 0..rounds {
            // a few different polish moves; keep whatever improves the call's score
            let moves: [fn(&Arc<Table>, u8, &[f64; NPARAM], &mut Item, &Features, &Analyzer, usize); 4] = [refine_pitch, refine_gesture, refine_tracks, refine_level];
            for (m, mv) in moves.iter().enumerate() {
                let mut c = best.clone();
                mv(table, body, &p0, &mut c, tf, &an, match m { 0 => 4, 1 => 3, 2 => if round == 0 { 4 } else { 2 }, _ => 2 });
                let s = score_item(table, body, &p0, &c, tf, &an);
                if s.total > bs.total + 0.05 { best = c; bs = s; }
            }
        }
        (best, bs, before)
    });
    let results = results;
    let mut tot_b = 0.0; let mut tot_a = 0.0;
    let arr = v["calls"].as_array_mut().unwrap();
    for (k, (it, s, b)) in results.iter().enumerate() {
        tot_b += b.total; tot_a += s.total;
        eprintln!("  {} {:.2}s: {:.1}% -> {:.1}%  (pitch {:.0} c, spec {:.1} dB)", names[it.rec], it.start_s, b.total, s.total, s.pitch_cents, s.spec_db);
        let c = &mut arr[k];
        c["f"] = json!(it.call.f.iter().map(|v| v.round() as i32).collect::<Vec<_>>());
        c["p"] = json!(it.call.p.iter().map(|v| (v * 1000.0).round() as i32).collect::<Vec<_>>());
        c["n"] = json!(it.call.n.iter().map(|v| (v * 100.0).round() as i32).collect::<Vec<_>>());
        c["g"] = json!(it.call.g.iter().map(|v| (v * 1000.0).round() as i32).collect::<Vec<_>>());
        c["m"] = json!(it.call.m.iter().map(|v| (v * 1000.0).round() as i32).collect::<Vec<_>>());
        c["c"] = json!(it.call.c.iter().map(|v| (v * 1000.0).round() as i32).collect::<Vec<_>>());
        c["match"] = json!({"total": (s.total * 10.0).round() / 10.0, "pitch_cents": s.pitch_cents.round(), "loud_db": (s.loud_db * 10.0).round() / 10.0, "spec_db": (s.spec_db * 10.0).round() / 10.0});
    }
    if body_evals > 0 { for (i, d) in PARAMS.iter().enumerate() { if v["params"].get(d.key).is_some() || (i == P_HARSH && p0[i] > 0.0) { v["params"][d.key] = json!((p0[i] * 1000.0).round() / 1000.0); } } }
    let n = results.len().max(1) as f64;
    v["match"]["total"] = json!((tot_a / n * 10.0).round() / 10.0);
    v["match"]["pitch_cents"] = json!((results.iter().map(|r| r.1.pitch_cents).sum::<f64>() / n).round());
    v["match"]["loud_db"] = json!((results.iter().map(|r| r.1.loud_db).sum::<f64>() / n * 10.0).round() / 10.0);
    v["match"]["spec_db"] = json!((results.iter().map(|r| r.1.spec_db).sum::<f64>() / n * 10.0).round() / 10.0);
    std::fs::write(&out, serde_json::to_string(&v).unwrap()).unwrap();
    eprintln!("polish: {:.1}% -> {:.1}% in {:?}, wrote {}", tot_b / n, tot_a / n, t0.elapsed(), out);
}
