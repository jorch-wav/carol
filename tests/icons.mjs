import { createRequire } from 'module';
const require = createRequire('/home/audioview/src/chimera-vocal-synth/package.json');
const { chromium } = require('playwright-core');
const b = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--password-store=basic'] });
for (const n of [180, 192, 512]) {
  const p = await b.newPage({ viewport: { width: n, height: n } });
  await p.setContent(`<style>html,body{margin:0;background:#141312}</style><img src="http://127.0.0.1:5321/carol/img/icon.svg" style="width:${n}px;height:${n}px;display:block">`);
  await p.waitForTimeout(300);
  await p.screenshot({ path: `/home/audioview/synths/carol/web/img/icon-${n}.png` });
}
await b.close();
