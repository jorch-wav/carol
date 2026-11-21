#!/usr/bin/env python3
"""Build data/<id>/sources.json from parsed XC pages, converted WAVs, plate info and info.json.
Usage: python3 -I build_sources.py [bird ...] [--out DIR]   (default: all birds, written to data/<bird>/sources.json;
--out writes DIR/<bird>.sources.json instead, for diffing). Paths are absolute; reads only text/JSON, executes nothing."""
import json, os, subprocess, sys, glob

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from xc_parse_rec import parse  # noqa: E402

DATA = "/home/audioview/synths/carol/data"

# Our own grouping of each clip into the call types the synth needs.
# Based on the recordist's XC sound type + remarks; NOT verified by listening.
CATEGORY = {
    "magpie": {
        "1069711": "carolling (group chorus)",
        "217874": "carolling (2 adults + juvenile singing together)",
        "729284": "carolling (duet)",
        "383930": "solo song (male; another bird answers in distance)",
        "1041375": "warbling song (quiet solo warble / subsong)",
        "1163888": "solo song (male)",
        "1169115": "song (unspecified)",
        "826873": "call ('typical call')",
        "1170181": "call (unspecified)",
    },
    "kookaburra": {
        "371518": "laugh chorus (4 birds)",
        "620165": "laugh chorus (4-5 birds)",
        "1169858": "laugh chorus (group)",
        "817868": "laugh duet (2 adults)",
        "1188306": "laugh duet (2 birds)",
        "464406": "single-bird calls (one bird, then mobbed)",
        "611558": "single-bird call (one call)",
        "1104895": "single-bird call (adult male)",
        "716894": "call (unspecified; candidate 'kooa'/short calls)",
        "937218": "call (unspecified; short, candidate 'kooa'/short calls)",
    },
    "wattlebird": {
        "1062583": "call (unspecified; harsh call/chock candidate)",
        "1163878": "call (unspecified; harsh call/chock candidate)",
        "935428": "calls (unspecified; harsh call/chock candidate)",
        "1135593": "calls (many birds)",
        "612413": "calls (several birds)",
        "577691": "calls + song (several birds feeding, WA subspecies woodwardi)",
        "1072282": "flight call",
        "935870": "song (possible whistles)",
        "935871": "song (possible whistles)",
        "672982": "dawn song (possible whistles)",
    },
    "rosella": {
        "1050086": "song (likely piping contact whistle)",
        "1069586": "song (likely piping contact whistle)",
        "1072331": "song (likely piping contact whistle)",
        "1072332": "song (likely piping contact whistle)",
        "1173944": "call + song",
        "1166584": "call (unspecified)",
        "354603": "call (unspecified; P. e. elegans)",
        "839934": "call (unspecified)",
        "935328": "call (unspecified)",
        "935511": "call + flight call (adult male)",
    },
    "quetzal": {
        "1188164": "song (series of slurred 'kyow'/'keow' whistles)",
        "1188163": "song (series of slurred 'kyow'/'keow' whistles)",
        "774050": "song (series of slurred 'kyow'/'keow' whistles)",
        "137766": "song (male; long bout of whistles)",
        "872148": "song (male at close range; XC type left blank)",
        "326653": "calls + flight calls (two males 'shouting'; harsh cackles)",
        "332262": "alarm call (female)",
        "133593": "call (male)",
        "498299": "call (male)",
        "171051": "calls (two birds perching and flying)",
    },
    "pigeon": {
        "342145": "song (coo; domestic pigeon)",
        "116226": "song (coo; male)",
        "48676": "song (coo series)",
        "270097": "song (coo; C. l. domestica)",
        "269762": "calls + song (coos)",
        "462611": "calls + flight call + song (coos)",
        "178529": "call series (1-9 coos from a cliff tree; perch coo candidate)",
        "169211": "calls at nest-building (nest call candidate) + wingbeats",
        "316785": "nest call + juvenile begging calls + wing whirr (other species and water in background)",
        "121677": "alarm call + alarm wing-clapping (goshawk hunting)",
    },
    "cardinal": {
        "1093538": "song (repeated slurred whistles, 'cheer'/'birdie'-type series)",
        "1010609": "song (male; intro notes + rapid down-slurred series)",
        "1012494": "song (rapid slurred series)",
        "962371": "song (male; slow whistles + long trill; noisy background)",
        "738212": "song (male; slow then fast series)",
        "721721": "dawn song",
        "1070756": "chip calls (very clean series)",
        "682547": "chip calls (single male)",
        "1010649": "chip calls",
        "1012917": "alarm call / churr (rolled call; short, noisy)",
    },
    "robin": {
        "1080724": "song (spring/late-winter, Feb; London)",
        "1089386": "dawn song (spring, male; Mar)",
        "1104628": "song (spring, May; Sweden)",
        "1141104": "song (late winter, Feb; London)",
        "943953": "autumn song (Oct; falling leaves in background)",
        "1181903": "autumn song (late Sep; France)",
        "1192854": "alarm 'tic' calls (rapid ticking)",
        "998115": "alarm 'tic' calls (regular ticking, ~7 kHz)",
        "1191139": "thin high 'tsee'/'siuu' alarm calls, then song",
        "661755": "thin high 'tseee' alarm calls (descending ~9-6.5 kHz) + some ticks",
        "1190377": "calls (ticks mixed with song-like phrases; autumn)",
    },
}

# Plate fields that differ from The Birds of Australia defaults (used by the four Australian birds).
PLATE_DEFAULTS = dict(
    work="John Gould, The Birds of Australia (London, 1840-1848), 7 vols, folio",
    artist_credit="J. Gould and H. C. Richter del et lith.",
    copy="Smithsonian Libraries copy, digitised for the Biodiversity Heritage Library",
    licence="Public domain (published 1840-1848; BHL/IA: 'no longer under copyright protection')",
)

PLATES = {
    "magpie": dict(gould_name="Gymnorhina tibicen", gould_common_name="Piping Crow-Shrike", volume="II", plate="46",
                   ia_id="birdsAustraliav2Goul", leaf=192, bhl_part="https://www.biodiversitylibrary.org/part/312973",
                   printer="C. Hullmandel"),
    "kookaburra": dict(gould_name="Dacelo gigantea", gould_common_name="Great Brown Kingfisher", volume="II", plate="18",
                       ia_id="birdsAustraliav2Goul", leaf=80, bhl_part="https://www.biodiversitylibrary.org/part/312945",
                       printer="C. Hullmandel"),
    "wattlebird": dict(gould_name="Anthochaera carunculata", gould_common_name="Wattled Honey-eater", volume="IV", plate="55",
                       ia_id="birdsAustraliav4Goul", leaf=232, bhl_part="https://www.biodiversitylibrary.org/part/313183",
                       printer="Hullmandel & Walton"),
    "rosella": dict(gould_name="Platycercus pennantii", gould_common_name="Pennant's Parrakeet", volume="V", plate="23",
                    ia_id="birdsAustraliav5Goul", leaf=100, bhl_part="https://www.biodiversitylibrary.org/part/313255",
                    printer="Hullmandel & Walton"),
    # Plates in these two works carry no printed plate number; "plate" is the BHL sequence/part position.
    "quetzal": dict(gould_name="Pharomacrus mocinno", gould_common_name="Quezal",
                    volume="Part III (1875) of the 2nd edition",
                    plate="unnumbered (first plate of Part III)",
                    ia_id="monographtrogon3goul", leaf=4, bhl_part="https://www.biodiversitylibrary.org/part/323638",
                    printer=None,
                    work="John Gould, A Monograph of the Trogonidae, or Family of Trogons, 2nd ed. (London, 1858-1875), "
                         "1 vol. issued in 4 parts, folio",
                    artist_credit="J. Gould & W. Hart del et lith.",
                    copy="Harvard University, Museum of Comparative Zoology, Ernst Mayr Library copy, "
                         "digitised for the Biodiversity Heritage Library",
                    licence="Public domain (published 1875; BHL/IA: 'no longer under copyright protection')"),
    "pigeon": dict(gould_name="Columba livia, Temm.", gould_common_name="Rock-Pigeon",
                   volume="IV", plate="3 (BHL sequence; not printed on the plate)",
                   ia_id="birdsgreatbrita4goul", leaf=20, bhl_part="https://www.biodiversitylibrary.org/part/323964",
                   printer="Walter,",
                   work="John Gould, The Birds of Great Britain (London, 1862-1873), 5 vols, folio",
                   artist_credit="J. Gould & H. C. Richter, del et lith.",
                   licence="Public domain (published 1862-1873; BHL/IA: 'no longer under copyright protection')"),
    # Entries with "image" give the whole image block directly (used as-is by main()).
    "robin": dict(image={
        "file": "plate.jpg",
        "raw_file": "raw/birdsgreatbrita2goul_0196.jp2",
        "work": "John Gould, The Birds of Great Britain (London, 1862-1873), 5 vols, folio",
        "artist": "John Gould",
        "volume": "II",
        "plate": "48 (BHL/List of Plates sequence; not printed on the plate)",
        "name_on_plate": "Erythacus rubecula.",
        "gould_common_name": "Robin, or Redbreast",
        "common_name_note": "Gould's English name from the text page and List of Plates; only the Latin name is lettered on the plate",
        "artist_credit_on_plate": "J. Gould & H. C. Richter, del. et lith.",
        "printer_on_plate": "Walter, Imp.",
        "copy": "Smithsonian Libraries copy, digitised for the Biodiversity Heritage Library",
        "source_page_url": "https://archive.org/details/birdsgreatbrita2goul/page/n195/mode/1up",
        "source_file_url": "https://archive.org/download/birdsgreatbrita2goul/birdsgreatbrita2goul_jp2.zip/"
                           "birdsgreatbrita2goul_jp2%2Fbirdsgreatbrita2goul_0196.jp2",
        "bhl_url": "https://www.biodiversitylibrary.org/part/323862",
        "bhl_doi": "10.5962/p.323862",
        "licence": "Public domain (published 1862-1873; BHL/IA: 'no longer under copyright protection')",
        "processing": "JP2 -> RGB, resized to 900 px tall (Lanczos), JPEG quality 85 (tools/make_plate.py)",
    }),
    "cardinal": dict(image={
        "file": "plate.jpg",
        "raw_file": "raw/159_Cardinal_Grosbeak_3840px.jpg",
        "work": "John James Audubon, The Birds of America (London, 1827-1838), Havell double-elephant folio edition, 4 vols",
        "artist": "John James Audubon",
        "volume": "II",
        "plate": "159 (lettered 'PLATE CLIX'; issued in Number 32, lettered 'No. 32')",
        "name_on_plate": "Fringilla cardinalis, Bonap.",
        "other_lettering": "'Cardinal Grosbeak' (title), 'Male 1. Female 2.', 'Wild Almond' (plant)",
        "gould_common_name": "Cardinal Grosbeak",
        "artist_credit_on_plate": "Drawn from Nature by J. J. Audubon, F.R.S. F.L.S. / "
                                  "Engraved, Printed & Coloured, by R. Havell, London, 1833.",
        "printer_on_plate": "R. Havell, London, 1833 (engraved, printed and coloured)",
        "copy": "University of Pittsburgh copy (Darlington Digital Library), via Wikimedia Commons",
        "source_page_url": "https://commons.wikimedia.org/wiki/File:159_Cardinal_Grosbeak.jpg",
        "original_source_url": "https://images.library.pitt.edu/cgi-bin/i/image/image-idx?view=entry;cc=audimg;entryid=x-aud0159",
        "source_file_url": "https://upload.wikimedia.org/wikipedia/commons/thumb/9/97/159_Cardinal_Grosbeak.jpg/"
                           "3840px-159_Cardinal_Grosbeak.jpg",
        "full_resolution_url": "https://upload.wikimedia.org/wikipedia/commons/9/97/159_Cardinal_Grosbeak.jpg",
        "bhl_url": None,
        "licence": "Public domain (published 1833; Wikimedia Commons: PD-old / Public Domain Mark 1.0)",
        "processing": "Commons 3840 px rendition of the 11096x15968 scan, cropped to the plate mark (box 1060,1330,2840,4090), "
                      "resized to 900 px tall (Lanczos), JPEG quality 85 (tools/make_plate.py)",
    }),
}

# Australian birds batch 2 (2026-11-18): lyrebird, butcherbird, whipbird, bellminer.
# Kept as separate update() calls so parallel additions don't collide.
CATEGORY.update({
    "lyrebird": {
        "1019456": "mimetic song (adult male on the ground; 'click' walking sounds from 1:49)",
        "342585": "mimetic song (whistler, shrike-thrush, kookaburra, rosella, whipbird, magpie, black-cockatoo)",
        "195488": "display song with mimicry (male displaying to a female)",
        "492308": "male song with mimicry (Sherbrooke; answering song in the distance)",
        "134449": "mimetic song + alarm calls (single male between feeding bouts)",
        "832555": "song from a display ground (mimicry-rich)",
        "1172718": "mimetic song (adult male)",
        "1163848": "song (adult male)",
        "1040676": "song: repeated descending whistle series (candidate own territorial song; young male or female?)",
        "738172": "alarm calls (high shrieks, ~5-6 kHz)",
        "195481": "alarm calls at a feral cat (~5-6 kHz) + brief own song",
    },
    "butcherbird": {
        "659987": "song (single bird)",
        "593567": "song (two birds in a tree)",
        "602050": "song (flute-like phrase at 0:00, then several birds)",
        "588690": "dawn song (occasional flying-fox calls)",
        "745123": "pre-dawn solo song (WA, ssp. picatus range; recordist was unsure of the ID)",
        "580386": "duet song (male + female)",
        "134229": "group song (4 birds, at least 3 singing)",
        "480923": "call (single piping notes)",
        "1170098": "call (adult)",
        "517761": "call (adult)",
    },
    "whipbird": {
        "543002": "male whip-crack song (one burst, unfiltered)",
        "326392": "male whip-crack songs (two, territorial dispute)",
        "979796": "duet: male whip-crack (distant) + female answer (close)",
        "201977": "duet: male whip-crack then female reply, close (bell miners in background)",
        "775346": "duet (male + female)",
        "140207": "duet (pair)",
        "647331": "antiphonal duet calls (ssp. lateralis area)",
        "345114": "grunt contact calls (pair feeding)",
        "441817": "calls while feeding (contact calls)",
        "140208": "rasping call",
    },
    "bellminer": {
        "1069583": "tink calls (XC type: song)",
        "1169747": "tink calls (XC type: song)",
        "1169748": "tink calls (XC type: song)",
        "1169749": "tink calls (XC type: song)",
        "370405": "tink calls + song",
        "401153": "tink calls + song",
        "344274": "tink calls",
        "140198": "tink calls",
        "134453": "tink calls (colony)",
        "854434": "tink calls",
    },
})

PLATES.update({
    "lyrebird": dict(gould_name="Menura superba", gould_common_name="Lyre-Bird", volume="III", plate="14",
                     ia_id="birdsAustraliav3Goul", leaf=64, bhl_part="https://www.biodiversitylibrary.org/part/313045",
                     printer="C. Hullmandel", artist_credit="J. & E. Gould delt."),
    "whipbird": dict(gould_name="Psophodes crepitans", gould_common_name="Coach-whip Bird", volume="III", plate="15",
                     ia_id="birdsAustraliav3Goul", leaf=68, bhl_part="https://www.biodiversitylibrary.org/part/313046",
                     printer="C. Hullmandel", artist_credit="J. & E. Gould delt."),
    "butcherbird": dict(gould_name="Cracticus nigrogularis", gould_common_name="Black-throated Crow-Shrike", volume="II",
                        plate="49", ia_id="birdsAustraliav2Goul", leaf=204,
                        bhl_part="https://www.biodiversitylibrary.org/part/312976", printer="Hullmandel & Walton"),
    # Plate is lettered with the older name Myzantha viridis; Gould's text page uses Myzantha melanophrys.
    "bellminer": dict(gould_name="Myzantha viridis", gould_common_name="Australian Bell-bird", volume="IV", plate="80",
                      ia_id="birdsAustraliav4Goul", leaf=332, bhl_part="https://www.biodiversitylibrary.org/part/313208",
                      printer="Hullmandel & Walton"),
})


# Cockatoo, lorikeet, curlew, boobook (added 2026-11-18). Rainbow lorikeet downloads are restricted on xeno-canto
# ("conservation concerns"), so its clips come from iNaturalist (INAT below), not XC.
CATEGORY.update({
    "cockatoo": {
        "354599": "screech contact calls (two perched birds calling alternately)",
        "1071627": "screech calls",
        "586987": "screech calls",
        "517536": "screech calls",
        "1088472": "screech calls + flight calls",
        "566248": "screech calls + flight calls",
        "195632": "screech series (XC type: song)",
        "1173884": "short screech series (XC type: song)",
        "1177819": "alarm screeches (at a brushtail possum; ~10 more birds join)",
        "321213": "juvenile begging call (rasping, more tonal; noisy background)",
    },
    "lorikeet": {},
    "curlew": {
        "597375": "'weer-lo' territorial wails (pair), then louder calls taking flight",
        "589419": "'weer-lo' nocturnal territorial duet (male + female; flying fox at 0:08-0:10)",
        "1074100": "'weer-lo' duet (XC type: duet, song)",
        "539222": "'weer-lo' wails (XC type: call, song)",
        "539213": "'weer-lo' wails, long bout (XC type: call, song)",
        "857992": "pre-dawn 'weer-lo' song (rooster in background)",
        "755680": "'weer-lo' chorus (flock of ~30 resting in a park)",
        "1038616": "calls (wind noise filtered)",
        "641037": "chorus: one bird starts, others join (brown honeyeater in background)",
        "539184": "alarm call ('intimidating' screech/hiss at a campervan)",
    },
    "boobook": {
        "351978": "'boo-book' hoots (typical advertising call; clean)",
        "1173887": "'boo-book' hoots",
        "414340": "'boo-book' hoots (night)",
        "1188100": "'boo-book' hoots",
        "1133190": "'boo-book' hoots, long bout (insects ~6 kHz in background)",
        "1094530": "'boo-book' hoots, pair duet, then one bird changes call",
        "863940": "normal hoots + braying call",
        "863942": "braying call + normal hoots (duet)",
        "513811": "juvenile begging calls (wheezy, ~5-6 kHz) + flight call",
        "777794": "juvenile begging calls (wheezy, ~5.5-6.5 kHz)",
    },
})

# iNaturalist clips: sound id -> our category. raw/INAT<id>.json holds the API record (observation + sound),
# raw/INAT<id>.<ext> the original file. Coordinates are deliberately not copied into sources.json.
INAT = {
    "lorikeet": {
        "1752421": "screech calls (clear harmonic stacks)",
        "1677411": "screech calls (single bird, clean)",
        "1979743": "screech calls",
        "1969471": "screech calls (Perth, introduced population)",
        "155067": "calls (two birds visible, more audible)",
        "556449": "screeches + chatter (several birds)",
        "73279": "chatter + calls",
        "2170180": "chatter + screeches",
        "638092": "feeding flock chatter (fig tree; noise burst near end)",
        "171953": "dense flock chatter (morning)",
    },
}

INAT_LICENCES = {
    "cc-by-nc": ("Creative Commons Attribution-NonCommercial 4.0", "https://creativecommons.org/licenses/by-nc/4.0/"),
    "cc-by": ("Creative Commons Attribution 4.0", "https://creativecommons.org/licenses/by/4.0/"),
    "cc0": ("Creative Commons CC0 1.0 Universal (public domain dedication)", "https://creativecommons.org/publicdomain/zero/1.0/"),
}


def inat_record(d, sid, cat):
    """Metadata dict for an iNaturalist sound, from raw/INAT<sid>.json (saved API response). Text/JSON only."""
    j = json.load(open(os.path.join(d, "raw", f"INAT{sid}.json")))
    o, s = j["observation"], j["sound"]
    lic_name, lic_url = INAT_LICENCES[s["license_code"]]  # KeyError = licence not on the allowed list
    u = o["user"]
    who = u.get("name") or u["login"]
    raw = glob.glob(os.path.join(d, "raw", f"INAT{sid}.*"))
    raw = [r for r in raw if not r.endswith(".json")][0]
    wav = f"rec/INAT{sid}.wav"
    pr = probe(os.path.join(d, wav))
    return {
        "inat_sound_id": str(sid), "inat_observation_id": str(o["id"]),
        "url": f"https://www.inaturalist.org/observations/{o['id']}",
        "download_url": s["file_url"],
        "recordist": who, "recordist_login": u["login"],
        "licence_name": lic_name, "licence_url": lic_url,
        "rights_as_given": s.get("attribution", ""),
        "country": "Australia", "location": o.get("place_guess") or "",
        "location_obscured": bool(o.get("obscured")),
        "date": o.get("observed_on") or "", "time": (o.get("time_observed_at") or "")[11:16],
        "quality_grade": o.get("quality_grade"), "species_as_listed": o["taxon"]["name"],
        "remarks": (o.get("description") or "").strip(),
        "length_s": pr["duration_s"], "carol_category": cat,
        "raw_file": "raw/" + os.path.basename(raw), "wav_file": wav, "wav": pr,
        "source": "iNaturalist",
        "attribution": f"iNaturalist sound {sid} (observation {o['id']}) by {who}, "
                       f"inaturalist.org/observations/{o['id']}, {lic_name}",
    }


PLATES.update({
    "cockatoo": dict(gould_name="Cacatua galerita: Vieill.", gould_common_name="Crested Cockatoo", volume="V", plate="1",
                     ia_id="birdsAustraliav5Goul", leaf=12, bhl_part="https://www.biodiversitylibrary.org/part/313233",
                     printer="C. Hullmandel"),
    "lorikeet": dict(gould_name="Trichoglossus Swainsonii: Jard. & Selb.", gould_common_name="Swainson's Lorikeet",
                     volume="V", plate="48", ia_id="birdsAustraliav5Goul", leaf=200,
                     bhl_part="https://www.biodiversitylibrary.org/part/313280", printer="C. Hullmandel",
                     artist_credit="J. Gould and H. C. Richter delt."),
    # Printed sideways on the sheet (landscape); plate.jpg is rotated 90 degrees clockwise to stand upright.
    "curlew": dict(gould_name="Oedicnemus grallarius.", gould_common_name="Southern Stone Plover", volume="VI", plate="5",
                   ia_id="birdsAustraliav6Goul", leaf=28, bhl_part="https://www.biodiversitylibrary.org/part/313329",
                   printer="Hullmandel & Walton",
                   processing="JP2 -> RGB, rotated 90 degrees clockwise (plate is printed sideways), resized to 900 px tall "
                              "(Lanczos), JPEG quality 85 (tools/make_plate.py --rotate=-90)"),
    "boobook": dict(gould_name="Athene boobook.", gould_common_name="Boobook Owl", volume="I", plate="32",
                    ia_id="birdsAustraliav1Goul", leaf=264, bhl_part="https://www.biodiversitylibrary.org/part/312923",
                    printer="Hullmandel & Walton"),
})


# Galah, gang-gang cockatoo, yellow-tailed black-cockatoo (added 2026-11-21). All xeno-canto, CC BY-NC-SA.
# Gang-gang downloads are not restricted on xeno-canto (checked 2026-11-21), so no iNaturalist fallback was needed.
CATEGORY.update({
    "galah": {
        "935423": "contact calls + flight calls ('chet'/'chi-chi' screeches; arched harmonic stacks)",
        "953252": "single screech (one loud harsh call)",
        "1138701": "contact screeches (single bird, clean; Tasmania, introduced range)",
        "1166610": "calls + flight calls",
        "506844": "calls (adults + juveniles)",
        "330259": "flight calls (two birds calling while flying away; ssp. albiceps)",
        "495757": "flight call series (Tasmania, introduced range)",
        "935909": "flock flight calls (about 30 birds)",
        "506845": "alarm calls (small flock incl. immatures flying off in alarm)",
        "935797": "juvenile begging calls (adult feeding 3 young) + calls",
    },
    "gangang": {
        "1169134": "'creaky gate' contact calls (adult male)",
        "1169163": "'creaky gate' calls + flight calls (adult female)",
        "1169159": "'creaky gate' flight calls (pair)",
        "1169118": "'creaky gate' calls + flight calls, long bout (male + female)",
        "1169744": "creaky calls + flight calls; one tonal growl-like call",
        "1072734": "'creaky gate' calls, long bout (2 birds)",
        "1172996": "creaky calls + soft growls",
        "330260": "creaky calls (wild immature male + captive male at Healesville Sanctuary)",
        "187882": "flock calls: creaks + frequency-modulated growls (males and females perched and flying)",
        "622269": "alarm/flight calls (flock startled from a tree by a wedge-tailed eagle; quality B)",
    },
    "blackcockatoo": {
        "1166249": "wailing contact calls ('kee-ow'; clean harmonic stacks)",
        "1166250": "wailing flight calls (2 birds; clean harmonic stacks)",
        "1166621": "wailing calls + harsh screech segments",
        "935512": "wailing calls + flight calls (adult male perched on a treetop)",
        "935853": "wailing calls + flight calls (few birds)",
        "871224": "wailing contact calls, long bout (2 birds)",
        "1072333": "harsh screeching flight calls (4 birds)",
        "1103268": "flock calls (large flock feeding on pine cones; mixed wails and screeches)",
        "826853": "harsh squawks and shrieks while feeding on banksia (alarm-type screech candidate; Tasmania, ssp. xanthanota)",
        "345044": "juvenile begging calls (rasping, rhythmic)",
    },
})

PLATES.update({
    "galah": dict(gould_name="Cacatua Eos.", gould_common_name="Rose-breasted Cockatoo", volume="V", plate="4",
                  ia_id="birdsAustraliav5Goul", leaf=24, bhl_part="https://www.biodiversitylibrary.org/part/313236",
                  printer="Hullmandel & Walton"),
    "blackcockatoo": dict(gould_name="Calyptorhynchus funereus.", gould_common_name="Funereal Cockatoo", volume="V",
                          plate="11", ia_id="birdsAustraliav5Goul", leaf=52,
                          bhl_part="https://www.biodiversitylibrary.org/part/313243", printer="Hullmandel & Walton"),
    "gangang": dict(gould_name="Callocephalon galeatum.", gould_common_name="Gang-gang Cockatoo", volume="V", plate="14",
                    ia_id="birdsAustraliav5Goul", leaf=64, bhl_part="https://www.biodiversitylibrary.org/part/313246",
                    printer="Hullmandel & Walton"),
})


# Little raven, willie-wagtail, tawny frogmouth (added 2026-11-21). All xeno-canto, CC BY-NC-SA (3.0/4.0).
# Call types from the recordists' labels plus our spectrograms (not checked by ear).
CATEGORY.update({
    "raven": {
        "935829": "'ah-ah-ah' call series, long bout (Cape Otway, Vic)",
        "996951": "'ah-ah-ah' calls, single adult on a fence (some wind)",
        "1062642": "calls, drawn-out 'aaah' notes (French Island, Vic)",
        "211338": "'ah-ah-ah' call series (Castlemaine, Vic)",
        "937188": "calls (park, Ferntree Gully, Vic)",
        "935842": "call series (XC type: song)",
        "539397": "flight calls (strong wind)",
        "505696": "quiet creaking subsong of a single bird, then two loud calls (traffic noise; blackbird, wattlebird in background)",
        "1069409": "juvenile begging calls (perched near an adult)",
        "330280": "immature 'honking' calls while eating (other birds audible)",
    },
    "wagtail": {
        "953372": "song ('sweet pretty creature' phrases; Lake Fyans, Vic)",
        "935809": "song (adult male; Cape Otway, Vic; other birds audible)",
        "767239": "song, long bout (Wangaratta, Vic; creek and traffic noise)",
        "1069909": "song (adult male, ssp. leucophrys)",
        "1069588": "song",
        "155135": "song phrase (repeated day and night)",
        "1170174": "alarm rattle 'chit-chit-chit'",
        "1170177": "alarm rattle (short, clean)",
        "1069587": "alarm rattle + calls while mobbing a pied currawong",
        "517759": "ratchetting call (rattle)",
        "606516": "two birds: ratchety alarm call + whistled notes (magpie in background)",
    },
    "frogmouth": {
        "953020": "'oom' series, probably male, 12 series (female in background; strong wind)",
        "953019": "'oom' series, probably female (higher, about 345 Hz; strong wind)",
        "586832": "'oom' series, bird 4 m overhead (light wind)",
        "375096": "'oom' series, male calling to female in the same tree",
        "1173996": "'oom' series (Dandenong Ranges, Vic)",
        "561573": "'oom' series, bird flies in next to the recorder (ssp. brachypterus, central Australia)",
        "643067": "'oom' calls after dark (rhythmic background sound near 2 kHz)",
        "697079": "'oom' calls in daylight (magpie and other birds in background)",
        "396564": "repeated 'huff' call",
        "692557": "alarm call at roost (noisy bursts; lorikeets nearby)",
        "842281": "begging calls, 2 juveniles to a parent (crickets in background)",
    },
})

# No Gould plate for the little raven (described in 1912): his "White-eyed Crow" stands for the Australian raven complex.
# Frogmouth: Gould's Podargus Cuvieri (Tasmanian/southern birds, now P. s. strigoides) chosen over P. humeralis
# (pl. 3, bird shown asleep with the bill hidden) because it shows the open eye, bill and bristles.
PLATES.update({
    "raven": dict(gould_name="Corvus coronoides: Vig. et Horsf.", gould_common_name="White-eyed Crow", volume="IV",
                  plate="18", ia_id="birdsAustraliav4Goul", leaf=84,
                  bhl_part="https://www.biodiversitylibrary.org/part/313146", printer="Hullmandel & Walton"),
    "wagtail": dict(gould_name="Rhipidura motacilloides: Vig. & Horsf.", gould_common_name="Black Fantailed Flycatcher",
                    volume="II", plate="86", ia_id="birdsAustraliav2Goul", leaf=352,
                    bhl_part="https://www.biodiversitylibrary.org/part/313013", printer="Hullmandel & Walton"),
    "frogmouth": dict(gould_name="Podargus Cuvieri: Vig. and Horsf.", gould_common_name="Cuvier's Podargus", volume="II",
                      plate="4", ia_id="birdsAustraliav2Goul", leaf=24,
                      bhl_part="https://www.biodiversitylibrary.org/part/312931", printer="Hullmandel & Walton"),
})


# Helmeted honeyeater, superb fairywren, grey shrikethrush, golden whistler (added 2026-11-21).
# Helmeted honeyeater (L. melanops cassidix): xeno-canto shows no cassidix recordings and iNaturalist has none with
# sound, so the clips are YELLOW-TUFTED honeyeaters of other subspecies (8 iNaturalist from Victoria + 2 XC from NSW).
# Call types from the recordists' labels plus our spectrograms (not checked by ear).
CATEGORY.update({
    "helmeted": {
        "382239": "piping single-note calls + sharp rasps while feeding (yellow-tufted, NSW; clean)",
        "399104": "song (yellow-tufted, ssp. melanops, NSW; quiet, few phrases)",
    },
    "fairywren": {
        "935812": "reel song (Type I trill; adult male)",
        "935405": "reel song (Type I trill; female)",
        "935399": "reel song (Type I trill; female)",
        "1173642": "reel song (short, close)",
        "1069584": "reel song (adult male, ssp. cyanochlamys area)",
        "1173655": "reel songs (XC type: call)",
        "1173656": "reel songs, long bout (XC type: call; grey fantail in background)",
        "1169745": "family group calls + song (female, male, juvenile)",
        "1069722": "female calls + song",
        "370623": "alarm 'chit' calls (Tasmania; hum band in background, golden whistler in background)",
    },
    "shrikethrush": {
        "1062933": "song (whistled phrases, very clean)",
        "1169110": "song (loud whistle + chattering notes)",
        "1173699": "song (sparse phrases, long bout)",
        "858841": "song (adult male; ringing whistles with steep slurs)",
        "935836": "song (dense, varied phrases)",
        "953166": "song (long bout of phrases)",
        "1173877": "calls (single ringing notes)",
        "1173902": "calls (single notes; insect/pulse train in background)",
        "1173904": "calls (single ringing notes, very clean)",
        "841626": "contact calls (after playback)",
    },
    "whistler": {
        "1166258": "song (whistled notes + whip-crack ending; adult male, very clean)",
        "1166261": "song (single phrase with whip-crack, clean)",
        "1072326": "song (two phrases with whip-crack)",
        "1072036": "song (long bout of repeated phrases)",
        "268284": "song (ssp. youngi; loud, in eucalypt midstorey)",
        "1172737": "calls + song (upslurred calls)",
        "755564": "calls + song (adult male)",
        "496498": "female song + calls (Tasmania, ssp. glaucura)",
        "495653": "female calls (upslurred 'seep' type; Tasmania)",
        "572086": "calls (Tasmania; thornbill-like chatter in background)",
    },
})

INAT.update({
    "helmeted": {
        "1799241": "harsh 'chop' calls (yellow-tufted, Yackandandah VIC, song meter; steady ~6.4 kHz insect tone)",
        "1799242": "whistled notes ~2.9 kHz + harsh calls (Yackandandah VIC, song meter; ~6.5 kHz insect tone)",
        "1802747": "calls: harsh notes + slurred whistles (Yackandandah VIC, song meter; noisy)",
        "1806719": "calls + chatter, slurred notes (Yackandandah VIC, song meter)",
        "1806730": "calls: harsh bursts + whistles (Yackandandah VIC, song meter; noisy)",
        "610827": "slurred upward whistles, song-like (Wingan River VIC; 22 kHz source, noisy)",
        "822785": "whistles + harsh rasps (Olinda VIC, Dandenong Ranges)",
        "874404": "short calls, probably a juvenile (Crooked River VIC)",
    },
})

# Helmeted honeyeater plate is from Gould's Supplement (1851-69), not the 7 main volumes; supplement plates carry no
# printed number ("plate" is the BHL sequence; Crossref title of 10.5962/p.323738 says [Pl. 39]).
PLATES.update({
    "helmeted": dict(gould_name="Ptilotis cassidix, Jard.", gould_common_name="Helmeted Honey-eater",
                     volume="Supplement (1869)", plate="39 (BHL sequence; not printed on the plate)",
                     ia_id="birdsAustraliasSuppGoul", leaf=166,
                     bhl_part="https://www.biodiversitylibrary.org/part/323738", printer="Walter,",
                     work="John Gould, The Birds of Australia, Supplement (London, 1851-1869), 1 vol., folio",
                     artist_credit="J. Gould and H. C. Richter, del et lith.",
                     licence="Public domain (published 1851-1869; BHL/IA: 'no longer under copyright protection')"),
    "fairywren": dict(gould_name="Malurus cyaneus: Vieill.", gould_common_name="Blue Wren", volume="III", plate="18",
                      ia_id="birdsAustraliav3Goul", leaf=80, bhl_part="https://www.biodiversitylibrary.org/part/313049",
                      printer="C. Hullmandel", artist_credit="J. & E. Gould delt."),
    "shrikethrush": dict(gould_name="Colluricincla harmonica.", gould_common_name="Harmonious Colluricincla",
                         volume="II", plate="74", ia_id="birdsAustraliav2Goul", leaf=304,
                         bhl_part="https://www.biodiversitylibrary.org/part/313001", printer="Hullmandel & Walton"),
    "whistler": dict(gould_name="Pachycephala gutturalis.", gould_common_name="Guttural Pachycephala", volume="II",
                     plate="64", ia_id="birdsAustraliav2Goul", leaf=264,
                     bhl_part="https://www.biodiversitylibrary.org/part/312991", printer="Hullmandel & Walton"),
})


# Tūī (added 2026-11-22). All xeno-canto, mainland New Zealand (Chatham Island ssp. chathamensis clips excluded),
# quality A, CC BY-NC-SA 4.0. Call types from the recordists' labels plus our spectrograms (not checked by ear).
# No clean mainland alarm-call recording exists on xeno-canto (the only labelled ones are Chatham birds or noisy B clips).
CATEGORY.update({
    "tui": {
        "958028": "full song, dense (excited adult male, Tiritiri Matangi; bell notes, clicks, wheezes, high notes to ~10 kHz)",
        "1169417": "full song, long bout (Golden Bay; bell notes, clicks, wheezes, harmonic stacks)",
        "1177577": "full song with loud broadband wheezes (spring; some bursts may be wing whirr)",
        "214591": "song, short bout (Wellington; mixed tonal notes, clicks and one wheeze)",
        "321682": "song (Whangaparaoa; tonal notes, rapid repeated notes, high slurs)",
        "562526": "song, long unfiltered bout (Tāwharanui; repeated bell-like notes ~2.7-3.5 kHz, sparse phrases)",
        "842647": "song: harmonic 'bell' stacks (partials ~1.27 kHz apart) alternating with wheezes (Kāpiti Coast dialect)",
        "845168": "repeated bell phrase: steady ~1.24 kHz tone + ~2.4 kHz partial (XC type: call; male spring territory song)",
        "853667": "repeated bell phrase: 2.25 kHz harmonic note, then two simultaneous tones ~1.08 + 1.48 kHz, then a wheeze (XC type: call)",
        "1166774": "chatter calls (greeting/antagonistic call as one tui joins another; rapid arched notes ~1.3-2.1 kHz)",
        "853670": "fight calls: rapid harmonic chatter between two tui + wing contact (aggressive/alarm-type candidate)",
    },
})

# Tūī plate: Keulemans' chromolithograph in Buller's 2nd edition (1888); the 1873 1st-edition plate is in plates/.
PLATES.update({
    "tui": dict(image={
        "file": "plate.jpg",
        "raw_file": "raw/historybirdsnew1bull_0201.jp2",
        "work": "Walter L. Buller, A History of the Birds of New Zealand, 2nd ed. (London: published for the subscribers by "
                "the author, 1888), 2 vols issued in 13 parts, imperial quarto, colour-printed lithographs",
        "artist": "John Gerrard Keulemans",
        "year": "1888",
        "volume": "I",
        "plate": "X (Alexander Turnbull Library 'Plate X. 1888'; not printed on the plate)",
        "name_on_plate": "Prosthemadera novæ zealandiæ.",
        "other_lettering": "'Tui or Parson Bird.' (title), '(Adult and Young.)'",
        "gould_common_name": "Tui or Parson Bird",
        "artist_credit_on_plate": "J. G. Keulemans delt. & lith.",
        "printer_on_plate": "Judd & Co. Limited, Imp.",
        "artist_died": 1912,
        "copy": "Naturalis Biodiversity Center copy, digitised for the Biodiversity Heritage Library (Internet Archive historybirdsnew1bull)",
        "source_page_url": "https://archive.org/details/historybirdsnew1bull/page/n200/mode/1up",
        "source_file_url": "https://archive.org/download/historybirdsnew1bull/historybirdsnew1bull_jp2.zip/"
                           "historybirdsnew1bull_jp2%2Fhistorybirdsnew1bull_0201.jp2",
        "bhl_url": None,
        "other_copies": ["https://natlib.govt.nz/records/22645090 (Alexander Turnbull Library, ref. PUBL-0012-10)"],
        "licence": "Public domain (published 1888; artist died 1912; BHL/IA: 'no longer under copyright protection')",
        "processing": "JP2 -> RGB, resized to 900 px tall (Lanczos), JPEG quality 85, no crop (tools/make_plate.py)",
    }),
})


def probe(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration:stream=sample_rate,channels,bits_per_sample",
                          "-of", "json", path], capture_output=True, text=True).stdout
    j = json.loads(out)
    s = j["streams"][0]
    return dict(duration_s=round(float(j["format"]["duration"]), 2), sample_rate=int(s["sample_rate"]),
                channels=s["channels"], bits=s["bits_per_sample"])


def main(argv=None):
    """Optional args: bird ids to build (default: all), and --out DIR to write <DIR>/<bird>.sources.json
    instead of data/<bird>/sources.json (for dry-run diffs)."""
    args = list(sys.argv[1:] if argv is None else argv)
    out_dir = None
    if "--out" in args:
        i = args.index("--out")
        out_dir = args[i + 1]
        del args[i:i + 2]
    birds = args or list(CATEGORY)
    for bird in birds:
        cats = CATEGORY[bird]
        d = os.path.join(DATA, bird)
        recs = []
        for xcid, cat in cats.items():
            m = parse(os.path.join(d, "raw", f"XC{xcid}.html"))
            assert "-nd" not in m["licence_url"], (bird, xcid)
            title = m.pop("title")
            m["species_as_listed"] = title.split(" - ", 1)[0]
            m["call_type_as_given"] = title.split(" - ", 1)[1] if " - " in title else ""
            m["carol_category"] = cat
            m["raw_file"] = f"raw/XC{xcid}.mp3"
            m["wav_file"] = f"rec/XC{xcid}.wav"
            m["wav"] = probe(os.path.join(d, m["wav_file"]))
            m["source"] = "xeno-canto"
            m["attribution"] = f"XC{xcid} by {m['recordist']}, xeno-canto.org/{xcid}, {m['licence_name']}"
            recs.append(m)
        for sid, cat in INAT.get(bird, {}).items():  # iNaturalist clips (see INAT)
            recs.append(inat_record(d, sid, cat))
        p = {**PLATE_DEFAULTS, **PLATES[bird]}
        raw = glob.glob(os.path.join(d, "raw", f"{p['ia_id']}_*.jp2"))[0] if "image" not in p else ""
        image = dict(p["image"]) if "image" in p else {
            "file": "plate.jpg",
            "raw_file": "raw/" + os.path.basename(raw),
            "work": p["work"],
            "volume": p["volume"], "plate": p["plate"],
            "name_on_plate": p["gould_name"], "gould_common_name": p["gould_common_name"],
            "artist_credit_on_plate": p["artist_credit"],
            "printer_on_plate": p["printer"] + " Imp." if p["printer"] else "none lettered on this copy",
            "copy": p["copy"],
            "source_page_url": f"https://archive.org/details/{p['ia_id']}/page/n{p['leaf'] - 1}/mode/1up",
            "source_file_url": f"https://archive.org/download/{p['ia_id']}/{p['ia_id']}_jp2.zip/{p['ia_id']}_jp2%2F{os.path.basename(raw)}",
            "bhl_url": p["bhl_part"],
            "licence": p["licence"],
            "processing": p.get("processing", "JP2 -> RGB, resized to 900 px tall (Lanczos), JPEG quality 85 (tools/make_plate.py)"),
        }
        info = json.load(open(os.path.join(d, "info.json")))
        out = {"id": bird, "recordings": recs, "image": image, "facts_sources": info["facts_sources"]}
        if "indigenous_names" in info.get("deep_dive", {}):  # removed from the info.json files; kept optional
            out["indigenous_name_sources"] = info["deep_dive"]["indigenous_names"]
        dst = os.path.join(out_dir, f"{bird}.sources.json") if out_dir else os.path.join(d, "sources.json")
        json.dump(out, open(dst, "w"), ensure_ascii=False, indent=1)
        print(bird, len(recs), "recordings")


if __name__ == "__main__":
    main()
