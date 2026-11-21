// One bird model for both views. compute() turns body type + look + knob values +
// live engine telemetry into a list of 3D parts. view2d projects them (side cutaway),
// view3d renders them with WebGL — so the two views always agree.
//
// Coordinates: bird faces +x, y up, z towards the viewer (bird's right side).
// Part kinds: ell {c, r:[rx,ry,rz], rot}, tube {pts, r, rings}, cone {base, tip, w, h}.

export const PART_INFO = {
  airsacs: { label: 'AIR SACS', knobs: ['pressure', 'pulse'], text: 'Air sacs squeeze air past the syrinx. More pressure = louder and further past the onset of sound.' },
  lungs: { label: 'LUNGS', knobs: ['pressure'], text: 'Bird lungs are stiff; the air sacs do the pumping.' },
  syrinx: { label: 'SYRINX', knobs: ['tension', 'closure', 'mass', 'two', 'two_int', 'split', 'coupling', 'turb', 'breath'], text: 'The voice box at the bottom of the windpipe. Its labia or membranes vibrate in the airflow: redder with more tension, bigger with more mass, glowing on the side that sings. Watch the air (blue) bunch up and burst through as they open and close.' },
  bronchi: { label: 'BRONCHI', knobs: ['split', 'two'], text: 'Each bronchus has its own sound source in songbirds, so they can sing two notes at once. The side that sings glows: SIDE SWITCH sets where low notes (left) hand over to high ones (right); SECOND VOICE lights up the other side too.' },
  trachea: { label: 'WINDPIPE', knobs: ['trachea', 'echo'], text: 'The trachea carries sound to the mouth and adds its own resonances and echoes.' },
  oec: { label: 'THROAT SAC', knobs: ['oec', 'oec_track', 'oec_depth'], text: 'The oropharyngeal-oesophageal cavity. Songbirds inflate it to tune it to the note and filter out overtones.' },
  sac: { label: 'NECK SAC', knobs: ['sac', 'sac_q', 'oec', 'oec_track'], text: 'Doves coo with the beak shut. They blow up the oesophagus like a balloon, and its thin wall rings at the note and radiates through the skin of the neck: a soft, pure hoot (Riede et al. 2004).' },
  tongue: { label: 'TONGUE', knobs: ['tongue_h', 'tongue_p', 'mouth_q'], text: 'Parrots shape resonances with their thick tongue, much like we do with vowels.' },
  beak: { label: 'BEAK', knobs: ['beak', 'beak_track'], text: 'The beak gape works like a filter: wider for higher notes.' },
  head: { label: 'HEAD', knobs: [], text: 'The larynx sits at the top of the windpipe here, but in birds it makes no sound: the voice comes from the syrinx, deep in the chest.' },
  eye: { label: 'EYE', knobs: [], text: 'Not part of the voice.' },
  neck: { label: 'NECK', knobs: ['trachea'], text: 'The windpipe runs up the neck. Longer windpipe, longer neck in this model.' },
  body: { label: 'BODY', knobs: ['pressure'], text: 'The trunk holds the lungs and most of the air sacs. Breathing muscles squeeze the sacs to drive air through the syrinx.' },
  wing: { label: 'WING', knobs: [], text: 'Not part of the voice, though some air sacs reach into the wing bones. Wings ease out a little while the bird sings.' },
  tail: { label: 'TAIL', knobs: [], text: 'Not part of the voice. Many birds flick it as they call.' },
  legs: { label: 'LEGS', knobs: [], text: 'Not part of the voice.' },
  crest: { label: 'CREST', knobs: [], text: 'Feathers raised on the crown for display. Not part of the voice.' },
  streamers: { label: 'TAIL STREAMERS', knobs: [], text: 'Long display feathers (in the quetzal, upper tail coverts, not the tail itself). Not part of the voice.' },
  markings: { label: 'MARKINGS', knobs: [], text: "This species' markings, as in the bird's plate (wattles, cheek patches, eye stripes, crests). Not part of the voice." },
};

const DEFAULT_LOOK = {
  body: [4.2, 2.5, 2.3], head: 1.55, neck: 1.0, tail: 2.8,
  beak: { len: 2.0, depth: 0.55, curve: 0.15, hook: 0 },
  colors: { body: '#555', belly: '#888', head: '#555', wing: '#444', tail: '#444', beak: '#ccc', beak2: '#ccc', eye: '#222', legs: '#555', accent: '#c33' },
  accents: [],
};

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];

function bezier(p0, p1, p2, n) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, c = t * t;
    pts.push([a * p0[0] + b * p1[0] + c * p2[0], a * p0[1] + b * p1[1] + c * p2[1], a * p0[2] + b * p1[2] + c * p2[2]]);
  }
  return pts;
}

/**
 * @param body 'songbird'|'kingfisher'|'parrot'|'dove'
 * @param look per-bird look (preset.look)
 * @param v knob values by key (physical)
 * @param tele Float32Array(16) from the engine
 * @param t time in seconds (for gentle idle motion)
 */
let sing = 0;
// air particles (persist between frames): s = position along the airway 0..1, side = which bronchus
const AIR = [];
let airT = 0, airSpawn = 0;

export function compute(body, lookIn, v, tele, t, extra = {}) {
  const L = Object.assign({}, DEFAULT_LOOK, lookIn || {});
  const C = Object.assign({}, DEFAULT_LOOK.colors, (lookIn && lookIn.colors) || {});
  const B = Object.assign({}, DEFAULT_LOOK.beak, (lookIn && lookIn.beak) || {});
  const parts = [];
  const singing = tele[0] > 0.5;
  const pLive = singing ? Math.min(1.5, tele[1]) : 0;
  const level = Math.min(1, (tele[12] || 0) * 20);
  // singing motion: eased so it rises with the song and settles after (no flying, just a singer)
  const target = singing ? Math.min(1, 0.35 + level) : 0;
  sing += (target - sing) * (target > sing ? 0.18 : 0.06);
  const S = sing;
  const breathe = 0.5 + 0.5 * Math.sin(t * 1.7);
  const P = (o) => { parts.push(o); return o; };

  // --- skeleton positions -----------------------------------------------------
  const [bx, by, bz] = L.body;
  const trLen = v.trachea ?? 6;
  const neckX = 0.12 * Math.max(-3, Math.min(10, trLen - 6)) * L.neck; // longer windpipe stretches the neck
  // head lifts and tips back a little while singing
  const head = [bx * 0.8 + neckX * 0.45 - 0.12 * S, by * 1.42 + neckX * 0.85 + 0.28 * S + 0.05 * S * Math.sin(t * 7.3), 0];
  const hr = L.head;

  // --- skin (layer 0) ---------------------------------------------------------
  P({ id: 'tail', part: 'tail', kind: 'ell', c: [-bx * 1.1, -by * 0.95, 0], r: [L.tail, 0.42, 0.95], rot: 0.5 + S * (0.06 + 0.05 * Math.sin(t * 4.1)), color: C.tail, layer: 0 });
  P({ id: 'body', part: 'body', kind: 'ell', c: [0, 0, 0], r: [bx, by, bz], rot: -0.42, color: C.body, layer: 0 });
  P({ id: 'belly', part: 'body', kind: 'ell', c: [0.5, -by * 0.28, 0], r: [bx * 0.8, by * 0.68, bz * 0.92], rot: -0.25, color: C.belly, layer: 0 });
  P({ id: 'neck', part: 'neck', kind: 'ell', c: [(head[0] + bx * 0.5) / 2, (head[1] + by * 0.35) / 2, 0], r: [hr * 1.05, (head[1] - by * 0.3) * 0.55 + hr * 0.6, hr * 0.9], rot: -0.6, color: C.head, layer: 0 });
  P({ id: 'head', part: 'head', kind: 'ell', c: head, r: [hr * 1.08, hr, hr * 0.92], rot: 0, color: C.head, layer: 0 });
  // wings ease slightly away from the body and quiver while singing (not a flap)
  const wq = S * (0.55 + 0.45 * Math.sin(t * 9.5));
  for (const s of [1, -1]) P({ id: 'wing', part: 'wing', kind: 'ell', c: [-0.7 + 0.1 * S, by * 0.12 + 0.12 * S, s * bz * (0.72 + 0.16 * wq)], r: [bx * 0.92, by * 0.55, 0.42], rot: -0.22 - 0.1 * wq, color: C.wing, layer: 0, wing: true, far: s < 0 });
  if (L.streamers) {
    // long display plumes from the rump, gently swaying
    const st = L.streamers, sw = 0.15 * Math.sin(t * 1.3) + 0.1 * S * Math.sin(t * 4.1);
    for (const s of [1, -1]) {
      const base = [-bx * 0.7, -by * 0.35, s * 0.25];
      const end = [-bx * 0.7 - st.len, -by * 0.35 - st.len * (0.85 + sw * 0.3), s * (0.4 + 0.15 * sw)];
      const mid = [(base[0] + end[0]) / 2 + 0.4, (base[1] + end[1]) / 2 + st.len * 0.12, s * 0.35];
      P({ id: 'streamer', part: 'streamers', kind: 'tube', pts: bezier(base, mid, end, 10), r: st.w || 0.22, color: st.color || C.tail, layer: 0, far: s < 0 });
    }
  }
  for (const s of [1, -1]) {
    P({ id: 'leg', part: 'legs', kind: 'tube', pts: [[0.4, -by * 0.8, s * 0.7], [0.55, -by * 1.55, s * 0.75], [1.1, -by * 1.6, s * 0.75]], r: 0.16, color: C.legs, layer: 0 });
  }
  for (const s of [1, -1]) P({ id: 'eye', part: 'eye', kind: 'ell', c: [head[0] + hr * 0.42, head[1] + hr * 0.25, s * hr * 0.62], r: [0.27, 0.27, 0.2], rot: 0, color: C.eye, layer: 2, far: s < 0 });
  for (const a of L.accents || []) {
    const c = add(head, a.at || [0, 0, 0]);
    const at = a.body ? a.at : c;
    P({ id: 'accent', part: 'markings', kind: 'ell', c: at, r: a.r, rot: a.rot || 0, color: a.color || C.accent, layer: a.layer ?? 2 });
    // markings on the side of the head come in pairs
    if (Math.abs(at[2]) > 0.05) P({ id: 'accent', part: 'markings', kind: 'ell', c: [at[0], at[1], -at[2]], r: a.r, rot: a.rot || 0, color: a.color || C.accent, layer: a.layer ?? 2, far: true });
  }

  if (L.crest) {
    // crest: a raised fan of crown feathers (lifts a little when singing)
    const cr = L.crest, base = [head[0] - hr * 0.1, head[1] + hr * 0.75, 0];
    const tip = [base[0] - (cr.back ?? 0.5) * cr.len, base[1] + cr.len * (0.75 + 0.15 * S), 0];
    P({ id: 'crest', part: 'crest', kind: 'cone', base, tip, w: cr.w || hr * 0.55, h: (cr.w || hr * 0.55) * 0.5, color: cr.color || C.head, layer: 0 });
  }

  // --- beak (gape from the engine when singing, else the knob) -----------------
  const gapeK = v.beak ?? 0.5;
  // doves coo with the beak shut (the sound leaves through the inflated neck)
  const gape = (singing ? tele[8] : gapeK * 0.6) * (body === 'dove' ? 0.12 : 1);
  const bb = [head[0] + hr * 0.9, head[1] - hr * 0.12, 0];
  const ang = (0.08 + gape * 0.45) * (body === 'parrot' ? 0.7 : 1);
  const tipU = [bb[0] + B.len, bb[1] - B.curve * B.len - B.hook * 0.8, 0];
  P({ id: 'beak', kind: 'cone', base: bb, tip: tipU, w: B.depth * 0.75, h: B.depth * 0.62, color: C.beak, layer: 2, part: 'beak', lift: 0.2 });
  const lowBase = [bb[0] - 0.05, bb[1] - B.depth * 0.55, 0];
  const lenLow = B.len * (body === 'parrot' ? 0.55 : 0.94);
  const dirLow = [Math.cos(-ang - B.curve * 0.4), Math.sin(-ang - B.curve * 0.4), 0];
  P({ id: 'beak2', kind: 'cone', base: lowBase, tip: add(lowBase, mul(dirLow, lenLow)), w: B.depth * 0.65, h: B.depth * 0.42, color: C.beak2 || C.beak, layer: 2, part: 'beak', lift: -0.2 });

  // --- breathing system (layer 1) ----------------------------------------------
  const press = v.pressure ?? 1;
  const squeeze = 1 - 0.28 * pLive - 0.04 * breathe * (singing ? 0 : 1);
  const sacAlpha = 0.35 + 0.35 * Math.min(1, press / 1.6);
  const sacCol = singing ? '#9fd3ff' : '#7fb3dc';
  P({ id: 'clav', kind: 'ell', c: [bx * 0.45, by * 0.3, 0], r: mul([0.85, 0.6, 0.75], squeeze * L.body[1] / 2.5), rot: 0, color: sacCol, alpha: sacAlpha, layer: 1, part: 'airsacs' });
  for (const s of [1, -1]) {
    P({ id: 'thor', kind: 'ell', c: [-bx * 0.15, -by * 0.18, s * bz * 0.42], r: mul([1.25, 0.78, 0.55], squeeze * L.body[1] / 2.5), rot: -0.2, color: sacCol, alpha: sacAlpha, layer: 1, part: 'airsacs' });
    P({ id: 'abd', kind: 'ell', c: [-bx * 0.4, -by * 0.16, s * bz * 0.36], r: mul([1.3, 0.8, 0.6], squeeze * L.body[1] / 2.5), rot: -0.15, color: sacCol, alpha: sacAlpha, layer: 1, part: 'airsacs' });
    P({ id: 'lung', kind: 'ell', c: [-bx * 0.12, by * 0.38, s * bz * 0.3], r: [1.25, 0.55, 0.45], rot: -0.3, color: '#e58f8f', layer: 1, part: 'lungs' });
  }

  // --- syrinx + bronchi ----------------------------------------------------------
  const syr = body === 'parrot' ? [bx * 0.5, by * 0.62, 0] : [bx * 0.42, by * 0.5, 0];
  for (const s of [1, -1]) {
    P({ id: 'bronch', kind: 'tube', pts: [[-bx * 0.05, by * 0.42, s * bz * 0.3], [syr[0] - 0.6, syr[1] - 0.05, s * 0.32], [syr[0] - 0.12, syr[1], s * 0.14]], r: 0.15, color: '#d9c7a8', layer: 1, part: 'bronchi' });
  }
  const tens = v.tension ?? 0.3;
  const tensCol = mixHex('#e7a0a0', '#b8282d', (tens + 0.5) / 1.35);
  const vib = (k) => singing ? (tele[4 + k] || 0) * level * (0.6 + 0.4 * Math.sin(t * 40 + k)) : 0;
  // labia mass: heavier labia are drawn bigger (MASS -12..12 semitones)
  const ms = 1 + 0.45 * Math.max(-1, Math.min(1, (v.mass ?? 0) / 12));
  // which side sings: while singing, the engine's side weights; at rest, the side the current call's pitch
  // would use (SIDE SWITCH), plus the other side if SECOND VOICE is up
  const restRight = (extra.refHz || 2000) >= (v.split ?? 2000);
  const sideW = singing ? [tele[4] || 0, tele[5] || 0]
    : [restRight ? Math.min(1, (v.two ?? 0)) : 1, restRight ? 1 : Math.min(1, (v.two ?? 0))];
  if (body === 'songbird') {
    // two independent sound sources: medial + lateral labia on each side, lit by how much each side sings
    for (const [k, s] of [[0, -1], [1, 1]]) {
      const open = 0.05 * (1 - (v.closure ?? 0.15)) + 0.18 * vib(k);
      const col = mixHex(tensCol, '#ffc36a', 0.55 * Math.min(1, sideW[k])), a = 0.45 + 0.55 * Math.min(1, sideW[k] + 0.15);
      P({ id: 'labia', kind: 'ell', c: [syr[0] - 0.05, syr[1] + open * ms, s * 0.16], r: [0.26 * ms, 0.09 * ms, 0.09 * ms], rot: 0, color: col, alpha: a, layer: 2, part: 'syrinx' });
      P({ id: 'labia', kind: 'ell', c: [syr[0] - 0.05, syr[1] - open * ms, s * 0.16], r: [0.26 * ms, 0.09 * ms, 0.09 * ms], rot: 0, color: col, alpha: a, layer: 2, part: 'syrinx' });
    }
    P({ id: 'syrinx', kind: 'ell', c: syr, r: [0.42, 0.34, 0.42], rot: 0, color: '#e3d2b3', alpha: 0.45, layer: 1, part: 'syrinx' });
  } else if (body === 'kingfisher') {
    // tracheobronchial syrinx: a vibrating membrane at the top of each bronchus
    for (const [k, s] of [[0, -1], [1, 1]]) {
      const b = 0.06 + 0.2 * vib(k);
      const col = mixHex(tensCol, '#ffc36a', 0.5 * Math.min(1, sideW[k]));
      P({ id: 'membrane', kind: 'ell', c: [syr[0] - 0.25, syr[1], s * (0.2 + b * 0.5)], r: [0.34 * ms, 0.2 * ms, 0.05 + b * 0.25], rot: 0, color: col, layer: 2, part: 'syrinx' });
    }
    // MEMBRANE COUPLING: a band joining the two membranes, thicker and pulsing as they push on each other
    const cp = v.coupling ?? 0.3, pulse = singing ? 0.5 + 0.5 * Math.sin(t * 31) * Math.min(1, (vib(0) + vib(1)) * 3) : 0.5;
    P({ id: 'coupling', kind: 'tube', pts: [[syr[0] - 0.25, syr[1], -0.22], [syr[0] - 0.25, syr[1] + 0.05 * pulse, 0], [syr[0] - 0.25, syr[1], 0.22]], r: 0.02 + 0.07 * cp * (0.7 + 0.6 * pulse), color: '#f2a93b', alpha: 0.35 + 0.5 * cp, layer: 2, part: 'syrinx' });
    P({ id: 'syrinx', kind: 'ell', c: syr, r: [0.5, 0.36, 0.5], rot: 0, color: '#e3d2b3', alpha: 0.4, layer: 1, part: 'syrinx' });
  } else {
    // psittacine: one source, lateral tympaniform membranes on the lower trachea
    const b = 0.05 + 0.22 * vib(0);
    for (const s of [1, -1]) P({ id: 'ltm', kind: 'ell', c: [syr[0] + 0.1, syr[1] + 0.1, s * (0.13 + b * 0.4)], r: [0.38 * ms, 0.22 * ms, 0.05 + b * 0.2], rot: -0.5, color: tensCol, layer: 2, part: 'syrinx' });
    P({ id: 'syrinx', kind: 'ell', c: syr, r: [0.45, 0.35, 0.38], rot: -0.5, color: '#e3d2b3', alpha: 0.4, layer: 1, part: 'syrinx' });
  }

  // --- windpipe ---------------------------------------------------------------------
  const glottis = [head[0] + hr * 0.25, head[1] - hr * 0.55, 0];
  const ctrl = [syr[0] + (glottis[0] - syr[0]) * 0.15 + 0.9, (syr[1] + glottis[1]) * 0.5, 0];
  const echo = v.echo ?? 0.2;
  P({ id: 'trachea', kind: 'tube', pts: bezier(syr, ctrl, glottis, 12), r: 0.2 * (L.body[1] / 2.5), rings: Math.round(8 + trLen * 1.4), color: mixHex('#e9dcc3', '#c9a46a', Math.abs(echo)), layer: 1, part: 'trachea' });

  // --- throat sac / tongue --------------------------------------------------------
  if (body !== 'parrot') {
    const foec = singing && tele[9] > 0 ? tele[9] : (v.oec ?? 2500);
    const s = Math.max(0.45, Math.min(1.8, Math.pow(2500 / foec, 0.4))) * hr * 0.42;
    const depth = v.oec_depth ?? 0.7;
    P({ id: 'oec', kind: 'ell', c: [head[0] + hr * 0.1, head[1] - hr * 0.72, 0], r: [s * 1.3, s, s * 1.05], rot: 0.2, color: '#f0b7a4', alpha: 0.35 + 0.45 * depth, layer: 1, part: 'oec' });
  }
  if (body === 'dove') {
    // inflated oesophagus on the front of the neck: swells with neck inflation and while cooing
    const inf = (v.sac ?? 0.6) * (0.45 + 0.55 * (singing ? Math.min(1, 0.4 + level * 1.5) : 0.25));
    const r0 = hr * (0.45 + 0.75 * inf);
    P({ id: 'sac', kind: 'ell', c: [head[0] + hr * 0.05 - 0.2, head[1] - hr * 1.05, 0], r: [r0 * 1.1, r0, r0 * 1.15], rot: 0.35, color: '#b48ad6', alpha: 0.3 + 0.4 * (v.sac ?? 0.6), layer: 1, part: 'sac' });
  }
  // tongue: the knobs at rest; while singing it follows the mouth's first resonance (F1 = 800 * 2^(1.6 h))
  const thK = v.tongue_h ?? 0.4, tp = v.tongue_p ?? 0.5;
  const th = singing && tele[10] > 0 ? Math.max(-0.3, Math.min(1.3, Math.log2(tele[10] / 800) / 1.6)) : thK;
  const tScale = body === 'parrot' ? 1 : 0.6;
  // the tongue stays inside the beak, however short the beak is
  const tLen = Math.min(0.75 * tScale, B.len * 0.36), tX = Math.min(0.2 + tp * 0.45 * tScale, B.len * 0.42);
  if (body !== 'dove') P({ id: 'tongue', kind: 'ell', c: [bb[0] + tX, bb[1] - B.depth * 0.45 + th * 0.28 * tScale, 0], r: [tLen, Math.min(0.24 * tScale + 0.06, B.depth * 0.32), 0.32 * tScale], rot: -0.15, color: '#d77c8a', layer: 2, part: 'tongue' });

  // --- air: particles flow from the air sacs, through the bronchi and the syrinx, up the windpipe and out
  // of the beak (doves: into the neck sac). Faster with more pressure, jittery with turbulence, a faint
  // extra hiss with breath noise, bunched into pulses by labial closure. At rest a slow trickle (breathing).
  const dtA = Math.min(0.1, Math.max(0, t - airT)); airT = t;
  const press2 = v.pressure ?? 1, turbK = v.turb ?? 0.1, breathK = v.breath ?? 0.05, clos = v.closure ?? 0.15;
  const tr = parts.find((q) => q.id === 'trachea').pts;
  const tail = [bb[0] + 0.15, bb[1] - B.depth * 0.25, 0], out = [tipU[0] + 0.9, (tipU[1] + lowBase[1]) / 2 - 0.1, 0];
  const sacEnd = body === 'dove' ? [head[0] + hr * 0.05 - 0.2, head[1] - hr * 1.05, 0] : null;
  const start = (side) => [[-bx * 0.4, -by * 0.16, side * bz * 0.36], [-bx * 0.15, -by * 0.1, side * bz * 0.42], [-bx * 0.05, by * 0.42, side * bz * 0.3], [syr[0] - 0.6, syr[1] - 0.05, side * 0.32], [syr[0] - 0.12, syr[1], side * 0.14]];
  const path = (side, toSac) => [...start(side), ...tr, ...(toSac ? [sacEnd] : [tail, out])];
  const flow = singing ? Math.min(1.6, 0.25 + pLive) : 0.12 + 0.04 * breathe;
  // spawn in step with the flow speed, so the stream stays evenly spread (about 30-60 particles)
  const rate = singing ? flow * (34 + 26 * Math.min(1, level * 4)) * Math.min(1.4, press2) : flow * 30;
  airSpawn += rate * dtA;
  while (airSpawn >= 1 && AIR.length < 160) {
    airSpawn -= 1;
    const hiss = Math.random() < breathK * 0.8;
    AIR.push({ s: 0, side: Math.random() < 0.5 ? -1 : 1, sac: body === 'dove' && Math.random() < (v.sac ?? 0.6), jx: Math.random() * 6.28, hiss, life: 0 });
  }
  if (airSpawn > 1) airSpawn = 1;
  const syrS = 0.42;   // roughly where the syrinx sits along the airway
  const air = [];
  for (let i = AIR.length - 1; i >= 0; i--) {
    const a = AIR[i];
    // closure: air bunches up just above the syrinx, released in pulses
    const gate = singing && Math.abs(a.s - syrS) < 0.08 ? 1 - clos * 0.75 * (0.5 + 0.5 * Math.sin(t * 22)) : 1;
    a.s += dtA * flow * 0.9 * gate * (a.hiss ? 1.25 : 1); a.life += dtA;
    if (a.s >= 1) { AIR.splice(i, 1); continue; }
    // position by distance along the airway (its segments are very uneven)
    const pts = path(a.side, a.sac);
    const L = [0]; for (let j = 1; j < pts.length; j++) L.push(L[j - 1] + Math.hypot(pts[j][0] - pts[j - 1][0], pts[j][1] - pts[j - 1][1], pts[j][2] - pts[j - 1][2]));
    const d = a.s * L[L.length - 1]; let k = 0; while (k < pts.length - 2 && L[k + 1] < d) k++;
    const u = Math.min(1, (d - L[k]) / Math.max(1e-6, L[k + 1] - L[k]));
    const p0 = pts[k], p1 = pts[k + 1];
    const jit = (singing ? turbK * 0.35 + 0.03 : 0.02) * (a.s > syrS ? 1 : 0.4);
    const c = [p0[0] + (p1[0] - p0[0]) * u + jit * Math.sin(t * 17 + a.jx), p0[1] + (p1[1] - p0[1]) * u + jit * Math.cos(t * 13 + a.jx * 1.7), p0[2] + (p1[2] - p0[2]) * u];
    const fade = Math.min(1, a.s * 8) * Math.min(1, (1 - a.s) * 6);
    air.push({ c, r: a.hiss ? 0.035 : 0.055 + 0.03 * Math.min(1, press2), a: (a.hiss ? 0.4 : singing ? 0.8 : 0.4) * fade, hiss: a.hiss });
  }

  // a soft breathing bob of the whole bird with each phrase
  const bob = 0.07 * S * Math.sin(t * 5.2);
  if (bob) for (const p of parts) {
    if (p.c) p.c = [p.c[0], p.c[1] + bob, p.c[2]];
    if (p.pts) p.pts = p.pts.map((q) => [q[0], q[1] + bob, q[2]]);
    if (p.base) { p.base = [p.base[0], p.base[1] + bob, p.base[2]]; p.tip = [p.tip[0], p.tip[1] + bob, p.tip[2]]; }
  }
  if (bob) for (const a of air) a.c = [a.c[0], a.c[1] + bob, a.c[2]];
  const emit = { pos: [tipU[0] + 0.2, (tipU[1] + lowBase[1]) / 2 + bob, 0], level, f0: tele[3] || 0 };
  return { parts, emit, head, syr, air };
}

export function mixHex(a, b, t) {
  t = Math.min(1, Math.max(0, t));
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const r = Math.round(((pa >> 16) & 255) * (1 - t) + ((pb >> 16) & 255) * t);
  const g = Math.round(((pa >> 8) & 255) * (1 - t) + ((pb >> 8) & 255) * t);
  const bl = Math.round((pa & 255) * (1 - t) + (pb & 255) * t);
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1);
}
export function hexRGB(h) { const p = parseInt(h.slice(1), 16); return [((p >> 16) & 255) / 255, ((p >> 8) & 255) / 255, (p & 255) / 255]; }
