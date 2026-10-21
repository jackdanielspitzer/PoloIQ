// Situational-form check: coverage of the index per team and sample findings for a few contexts.
const fs = require('fs'); const vm = require('vm');
const src = fs.readFileSync(require('path').join(__dirname,'..','..','index.html'), 'utf8');
let code = src.match(/<script>([\s\S]*)<\/script>/)[1];
code += '\nglobalThis.__x = { app, ensureSeedTeamsAndSchedule, reconcileSeedRosters, ensurePastSeasonResults, ensureOpponentSchoolResults, ensureSchoolSeed2026Schedule, buildSituationIndex, sitFindingsFor, sitFindingText, sitFindingKind, sitDims, sitContextLabel };';
const nop=()=>{};
const sb = { console, document:{addEventListener:nop,readyState:'complete',getElementById(){return null},querySelector(){return null},querySelectorAll(){return []},createElement(){return {style:{},classList:{add:nop,remove:nop},setAttribute:nop,appendChild:nop,addEventListener:nop}},body:{appendChild:nop,classList:{add:nop,remove:nop}}},
  window:{addEventListener:nop,location:{href:''},localStorage:{getItem(){return null},setItem:nop,removeItem:nop},matchMedia(){return{matches:false,addEventListener:nop}},navigator:{serviceWorker:undefined}},
  localStorage:{getItem(){return null},setItem:nop,removeItem:nop}, navigator:{serviceWorker:undefined,onLine:true}, fetch:async()=>({ok:false,json:async()=>({})}),
  setTimeout:()=>0,clearTimeout,setInterval:()=>0,clearInterval,requestAnimationFrame:()=>0,crypto:{randomUUID:()=>'x'} };
sb.globalThis = sb; vm.createContext(sb); vm.runInContext(code, sb, {filename:'app.js'});
const X = sb.__x; const {app} = X;
X.ensureSeedTeamsAndSchedule(); X.reconcileSeedRosters(); X.ensurePastSeasonResults(); X.ensureOpponentSchoolResults(); X.ensureSchoolSeed2026Schedule();
const ctxs = [
  ['Q3 · last third · trailing 1-2', X.sitDims('Q3','late','trailingClose',null,null)],
  ['Q4 · tied', X.sitDims('Q4',null,'tied',null,null)],
  ['man-up', X.sitDims('Q2','mid','tied','man-up',null)],
];
const names = process.argv.slice(2).length ? process.argv.slice(2) : ['California','UCLA','USC','Stanford','UC Davis','Pepperdine','Navy','Harvard'];
for (const n of names) {
  const t = app.teams.find(x=>x.name===n); if(!t) continue;
  const idx = X.buildSituationIndex(t.id);
  const players = Object.keys(idx.player).length;
  console.log(`\n== ${n}: ${idx.events} real events, ${idx.games} games, ${players} players with events, team goals ${idx.teamStat.goal?idx.teamStat.goal.total:0}`);
  const roster = t.roster||t.players||[];
  for (const [label, dims] of ctxs) {
    const found = [];
    roster.forEach(p=>{ X.sitFindingsFor(idx, p.id, dims).slice(0,1).forEach(f=>found.push(`   ${p.name} [${X.sitFindingKind(f)}, p=${f.p.toFixed(3)}] ${X.sitFindingText(f)}`)); });
    console.log(` ${label}: ${found.length} flagged`); found.slice(0,4).forEach(l=>console.log(l));
  }
}
process.exit(0);
