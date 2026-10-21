"""6-8 Sports live-scoring API (api.6-8sports.com) — the richest source when a game was tracked
there: every goal, exclusion, assist, steal, block, missed shot, turnover and sprint, timestamped.
"""
from datetime import date as Date, datetime, timedelta

import net
from names import same_school, display_name, person

API = "https://api.6-8sports.com/api/v2"


def games_on(day):
    """All games created on `day` (YYYY-MM-DD, US time), across a UTC window that covers HST..EST."""
    d = datetime.strptime(day, "%Y-%m-%d")
    start = (d + timedelta(hours=4)).strftime("%Y-%m-%dT%H:%M:%SZ")
    end = (d + timedelta(hours=34)).strftime("%Y-%m-%dT%H:%M:%SZ")
    finished_day = (Date.today() - d.date()).days > 3
    # Each game carries its whole play-by-play, so a page of 50 runs past a megabyte and the network
    # proxy regularly cuts it short, which used to drop every game on that page without a word.
    # Small pages come through intact; a page that still fails is retried one game at a time.
    out, offset, size = [], 0, 25
    age = None if finished_day else 2 * 3600
    while True:
        url = f"{API}/games/output-page/?created_from={start}&created_to={end}&limit={size}&offset={offset}"
        try:
            page = net.get_json(url, max_age=age)
        except ValueError:
            page = None
            for k in range(size):
                one = net.get_json(f"{API}/games/output-page/?created_from={start}&created_to={end}&limit=1&offset={offset + k}", max_age=age)
                if not one:
                    break
                if page is None:
                    page = {"results": [], "next": one.get("next")}
                page["results"].extend(one.get("results") or [])
                page["next"] = one.get("next")
                if not one.get("next"):
                    break
        if not page:
            break
        res = page.get("results") or []
        out.extend(g for g in res if not g.get("in_progress"))
        if not page.get("next") or not res:
            break
        offset += len(res)
    return out


def find(game_index, day, team, opponent, team_score, opp_score):
    """Return the 6-8 game for team-vs-opponent on `day` with the same final score, if tracked."""
    for g in game_index.get(day, []):
        dn, ln = g.get("dark_team_name") or "", g.get("light_team_name") or ""
        ds, ls = g.get("dark_team_score"), g.get("light_team_score")
        if same_school(dn, team) and same_school(ln, opponent) and (ds, ls) == (team_score, opp_score):
            return g, "dark"
        if same_school(ln, team) and same_school(dn, opponent) and (ls, ds) == (team_score, opp_score):
            return g, "light"
    return None, None


def _secs(play_time):
    if not play_time:
        return None
    h, m, s = (play_time.split(":") + ["0", "0"])[:3]
    return int(h) * 3600 + int(m) * 60 + int(s)


def _ts(e):
    return datetime.strptime(e["datetime"][:19], "%Y-%m-%dT%H:%M:%S")


# history key -> event type. Offensive fouls count as turnovers in the box score but are kept apart so a
# steal is never paired with one.
KINDS = (("goals", "goal"), ("missed_shots", "shot_missed"), ("assists", "assist"), ("exclusions", "exclusion"),
         ("earned_exclusions", "exclusion_drawn"), ("penalties", "penalty"), ("earned_penalties", "penalty_drawn"),
         ("steals", "steal"), ("turn_over", "turnover"), ("offensives", "offensive"), ("blocks", "block"),
         ("sprint_start", "sprint"), ("time_out", "timeout"), ("team_turnovers", "team_turnover"))
OPP = {"dark": "light", "light": "dark"}


def convert(g):
    """Normalise a 6-8 game into the pipeline's neutral game form: the full play-by-play in order.

    Returns {'teams': [dark, light], 'score': [d, l], 'events': [...], 'rosters': {...}} or None when the
    record doesn't hold together (goal count != final score). Event sides are 'dark'/'light'. Every event
    gets a period and a game clock (estimated from the surrounding timed events when 6-8 has none), goals
    get the running score, and _pair() works out who each action was against when 6-8 doesn't say.
    """
    h = g.get("history") or {}
    players = {p["pk"]: p for p in g.get("players") or []}
    side = {"Dark Team": "dark", "Light Team": "light"}

    def who(pk):
        p = players.get(pk)
        if not p:
            return None
        return {"name": person(f"{p.get('first_name', '')} {p.get('last_name', '')}"), "cap": str(p.get("number") or "")}

    goals = sorted(h.get("goals") or [], key=_ts)
    if len(goals) != (g.get("dark_team_score") or 0) + (g.get("light_team_score") or 0):
        return None

    raw = []
    for k, t in KINDS:
        for e in h.get(k) or []:
            raw.append((t, e))
    raw.sort(key=lambda x: _ts(x[1]))

    # Period boundaries: the game clock (play_time, counting down) jumps back up when a new period
    # starts. Rebuild periods from that rather than trusting the 'quarter' label, which some
    # scorekeepers never advance.
    timed = [(t, e) for t, e in raw if _secs(e.get("play_time")) is not None]
    period_starts = [_ts(timed[0][1])] if timed else []
    last = None
    for _, e in timed:
        s = _secs(e["play_time"])
        if last is not None and s > last + 30:
            period_starts.append(_ts(e))
        last = s
    labels_ok = _labels_consistent(raw)

    def period_of(e):
        if labels_ok:
            q = e.get("quarter") or ""
            if q.startswith("Period"):
                return int(q.split()[-1])
            if q.startswith("Overtime"):
                return f"OT{q.split()[-1]}"
            if q.lower().startswith("shoot"):
                return "SO"
        n = sum(1 for st in period_starts if _ts(e) >= st) or 1
        return n if n <= 4 else f"OT{n - 4}"

    events = []
    for t, e in raw:
        ev = {"type": t, "side": side.get(e.get("team_color")), "q": period_of(e), "at": e["datetime"],
              "clock": _secs(e.get("play_time")), "est": False}
        if t == "sprint":
            w, l = who(e.get("winner")), who(e.get("loser"))
            wp = players.get(e.get("winner"))
            ev.update({"type": "sprint_won", "player": w, "vs": l,
                       "side": side.get((wp or {}).get("team_color")) or ev["side"]})
        else:
            ev["player"] = who(e.get("player"))
        if t == "goal":
            ev["manUp"] = bool(e.get("on_6_5") or e.get("on_7_6") or e.get("on_6_4"))
            ev["penalty"] = bool(e.get("penalty"))
            ev["counter"] = bool(e.get("counter"))
            ga = e.get("goal_allowed") or []
            if ga:
                ev["goalie"] = who(ga[0] if isinstance(ga[0], str) else ga[0].get("player"))
        events.append(ev)
    _clocks(events)
    score = {"dark": 0, "light": 0}
    for ev in events:
        if ev["type"] == "goal" and ev["side"] in score:
            score[ev["side"]] += 1
            ev["score"] = [score["dark"], score["light"]]
    rosters = {"dark": [], "light": []}
    for p in players.values():
        if p.get("is_staff") or not str(p.get("number") or "").strip() or p.get("number") in ("HC", "AC"):
            continue
        s = side.get(p.get("team_color"))
        if s:
            rosters[s].append({"cap": str(p["number"]), "name": person(f"{p.get('first_name', '')} {p.get('last_name', '')}"),
                               "goalie": bool(p.get("is_goalie")), "played": bool(p.get("was_in_water_once") or p.get("in_water"))})
    _pair(events, rosters)
    return {"source": "6-8sports", "sourceId": g["pk"],
            "teams": [display_name(g.get("dark_team_name")), display_name(g.get("light_team_name"))],
            "score": [g.get("dark_team_score"), g.get("light_team_score")],
            "events": events, "rosters": rosters}


def _labels_consistent(raw):
    order = []
    for _, e in raw:
        q = e.get("quarter") or ""
        k = int(q.split()[-1]) if q.startswith("Period") else (4 + int(q.split()[-1]) if q.startswith("Overtime") else None)
        if k is not None:
            order.append(k)
    if not order or order != sorted(order):
        return False
    return max(order) >= 4  # a game that "ends" in period 1-3 never had its label advanced


def _wall(e):
    return datetime.strptime(e["at"][:19], "%Y-%m-%dT%H:%M:%S")


def _clocks(events):
    """6-8 stamps goals, exclusions, penalties and timeouts with the game clock but not assists, steals,
    blocks, misses or turnovers. Place those between the timed events either side of them in the same
    period (by when they were entered), and mark the result as estimated."""
    by_q = {}
    for i, e in enumerate(events):
        by_q.setdefault(e["q"], []).append(i)
    for q, idx in by_q.items():
        anchors = [i for i in idx if events[i]["clock"] is not None]
        for i in idx:
            e = events[i]
            if e["clock"] is not None:
                continue
            t = _wall(e)
            prev = next((j for j in reversed(anchors) if _wall(events[j]) <= t), None)
            nxt = next((j for j in anchors if _wall(events[j]) >= t), None)
            if prev is not None and nxt is not None and prev != nxt:
                a, b = events[prev], events[nxt]
                span = (_wall(b) - _wall(a)).total_seconds()
                f = (t - _wall(a)).total_seconds() / span if span > 0 else 0
                c = a["clock"] - (a["clock"] - b["clock"]) * f
                e["clock"] = int(round(min(a["clock"], max(b["clock"], c))))
            elif prev is not None:
                a = events[prev]
                e["clock"] = int(max(0, a["clock"] - (t - _wall(a)).total_seconds()))
            elif nxt is not None:
                b = events[nxt]
                e["clock"] = int(min(480, b["clock"] + (_wall(b) - t).total_seconds()))
            else:
                continue
            e["est"] = True


def _pair(events, rosters=None):
    """Work out who each action was against.

    6-8 logs the two halves of a play as separate entries (an exclusion and the exclusion drawn, a steal
    and the turnover, a block and the missed shot, an assist and the goal). Match each to the closest
    entry of the right kind from the other team in the same period: by game clock when both have a real
    one, otherwise by when they were entered. The goalie scored on comes from 6-8 when it records it,
    and otherwise from the goalie recorded for that team's nearest goal against (the one in the water),
    or the team's only goalie who played. Man-up goals are tied to the exclusion that created them, and a
    goal scored within 20 game-clock seconds of an opponent exclusion (with no goal in between) is marked
    as a man-up goal even when the scorekeeper didn't flag it.
    """
    def gap(e, f):
        if e["q"] != f["q"]:
            return None
        if e["clock"] is not None and f["clock"] is not None and not e["est"] and not f["est"]:
            return abs(e["clock"] - f["clock"])
        return abs((_wall(e) - _wall(f)).total_seconds())

    used = set()

    def nearest(i, types, other_side, window=25, key=None):
        e = events[i]
        best, bd = None, None
        for j, f in enumerate(events):
            if j == i or f["type"] not in types or f["side"] != other_side or (key, j) in used:
                continue
            d = gap(e, f)
            if d is not None and d <= window and (bd is None or d < bd):
                best, bd = j, d
        if best is not None:
            used.add((key, best))
        return best

    for i, e in enumerate(events):
        o = OPP.get(e["side"])
        t = e["type"]
        if t == "exclusion_drawn":
            j = nearest(i, ("exclusion",), o, key="x")
            if j is not None:
                e["vs"] = events[j]["player"]; events[j]["vs"] = e["player"]
        elif t == "penalty_drawn":
            j = nearest(i, ("penalty",), o, key="p")
            if j is not None:
                e["vs"] = events[j]["player"]; events[j]["vs"] = e["player"]
        elif t == "steal":
            j = nearest(i, ("turnover",), o, key="s")
            if j is not None:
                e["vs"] = events[j]["player"]; events[j]["vs"] = e["player"]
        elif t == "block":
            j = nearest(i, ("shot_missed",), o, window=10, key="b")
            if j is not None:
                e["vs"] = events[j]["player"]; events[j]["blockedBy"] = e["player"]
        elif t == "assist":
            j = nearest(i, ("goal",), e["side"], window=40, key="a")
            if j is not None:
                e["to"] = events[j]["player"]; events[j]["assist"] = e["player"]

    # goalie in the water for each team, from the goals where 6-8 named the goalie scored on
    known = {"dark": [], "light": []}
    for e in events:
        if e["type"] == "goal" and e.get("goalie") and OPP.get(e["side"]):
            known[OPP[e["side"]]].append(e)
    only = {}
    for s in ("dark", "light"):
        gks = [p for p in (rosters or {}).get(s, []) if p.get("goalie")]
        played = [p for p in gks if p.get("played")]
        pick = played if len(played) == 1 else (gks if len(gks) == 1 else [])
        if pick:
            only[s] = {"name": pick[0]["name"], "cap": pick[0]["cap"]}

    def goalie_for(e):
        d = OPP.get(e["side"])
        if not d:
            return None
        cands = [k for k in known[d] if k is not e]
        same_q = [k for k in cands if k["q"] == e["q"]]
        pool = same_q or cands
        if pool:
            return min(pool, key=lambda k: abs((_wall(k) - _wall(e)).total_seconds()))["goalie"]
        return only.get(d)

    for e in events:
        if e["type"] == "goal":
            if e.get("goalie"):
                e["vs"] = e["goalie"]
            else:
                gk = goalie_for(e)
                if gk:
                    e["goalie"] = e["vs"] = gk
                    e["goalieInferred"] = True
        elif e["type"] == "shot_missed" and not e.get("blockedBy"):
            gk = goalie_for(e)
            if gk:
                e["goalie"] = gk  # the goalie this shot was taken on (6-8 doesn't say whether he saved it)

    # man-up goals and the exclusion behind each
    for i, e in enumerate(events):
        if e["type"] != "goal" or e.get("penalty") or e["clock"] is None or e["est"]:
            continue
        o = OPP.get(e["side"])
        cause = None
        for j in range(i - 1, -1, -1):
            f = events[j]
            if f["q"] != e["q"]:
                break
            if f["type"] == "goal":
                break  # a goal in between ends any earlier man-up
            if f["type"] == "exclusion" and f["side"] == o and f["clock"] is not None and not f["est"]:
                if 0 <= f["clock"] - e["clock"] <= 20:
                    cause = f
                break
        if cause:
            e["after"] = {"excluded": cause.get("player"), "drawnBy": cause.get("vs")}
            if not e.get("manUp"):
                e["manUp"] = True
                e["manUpInferred"] = True
