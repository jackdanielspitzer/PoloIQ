const fs = require('fs');
const vm = require('vm');
const src = fs.readFileSync(require('path').join(__dirname,'..','..','index.html'), 'utf8');
const m = src.match(/<script>([\s\S]*)<\/script>/);
let code = m[1];
code += '\nglobalThis.__exports = { app, ensureSeedTeamsAndSchedule, ensureOpponentSchoolResults, ensureSchoolSeed2026Schedule, SEED_SCHOOL_PLAYER_STATS };';
const sandbox = {
  console, document: { addEventListener(){}, readyState:'complete', getElementById(){return null;}, querySelector(){return null;}, querySelectorAll(){return [];}, createElement(){return {style:{},classList:{add(){},remove(){}},setAttribute(){},appendChild(){},addEventListener(){}};}, body:{appendChild(){},classList:{add(){},remove(){}}} },
  window:{addEventListener(){},location:{href:''},localStorage:{getItem(){return null;},setItem(){},removeItem(){}},matchMedia(){return{matches:false,addEventListener(){}};},navigator:{serviceWorker:undefined}},
  localStorage:{getItem(){return null;},setItem(){},removeItem(){}}, navigator:{serviceWorker:undefined,onLine:true},
  fetch: async()=>({ok:false,json:async()=>({})}), setTimeout,clearTimeout,setInterval,clearInterval,
  requestAnimationFrame:(fn)=>setTimeout(fn,0), crypto:{randomUUID:()=>'x-'+Math.random().toString(36).slice(2)},
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(code, sandbox, {filename:'app.js'});
const {app, ensureSeedTeamsAndSchedule, ensureOpponentSchoolResults, ensureSchoolSeed2026Schedule, SEED_SCHOOL_PLAYER_STATS} = sandbox.__exports;
ensureSeedTeamsAndSchedule(); ensureOpponentSchoolResults(); ensureSchoolSeed2026Schedule();
let bad = 0;
for (const tname of Object.keys(SEED_SCHOOL_PLAYER_STATS)) {
  const team = app.teams.find(t => t.name === tname);
  if (!team) { console.log('NO TEAM for stats block:', tname); bad++; continue; }
  const names = new Set(team.players.map(p => p.name));
  const orphan = Object.keys(SEED_SCHOOL_PLAYER_STATS[tname]).filter(n => !names.has(n));
  const g = app.games.filter(x => x.teamId === team.id);
  const stale = g.filter(x => x.status === 'upcoming' && x.date < '2026-10-02').map(x => x.date + ' ' + x.opponent);
  const n26 = g.filter(x => (x.date || '').startsWith('2026'));
  console.log(tname.padEnd(18), 'roster', String(team.players.length).padStart(2), '| 2026 games', String(n26.length).padStart(2),
    '| stale-upcoming', stale.length, stale.length ? JSON.stringify(stale) : '', '| orphan stat names', orphan.length ? JSON.stringify(orphan) : 0);
  bad += orphan.length;
}
console.log('Total games', app.games.length, 'teams', app.teams.length, bad ? 'PROBLEMS: ' + bad : 'OK');
