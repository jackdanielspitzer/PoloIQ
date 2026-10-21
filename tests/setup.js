const c=require('./load.js');
for(const f of ['ensureSeedTeamsAndSchedule','ensurePastSeasonResults','ensureOpponentSchoolResults','ensureSchoolSeed2026Schedule']){ try{ c[f] && c[f](); }catch(e){ console.log('seed err',f,e.message.slice(0,120)); } }
const app=c.__app; const cal=app.teams.find(t=>t.name==='California');
const u=c.blankUser(); u.name='Test'; u.role='coach'; u.teamId=cal.id; app.users.push(u); app.currentUserId=u.id;
let g=app.games.find(x=>x.teamId===cal.id && x.status!=='final');
if(!g){ g=c.blankGame(cal.id); g.opponent='Stanford'; app.games.push(g); cal.games.push(g.id); }
app.selectedGameId=g.id; g.ourColor='Dark'; app.statFor={gameId:g.id, side:null};
module.exports={c,app,g,cal};
