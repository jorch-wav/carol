#!/usr/bin/env python3
"""Parse a saved xeno-canto recording page (raw/XC<id>.html) into a JSON metadata dict.
Usage: python3 -I xc_parse_rec.py XC123.html [...]  -> JSON list on stdout.
Text parsing only; nothing from the page is executed."""
import sys, re, json, html


def text(s):
    s = re.sub(r"<br\s*/?>", "\n", s)
    s = re.sub(r"<[^>]+>", " ", s)
    return re.sub(r"[ \t]+", " ", html.unescape(s)).strip()


def row(data, label):
    m = re.search(r"<td>\s*%s\s*</td>\s*<td[^>]*>(.*?)</td>" % re.escape(label), data, re.S)
    return text(m.group(1)) if m else ""


def parse(path):
    d = open(path, encoding="utf-8", errors="replace").read()
    xcid = re.search(r"data-xc-id='(\d+)'", d).group(1)
    title = re.search(r"<div class='jp-title' title='([^']*)'", d)
    lic = re.search(r"<h2>License</h2>\s*<p><a href='([^']+)'>.*?>\s*([^<]+)</a>", d, re.S)
    rmk = re.search(r"<h2>Remarks from the Recordist</h2>(.*?)<h2>", d, re.S)
    loc = re.search(r"location/map\?lat=([-\d.]+)&long=([-\d.]+)", d)
    q = re.search(r"<li id='rating-%s-\d' class='selected'><span>([A-E])</span>" % xcid, d)
    bg = re.search(r"<td>Background</td>\s*<td[^>]*>(.*?)</td>", d, re.S)
    ln = row(d, "Length")
    secs = re.match(r"([\d.]+)", ln)
    out = {
        "xc_id": xcid,
        "url": f"https://xeno-canto.org/{xcid}",
        "download_url": f"https://xeno-canto.org/{xcid}/download",
        "title": html.unescape(title.group(1)) if title else "",
        "recordist": row(d, "Recordist"),
        "licence_name": html.unescape(lic.group(2)).strip() if lic else "",
        "licence_url": lic.group(1) if lic else "",
        "country": row(d, "Country"),
        "location": row(d, "Location"),
        "lat": float(loc.group(1)) if loc else None,
        "lon": float(loc.group(2)) if loc else None,
        "elevation": row(d, "Elevation"),
        "date": row(d, "Date"),
        "time": row(d, "Time"),
        "sound_type": row(d, "Type"),
        "sex": row(d, "Sex"),
        "life_stage": row(d, "Life stage"),
        "method": row(d, "Method"),
        "remarks": text(rmk.group(1)) if rmk else "",
        "background_species": text(bg.group(1)) if bg else "",
        "length": ln,
        "length_s": float(secs.group(1)) if secs else None,
        "quality": q.group(1) if q else "",
    }
    if out["remarks"] == "None given":
        out["remarks"] = ""
    return out


if __name__ == "__main__":
    print(json.dumps([parse(p) for p in sys.argv[1:]], ensure_ascii=False, indent=1))
