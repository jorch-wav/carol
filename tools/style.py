#!/usr/bin/env python3
"""Learn a bird's singing *style*, so the app can make new phrases (GENERATED calls) instead of replaying traces
of single recordings (TRACED calls).

Source: every clean phrase in all of the bird's recordings (fits/gestures/<id>.json, from `carol analyse`), with
the fitted calls used only to calibrate loudness, buzz, beak and mouth to the fitted model. If there is no
gestures file, the fitted calls themselves are used.

What is kept is general, averaged information, not any one recording's trace:
- note shapes: notes from all recordings are grouped by similarity and each group is averaged into a coarse
  8-point pitch curve and 8-point loudness curve (plus length, buzz, trill); a group must average 3+ notes,
  so no shape is a single recorded note;
- which note shape tends to follow which (a transition table), notes per phrase, and the gaps between notes;
- how the beak opens with pitch (one straight-line fit over the fitted calls).
Output: a dict stored as preset['style'] (read by web/js/gen.js)."""
import numpy as np

K = 8               # points per note-shape curve
MIN_SYL = 0.02      # shortest note kept (s)
MERGE_GAP = 0.012   # gaps shorter than this don't split a note (s)
JUMP = 2.0          # a pitch jump this big (semitones, frame to frame) starts a new note
MIN_GROUP = 3       # every note shape averages at least this many notes
MAX_SHAPES = 12


def decode(c):
    n = len(c['f'])
    z = lambda k, s: np.array(c.get(k) or [0] * n, float) / s
    return {'f': np.array(c['f'], float), 'p': z('p', 1000), 'n': z('n', 100), 'g': z('g', 1000), 'm': z('m', 1000), 'c': z('c', 1000),
            'hop': c['hop'], 'ref': c['ref_hz']}


def segments(p, semi, hop):
    """Notes = runs where the sound is up, split again at big pitch jumps; returns [(start, end)] frame ranges."""
    thr = max(0.02, 0.1 * p.max())
    on = p > thr
    runs, i, n = [], 0, len(p)
    while i < n:
        if on[i]:
            j = i
            while j < n and on[j]: j += 1
            runs.append([i, j]); i = j
        else:
            i += 1
    merged = []
    for s in runs:
        if merged and (s[0] - merged[-1][1]) * hop < MERGE_GAP: merged[-1][1] = s[1]
        else: merged.append(s)
    # split at real pitch jumps only: a running median ignores the tracker's brief octave slips, and the jump
    # must hold (the median 4 frames on differs as well)
    sm = np.array([np.median(semi[max(0, k - 3):k + 4]) for k in range(len(semi))])
    out = []
    for a, b in merged:
        cut = a
        for k in range(a + 1, b):
            dip = p[max(a, k - 2):k + 3].min() < 0.7 * p[max(a, k - 8):k + 9].max()   # real note changes dip in loudness
            if dip and abs(sm[k] - sm[k - 1]) > JUMP and abs(sm[min(b - 1, k + 4)] - sm[max(a, k - 4)]) > JUMP and (k - cut) * hop >= MIN_SYL:
                out.append((cut, k)); cut = k
        out.append((cut, b))
    return [(a, b) for a, b in out if (b - a) * hop >= MIN_SYL]


def resample(x, k=K):
    if len(x) == 1: return np.repeat(x, k)
    return np.interp(np.linspace(0, len(x) - 1, k), np.arange(len(x)), x)


def trill(semi, hop):
    """Fast pitch wobble left after the smooth curve: (rate Hz, depth semitones); small wobble = none."""
    if len(semi) < 10: return 0.0, 0.0
    smooth = np.convolve(semi, np.ones(7) / 7, mode='same')
    r = (semi - smooth)[3:-3]
    zc = np.sum(np.diff(np.sign(r)) != 0) / 2
    rate = zc / (len(r) * hop)
    depth = float(np.std(r) * 1.4)
    return (float(min(rate, 40)), depth) if depth > 0.5 and rate < 45 else (0.0, 0.0)


def notes(tr, ref):
    """Notes of one phrase (tracks dict from decode), pitch in semitones relative to ref."""
    f = np.maximum(tr['f'], 30)
    semi = 12 * np.log2(f / ref)
    out = []
    for a, b in segments(tr['p'], semi, tr['hop']):
        rate, depth = trill(semi[a:b], tr['hop'])
        sm = np.array([np.median(semi[max(a, k - 2):min(b, k + 3)]) for k in range(a, b)])
        out.append({'f': resample(sm), 'p': resample(tr['p'][a:b]), 'dur': (b - a) * tr['hop'],
                    'start': a * tr['hop'], 'end': b * tr['hop'], 'pk': float(tr['p'][a:b].max()),
                    'n': float(tr['n'][a:b].mean()), 'm': float(tr['m'][a:b].mean()), 'c': float(tr['c'][a:b].mean()),
                    'g': tr['g'][a:b], 'abs': semi[a:b] + 12 * np.log2(ref), 'fm': (rate, depth)})
    # drop faint fragments (echoes, clicks, distant birds): keep notes at least 30% as loud as the phrase's loudest
    if out:
        top = max(s['pk'] for s in out)
        out = [s for s in out if s['pk'] >= 0.3 * top]
    return out


def kmeans(X, k, iters=50, seed=1):
    rng = np.random.default_rng(seed)
    C = X[rng.choice(len(X), k, replace=False)]
    for _ in range(iters):
        lab = np.argmin(((X[:, None] - C[None]) ** 2).sum(-1), 1)
        C2 = np.array([X[lab == j].mean(0) if np.any(lab == j) else C[j] for j in range(k)])
        if np.allclose(C, C2): break
        C = C2
    return lab


def feats(s):
    # how high the note is, and (weighted up) its shape: rise, fall, sweep; plus length and loudness shape
    lvl = float(np.mean(s['f']))
    return np.concatenate([[lvl * 0.45], (s['f'] - lvl) * 2.2, [np.log(s['dur']) * 3.0], s['p'] / max(1e-6, s['p'].max()) * 2.0])


def group(X, k):
    lab = kmeans(X, k) if k > 1 else np.zeros(len(X), int)
    # small groups would be near-copies of single notes: fold them into the nearest big-enough group
    while True:
        counts = np.bincount(lab, minlength=lab.max() + 1)
        small = [j for j in range(len(counts)) if 0 < counts[j] < MIN_GROUP]
        big = [j for j in range(len(counts)) if counts[j] >= MIN_GROUP]
        if not small or not big: break
        cent = {q: X[lab == q].mean(0) for q in big}
        for i in np.where(lab == small[0])[0]:
            lab[i] = min(cent, key=lambda q: ((X[i] - cent[q]) ** 2).sum())
    used = sorted(set(lab.tolist())); remap = {j: i for i, j in enumerate(used)}
    return np.array([remap[j] for j in lab]), len(used)


def learn_type(sylls, phrases, cal):
    X = np.array([feats(s) for s in sylls])
    lab, k = group(X, int(max(1, min(MAX_SHAPES, len(sylls) // (MIN_GROUP * 2)))))
    protos = []
    for j in range(k):
        mem = [s for s, l in zip(sylls, lab) if l == j]
        offs = [float(np.median(s['f'])) for s in mem]
        protos.append({
            'f': [round(float(x), 2) for x in np.mean([s['f'] for s in mem], 0)],
            'p': [round(float(x) * cal['p'], 3) for x in np.mean([s['p'] for s in mem], 0)],
            'd': round(float(np.exp(np.mean([np.log(s['dur']) for s in mem]))), 4),
            'dsd': round(float(np.std([np.log(s['dur']) for s in mem])), 3),
            'fsd': round(float(np.std(offs)), 2),
            'fm': [round(float(np.mean([s['fm'][0] for s in mem])), 1), round(float(np.mean([s['fm'][1] for s in mem])), 2)],
            'n': round(float(np.mean([s['n'] for s in mem])) * cal['n'], 3),
            'm': cal['m'], 'c': cal['c'], 'w': len(mem)})
    start = np.ones(k) * 0.1; trans = np.ones((k, k)) * 0.1; lens, gaps = [], []
    i = 0
    for ph in phrases:
        labs = lab[i:i + len(ph)]; i += len(ph)
        if not len(labs): continue
        lens.append(len(labs)); start[labs[0]] += 1
        for a, b in zip(labs[:-1], labs[1:]): trans[a, b] += 1
        for s1, s2 in zip(ph[:-1], ph[1:]): gaps.append(max(0.005, s2['start'] - s1['end']))
    lg = np.log(gaps) if gaps else np.log([0.06])
    return {'protos': protos,
            'start': [round(float(x), 3) for x in start / start.sum()],
            'trans': [[round(float(x), 3) for x in row / row.sum()] for row in trans],
            'nsyl': [int(min(lens)), int(np.percentile(lens, 90)), round(float(np.mean(lens)), 2), round(float(np.std(lens)), 2)],
            'gap': [round(float(lg.mean()), 3), round(float(lg.std()) if len(gaps) > 1 else 0.3, 3)]}


def learn(calls, gestures=None, call_types=None, pgain=1.0):
    """calls: the preset's named fitted calls ('Song 2' -> type 'Song'); gestures: phrases from `carol analyse`;
    call_types: {type name: [xeno-canto ids]} to sort the gestures into the same types."""
    # the fitted calls: calibration (loudness, buzz, beak, mouth) and the fallback source
    fitted = {}
    for c in calls:
        fitted.setdefault(c['name'].rsplit(' ', 1)[0], []).append(c)
    fit_notes = [s for c in calls for s in notes(decode(c), c['ref_hz'])]
    if not fit_notes: return None
    ab = np.concatenate([s['abs'] for s in fit_notes]); gg = np.concatenate([s['g'] for s in fit_notes])
    b, a = np.polyfit(ab, gg, 1) if len(ab) > 4 and np.std(ab) > 0.1 else (0.0, float(np.mean(gg)))
    gape_sd = float(np.std(gg - (a + b * ab)))
    per_type_mc = {t: (round(float(np.mean([s['m'] for c in cs for s in notes(decode(c), c['ref_hz'])] or [0])), 3),
                       round(float(np.mean([s['c'] for c in cs for s in notes(decode(c), c['ref_hz'])] or [0])), 3)) for t, cs in fitted.items()}
    all_m = round(float(np.mean([s['m'] for s in fit_notes])), 3); all_c = round(float(np.mean([s['c'] for s in fit_notes])), 3)

    # the phrases to learn from, by type
    src_type = {('XC' + x if not str(x).startswith(('XC', 'INAT')) else x): t for t, ids in (call_types or {}).items() for x in ids}
    groups = {}
    if gestures:
        for g in gestures:
            t = src_type.get(g['src'], 'Call')
            groups.setdefault(t, []).append(decode(dict(g, g=None, m=None, c=None)))
        cal_p = np.median([s['pk'] for s in fit_notes]) / max(1e-6, np.median([s['pk'] for ph in groups.values() for tr in ph for s in notes(tr, tr['ref'])] or [1]))
        cal_n = np.mean([s['n'] for s in fit_notes]) / max(1e-6, np.mean([s['n'] for ph in groups.values() for tr in ph for s in notes(tr, tr['ref'])] or [1]))
    else:
        for t, cs in fitted.items(): groups[t] = [decode(c) for c in cs]
        cal_p = cal_n = 1.0
    types = {}
    for t, trs in groups.items():
        ref = float(np.median([tr['ref'] for tr in trs]))
        phrases = [notes(tr, ref) for tr in trs]
        sylls = [s for ph in phrases for s in ph]
        if len(sylls) < MIN_GROUP: continue
        m, c = per_type_mc.get(t, (all_m, all_c))
        types[t] = dict(learn_type(sylls, phrases, {'p': float(cal_p * pgain), 'n': float(min(cal_n, 3.0)), 'm': m, 'c': c}),
                        ref_hz=round(ref, 1), notes=len(sylls), phrases=len(phrases))
    if not types: return None
    return {'version': 1, 'hop': 0.005, 'types': types, 'gape': [round(float(a), 4), round(float(b), 5)], 'gape_sd': round(gape_sd, 3),
            'source': 'all recordings' if gestures else 'fitted calls'}
