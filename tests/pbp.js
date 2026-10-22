// 6-8 Sports play-by-play in the app, offline: a game with a 6-8 file shows every play with the clock,
// running score and who it was against, beats the school's box score, and feeds special teams.
const vm=require('vm');
const {makeDocument}=require('./dom.js');
const {c,app,g,cal}=require('./setup.js');
c.document=makeDocument();
const D=id=>c.document.getElementById(id);
const run=s=>vm.runInContext(s,c);
let pass=0, fail=0;
const check=(name,cond,info='')=>{ cond?pass++:fail++; console.log((cond?'PASS ':'FAIL ')+name+(cond||!info?'':'   ['+info+']')); };

// a finished Cal game with no events of its own
const game=c.blankGame(cal.id); game.opponent='Testville'; game.date='2026-09-01'; game.status='final'; game.quarters={1:[],2:[],3:[],4:[]};
app.games.push(game); app.selectedGameId=game.id; app.currentQ=1; app.page='game';
const pb={ id:'test-pbp-1', teams:['California','Testville'], score:[2,1], src:'6-8',
  r:{ d:[['7','Ann Shooter',0],['4','Bo Passer',0],['1','Cal Keeper',1]], l:[['10','Tom Fouler',0],['1','Opp Keeper',1],['9','Sam Scorer',0]] },
  ev:[
    [1,470,0,'l','SP','9','4',''],
    [1,455,0,'d','XD','4','10',''],
    [1,455,0,'l','X','10','4',''],
    [1,446,0,'d','G','7','1','mi','10'],
    [1,446,1,'d','A','4','7',''],
    [1,400,1,'l','M','9','1','b'],
    [1,399,1,'d','B','1','9',''],
    [1,350,1,'d','ST','4','9',''],
    [1,350,1,'l','TO','9','4',''],
    [1,300,0,'l','G','9','1','cg'],
    [2,200,0,'d','G','7','1','p'],
  ]};
// the school's box score (one goal off) and the 6-8 entry for the same game
run(`SEED_BOXSCORES['California|2026-09-01|2-1']={o:'Testville',q:[[1,1],[1,0]],u:[],v:[],gu:[],gv:[],tl:[],pn:[],s:'https://calbears.com/x',k:'sidearm'};
     SEED_BOXSCORES['California|2026-09-01|2-1#2']={o:'Testville',q:[[1,1],[1,0]],u:[],v:[],gu:[],gv:[],tl:[],pn:[],s:'',k:'6-8',pb:'test-pbp-1',pc:'d'};
     _boxIdx=null; _pbpCache['test-pbp-1']=${JSON.stringify(pb)};`);
check('6-8 entry chosen over the school box score', c.getGameBox(game).k==='6-8');
c.renderGame();
const feed=D('gameFeed').innerHTML;
check('feed shows the full play-by-play', /Sprint won/.test(feed) && /Save/.test(feed) && /Steal/.test(feed), feed.slice(0,300));
check('a saved shot shows once, not as a miss and a save', (feed.match(/Save —/g)||[]).length===1 && !/Shot missed/.test(feed));
check('man-up goal names the exclusion behind it, the assist and the goalie', /Goal — #7 Ann Shooter \(6v5 after #10 Tom Fouler’s exclusion\*, assist #4 Bo Passer\) on #1 Opp Keeper · 1-0/.test(feed.replace(/&#39;/g,"'")), feed.match(/Goal[^<]*/)&&feed.match(/Goal[^<]*/)[0]);
check('assist folded into its goal, not repeated', !/Assist —/.test(feed));
check('exclusion shown once with who drew it', (feed.match(/Exclusion/g)||[]).length===1 && /Exclusion — #10 Tom Fouler \(drawn by #4 Bo Passer\)/.test(feed));
check('goalie block shown as a save on the shooter', /Save — #1 Cal Keeper on #9 Sam Scorer’s shot/.test(feed));
check('steal names who lost it, matching turnover not repeated', /Steal — #4 Bo Passer from #9 Sam Scorer/.test(feed) && !/Turnover/.test(feed));
check('opponent goal: counter, inferred goalie marked, running score', /Goal — #9 Sam Scorer \(counter\) on #1 Cal Keeper\* · 1-1/.test(feed), feed.match(/Goal — #9[^<]*/)&&feed.match(/Goal — #9[^<]*/)[0]);
check('estimated clock marked with ~', /~6:40/.test(feed) && />7:26</.test(feed));
app.currentQ=2; c.renderGame();
check('period 2 shows its penalty goal and the score so far', /Goal — #7 Ann Shooter \(penalty shot\)[^<]*· 2-1/.test(D('gameFeed').innerHTML), D('gameFeed').innerHTML.slice(0,200));
app.currentQ=1;
// special teams from the play-by-play
const S=c.computeSituations([c.pbpToGame(c.getGameBox(game), pb)]);
check('special teams from 6-8: 1 of 1 man-up, 1 penalty goal', S.up.goals===1 && S.up.chances===1 && S.pen.oursGoals===1, JSON.stringify(S));
c.renderGameInsights(game);
check('special teams panel shows for a 6-8 game', D('gameInsightsPanel').style.display!=='none' && /Man-up/.test(D('gameSituationsBody').innerHTML));
check('shot chart hidden for 6-8 (no shot locations there)', D('gameShotBody').style.display==='none');
// from the other team's side the same file flips
run(`SEED_BOXSCORES['California|2026-09-01|2-1#2'].pc='l'; _boxIdx=null;`);
c.renderGame();
check('same file read from the other side', /Goal — #9 Sam Scorer[^<]*· 1-1/.test(D('gameFeed').innerHTML) && /· 0-1/.test(D('gameFeed').innerHTML));
run(`SEED_BOXSCORES['California|2026-09-01|2-1#2'].pc='d'; _boxIdx=null;`);
// names can't inject markup
const evil=JSON.parse(JSON.stringify(pb)); evil.r.d[0][1]='<img src=x onerror=alert(1)>';
run(`_pbpCache['test-pbp-1']=cleanDeep(${JSON.stringify(evil)});`);
c.renderGame();
check('names from the file are escaped', !/<img/.test(D('gameFeed').innerHTML));
// printable report: box score + every play with clock, score and matchups
run(`_pbpCache['test-pbp-1']=${JSON.stringify(pb)};`);
const doc=c.gameDocHtml(game, pb);
check('PDF report has the play-by-play table with clock and score columns', /<th>Clock<\/th><th>Score<\/th>/.test(doc) && /Goal — #7 Ann Shooter/.test(doc) && />7:26</.test(doc));
check('PDF report shows the score after every play', /<td>1-0<\/td><td[^>]*>California/.test(doc) && /<td>1-1<\/td>/.test(doc));
check('PDF report has matchups and the 6-8 note', /drawn by #4 Bo Passer/.test(doc) && /6-8 Sports live scoring/.test(doc));
check('PDF report has special teams', /Special teams/.test(doc) && /Man-up 1 of 1/.test(doc));
const rowsAll=c.pbpPlayRows(game, c.getGameBox(game), pb, null);
check('whole-game rows cover every period', rowsAll.some(r=>r.period==='Q2') && rowsAll.some(r=>r.period==='Q1'));
const noData=Object.assign(c.blankGame(cal.id),{opponent:'Nobody U', date:'2026-09-02', status:'final'});
check('a game with nothing published says so', /final score only/.test(c.gameDocHtml(noData, null)));
// whole game in one list from the viewer
c.renderGame();
check('viewer offers a Whole game tab', D('gameQuarterTabs').children.some(b=>b.textContent==='Whole game'));
run('_pbpWholeGame=true'); c.renderGame();
const wf=D('gameFeed').innerHTML;
check('whole game lists every quarter in order with headers', /pbp-period">Q1</.test(wf) && /pbp-period">Q2</.test(wf) && wf.indexOf('pbp-period">Q1')<wf.indexOf('pbp-period">Q2') && /penalty shot/.test(wf) && /Sprint won/.test(wf));
run('_pbpWholeGame=false');
// a game typed into 6-8 after it ended: no clock, no running score, a clear note, no timeline guesses
const post=JSON.parse(JSON.stringify(pb)); post.mode='postgame'; post.ev.forEach(r=>{ r[0]=0; r[1]=null; });
run(`_pbpCache['test-pbp-1']=${JSON.stringify(post)};`);
c.renderGame();
const pf=D('gameFeed').innerHTML;
check('typed-in-later game says so and lists every play', /typed into 6-8 Sports after the game/.test(pf) && /Goal — #7 Ann Shooter/.test(pf) && /Steal/.test(pf));
check('typed-in-later game shows no clock or running score', !/~?\d:\d\d</.test(pf) && !/· 1-0/.test(pf));
const pdoc=c.gameDocHtml(game, post);
check('its PDF lists every play as entered, without clock', /Every play \(as entered on 6-8 Sports\)/.test(pdoc) && !/<th>Clock<\/th><th>Score<\/th>/.test(pdoc));
run(`_pbpCache['test-pbp-1']=${JSON.stringify(pb)};`);
// a game tracked live in the app keeps its own log
game.quarters[1].push({stat_type:'goal', side:'team', playerCap:'7', wall_time_offset_ms:1000, raw_phrase:'dark 7 goal'});
c.renderGame();
check('a live-tracked game shows its own events, not 6-8', !/Sprint won/.test(D('gameFeed').innerHTML));
// missing file falls back quietly
run(`_pbpCache['test-pbp-1']='missing';`); game.quarters[1]=[]; c.renderGame();
check('missing play-by-play file falls back without errors', !/Loading/.test(D('gameFeed').innerHTML));

console.log(`\n${pass} passed, ${fail} failed`);
