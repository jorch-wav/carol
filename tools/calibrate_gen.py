#!/usr/bin/env python3
"""Match the loudness of GENERATED calls to the TRACED ones, bird by bird.
Renders a few generated phrases and the first traced calls with the real engine (`carol render`), compares their
loudness while sounding, and scales the generated breath pressure; repeats twice. Saves the factor to
fits/gestures/<id>.cal.json (read by tools/style.py), then rebuilds the bird's preset.
Usage: calibrate_gen.py [ids...]   (default: every bird with a gestures file)"""
import glob, json, os, subprocess, sys, tempfile, wave
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CAROL = os.path.join(ROOT, 'engine/target/release/carol')
GEN = """import { generate, genTypes } from '%s/web/js/gen.js';
import fs from 'fs';
const pr = JSON.parse(fs.readFileSync(process.argv[2]));
const calls = []; genTypes(pr.style).forEach((t, i) => { for (let k = 0; k < 2; k++) calls.push(generate(pr.style, t, 11 + i * 31 + k)); });
fs.writeFileSync(process.argv[3], JSON.stringify(calls));""" % ROOT


def level(fn):
    w = wave.open(fn); a = np.frombuffer(w.readframes(w.getnframes()), np.int16) / 32768
    fr = a[:len(a) // 441 * 441].reshape(-1, 441); r = np.sqrt((fr ** 2).mean(1)); r = r[r > 0.01]
    return float(np.median(r)) if len(r) else 1e-6


def render(preset, calls, tmp, name):
    cj, wv = os.path.join(tmp, name + '.json'), os.path.join(tmp, name + '.wav')
    json.dump(calls, open(cj, 'w')) if not isinstance(calls, str) else None
    subprocess.run([CAROL, 'render', preset, calls if isinstance(calls, str) else cj, wv], check=True, capture_output=True)
    return level(wv)


def main():
    ids = sys.argv[1:] or sorted(os.path.basename(f)[:-5] for f in glob.glob(os.path.join(ROOT, "fits/gestures/*.json")) if not f.endswith(".cal.json"))
    with tempfile.TemporaryDirectory() as tmp:
        gen_js = os.path.join(tmp, 'gen.mjs'); open(gen_js, 'w').write(GEN)
        for bid in ids:
            preset = os.path.join(ROOT, 'web/presets', bid + '.json')
            calf = os.path.join(ROOT, 'fits/gestures', bid + '.cal.json')
            pr = json.load(open(preset))
            if not pr.get('style'): continue
            traced = render(preset, pr['calls'][:6], tmp, 't')
            gain = json.load(open(calf))['pgain'] if os.path.exists(calf) else 1.0
            for it in range(4):
                subprocess.run(['python3', os.path.join(ROOT, 'tools/build_presets.py'), bid], check=True, capture_output=True)
                gj = os.path.join(tmp, 'g.json')
                subprocess.run(['node', gen_js, preset, gj], check=True)
                db = 20 * np.log10(render(preset, gj, tmp, 'g') / traced)
                print(f'{bid:14s} pass {it + 1}: generated {db:+.1f} dB vs traced (pressure x{gain:.2f})')
                if abs(db) < 0.8: break
                gain = float(np.clip(gain * 10 ** (-db / 20), 0.3, 3.0))
                json.dump({'pgain': round(gain, 3)}, open(calf, 'w'))
            subprocess.run(['python3', os.path.join(ROOT, 'tools/build_presets.py'), bid], check=True, capture_output=True)


if __name__ == '__main__':
    main()
