// Practice mode: works like a live game, but never syncs, never counts, never feeds tactics learning.
const {makeDocument}=require('./dom.js'); const {c,app,cal}=require('./setup.js'); c.document=makeDocument(); const D=id=>c.document.getElementById(id);
let pass=0,fail=0; const check=(n,ok,i='')=>{ ok?pass++:fail++; console.log((ok?'PASS ':'FAIL ')+n+(ok?'':'  ['+i+']')); };
// a viewer account (player role) should still be able to practice
const v=c.blankUser(); v.id='uv'; v.role='player'; v.teamId=cal.id; app.users.push(v); app.currentUserId=v.id;
const realGames=app.games.length; const realSnap=JSON.stringify(app.games);
const p8=c.getActiveGameRoster({teamId:cal.id}).find(p=>String(p.cap)==='8');
const season8=c.seasonStat(p8.id,'goal');
c.showPracticeForm(); D('practiceTeamSelect').value=cal.id; D('practiceOpponentInput').value='USC';
c.startPracticeGame();
const g=app.practiceGames[app.practiceGames.length-1];
check('practice game created + opened in edit mode', g && g.practice && app.selectedGameId===g.id && app.page==='game' && app.manageMode===true);
check('not added to real games list', app.games.length===realGames);
check('findGame finds practice game', c.findGame(g.id)===g);
check('player-role account can log practice', c.hasManagePermission(g));
c.setGameColor('Dark'); c.setStatFor(null);
for(const t of ['dark 8 goal assisted by dark 3','light 4 goal','dark 8 goal on the six on five','dark 1 save','blah blah something weird','dark 5 excluded']) c.handleParsedPhrase(t);
app.currentQ=2; c.handleParsedPhrase('dark 8 goal'); c.handleParsedPhrase('purple monkey dishwasher');
const s=c.computeGameScore(g); check('scoring works (3-1)', s.team===3&&s.opponent===1, JSON.stringify(s));
c.renderGame(); const b=D('gamePracticeBanner').innerHTML;
check('practice banner shown', /PRACTICE GAME/.test(b));
check('report lists unrecognized phrases', /2 phrases not recognized/.test(b) && /purple monkey dishwasher/.test(b), b.slice(0,300));
check('report recognition rate', /Recognized: <b>\d+%/.test(b));
check('#8 season goals unchanged by practice', c.seasonStat(p8.id,'goal')===season8);
check('#8 event log excludes practice', !c.buildPlayerEventLog(p8).some(r=>JSON.stringify(r).includes('practice-')));
// shared sync payload excludes practice
const payload={}; c.SHARED_KEYS ? c.SHARED_KEYS.forEach(k=>payload[k]=app[k]) : null;
const vm=require('vm'); const keys=vm.runInContext('SHARED_KEYS',c); keys.forEach(k=>payload[k]=app[k]);
check('shared sync payload has no practice game', !JSON.stringify(payload).includes(g.id));
check('real games untouched', JSON.stringify(app.games)===realSnap);
// tactics in practice: rec works, outcome logged but not learned
app.currentQ=4; c.navigate('tactics', g.id); c.renderTactics(); c.getRecommendation();
check('tactics recommendation works in practice', /rec-play/.test(D('tacticsRecArea').innerHTML));
const play=c._lastTacticsRec.play.name, ms=c._lastTacticsSituation.manstate; const before=c.playTrackRecord(cal.id,play,ms).n;
c.logTacticalOutcome('good','Goal');
check('practice outcome not used for learning', c.playTrackRecord(cal.id,play,ms).n===before);
// undo, final, list, delete
app.page='game'; app.currentQ=2; c.undoEvent(); check('undo works in practice', c.computeGameScore(g).team===3); // last was unmatched phrase
c.toggleGameFinal(); check('mark final works', c.gameDisplayStatus(g)==='Final');
c.navigate('games'); check('practice list shows game', /vs USC/.test(D('practiceGameList').innerHTML));
c.confirm=()=>true; c.deletePracticeGame(g.id); check('delete removes practice game', !app.practiceGames.some(x=>x.id===g.id) && app.games.length===realGames);
console.log(`\n${pass} passed, ${fail} failed`);
