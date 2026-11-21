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
