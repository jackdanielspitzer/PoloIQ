// Prints per-team, per-year game counts and how many games carry real per-player goal events
// (vs. a plain final-score placeholder), plus which seasons have seeded player-stat rows.
const fs = require('fs');
const vm = require('vm');
const src = fs.readFileSync(require('path').join(__dirname,'..','..','index.html'), 'utf8');
const m = src.match(/<script>([\s\S]*)<\/script>/);
let code = m[1];
code += '\nglobalThis.__exports = { app, ensureSeedTeamsAndSchedule, reconcileSeedRosters, ensureOpponentSchoolResults, ensureSchoolSeed2026Schedule, SEED_SCHOOL_PLAYER_STATS, SEED_SCHOOL_RESULTS };';
const sandbox = {
  console, document: { addEventListener(){}, readyState:'complete', getElementById(){return null;}, querySelector(){return null;}, querySelectorAll(){return [];}, createElement(){return {style:{},classList:{add(){},remove(){}},setAttribute(){},appendChild(){},addEventListener(){}};}, body:{appendChild(){},classList:{add(){},remove(){}}} },
  window:{addEventListener(){},location:{href:''},localStorage:{getItem(){return null;},setItem(){},removeItem(){}},matchMedia(){return{matches:false,addEventListener(){}};},navigator:{serviceWorker:undefined}},
  localStorage:{getItem(){return null;},setItem(){},removeItem(){}}, navigator:{serviceWorker:undefined,onLine:true},
  fetch: async()=>({ok:false,json:async()=>({})}), setTimeout:()=>0,clearTimeout,setInterval:()=>0,clearInterval,
  requestAnimationFrame:()=>0, crypto:{randomUUID:()=>'x-'+Math.random().toString(36).slice(2)},
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(code, sandbox, {filename:'app.js'});
const {app, ensureSeedTeamsAndSchedule, reconcileSeedRosters, ensureOpponentSchoolResults, ensureSchoolSeed2026Schedule, SEED_SCHOOL_PLAYER_STATS} = sandbox.__exports;
ensureSeedTeamsAndSchedule(); reconcileSeedRosters(); ensureOpponentSchoolResults(); ensureSchoolSeed2026Schedule();
const names = ['Navy','Fordham','Iona',"Mount St. Mary's",'Bucknell','Johns Hopkins','George Washington','Princeton','Harvard','Brown','MIT','UCLA','USC','Stanford','Pacific','UC Davis','Pepperdine'];
console.log('team'.padEnd(18), '2024 g/real', '2025 g/real', '2026 final/real', ' stat-seasons');
for (const n of names) {
  const t = app.teams.find(x => x.name === n);
  const gs = app.games.filter(g => g.teamId === t.id);
  const row = {};
  for (const y of ['2024','2025','2026']) {
    const yg = gs.filter(g => (g.date||'').startsWith(y) && g.status !== 'upcoming');
    const real = yg.filter(g => Object.values(g.quarters||{}).some(q => (q||[]).some(e => e.playerId))).length;
    row[y] = yg.length + '/' + real;
  }
  const st = SEED_SCHOOL_PLAYER_STATS[n] || {};
  const cnt = {2024:0,2025:0,2026:0};
  Object.values(st).forEach(p => ['2024','2025','2026'].forEach(y => { if (p[y]) cnt[y]++; }));
  console.log(n.padEnd(18), row['2024'].padEnd(11), row['2025'].padEnd(11), row['2026'].padEnd(15), ' players w/ rows 24:'+cnt[2024]+' 25:'+cnt[2025]+' 26:'+cnt[2026]);
}
process.exit(0);
