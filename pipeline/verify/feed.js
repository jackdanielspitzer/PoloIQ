const fs = require('fs'); const vm = require('vm');
const src = fs.readFileSync(require('path').join(__dirname,'..','..','index.html'),'utf8');
let code = src.match(/<script>([\s\S]*)<\/script>/)[1] + '\nglobalThis.__e={app,ensureSeedTeamsAndSchedule,ensurePastSeasonResults,ensureOpponentSchoolResults,ensureSchoolSeed2026Schedule,stripFabricatedSeedVsCap,renderGameFeed,eventLabelInfo,buildPlayerEventLog};';
const els = {};
const mkEl = () => ({ className:'', _html:'', children:[], set innerHTML(v){ this._html=v; if(v==='') this.children=[]; }, get innerHTML(){ return this._html; }, appendChild(c){ this.children.push(c); }, querySelector(){ return { onclick:null }; }, classList:{add(){},remove(){}}, setAttribute(){}, addEventListener(){}, style:{} });
const sb={console,document:{addEventListener(){},readyState:'complete',getElementById(id){ return els[id] || (els[id]=mkEl()); },querySelector(){return null;},querySelectorAll(){return [];},createElement(){return mkEl();},body:{appendChild(){},classList:{add(){},remove(){}}}},window:{addEventListener(){},location:{href:''},localStorage:{getItem(){return null;},setItem(){},removeItem(){}},matchMedia(){return{matches:false,addEventListener(){}};},navigator:{serviceWorker:undefined}},localStorage:{getItem(){return null;},setItem(){},removeItem(){}},navigator:{serviceWorker:undefined,onLine:true},fetch:async()=>({ok:false,json:async()=>({})}),setTimeout:()=>0,clearTimeout,setInterval:()=>0,clearInterval,requestAnimationFrame:()=>0,crypto:{randomUUID:()=>'x'}};
sb.globalThis=sb; vm.createContext(sb); vm.runInContext(code,sb);
const {app,ensureSeedTeamsAndSchedule,ensurePastSeasonResults,ensureOpponentSchoolResults,ensureSchoolSeed2026Schedule,stripFabricatedSeedVsCap,renderGameFeed,eventLabelInfo,buildPlayerEventLog}=sb.__e;
ensureSeedTeamsAndSchedule();ensurePastSeasonResults();ensureOpponentSchoolResults();ensureSchoolSeed2026Schedule();stripFabricatedSeedVsCap();

// Cal 2026
const cal=app.teams.find(t=>t.name==='California');
const c26=app.games.filter(g=>g.teamId===cal.id&&g.date.startsWith('2026'));
console.log('Cal 2026 final:',c26.filter(g=>g.status==='final').length,'(expect 11)  upcoming-in-past:',c26.filter(g=>g.status==='upcoming'&&g.date<'2026-10-02').map(g=>g.date+' '+g.opponent));

// 1) placeholder-only game -> blank feed
const ucla=app.teams.find(t=>t.name==='UCLA');
const ph=app.games.find(g=>g.teamId===ucla.id&&g.date==='2026-09-04'&&g.opponent==='Pacific');
app.currentQ=1; renderGameFeed(ph);
console.log('placeholder game feed rows:',els.gameFeed.children.length,'html:',JSON.stringify(els.gameFeed.innerHTML),'| events actually stored:',ph.quarters[1].length);
// 2) real PBP game -> rows with names, no "vs #"
const real=app.games.find(g=>g.teamId===ucla.id&&Object.values(g.quarters).some(q=>q.some(e=>e.playerId)));
renderGameFeed(real);
const row=els.gameFeed.children[0]; console.log('real game rows:',els.gameFeed.children.length,'sample:',row && row.innerHTML.replace(/<[^>]+>/g,' | ').replace(/\s+/g,' ').slice(0,140));
console.log('any "vs #" left in saved events:',app.games.some(g=>Object.values(g.quarters).some(q=>q.some(e=>e.vsCap==='1'&&Array.isArray(e.scoreAfter)))));
// 3) stale saved state: events with fabricated vsCap get stripped, live event keeps its real vsCap
const g2=app.games.find(g=>g.teamId===ucla.id&&g.date==='2026-09-04');
g2.quarters[1][0].vsCap='1';
const live={stat_type:'goal',side:'team',playerId:'p1',playerCap:'5',vsCap:'7'}; g2.quarters[2].push(live);
stripFabricatedSeedVsCap();
console.log('stale vsCap stripped:',g2.quarters[1][0].vsCap===undefined,'| live vsCap kept:',live.vsCap==='7','| live label:',eventLabelInfo(live).text);
// 4) player log row for a real-PBP scorer has no goalie guess
process.exit(0);
