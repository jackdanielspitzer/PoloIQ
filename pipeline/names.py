"""Name normalisation shared by every source."""
import re

from config import TEAMS, CANONICAL_OPPONENTS

_ALIAS = {}
for _t in TEAMS:
    for _a in _t["aliases"] + [_t["name"].lower()]:
        _ALIAS[_a] = _t["name"]

_NOISE = re.compile(
    r"\b(men'?s?|mens|\(m\)|m\b|team|varsity|water\s*polo|20\d\d|university of|univ\.?)\b|\*|\(m\)",
    re.I)


def norm(name):
    """Lowercase, drop rankings ('#18 '), year/gender/team suffixes and punctuation noise."""
    s = (name or "").strip().lower()
    s = re.sub(r"^(#|no\.?)\s*\d+(/\d+)?\s*", "", s)
    s = s.replace("’", "'")
    s = _NOISE.sub(" ", s)
    s = re.sub(r"\s+", " ", s).strip(" -,.")
    return s


def target_name(name):
    """The tracked school's display name if `name` refers to one, else None."""
    n = norm(name)
    if n in _ALIAS:
        return _ALIAS[n]
    for alias, team in _ALIAS.items():
        if len(alias) >= 4 and (n == alias or n.startswith(alias + " ") or n.endswith(" " + alias)):
            return team
    return None


def display_name(name):
    """Best display label for any school: tracked name, known app label, or cleaned original."""
    t = target_name(name)
    if t:
        return t
    n = norm(name)
    if n in CANONICAL_OPPONENTS:
        return CANONICAL_OPPONENTS[n]
    cleaned = re.sub(r"^(#|No\.?)\s*\d+(/\d+)?\s*", "", (name or "").strip(), flags=re.I)
    cleaned = re.sub(r"\s+(University|College)$", "", cleaned) if not re.search(r"(Connecticut|Austin|Boston) College", cleaned) else cleaned
    cleaned = re.sub(r"\s*\((m|M)\)\s*\*?$|\s+Men(s|'s)?(\s+Team)?(\s+20\d\d)?$|\s+20\d\d$", "", cleaned)
    return cleaned.strip() or name


def same_school(a, b):
    na, nb = norm(display_name(a)), norm(display_name(b))
    return na == nb or (len(na) > 3 and len(nb) > 3 and (na in nb or nb in na))


def person(name):
    """'Bartlett, Owen' -> 'Owen Bartlett'; fix ALL-CAPS / all-lowercase names."""
    s = re.sub(r"\s+", " ", (name or "").strip())
    if "," in s:
        last, first = [p.strip() for p in s.split(",", 1)]
        s = f"{first} {last}".strip()
    if s and (s.isupper() or s.islower()):
        s = " ".join(w[:1].upper() + w[1:].lower() if not w.startswith("mc") else
                     "Mc" + w[2:3].upper() + w[3:].lower() for w in s.lower().split(" "))
    return s
