// Emulate a touch device: node device.mjs out.png width height [js] [scale]
import { createRequire } from 'module';
const require = createRequire('/home/audioview/src/chimera-vocal-synth/package.json');
const { chromium } = require('playwright-core');
const [out, w, h, js = '', sc = '2', url = 'http://127.0.0.1:5321/carol/'] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--password-store=basic', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: +sc, isMobile: true, hasTouch: true,
  userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' });
p.on('pageerror', (e) => console.log('[pageerror]', e.message));
await p.goto(url); await p.waitForTimeout(2500);
if (js) console.log('[eval]', JSON.stringify(await p.evaluate(js)));
await p.waitForTimeout(800);
await p.screenshot({ path: out });
console.log(JSON.stringify(await p.evaluate(() => ({ docH: document.documentElement.scrollHeight, winH: innerHeight, docW: document.documentElement.scrollWidth, knob: getComputedStyle(document.getElementById('knobs')).getPropertyValue('--knob') }))));
await b.close();
