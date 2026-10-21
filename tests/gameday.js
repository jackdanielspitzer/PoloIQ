// Game-day tools, offline: tap-to-log grid and its follow-up details, man-up tracking, shot spots,
// a second phone's camera clock arriving, special-teams math,
// scouting report and export rows. Never touches any backend.
const vm=require('vm');
const {makeDocument}=require('./dom.js');
const {c,app,g,cal}=require('./setup.js');
c.document=makeDocument();
const D=id=>c.document.getElementById(id);
const run=s=>vm.runInContext(s,c);
let pass=0, fail=0;
const check=(name,cond,info='')=>{ cond?pass++:fail++; console.log((cond?'PASS ':'FAIL ')+name+(cond||!info?'':'   ['+info+']')); };
const tryRun=(name,fn)=>{ try{ return fn(); }catch(e){ check(name+' runs without error',false,e.message.split('\n')[0].slice(0,200)); } };
const evs=()=>c.getGameEvents(g);
const cnt=(type,side)=>evs().filter(e=>e.stat_type===type&&(!side||(e.side||'team')===side)).length;
const capIdx=cap=>run('tapState.caps').findIndex(x=>x.cap===String(cap));
const pick=cap=>{ tryRun('render tap grid', ()=>c.renderTapLog(g)); const i=capIdx(cap); if(i<0) throw new Error('cap '+cap+' not on grid'); c.tapPickCap(i); };

g.quarters={1:[],2:[],3:[],4:[]}; g.status='upcoming'; delete g.extraPeriods; g.quarterStart={}; delete g.clockPaused; app.currentQ=1;
c.setGameColor('Dark'); c.setStatFor(null); app.manageMode=true;
const roster=c.getActiveGameRoster(g);
const capOf=n=>String(roster[n].cap);
const [A,B,C2,E]=[capOf(3),capOf(4),capOf(5),capOf(6)];

// ---- tap grid renders ----
tryRun('renderGame', ()=>c.renderGame());
check('tap grid shows our caps', /tap-cap/.test(D('tapLogPanel').innerHTML) && run('tapState.caps').length===roster.length);
check('action buttons disabled until a cap is picked', /tap-act[^>]*disabled/.test(D('tapLogPanel').innerHTML));

// ---- goal + details ----
pick(A); tryRun('tap goal', ()=>c.tapLog('goal'));
check('tapped goal logged with its shot', cnt('goal','team')===1 && cnt('shot_attempt','team')===1);
const goal=evs().find(e=>e.stat_type==='goal');
check('tapped goal is even strength and linked to the player', goal.manState==='even' && goal.playerId && String(goal.playerCap)===A);
check('follow-up offered after the goal', run('tapState.follow && tapState.follow.stat')==='goal');
check('follow-up row rendered', /Assist by/.test(D('tapLogPanel').innerHTML) && /Shot from/.test(D('tapLogPanel').innerHTML));
const sameList=c.tapCapsFor(g,'team').filter(x=>x.cap!==A); const bIdx=sameList.findIndex(x=>x.cap===B);
tryRun('pick assist', ()=>c.tapFollowPick('same', bIdx));
const ast=evs().find(e=>e.stat_type==='assist');
check('assist added to the same action', ast && ast.batchId===goal.batchId && String(ast.playerCap)===B && String(ast.assistTo)===A);
tryRun('pick assist again (toggle off)', ()=>c.tapFollowPick('same', bIdx));
check('picking the same assist again removes it', cnt('assist')===0);
tryRun('pick assist', ()=>c.tapFollowPick('same', bIdx));
tryRun('pick zone', ()=>c.tapFollowZone('lw'));
check('shot spot saved on goal and shot', evs().filter(e=>e.batchId===goal.batchId && (e.stat_type==='goal'||e.stat_type==='shot_attempt')).every(e=>e.zone==='lw'));
tryRun('undo', ()=>c.undoEvent());
check('undo removes the goal with its assist and shot', evs().length===0, JSON.stringify(evs().map(e=>e.stat_type)));

// ---- exclusion flips the situation; the next goal is a man-up goal ----
pick(C2); tryRun('tap exclusion drawn', ()=>c.tapLog('exclusion_drawn'));
check('drawing an exclusion puts us up 6v5', run('tapState.man')==='us_up');
tryRun('who was excluded', ()=>c.tapFollowPick('other', c.tapCapsFor(g,'opponent').findIndex(x=>x.cap==='3')));
check('their exclusion joins the same action', evs().filter(e=>e.stat_type==='exclusion' && e.side==='opponent' && String(e.playerCap)==='3').length===1);
pick(E); tryRun('tap goal on man-up', ()=>c.tapLog('goal'));
check('goal during the exclusion is a man-up goal', evs().filter(e=>e.stat_type==='goal').pop().manState==='team_up');
check('situation back to even after the goal', run('tapState.man')==='even');
let S=c.computeSituations([g]);
check('special teams: 1 of 1 on man-up', S.up.chances===1 && S.up.goals===1, JSON.stringify(S.up));

// ---- their side: a missed shot saved by our goalie ----
tryRun('switch to them', ()=>c.tapSetSide('opponent'));
check('their caps include an unknown cap', run('tapState.caps').some(x=>x.cap==='?'));
pick('9'); tryRun('their shot', ()=>c.tapLog('shot_attempt'));
const gks=c.tapCapsFor(g,'team').filter(x=>x.gk);
if(gks.length){ tryRun('saved by', ()=>c.tapFollowPick('save', 0));
  check('save credited to our goalie vs their shooter', evs().some(e=>e.stat_type==='save' && e.side==='team' && String(e.vsCap)==='9'));
  check('goalie table shows the save', /SV%/.test(c.goalieTableHtml(g,'team'))); }
else check('roster has a goalie for the save prompt', false, 'no GK on roster');
pick('?'); tryRun('unknown-cap turnover', ()=>c.tapLog('turnover'));
check('unknown cap logs with no cap', evs().some(e=>e.stat_type==='turnover' && e.side==='opponent' && e.playerCap==null));
tryRun('their exclusion', ()=>{ pick('4'); c.tapLog('exclusion'); });
check('their exclusion puts us up', run('tapState.man')==='us_up');
tryRun('back to us', ()=>c.tapSetSide('team'));

// ---- voice uses the same situation and shot spots ----
c.tapSetMan('us_up', true);
tryRun('voice goal', ()=>c.handleParsedPhrase(`dark ${A} scores from the left wing`));
const vg=evs().filter(e=>e.stat_type==='goal').pop();
check('spoken goal picks up the man-up from the grid', vg.manState==='team_up', vg.manState);
check('spoken "from the left wing" tags the spot', vg.zone==='lw', vg.zone);
const zones={ 'dark 4 goal on the counter':'ctr', 'light 5 scores from 2 meters':'c', 'dark 3 goal from the top':'top', 'dark 2 scores on a penalty shot':'pen', 'dark 7 right wing goal':'rw', 'dark 6 goal':null };
Object.entries(zones).forEach(([t,z])=>check(`zone for "${t}"`, c.detectShotZone(t)===z, String(c.detectShotZone(t))));

// ---- shot chart ----
const chart=c.computeShotChart([g],'team');
check('shot chart counts the left-wing goal', chart.zones.lw.goals===1 && chart.zones.lw.shots===1, JSON.stringify(chart.zones.lw));
tryRun('render insights', ()=>c.renderGameInsights(g));
check('special teams panel rendered', /Man-up/.test(D('gameSituationsBody').innerHTML) && /shot-zone/.test(D('gameShotBody').innerHTML));

// ---- a second phone's camera clock arrives ----
tryRun('remote reading', ()=>c.onRemoteClock(g.id, {q:'2', r:300000, p:480000, h:0}));
check('follows the camera phone into Q2', String(app.currentQ)==='2');
check('Q2 clock set from the camera phone', Math.abs((480000-c.gameElapsedNow(g)) - 300000) < 1000, 480000-c.gameElapsedNow(g));
const before=JSON.stringify(g.quarterStart);
[{q:'2',r:900000,p:480000},{q:'9',r:1000,p:480000},{q:'2',r:'x',p:480000},null,'junk'].forEach(pl=>c.onRemoteClock(g.id, pl));
check('bad clock messages are ignored', JSON.stringify(g.quarterStart)===before);
c.onRemoteClock('some-other-game', {q:'3', r:1000, p:480000});
check('clock for another game ignored', String(app.currentQ)==='2');

// ---- scouting report, export ----
const sg=c.blankGame(cal.id); sg.opponent='Stanford'; sg.date='2026-11-01';
const html=tryRun('scouting report', ()=>c.buildScoutHtml(sg))||'';
const stan=Object.keys(run('SEED_SCHOOL_PLAYER_STATS').Stanford||{}).find(n=>(run('SEED_SCHOOL_PLAYER_STATS').Stanford[n]['2026']||{}).g>0);
check('scouting report lists their scorers', /Who scores/.test(html) && stan && html.includes(stan.replace(/'/g,'&#39;')), stan);
check('scouting report has their 2026 record', /2026 season/.test(html) && /record/.test(html));
check('scouting report has head to head', /Head to head/.test(html));
const empty=c.buildScoutHtml(Object.assign(c.blankGame(cal.id),{opponent:'Nowhere Tech'}));
check('unknown opponent says there is no data', /No 2026 results/.test(empty));
const rows=c.playByPlayRows(g);
check('play-by-play has every tracked play', rows.length===evs().filter(c.isLiveTrackedEvent).length && rows.some(r=>r.zone==='Left wing'));
check('CSV cells quoted when needed', c.csvCell('a,b')==='"a,b"' && c.csvCell('say "hi"')==='"say ""hi"""' && c.csvCell(3)==='3');

// ---- team page ----
app.selectedTeamId=cal.id; tryRun('team insights', ()=>c.renderTeamInsights(cal));
check('team special teams panel rendered', /Man-up/.test(D('teamSituationsBody').innerHTML));

// ---- nothing executable from names ----
g.oppRoster=[{id:'x1', cap:'5', name:'<img src=x onerror=alert(1)>'}];
c.tapSetSide('opponent'); c.renderTapLog(g);
check('player names are escaped on the grid', !/<img/.test(D('tapLogPanel').innerHTML));
check('scouting report escapes names', !/<img/.test(c.buildScoutHtml(Object.assign(c.blankGame(cal.id),{opponent:'<img src=x>'}))));

// ---- viewers can't log ----
const u=app.users.find(x=>x.id===app.currentUserId); const role=u.role; u.role='player';
const n=evs().length; pick('5'); c.tapLog('goal');
check('a viewer cannot tap-log', evs().length===n);
u.role=role;

console.log(`\n${pass} passed, ${fail} failed`);
