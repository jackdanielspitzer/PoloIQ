import json, sys, collections
sys.path.insert(0,'.')
import config, sidearm
extra = [
 {"name":"California","host":"calbears.com","layout":"classic"},
 {"name":"Stanford","host":"gostanford.com","layout":"classic"},
 {"name":"UCLA","host":"uclabruins.com","layout":"nuxt"},
 {"name":"USC","host":"usctrojans.com","layout":"classic"},
 {"name":"Pacific","host":"pacifictigers.com","layout":"classic"},
 {"name":"UC Davis","host":"ucdavisaggies.com","layout":"classic"},
 {"name":"Pepperdine","host":"pepperdinewaves.com","layout":"classic"},
 {"name":"Saint Mary's","host":"smcgaels.com","layout":"classic"},
]
teams = config.TEAMS + extra
only = sys.argv[1:]
res = {}
for t in teams:
    if only and t['name'] not in only: continue
    row = {}
    for s in config.SEASONS:
        try:
            g = sidearm.schedule(t, s)
        except Exception as e:
            row[s] = 'ERR '+str(e)[:60]; continue
        done = [x for x in g if x.get('result')]
        row[s] = (len(g), len(done), sum(1 for x in g if x.get('boxUrl')))
    res[t['name']] = row
    print(t['name'].ljust(18), row, flush=True)
json.dump({k:{str(a):b for a,b in v.items()} for k,v in res.items()}, open('survey_box.json','w'))
