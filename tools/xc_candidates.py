#!/usr/bin/env python3
"""Merge parsed XC lists (JSON lines on stdin), drop ND licences, print a compact table."""
import sys, json
seen = {}
for line in sys.stdin:
    r = json.loads(line)
    seen.setdefault(r["xc_id"], r)
ok = [r for r in seen.values() if "/nd" not in r["licence_url"] and "-nd" not in r["licence_url"] and r["licence_url"]]
print(f"# total {len(seen)}, non-ND {len(ok)}", file=sys.stderr)
for r in sorted(ok, key=lambda r: (r["quality"], len(r["also"]))):
    lic = r["licence_url"].split("licenses/")[-1]
    print(f'{r["xc_id"]}\t{r["quality"]}\t{r["length"]}\t{lic}\tbg={len(r["also"])}\t{r["type"][:40]}\t{r["remarks"][:90]}\t{r["recordist"]}')
