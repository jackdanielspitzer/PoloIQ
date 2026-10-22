import time
"""Box scores and full play-by-play from 6-8 Sports live scoring, the first-choice source for any game scored there.

Reads boxdata/app_games.json (every final game the app holds per tracked team; written by verify/dump_games.js),
finds each game on 6-8 Sports (same teams within a day either side, preferring the same final score), converts it
with sixeight.convert and writes boxdata/sixeight_<team>.json in the same record shape boxcrawl.py produces, plus
the game's whole play-by-play to ../pbp/<6-8 id>.json for the app to load when that game is opened.
A goalie's blocks are his saves on 6-8, so goalie lines carry saves and goals against.
"""
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import sixeight
from names import same_school

OPP = {"dark": "light", "light": "dark"}
PBP = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "pbp")
CODES = {"goal": "G", "shot_missed": "M", "assist": "A", "exclusion": "X", "exclusion_drawn": "XD", "penalty": "P",
         "penalty_drawn": "PD", "steal": "ST", "turnover": "TO", "offensive": "OF", "block": "B", "sprint_won": "SP",
         "timeout": "T", "team_turnover": "TT"}


def pbp_file(conv, day):
    """The whole game, neutral (dark/light), compact: one row per action
    [period, clock secs, clock estimated 0/1, side d/l, type, cap, other cap, flags, cap excluded before a man-up goal].
    other cap: G goalie scored on, M goalie shot on (or blocker with flag b), A scorer, X/P who drew it,
    XD/PD who committed it, ST who lost the ball, TO who stole it, B whose shot, SP sprint loser.
    flags: m man-up, i man-up worked out from an exclusion just before, p penalty shot, c counter,
    g goalie worked out (6-8 did not name him), b blocked, l typed in after the game (a correction)."""
    cap = lambda w: (w or {}).get("cap") or ""
    rows = []
    for e in conv["events"]:
        t = e["type"]; c = CODES.get(t)
        if not c or e.get("side") not in OPP:
            continue
        other = e.get("vs")
        if t == "assist":
            other = e.get("to")
        elif t == "shot_missed":
            other = e.get("blockedBy") or e.get("goalie")
        f = ("m" if e.get("manUp") else "") + ("i" if e.get("manUpInferred") else "") + ("p" if e.get("penalty") else "") + \
            ("c" if e.get("counter") else "") + ("g" if e.get("goalieInferred") or (t == "shot_missed" and not e.get("blockedBy") and e.get("goalie")) else "") + \
            ("b" if e.get("blockedBy") else "") + ("l" if e.get("late") else "")
        row = [e["q"], e.get("clock"), 1 if e.get("est") else 0, e["side"][0], c, cap(e.get("player")), cap(other), f]
        if e.get("after"):
            row.append(cap(e["after"].get("excluded")))
        rows.append(row)
    return {"id": conv["sourceId"], "date": day, "teams": conv["teams"], "score": conv["score"], "src": "6-8 Sports live scoring", "mode": conv.get("mode", "live"),
            "r": {s[0]: [[p["cap"], p["name"], 1 if p.get("goalie") else 0] for p in conv["rosters"][s]] for s in ("dark", "light")},
            "ev": rows}

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

    gk_caps = {s: {p["cap"] for p in conv["rosters"][s] if p.get("goalie")} for s in ("dark", "light")}
    keepers = {"dark": {}, "light": {}}

    def keeper(side, who):
        if not who:
            return None
        k = keepers[side].setdefault(who["cap"] or who["name"], {"cap": who["cap"], "name": who["name"], "min": "", "ga": 0, "sv": 0})
        return k

    for e in conv["events"]:
        side, t = e.get("side"), e["type"]
        if side not in names:
            continue
        if t == "goal" and e.get("goalie") and side in OPP:
            k = keeper(OPP[side], e["goalie"])
            if k:
                k["ga"] += 1
        if t == "block" and (e.get("player") or {}).get("cap") in gk_caps.get(side, ()):
            k = keeper(side, e.get("player"))
            if k:
                k["sv"] += 1
            pair("BL", side, e)
            continue  # a goalie's block is a save, not a field block
        L = line(side, e.get("player"))
        if t in ("goal", "exclusion_drawn", "steal", "block", "sprint_won"):
            pair({"goal": "G", "exclusion_drawn": "XD", "steal": "ST", "block": "BL", "sprint_won": "SP"}[t], side, e)
        if t == "goal":
            if L:
                L["g"] += 1; L["sh"] += 1
            goals.append({"q": e["q"], "clock": clock(e.get("clock")), "team": names[side],
                          "type": "G" + ("-P" if e.get("penalty") else "") + ("-6v5" if e.get("manUp") else "") + ("-C" if e.get("counter") else ""),
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
        elif t in ("turnover", "offensive") and L:
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
        periods[tm] = [] if 0 in per else [per.get(k, 0) for k in (1, 2, 3, 4)] + [per[k] for k in sorted(k for k in per if isinstance(k, str))]
    lines = {tm: [v for v in d.values() if v["name"] or v["g"] or v["a"] or v["ex"]] for tm, d in players.items()}
    goalies = {names[s]: [k for k in keepers[s].values() if k["ga"] or k["sv"]] for s in ("dark", "light")}
    box = {"teams": [A, B], "periods": periods, "score": score, "players": lines, "goalies": goalies,
           "goals": goals, "pens": pens, "abbr": {}, "title": "6-8 Sports live scoring", "kind": "6-8", "postgame": conv.get("mode") == "postgame",
           "pairs": [[k[0], k[1], k[2], k[3], n] for k, n in sorted(pairs.items())]}
    return box, names[me_side]


def _shift(day, n):
    return time.strftime("%Y-%m-%d", time.gmtime(time.mktime(time.strptime(day, "%Y-%m-%d")) + n * 86400 + 43200))


def find_game(day_games, g, team):
    """The 6-8 game for this app game: same two schools on the same day or a day either side (6-8 files a
    late game under the next UTC day), preferring the same final score and the same day. A game whose
    score differs is only accepted when it is the one meeting of those teams in that window."""
    cands = []
    for n in (0, -1, 1):
        dd = _shift(g["date"], n)
        for x in day_games(dd):
            dn, ln = x.get("dark_team_name") or "", x.get("light_team_name") or ""
            if same_school(dn, team) and same_school(ln, g["opponent"]):
                me = "dark"
            elif same_school(ln, team) and same_school(dn, g["opponent"]):
                me = "light"
            else:
                continue
            sc = (x.get("dark_team_score"), x.get("light_team_score"))
            mine = sc if me == "dark" else sc[::-1]
            cands.append({"g": x, "side": me, "sameDay": n == 0, "sameScore": tuple(mine) == (g["ts"], g["os"]), "score": mine})
    for c in cands:
        _check_colours(c, team, g)
        # a record that is unreadable for the other school (when it's tracked too) is unreadable for this one
        opp = next((t for t in (_NAMES or {}) if t != team and same_school(t, g["opponent"])), None)
        if opp and not c.get("bad"):
            probe = {"g": c["g"], "side": OPP[c["side"]], "score": c["score"][::-1], "sameScore": False}
            _check_colours(probe, opp, {"ts": g["os"], "os": g["ts"]})
            if probe.get("bad"):
                c["bad"] = True
    bad = [c for c in cands if c.get("bad")]
    for c in bad:
        print(f"  {team} {g['date']} vs {g['opponent']}: 6-8 record mixes {team}'s players across both cap colours; not used", flush=True)
    cands = [c for c in cands if not c.get("bad")]
    exact = [c for c in cands if c["sameScore"]]
    if exact:
        exact.sort(key=lambda c: not c["sameDay"])
        if len(exact) > 1 and g.get("gn"):  # same-day repeat meeting: take them in order
            exact = sorted(exact, key=lambda c: c["g"].get("created_at") or "")
            return exact[min(len(exact), g["gn"]) - 1]
        return exact[0]
    if len({c["g"]["pk"] for c in cands}) == 1:
        return cands[0]
    return None


_NAMES = None


def _last(n):
    parts = re.sub(r"[^a-z ]", "", (n or "").lower()).split()
    return parts[-1] if parts else ""


def _check_colours(c, team, g):
    """A scorekeeper sometimes types the two team names onto the wrong cap colours, which would credit every
    play to the other team. If the players 6-8 lists under the other colour are the ones this school has on
    file (by last name), the colours were swapped: read the game from the other side."""
    global _NAMES
    if _NAMES is None:
        p = os.path.join(OUT, "team_names.json")
        _NAMES = json.load(open(p)) if os.path.exists(p) else {}
    known = {_last(n) for n in _NAMES.get(team, [])} - {""}
    if not known:
        return
    side = {"Dark Team": "dark", "Light Team": "light"}
    hits = {"dark": 0, "light": 0}
    for p in c["g"].get("players") or []:
        s = side.get(p.get("team_color"))
        if s and not p.get("is_staff") and _last(p.get("last_name")) in known:
            hits[s] += 1
    me, other = c["side"], OPP[c["side"]]
    lo, hi = sorted((hits[me], hits[other]))
    if lo >= 3 and lo >= 0.4 * hi:
        # a real share of this school's players sit on each colour (not just a surname both teams have):
        # the record can't say who did what
        c["bad"] = True
        return
    if hits[other] >= 3 and hits[other] > 2 * hits[me]:
        c["side"] = other
        c["score"] = c["score"][::-1]
        c["sameScore"] = tuple(c["score"]) == (g["ts"], g["os"])
        c["swapped"] = True


def main(team_names=None, everything=False):
    """everything=True re-searches every game (a local run with the page cache); otherwise games already
    found are kept and only 2026 dates from the last three weeks are asked about (the daily cloud run)."""
    games = json.load(open(os.path.join(OUT, "app_games.json")))
    os.makedirs(PBP, exist_ok=True)
    index = {}

    def day_games(d):
        if d not in index:
            try:
                index[d] = sixeight.games_on(d)
            except Exception as ex:
                print("games_on", d, str(ex)[:80], flush=True)
                index[d] = []
        return index[d]

    mismatches = []
    for team, gl in games.items():
        if team_names and team not in team_names:
            continue
        out_path = os.path.join(OUT, "sixeight_" + team.replace(" ", "_").replace("'", "") + ".json")
        prev = [] if everything else (json.load(open(out_path)) if os.path.exists(out_path) else [])
        have = {(r["date"], r["opponent"]) for r in prev}
        recent = time.strftime("%Y-%m-%d", time.localtime(time.time() - 21 * 86400))
        recs = list(prev)
        for g in gl:
            day = g["date"]
            if (day, g["opponent"]) in have or (prev and (day < recent or not day.startswith("2026"))):
                continue
            c = find_game(day_games, g, team)
            if not c:
                continue
            conv = sixeight.convert(c["g"])
            if not conv:
                continue
            box, me = build(conv, c["side"])
            pk = str(conv["sourceId"])
            body = json.dumps(pbp_file(conv, day), separators=(",", ":"), ensure_ascii=False)
            path = os.path.join(PBP, pk + ".json")
            # rewrite only when it changed (a synced folder turns rapid rewrites into "name 2.json" copies)
            if not os.path.exists(path) or open(path, encoding="utf-8").read() != body:
                with open(path, "w", encoding="utf-8") as f:
                    f.write(body)
            ts, os_ = c["score"]
            if c.get("swapped"):
                print(f"  {team} {day} vs {g['opponent']}: 6-8 had the team names on the wrong cap colours; read from the other side", flush=True)
            if not c["sameScore"]:
                mismatches.append({"team": team, "date": day, "opponent": g["opponent"], "app": [g["ts"], g["os"]], "sixeight": [ts, os_]})
            recs.append({"team": team, "season": int(day[:4]), "date": day, "opponent": g["opponent"], "teamScore": ts, "oppScore": os_,
                         "boxUrl": "", "parsed": True, "us": me, "box": box, "flags": [], "kind": "6-8", "pb": pk, "side": c["side"]})
        json.dump(recs, open(out_path, "w"))
        print(f"{team}: {len(gl)} finals, {len(recs)} found on 6-8", flush=True)
    if everything or mismatches:
        json.dump(mismatches, open(os.path.join(OUT, "sixeight_score_mismatches.json"), "w"), indent=1)
        print(f"{len(mismatches)} games where 6-8's final differs from the app's result (boxdata/sixeight_score_mismatches.json)")


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if a != "--all"]
    main(args or None, everything="--all" in sys.argv)
