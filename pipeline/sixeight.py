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
    out, offset = [], 0
    while True:
        url = f"{API}/games/output-page/?created_from={start}&created_to={end}&limit=50&offset={offset}"
        page = net.get_json(url, max_age=None if finished_day else 2 * 3600)
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


def convert(g):
    """Normalise a 6-8 game into the pipeline's neutral game form.

    Returns {'teams': [dark, light], 'score': [d, l], 'events': [...], 'rosters': {...}} or None when
    the record doesn't hold together (goal count != final score). Event sides are 'dark'/'light'.
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
    for e in goals:
        raw.append(("goal", e))
    for k, t in (("exclusions", "exclusion"), ("earned_exclusions", "exclusion_drawn"), ("assists", "assist"),
                 ("steals", "steal"), ("blocks", "block"), ("missed_shots", "shot_missed"),
                 ("turn_over", "turnover"), ("offensives", "turnover"), ("penalties", "penalty"),
                 ("earned_penalties", "penalty_drawn"), ("sprint_start", "sprint")):
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
              "clock": _secs(e.get("play_time"))}
        if t == "sprint":
            w, l = who(e.get("winner")), who(e.get("loser"))
            wp = players.get(e.get("winner"))
            ev.update({"type": "sprint_won", "player": w, "vs": l,
                       "side": side.get((wp or {}).get("team_color")) or ev["side"]})
        else:
            ev["player"] = who(e.get("player"))
        if t == "goal":
            ev["score"] = [e.get("dark_team_score"), e.get("light_team_score")]
            ev["manUp"] = bool(e.get("on_6_5") or e.get("on_7_6") or e.get("on_6_4"))
            ev["penalty"] = bool(e.get("penalty"))
            ga = e.get("goal_allowed") or []
            if ga:
                ev["goalie"] = who(ga[0] if isinstance(ga[0], str) else ga[0].get("player"))
        events.append(ev)
    _pair(events)
    rosters = {"dark": [], "light": []}
    for p in players.values():
        if p.get("is_staff") or not str(p.get("number") or "").strip() or p.get("number") in ("HC", "AC"):
            continue
        s = side.get(p.get("team_color"))
        if s:
            rosters[s].append({"cap": str(p["number"]), "name": person(f"{p.get('first_name', '')} {p.get('last_name', '')}"),
                               "goalie": bool(p.get("is_goalie"))})
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


def _pair(events):
    """Link each event to the opponent involved, using what happened at the same moment."""
    def nearest(i, types, other_side, window=25):
        e = events[i]
        t0 = datetime.strptime(e["at"][:19], "%Y-%m-%dT%H:%M:%S")
        best, bd = None, None
        for j, f in enumerate(events):
            if f["type"] not in types or f["side"] != other_side or f.get("_used"):
                continue
            d = abs((datetime.strptime(f["at"][:19], "%Y-%m-%dT%H:%M:%S") - t0).total_seconds())
            if d <= window and (bd is None or d < bd):
                best, bd = j, d
        return best

    opp = {"dark": "light", "light": "dark"}
    for i, e in enumerate(events):
        o = opp.get(e["side"])
        if e["type"] == "exclusion_drawn":
            j = nearest(i, ("exclusion",), o)
            if j is not None:
                e["vs"] = events[j]["player"]
                events[j]["vs"] = e["player"]
        elif e["type"] == "steal":
            j = nearest(i, ("turnover",), o)
            if j is not None:
                e["vs"] = events[j]["player"]
                events[j]["vs"] = e["player"]
        elif e["type"] == "block":
            j = nearest(i, ("shot_missed",), o, window=10)
            if j is not None:
                e["vs"] = events[j]["player"]
                events[j]["blockedBy"] = e["player"]
        elif e["type"] == "assist":
            j = nearest(i, ("goal",), e["side"], window=40)
            if j is not None:
                e["to"] = events[j]["player"]
                events[j]["assist"] = e["player"]
        elif e["type"] == "goal" and e.get("goalie"):
            e["vs"] = e["goalie"]
