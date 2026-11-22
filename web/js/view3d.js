// 3D view of the shared bird model. Plain WebGL 1, three tiny meshes, no libraries.
import { hexRGB } from './birdmodel.js';

const VS = `attribute vec3 p; attribute vec3 n; uniform mat4 M, VP; uniform mat3 N; varying vec3 vn; varying vec3 vw;
void main(){ vec4 w = M * vec4(p,1.); vw = w.xyz; vn = normalize(N * n); gl_Position = VP * w; }`;
// mode: 0 glass (anatomy through translucent skin), 1 solid with soft light, 2 toon (bands + ink outline), 3 x-ray
const FS = `precision mediump float; varying vec3 vn; varying vec3 vw; uniform vec3 col, eye; uniform float a, glow, mode, skin, enh, line, fogN, fogF; uniform vec4 wm; uniform float wrot, wside;
void main(){
 if (wside != 0.) { vec2 q = vw.xy - wm.xy; float cr = cos(wrot), sr = sin(wrot); q = vec2(q.x*cr + q.y*sr, -q.x*sr + q.y*cr);
   if ((q.x*q.x)/(wm.z*wm.z) + (q.y*q.y)/(wm.w*wm.w) > 1. || vw.z*wside < 0.) discard; }
 vec3 n = normalize(vn); vec3 l = normalize(vec3(.5,.8,.6)); vec3 v = normalize(eye - vw);
 float nd = max(dot(n,l),0.); float r = pow(1.-max(dot(n,v),0.),2.5);
 float sp = pow(max(dot(reflect(-l,n),v),0.),24.)*.25;
 vec3 c; float al = a + r*a*.6;
 if (mode < .5 && enh > .5) { vec3 hemi = mix(vec3(.36,.33,.3), vec3(1.,.97,.92), n.y*.5+.5);
   c = col*(hemi*.4 + nd*.55) + sp*.55 + r*(col*.35 + vec3(.08,.07,.06)); al = skin > .5 ? a*1.3 + r*.2 : a + r*a*.4; }
 else if (mode < .5) { c = col*(nd*.75+.3) + sp + r*.25*col; }
 else if (mode < 1.5) { vec3 hemi = mix(vec3(.42,.38,.34), vec3(1.,.97,.92), n.y*.5+.5);
   c = col*(hemi*.55 + nd*.6) + sp*.6 + r*.35*vec3(1.,.9,.75); al = a; }
 else if (mode < 2.5) { float b = nd > .6 ? 1.05 : nd > .22 ? .78 : .52; c = col*b + step(.92, max(dot(reflect(-l,n),v),0.))*.25; al = a; }
 else if (mode < 3.5) { if (skin > .5) { c = vec3(.4,.8,1.)*(.15 + r*1.4); al = .02 + r*.5; } else { c = col*1.15 + r*.5; al = a; } }
 else {
   // scan: cross-section rings on the skin (brighter where the surface turns away), a faint rim glow,
   // translucent organs with their own rings; everything fades with depth
   vec3 cream = vec3(.95,.92,.86), amber = vec3(.95,.66,.23);
   vec3 hemi = mix(vec3(.4,.37,.33), vec3(1.,.97,.92), n.y*.5+.5);
   if (line > .5) { if (skin > .5) { c = mix(col*1.35 + .12, amber, .25 + r*.5); al = .14 + r*.5; } else { c = col*1.25 + .08; al = .45 + r*.45; } }
   else if (skin > .5) { c = col*(hemi*.5 + nd*.55) + sp*.45 + r*amber*.3; al = a; }
   else { c = col*(.5 + nd*.35) + r*.55*col; al = a*.5 + r*.35; }
   float f = clamp((length(eye - vw) - fogN)/(fogF - fogN), 0., 1.); al *= 1. - f*.8;
 }
 c += glow*vec3(1.,.75,.3)*r*1.5;
 gl_FragColor = vec4(c, al); }`;

function sphere(nl = 14, nu = 20) {
  const v = [], idx = [];
  for (let i = 0; i <= nl; i++) for (let j = 0; j <= nu; j++) {
    const th = Math.PI * i / nl, ph = 2 * Math.PI * j / nu;
    const x = Math.sin(th) * Math.cos(ph), y = Math.cos(th), z = Math.sin(th) * Math.sin(ph);
    v.push(x, y, z, x, y, z);
  }
  for (let i = 0; i < nl; i++) for (let j = 0; j < nu; j++) {
    const a = i * (nu + 1) + j, b = a + nu + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  return { v, idx };
}
function cylinder(n = 10) { // along +x, x in [0,1], radius 1
  const v = [], idx = [];
  for (let j = 0; j <= n; j++) {
    const ph = 2 * Math.PI * j / n, y = Math.cos(ph), z = Math.sin(ph);
    v.push(0, y, z, 0, y, z, 1, y, z, 0, y, z);
  }
  for (let j = 0; j < n; j++) { const a = j * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  return { v, idx };
}
function cone(n = 14) { // base ellipse at x=0 (radius 1), tip at x=1
  const v = [], idx = [];
  for (let j = 0; j <= n; j++) {
    const ph = 2 * Math.PI * j / n, y = Math.cos(ph), z = Math.sin(ph);
    const nn = Math.hypot(1, 1);
    v.push(0, y, z, 1 / nn, y / nn, z / nn, 1, 0, 0, 1 / nn, y / nn, z / nn);
  }
  for (let j = 0; j < n; j++) { const a = j * 2; idx.push(a, a + 1, a + 2); }
  // base cap
  const c = v.length / 6; v.push(0, 0, 0, -1, 0, 0);
  for (let j = 0; j < n; j++) idx.push(c, j * 2 + 2, j * 2);
  return { v, idx };
}

// line meshes for the scan style: normals point outward, so lines brighten at the silhouette
function ringsSphere(nr = 11, seg = 40) {   // slices across the long (x) axis, plus three meridians
  const v = [], idx = []; let k = 0;
  const loop = (pts) => { const s0 = k; for (const q of pts) { v.push(...q, ...q); k++; } for (let i = 0; i < pts.length; i++) idx.push(s0 + i, s0 + (i + 1) % pts.length); };
  for (let i = 1; i < nr; i++) {
    const x = -1 + 2 * i / nr, rr = Math.sqrt(1 - x * x), pts = [];
    for (let j = 0; j < seg; j++) { const a = 2 * Math.PI * j / seg; pts.push([x, rr * Math.cos(a), rr * Math.sin(a)]); }
    loop(pts);
  }
  for (const ph of [0, Math.PI / 2, Math.PI]) {
    const pts = []; for (let j = 0; j < seg; j++) { const a = 2 * Math.PI * j / seg; pts.push([Math.cos(a), Math.sin(a) * Math.cos(ph), Math.sin(a) * Math.sin(ph)]); }
    loop(pts);
  }
  return { v, idx, lines: true };
}
function ringsCyl(nr = 4, seg = 20) {   // circles along a segment (cartilage rings on the windpipe)
  const v = [], idx = []; let k = 0;
  for (let i = 0; i < nr; i++) {
    const x = (i + 0.5) / nr, s0 = k;
    for (let j = 0; j < seg; j++) { const a = 2 * Math.PI * j / seg, y = Math.cos(a), z = Math.sin(a); v.push(x, y, z, 0, y, z); k++; }
    for (let j = 0; j < seg; j++) idx.push(s0 + j, s0 + (j + 1) % seg);
  }
  return { v, idx, lines: true };
}
function ringsCone(nr = 5, seg = 20) {
  const v = [], idx = []; let k = 0;
  for (let i = 0; i < nr; i++) {
    const x = i / nr, rr = 1 - x, s0 = k;
    for (let j = 0; j < seg; j++) { const a = 2 * Math.PI * j / seg, y = Math.cos(a), z = Math.sin(a); v.push(x, rr * y, rr * z, 0.7, y * 0.7, z * 0.7); k++; }
    for (let j = 0; j < seg; j++) idx.push(s0 + j, s0 + (j + 1) % seg);
  }
  // two edges to the tip
  for (const a of [Math.PI / 2, -Math.PI / 2]) { v.push(0, Math.cos(a), Math.sin(a), 0, 0, 1, 1, 0, 0, 0, 0, 1); idx.push(k, k + 1); k += 2; }
  return { v, idx, lines: true };
}
function gridMesh(n = 12) {   // a floor grid, x and z in -1..1, normals up
  const v = [], idx = []; let k = 0;
  for (let i = 0; i <= n; i++) {
    const t = -1 + 2 * i / n;
    v.push(t, 0, -1, 0, 1, 0, t, 0, 1, 0, 1, 0, -1, 0, t, 0, 1, 0, 1, 0, t, 0, 1, 0); idx.push(k, k + 1, k + 2, k + 3); k += 4;
  }
  return { v, idx, lines: true };
}

// --- tiny mat4 (column-major) ---
const m4 = {
  mul(a, b) { const o = new Float32Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } return o; },
  persp(f, asp, n, fa) { const t = 1 / Math.tan(f / 2); return new Float32Array([t / asp, 0, 0, 0, 0, t, 0, 0, 0, 0, (fa + n) / (n - fa), -1, 0, 0, 2 * fa * n / (n - fa), 0]); },
  look(e, c, u) {
    const z = norm([e[0] - c[0], e[1] - c[1], e[2] - c[2]]), x = norm(cross(u, z)), y = cross(z, x);
    return new Float32Array([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, e), -dot(y, e), -dot(z, e), 1]);
  },
  // basis columns (ax, ay, az) scaled, then translate
  basis(ax, ay, az, t) { return new Float32Array([...ax, 0, ...ay, 0, ...az, 0, ...t, 1]); },
};
function norm(a) { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function normalMat(ax, ay, az) {
  // inverse-transpose of [ax ay az] for scaled orthogonal axes = axes / |axis|^2
  const f = (v) => { const l2 = dot(v, v) || 1; return [v[0] / l2, v[1] / l2, v[2] / l2]; };
  return new Float32Array([...f(ax), ...f(ay), ...f(az)]);
}

export class View3D {
  constructor(canvas) {
    this.cv = canvas;
    const gl = this.gl = canvas.getContext('webgl', { antialias: true, alpha: true, premultipliedAlpha: false });
    this.ok = !!gl;
    if (!gl) return;
    const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); return o; };
    const pr = this.pr = gl.createProgram();
    gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(pr);
    gl.useProgram(pr);
    this.loc = {}; for (const k of ['M', 'VP', 'N', 'col', 'eye', 'a', 'glow', 'mode', 'skin', 'enh', 'line', 'fogN', 'fogF', 'wm', 'wrot', 'wside']) this.loc[k] = gl.getUniformLocation(pr, k);
    this.ap = gl.getAttribLocation(pr, 'p'); this.an = gl.getAttribLocation(pr, 'n');
    this.mesh = { sph: this.upload(sphere()), cyl: this.upload(cylinder()), cone: this.upload(cone()),
      lsph: this.upload(ringsSphere()), lcyl: this.upload(ringsCyl()), lcone: this.upload(ringsCone()), grid: this.upload(gridMesh()) };
    // the scan style's live readouts: a 2D layer over the 3D canvas
    this.ov = document.createElement('canvas'); this.ov.id = 'view3dLabels'; canvas.after(this.ov);
    this.yaw = 0.5; this.pitch = 0.15; this.dist = 1; this.auto = false; this.sel = null;
    this.style = 4;   // 4 = the 3D look (cross-section rings over the plumage, organs, readouts); 0-3 are older prototypes
    this.outlineCull = 'back';
    this.enhance = true;   // the improved current look: sky-and-ground light, rim glow, a branch and shadow, eye highlights
    let drag = null; const pts = new Map();
    canvas.addEventListener('pointerdown', (e) => { canvas.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); drag = { x: e.clientX, y: e.clientY, yaw: this.yaw, pitch: this.pitch, moved: 0 }; this.auto = false; });
    canvas.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId)) return;
      const prev = pts.get(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]);
      if (pts.size === 2) { // pinch
        const [a, b] = [...pts.values()]; const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
        if (this._pd) this.dist = Math.min(2, Math.max(0.5, this.dist * this._pd / d)); this._pd = d; return;
      }
      if (!drag) return;
      drag.moved += Math.abs(e.clientX - prev[0]) + Math.abs(e.clientY - prev[1]);
      this.yaw = drag.yaw + (e.clientX - drag.x) * 0.01;
      this.pitch = Math.max(-1.2, Math.min(1.2, drag.pitch + (e.clientY - drag.y) * 0.01));
    });
    // double-tap: hide / show the readouts and their lines (just the bird)
    // 3D starts with just the bird; double-tap shows the readouts (the choice is remembered)
    try { this.showInfo = localStorage.getItem('carol-3d-readouts') === 'on'; } catch { this.showInfo = false; }
    let lastTap = 0;
    const up = (e) => {
      pts.delete(e.pointerId); this._pd = null;
      if (pts.size === 0) {
        if (drag && drag.moved < 10) {
          const now = performance.now();
          if (now - lastTap < 330) { this.showInfo = !this.showInfo; lastTap = 0; this.hintAt = 0; try { localStorage.setItem('carol-3d-readouts', this.showInfo ? 'on' : 'off'); } catch {} this.onInfo && this.onInfo(this.showInfo); }
          else lastTap = now;
        }
        this.lastDrag = drag; drag = null;
      }
    };
    canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('wheel', (e) => { e.preventDefault(); this.dist = Math.min(2, Math.max(0.5, this.dist * (e.deltaY > 0 ? 1.08 : 0.93))); }, { passive: false });
  }
  upload(m) {
    const gl = this.gl;
    const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(m.v), gl.STATIC_DRAW);
    const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(m.idx), gl.STATIC_DRAW);
    return { vb, ib, n: m.idx.length, lines: !!m.lines };
  }
  resize() {
    const r = this.cv.getBoundingClientRect(), d = Math.min(1.5, devicePixelRatio || 1);
    this.cv.width = Math.max(1, r.width * d); this.cv.height = Math.max(1, r.height * d);
    if (this.ov) { this.ov.width = this.cv.width; this.ov.height = this.cv.height; this.dpr = d; }
  }
  draw(model, dt, tele) {
    if (!this.ok) return;
    if (this.style === 4) return this.drawScan(model, dt, tele);
    if (this._ovOn) { this.ov.getContext('2d').clearRect(0, 0, this.ov.width, this.ov.height); this._ovOn = false; }
    const gl = this.gl, W = this.cv.width, H = this.cv.height;
    if (this.auto) this.yaw += dt * 0.25;
    gl.viewport(0, 0, W, H);
    if (this.style === 3) gl.clearColor(0.043, 0.067, 0.086, 1); else gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST); gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    // frame this bird: centre and size from its parts (eased, so a new bird glides into place)
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (const p of model.parts) {
      const q = p.kind === 'ell' ? [[p.c[0] - p.r[0], p.c[1] - p.r[1]], [p.c[0] + p.r[0], p.c[1] + p.r[1]]] : p.kind === 'tube' ? p.pts : [p.base, p.tip];
      for (const v of q) { x0 = Math.min(x0, v[0]); x1 = Math.max(x1, v[0]); y0 = Math.min(y0, v[1]); y1 = Math.max(y1, v[1]); }
    }
    const fr = { c: [(x0 + x1) / 2, (y0 + y1) / 2, 0], r: Math.max(x1 - x0, (y1 - y0) * 1.2) / 2 };
    if (!this.frame || this.snap) { this.frame = fr; this.snap = false; }
    else { for (let i = 0; i < 2; i++) this.frame.c[i] += (fr.c[i] - this.frame.c[i]) * 0.2; this.frame.r += (fr.r - this.frame.r) * 0.2; }
    const asp = W / H, tgt = this.frame.c, R = this.frame.r * (asp < 1.2 ? (this.style === 4 && asp < 0.87 ? 2.45 : 2.9) / asp : 2.4) * this.dist;
    const eye = [tgt[0] + R * Math.cos(this.pitch) * Math.sin(this.yaw), tgt[1] + R * Math.sin(this.pitch), tgt[2] + R * Math.cos(this.pitch) * Math.cos(this.yaw)];
    const VP = m4.mul(m4.persp(0.75, W / H, 1, 120), m4.look(eye, tgt, [0, 1, 0]));
    gl.uniformMatrix4fv(this.loc.VP, false, VP); gl.uniform3fv(this.loc.eye, eye); gl.uniform1f(this.loc.mode, this.style); gl.uniform1f(this.loc.enh, this.enhance ? 1 : 0);
    const items = [];
    const st = this.style, solid = st === 1 || st === 2;
    for (const p of model.parts) {
      // solid and toon: the skin is opaque, so the organs only show when you pick a part
      if (solid && p.layer > 0 && !(this.sel && p.part === this.sel) && p.part !== 'beak' && p.part !== 'eye' && p.part !== 'markings') continue;
      for (const it of this.instances(p)) items.push(it);
    }
    if (this.enhance && st === 0) {
      // a highlight in each eye (no branch in 3D: the bird stands free)
      for (const e of model.parts.filter((p) => p.part === 'eye' && p.kind === 'ell')) {
        const r = e.r[0] * 0.32, ax = [r, 0, 0], ay = [0, r, 0], az = [0, 0, r];
        const c = [e.c[0] + e.r[0] * 0.35, e.c[1] + e.r[1] * 0.4, e.c[2] + Math.sign(e.c[2] || 1) * e.r[2] * 0.75];
        items.push({ mesh: 'sph', M: m4.basis(ax, ay, az, c), N: normalMat(ax, ay, az), col: [1, 1, 1], a: 0.95, glow: 0, c });
      }
    }
    // toon: an ink outline round the skin (each skin shape drawn slightly larger, back faces only, in near-black)
    if (st === 2) for (const it of items.filter((i) => i.skin)) {
      const M = it.M.slice(), c = it.c, k = 1.045;
      for (const j of [0, 1, 2, 4, 5, 6, 8, 9, 10]) M[j] *= k;
      items.unshift({ ...it, M, col: [0.09, 0.07, 0.06], a: 1, glow: 0, outline: true });
    }
    // air particles: small glowing spheres, drawn with the translucent parts
    const airItems = [];
    for (const a of (st === 1 || st === 2 ? [] : model.air || [])) {
      const r = a.r * 1.4, ax = [r, 0, 0], ay = [0, r, 0], az = [0, 0, r];
      airItems.push({ mesh: 'sph', M: m4.basis(ax, ay, az, a.c), N: normalMat(ax, ay, az), col: a.hiss ? [1, 1, 1] : [0.8, 0.92, 1], a: Math.min(0.9, a.a), glow: 0, c: a.c });
    }
    // opaque inner first, then translucent sorted back to front
    const opaque = items.filter((i) => i.a >= 0.99), trans = items.filter((i) => i.a < 0.99);
    const depth = (i) => -dot(sub(i.c, eye), sub(tgt, eye));
    trans.sort((a, b) => depth(a) - depth(b));
    gl.depthMask(true); gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK);
    for (const i of opaque) this.drawItem(i);
    gl.depthMask(false);
    for (const i of trans) this.drawItem(i);
    // the air shows through the skin, like an X-ray (drawn last, not hidden by the body)
    gl.disable(gl.DEPTH_TEST);
    for (const i of airItems) this.drawItem(i);
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
  }
  /** 3D wing: the body's own surface, raised a little and cut to the wing's outline (the 2D model's wing is a flat
   *  plate, which pokes out of the body where it curves away). Lifts a touch while the bird sings. */
  wingInstance(p, body) {
    const lift = 1.035 + Math.max(0, Math.abs(p.c[2]) / body.r[2] - 0.72) * 0.25;
    const c = Math.cos(body.rot || 0), s = Math.sin(body.rot || 0);
    const ax = [c * body.r[0] * lift, s * body.r[0] * lift, 0], ay = [-s * body.r[1] * lift, c * body.r[1] * lift, 0], az = [0, 0, body.r[2] * lift];
    return { mesh: 'sph', M: m4.basis(ax, ay, az, body.c), N: normalMat(ax, ay, az), col: hexRGB(p.color), a: 1, glow: this.sel === 'wing' ? 1 : 0, c: p.c, skin: true, part: 'wing',
      wmask: { c: [p.c[0], p.c[1]], r: [p.r[0], p.r[1]], rot: p.rot || 0, side: Math.sign(p.c[2]) || 1 } };
  }
  instances(p) {
    if (p.wing && this.style === 4 && this._body) return [this.wingInstance(p, this._body)];
    const skin = p.layer === 0, st = this.style;
    const a = skin ? (st === 1 || st === 2 ? 1 : p.wing ? 0.55 : 0.45) : (p.alpha ?? 1);
    const glow = this.sel && p.part === this.sel ? 1 : 0;
    const col = hexRGB(p.color);
    if (p.kind === 'ell') {
      const c = Math.cos(p.rot || 0), s = Math.sin(p.rot || 0);
      let ax = [c * p.r[0], s * p.r[0], 0], ay = [-s * p.r[1], c * p.r[1], 0], az = [0, 0, p.r[2]];
      if (p.yaw) {   // turn about the vertical: the wing's front edge tucks towards the body
        const cy = Math.cos(p.yaw), sy = Math.sin(p.yaw), ry = (a) => [a[0] * cy + a[2] * sy, a[1], -a[0] * sy + a[2] * cy];
        ax = ry(ax); ay = ry(ay); az = ry(az);
      }
      return [{ mesh: 'sph', M: m4.basis(ax, ay, az, p.c), N: normalMat(ax, ay, az), col, a, glow, c: p.c, skin, part: p.part }];
    }
    if (p.kind === 'cone') {
      const d = sub(p.tip, p.base), up = [0, 1, 0];
      const az = mul3(norm(cross(d, up)), p.w), ay = mul3(norm(cross(az, d)), p.h);
      return [{ mesh: 'cone', M: m4.basis(d, ay, az, p.base), N: normalMat(d, ay, az), col, a, glow, c: p.base, skin }];
    }
    const out = [];
    for (let k = 1; k < p.pts.length; k++) {
      const a0 = p.pts[k - 1], d = sub(p.pts[k], a0);
      const ref = Math.abs(d[1]) > 0.9 * Math.hypot(...d) ? [1, 0, 0] : [0, 1, 0];
      const az = mul3(norm(cross(d, ref)), p.r), ay = mul3(norm(cross(az, d)), p.r);
      const dd = mul3(d, 1.08); // slight overlap hides joints
      out.push({ mesh: 'cyl', M: m4.basis(dd, ay, az, a0), N: normalMat(dd, ay, az), col, a, glow, c: a0, skin });
      out.push({ mesh: 'sph', M: m4.basis(mul3(norm(d), p.r), ay, az, a0), N: normalMat(mul3(norm(d), p.r), ay, az), col, a, glow, c: a0, skin });
    }
    return out;
  }
  drawItem(i) {
    const gl = this.gl, m = this.mesh[i.mesh];
    gl.bindBuffer(gl.ARRAY_BUFFER, m.vb); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, m.ib);
    gl.enableVertexAttribArray(this.ap); gl.vertexAttribPointer(this.ap, 3, gl.FLOAT, false, 24, 0);
    gl.enableVertexAttribArray(this.an); gl.vertexAttribPointer(this.an, 3, gl.FLOAT, false, 24, 12);
    gl.uniformMatrix4fv(this.loc.M, false, i.M); gl.uniformMatrix3fv(this.loc.N, false, i.N);
    gl.uniform3fv(this.loc.col, i.col); gl.uniform1f(this.loc.a, i.a); gl.uniform1f(this.loc.glow, i.glow);
    gl.uniform1f(this.loc.skin, i.skin && !i.outline ? 1 : 0);
    if (i.outline) { gl.enable(gl.CULL_FACE); gl.cullFace(this.outlineCull === 'back' ? gl.BACK : gl.FRONT); }
    else if (i.nocull) gl.disable(gl.CULL_FACE);
    else { gl.cullFace(gl.BACK); if (i.mesh === 'sph' && i.a < 0.99) gl.enable(gl.CULL_FACE); else gl.disable(gl.CULL_FACE); }
    gl.uniform1f(this.loc.line, m.lines ? 1 : 0);
    if (i.wmask) { gl.uniform4f(this.loc.wm, i.wmask.c[0], i.wmask.c[1], i.wmask.r[0], i.wmask.r[1]); gl.uniform1f(this.loc.wrot, i.wmask.rot); gl.uniform1f(this.loc.wside, i.wmask.side); }
    else gl.uniform1f(this.loc.wside, 0);
    gl.drawElements(m.lines ? gl.LINES : gl.TRIANGLES, m.n, gl.UNSIGNED_SHORT, 0);
  }
  /** Tall panels: the readout box at the bottom (snug), and the space left above it for the bird. */
  tallBox(W, H) {
    const d = this.dpr || 1, cw = W / d, ch = H / d;
    if (!(this.style === 4 && this.showInfo && ch > cw * 1.15)) return null;
    const cols = cw >= 250 ? 2 : 1, kk = ch > 700 ? 1.2 : 1, rowH = 50 * kk * d, n = Math.ceil(5 / cols);
    const h = n * rowH + 16 * d, m = 10 * d;
    return { cols, kk, rowH, n, x: m, y: H - m - h, w: W - 2 * m, h };
  }
  /** Camera for this frame (shared by both draw paths): frames the bird, returns {eye, tgt, VP}. */
  camera(model, dt) {
    const W = this.cv.width, H = this.cv.height;
    if (this.auto) this.yaw += dt * 0.25;
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (const p of model.parts) {
      const q = p.kind === 'ell' ? [[p.c[0] - p.r[0], p.c[1] - p.r[1]], [p.c[0] + p.r[0], p.c[1] + p.r[1]]] : p.kind === 'tube' ? p.pts : [p.base, p.tip];
      for (const v of q) { x0 = Math.min(x0, v[0]); x1 = Math.max(x1, v[0]); y0 = Math.min(y0, v[1]); y1 = Math.max(y1, v[1]); }
    }
    const fr = { c: [(x0 + x1) / 2, (y0 + y1) / 2, 0], r: Math.max(x1 - x0, (y1 - y0) * 1.2) / 2, y0 };
    if (!this.frame || this.snap) { this.frame = fr; this.snap = false; }
    else { for (let i = 0; i < 2; i++) this.frame.c[i] += (fr.c[i] - this.frame.c[i]) * 0.2; this.frame.r += (fr.r - this.frame.r) * 0.2; this.frame.y0 = fr.y0; }
    const asp = W / H, tgt = this.frame.c, R = this.frame.r * (asp < 1.2 ? 2.9 / asp : 2.4) * this.dist;
    const eye = [tgt[0] + R * Math.cos(this.pitch) * Math.sin(this.yaw), tgt[1] + R * Math.sin(this.pitch), tgt[2] + R * Math.cos(this.pitch) * Math.cos(this.yaw)];
    let VP = m4.mul(m4.persp(0.75, W / H, 1, 120), m4.look(eye, tgt, [0, 1, 0]));
    if (this.style === 4) {
      // centre what's actually on screen: the bird's projected extent, moved (smoothly) to the middle of the panel,
      // or of the space above the readout box
      const box = this.tallBox(W, H);
      let nx0 = 1e9, nx1 = -1e9, ny0 = 1e9, ny1 = -1e9;
      const P = (c) => { const x = VP[0] * c[0] + VP[4] * c[1] + VP[8] * c[2] + VP[12], y = VP[1] * c[0] + VP[5] * c[1] + VP[9] * c[2] + VP[13], w = VP[3] * c[0] + VP[7] * c[1] + VP[11] * c[2] + VP[15];
        nx0 = Math.min(nx0, x / w); nx1 = Math.max(nx1, x / w); ny0 = Math.min(ny0, y / w); ny1 = Math.max(ny1, y / w); };
      for (const p of model.parts) {
        if (p.layer !== 0 && p.part !== 'beak') continue;
        if (p.kind === 'ell') { for (const sx of [-1, 1]) { P([p.c[0] + sx * p.r[0], p.c[1], p.c[2]]); P([p.c[0], p.c[1] + sx * p.r[1], p.c[2]]); P([p.c[0], p.c[1], p.c[2] + sx * p.r[2]]); } }
        else if (p.kind === 'cone') { P(p.base); P(p.tip); } else for (const q of p.pts) P(q);
      }
      if (nx1 > nx0) {
        const ty = box ? 1 - box.y / H : 0;                       // where the centre should go (NDC y)
        const want = [-(nx0 + nx1) / 2, ty - (ny0 + ny1) / 2];
        if (!this.ndc || this.snap2) { this.ndc = want; this.snap2 = false; }
        else { this.ndc[0] += (want[0] - this.ndc[0]) * 0.15; this.ndc[1] += (want[1] - this.ndc[1]) * 0.15; }
        const T = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, this.ndc[0], this.ndc[1], 0, 1]); VP = m4.mul(T, VP);
      }
    }
    return { eye, tgt, VP, R };
  }
  /** Scan style: the skin as cross-section rings, organs inside, depth fade, floor grid, live readouts. */
  drawScan(model, dt, tele) {
    const gl = this.gl, W = this.cv.width, H = this.cv.height;
    const { eye, tgt, VP, R } = this.camera(model, dt);
    gl.viewport(0, 0, W, H);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
    gl.uniformMatrix4fv(this.loc.VP, false, VP); gl.uniform3fv(this.loc.eye, eye); gl.uniform1f(this.loc.mode, 4); gl.uniform1f(this.loc.enh, 0);
    gl.uniform1f(this.loc.fogN, R * 0.75); gl.uniform1f(this.loc.fogF, R * 1.45);
    const outside = (p) => p.layer === 0 || ['beak', 'markings', 'crest', 'streamers'].includes(p.part);
    this._body = model.parts.find((p) => p.id === 'body');
    const skinParts = model.parts.filter((p) => outside(p) && p.part !== 'eye');
    const inner = model.parts.filter((p) => !outside(p) && p.part !== 'eye');
    const lineOf = { sph: 'lsph', cyl: 'lcyl', cone: 'lcone' };
    gl.depthMask(false);
    // organs: translucent fills, then their rings
    const org = []; for (const p of inner) for (const it of this.instances(p)) org.push(it);
    const depth = (i) => -dot(sub(i.c, eye), sub(tgt, eye));
    org.sort((a, b) => depth(a) - depth(b));
    for (const i of org) this.drawItem({ ...i, a: Math.max(0.35, i.a * 0.8) });
    for (const i of org) if (lineOf[i.mesh] && i.mesh !== 'cyl') this.drawItem({ ...i, mesh: lineOf[i.mesh] });
    // windpipe cartilage rings, one per ring the model gives
    for (const p of inner.filter((q) => q.part === 'trachea' && q.kind === 'tube')) {
      for (let k = 1; k < p.pts.length; k++) {
        const a0 = p.pts[k - 1], d = sub(p.pts[k], a0), ref = Math.abs(d[1]) > 0.9 * Math.hypot(...d) ? [1, 0, 0] : [0, 1, 0];
        const az = mul3(norm(cross(d, ref)), p.r * 1.15), ay = mul3(norm(cross(az, d)), p.r * 1.15);
        this.drawItem({ mesh: 'lcyl', M: m4.basis(d, ay, az, a0), N: normalMat(d, ay, az), col: [0.95, 0.9, 0.78], a: 1, glow: 0, c: a0 });
      }
    }
    // skin: depth only (so only the front surface's rings show), then rings, then a faint rim glow
    gl.clear(gl.DEPTH_BUFFER_BIT);
    const skin = []; for (const p of skinParts) for (const it of this.instances(p)) skin.push(it);
    for (const i of skin) if (i.part === 'markings') { i.M = i.M.slice(); for (const j of [0, 1, 2, 4, 5, 6, 8, 9, 10]) i.M[j] *= 1.1; }
    // draw markings last within each pass, so where they meet the body they win
    skin.sort((a, b) => (a.part === 'markings') - (b.part === 'markings'));
    // (pushed back a little, so rings lying on the surface always pass)
    gl.colorMask(false, false, false, false); gl.depthMask(true); gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(2, 4);
    for (const i of skin) this.drawItem({ ...i, a: 1 });
    gl.colorMask(true, true, true, true); gl.depthMask(false);
    // the plumage: each skin shape's front surface in its own colour, mostly opaque (organs show faintly through;
    // a tapped part shows clearly)
    const see = this.sel && !['body', 'head', 'neck', 'wing', 'tail', 'legs'].includes(this.sel);
    for (const i of skin) this.drawItem({ ...i, a: see ? 0.35 : (i.part === 'markings' ? 0.8 : 0.72), skin: true, nocull: true });
    gl.disable(gl.POLYGON_OFFSET_FILL);
    for (const i of skin) {
      const mk = i.part === 'markings', col = mk ? i.col.map((v, k) => v * 0.7 + [0.95, 0.92, 0.86][k] * 0.3) : i.col;
      this.drawItem({ ...i, mesh: lineOf[i.mesh], skin: !mk, col });
    }
    // the eyes: solid, in the bird's eye colour, with a highlight (the far one hides behind the head)
    // the eye facing the camera, drawn over the skin (it sits partly inside the head shape)
    const eyes = model.parts.filter((q) => q.part === 'eye' && q.kind === 'ell');
    const dist = (q) => Math.hypot(q.c[0] - eye[0], q.c[1] - eye[1], q.c[2] - eye[2]);
    const nearEye = eyes.sort((x, y) => dist(x) - dist(y)).slice(0, Math.abs(Math.sin(this.yaw)) > 0.92 ? 2 : 1);
    gl.disable(gl.DEPTH_TEST);
    for (const p of nearEye) {
      const ax = [p.r[0], 0, 0], ay = [0, p.r[1], 0], az = [0, 0, p.r[2]];
      this.drawItem({ mesh: 'sph', M: m4.basis(ax, ay, az, p.c), N: normalMat(ax, ay, az), col: hexRGB(p.color), a: 1, glow: 0, c: p.c });
      const r = p.r[0] * 0.3, c = [p.c[0] + p.r[0] * 0.35, p.c[1] + p.r[1] * 0.4, p.c[2] + Math.sign(p.c[2] || 1) * p.r[2] * 0.75];
      this.drawItem({ mesh: 'sph', M: m4.basis([r, 0, 0], [0, r, 0], [0, 0, r], c), N: normalMat([r, 0, 0], [0, r, 0], [0, 0, r]), col: [1, 1, 1], a: 1, glow: 0, c });
    }
    // air
    gl.disable(gl.DEPTH_TEST);
    for (const a of model.air || []) {
      const r = a.r * 0.8, ax = [r, 0, 0], ay = [0, r, 0], az = [0, 0, r];
      this.drawItem({ mesh: 'sph', M: m4.basis(ax, ay, az, a.c), N: normalMat(ax, ay, az), col: [0.85, 0.95, 1], a: Math.min(0.95, a.a * 1.1), glow: 0, c: a.c });
    }
    gl.enable(gl.DEPTH_TEST); gl.depthMask(true);
    this.readouts(model, VP, tele);
  }
  /** Live numbers for the organs, colour-coded to match each organ (the scan style). */
  readouts(model, VP, tele) {
    const ov = this.ov, ctx = ov.getContext('2d'), W = ov.width, H = ov.height, d = this.dpr || 1;
    this._ovOn = true;
    ctx.clearRect(0, 0, W, H);
    // a quiet hint for a few seconds after opening 3D with the readouts hidden
    const hint = this.hintAt ? (performance.now() - this.hintAt) / 1000 : 9;
    if (!this.showInfo && hint < 4) {
      const a = Math.min(1, hint / 0.4, (4 - hint) / 0.8) * 0.55;
      ctx.globalAlpha = a; ctx.fillStyle = '#f1ece2'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `700 ${Math.round(10 * d)}px CarolLabel, sans-serif`;
      ctx.fillText('DOUBLE-TAP FOR INFO', W / 2, 66 * d);
      ctx.globalAlpha = 1; ctx.textAlign = 'left';
    }
    if (!tele || !this.showInfo) return;
    const proj = (c) => { const x = VP[0] * c[0] + VP[4] * c[1] + VP[8] * c[2] + VP[12], y = VP[1] * c[0] + VP[5] * c[1] + VP[9] * c[2] + VP[13], w = VP[3] * c[0] + VP[7] * c[1] + VP[11] * c[2] + VP[15]; return [(x / w * 0.5 + 0.5) * W, (0.5 - y / w * 0.5) * H]; };
    const find = (part) => model.parts.find((p) => p.part === part);
    const centre = (p) => p ? (p.kind === 'ell' ? p.c : p.kind === 'cone' ? p.tip : p.pts[Math.floor(p.pts.length / 2)]) : null;
    const sing = tele[0] > 0.5, f0 = tele[3], kHz = (v) => v >= 1000 ? (v / 1000).toFixed(2) + ' kHz' : Math.round(v) + ' Hz';
    const sac = find('sac');
    // the colour system: each readout wears its organ's colour
    const rows = [
      { name: 'SYRINX', short: 'PITCH', col: '#ffc36a', at: model.syr, v: sing ? kHz(f0) : 'resting', sub: 'tension ' + (tele[2] ?? 0).toFixed(2) },
      { name: 'AIR SACS', short: 'PRESSURE', sv: sing ? (tele[1] ?? 0).toFixed(2) : 'rest', col: '#9fd3ff', at: centre(find('airsacs')), v: sing ? 'pressure ' + (tele[1] ?? 0).toFixed(2) : 'at rest' },
      { name: sac ? 'NECK SAC' : 'THROAT', col: sac ? '#c9a3ec' : '#f4b9a2', at: centre(find('oec')) || centre(sac), v: tele[9] > 0 ? kHz(tele[9]) : '—', sub: 'resonance' },
      { name: 'MOUTH', short: 'MOUTH F1', sv: tele[10] > 0 ? kHz(tele[10]) : '—', col: '#f09ab4', at: centre(find('tongue')), v: tele[10] > 0 ? 'F1 ' + kHz(tele[10]) : '—', sub: tele[11] > 0 ? 'F2 ' + kHz(tele[11]) : null },
      { name: 'BEAK', short: 'GAPE', sv: Math.round((tele[8] ?? 0) * 100) + '%', col: '#efe4cc', at: centre(find('beak')), v: 'gape ' + Math.round((tele[8] ?? 0) * 100) + '%' },
    ].filter((r) => r.at);
    for (const r of rows) { const [px, py] = proj(r.at); r.px = px; r.py = py; r.vis = px > 0 && px < W && py > 0 && py < H; }
    const font = (w, px) => `${w} ${Math.round(px * d)}px CarolLabel, sans-serif`;
    const dot = (x, y, col, rad = 3.6) => { ctx.fillStyle = 'rgba(20,18,16,.85)'; ctx.beginPath(); ctx.arc(x, y, (rad + 1.6) * d, 0, 6.283); ctx.fill(); ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, rad * d, 0, 6.283); ctx.fill(); };
    const lead = (x0, y0, x1, y1, col) => { ctx.strokeStyle = col; ctx.globalAlpha = 0.5; ctx.lineWidth = 1.2 * d; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); ctx.globalAlpha = 1; };
    // one readout block: name in its colour, the value large, a small second line
    const block = (r, x, y, align, k = 1) => {
      ctx.textAlign = align; ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = r.col; ctx.font = font(700, 11 * k); ctx.fillText(r.name, x, y);
      ctx.fillStyle = '#f6efe2'; ctx.font = font(700, 16 * k); ctx.fillText(r.v, x, y + 18 * k * d);
      if (r.sub) { ctx.fillStyle = 'rgba(241,236,226,.62)'; ctx.font = font(400, 11 * k); ctx.fillText(r.sub, x, y + 32 * k * d); }
    };
    const panel = (x, y, w, h) => { ctx.fillStyle = 'rgba(30,27,24,.72)'; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, 6 * d) : ctx.rect(x, y, w, h); ctx.fill(); };
    const cw = W / d, ch = H / d;
    const tb = this.tallBox(W, H);
    if (tb) {
      // tall panel (iPad / Pi side panel): a snug box along the bottom, two columns, leader lines up to the organs
      const colW = (tb.w - 12 * d) / tb.cols;
      panel(tb.x, tb.y, tb.w, tb.h);
      rows.forEach((r, k) => {
        const cx = tb.x + 12 * d + (k % tb.cols) * colW, cy = tb.y + 22 * tb.kk * d + Math.floor(k / tb.cols) * tb.rowH;
        if (r.vis) lead(r.px, r.py, cx + 4 * d, cy - 4 * d, r.col);
        dot(cx + 4 * d, cy - 4 * d, r.col, 3);
        block(r, cx + 14 * d, cy, 'left', tb.kk);
      });
    } else if (cw >= 560) {
      // wide: two fixed panels at the sides (throat, syrinx, air sacs on the left; mouth, beak on the right),
      // rows on a fixed grid; only the coloured lines move with the bird
      const colW = 150 * d, rowH = 58 * d, padX = 14 * d;
      const left = rows.filter((r) => ['THROAT', 'NECK SAC', 'SYRINX', 'AIR SACS'].includes(r.name)), right = rows.filter((r) => !left.includes(r));
      const order = { 'THROAT': 0, 'NECK SAC': 0, 'SYRINX': 1, 'AIR SACS': 2, 'MOUTH': 0, 'BEAK': 1 };
      for (const [side, list] of [[0, left], [1, right]]) {
        list.sort((a, b) => order[a.name] - order[b.name]);
        const top = Math.round(H * 0.42 - Math.max(left.length, right.length) * rowH / 2), x = side ? W - colW - 16 * d : 16 * d;
        const h = list.reduce((a, r, k) => a + (k < list.length - 1 ? rowH : (r.sub ? 46 : 32) * d), 0);
        if (list.length) panel(x, top, colW, h + 12 * d);
        list.forEach((r, k) => {
          const ry = top + k * rowH + 20 * d, ex = side ? x : x + colW;
          if (r.vis) lead(r.px, r.py, ex, ry - 4 * d, r.col);
          dot(ex, ry - 4 * d, r.col, 2.6);
          block(r, side ? x + padX : x + colW - padX, ry, side ? 'left' : 'right');
        });
      }
    } else {
      // short and narrow (phones): a slim strip along the bottom (left of the size buttons), short names,
      // coloured dots on the organs
      const cols = 3, x0 = 8 * d, colW = Math.max(64 * d, (W - 150 * d - x0) / cols), rowH = 30 * d, n = Math.ceil(rows.length / cols);
      const y0 = H - 8 * d - n * rowH;
      panel(x0 - 4 * d, y0 - 4 * d, cols * colW + 4 * d, n * rowH + 6 * d);
      rows.forEach((r, k) => {
        const cx = x0 + (k % cols) * colW, cy = y0 + Math.floor(k / cols) * rowH;
        ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
        dot(cx + 5 * d, cy + 8 * d, r.col, 2.6);
        ctx.fillStyle = r.col; ctx.font = font(700, 9); ctx.fillText(r.short || r.name, cx + 12 * d, cy + 11 * d);
        ctx.fillStyle = '#f6efe2'; ctx.font = font(700, 12); ctx.fillText(r.sv || r.v, cx + 12 * d, cy + 25 * d);
      });
    }
    // a coloured dot on each organ
    for (const r of rows) if (r.vis) dot(r.px, r.py, r.col);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  }
}
function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function mul3(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }
