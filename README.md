# Carol — a bird synthesiser

Carol plays real bird voices with **synthesis, not samples**. Each bird is a physical model
of how it makes sound — air sacs → syrinx → windpipe → throat → mouth → beak — tuned
automatically until it sounds as close as it can to field recordings of that bird.

Two collections so far (16 birds):

| Bird | Collection | Body type | Match to recordings |
|---|---|---|---|
| Crimson rosella | Australian Birds | parrot | 86% |
| Australian magpie | Australian Birds | songbird | 79% |
| Laughing kookaburra | Australian Birds | non-songbird (kingfisher model) | 74% |
| Red wattlebird | Australian Birds | songbird | 68% |
| Australian boobook | Australian Birds | non-songbird (open mouth) | 92% |
| Bell miner | Australian Birds | songbird | 88% |
| Bush stone-curlew | Australian Birds | non-songbird (open mouth) | 86% |
| Pied butcherbird | Australian Birds | songbird | 79% |
| Rainbow lorikeet | Australian Birds | parrot | 77% |
| Superb lyrebird | Australian Birds | songbird | 75% |
| Sulphur-crested cockatoo | Australian Birds | parrot | 69% |
| Eastern whipbird | Australian Birds | songbird | 62% |
| European robin | Birds of the World | songbird | 87% |
| Rock dove (feral pigeon) | Birds of the World | dove | 84% |
| Resplendent quetzal | Birds of the World | non-songbird (kingfisher model) | 81% |
| Northern cardinal | Birds of the World | songbird | 72% |

Non-commercial and open source. Runs on a Raspberry Pi 5, and in any modern browser — phone,
iPad or desktop (add it to your home screen for full screen).

## What's in the app
- **Knobs for every body part**, Minimoog-style, with an amber dot marking the real bird's
  value; double-tap a knob or press RESET TO BIRD to go back. Sections fold away.
- **Keys and pads**: keys move the selected call to any pitch while keeping its shape; pads play
  each call as the bird sang it. Optional **bird scale** snaps notes to the bird's most-sung pitches.
- **Views**: 2D anatomical cutaway (tap any part to learn what it does), 3D model, **SONO**
  (live sonogram with the bird's call contour and a scope strip), and the bird's **plate** from
  John Gould's *The Birds of Australia*. The bird moves as it sings.
- **Learning layer**: overview, deep dive (taxonomy, habitat, range, behaviour, voice),
  **anatomy** reference figures, how Carol models the bird, and every source with its licence.
- **Sequencer (SEQ)**: 16 steps, up to 6 rows, swing, patterns A–D. Each row can be a different bird,
  so several birds sing together (dawn chorus); every extra bird runs in its own engine on the audio thread.
  Follows its own tempo, AudioView's shared tempo on the Pi, or incoming MIDI clock.
- **Playing**: HOLD (latch, also the sustain pedal), RPT (call repeater in time), voice limit, concert pitch,
  ATTACK / RELEASE, GLIDE, POLY / MONO / LEGATO, and an LFO for vibrato and tremolo (folded sections SHAPE and LFO).
- **Effects (FX)**: filter, tempo-synced delay, reverb and a limiter, after the engine (Web Audio, so on every device).
- **Record and export**: ● REC saves what you play, with effects, as a WAV; ⤓ MIDI saves a sequencer pattern
  as a MIDI file. MIDI program change picks a bird.
- **Preset files**: export / import `.carol.json` (Settings); search and ★ favourites in the bird menu.
- **Settings (⚙)**: MIDI input and channel, velocity curve, pitch-bend range, **MIDI learn** (any controller
  to any knob), **MIDI out** (notes, and clock when Carol leads), latency.
- **My Presets and share links**: save a bird plus your knob changes, or copy a link that opens it.
- **Guided tour** per bird ("press this, hear that"), and on the Pi an **A/B** of every call against its
  recording (the recordings never leave the Pi).
- **Hardware on the Pi**: Korg nanoKEY and the Pi's NeoKeys, knobs and encoder.
- Web MIDI isn't available in iPhone/iPad Safari; everything else works there.

## How it works
| Step | Where | What |
|---|---|---|
| 1. Collect | offline | recordings from xeno-canto, plates from BHL / Internet Archive / Wikimedia Commons, facts from ALA / Wikipedia / Cornell / RSPB |
| 2. Analyse | offline | pitch, loudness, harmonicity and spectrum every 5 ms |
| 3. Fit | offline | calls become gestures; the body and the per-syllable tracks are searched until the spectrum matches |
| 4. Save | offline | `web/presets/<bird>.json`, one file per bird |
| 5. Play | Pi / browser | the same Rust engine, compiled to WebAssembly, in an AudioWorklet |

### The model
- **Source.** The labia are the normal-form oscillator from Gabriel Mindlin's lab (Amador et al.
  2013): `x' = y, y' = −a − b·x − x³ + x² − x²y − xy`, in normalised time τ = γt. Air pressure drives
  `a`, labial tension `b`. Because the equations are scale-free in time, pitch = γ·ω(a,b)/2π
  exactly, so Carol hits any note while (a, b) still decide the sound: a pure whistle (Hopf regime)
  or buzzy pulses (saddle-node regime). **Labial closure** chops the airflow into pulses for harsh,
  harmonic-rich calls.
- **Body types.** Songbird: two independent sources, left and right, switching sides by pitch.
  Kingfisher: two coupled membranes, which go rough or chaotic as they push on each other (no
  published model of the kookaburra exists; this is a best guess). Parrot: one source, plus
  tongue-shaped mouth resonances (Beckers et al. 2004). Dove: one source and a closed beak; the
  inflated oesophagus rings near the note and radiates through the neck (Riede et al. 2004;
  Fletcher et al. 2004).
- **Tract.** The windpipe is a reflecting waveguide, the throat sac a resonance that can follow the
  note (Riede et al. 2006), the mouth two formants, the beak a gape-dependent filter (Hoese et al. 2000).
- **Gestures.** Each call stores, every 5 ms, its pitch, pressure, roughness, beak gape, mouth
  shape and closure — so a laugh can go "koo" → "kaa" syllable by syllable.

### Match score
Per call, frame by frame: pitch error (cents), loudness-shape error (dB) and spectral-shape error
(dB; bands under the recording's noise floor only count if the synth is louder), combined as
`100 × (0.35·e^(−cents/120) + 0.25·e^(−dB/6) + 0.40·e^(−spec/9))`. Kookaburra presets are fitted
to single birds and pairs only: a chorus is several birds at once.

## Taxonomy
Every bird is named to the **IOC World Bird List**, so collections from anywhere share one scheme:
order, family, genus and species with authority and year, the name it was first described under,
and the older name on Gould's plate where it differs. Each preset carries this in its `taxonomy` block.

## Run it
```
python3 -m http.server -d web 8000        # then open http://localhost:8000
./launch.sh                                # on the Pi (Chromium app window, port 5321)
tools/fit_all.sh [bird]                    # refit (BUDGET=, OUT=, INIT= env)
tools/build_presets.py [bird]              # fit + info + sources + plate -> web/presets/
tools/publish.sh                           # push to GitHub + GitHub Pages (needs gh, logged in)
```
After changing the engine: `cargo build --release -p carol-cli`, `cargo build --release -p carol-wasm
--target wasm32-unknown-unknown`, copy the `.wasm` to `web/carol.wasm`, run `carol bodies >
web/bodies.json`, and refit.

## Code map
- `engine/core` — model, engine, analysis, fitter (no dependencies)
- `engine/cli` — `carol gen-table | bodies | tone | bench | fit`
- `engine/wasm` — C-ABI module used by the AudioWorklet and the import worker
- `data/` — facts and source lists per bird (recordings and scans stay local; see `data/README.md`)
- `web/` — the app (plain ES modules, no build step); `js/birdmodel.js` is the one bird model both views draw
- `tools/` — fitting and data scripts; `tests/` — Playwright screenshots, wasm fitter test

## Licences
- **Code:** MIT (see LICENSE).
- **Presets** (`web/presets/`): call shapes and fitted settings derived from xeno-canto recordings
  licensed **CC BY-NC-SA** (3.0/4.0; one robin clip CC BY-NC 4.0), so the presets are **CC BY-NC-SA 4.0**, with credit to each recordist
  (listed in every preset and in the app's Sources tab). The recordings themselves are not included.
- **Plates:** John Gould, *The Birds of Australia*, *The Birds of Great Britain* and *A Monograph of the
  Trogonidae* (BHL / Internet Archive scans), and J. J. Audubon, *The Birds of America* (University of
  Pittsburgh scan via Wikimedia Commons), all public domain.
- **Anatomy figures** (`web/img/learn/`): L. Shyamal (public domain); C. Abraczinskas after Sereno
  et al. 2008 (CC BY 2.5); Uwe Gille (CC BY-SA 3.0); V. Häcker, *Der Gesang der Vögel* (1900, public domain).
  Details in `web/img/learn/illustrations.json`.
- **Fonts:** Liberation Sans Narrow (GPL + font exception), C059 (URW base35, AGPL + font exception).
