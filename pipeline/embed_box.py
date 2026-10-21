"""Rebuild SEED_BOXSCORES and write it into ../index.html (and the mirror copy is refreshed by the caller with cp)."""
import json, os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import boxexport
seed, stats = boxexport.build()
payload = json.dumps(seed, separators=(",", ":"), ensure_ascii=False).replace("</script", "<\\/script")
idx = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "index.html")
html = open(idx, encoding="utf-8").read()
pat = re.compile(r"const SEED_BOXSCORES = \{.*?\};\n(?=const SEED_ROSTER_FIXES)", re.S)
assert pat.search(html), "SEED_BOXSCORES marker not found"
html = pat.sub(lambda m: "const SEED_BOXSCORES = " + payload + ";\n", html, count=1)
open(idx, "w", encoding="utf-8").write(html)
print(stats, "entries", len(seed), "bytes", len(payload))
