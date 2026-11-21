#!/usr/bin/env python3
"""Parse a saved xeno-canto species/explore results HTML page into JSON lines.
Usage: python3 -I xc_parse_list.py page.html [...]  -> prints one JSON per recording.
Pure text parsing; nothing from the page is executed."""
import sys, re, json, html

ROW = re.compile(r"<tr\s*>(.*?)</tr>", re.S)
TD = re.compile(r"<td[^>]*>(.*?)</td>", re.S)


def text(s):
    s = re.sub(r"<[^>]+>", " ", s)
    return re.sub(r"\s+", " ", html.unescape(s)).strip()


def parse(path):
    data = open(path, encoding="utf-8", errors="replace").read()
    for m in ROW.finditer(data):
        row = m.group(1)
        idm = re.search(r"xeno-canto\.org/(\d+)/download", row)
        if not idm:  # some species' list rows have no download link; fall back to the catalogue-number link
            idm = re.search(r'href="https://xeno-canto\.org/(\d+)">XC\d+', row)
        if not idm:
            continue
        xcid = idm.group(1)
        tds = TD.findall(row)
        lic = re.search(r'<span title="([^"]+)"><a href="(https?://creativecommons[^"]+)"', row)
        q = re.search(r"<li id='rating-%s-\d' class='selected'><span>([A-E])</span>" % xcid, row)
        rec = re.search(r"contributor/[A-Z]+'>([^<]+)</a>", row)
        loc = re.search(r'location/map\?[^"]*">([^<]+)</a>', row)
        also = []
        am = re.search(r"data-qtip-header='Other Species' data-qtip-content='([^']*)'", row)
        if am:
            inner = html.unescape(am.group(1))
            also = [text(x) for x in re.findall(r"<span class=\"common-name\">(.*?)</span>", inner)]
        cells = [text(t) for t in tds]
        # cells: 0 player,1 name,2 length,3 recordist,4 date,5 time,6 country,7 loc,8 elev,9 type,10 remarks...
        out = {
            "xc_id": xcid,
            "length": cells[2] if len(cells) > 2 else "",
            "recordist": html.unescape(rec.group(1)) if rec else "",
            "date": cells[4] if len(cells) > 4 else "",
            "country": cells[6] if len(cells) > 6 else "",
            "location": html.unescape(loc.group(1)) if loc else "",
            "type": cells[9] if len(cells) > 9 else "",
            "remarks": cells[10].replace("[sono]", "").strip() if len(cells) > 10 else "",
            "also": also,
            "quality": q.group(1) if q else "",
            "licence_name": html.unescape(lic.group(1)) if lic else "",
            "licence_url": lic.group(2) if lic else "",
        }
        print(json.dumps(out, ensure_ascii=False))


for p in sys.argv[1:]:
    parse(p)
