// Prints box-score availability per team: players with box rates, with per-game rates (gp known), and goalie saves/game.
const fs = require('fs'); const vm = require('vm');
const src = fs.readFileSync(require('path').join(__dirname,'..','..','index.html'), 'utf8');
let code = src.match(/<script>([\s\S]*)<\/script>/)[1];
code += '\nglobalThis.__x = { app, ensureSeedTeamsAndSchedule, reconcileSeedRosters, ensurePastSeasonResults, ensureOpponentSchoolResults, ensureSchoolSeed2026Schedule, boxRatesFor, teamCloseRecord, countScoreOnlyGames };';
const nop=()=>{};
const sb = { console, document:{addEventListener:nop,readyState:'complete',getElementById(){return null},querySelector(){return null},querySelectorAll(){return []},createElement(){return {style:{},classList:{add:nop,remove:nop},setAttribute:nop,appendChild:nop,addEventListener:nop}},body:{appendChild:nop,classList:{add:nop,remove:nop}}},
  window:{addEventListener:nop,location:{href:''},localStorage:{getItem(){return null},setItem:nop,removeItem:nop},matchMedia(){return{matches:false,addEventListener:nop}},navigator:{serviceWorker:undefined}},
  localStorage:{getItem(){return null},setItem:nop,removeItem:nop}, navigator:{serviceWorker:undefined,onLine:true}, fetch:async()=>({ok:false,json:async()=>({})}),
  setTimeout:()=>0,clearTimeout,setInterval:()=>0,clearInterval,requestAnimationFrame:()=>0,crypto:{randomUUID:()=>'x'} };
sb.globalThis = sb; vm.createContext(sb); vm.runInContext(code, sb, {filename:'app.js'});
const X = sb.__x, {app} = X;
X.ensureSeedTeamsAndSchedule(); X.reconcileSeedRosters(); X.ensurePastSeasonResults(); X.ensureOpponentSchoolResults(); X.ensureSchoolSeed2026Schedule();
console.log('team'.padEnd(18),'roster','box','rates(gp>=4)','scoreOnly','close W-L');
for (const t of app.teams) {
  const r = (t.roster||t.players||[]).filter(p=>p.active!==false); if(!r.length) continue;
  const boxes = r.map(p=>X.boxRatesFor(p)).filter(Boolean);
  const cr = X.teamCloseRecord(t.id, null);
  console.log(t.name.padEnd(18), String(r.length).padEnd(6), String(boxes.length).padEnd(3), String(boxes.filter(b=>b.gp>=4).length).padEnd(12), String(X.countScoreOnlyGames(t.id)).padEnd(9), cr.w+'-'+cr.l);
}
process.exit(0);
