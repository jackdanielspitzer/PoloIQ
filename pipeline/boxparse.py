"""Parse Sidearm men's water polo box score pages (both site templates) into one normalized shape.

Template A (hopkinssports.com, ionagaels.com, ucdavisaggies.com, pacifictigers.com ...):
  tables carry captions ("GAN - Player Stats", "Gannon University - Goalie Statistics"), the scoring
  summary has a Team column, and player names read "Last, First - 1G, 0A".
Template B (calbears.com, usctrojans.com, pepperdinewaves.com ...):
  no captions; each team's table sits under a heading with the team name, the scoring summary has no
  team column (two running-score columns instead), penalties have no team column at all.

Output of parse(html):
{ teams:[A,B], periods:{A:[..],B:[..]}, score:{A:n,B:n},
  players:{A:[{cap,name,sh,g,a,ex,dex,stl,fb,spW,spL}],B:[..]},
  goalies:{A:[{cap,name,min,ga,sv}],B:[..]},
  goals:[{q,clock,team,type,player}], pens:[{q,clock,team,type,player}] }
Team keys are the display names from the linescore table.
"""
import re

from bs4 import BeautifulSoup

from names import person

PLACEHOLDER_NAMES = re.compile(r"^(field player|goalkeeper|unknown|team|bench|total|totals)$", re.I)


def _text(el):
    return re.sub(r"\s+", " ", el.get_text(" ", strip=True)).strip()


def _rows(table):
    return [[_text(c) for c in tr.find_all(["td", "th"])] for tr in table.find_all("tr")]


def _int(v):
    v = (v or "").strip()
    return int(v) if re.fullmatch(r"\d+", v) else 0


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


def _clean_player(raw):
    s = re.sub(r"\s*-\s*\d+G,\s*\d+A\s*$", "", raw or "")
    s = re.sub(r"\s*-\s*\d+S\s*$", "", s)
    return person(s)


def _headings_before(table, n=5):
    """Texts of the nearest preceding headings, nearest first."""
    out, el = [], table
    for _ in range(14):
        el = el.find_previous(["h1", "h2", "h3", "h4", "h5", "caption", "strong"])
        if el is None:
            break
        t = _text(el)
        if t and t not in out:
            out.append(t)
        if len(out) >= n:
            break
    return out


def _abbr_from_caption(cap):
    m = re.match(r"([A-Z0-9]{2,5})\s*-\s*Player Stats", cap or "")
    return m.group(1) if m else None


def _strip_rank(name):
    return re.sub(r"^#+\s*\d+\s*", "", name or "").strip()


def parse(html):
    soup = BeautifulSoup(html, "html.parser")
    tables = soup.find_all("table")
    out = {"teams": [], "periods": {}, "score": {}, "players": {}, "goalies": {}, "goals": [], "pens": [],
           "abbr": {}, "title": _text(soup.title) if soup.title else ""}

    # --- linescore -------------------------------------------------------------------------
    # Template A tables carry captions like "GAN - Player Stats"; those abbreviations also tag the
    # linescore rows ("Gannon University GAN", "JHU Johns Hopkins"), so strip them from the team names.
    abbrs = set()
    for t in tables:
        cap_el = t.find("caption")
        m = re.match(r"([A-Z0-9]{2,6})\s*-\s*Player Stats", _text(cap_el)) if cap_el else None
        if m:
            abbrs.add(m.group(1))
    for t in tables:
        rs = _rows(t)
        if rs and rs[0] and rs[0][0].lower() == "team" and len(rs) >= 3:
            for r in rs[1:3]:
                label = r[0]
                nums = [_int(x) for x in r[1:]]
                if not nums:
                    continue
                total = nums[-1]
                periods = nums[:-1]
                toks = label.split()
                abbr, name = None, label
                if abbrs and len(toks) > 1:
                    if toks[-1] in abbrs:
                        abbr, name = toks[-1], " ".join(toks[:-1])
                    elif toks[0] in abbrs:
                        abbr, name = toks[0], " ".join(toks[1:])
                    elif toks[0].isupper() and len(toks[0]) <= 6 and toks[1][:1].isupper():
                        abbr, name = toks[0], " ".join(toks[1:])
                    elif toks[-1].isupper() and 2 <= len(toks[-1]) <= 6:
                        abbr, name = toks[-1], " ".join(toks[:-1])
                name = re.sub(r"\s*\(M\)\s*$", "", _strip_rank(name)).strip()
                out["teams"].append(name)
                out["periods"][name] = periods
                out["score"][name] = total
                if abbr:
                    out["abbr"][abbr] = name
            break
    if len(out["teams"]) == 2 and abbrs:
        left = [a for a in abbrs if a not in out["abbr"]]
        unmapped = [n for n in out["teams"] if n not in out["abbr"].values()]
        if len(left) == 1 and len(unmapped) == 1:
            out["abbr"][left[0]] = unmapped[0]
    if len(out["teams"]) != 2:
        return None
    A, B = out["teams"]

    def team_for(label):
        """Map a caption/heading/abbreviation to one of the two linescore teams."""
        lab = _strip_rank(label or "")
        lab = re.sub(r"\s*-\s*(Player Stats|Goalie Statistics|Goalkeeping).*$", "", lab, flags=re.I).strip()
        lab = re.sub(r"\s+\d+$", "", lab).strip()
        lab = re.sub(r"\s*\(M\)\s*$", "", lab).strip()
        if lab in out["abbr"]:
            return out["abbr"][lab]
        low = lab.lower()
        best, best_score = None, 0
        for name in (A, B):
            n = name.lower()
            sc = 3 if low == n else 2 if (low.startswith(n) or n.startswith(low)) and min(len(low), len(n)) >= 3 else 1 if (low in n or n in low) and min(len(low), len(n)) >= 3 else 0
            if sc > best_score:
                best, best_score = name, sc
            elif sc == best_score and sc > 0:
                best = None if sc < 3 else best
        return best

    # --- scoring summary & penalties --------------------------------------------------------
    for t in tables:
        rs = _rows(t)
        if not rs:
            continue
        head = [h.lower() for h in rs[0]]
        if "scored by" in head:
            ip, it, iy, isb = head.index("period"), head.index("time"), head.index("type"), head.index("scored by")
            iteam = head.index("team") if "team" in head else None
            score_cols = [i for i in range(isb + 1, len(head))] if iteam is None else []
            prev = [0, 0]
            for r in rs[1:]:
                if len(r) <= isb:
                    continue
                team = None
                if iteam is not None:
                    team = team_for(r[iteam])
                else:
                    cur = [_int(r[i]) if i < len(r) else 0 for i in score_cols[:2]]
                    if len(cur) == 2:
                        # header order is [first-listed team, second-listed team] = linescore order
                        if cur[0] > prev[0]:
                            team = A
                        elif cur[1] > prev[1]:
                            team = B
                        prev = cur
                out["goals"].append({"q": _period(r[ip]), "clock": r[it] or None, "team": team,
                                     "type": r[iy], "player": person(r[isb])})
        elif head[:1] in (["-"], ["period"]) and "player" in head and "type" in head and "sh" not in head:
            ip, it, iy, ipl = head.index("period"), head.index("time"), head.index("type"), head.index("player")
            iteam = head.index("team") if "team" in head else None
            for r in rs[1:]:
                if len(r) <= ipl:
                    continue
                out["pens"].append({"q": _period(r[ip]), "clock": r[it] or None,
                                    "team": team_for(r[iteam]) if iteam is not None else None,
                                    "type": r[iy], "player": person(r[ipl])})

    # --- player & goalie tables ------------------------------------------------------------
    for t in tables:
        rs = _rows(t)
        if not rs:
            continue
        head = [h.lower() for h in rs[0]]
        cap_el = t.find("caption")
        cap = _text(cap_el) if cap_el else ""
        if "player" in head and "sh" in head and "g" in head and "a" in head:
            team = team_for(cap) if cap else next((x for x in (team_for(h) for h in _headings_before(t)) if x), None)
            if not team:
                team = "?" + str(len(out["players"]))
            idx = {h: i for i, h in enumerate(head)}
            lst = []
            for r in rs[1:]:
                if not r or r[0].upper() in ("TOTALS", "TOTAL") or len(r) < len(head):
                    continue
                name = _clean_player(r[idx["player"]])
                sp = r[idx["sprint"]] if "sprint" in idx else "0-0"
                m = re.match(r"(\d+)\s*-\s*(\d+)", sp)
                lst.append({"cap": r[idx["#"]], "name": name, "sh": _int(r[idx["sh"]]), "g": _int(r[idx["g"]]),
                            "a": _int(r[idx["a"]]), "ex": _int(r[idx["ex"]]) if "ex" in idx else 0,
                            "dex": _int(r[idx["dex"]]) if "dex" in idx else 0,
                            "stl": _int(r[idx["stl"]]) if "stl" in idx else 0,
                            "fb": _int(r[idx["fb"]]) if "fb" in idx else 0,
                            "spW": int(m.group(1)) if m else 0, "spL": int(m.group(2)) if m else 0})
            out["players"][team] = lst
        elif ("goalie" in head or ("player" in head and "saves" in head)) and "ga" in head:
            team = team_for(cap) if cap else next((x for x in (team_for(h) for h in _headings_before(t)) if x), None)
            if not team:
                team = "?" + str(len(out["goalies"]))
            ig = head.index("goalie") if "goalie" in head else head.index("player")
            ic = head.index("#")
            lst = []
            for r in rs[1:]:
                if not r or r[0].upper() in ("TOTALS", "TOTAL") or r[ig].upper() in ("TOTALS", "TOTAL") or len(r) <= head.index("saves"):
                    continue
                lst.append({"cap": r[ic], "name": _clean_player(r[ig]), "min": r[head.index("minutes")] if "minutes" in head else "",
                            "ga": _int(r[head.index("ga")]), "sv": _int(r[head.index("saves")])})
            out["goalies"][team] = lst

    # a table whose heading did not match either team name (e.g. "USC" vs "Southern California") goes to the team that has none yet
    for key in ("players", "goalies"):
        unk = [k for k in out[key] if k.startswith("?")]
        missing = [tm for tm in (A, B) if tm not in out[key]]
        if len(unk) == 1 and len(missing) == 1:
            out[key][missing[0]] = out[key].pop(unk[0])
        else:
            for k in unk:
                out[key].pop(k)
    # attach penalty team by finding the player in either table when the penalties table has no team column
    def side_of(name):
        for tm in (A, B):
            if any(p["name"] == name for p in out["players"].get(tm, [])):
                return tm
        return None
    for p in out["pens"]:
        if not p["team"]:
            p["team"] = side_of(p["player"])
    for g in out["goals"]:
        if not g["team"]:
            g["team"] = side_of(g["player"])
    return out


def quality(box):
    """Flags for how complete a parsed box score is."""
    flags = []
    for tm in box["teams"]:
        lines = box["players"].get(tm, [])
        gsum = sum(p["g"] for p in lines)
        if not lines:
            flags.append(f"no-lines:{tm}")
        elif gsum != box["score"][tm]:
            flags.append(f"goals:{tm}:{gsum}!={box['score'][tm]}")
        if any(PLACEHOLDER_NAMES.match(p["name"] or "") for p in lines):
            flags.append(f"anon:{tm}")
    return flags
