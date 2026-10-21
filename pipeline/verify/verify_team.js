// usage: node verify_team.js "Team Name" "Player A" "Player B" ...
const fs = require('fs');
const vm = require('vm');
const src = fs.readFileSync(require('path').join(__dirname,'..','..','index.html'), 'utf8');
const m = src.match(/<script>([\s\S]*)<\/script>/);
let code = m[1];
code += '\nglobalThis.__exports = { app, ensureSeedTeamsAndSchedule, ensureOpponentSchoolResults, ensureSchoolSeed2026Schedule, buildPlayerSeasonStats };';
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
const {app, ensureSeedTeamsAndSchedule, ensureOpponentSchoolResults, ensureSchoolSeed2026Schedule, buildPlayerSeasonStats} = sandbox.__exports;
ensureSeedTeamsAndSchedule(); ensureOpponentSchoolResults(); if (ensureSchoolSeed2026Schedule) ensureSchoolSeed2026Schedule();
const [tname, ...names] = process.argv.slice(2);
const team = app.teams.find(t => t.name === tname);
if (!team) { console.log('TEAM NOT FOUND', tname); process.exit(0); }
const tg = app.games.filter(g => g.teamId === team.id);
const g26 = tg.filter(g => (g.date||'').startsWith('2026'));
console.log(tname, 'roster', team.players.length, 'games', tg.length, '2026 games', g26.length,
  'upcoming', g26.filter(g=>g.status==='upcoming').length);
for (const name of names) {
  const p = team.players.find(x => x.name === name);
  if (!p) { console.log(' ', name, 'NOT FOUND'); continue; }
  const seasons = buildPlayerSeasonStats(p).seasons;
  console.log(' ', name, JSON.stringify(seasons.map(s => ({y:s.year, gp:s.gp, g:s.g, a:s.a, sh:s.sh, stl:s.stl, exd:s.exd, sv:s.sv}))));
}
console.log('Total games:', app.games.length, 'teams:', app.teams.length);
