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

## Victorian birds (added 2026-11-21)

| bird | recordings | plate (Gould, *The Birds of Australia*) |
|---|---|---|
| helmeted | 10 — **yellow-tufted honeyeater** (8 iNaturalist CC BY-NC from Victoria, 2 xeno-canto from NSW): no public recordings of the helmeted honeyeater (*L. m. cassidix*) exist, so the preset is the species, named "Yellow-tufted honeyeater" | Supplement (1851-69) pl. 39, *Ptilotis cassidix* |
| fairywren | 10 (reel songs, family calls, alarm) | vol. III pl. 18, *Malurus cyaneus* |
| shrikethrush | 10 (songs, calls) | vol. II pl. 74, *Colluricincla harmonica* |
| whistler | 10 (songs with whip-crack, calls; 3 from Tasmania) | vol. II pl. 64, *Pachycephala gutturalis* |
| raven | 10 (calls, flight calls, subsong, begging) | vol. IV pl. 18, *Corvus coronoides* (no plate of the little raven exists: described 1912) |
| wagtail | 11 (songs, rattles) | vol. II pl. 86, *Rhipidura motacilloides* |
| frogmouth | 11 ('oom' series, huff, alarm, begging) | vol. II pl. 4, *Podargus Cuvieri* |
| galah | 10 (contact/flight calls, screech, alarm, begging) | vol. V pl. 4, *Cacatua Eos* |
| gangang | 10 ('creaky gate' calls, alarm) | vol. V pl. 14, *Callocephalon galeatum* |
| blackcockatoo | 10 (wails, flight screeches, shriek, begging) | vol. V pl. 11, *Calyptorhynchus funereus* |

All xeno-canto clips CC BY-NC-SA 3.0/4.0; the iNaturalist ones CC BY-NC. Every bird also has 1-2 extra plates in
`<bird>/plates/` (Mathews/Grønvold, Greene/Lydon, Shaw & Nodder...), each documented in its `plates.json`.
Frogmouth: whether it calls with the bill closed is undocumented; the open-mouth model also fitted better (87% vs 85%).

## Tūī (added 2026-11-22)

| bird | count | ids | plate |
|---|---|---|---|
| tui | 11 | 958028, 1169417, 1177577, 214591, 321682 (full song); 562526, 842647, 845168, 853667 (bell notes / bell phrases); 1166774, 853670 (chatter / fight calls) | J. G. Keulemans in W. L. Buller, *A History of the Birds of New Zealand*, 2nd ed. (1888), vol. I, pl. X, *Prosthemadera novæ zealandiæ* (Naturalis copy, IA `historybirdsnew1bull`); extra plate in `tui/plates/`: Keulemans' plate from the 1st ed. (1873), NHM London copy (IA `NHM243352`) |

All xeno-canto, mainland New Zealand, quality A, CC BY-NC-SA 4.0 (recordists Ken George, Meena Haribal, Johannes Fischer,
Arne Thelin, Daniel Hinckley). Both plates are public domain (Keulemans died 1912).

- **Chatham Island tūī excluded.** xeno-canto lists Chatham birds (ssp. *chathamensis*) under the same country; XC927458
  and XC956332 were downloaded as candidates, found to be from the Chathams, and dropped.
- **No alarm call.** The only clips labelled "alarm call" are a Chatham bird and a noisy quality-B clip with bellbird and
  whitehead. XC853670 (two tūī fighting) is the nearest aggressive call; the flight "scream" at hawks is missing.
- **Call types weren't checked by listening.** XC845168 and XC853667 are labelled "call" on XC but are repeated bell
  phrases. Some broadband bursts in XC1177577 could be wing whirr (adults have a notched 8th primary that whirrs).
- **Two voices:** XC853667 holds two steady tones (~1.08 and ~1.48 kHz) at once, consistent with the two syrinx sides
  sounding together, but no tūī syrinx study was found to confirm it.
- **1873 plate:** the Smithsonian scan of the 1st edition (IA `historyofbirdsof00bull`) lacks the early plates; the NHM
  copy has it between pp. 86-87. BHL blocks scripted access, so `bhl_url` is empty for both plates.
- **Māori names:** tūī and kōkō (NZ Birds Online, Te Aka Māori Dictionary); Buller (1888) adds 'Pi-tui'/'Pikari' for the
  young. Te Ara refused scripted access, so it isn't cited.
- Facts paraphrased from Wikipedia (CC BY-SA), NZ Birds Online, DOC, Hill & Ji (2014, *Notornis*) and Buller (1888).

## Tasmania (added 2026-11-23)

Four Tasmanian endemics. All xeno-canto, Tasmania (incl. King Island), CC BY-NC-SA 4.0 or CC BY-NC 4.0 (Erin Harris's
ARU clips); ND, CC BY-SA and CC0 were skipped. None of the four species is restricted on xeno-canto.

| bird | count | ids | plate (Gould, *The Birds of Australia*) |
|---|---|---|---|
| currawong (black currawong) | 10 | 826854, 362989, 864547 (ringing calls); 1088805, 716075 (group calling); 1188397, 1188398, 1188442, 1168489 (song / dawn song, ARU); 972179 (crooning at a trail camera) | vol. II pl. 43, *Strepera fuliginosa*, Sooty Crow-Shrike |
| greenrosella (green rosella) | 11 | 1188363, 1188307, 1188310 (piping whistles, King Island); 572344, 893950, 496488, 567415, 345665 (calls); 495655, 1188390 (flight calls); 571183 (foraging chatter) | vol. V pl. 24, *Platycercus flaviventris*, Yellow-bellied Parrakeet; extra plate: Barraband in Levaillant, *Histoire naturelle des perroquets* (1801) pl. 80 |
| duskyrobin (dusky robin) | 8 | 565016, 565012, 565010, 495749 (song); 830799, 496703, 496494, 496495 (calls; 3 are quality B) | vol. III pl. 8, *Petroica fusca*, Dusky Robin |
| yellowwattlebird (yellow wattlebird) | 10 | 826887, 1088808, 1088806, 1038591, 1188464, 1188453 (harsh coughs); 571169, 362982 ('chock'/'kuk' calls); 716177, 748760 (song) | vol. IV pl. 54, *Anthochaera inauris* (List of Plates: Great Wattled Honey-eater); extra plate: Broinowski vol. IV pl. XXVII (same as the red wattlebird's) |

- **Call types weren't checked by listening.** Grouping is from the recordists' labels plus our spectrograms.
  Many clips are labelled 'call, song' or 'dawn song' on XC; for the wattlebird all of them are coughs.
- **Dusky robin: only 8 clips.** Every quality A/B clip from Bruny Island is ND-licensed; the rest are C/D. The song is
  well covered (three long Devonport bouts), calls less so. XC495749 holds higher, varied notes (3.6-4.6 kHz) unlike
  the other songs; no background species is listed, but it should be checked.
- **Green rosella:** the three piping-whistle clips are all King Island birds (ssp. *brownii*, vulnerable) from one
  ARU in the Pegarah forest; the mainland clips are calls only. XC572344: bird unseen ("pretty certain" of the ID).
- **Currawong:** 4 of 10 clips come from one recordist's ARUs (Steppes/Lagoon of Islands); XC864547 has road rumble
  below 0.5 kHz. XC972179 is an unusual soft crooning the recordist has rarely heard.
- **Yellow wattlebird:** XC362983 was downloaded and dropped (busy background, half its energy above 8 kHz), replaced by
  XC1188453. XC748760 was noise-reduced and high-passed at 400 Hz by the recordist.
- **BHL links** are the Gould part pages, confirmed through Crossref titles of DOIs 10.5962/p.312970, p.313256,
  p.313039 and p.313182. Internet Archive leaves verified by eye (plate lettering).
- **Indigenous (palawa kani) names:** none cited; no citable source was found for any of the four.
- **Anatomy** is group-level (songbird/parrot); no species-specific syrinx study exists for any of them.
- Facts paraphrased from Wikipedia (CC BY-SA), the Australian Museum, the Australian Faunal Directory, BirdLife
  International, the IOC list and Gould's text.
