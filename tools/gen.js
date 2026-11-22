// GENERATED calls: make a new phrase from a bird's learned style (preset.style, from tools/style.py) instead of
// replaying a call traced from one recording. Each note picks one of the bird's averaged note shapes, following
// how the bird tends to chain them, with natural variation in pitch, length and gaps.
// Output uses the same tracks as a traced call, in the preset's integer units:
// f Hz, p x1000, n x100, g x1000, m x1000, c x1000.

/** Small, fast seeded random generator (so a phrase can be made again from its seed). */
export function rng(seed) {
  let a = seed >>> 0;
  const r = () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  r.normal = () => { let u = 0, v = 0; while (!u) u = r(); while (!v) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  r.pick = (w) => { let x = r() * w.reduce((s, q) => s + q, 0); for (let i = 0; i < w.length; i++) { x -= w[i]; if (x <= 0) return i; } return w.length - 1; };
  return r;
}

/** Smooth curve through K points, read at t in 0..1 (Catmull-Rom). */
function curve(pts, t) {
  const k = pts.length - 1, x = Math.min(k, Math.max(0, t * k)), i = Math.min(k - 1, Math.floor(x)), u = x - i;
  const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(k, i + 2)];
  return 0.5 * ((2 * p1) + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (-p0 + 3 * p1 - 3 * p2 + p3) * u * u * u);
}

/** The call types this style can generate (e.g. ['Song', 'Bell', 'Chatter']), most notes first. */
export function genTypes(style) {
  if (!style || !style.types) return [];
  return Object.entries(style.types).sort((a, b) => (b[1].notes || 0) - (a[1].notes || 0)).map(([t]) => t);
}

/**
 * One new phrase of `type`. opts.variety (0..1, default 0.5) scales the randomness; opts.notes forces a count.
 * Returns {f, p, n, g, m, c, hop, ref_hz, name, kind, gen: true}.
 */
export function generate(style, type, seed = (Math.random() * 2 ** 31) | 0, opts = {}) {
  const T = style.types[type], r = rng(seed), hop = style.hop || 0.005, vr = opts.variety ?? 0.5;
  const P = T.protos;
  // how many notes: the bird's usual phrase length, kept to a playable range
  const [lo, hi, mean, sd] = T.nsyl;
  let count = opts.notes || Math.round(mean + r.normal() * sd * 0.6);
  count = Math.max(Math.max(1, lo), Math.min(Math.min(hi, 24), count));
  const f = [], p = [], n = [], g = [], m = [], c = [];
  const push = (fv, pv, nv, semiAbs, mv, cv) => {
    f.push(Math.round(fv)); p.push(Math.round(pv * 1000)); n.push(Math.round(nv * 100));
    const gape = style.gape[0] + style.gape[1] * semiAbs + (r() - 0.5) * (style.gape_sd || 0) * 0.3;
    g.push(Math.round(Math.max(-1, Math.min(1, gape)) * 1000)); m.push(Math.round(mv * 1000)); c.push(Math.round(cv * 1000));
  };
  const ref = T.ref_hz, refSemi = 12 * Math.log2(ref);
  // a short lead-in of silence, so the attack isn't clipped
  let lastF = ref;
  for (let i = 0; i < 6; i++) push(lastF, 0, 0, refSemi, 0, 0);
  let s = r.pick(T.start);
  for (let k = 0; k < count; k++) {
    const q = P[s];
    const dur = Math.max(0.015, q.d * Math.exp(r.normal() * q.dsd * vr * 0.8));
    const off = Math.max(-3, Math.min(3, r.normal() * q.fsd * vr * 0.3));            // this note sits a little higher or lower
    const amp = 1 + r.normal() * 0.12 * vr;
    const ph = r() * 6.283, nfr = Math.max(3, Math.round(dur / hop));
    for (let i = 0; i < nfr; i++) {
      const t = i / (nfr - 1 || 1);
      let semi = curve(q.f, t) + off;
      if (q.fm && q.fm[1] > 0) semi += q.fm[1] * Math.sin(ph + 6.283 * q.fm[0] * i * hop);   // trill / vibrato
      const fr = ref * Math.pow(2, semi / 12);
      // loudness shape from the note shape, with soft edges
      const edge = Math.min(1, i / 2, (nfr - 1 - i) / 2 + 0.5);
      const pv = Math.max(0, curve(q.p, t)) * amp * Math.max(0.2, edge);
      push(fr, pv, q.n * (1 + (r() - 0.5) * 0.3 * vr), semi + refSemi, q.m, q.c);
      lastF = fr;
    }
    if (k < count - 1) {
      // the gap to the next note, and which note shape comes next
      const gap = Math.min(0.6, Math.max(0.01, Math.exp(T.gap[0] + r.normal() * T.gap[1] * 0.6 * vr)));
      for (let i = 0, gn = Math.round(gap / hop); i < gn; i++) push(lastF, 0, 0, refSemi, 0, 0);
      s = r.pick(T.trans[s]);
    }
  }
  for (let i = 0; i < 16; i++) push(lastF, 0, 0, refSemi, 0, 0);   // tail: let the sound ring out
  return { f, p, n, g, m, c, hop, ref_hz: ref, name: type, kind: count > 1 ? 'phrase' : 'call', gen: true, seed };
}

/**
 * A bird as the app should use it for the chosen call mode. TRACED: unchanged. GENERATED: its calls become one
 * per call type (each a sample phrase, made fresh again on every note), the traced calls kept as bird.traced.
 */
export function withCallMode(bird, mode) {
  if (!bird || mode !== 'generated' || !bird.style || bird.gen) return bird;
  const types = genTypes(bird.style);
  if (!types.length) return bird;
  return { ...bird, traced: bird.calls, calls: types.map((t, i) => generate(bird.style, t, 4242 + i)), gen: { types } };
}
