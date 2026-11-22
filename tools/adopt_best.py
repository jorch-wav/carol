#!/usr/bin/env python3
"""Use each bird's best fit: the original (fits/<id>.json) or a polished one (fits/p1, fits/p2 by default).
The original is backed up once to fits/pre-polish/. Then rebuild the presets that changed.
Usage: adopt_best.py [dir ...]"""
import json, os, shutil, subprocess, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
dirs = sys.argv[1:] or ['fits/p1', 'fits/p2']
os.makedirs(os.path.join(ROOT, 'fits/pre-polish'), exist_ok=True)
changed = []
for f in sorted(os.listdir(os.path.join(ROOT, 'fits'))):
    if not f.endswith('.json'): continue
    bid = f[:-5]; cur = os.path.join(ROOT, 'fits', f)
    best, bt = cur, json.load(open(cur))['match']['total']
    for d in dirs:
        c = os.path.join(ROOT, d, f)
        if os.path.exists(c):
            t = json.load(open(c))['match']['total']
            if t > bt + 0.05: best, bt = c, t
    if best != cur:
        bak = os.path.join(ROOT, 'fits/pre-polish', f)
        if not os.path.exists(bak): shutil.copy(cur, bak)
        old = json.load(open(cur))['match']['total']
        shutil.copy(best, cur); changed.append(bid)
        print(f'{bid:14s} {old:5.1f} -> {bt:5.1f}  ({os.path.relpath(best, ROOT)})')
if changed:
    subprocess.run(['python3', os.path.join(ROOT, 'tools/build_presets.py'), *changed], check=True)
