"""Crawl every tracked school's Sidearm schedule, fetch each box score link, parse and save per team-season."""
import json, os, sys, traceback
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import config, sidearm, boxparse, net
from names import same_school

EXTRA = {"California": ("calbears.com", "classic"), "Stanford": ("gostanford.com", "classic"), "UCLA": ("uclabruins.com", "nuxt"),
         "USC": ("usctrojans.com", "classic"), "Pacific": ("pacifictigers.com", "classic"), "UC Davis": ("ucdavisaggies.com", "classic"),
         "Pepperdine": ("pepperdinewaves.com", "classic"), "Saint Mary's": ("smcgaels.com", "classic")}
TEAMS = {t["name"]: t for t in config.TEAMS}
for k, (h, l) in EXTRA.items():
    TEAMS[k] = {"name": k, "host": h, "layout": l, "aliases": [k.lower()]}

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "boxdata")

def our_side(box, team_name, game):
    names = box["teams"]
    for n in names:
        if same_school(n, team_name):
            return n
    ts, os_ = game.get("teamScore"), game.get("oppScore")
    if ts is not None:
        c = [n for n in names if box["score"][n] == ts]
        if len(c) == 1:
            return c[0]
    return None

def run(team_names, seasons):
    for name in team_names:
        t = TEAMS[name]
        for s in seasons:
            path = os.path.join(OUT, f"{name.replace(' ','_').replace(chr(39),'')}_{s}.json")
            # A finished season never changes: keep the parsed file instead of re-downloading every box
            # score (a cloud run starts without the raw-page cache).
            if s < 2026 and os.path.exists(path):
                print(name, s, "already parsed (finished season)", flush=True); continue
            try:
                games = sidearm.schedule(t, s)
            except Exception as e:
                print(name, s, "SCHEDULE ERR", str(e)[:80], flush=True); continue
            recs = []
            for g in games:
                if not g.get("boxUrl"):
                    continue
                try:
                    html = net.get(g["boxUrl"], max_age=None if s < 2026 else 6 * 3600)
                    box = boxparse.parse(html) if html else None
                except Exception as e:
                    print(name, s, g["date"], g["opponent"], "FETCH/PARSE ERR", str(e)[:80], flush=True); continue
                if not box:
                    recs.append({"team": name, "season": s, "date": g["date"], "opponent": g["opponent"], "boxUrl": g["boxUrl"], "parsed": False}); continue
                me = our_side(box, name, g)
                recs.append({"team": name, "season": s, "date": g["date"], "opponent": g["opponent"], "venue": g.get("venue"),
                             "location": g.get("location"), "teamScore": g.get("teamScore"), "oppScore": g.get("oppScore"),
                             "boxUrl": g["boxUrl"], "parsed": True, "us": me, "box": box, "flags": boxparse.quality(box)})
            json.dump(recs, open(path, "w"))
            ok = sum(1 for r in recs if r.get("parsed")); bad = sum(1 for r in recs if r.get("flags"))
            print(f"{name} {s}: {len(recs)} box links, {ok} parsed, {bad} with flags", flush=True)

if __name__ == "__main__":
    names = [a for a in sys.argv[1:] if a in TEAMS] or list(TEAMS)
    run(names, [2024, 2025, 2026])
