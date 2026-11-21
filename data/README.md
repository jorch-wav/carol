# Carol source data

Collected 2026-11-17: four Australian birds, then four Birds of the World (cardinal, robin, pigeon, quetzal). Each `data/<id>/` has:

- `rec/XC<id>.wav` - recordings, mono 44.1 kHz 16-bit (converted from `raw/XC<id>.mp3`)
- `plate.jpg` - public-domain plate (John Gould; Audubon for the cardinal), 900 px tall, JPEG q85 (from `raw/*.jp2`)
- `info.json` - overview, habitat, range, behaviour, voice, anatomy, Indigenous names, tags, sources
- `sources.json` - full metadata for every recording, the plate and the fact sources
- `raw/` - original downloads (mp3, XC recording pages, JP2 scans). Untrusted data; nothing in it is executed.

Helper scripts live in `../tools/` (`xc_parse_list.py`, `xc_parse_rec.py`, `xc_fetch.sh`, `make_plate.py`, `build_sources.py`).

## Recordings (all xeno-canto, Australia, quality A unless noted, all CC BY-NC-SA)

| bird | count | ids |
|---|---|---|
| magpie | 9 | 1069711, 217874, 729284 (carolling); 383930, 1041375, 1163888, 1169115 (solo song/warble); 826873, 1170181 (calls) |
| kookaburra | 10 | 371518, 620165 (B), 1169858 (laugh chorus); 817868, 1188306 (laugh duet); 464406 (B), 611558, 1104895 (single bird); 716894, 937218 (unspecified calls) |
| wattlebird | 10 | 1062583, 1163878, 935428, 1135593, 612413, 577691, 1072282 (calls); 935870, 935871, 672982 (song) |
| rosella | 10 | 1050086, 1069586, 1072331, 1072332 (song, probably piping whistles); 1173944, 1166584, 354603, 839934, 935328, 935511 (calls / flight call) |

Licence: all are CC BY-NC-SA (4.0). Using them in Carol means credit (`attribution` field in sources.json), non-commercial use, and sharing derived data/presets under the same licence. ND licences were filtered out before download. CC0 files were skipped too, since they weren't on the allowed list.

## Plates

From John Gould, *The Birds of Australia* (1840-48), Smithsonian Libraries copy scanned for BHL (Internet Archive `birdsAustraliav{2,4,5}Goul`), public domain. All four are lettered "J. Gould and H. C. Richter del et lith."

- magpie: Vol. II pl. 46, *Gymnorhina tibicen*, Piping Crow-Shrike
- kookaburra: Vol. II pl. 18, *Dacelo gigantea*, Great Brown Kingfisher
- wattlebird: Vol. IV pl. 55, *Anthochaera carunculata*, Wattled Honey-eater
- rosella: Vol. V pl. 23, *Platycercus pennantii*, Pennant's Parrakeet

## Gaps and caveats

- **Call types weren't checked by listening.** `carol_category` is our grouping, based on the recordist's XC sound type and remarks. Check by ear before fitting:
  - magpie: no clip is labelled "whistled song", so solo songs stand in for it.
  - kookaburra: no clip is explicitly labelled "kook"/"kooa". XC716894 and XC937218 are unlabelled calls that might contain them.
  - wattlebird: "chock" and "cackle" aren't named in the XC labels, so they're assumed inside the "call" clips. The whistles are assumed inside the "song" clips.
  - rosella: "song" probably means piping whistles. Chattering isn't explicitly labelled.
- Some clips list another bird in the background. Most were noise-reduced by the recordist (see `remarks`). XC729284 (magpie) has a crimson rosella in the background.
- **Wattlebird:** only 19 non-ND quality A/B Australian recordings existed (3-75 s), so the choice was limited.
- **Rosella:** clips come from crimson populations only. Yellow and Adelaide rosella areas (Murray River, Adelaide) were excluded.
- **BHL links:** the BHL site blocks scripted access. Part URLs come from BHL/BioStor search records. Kookaburra (part/312945) and rosella (part/313255) were inferred from their BHL DOIs 10.5962/p.312945 and 10.5962/p.313255. The Internet Archive scan links are verified.
- **Indigenous names:** only from cited sources (Noongar Boodjar profiles, SE Arnhem Land profiles, and the Gamilaraay/Yuwaalaraay/Yuwaalayaay ALA list). No source was found for the crimson rosella, so its list is empty. Noongar profile content is (c) Noongar Boodjar Language Cultural Aboriginal Corporation. Cite the names only, and seek permission before wider use.
- **Anatomy:** the anatomy text is general for the bird's group (songbird, kingfisher, parrot), not from species-specific syrinx studies. The exception is the kookaburra, where Wikipedia describes its two-source tracheo-bronchial syrinx. Parrot claims come from Wikipedia, a 2022 UT Austin abstract (Muhammad) and Beckers et al. 2004 (via the press release).
- Fact text is paraphrased from Wikipedia (CC BY-SA), BirdLife Australia profiles and ALA. It isn't copied.

## Birds of the World (added 2026-11-17)

| bird | count | plate |
|---|---|---|
| cardinal | 10 (song, chips, alarm; US/Canada) | J. J. Audubon, *The Birds of America* (Havell), pl. 159 "Cardinal Grosbeak", Univ. of Pittsburgh scan via Wikimedia Commons |
| robin | 11 (spring + autumn song, tic, tsee; UK/Europe) | Gould, *The Birds of Great Britain* vol. II pl. 48 |
| pigeon | 10 (coos, nest calls, alarm; feral + wild) | Gould, *The Birds of Great Britain* vol. IV, "Rock-Pigeon" |
| quetzal | 10 (song, calls; some quality B, few quality-A clips exist) | Gould, *A Monograph of the Trogonidae*, 2nd ed., part III (1875) |

Licences: all CC BY-NC-SA (3.0 or 4.0) except robin XC1141104 (CC BY-NC 4.0). CC BY-SA was excluded, since it can't be combined with BY-NC-SA in one preset. Call types again come from the recordists' labels, not checked by ear. No species-specific syrinx study exists for the robin or the quetzal; the quetzal (a trogon) is modelled as an open-mouth non-songbird (Riede et al. 2016).

## More Australian birds (added 2026-11-18)

| bird | count | source | plate (Gould, *The Birds of Australia*) |
|---|---|---|---|
| lyrebird | 11 (mimetic song, territorial song, alarm) | xeno-canto | vol. III pl. 14, *Menura superba* |
| butcherbird | 10 (song, duets, piping, calls) | xeno-canto (one CC0) | vol. II pl. 49, *Cracticus nigrogularis* |
| whipbird | 10 (whip-crack, duets, grunts) | xeno-canto | vol. III pl. 15, *Psophodes crepitans* |
| bellminer | 10 (tinks) | xeno-canto | vol. IV pl. 80, lettered *Myzantha viridis* (Gould's text: *M. melanophrys*) |
| cockatoo | 10 (screech, flight, alarm, begging) | xeno-canto | vol. V pl. 1, *Cacatua galerita* |
| lorikeet | 10 (screech, chatter) | **iNaturalist** (CC BY-NC, one CC BY, one CC0) | vol. V pl. 48, *Trichoglossus Swainsonii* |
| curlew | 10 (wails, alarm) | xeno-canto | vol. VI pl. 5, *Oedicnemus grallarius* (printed sideways; rotated) |
| boobook | 10 (boo-book, bray, begging) | xeno-canto | vol. I pl. 32, *Athene boobook* |

xeno-canto restricts rainbow lorikeet recordings for conservation reasons (trapping), so its clips were not used; the
lorikeet preset is fitted to research-grade iNaturalist sounds from Australia instead (files `rec/INAT<id>.wav`,
API records in `raw/INAT<id>.json`; coordinates are not copied). Call types again come from the recordists' labels
plus spectrograms, not listening.
