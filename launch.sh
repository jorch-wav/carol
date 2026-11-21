#!/bin/bash
# Carol (bird synthesiser, ~/synths/carol): the drawer's Exec. Same pattern as Chimera:
# a local page server, a keys bridge ("Carol-Keys in" for the MIDI router), and Chromium
# as a full-screen app window.
#   ?midi=Carol-Keys   only that input plays it (Korg + NeoKeys/knobs arrive there via the router)
#   /carol/ path       gives the window its own app_id: chrome-127.0.0.1__carol_-Default
cd "$(dirname "$0")"
PORT=5321
NAME=Carol; NODE=Carol; KEYS=Carol-Keys
PROFILE=/home/audioview/.config/carol-chromium
PIDFILE=/tmp/carol.pid; LOG=/tmp/carol
URL="http://127.0.0.1:$PORT/carol/?midi=$KEYS&latency=balanced&fps=30"

running=$(pgrep -o -f -- "^/usr/lib/chromium/chromium .*--user-data-dir=$PROFILE( |$)")
if [ -n "$running" ] || { [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; }; then
    [ -n "$running" ] && echo "$running" > "$PIDFILE"
    wlrctl toplevel focus title:Carol 2>/dev/null
    exit 0
fi

answers() { curl -sf -o /dev/null --max-time 1 "http://127.0.0.1:$PORT/carol/" ; }
if ! answers; then
    setsid /usr/bin/python3 ./tools/serve.py "$PORT" ./site > /tmp/carol-http.log 2>&1 < /dev/null &
    echo $! > /tmp/carol-http.pid
    for _ in $(seq 50); do answers && break; sleep 0.1; done
fi

# Web MIDI without a prompt, for this page only
mkdir -p "$PROFILE/Default"
python3 - "$PROFILE/Default/Preferences" "$PORT" <<'PY'
import json, sys
path, port = sys.argv[1], sys.argv[2]
try:
    prefs = json.load(open(path))
except (OSError, ValueError):
    prefs = {}
ex = prefs.setdefault("profile", {}).setdefault("content_settings", {}).setdefault("exceptions", {})
for kind in ("midi", "midi_sysex"):
    ex.setdefault(kind, {})[f"http://127.0.0.1:{port},*"] = {"setting": 1}
json.dump(prefs, open(path, "w"))
PY

# keys port first: Chromium only listens to MIDI ports that exist when the page opens
/usr/bin/python3 /home/audioview/synths/chimera/keys_bridge.py $$ "$KEYS" > "$LOG-keys.log" 2>&1 &
sleep 1

PULSE_PROP="application.name=$NODE node.name=$NODE node.description='$NAME' media.name=$NODE" \
chromium --user-data-dir="$PROFILE" --app="$URL" --class=carol --ozone-platform=wayland \
    --autoplay-policy=no-user-gesture-required --no-first-run --force-device-scale-factor=1 \
    --disable-features=Translate,MediaRouter --disable-pinch --password-store=basic ${CAROL_DEBUG:+--remote-debugging-port=9226 --remote-debugging-address=127.0.0.1} \
    > "$LOG.log" 2>&1 &
BROWSER=$!
echo $BROWSER > "$PIDFILE"
/usr/bin/python3 /home/audioview/synths/stream_volume.py "$NAME" > /dev/null 2>&1 &
wait $BROWSER
rm -f "$PIDFILE"
