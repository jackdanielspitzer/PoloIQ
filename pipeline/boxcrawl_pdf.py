"""MIT publishes FINA scoresheet PDFs instead of web box scores: fetch each, parse with pdfbox, save like boxcrawl does."""
import json, os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import config, sidearm, boxparse, net, pdfbox
from names import same_school

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "boxdata")
T = [t for t in config.TEAMS if t["name"] == "MIT"][0]

def pdf_url(page_html):
    m = re.search(r'https://[^"\'\s<>]+\.cloudfront\.net/[^"\'\s<>]+\.pdf', page_html or "")
    return m.group(0) if m else None

for s in config.SEASONS:
    if s < 2026 and os.path.exists(os.path.join(OUT, f"MIT_{s}.json")):
        print("MIT", s, "already parsed (finished season)", flush=True); continue
    recs = []
    for g in sidearm.schedule(T, s):
        if not g.get("boxUrl"):
            continue
        try:
            url = g["boxUrl"]
            if url.lower().endswith(".pdf") or "/documents/" in url:
                page = net.get(url, max_age=None if s < 2026 else 6 * 3600)
                purl = pdf_url(page) or url
                data = net.get_bytes(purl)
            else:
                purl, data = url, None
            box = pdfbox.parse(data) if data else None
        except Exception as e:
            print("MIT", s, g["date"], g["opponent"], "ERR", str(e)[:80], flush=True); continue
        if not box:
            recs.append({"team": "MIT", "season": s, "date": g["date"], "opponent": g["opponent"], "boxUrl": g["boxUrl"], "parsed": False}); continue
        me = next((n for n in box["teams"] if same_school(n, "MIT")), None)
        flags = boxparse.quality(box)
        if g.get("teamScore") is not None and me and box["score"][me] != g["teamScore"]:
            flags.append(f"final:{box['score'][me]}!={g['teamScore']}")
        recs.append({"team": "MIT", "season": s, "date": g["date"], "opponent": g["opponent"], "venue": g.get("venue"), "location": g.get("location"),
                     "teamScore": g.get("teamScore"), "oppScore": g.get("oppScore"), "boxUrl": g["boxUrl"], "parsed": True, "us": me, "box": box,
                     "flags": flags})
    json.dump(recs, open(os.path.join(OUT, f"MIT_{s}.json"), "w"))
    print(f"MIT {s}: {len(recs)} sheets, {sum(1 for r in recs if r.get('parsed'))} parsed, {sum(1 for r in recs if r.get('flags'))} flagged", flush=True)
