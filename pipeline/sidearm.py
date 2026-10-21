"""Parsers for Sidearm Sports athletics sites (schedule, box score, roster).

Two site generations exist: 'classic' pages render the schedule as li.sidearm-schedule-game
rows; 'nuxt' pages embed everything in a Nuxt 3 devalue payload (<script id="__NUXT_DATA__">).
"""
import json
import re
from datetime import date as Date

from bs4 import BeautifulSoup

import net
from names import person

MONTHS = {m: i for i, m in enumerate(
    ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"], 1)}


def _age(season):
    """Cache policy: finished seasons forever, the current one for 3 hours."""
    return None if season < Date.today().year else 3 * 3600


# ---------------------------------------------------------------- schedule

def schedule(team, season):
    url = f"https://{team['host']}/sports/mens-water-polo/schedule/{season}"
    html = net.get(url, max_age=_age(season))
    if not html:
        return []
    title = re.search(r"<title>(.*?)</title>", html, re.S)
    page_year = re.match(r"\s*(\d{4})", title.group(1)) if title else None
    if page_year and int(page_year.group(1)) != season:
        return []  # site redirected a missing season to a different one
    games = _schedule_classic(html, team, season) if team["layout"] == "classic" else []
    if not games:
        games = _schedule_nuxt(html, team, season)
    return games


def _parse_result(text):
    m = re.search(r"\b([WLT])\s*,?\s*(\d+)\s*-\s*(\d+)(?:\s*\(([^)]*)\))?", text)
    if not m:
        return None
    return {"result": m.group(1), "teamScore": int(m.group(2)), "oppScore": int(m.group(3)),
            "resultNote": (m.group(4) or "").strip() or None}


def _schedule_classic(html, team, season):
    soup = BeautifulSoup(html, "html.parser")
    out = []
    for li in soup.select("li.sidearm-schedule-game"):
        name_el = li.select_one(".sidearm-schedule-game-opponent-name")
        date_el = li.select_one(".sidearm-schedule-game-opponent-date")
        if not name_el or not date_el:
            continue
        spans = [s.get_text(" ", strip=True) for s in date_el.find_all("span")]
        m = re.match(r"([A-Za-z]{3})\w*\.?\s+(\d{1,2})", spans[0] if spans else "")
        if not m:
            continue
        month = MONTHS[m.group(1).lower()]
        year = season if month >= 6 else season + 1
        d = f"{year:04d}-{month:02d}-{int(m.group(2)):02d}"
        vs = li.select_one(".sidearm-schedule-game-conference-vs")
        at_vs = (vs.get_text(" ", strip=True) if vs else "").lower()
        classes = li.get("class", [])
        loc = li.select_one(".sidearm-schedule-game-location")
        res_el = li.select_one(".sidearm-schedule-game-result")
        res = _parse_result(res_el.get_text(" ", strip=True)) if res_el else None
        box = None
        for a in li.select("a[href]"):
            href = a["href"]
            if "boxscore" in href.lower() or (a.get_text(strip=True).lower() == "box score"):
                box = href if href.startswith("http") else f"https://{team['host']}{href}"
                break
        out.append({
            "team": team["name"], "season": season, "date": d,
            "time": spans[1] if len(spans) > 1 else None,
            "opponent": re.sub(r"\s+", " ", name_el.get_text(" ", strip=True)),
            "venue": "neutral" if "sidearm-schedule-neutral-game" in classes else
                     ("away" if at_vs.startswith("at") else "home"),
            "location": loc.get_text(" ", strip=True) if loc else None,
            "boxUrl": box, "gameId": li.get("data-game-id"), **(res or {}),
        })
    return out


def _devalue(html):
    m = re.search(r'<script[^>]*id="__NUXT_DATA__"[^>]*>(.*?)</script>', html, re.S)
    if not m:
        return None
    arr = json.loads(m.group(1))
    memo = {}
    wrappers = {"Reactive", "ShallowReactive", "Ref", "ShallowRef", "EmptyRef", "EmptyShallowRef", "NuxtError"}

    def r(i, depth=0):
        if not isinstance(i, int) or i < 0 or i >= len(arr) or depth > 60:
            return None
        if i in memo:
            return memo[i]
        v = arr[i]
        if isinstance(v, dict):
            out = {}
            memo[i] = out
            for k, idx in v.items():
                out[k] = r(idx, depth + 1)
            return out
        if isinstance(v, list):
            if v and isinstance(v[0], str) and v[0] in wrappers:
                return r(v[1], depth + 1) if len(v) > 1 else None
            if v and isinstance(v[0], str) and v[0] in ("Set", "Map", "Date", "BigInt", "undefined"):
                return v[1] if len(v) > 1 and v[0] == "Date" else None
            out = []
            memo[i] = out
            out.extend(r(x, depth + 1) for x in v)
            return out
        return v
    return r(0)


def _walk(o, pred, seen=None):
    seen = seen if seen is not None else set()
    if id(o) in seen:
        return
    seen.add(id(o))
    if isinstance(o, dict):
        if pred(o):
            yield o
        for v in o.values():
            yield from _walk(v, pred, seen)
    elif isinstance(o, list):
        for v in o:
            yield from _walk(v, pred, seen)


def _schedule_nuxt(html, team, season):
    data = _devalue(html)
    if data is None:
        return []
    out, seen = [], set()
    for g in _walk(data, lambda o: "opponent" in o and "date" in o and "result" in o and "at_vs" in o):
        gid = g.get("id")
        if gid in seen:
            continue
        seen.add(gid)
        opp = g.get("opponent") or {}
        res = g.get("result") or {}
        d = (g.get("date") or "")[:10]
        if not d:
            continue
        r = None
        if res.get("status") in ("W", "L", "T") and str(res.get("team_score", "")).isdigit():
            r = {"result": res["status"], "teamScore": int(res["team_score"]),
                 "oppScore": int(res["opponent_score"]), "resultNote": res.get("postscore_info") or None}
        box = res.get("boxscore")
        if isinstance(box, dict):
            box = box.get("url")
        if box and not str(box).startswith("http"):
            box = f"https://{team['host']}{box}"
        ind = (g.get("location_indicator") or "").upper()
        out.append({
            "team": team["name"], "season": season, "date": d, "time": g.get("time"),
            "opponent": re.sub(r"\s+", " ", (opp.get("title") or "").strip()),
            "venue": {"H": "home", "A": "away", "N": "neutral"}.get(ind, "home"),
            "location": g.get("location"), "boxUrl": box or None, "gameId": str(gid), **(r or {}),
        })
    return out


# ---------------------------------------------------------------- box score

def _clock_to_elapsed_ms(clock, period_ms=8 * 60 * 1000):
    m = re.match(r"(\d+):(\d+)", clock or "")
    if not m:
        return None
    remaining = (int(m.group(1)) * 60 + int(m.group(2))) * 1000
    return max(0, period_ms - remaining)


def _period(label):
    s = (label or "").strip().lower()
    m = re.match(r"(\d)(st|nd|rd|th)", s)
    if m:
        return int(m.group(1))
    m = re.match(r"(?:ot|overtime)\s*(\d*)", s)
    if m:
        return f"OT{m.group(1) or 1}"
    if s.startswith("so") or "shoot" in s:
        return "SO"
    return None


def boxscore(url, season):
    """Parse a Sidearm water polo box score. Returns teams, timed goals/exclusions, player lines."""
    html = net.get(url, max_age=_age(season))
    if not html:
        return None
    soup = BeautifulSoup(html, "html.parser")
    title = soup.title.get_text(" ", strip=True) if soup.title else ""
    tables = soup.find_all("table")

    def rows(t):
        return [[c.get_text(" ", strip=True) for c in tr.find_all(["td", "th"])] for tr in t.find_all("tr")]

    def caption(t):
        c = t.find("caption")
        return c.get_text(" ", strip=True) if c else ""

    goals, excl, players, goalies, abbrs = [], [], {}, {}, []
    for t in tables:
        rs = rows(t)
        if not rs:
            continue
        head = [h.lower() for h in rs[0]]
        cap = caption(t)
        if head[:5] == ["period", "time", "team", "type", "scored by"]:
            for r in rs[1:]:
                if len(r) >= 5:
                    goals.append({"q": _period(r[0]), "clock": r[1], "team": r[2], "type": r[3], "player": person(r[4])})
        elif head[:5] == ["period", "time", "team", "type", "player"]:
            for r in rs[1:]:
                if len(r) >= 5:
                    excl.append({"q": _period(r[0]), "clock": r[1], "team": r[2], "type": r[3], "player": person(r[4])})
        elif "player stats" in cap.lower() or (head[:2] == ["#", "player"] and "sh" in head):
            abbr = cap.split(" - ")[0].strip() if " - " in cap else None
            idx = {h: i for i, h in enumerate(head)}
            lst = []
            for r in rs[1:]:
                if not r or r[0].upper() == "TOTALS" or len(r) < len(head):
                    continue
                nm = re.sub(r"\s*-\s*\d+G,\s*\d+A\s*$", "", r[1]).strip()

                def num(k):
                    v = r[idx[k]] if k in idx else "0"
                    return int(v) if v.isdigit() else 0
                sp = r[idx["sprint"]] if "sprint" in idx else "0-0"
                spw, spl = (sp.split("-") + ["0"])[:2] if "-" in sp else ("0", "0")
                lst.append({"cap": r[0], "name": person(nm), "sh": num("sh"), "g": num("g"), "a": num("a"),
                            "exG": num("ex"), "exD": num("dex"), "stl": num("stl"),
                            "spW": int(spw) if spw.isdigit() else 0, "spL": int(spl) if spl.isdigit() else 0})
            players[abbr or f"side{len(players)}"] = lst
            if abbr:
                abbrs.append(abbr)
        elif "goalie statistics" in cap.lower() or (len(head) > 3 and head[1] == "goalie"):
            side = cap.split(" - ")[0].strip()
            lst = []
            for r in rs[1:]:
                if not r or r[0].upper() == "TOTALS" or len(r) < 5:
                    continue
                nm = re.sub(r"\s*-\s*\d+S\s*$", "", r[1]).strip()
                lst.append({"cap": r[0], "name": person(nm), "min": r[2],
                            "ga": int(r[3]) if r[3].isdigit() else 0, "sv": int(r[4]) if r[4].isdigit() else 0})
            goalies[side] = lst
    # "Johns Hopkins (0-1) -VS- #20 Navy (1-0)" style header -> team names in page order
    header = soup.select_one(".sidearm-box-score-header, .boxscore-header") or soup
    m = re.search(r"([A-Z][^()|]+?)\s*\([\d\- ,]*\)\s*-?VS-?\s*([#\d ]*[A-Z][^()|]+?)\s*\(", soup.get_text(" ", strip=True))
    names = [m.group(1).strip(), re.sub(r"^#\d+\s*", "", m.group(2).strip())] if m else []
    return {"url": url, "title": title, "teams": names, "abbrs": abbrs, "goals": goals,
            "exclusions": excl, "players": players, "goalies": goalies}


# ---------------------------------------------------------------- roster

def roster(team, season):
    url = f"https://{team['host']}/sports/mens-water-polo/roster/{season}"
    html = net.get(url, max_age=None if season < Date.today().year else 7 * 86400)
    if not html:
        return []
    out = []
    soup = BeautifulSoup(html, "html.parser")
    for li in soup.select("li.sidearm-roster-player"):
        nm = li.select_one(".sidearm-roster-player-name h3, .sidearm-roster-player-name a")
        cap = li.select_one(".sidearm-roster-player-jersey-number")
        pos = li.select_one(".sidearm-roster-player-position .text-bold, .sidearm-roster-player-position span")
        if nm:
            out.append({"cap": (cap.get_text(strip=True) if cap else "").strip(),
                        "name": person(nm.get_text(" ", strip=True)),
                        "position": pos.get_text(" ", strip=True) if pos else ""})
    if out:
        return out
    data = _devalue(html)
    if data is None:
        return []
    seen = set()
    for p in _walk(data, lambda o: "first_name" in o and "last_name" in o and ("jersey_number" in o or "jersey" in o)):
        key = (p.get("first_name"), p.get("last_name"))
        if key in seen:
            continue
        seen.add(key)
        pos = p.get("position_short") or p.get("position_long") or ""
        if isinstance(pos, dict):
            pos = pos.get("abbreviation") or pos.get("title") or ""
        out.append({"cap": str(p.get("jersey_number") or p.get("jersey") or ""),
                    "name": person(f"{p.get('first_name', '')} {p.get('last_name', '')}"),
                    "position": pos or ""})
    return out
