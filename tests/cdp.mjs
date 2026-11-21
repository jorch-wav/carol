// Evaluate JS in the running Carol window (launch with CAROL_DEBUG=1): node cdp.mjs "<js>"
import { createRequire } from 'module';
const require = createRequire('/home/audioview/src/chimera-vocal-synth/package.json');
const { chromium } = require('playwright-core');
const b = await chromium.connectOverCDP('http://127.0.0.1:9226');
const page = b.contexts()[0].pages().find((p) => p.url().includes('5321'));
page.on('console', (m) => console.log('[console]', m.type(), m.text()));
const r = await page.evaluate(process.argv[2] || '1');
console.log(JSON.stringify(r));
await new Promise((z) => setTimeout(z, 300));
process.exit(0);
