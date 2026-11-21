//! Labial oscillator: the normal-form syrinx model from Gabriel Mindlin's lab
//! (Amador, Perl, Mindlin & Margoliash 2013; Mindlin 2017 review), written in
//! normalised time tau = gamma * t:
//!
//!   x' = y
//!   y' = -a - b x - x^3 + x^2 - x^2 y - x y
//!
//! `a` grows with air-sac pressure, `b` with labial tension. Because the
//! equations are scale-free in time, the oscillation frequency is exactly
//! gamma * w(a, b) / 2pi. The table below stores w(a, b), the oscillation
//! amplitude, and the onset threshold a_c(b), so the synth can choose gamma
//! for an exact pitch while (a, b) still decide the physics: tonal Hopf
//! oscillation at high tension, buzzy saddle-node (relaxation) pulses at low.

pub const B_MIN: f64 = -0.6;
pub const B_MAX: f64 = 0.9;
pub const U_MIN: f64 = -0.04;
pub const U_MAX: f64 = 0.9;
pub const NB: usize = 64;
pub const NU: usize = 48;

#[inline]
fn deriv(a: f64, b: f64, x: f64, y: f64) -> (f64, f64) {
    let x2 = x * x;
    (y, -a - b * x - x2 * x + x2 - x2 * y - x * y)
}

#[derive(Clone, Copy, Default)]
pub struct Osc { pub x: f64, pub y: f64 }

impl Osc {
    /// RK4 step of size h (normalised time).
    #[inline]
    pub fn step(&mut self, a: f64, b: f64, h: f64) {
        let (x, y) = (self.x, self.y);
        let (k1x, k1y) = deriv(a, b, x, y);
        let (k2x, k2y) = deriv(a, b, x + 0.5 * h * k1x, y + 0.5 * h * k1y);
        let (k3x, k3y) = deriv(a, b, x + 0.5 * h * k2x, y + 0.5 * h * k2y);
        let (k4x, k4y) = deriv(a, b, x + h * k3x, y + h * k3y);
        self.x = x + h / 6.0 * (k1x + 2.0 * k2x + 2.0 * k3x + k4x);
        self.y = y + h / 6.0 * (k1y + 2.0 * k2y + 2.0 * k3y + k4y);
        if !(self.x.is_finite() && self.y.is_finite()) || self.x.abs() > 50.0 {
            self.x = 0.0; self.y = 0.0;
        }
    }
    /// Advance by total normalised time `dt` with steps no longer than `hmax`.
    #[inline]
    pub fn advance(&mut self, a: f64, b: f64, dt: f64, hmax: f64) {
        let n = ((dt / hmax).ceil() as usize).clamp(1, 24);
        let h = dt / n as f64;
        for _ in 0..n { self.step(a, b, h); }
    }
}

pub struct Table {
    pub ac: Vec<f64>,   // NB: onset threshold of a for each b
    pub w: Vec<f64>,    // NB*NU angular frequency (normalised), 0 = no oscillation
    pub amp: Vec<f64>,  // NB*NU half peak-to-peak of x
    pub mean: Vec<f64>, // NB*NU mean of x
}

fn measure(a: f64, b: f64, osc: &mut Osc, h: f64, settle: usize, len: usize) -> (f64, f64, f64) {
    for _ in 0..settle { osc.step(a, b, h); }
    let (mut mx, mut mn, mut sum) = (-1e9f64, 1e9f64, 0.0);
    let mut xs = Vec::with_capacity(len);
    for _ in 0..len { osc.step(a, b, h); mx = mx.max(osc.x); mn = mn.min(osc.x); sum += osc.x; xs.push(osc.x); }
    let mean = sum / len as f64;
    let amp = 0.5 * (mx - mn);
    if amp < 0.02 { return (0.0, amp, mean); }
    let hi = mean + 0.3 * amp; let lo = mean - 0.3 * amp;
    let mut armed = false; let mut first = -1.0; let mut last = -1.0; let mut n = 0;
    for (i, &x) in xs.iter().enumerate() {
        if x < lo { armed = true; }
        if armed && x > hi {
            armed = false;
            if first < 0.0 { first = i as f64; } else { n += 1; }
            last = i as f64;
        }
    }
    if n < 2 { return (0.0, amp, mean); }
    let w = 2.0 * core::f64::consts::PI * n as f64 / ((last - first) * h);
    (w, amp, mean)
}

pub fn b_at(i: usize) -> f64 { B_MIN + (B_MAX - B_MIN) * i as f64 / (NB - 1) as f64 }
pub fn u_at(j: usize) -> f64 { U_MIN + (U_MAX - U_MIN) * j as f64 / (NU - 1) as f64 }

impl Table {
    /// Numerically map the model. Sweeps pressure upward from rest for each
    /// tension, carrying the state, like a bird starting a note.
    pub fn build() -> Table {
        let h = 0.1;
        let mut ac = vec![0.0; NB];
        let mut w = vec![0.0; NB * NU];
        let mut amp = vec![0.0; NB * NU];
        let mut mean = vec![0.0; NB * NU];
        for i in 0..NB {
            let b = b_at(i);
            // threshold: coarse-to-fine upward sweep
            let mut osc = Osc { x: 1.5, y: 0.0 };
            let mut a = -0.4;
            let mut found = 1.5;
            while a < 1.5 {
                let (wv, _, _) = measure(a, b, &mut osc, h, 1500, 1500);
                if wv > 0.0 { found = a; break; }
                a += 0.01;
            }
            // refine between found-0.01 and found
            let (mut lo, mut hi) = (found - 0.01, found);
            for _ in 0..6 {
                let mid = 0.5 * (lo + hi);
                let mut o = Osc { x: 1.5, y: 0.0 };
                // settle at rest just below, then step to mid
                for _ in 0..3000 { o.step(lo - 0.02, b, h); }
                let (wv, _, _) = measure(mid, b, &mut o, h, 3000, 2000);
                if wv > 0.0 { hi = mid; } else { lo = mid; }
            }
            ac[i] = hi;
            let mut osc = Osc { x: 1.5, y: 0.0 };
            for _ in 0..3000 { osc.step(hi - 0.05, b, h); }
            for j in 0..NU {
                let u = u_at(j);
                let (wv, av, mv) = measure(hi + u, b, &mut osc, h, 2500, 2500);
                w[i * NU + j] = wv; amp[i * NU + j] = av; mean[i * NU + j] = mv;
            }
        }
        Table { ac, w, amp, mean }
    }

    pub fn to_bytes(&self) -> Vec<u8> {
        let mut out = Vec::new();
        for v in self.ac.iter().chain(self.w.iter()).chain(self.amp.iter()).chain(self.mean.iter()) {
            out.extend_from_slice(&(*v as f32).to_le_bytes());
        }
        out
    }
    pub fn from_bytes(b: &[u8]) -> Option<Table> {
        let n = NB + 3 * NB * NU;
        if b.len() != n * 4 { return None; }
        let f: Vec<f64> = b.chunks(4).map(|c| f32::from_le_bytes([c[0], c[1], c[2], c[3]]) as f64).collect();
        Some(Table {
            ac: f[0..NB].to_vec(),
            w: f[NB..NB + NB * NU].to_vec(),
            amp: f[NB + NB * NU..NB + 2 * NB * NU].to_vec(),
            mean: f[NB + 2 * NB * NU..].to_vec(),
        })
    }
    pub fn embedded() -> Table {
        Table::from_bytes(include_bytes!("table.bin")).unwrap_or_else(Table::build)
    }

    #[inline]
    fn bi(&self, b: f64) -> (usize, f64) {
        let t = ((b - B_MIN) / (B_MAX - B_MIN) * (NB - 1) as f64).clamp(0.0, (NB - 1) as f64 - 1e-9);
        let i = t as usize; (i, t - i as f64)
    }
    #[inline]
    pub fn threshold(&self, b: f64) -> f64 {
        let (i, f) = self.bi(b);
        self.ac[i] + (self.ac[i + 1] - self.ac[i]) * f
    }
    #[inline]
    fn grid(&self, v: &[f64], u: f64, b: f64) -> f64 {
        let (i, fb) = self.bi(b);
        let t = ((u - U_MIN) / (U_MAX - U_MIN) * (NU - 1) as f64).clamp(0.0, (NU - 1) as f64 - 1e-9);
        let j = t as usize; let fu = t - j as f64;
        let g = |ii: usize, jj: usize| v[ii * NU + jj];
        let a0 = g(i, j) + (g(i, j + 1) - g(i, j)) * fu;
        let a1 = g(i + 1, j) + (g(i + 1, j + 1) - g(i + 1, j)) * fu;
        a0 + (a1 - a0) * fb
    }
    /// Angular frequency at u = a - a_c(b). Never returns below `floor`.
    #[inline]
    pub fn omega(&self, u: f64, b: f64, floor: f64) -> f64 {
        // above threshold only; below it, use the onset value
        let uu = u.max(0.0);
        self.grid(&self.w, uu, b).max(floor)
    }
    #[inline] pub fn amplitude(&self, u: f64, b: f64) -> f64 { self.grid(&self.amp, u.max(0.0), b) }
    #[inline] pub fn mean_x(&self, u: f64, b: f64) -> f64 { self.grid(&self.mean, u, b) }
}
