//! Small DSP building blocks. Everything is f64 and allocation-free after init.

use core::f64::consts::PI;

#[derive(Clone, Copy, Default)]
pub struct Biquad {
    b0: f64, b1: f64, b2: f64, a1: f64, a2: f64,
    z1: f64, z2: f64,
}

impl Biquad {
    #[inline]
    pub fn run(&mut self, x: f64) -> f64 {
        let y = self.b0 * x + self.z1;
        self.z1 = self.b1 * x - self.a1 * y + self.z2;
        self.z2 = self.b2 * x - self.a2 * y;
        y
    }
    pub fn reset(&mut self) { self.z1 = 0.0; self.z2 = 0.0; }
    fn set(&mut self, b0: f64, b1: f64, b2: f64, a0: f64, a1: f64, a2: f64) {
        self.b0 = b0 / a0; self.b1 = b1 / a0; self.b2 = b2 / a0;
        self.a1 = a1 / a0; self.a2 = a2 / a0;
    }
    fn wcs(f: f64, fs: f64) -> (f64, f64) {
        let w = 2.0 * PI * (f / fs).clamp(1e-5, 0.49);
        (w.cos(), w.sin())
    }
    pub fn lowpass(&mut self, f: f64, q: f64, fs: f64) {
        let (c, s) = Self::wcs(f, fs);
        let al = s / (2.0 * q);
        self.set((1.0 - c) / 2.0, 1.0 - c, (1.0 - c) / 2.0, 1.0 + al, -2.0 * c, 1.0 - al);
    }
    pub fn highpass(&mut self, f: f64, q: f64, fs: f64) {
        let (c, s) = Self::wcs(f, fs);
        let al = s / (2.0 * q);
        self.set((1.0 + c) / 2.0, -(1.0 + c), (1.0 + c) / 2.0, 1.0 + al, -2.0 * c, 1.0 - al);
    }
    /// Band-pass with 0 dB peak gain.
    pub fn bandpass(&mut self, f: f64, q: f64, fs: f64) {
        let (c, s) = Self::wcs(f, fs);
        let al = s / (2.0 * q);
        self.set(al, 0.0, -al, 1.0 + al, -2.0 * c, 1.0 - al);
    }
}

/// One-pole low-pass / DC blocker helpers.
#[derive(Clone, Copy, Default)]
pub struct OnePole { pub a: f64, pub z: f64 }
impl OnePole {
    pub fn set_lp(&mut self, f: f64, fs: f64) { self.a = (-2.0 * PI * f / fs).exp(); }
    #[inline] pub fn lp(&mut self, x: f64) -> f64 { self.z = x + self.a * (self.z - x); self.z }
    #[inline] pub fn hp(&mut self, x: f64) -> f64 { x - self.lp(x) }
}

/// Fractional delay line (linear interpolation), power-of-two ring.
#[derive(Clone)]
pub struct Delay { buf: Vec<f64>, mask: usize, w: usize }
impl Delay {
    pub fn new(max: usize) -> Self {
        let n = max.next_power_of_two().max(4);
        Delay { buf: vec![0.0; n], mask: n - 1, w: 0 }
    }
    #[inline] pub fn push(&mut self, x: f64) { self.w = (self.w + 1) & self.mask; self.buf[self.w] = x; }
    /// Read `d` samples ago (d >= 1 when called after push for the newest-1).
    #[inline] pub fn read(&self, d: f64) -> f64 {
        let d = d.clamp(0.0, (self.mask - 2) as f64);
        let i = d as usize;
        let fr = d - i as f64;
        let a = self.buf[(self.w.wrapping_sub(i)) & self.mask];
        let b = self.buf[(self.w.wrapping_sub(i + 1)) & self.mask];
        a + (b - a) * fr
    }
    pub fn clear(&mut self) { for v in self.buf.iter_mut() { *v = 0.0; } }
}

/// xorshift noise in [-1, 1).
#[derive(Clone, Copy)]
pub struct Noise(pub u32);
impl Noise {
    #[inline] pub fn next(&mut self) -> f64 {
        let mut x = self.0; x ^= x << 13; x ^= x >> 17; x ^= x << 5; self.0 = x;
        (x as f64 / 2147483648.0) - 1.0
    }
}

/// 2x half-band decimator (windowed-sinc FIR, 31 taps).
#[derive(Clone)]
pub struct Decim2 { h: [f64; 31], z: [f64; 64], w: usize }
impl Decim2 {
    pub fn new() -> Self {
        let mut h = [0.0; 31];
        let m = 15.0;
        let mut sum = 0.0;
        for (i, v) in h.iter_mut().enumerate() {
            let n = i as f64 - m;
            let sinc = if n == 0.0 { 1.0 } else { (PI * n * 0.45).sin() / (PI * n * 0.45) };
            let win = 0.42 - 0.5 * (2.0 * PI * i as f64 / 30.0).cos() + 0.08 * (4.0 * PI * i as f64 / 30.0).cos();
            *v = sinc * win; sum += *v;
        }
        for v in h.iter_mut() { *v /= sum; }
        Decim2 { h, z: [0.0; 64], w: 0 }
    }
    /// Feed two input samples, get one output.
    #[inline] pub fn run(&mut self, a: f64, b: f64) -> f64 {
        self.w = (self.w + 1) & 31; self.z[self.w] = a; self.z[self.w + 32] = a;
        self.w = (self.w + 1) & 31; self.z[self.w] = b; self.z[self.w + 32] = b;
        // z[w+32-k] for k=0..30 is the k-th most recent sample
        let base = self.w + 32;
        let mut acc = 0.0;
        for k in 0..31 { acc += self.h[k] * self.z[base - k]; }
        acc
    }
    pub fn clear(&mut self) { self.z = [0.0; 64]; }
}
