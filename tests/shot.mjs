// Usage: node shot.mjs out.png [url] [js-to-run-after-load]
import { createRequire } from 'module';
const require = createRequire('/home/audioview/src/chimera-vocal-synth/package.json');
const { chromium } = require('playwright-core');
const [out, url = 'http://127.0.0.1:5321/carol/', js = '', w = '1280', h = '720'] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--autoplay-policy=no-user-gesture-required', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: +w, height: +h } });
p.on('console', (m) => { if (m.type() !== 'debug') console.log('[console]', m.type(), m.text()); });
p.on('pageerror', (e) => console.log('[pageerror]', e.message));
await p.goto(url); await p.waitForTimeout(2500);
if (js) { const r = await p.evaluate(js); if (r !== undefined) console.log('[eval]', JSON.stringify(r)); await p.waitForTimeout(1200); }
await p.screenshot({ path: out });
await b.close();
