#!/usr/bin/env bash
# Politely fetch xeno-canto recording pages + mp3s, then convert to mono 44.1k 16-bit WAV.
# Usage: xc_fetch.sh <bird_id> <xc_id> [<xc_id> ...]
set -u
B=$1; shift
D=/home/audioview/synths/carol/data/$B
mkdir -p "$D/raw" "$D/rec"
for id in "$@"; do
  [ -s "$D/raw/XC$id.html" ] || { curl -sfL "https://xeno-canto.org/$id" -o "$D/raw/XC$id.html"; sleep 4; }
  # refuse ND licences before downloading audio
  if grep -q "licenses/by-nc-nd\|licenses/by-nd" <(grep -A2 "<h2>License</h2>" "$D/raw/XC$id.html"); then
    echo "XC$id: ND licence, skipped"; continue
  fi
  if [ ! -s "$D/raw/XC$id.mp3" ]; then
    curl -sfL "https://xeno-canto.org/$id/download" -o "$D/raw/XC$id.mp3"; sleep 4
  fi
  if ! file -b "$D/raw/XC$id.mp3" | grep -qiE "audio|mpeg|MP3"; then
    echo "XC$id: download is not audio ($(file -b "$D/raw/XC$id.mp3" | cut -c1-60))"; continue
  fi
  ffmpeg -nostdin -loglevel error -y -i "$D/raw/XC$id.mp3" -ac 1 -ar 44100 -sample_fmt s16 -map_metadata -1 "$D/rec/XC$id.wav" \
    && echo "XC$id: ok $(ffprobe -v error -show_entries format=duration -of csv=p=0 "$D/rec/XC$id.wav")s"
done
