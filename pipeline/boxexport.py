"""Turn boxdata/*.json into the compact SEED_BOXSCORES object embedded in index.html.

Each parsed box score is stored once for the tracked team it was crawled from, and again (sides swapped)
for the opponent when that opponent is also a tracked team, so the game page shows it from either side.

Key:  "<tracked team>|<date>|<our goals>-<their goals>"  (plus "#2" for a same-day, same-score repeat)
Value: {o, q:[[ours by period],[theirs]], u:[[cap,name,g,a,sh,ex,dex,stl,fb,spW,spL]], v:[..],
        gu:[[cap,name,min,ga,sv]], gv:[..], tl:[[q,clock,side,type,player]], pn:[[...]], s:url, p:partialFlags}
"""
import glob
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from names import norm, same_school

HERE = os.path.dirname(os.path.abspath(__file__))

# every school the app tracks, with name forms that appear in box scores
TRACKED = {
    "Navy": ["navy", "naval academy", "us naval academy", "usna"],
    "Fordham": ["fordham"], "Iona": ["iona"],
    "Mount St. Mary's": ["mount st. mary's", "mount st mary's", "mount saint mary's", "mount st marys", "msmu", "the mount"],
    "Bucknell": ["bucknell"], "Johns Hopkins": ["johns hopkins", "jhu", "johns hopkins university"],
    "George Washington": ["george washington", "gw", "gwu"], "Princeton": ["princeton"],
    "Harvard": ["harvard"], "Brown": ["brown"], "MIT": ["mit", "massachusetts institute of technology"],
    "California": ["california", "cal", "uc berkeley", "cal bears", "california golden bears"],
    "Stanford": ["stanford"], "UCLA": ["ucla"], "USC": ["usc", "southern california"],
    "Pacific": ["pacific", "university of the pacific", "uop"], "UC Davis": ["uc davis", "ucd"],
    "Pepperdine": ["pepperdine", "pep"], "Saint Mary's": ["saint mary's", "st. mary's", "saint marys", "smc"],
}
_LOOKUP = {a: t for t, al in TRACKED.items() for a in al + [t.lower()]}


def tracked(name):
    n = norm(name)
    n = re.sub(r"\s*\((dii|diii|d1|d2|d3|m)\)\s*", " ", n).strip()
    n = re.sub(r"\buniversity\b|\bcollege\b", "", n).strip()
    return _LOOKUP.get(n)


def _active(p):
    return any(p.get(k, 0) for k in ("g", "a", "sh", "ex", "dex", "stl", "fb", "spW", "spL", "to"))


def pl(p):
    # [cap, name, g, a, sh, ex, dex, stl, fb, spW, spL, to]
    return [p["cap"], p["name"], p["g"], p["a"], p["sh"], p["ex"], p["dex"], p["stl"], p["fb"], p["spW"], p["spL"], p.get("to", 0)]


def gk(g):
    return [g["cap"], g["name"], g["min"], g["ga"], g["sv"]]


def entry(rec, flip):
    b = rec["box"]
    A, B = b["teams"]
    us = rec["us"]
    them = B if us == A else A
    me, op = (them, us) if flip else (us, them)
    side = lambda tm: "u" if tm == me else "v"
    out = {
        "o": us if flip else them,  # label of the opposing school as this team's site/this box names it
        "q": [b["periods"][me], b["periods"][op]],
        "u": [pl(p) for p in b["players"].get(me, []) if _active(p)],
        "v": [pl(p) for p in b["players"].get(op, []) if _active(p)],
        "gu": [gk(g) for g in b["goalies"].get(me, [])],
        "gv": [gk(g) for g in b["goalies"].get(op, [])],
        "tl": [[g["q"], g["clock"], side(g["team"]) if g["team"] else None, g["type"], g["player"]] for g in b["goals"]],
        "pn": [[g["q"], g["clock"], side(g["team"]) if g["team"] else None, g["type"], g["player"]] for g in b["pens"]],
        "s": rec["boxUrl"],
        "k": rec.get("kind") or ("scoresheet" if b.get("limited") else "sidearm"),
    }
    if rec.get("pb"):
        # the game's full play-by-play lives in pbp/<id>.json (neutral dark/light); pc = this team's colour
        out["pb"] = rec["pb"]
        mine = rec.get("side") or "dark"
        out["pc"] = ({"dark": "light", "light": "dark"}[mine] if flip else mine)[0]
    if b.get("pairs"):
        out["pr"] = [[k, "u" if tm == me else "v", a, o, n] for k, tm, a, o, n in b["pairs"]]
    partial = []
    for key, tm in (("u", me), ("v", op)):
        lines = b["players"].get(tm, [])
        if not lines:
            partial.append(key + ":none")
        elif sum(p["g"] for p in lines) != b["score"][tm]:
            partial.append(key + ":goals")
    if partial:
        out["p"] = ",".join(partial)
    return me, op, b["score"][me], b["score"][op], out


def build():
    recs = []
    for f in sorted(glob.glob(os.path.join(HERE, "boxdata", "*.json"))):
        if os.path.basename(f) in ("app_games.json", "team_names.json", "sixeight_score_mismatches.json"):
            continue
        recs += json.load(open(f))
    # 6-8 Sports live scoring first (full play-by-play: every action, the game clock, who it was against),
    # then school-published box scores, then scoresheets. A school box score for a game 6-8 also has only
    # lends its goalie lines (saves and minutes, which are official there).
    order = {"6-8": 0, "sidearm": 1, "scoresheet": 2}
    recs.sort(key=lambda r: order.get(r.get("kind") or ("scoresheet" if (r.get("box") or {}).get("limited") else "sidearm"), 0))
    seed = {}
    stats = {"records": 0, "swapped": 0, "skipped": 0}

    seen_opp = {}
    six = {}  # (team, date) -> [(opponent label, key)] of 6-8 entries
    stats["schoolGoaliesBorrowed"] = 0

    def put(team, date, ts, os_, e):
        if e.get("k") != "6-8":
            for label, k6 in six.get((team, date), []):
                if same_school(label, e["o"]):
                    s6 = seed[k6]
                    if any(g[2] or g[4] for g in e["gu"] + e["gv"]):
                        s6["gu"], s6["gv"], s6["gs"] = e["gu"], e["gv"], e["s"]
                        stats["schoolGoaliesBorrowed"] += 1
                    return False
        base = f"{team}|{date}|{ts}-{os_}"
        opp = re.sub(r"[^a-z0-9]", "", norm(e["o"]))
        k, n = base, 1
        while k in seed:
            if opp and (opp in seen_opp[k] or seen_opp[k] in opp) or seed[k]["s"] and seed[k]["s"] == e["s"]:
                # same game already stored (e.g. a school box score beats the 6-8 copy); keep 6-8 pairings if it has them
                if e.get("pr") and not seed[k].get("pr"):
                    seed[k]["pr"] = e["pr"]
                return False
            n += 1
            k = f"{base}#{n}"
        seed[k] = e
        seen_opp[k] = opp
        if e.get("k") == "6-8":
            six.setdefault((team, date), []).append((e["o"], k))
        return True

    for rec in recs:
        if not rec.get("parsed") or not rec.get("us"):
            stats["skipped"] += 1
            continue
        # a scoresheet whose goals do not add up to the final score was misread: better no lines than wrong ones
        if (rec.get("box") or {}).get("limited") and rec.get("flags"):
            stats["skipped"] += 1
            continue
        me, op, ts, os_, e = entry(rec, False)
        if put(rec["team"], rec["date"], ts, os_, e):
            stats["records"] += 1
        opp_t = tracked(op)
        if opp_t and opp_t != rec["team"]:
            me2, op2, ts2, os2, e2 = entry(rec, True)
            # swapped copy: our=opponent. Skip if that team's own crawl already produced the same game.
            if put(opp_t, rec["date"], ts2, os2, e2):
                stats["swapped"] += 1
    # school box scores carry no pairings, but when the other team used a single goalie every goal was scored on him
    derived = 0
    for k, e in seed.items():
        if e.get("pr") or e.get("k") == "6-8":
            continue
        rows = {}
        for scorer_side, goalies in (("u", e["gv"]), ("v", e["gu"])):
            real = [g for g in goalies if g[2] and g[2] != "0:00"]
            if len(real) != 1:
                continue
            for r in e["tl"]:
                if r[2] == scorer_side and r[4] and not r[4].startswith("#") and r[4].lower() not in ("unknown", "field player"):
                    key = ("G", scorer_side, r[4], real[0][1])
                    rows[key] = rows.get(key, 0) + 1
        if rows:
            e["pr"] = [[a, b, c, d, n] for (a, b, c, d), n in sorted(rows.items())]
            derived += 1
    stats["derivedGoalPairs"] = derived
    return seed, stats


if __name__ == "__main__":
    seed, stats = build()
    print(stats, "entries", len(seed))
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "seed_boxscores.json")
    json.dump(seed, open(out, "w"), separators=(",", ":"), ensure_ascii=False)
    print("bytes", os.path.getsize(out))
