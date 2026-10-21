import sys, json
sys.path.insert(0,'.')
import config, sidearm
extra = {"California":("calbears.com","classic"),"Stanford":("gostanford.com","classic"),"UCLA":("uclabruins.com","nuxt"),"USC":("usctrojans.com","classic"),"Pacific":("pacifictigers.com","classic"),"UC Davis":("ucdavisaggies.com","classic"),"Pepperdine":("pepperdinewaves.com","classic"),"Saint Mary's":("smcgaels.com","classic")}
teams = {t['name']:t for t in config.TEAMS}
for k,(h,l) in extra.items(): teams[k]={"name":k,"host":h,"layout":l}
for name, season in [("Johns Hopkins",2025),("Iona",2025),("MIT",2025),("California",2025),("USC",2024),("Pacific",2025),("UC Davis",2025),("Pepperdine",2025)]:
    t=teams[name]
    games=[g for g in sidearm.schedule(t,season) if g.get('boxUrl')]
    if not games: print(name,'no box'); continue
    g=games[0]
    try:
        b=sidearm.boxscore(g['boxUrl'],season)
    except Exception as e:
        print(name,'ERR',str(e)[:100]); continue
    print('==',name,season,g['date'],g['opponent'],g.get('teamScore'),g.get('oppScore'),g['boxUrl'])
    if not b: print('  none'); continue
    print('  teams',b['teams'],'abbrs',b['abbrs'],'goals',len(b['goals']),'excl',len(b['exclusions']),'player tables',{k:len(v) for k,v in b['players'].items()},'goalies',{k:len(v) for k,v in b['goalies'].items()})
    for k,v in b['players'].items():
        print('  ',k,'goal sum',sum(p['g'] for p in v), v[:2])
