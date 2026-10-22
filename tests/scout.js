// Scouting report: matchup value scores and the written game plan, from the app's real seeded data, offline.
const {makeDocument}=require('./dom.js');
const {c,app,g,cal}=require('./setup.js');
c.document=makeDocument();
const D=id=>c.document.getElementById(id);
let pass=0, fail=0;
const check=(name,cond,info='')=>{ cond?pass++:fail++; console.log((cond?'PASS ':'FAIL ')+name+(cond||!info?'':'   ['+info+']')); };
const ucla=app.teams.find(t=>t.name==='UCLA');
const game=app.games.filter(x=>x.teamId===ucla.id && /USC/.test(x.opponent)).sort((a,b)=>b.date.localeCompare(a.date))[0];
const M=c.buildMatchups(game);
check('matchups built for UCLA vs USC', M && M.rows.length>=10, M && M.rows.length);
check('head-to-head meetings found', M.meetings.length>=4, M.meetings.length);
check('every value score is 0-100', M.rows.every(r=>r.us>=0 && r.us<=100 && r.value>=0 && r.value<=100));
check('best matchups favor us, worst favor them', M.best.every(r=>r.us>=55) && M.worst.every(r=>r.us<=45) && M.best.length>0);
check('only current roster players get matchups', M.rows.every(r=>/^#\S+ /.test(r.a) && /^#\S+ /.test(r.b)));
check('no player listed more than twice per list', [M.best, M.worst].every(l=>{ const n={}; l.forEach(r=>{ n[r.a]=(n[r.a]||0)+1; n[r.b]=(n[r.b]||0)+1; }); return Object.values(n).every(x=>x<=2); }));
check('every matchup explains itself', M.rows.every(r=>r.why && r.why.length>40));
const plan=c.buildGamePlan(M, game);
check('game plan has every section', ['outlook','keys','offense','defense','special','flow'].every(k=>plan[k].length>0), JSON.stringify(Object.fromEntries(Object.entries(plan).map(([k,v])=>[k,v.length]))));
check('plan uses real numbers', plan.special.some(x=>/\d+%/.test(x)) && plan.outlook.some(x=>/\d+-\d+/.test(x)));
check('per-game figures, not season totals', !plan.special.some(x=>/penalty goals a game/.test(x) && /\b([3-9]\d)\.\d penalty/.test(x)));
const html=c.buildScoutHtml(game);
check('scouting report includes plan and both matchup tables', /Game plan/.test(html) && /Best matchups for us/.test(html) && /Worst matchups for us/.test(html) && /mu-score/.test(html));
check('report escapes names', !/<script/i.test(html));
// a game the future can't leak into: only games before this one count
const early=app.games.filter(x=>x.teamId===ucla.id && x.status==='final' && x.date).sort((a,b)=>a.date.localeCompare(b.date))[0];
const M0=c.buildMatchups(early);
check('first game of the data uses nothing from after it', M0.US.games===0 || M0.US.recent.every(x=>x.date<early.date));
// untracked opponent still gets a report from what it did against us
const odd=app.games.find(x=>x.teamId===cal.id && x.status==='final' && !c.scoutFindTeam(x.opponent));
if(odd){ let ok=true; try{ c.buildScoutHtml(odd); }catch(e){ ok=false; } check('untracked opponent report builds', ok, odd.opponent); }
// coaches page: the AI box is gone, the next game's report is open
app.selectedTeamId=ucla.id; app.page='coaches'; c.renderCoaches();
const list=D('coachesGameNotesList').innerHTML;
check('coaches page shows scouting reports instead of the AI game plan', /Scouting report &amp; game plan/.test(list) && !/AI Game Plan/.test(list));
check('next game report is open and filled in', /<details class="coach-scout"[^>]*open/.test(list) && /Best matchups for us/.test(list));
console.log(`\n${pass} passed, ${fail} failed`);
