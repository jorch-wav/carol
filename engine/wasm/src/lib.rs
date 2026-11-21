//! WebAssembly surface. Plain C ABI, no bindgen: the AudioWorklet and the
//! fitting Worker both instantiate this one module.
#![allow(static_mut_refs)]

use carol_core::analysis::HOP_S;
use carol_core::engine::*;
use carol_core::fit::*;
use carol_core::model::Table;
use std::sync::Arc;

#[link(wasm_import_module = "env")]
extern "C" {
    fn carol_progress(stage: i32, frac: f64, best: f64);
}

static mut TABLE: Option<Arc<Table>> = None;
static mut ENGINE: Option<Engine> = None;
static mut OUT: Vec<f32> = Vec::new();
static mut TELE: [f32; 16] = [0.0; 16];
static mut SCRATCH: [Vec<f32>; 6] = [Vec::new(), Vec::new(), Vec::new(), Vec::new(), Vec::new(), Vec::new()];
static mut RECS: Vec<Recording> = Vec::new();
static mut RESULT: Vec<u8> = Vec::new();

fn table() -> Arc<Table> { unsafe { TABLE.get_or_insert_with(|| Arc::new(Table::embedded())).clone() } }
fn eng() -> &'static mut Engine { unsafe { ENGINE.as_mut().expect("init first") } }

#[no_mangle] pub extern "C" fn carol_init(fs: f64) { unsafe { ENGINE = Some(Engine::new(fs, table())); } }
/// Scratch float buffer `k` (0..4) of length n; JS writes into it.
#[no_mangle] pub extern "C" fn carol_scratch(k: usize, n: usize) -> *mut f32 {
    unsafe { let v = &mut SCRATCH[k]; v.clear(); v.resize(n, 0.0); v.as_mut_ptr() }
}
#[no_mangle] pub extern "C" fn carol_set_body(b: u32) { eng().body = b as u8; }
#[no_mangle] pub extern "C" fn carol_set_param(i: u32, v: f64) { eng().set_param(i as usize, v); }
#[no_mangle] pub extern "C" fn carol_set_fit(tension: f64, pressure: f64) { let e = eng(); e.fit_tension = tension; e.fit_pressure = pressure; }
#[no_mangle] pub extern "C" fn carol_clear_calls() { eng().clear_calls(); }
/// The knobs as they are now are the bird's own (call right after loading a bird).
#[no_mangle] pub extern "C" fn carol_snapshot_fit() { eng().snapshot_fit(); }
/// Adds a call from scratch buffers 0 (f Hz), 1 (pressure 0..1), 2 (roughness 0..1), 3 (beak gape offset).
#[no_mangle] pub extern "C" fn carol_add_call(n: usize, hop: f64, ref_hz: f64) {
    unsafe {
        let c = Call { f: SCRATCH[0][..n].to_vec(), p: SCRATCH[1][..n].to_vec(), n: SCRATCH[2][..n].to_vec(), g: if SCRATCH[3].len() >= n { SCRATCH[3][..n].to_vec() } else { vec![0.0; n] }, m: if SCRATCH[4].len() >= n { SCRATCH[4][..n].to_vec() } else { vec![0.0; n] }, c: if SCRATCH[5].len() >= n { SCRATCH[5][..n].to_vec() } else { vec![0.0; n] }, hop, ref_hz };
        eng().add_call(c);
    }
}
#[no_mangle] pub extern "C" fn carol_note_on(id: i32, call: u32, note: f64, vel: f64) { eng().note_on(id, call as usize, note, vel); }
#[no_mangle] pub extern "C" fn carol_note_off(id: i32) { eng().note_off(id); }
#[no_mangle] pub extern "C" fn carol_all_off() { eng().all_off(); }
#[no_mangle] pub extern "C" fn carol_process(n: usize) -> *const f32 {
    unsafe {
        if OUT.len() < n { OUT.resize(n, 0.0); }
        let e = eng();
        e.process(&mut OUT[..n]);
        OUT.as_ptr()
    }
}
#[no_mangle] pub extern "C" fn carol_telemetry() -> *const f32 { unsafe { eng().telemetry(&mut TELE); TELE.as_ptr() } }
#[no_mangle] pub extern "C" fn carol_nparam() -> u32 { NPARAM as u32 }
static mut SCOPE: [f32; 5 * SCOPE_N] = [0.0; 5 * SCOPE_N];
/// The scope of the loudest voice: 5 x SCOPE_N floats (labia x, labia y, syrinx, windpipe, heard).
#[no_mangle] pub extern "C" fn carol_scope() -> *const f32 { unsafe { eng().scope(&mut SCOPE); SCOPE.as_ptr() } }
#[no_mangle] pub extern "C" fn carol_scope_n() -> u32 { SCOPE_N as u32 }

// ---------------------------------------------------------------- fitting
#[no_mangle] pub extern "C" fn carol_fit_reset() { unsafe { RECS.clear(); } }
/// Adds a recording from scratch buffer 0.
#[no_mangle] pub extern "C" fn carol_fit_add(n: usize, fs: f64) {
    unsafe { RECS.push(Recording { name: format!("rec{}", RECS.len()), audio: SCRATCH[0][..n].to_vec(), fs }); }
}
#[no_mangle] pub extern "C" fn carol_fit_run(body: u32, fmin: f64, fmax: f64, items: usize, budget: usize) -> usize {
    let t = table();
    let recs = unsafe { &RECS };
    let mut prep = prepare(recs, fmin, fmax, items, 6.0);
    if prep.items.is_empty() { unsafe { RESULT = b"{\"error\":\"no clear calls found\"}".to_vec(); return RESULT.len(); } }
    let mut cb = |st: &str, f: f64, b: f64| {
        let code = match st { "gestures" => 0, "search" => 1, "refine" => 2, _ => 3 };
        unsafe { carol_progress(code, f, b); }
    };
    let res = fit(&t, body as u8, &mut prep, budget, 0x2545F491, None, &mut cb);
    // hand-written JSON (keeps the module dependency-free)
    let mut s = String::new();
    s.push_str(&format!("{{\"body\":\"{}\",\"match\":{{\"total\":{:.1}}},\"params\":{{", BODY_NAMES[body as usize], res.total));
    let mut first = true;
    for (i, d) in PARAMS.iter().enumerate() {
        if !body_has(body as u8, i) { continue; }
        if !first { s.push(','); } first = false;
        s.push_str(&format!("\"{}\":{:.4}", d.key, res.params[i]));
    }
    s.push_str("},\"scale\":[");
    s.push_str(&bird_scale(&prep.items, 7).iter().map(|v| v.to_string()).collect::<Vec<_>>().join(","));
    s.push_str("],\"calls\":[");
    for (k, (it, sc)) in prep.items.iter().zip(&res.scores).enumerate() {
        if k > 0 { s.push(','); }
        let ints = |v: &[f32], m: f32| v.iter().map(|x| ((x * m).round() as i32).to_string()).collect::<Vec<_>>().join(",");
        s.push_str(&format!(
            "{{\"kind\":\"{}\",\"source\":\"{}\",\"start\":{:.3},\"end\":{:.3},\"hop\":{},\"ref_hz\":{:.0},\"f\":[{}],\"p\":[{}],\"n\":[{}],\"g\":[{}],\"m\":[{}],\"c\":[{}],\"match\":{{\"total\":{:.1},\"pitch_cents\":{:.0},\"loud_db\":{:.1},\"spec_db\":{:.1}}}}}",
            it.kind, recs[it.rec].name, it.start_s, it.end_s, HOP_S, it.call.ref_hz,
            ints(&it.call.f, 1.0), ints(&it.call.p, 1000.0), ints(&it.call.n, 100.0), ints(&it.call.g, 1000.0), ints(&it.call.m, 1000.0), ints(&it.call.c, 1000.0),
            sc.total, sc.pitch_cents, sc.loud_db, sc.spec_db));
    }
    s.push_str("]}");
    unsafe { RESULT = s.into_bytes(); RESULT.len() }
}
#[no_mangle] pub extern "C" fn carol_fit_result() -> *const u8 { unsafe { RESULT.as_ptr() } }
