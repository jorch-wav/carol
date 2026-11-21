// 3D view of the shared bird model. Plain WebGL 1, three tiny meshes, no libraries.
import { hexRGB } from './birdmodel.js';

const VS = `attribute vec3 p; attribute vec3 n; uniform mat4 M, VP; uniform mat3 N; varying vec3 vn; varying vec3 vw;
void main(){ vec4 w = M * vec4(p,1.); vw = w.xyz; vn = normalize(N * n); gl_Position = VP * w; }`;
const FS = `precision mediump float; varying vec3 vn; varying vec3 vw; uniform vec3 col, eye; uniform float a, glow;
void main(){ vec3 n = normalize(vn); vec3 l = normalize(vec3(.5,.8,.6)); vec3 v = normalize(eye - vw);
 float d = max(dot(n,l),0.)*.75 + .3; float r = pow(1.-max(dot(n,v),0.),2.5);
 float sp = pow(max(dot(reflect(-l,n),v),0.),24.)*.25;
 vec3 c = col*d + sp + r*.25*col + glow*vec3(1.,.75,.3)*r*1.5;
 gl_FragColor = vec4(c, a + r*a*.6); }`;

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
    this.loc = {}; for (const k of ['M', 'VP', 'N', 'col', 'eye', 'a', 'glow']) this.loc[k] = gl.getUniformLocation(pr, k);
    this.ap = gl.getAttribLocation(pr, 'p'); this.an = gl.getAttribLocation(pr, 'n');
    this.mesh = { sph: this.upload(sphere()), cyl: this.upload(cylinder()), cone: this.upload(cone()) };
    this.yaw = 0.5; this.pitch = 0.15; this.dist = 1; this.auto = false; this.sel = null;
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
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
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
    gl.uniformMatrix4fv(this.loc.VP, false, VP); gl.uniform3fv(this.loc.eye, eye);
    const items = [];
    for (const p of model.parts) for (const it of this.instances(p)) items.push(it);
    // air particles: small glowing spheres, drawn with the translucent parts
    const airItems = [];
    for (const a of model.air || []) {
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
    const skin = p.layer === 0, a = skin ? (p.wing ? 0.55 : 0.45) : (p.alpha ?? 1);
    const glow = this.sel && p.part === this.sel ? 1 : 0;
    const col = hexRGB(p.color);
    if (p.kind === 'ell') {
      const c = Math.cos(p.rot || 0), s = Math.sin(p.rot || 0);
      const ax = [c * p.r[0], s * p.r[0], 0], ay = [-s * p.r[1], c * p.r[1], 0], az = [0, 0, p.r[2]];
      return [{ mesh: 'sph', M: m4.basis(ax, ay, az, p.c), N: normalMat(ax, ay, az), col, a, glow, c: p.c }];
    }
    if (p.kind === 'cone') {
      const d = sub(p.tip, p.base), up = [0, 1, 0];
      const az = mul3(norm(cross(d, up)), p.w), ay = mul3(norm(cross(az, d)), p.h);
      return [{ mesh: 'cone', M: m4.basis(d, ay, az, p.base), N: normalMat(d, ay, az), col, a, glow, c: p.base }];
    }
    const out = [];
    for (let k = 1; k < p.pts.length; k++) {
      const a0 = p.pts[k - 1], d = sub(p.pts[k], a0);
      const ref = Math.abs(d[1]) > 0.9 * Math.hypot(...d) ? [1, 0, 0] : [0, 1, 0];
      const az = mul3(norm(cross(d, ref)), p.r), ay = mul3(norm(cross(az, d)), p.r);
      const dd = mul3(d, 1.08); // slight overlap hides joints
      out.push({ mesh: 'cyl', M: m4.basis(dd, ay, az, a0), N: normalMat(dd, ay, az), col, a, glow, c: a0 });
      out.push({ mesh: 'sph', M: m4.basis(mul3(norm(d), p.r), ay, az, a0), N: normalMat(mul3(norm(d), p.r), ay, az), col, a, glow, c: a0 });
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
    if (i.mesh === 'sph' && i.a < 0.99) gl.enable(gl.CULL_FACE); else gl.disable(gl.CULL_FACE);
    gl.drawElements(gl.TRIANGLES, m.n, gl.UNSIGNED_SHORT, 0);
  }
}
function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function mul3(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }
