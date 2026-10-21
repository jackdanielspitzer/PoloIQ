import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import config, sidearm, net
from boxcrawl import TEAMS
for name, t in TEAMS.items():
    for s in config.SEASONS:
        url = f"https://{t['host']}/sports/mens-water-polo/schedule/{s}"
        try:
            g = sidearm.schedule(t, s)
            if not g:
                p = net._cache_path(url)
                if os.path.exists(p): os.remove(p)
                g = sidearm.schedule(t, s)
        except Exception as e:
            print(name, s, 'ERR', str(e)[:80], flush=True); continue
        print(name.ljust(18), s, len(g), 'games', sum(1 for x in g if x.get('result')), 'done', sum(1 for x in g if x.get('boxUrl')), 'box', flush=True)
