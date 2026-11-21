// Find overlapping / clipped text across devices and birds: node overlap.mjs [birds,..]
import { createRequire } from 'module';
const require = createRequire('/home/audioview/src/chimera-vocal-synth/package.json');
const { chromium } = require('playwright-core');
const birds = (process.argv[2] || 'magpie,kookaburra,wattlebird,rosella,cardinal,robin,pigeon,quetzal').split(',');
const IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const devices = [
  ['pi', 1280, 720, false], ['iphone', 393, 659, true], ['iphone-pb', 393, 659, true, 'pb'], ['iphone-land', 852, 361, true],
  ['ipad', 820, 1180, true], ['ipad-land', 1180, 820, true], ['desktop', 1440, 900, false], ['small-phone', 360, 640, true],
];
const CHECK = () => {
  const vis = (e) => { const r = e.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return null; const s = getComputedStyle(e); if (s.visibility === 'hidden' || +s.opacity === 0) return null; for (let a = e; a; a = a.parentElement) if (a.hidden || getComputedStyle(a).display === 'none') return null; return r; };
  const ov = [...document.querySelectorAll('.overlay')].find((o) => !o.hidden);
  const els = [...(ov || document.body).querySelectorAll('*')].filter((e) => [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && !e.closest('[hidden]'));
  const items = [];
  for (const e of els) {
    // text box = range rects (tighter than element box)
    const rg = document.createRange(); rg.selectNodeContents(e); const r = rg.getBoundingClientRect();
    if (!vis(e) || r.width < 1) continue;
    // clipped by a scroll container? skip if outside its visible area
    let clipped = false;
    for (let a = e.parentElement; a; a = a.parentElement) { const s = getComputedStyle(a); if (/(auto|scroll|hidden)/.test(s.overflow + s.overflowY + s.overflowX)) { const ar = a.getBoundingClientRect(); if (r.bottom <= ar.top + 1 || r.top >= ar.bottom - 1 || r.right <= ar.left + 1 || r.left >= ar.right - 1) clipped = true; } }
    if (clipped) continue;
    if (r.right > innerWidth + 1 || r.left < -1) items.push({ off: true, t: e.textContent.trim().slice(0, 30), r: [r.left | 0, r.right | 0] });
    items.push({ e, r, t: e.textContent.trim().slice(0, 30), z: e });
  }
  const out = items.filter((i) => i.off).map((i) => 'OFFSCREEN ' + i.t + ' ' + i.r);
  const tx = items.filter((i) => !i.off);
  for (let i = 0; i < tx.length; i++) for (let j = i + 1; j < tx.length; j++) {
    const a = tx[i], b = tx[j];
    if (a.e.contains(b.e) || b.e.contains(a.e)) continue;
    const ox = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left), oy = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
    if (ox > 3 && oy > 3 && ox * oy > 30) {
      // is one hidden under an opaque overlay? check what's actually on top at the overlap centre
      const cx = (Math.max(a.r.left, b.r.left) + Math.min(a.r.right, b.r.right)) / 2, cy = (Math.max(a.r.top, b.r.top) + Math.min(a.r.bottom, b.r.bottom)) / 2;
      const top = document.elementFromPoint(cx, cy);
      const inA = top && (a.e.contains(top) || top.contains(a.e)), inB = top && (b.e.contains(top) || top.contains(b.e));
      if (top && !inA && !inB) continue;
      out.push(`OVERLAP "${a.t}" × "${b.t}" (${ox | 0}x${oy | 0}px)`);
    }
  }
  return [...new Set(out)];
};
const b = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
for (const [name, w, h, mob, mode] of devices) {
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: mob ? 2 : 1, isMobile: mob, hasTouch: mob, userAgent: mob ? IOS : undefined });
  p.on('pageerror', (e) => console.log(name, '[pageerror]', e.message));
  await p.goto('http://127.0.0.1:5321/carol/'); await p.waitForTimeout(2000);
  for (const bird of birds) {
    const res = {};
    await p.evaluate(async ([bird, mode]) => { await carol.loadBird(bird); if (mode === 'pb' && !document.body.classList.contains('pb-open')) document.querySelector('.pb-handle')?.click(); }, [bird, mode]);
    await p.waitForTimeout(500);
    res.main = await p.evaluate(CHECK);
    await p.evaluate(() => carol.presets.open()); await p.waitForTimeout(200);
    res.menu = await p.evaluate(CHECK);
    await p.evaluate(() => carol.presets.close());
    for (const tab of ['overview', 'deep', 'voice', 'sources']) { await p.evaluate((t) => carol.learn.open(t), tab); await p.waitForTimeout(150); res['learn-' + tab] = await p.evaluate(CHECK); }
    await p.evaluate(() => carol.learn.close());
    for (const [k, v] of Object.entries(res)) if (v.length) console.log(name, bird, k, '\n   ' + v.slice(0, 8).join('\n   '));
  }
  await p.close();
}
await b.close();
console.log('done');
