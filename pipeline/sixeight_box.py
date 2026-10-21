import time
"""Build per-player box scores from 6-8 Sports live scoring for games a school never published a box score for.

Reads boxdata/app_games.json (every final game the app holds per tracked team; written by verify/dump_games.js),
finds each game on 6-8 Sports (same day, same teams, same final score), converts it with sixeight.convert and
writes boxdata/sixeight_<team>.json in the same record shape boxcrawl.py produces. 6-8 does not log saves, so
goalie tables are left empty for these games.
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import sixeight
from names import same_school

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "boxdata")


def clock(secs):
    if secs is None:
        return None
    return f"{secs // 60}:{secs % 60:02d}"


def build(conv, me_side):
    """conv: sixeight.convert() output. me_side: 'dark' or 'light' = the tracked team's colour."""
    dark, light = conv["teams"]
    names = {"dark": dark, "light": light}
    A, B = names["dark"], names["light"]
    if A == B:
        B = B + " (2)"
        names["light"] = B
    players = {A: {}, B: {}}
    for side in ("dark", "light"):
        for p in conv["rosters"][side]:
            players[names[side]][p["cap"]] = {"cap": p["cap"], "name": p["name"], "sh": 0, "g": 0, "a": 0, "ex": 0, "dex": 0,
                                              "stl": 0, "fb": 0, "to": 0, "spW": 0, "spL": 0}

    def line(side, who):
        if not who:
            return None
        d = players[names[side]]
        key = who["cap"] or who["name"]
        if key not in d:
            d[key] = {"cap": who["cap"], "name": who["name"], "sh": 0, "g": 0, "a": 0, "ex": 0, "dex": 0, "stl": 0, "fb": 0, "to": 0, "spW": 0, "spL": 0}
        return d[key]

    goals, pens = [], []
    pairs = {}

    def pair(kind, side, e):
        actor = (e.get("player") or {}).get("name")
        other = (e.get("vs") or {}).get("name")
        if actor and other:
            k = (kind, names[side], actor, other)
            pairs[k] = pairs.get(k, 0) + 1

    for e in conv["events"]:
        side, t = e.get("side"), e["type"]
        if side not in names:
            continue
        L = line(side, e.get("player"))
        if t in ("goal", "exclusion_drawn", "steal", "block", "sprint_won"):
            pair({"goal": "G", "exclusion_drawn": "XD", "steal": "ST", "block": "BL", "sprint_won": "SP"}[t], side, e)
        if t == "goal":
            if L:
                L["g"] += 1; L["sh"] += 1
            goals.append({"q": e["q"], "clock": clock(e.get("clock")), "team": names[side],
                          "type": "G" + ("-P" if e.get("penalty") else "") + ("-6v5" if e.get("manUp") else ""),
                          "player": (e.get("player") or {}).get("name") or ""})
        elif t == "assist" and L:
            L["a"] += 1
        elif t == "shot_missed" and L:
            L["sh"] += 1
        elif t == "exclusion":
            if L:
                L["ex"] += 1
            pens.append({"q": e["q"], "clock": clock(e.get("clock")), "team": names[side], "type": "E", "player": (e.get("player") or {}).get("name") or ""})
        elif t == "exclusion_drawn" and L:
            L["dex"] += 1
        elif t == "steal" and L:
            L["stl"] += 1
        elif t == "block" and L:
            L["fb"] += 1
        elif t == "turnover" and L:
            L["to"] += 1
        elif t == "penalty":
            pens.append({"q": e["q"], "clock": clock(e.get("clock")), "team": names[side], "type": "P", "player": (e.get("player") or {}).get("name") or ""})
        elif t == "sprint_won":
            w = line(side, e.get("player"))
            if w:
                w["spW"] += 1
            other = "light" if side == "dark" else "dark"
            lo = line(other, e.get("vs"))
            if lo:
                lo["spL"] += 1
    score = {names["dark"]: conv["score"][0], names["light"]: conv["score"][1]}
    periods = {}
    for tm in names.values():
        per = {}
        for g in goals:
            if g["team"] == tm:
                per[g["q"]] = per.get(g["q"], 0) + 1
        periods[tm] = [per.get(k, 0) for k in (1, 2, 3, 4)] + [per[k] for k in sorted(k for k in per if isinstance(k, str))]
    lines = {tm: [v for v in d.values() if v["name"] or v["g"] or v["a"] or v["ex"]] for tm, d in players.items()}
    box = {"teams": [A, B], "periods": periods, "score": score, "players": lines, "goalies": {A: [], B: []},
           "goals": goals, "pens": pens, "abbr": {}, "title": "6-8 Sports live scoring", "kind": "6-8",
           "pairs": [[k[0], k[1], k[2], k[3], n] for k, n in sorted(pairs.items())]}
    return box, names[me_side]


def main(team_names=None):
    games = json.load(open(os.path.join(OUT, "app_games.json")))
    index = {}
    out_all = {}
    for team, gl in games.items():
        if team_names and team not in team_names:
            continue
        # Keep games already found on 6-8, and only ask 6-8 about recent 2026 dates: older games
        # either were found before or never will be (a cloud run has no raw-page cache).
        out_path = os.path.join(OUT, "sixeight_" + team.replace(" ", "_").replace("'", "") + ".json")
        prev = json.load(open(out_path)) if os.path.exists(out_path) else []
        have = {(r["date"], r["opponent"]) for r in prev}
        recent = time.strftime("%Y-%m-%d", time.localtime(time.time() - 21 * 86400))
        recs = list(prev)
        for g in gl:
            day = g["date"]
            if (day, g["opponent"]) in have or (prev and (day < recent or not day.startswith("2026"))):
                continue
            if day not in index:
                try:
                    index[day] = sixeight.games_on(day)
                except Exception as ex:
                    print("games_on", day, str(ex)[:80], flush=True)
                    index[day] = []
            g6, side = sixeight.find(index, day, team, g["opponent"], g["ts"], g["os"])
            if not g6:
                continue
            conv = sixeight.convert(g6)
            if not conv:
                continue
            box, me = build(conv, side)
            recs.append({"team": team, "season": int(day[:4]), "date": day, "opponent": g["opponent"], "teamScore": g["ts"], "oppScore": g["os"],
                         "boxUrl": "", "parsed": True, "us": me, "box": box, "flags": [], "kind": "6-8"})
        json.dump(recs, open(os.path.join(OUT, "sixeight_" + team.replace(" ", "_").replace("'", "") + ".json"), "w"))
        print(f"{team}: {len(gl)} finals, {len(recs)} found on 6-8", flush=True)


if __name__ == "__main__":
    main(sys.argv[1:] or None)
