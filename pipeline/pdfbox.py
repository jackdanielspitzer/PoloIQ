"""Parse a FINA-style water polo scoresheet PDF (MIT publishes these instead of web box scores).

The sheet lists each team's players with fouls (exclusions) and goals per period, then one timeline row per
event: time left, cap, colour (LIGHT/DARK), type (G goal, E exclusion, P penalty, TO timeout) and the running score.
It records only goals and exclusions, so assists, shots and steals are unknown for every player.
Names are filled in for the host school; opponents print as N/A, so they appear by cap number only.
"""
import re

import fitz

from names import person

CAP = re.compile(r"^\d{1,2}[A-Z]?$")
TIME = re.compile(r"^\d{2}:\d{2}$")
SCORE = re.compile(r"^\d+:\d+$")


def _secs(t):
    return int(t[:2]) * 60 + int(t[3:]) if TIME.match(t) else -1


def parse(pdf_bytes):
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    toks = []
    for pg in doc:
        toks += [t.strip() for t in pg.get_text().split("\n") if t.strip()]
    # team names: the two alphabetic tokens that open the player blocks (after "Game Note:")
    try:
        start = max(i for i, t in enumerate(toks) if t.startswith("Game Note")) + 1
    except ValueError:
        return None
    # skip an empty "Game Note:" value line if present
    teams, blocks, cur = [], {}, None
    i = start
    while i < len(toks):
        t = toks[i]
        if CAP.match(t) and i + 7 < len(toks) and all(re.fullmatch(r"\d+", x) for x in toks[i + 2:i + 8]) and cur is not None:
            name = toks[i + 1]
            fouls, q1, q2, q3, q4, pso = [int(x) for x in toks[i + 2:i + 8]]
            blocks[cur].append({"cap": t, "name": "" if name.upper() == "N/A" else person(name), "ex": fouls,
                                "gq": [q1, q2, q3, q4, pso]})
            i += 8
            continue
        if TIME.match(t):
            break
        if re.search(r"[A-Za-z]", t) and cur is None or (re.search(r"[A-Za-z]", t) and not CAP.match(t) and i + 1 < len(toks) and CAP.match(toks[i + 1])):
            if t not in blocks and len(teams) < 2 and not t.lower().startswith("game note"):
                teams.append(t)
                blocks[t] = []
                cur = t
        i += 1
    if len(teams) != 2:
        return None
    light, dark = teams  # the sheet prints LIGHT first, DARK second
    colour_team = {"LIGHT": light, "DARK": dark}

    # timeline rows; the last row of a sheet sometimes has "-" for its time
    events = []
    j = i
    while j + 4 < len(toks):
        if (TIME.match(toks[j]) or toks[j] == "-") and toks[j + 2] in ("LIGHT", "DARK") and SCORE.match(toks[j + 4]):
            events.append((toks[j], toks[j + 1], toks[j + 2], toks[j + 3], toks[j + 4]))
            j += 5
        else:
            j += 1
    # cumulative goals per period per team, from the Q1..Q4 columns of the player blocks
    cum = {}
    for tm in (light, dark):
        run, arr = 0, []
        for k in range(4):
            run += sum(p["gq"][k] for p in blocks[tm]); arr.append(run)
        cum[tm] = arr
    def period_of(count, tm):
        for k, c in enumerate(cum[tm]):
            if count <= c:
                return k + 1
        return 4
    counts = {light: 0, dark: 0}
    rows = []
    for time, cap, colour, typ, score in events:
        team = colour_team[colour]
        per = None
        if typ == "G":
            counts[team] += 1
            per = period_of(counts[team], team)
        rows.append([time, cap, team, typ, per])
    # non-goal rows take the period of the goal before them, or of the next goal after a clock reset
    last_per, prev_s = 1, None
    for idx, r in enumerate(rows):
        s_ = _secs(r[0]) if r[0] != "-" else None
        if r[4] is None:
            nxt = next((x[4] for x in rows[idx + 1:] if x[4] is not None), last_per)
            r[4] = nxt if (prev_s is not None and s_ is not None and s_ > prev_s + 60 and nxt > last_per) else last_per
        else:
            last_per = r[4]
        if s_ is not None:
            prev_s = s_
    name_of = {tm: {p["cap"]: p["name"] for p in blocks[tm]} for tm in (light, dark)}
    goals, pens = [], []
    by_cap = {light: {}, dark: {}}
    for time, cap, team, typ, per in rows:
        nm = name_of[team].get(cap, "") or (f"#{cap}" if cap != "-" else "")
        clock = "" if time == "-" else (time[1:] if time.startswith("0") else time)
        if typ == "G":
            goals.append({"q": per, "clock": clock or None, "team": team, "type": "G", "player": nm})
            d = by_cap[team].setdefault(cap, {"g": 0, "ex": 0}); d["g"] += 1
        elif typ.startswith("E") or typ == "P":
            pens.append({"q": per, "clock": clock or None, "team": team, "type": typ, "player": nm})
            if typ.startswith("E"):
                d = by_cap[team].setdefault(cap, {"g": 0, "ex": 0}); d["ex"] += 1
    out = {"teams": [light, dark], "periods": {}, "score": {}, "players": {}, "goalies": {}, "goals": goals, "pens": pens,
           "abbr": {}, "title": "scoresheet", "limited": True}
    for tm in (light, dark):
        per = {}
        for g in goals:
            if g["team"] == tm:
                per[g["q"]] = per.get(g["q"], 0) + 1
        out["periods"][tm] = [per.get(k, 0) for k in (1, 2, 3, 4)]
        out["score"][tm] = sum(per.values())
        lines = []
        for p in blocks[tm]:
            d = by_cap[tm].get(p["cap"], {"g": 0, "ex": 0})
            if not p["name"] and not d["g"] and not d["ex"]:
                continue
            lines.append({"cap": p["cap"], "name": p["name"], "sh": 0, "g": d["g"], "a": 0, "ex": d["ex"], "dex": 0, "stl": 0,
                          "fb": 0, "spW": 0, "spL": 0})
        out["players"][tm] = lines
    return out
