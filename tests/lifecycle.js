// Full game lifecycle, offline (fetch always rejects, so nothing can reach the shared backend).
const {makeDocument}=require('./dom.js');
const {c,app,g,cal}=require('./setup.js');
c.document=makeDocument();
const D=id=>c.document.getElementById(id);
let pass=0, fail=0; const fails=[];
const check=(name,cond,info='')=>{ if(cond){pass++;} else {fail++; fails.push(name+(info?' -> '+info:''));} console.log((cond?'PASS ':'FAIL ')+name+(cond||!info?'':'   ['+info+']')); };
const tryRun=(name,fn)=>{ try{ const r=fn(); return r; }catch(e){ check(name+' runs without error',false,e.message.split('\n')[0].slice(0,160)); return undefined; } };
const evs=()=>c.getGameEvents(g);
const cnt=(type,side)=>evs().filter(e=>e.stat_type===type&&(!side||(e.side||'team')===side)).length;
const roster=c.getActiveGameRoster(g);
const p=cap=>roster.find(x=>String(x.cap)===String(cap));

// ---- 1. Game setup ----
g.quarters={1:[],2:[],3:[],4:[]}; g.status='upcoming'; delete g.extraPeriods; g.quarterStart={}; g.tacticalLog=[]; app.currentQ=1;
check('roster loaded for game', roster.length>=10, 'roster '+roster.length);
check('status Upcoming before any event', c.gameDisplayStatus(g)==='Upcoming');
tryRun('setGameColor', ()=>c.setGameColor('Light'));
check('cap color set to Light', g.ourColor==='Light');
tryRun('setStatFor both', ()=>c.setStatFor(null));
check('stat-for set to both sides', app.statFor.gameId===g.id && app.statFor.side===null);
tryRun('renderGame (fresh)', ()=>c.renderGame());

// ---- 2. Q1: voice, with our color = light ----
const say=t=>tryRun('phrase "'+t+'"', ()=>c.handleParsedPhrase(t));
say('light 5 sprint won');
check('Q1 clock started on first phrase', typeof g.quarterStart[1]==='number');
say('light 8 goal assisted by light 3');
check('light = our team after color flip', cnt('goal','team')===1 && cnt('assist','team')===1, JSON.stringify(evs().map(e=>e.stat_type+':'+e.side)));
say('dark 4 goal');
check('dark goal counted for opponent', cnt('goal','opponent')===1);
check('status In progress after events', c.gameDisplayStatus(g)==='In progress');
say('light 2 excluded');
say('undo');
check('voice undo removes whole phrase', cnt('exclusion','team')===0);
// manual entry
D('manualPlayerSelect').value=p(7).id; D('manualStatSelect').value='goal'; D('manualSideSelect').value='team';
tryRun('addManualEvent', ()=>c.addManualEvent());
check('manual goal logged w/ implied shot', cnt('goal','team')===2 && evs().filter(e=>e.playerId===p(7).id&&e.stat_type==='shot_attempt').length===1);
tryRun('undoEvent manual', ()=>c.undoEvent());
check('manual undo removes goal AND its shot', cnt('goal','team')===1 && evs().filter(e=>e.playerId===p(7).id).length===0);
D('manualPlayerSelect').value=p(7).id; D('manualStatSelect').value='steal'; tryRun('addManualEvent steal', ()=>c.addManualEvent());
D('manualSideSelect').value='opponent'; D('manualOppCap').value='9'; D('manualStatSelect').value='exclusion'; tryRun('addManualEvent opp', ()=>c.addManualEvent());
check('manual opponent exclusion with cap', evs().some(e=>e.side==='opponent'&&e.stat_type==='exclusion'&&String(e.playerCap)==='9'));
D('manualSideSelect').value='team';
D('manualNoteText').value='good drive left side'; tryRun('addManualNote', ()=>c.addManualNote());
check('manual note logged + input cleared', evs().some(e=>e.stat_type==='note'&&e.note==='good drive left side') && D('manualNoteText').value==='');

// ---- 3. Q2-Q4 ----
app.currentQ=2; tryRun('renderGame Q2', ()=>c.renderGame());
tryRun('undo on empty quarter', ()=>c.undoEvent());
check('undo on empty Q2 does not touch Q1', g.quarters[1].length>0);
say('light 11 goal on the six on five'); say('dark 6 goal'); say('light 1 save');
check('Q2 clock separate from Q1', typeof g.quarterStart[2]==='number');
check('6v5 goal tagged man-up', g.quarters[2].some(e=>e.stat_type==='goal'&&e.manState&&e.manState!=='even'), JSON.stringify(g.quarters[2].filter(e=>e.stat_type==='goal').map(e=>e.manState)));
app.currentQ=3; say('dark 3 goal'); say('light 8 excluded'); say('light 10 steal'); say('light 10 turnover');
app.currentQ=4; say('light 8 goal'); say('dark 2 goal'); say('light 5 exclusion drawn');
let s=c.computeGameScore(g);
check('regulation score us 3 - them 4', s.team===3 && s.opponent===4, JSON.stringify(s));

// ---- 4. side restriction ----
app.statFor={gameId:g.id, side:'team'}; const before=evs().length; say('dark 9 goal');
check('stats-for-us-only drops opponent goal', evs().length===before);
app.statFor={gameId:g.id, side:null};

// ---- 5. permissions ----
const coach=app.currentUserId; const viewer=c.blankUser(); viewer.id='uview'; viewer.role='player'; viewer.teamId=cal.id; app.users.push(viewer); app.currentUserId=viewer.id;
const b2=evs().length; say('light 8 goal');
check('player-role account cannot log stats', evs().length===b2);
app.currentUserId=coach;

// ---- 6. OT + shootout ----
const ot=c.addExtraPeriod(g,'OT'); check('OT1 period created', ot==='OT1' && Array.isArray(g.quarters.OT1));
app.currentQ='OT1'; say('light 8 goal'); say('dark 4 goal');
s=c.computeGameScore(g); check('OT goals count in score (4-5)', s.team===4&&s.opponent===5, JSON.stringify(s));
check('period label OT1', c.periodLabel('OT1')==='OT1' && c.periodLabel(3)==='Q3');
const so=c.addExtraPeriod(g,'SO'); check('Shootout created once', so==='SO' && c.addExtraPeriod(g,'SO')===null);
app.currentQ='SO'; say('light 8 goal'); say('light 3 goal'); say('dark 4 goal');
s=c.computeGameScore(g); check('shootout adds .1 per goal (4.2-5.1)', s.team===4.2&&s.opponent===5.1, JSON.stringify(s));
check('shootout goals excluded from stat totals', c.getGameEvents(g).filter(e=>e.stat_type==='goal').length===9);
tryRun('renderGame SO', ()=>c.renderGame());
check('no game clock in shootout', c.eventClockLabel(g,'SO',{wall_time_offset_ms:1000})==='—');

// ---- 7. clock ----
const fake={ms:0}; const realNow=Date.now; let t0=realNow(); c.Date.now=()=>t0+fake.ms;
// readings that tick down normally are accepted after the first agrees
c.clockSyncTrust=null;
let acc=[]; [[0,300000],[1000,299000],[2000,298000]].forEach(([dt,ms])=>{ fake.ms=dt; acc.push(c.clockReadingAccepted(ms)); });
check('clock: normal countdown accepted after 2 agreeing reads', acc.join()==='false,true,true', acc.join());
fake.ms=3000; check('clock: single misread jump rejected (4:58 -> 7:58)', c.clockReadingAccepted(478000)===false);
fake.ms=4000; check('clock: true reading still accepted after misread', c.clockReadingAccepted(296000)===true);
// stoppage: clock held at 4:56 for 20 s (timeout) must stay accepted
let ok=true; for(let i=1;i<=20;i++){ fake.ms=4000+i*1000; ok = ok && c.clockReadingAccepted(296000); } check('clock: stopped clock (timeout) stays accepted', ok);
// new period reset 0:00 -> 8:00 accepted after 3 reads
fake.ms=30000; c.clockReadingAccepted(0); fake.ms=31000; c.clockReadingAccepted(0);
acc=[]; [32000,33000,34000].forEach((dt,i)=>{ fake.ms=dt; acc.push(c.clockReadingAccepted(480000-i*1000)); });
check('clock: new-quarter reset to 8:00 accepted on 3rd read', acc.join()==='false,false,true', acc.join());
// misreads: impossible times, repeated glitches, and single bad frames
const vm2=require('vm'); vm2.runInContext('clockSyncTrust=null; clockSyncPending=null; clockSyncFrameVotes=[]; clockSyncPeriodMs=480000;', c);
fake.ms=40000; c.clockReadingAccepted(391000); fake.ms=41000; c.clockReadingAccepted(390000); // trusted at 6:30
let imp=false; for(let i=0;i<10;i++){ fake.ms=42000+i*200; imp = imp || c.clockReadingAccepted(34*60000+3000); }
check('clock: 34:03 in an 8:00 period is never accepted', imp===false);
let early=false; for(let i=0;i<5;i++){ fake.ms=45000+i*200; early = early || c.clockReadingAccepted(91000); }
check('clock: a repeated wrong drop (6:30 -> 1:31) needs 6 reads over 2s', early===false);
let later=false; for(let i=0;i<12;i++){ fake.ms=46000+i*250; later = c.clockReadingAccepted(91000) || later; }
check('clock: a real correction is accepted once it holds for 2s', later===true);
vm2.runInContext('clockSyncFrameVotes=[];', c);
const votes=[390000,390000,390000,140000,390000].map((v,i)=>{ fake.ms=60000+i*200; return c.clockVotedReading(v); });
check('clock: one glitchy frame is outvoted', !votes.includes(140000) && votes[4]===390000, JSON.stringify(votes));
c.Date.now=realNow;
// event clock label = scoreboard countdown
g.periodLengthMs=480000;
check('event clock label 8:00 - 1:30 = 6:30', c.eventClockLabel(g,1,{wall_time_offset_ms:90000})==='6:30');
check('event clock never negative', c.eventClockLabel(g,1,{wall_time_offset_ms:999999})==='0:00');

// ---- 7b. tactics round trip keeps Edit mode ----
c.navigate('game', g.id, {manage:true}); c.navigate('tactics', g.id); c.navigate('game', app.selectedGameId);
check('back from tactics keeps Edit mode', app.manageMode===true && app.page==='game');
// ---- 8. Final ----
tryRun('toggleGameFinal', ()=>c.toggleGameFinal()); check('marked Final', c.gameDisplayStatus(g)==='Final');
tryRun('toggleGameFinal back', ()=>c.toggleGameFinal()); check('un-final returns to In progress', c.gameDisplayStatus(g)==='In progress');
c.toggleGameFinal();

// ---- 9. stats views ----
const p8=p(8);
const log=tryRun('buildPlayerEventLog', ()=>c.buildPlayerEventLog(p8))||[];
const mine=log.filter(r=>JSON.stringify(r).includes(g.id) || r.gameId===g.id);
check('#8 event log has this game\'s events', log.length>0, 'rows '+log.length);
const ss=tryRun('buildPlayerSeasonStats', ()=>c.buildPlayerSeasonStats(p8));
check('#8 season stats built', !!ss);
app.selectedPlayerId=p8.id; tryRun('renderPlayer', ()=>c.renderPlayer());
tryRun('renderGameStats', ()=>c.renderGameStats(g)); tryRun('renderOpponentStats', ()=>c.renderOpponentStats(g));
const box=D('gameStatsTable')?D('gameStatsTable').innerHTML:''; 
for(const f of ['renderHome','renderTeams','renderGames','renderCoaches','renderDataPage','renderAll']) tryRun(f, ()=>c[f]());

// ---- 10. tactics ----
app.currentQ=4;
tryRun('renderTactics', ()=>c.renderTactics());
check('tactics tokens placed (7 ours)', (g.tacticalTokens||[]).filter(t=>t.side==='our').length===7, String((g.tacticalTokens||[]).filter(t=>t.side==='our').length));
let sit=tryRun('buildTacticsSituation', ()=>c.buildTacticsSituation(g));
check('situation: even, Q4, score read', sit && sit.manstate==='even' && sit.quarter===4, sit&&JSON.stringify({m:sit.manstate,q:sit.quarter,us:sit.scoreUs,them:sit.scoreOpp}));
const oppTok=g.tacticalTokens.find(t=>t.side==='opp');
if(oppTok){ oppTok.excluded=true; sit=c.buildTacticsSituation(g); check('excluding an opponent -> man-up', sit.manstate==='man-up'); }
else check('opponent roster auto-populated for tactics', false, 'no opp tokens');
const rec=tryRun('tacticsRuleEngine', ()=>c.tacticsRuleEngine(sit,g));
check('recommendation returns play + confidence', rec && rec.play && rec.play.name && ['High','Medium','Low','None'].includes(rec.confidence), rec&&JSON.stringify({play:rec.play&&rec.play.name,conf:rec.confidence,n:rec.reasons.length}));
// the button path
tryRun('getRecommendation', ()=>c.getRecommendation());
check('recommendation rendered in panel', /rec-play/.test(D('tacticsRecArea').innerHTML));
check('"Log it" button shown after rec', D('tacticsLogBtn').style.display==='inline-block');
// outcome loop: log 4 good outcomes for this play/man-state
const playName=c._lastTacticsRec? c._lastTacticsRec.play.name : rec.play.name;
for(let i=0;i<4;i++){ tryRun('logTacticalOutcome', ()=>c.logTacticalOutcome('good','Goal')); }
c.logTacticalOutcome('bad','Turnover');
const tr=c.playTrackRecord(g.teamId, playName, 'man-up');
check('track record counts outcomes (4 good, 1 bad)', tr.good===4&&tr.bad===1, JSON.stringify(tr));
check('outcomes panel renders', /good/.test(D('tacticsOutcomesPanel').innerHTML));
const rec2=c.tacticsRuleEngine(c.buildTacticsSituation(g),g);
check('engine uses logged record next time', rec2.record && rec2.record.n>=5, JSON.stringify(rec2.record||null));
tryRun('renderTacticsHistory', ()=>c.renderTacticsHistory(g));
oppTok && (oppTok.excluded=false);
// man-down
const ourTok=g.tacticalTokens.find(t=>t.side==='our'&&t.refId!==g.tacticalTokens[0].refId); ourTok.excluded=true;
sit=c.buildTacticsSituation(g); const rec3=c.tacticsRuleEngine(sit,g);
check('man-down situation gets a man-down play', sit.manstate==='man-down' && rec3.play, rec3.play&&rec3.play.name);
ourTok.excluded=false;

console.log(`\n${pass} passed, ${fail} failed`); if(fails.length) console.log('FAILURES:\n - '+fails.join('\n - '));
