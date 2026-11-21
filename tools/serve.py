#!/usr/bin/env python3
"""Carol's page server (localhost only; Tailscale serve puts it on your own devices).
No-cache headers so an updated app is never stale. Pi-only extras, never on GitHub Pages:
  .../tempo   AudioView's shared tempo (bpm, running) for the sequencer's AudioView sync
  .../clip    an excerpt of a source recording, for the A/B in Learn (recordings stay on the Pi)
  .../diag    layout measurements from devices -> /tmp/carol-diag.log
"""
import functools, http.server, io, json, os, re, sys, urllib.parse, wave

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEMPO = os.path.expanduser('~/.config/audioview/tempo.json')


class H(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()

    def log_message(self, *a): pass

    def reply(self, code, body=b'', ctype='application/json'):
        self.send_response(code)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        path, _, query = self.path.partition('?')
        q = urllib.parse.parse_qs(query)
        if path.endswith('/diag'):
            with open('/tmp/carol-diag.log', 'a') as f: f.write(query[:600] + '\n')
            return self.reply(204)
        if path.endswith('/tempo'):
            try:
                d = json.load(open(TEMPO))
                body = json.dumps({'bpm': float(d.get('bpm', 120)), 'running': bool(d.get('running'))}).encode()
            except Exception:
                body = b'{"bpm":120,"running":false}'
            return self.reply(200, body)
        if path.endswith('/clip'):
            return self.clip(q)
        super().do_GET()

    def clip(self, q):
        bird = (q.get('bird') or [''])[0]; src = (q.get('src') or [''])[0]
        if not re.fullmatch(r'[a-z]{2,20}', bird) or not re.fullmatch(r'(XC|INAT)\d{2,9}', src):
            return self.reply(400)
        fn = os.path.join(ROOT, 'data', bird, 'rec', src + '.wav')
        if not os.path.isfile(fn):
            return self.reply(404)
        try:
            t0 = max(0.0, float(q['start'][0])); t1 = float(q['end'][0])
            t1 = min(t1, t0 + 8.0)
            with wave.open(fn) as w:
                fs = w.getframerate(); ch = w.getnchannels(); sw = w.getsampwidth()
                a = int(max(0, t0 - 0.15) * fs); b = int((t1 + 0.15) * fs)
                w.setpos(min(a, w.getnframes())); frames = w.readframes(max(0, b - a))
            out = io.BytesIO()
            with wave.open(out, 'wb') as o:
                o.setnchannels(ch); o.setsampwidth(sw); o.setframerate(fs); o.writeframes(frames)
            return self.reply(200, out.getvalue(), 'audio/wav')
        except Exception:
            return self.reply(400)


port, root = int(sys.argv[1]), sys.argv[2]
http.server.ThreadingHTTPServer(('127.0.0.1', port), functools.partial(H, directory=root)).serve_forever()
