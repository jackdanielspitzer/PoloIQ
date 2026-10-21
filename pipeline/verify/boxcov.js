// Coverage of published box scores as the app itself sees them (getGameBox), per team, plus sanity checks.
const fs = require('fs'); const vm = require('vm');
const src = fs.readFileSync(require('path').join(__dirname,'..','..','index.html'), 'utf8');
let code = src.match(/<script>([\s\S]*)<\/script>/)[1];
code += '\nglobalThis.__x = { app, ensureSeedTeamsAndSchedule, reconcileSeedRosters, ensurePastSeasonResults, ensureOpponentSchoolResults, ensureSchoolSeed2026Schedule, getGameBox, computeGameScore, gameHasLiveEvents, gameTypeInfo, meetingHistory, playerGameLines, bigGameForm, SEED_BOXSCORES };';
const nop=()=>{};
const sb = { console, document:{addEventListener:nop,readyState:'complete',getElementById(){return null},querySelector(){return null},querySelectorAll(){return []},createElement(){return {style:{},classList:{add:nop,remove:nop},setAttribute:nop,appendChild:nop,addEventListener:nop}},body:{appendChild:nop,classList:{add:nop,remove:nop}}},
  window:{addEventListener:nop,location:{href:''},localStorage:{getItem(){return null},setItem:nop,removeItem:nop},matchMedia(){return{matches:false,addEventListener:nop}},navigator:{serviceWorker:undefined}},
  localStorage:{getItem(){return null},setItem:nop,removeItem:nop}, navigator:{serviceWorker:undefined,onLine:true}, fetch:async()=>({ok:false,json:async()=>({})}),
  setTimeout:()=>0,clearTimeout,setInterval:()=>0,clearInterval,requestAnimationFrame:()=>0,crypto:{randomUUID:()=>'x'} };
sb.globalThis = sb; vm.createContext(sb); vm.runInContext(code, sb, {filename:'app.js'});
const X = sb.__x, {app} = X;
X.ensureSeedTeamsAndSchedule(); X.reconcileSeedRosters(); X.ensurePastSeasonResults(); X.ensureOpponentSchoolResults(); X.ensureSchoolSeed2026Schedule();
const names = ['Navy','Fordham','Iona',"Mount St. Mary's",'Bucknell','Johns Hopkins','George Washington','Princeton','Harvard','Brown','MIT','California','Stanford','UCLA','USC','Pacific','UC Davis','Pepperdine',"Saint Mary's"];
let bad = 0;
console.log('team'.padEnd(18), 'finals', 'box', 'goalsMatch', 'type counts');
for (const n of names) {
  const t = app.teams.find(x=>x.name===n); const gs = app.games.filter(g=>g.teamId===t.id && g.status==='final');
  let hit=0, match=0; const types={};
  gs.forEach(g=>{ const b = X.getGameBox(g); const ty = X.gameTypeInfo(g).key; types[ty]=(types[ty]||0)+1;
    if(b){ hit++; const sc = X.computeGameScore(g); const gu = b.u.reduce((s,l)=>s+l[2],0); if(gu===sc.team) match++; else if(!b.p) { bad++; } } });
  console.log(n.padEnd(18), String(gs.length).padEnd(6), String(hit).padEnd(3), String(match).padEnd(10), JSON.stringify(types));
}
console.log('unexpected goal mismatches without partial flag:', bad);
process.exit(0);
