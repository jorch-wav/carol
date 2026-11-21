#!/usr/bin/env python3
"""Spectrogram PNG of a wav (numpy + PIL). Usage: spectro.py in.wav out.png [maxHz]"""
import sys, wave, numpy as np
from PIL import Image
w = wave.open(sys.argv[1]); fs = w.getframerate()
x = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768
fmax = float(sys.argv[3]) if len(sys.argv) > 3 else 12000
N, H = 1024, 256
win = np.hanning(N)
frames = np.lib.stride_tricks.sliding_window_view(x, N)[::H] * win
S = 20 * np.log10(np.abs(np.fft.rfft(frames, axis=1)) + 1e-9)
S = S[:, : int(fmax / fs * N)]
S = np.clip((S - (S.max() - 70)) / 70, 0, 1)
img = (255 * (1 - S.T[::-1])).astype(np.uint8)
im = Image.fromarray(img).resize((min(1600, img.shape[1] * 2), 300))
im.save(sys.argv[2])
