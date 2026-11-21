// 3D view of the shared bird model. Plain WebGL 1, three tiny meshes, no libraries.
import { hexRGB } from './birdmodel.js';

const VS = `attribute vec3 p; attribute vec3 n; uniform mat4 M, VP; uniform mat3 N; varying vec3 vn; varying vec3 vw;
void main(){ vec4 w = M * vec4(p,1.); vw = w.xyz; vn = normalize(N * n); gl_Position = VP * w; }`;
// mode: 0 glass (anatomy through translucent skin), 1 solid with soft light, 2 toon (bands + ink outline), 3 x-ray
const FS = `precision mediump float; varying vec3 vn; varying vec3 vw; uniform vec3 col, eye; uniform float a, glow, mode, skin, enh;
void main(){ vec3 n = normalize(vn); vec3 l = normalize(vec3(.5,.8,.6)); vec3 v = normalize(eye - vw);
 float nd = max(dot(n,l),0.); float r = pow(1.-max(dot(n,v),0.),2.5);
 float sp = pow(max(dot(reflect(-l,n),v),0.),24.)*.25;
 vec3 c; float al = a + r*a*.6;
 if (mode < .5 && enh > .5) { vec3 hemi = mix(vec3(.36,.33,.3), vec3(1.,.97,.92), n.y*.5+.5);
   c = col*(hemi*.4 + nd*.55) + sp*.55 + r*(col*.35 + vec3(.08,.07,.06)); al = skin > .5 ? a*1.3 + r*.2 : a + r*a*.4; }
 else if (mode < .5) { c = col*(nd*.75+.3) + sp + r*.25*col; }
 else if (mode < 1.5) { vec3 hemi = mix(vec3(.42,.38,.34), vec3(1.,.97,.92), n.y*.5+.5);
   c = col*(hemi*.55 + nd*.6) + sp*.6 + r*.35*vec3(1.,.9,.75); al = a; }
 else if (mode < 2.5) { float b = nd > .6 ? 1.05 : nd > .22 ? .78 : .52; c = col*b + step(.92, max(dot(reflect(-l,n),v),0.))*.25; al = a; }
 else { if (skin > .5) { c = vec3(.4,.8,1.)*(.15 + r*1.4); al = .02 + r*.5; } else { c = col*1.15 + r*.5; al = a; } }
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
    this.loc = {}; for (const k of ['M', 'VP', 'N', 'col', 'eye', 'a', 'glow', 'mode', 'skin', 'enh']) this.loc[k] = gl.getUniformLocation(pr, k);
    this.ap = gl.getAttribLocation(pr, 'p'); this.an = gl.getAttribLocation(pr, 'n');
    this.mesh = { sph: this.upload(sphere()), cyl: this.upload(cylinder()), cone: this.upload(cone()) };
    this.yaw = 0.5; this.pitch = 0.15; this.dist = 1; this.auto = false; this.sel = null;
    this.style = 0;   // 0 glass, 1 solid, 2 toon, 3 x-ray
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
    const up = (e) => { pts.delete(e.pointerId); this._pd = null; if (pts.size === 0) { this.lastDrag = drag; drag = null; } };
    canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('wheel', (e) => { e.preventDefault(); this.dist = Math.min(2, Math.max(0.5, this.dist * (e.deltaY > 0 ? 1.08 : 0.93))); }, { passive: false });
  }
  upload(m) {
    const gl = this.gl;
    const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(m.v), gl.STATIC_DRAW);
    const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(m.idx), gl.STATIC_DRAW);
    return { vb, ib, n: m.idx.length };
  }
  resize() {
    const r = this.cv.getBoundingClientRect(), d = Math.min(1.5, devicePixelRatio || 1);
    this.cv.width = Math.max(1, r.width * d); this.cv.height = Math.max(1, r.height * d);
  }
  draw(model, dt) {
    if (!this.ok) return;
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
    const asp = W / H, tgt = this.frame.c, R = this.frame.r * (asp < 1.2 ? 2.9 / asp : 2.4) * this.dist;
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
      // a branch under the feet and its soft shadow; a highlight in each eye
      const legs = model.parts.filter((p) => p.part === 'legs' && p.kind === 'tube');
      if (legs.length) {
        const feet = legs.map((l) => l.pts[l.pts.length - 1]), fy = Math.min(...feet.map((f) => f[1])) - 0.15;
        const fx = feet.reduce((a, f) => a + f[0], 0) / feet.length, body = model.parts.find((p) => p.id === 'body'), span = body ? body.r[0] * 2.4 : 8;
        for (const it of this.instances({ kind: 'tube', pts: [[fx - span * 0.6, fy - 0.2, -0.3], [fx, fy, 0.2], [fx + span * 0.55, fy - 0.1, 0.6]], r: 0.22, color: '#6b4e34', layer: 1, alpha: 1 })) items.push(it);
        const sr = [span * 0.45, 0.04, 1.6], sax = [sr[0], 0, 0], say = [0, sr[1], 0], saz = [0, 0, sr[2]], sc = [fx, fy - 0.3, 0.2];
        items.push({ mesh: 'sph', M: m4.basis(sax, say, saz, sc), N: normalMat(sax, say, saz), col: [0.05, 0.04, 0.03], a: 0.22, glow: 0, c: sc });
      }
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
  instances(p) {
    const skin = p.layer === 0, st = this.style;
    const a = skin ? (st === 1 || st === 2 ? 1 : p.wing ? 0.55 : 0.45) : (p.alpha ?? 1);
    const glow = this.sel && p.part === this.sel ? 1 : 0;
    const col = hexRGB(p.color);
    if (p.kind === 'ell') {
      const c = Math.cos(p.rot || 0), s = Math.sin(p.rot || 0);
      const ax = [c * p.r[0], s * p.r[0], 0], ay = [-s * p.r[1], c * p.r[1], 0], az = [0, 0, p.r[2]];
      return [{ mesh: 'sph', M: m4.basis(ax, ay, az, p.c), N: normalMat(ax, ay, az), col, a, glow, c: p.c, skin }];
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
    else { gl.cullFace(gl.BACK); if (i.mesh === 'sph' && i.a < 0.99) gl.enable(gl.CULL_FACE); else gl.disable(gl.CULL_FACE); }
    gl.drawElements(gl.TRIANGLES, m.n, gl.UNSIGNED_SHORT, 0);
  }
}
function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function mul3(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }
