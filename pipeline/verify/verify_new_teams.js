const fs = require('fs');
const path = require('path');
const vm = require('vm');

const src = fs.readFileSync(require('path').join(__dirname,'..','..','index.html'), 'utf8');
const m = src.match(/<script>([\s\S]*)<\/script>/);
let code = m[1];
code += '\nglobalThis.__exports = { app, ensureSeedTeamsAndSchedule, ensureOpponentSchoolResults, computeGameScore, CURRENT_ROSTERS, SEED_SCHOOL_RESULTS };';

const sandbox = {
  console,
  document: {
    addEventListener(){}, readyState: 'complete',
    getElementById(){ return null; }, querySelector(){ return null; }, querySelectorAll(){ return []; },
    createElement(){ return { style:{}, classList:{add(){},remove(){}}, setAttribute(){}, appendChild(){}, addEventListener(){} }; },
    body: { appendChild(){}, classList:{add(){},remove(){}} },
  },
  window: { addEventListener(){}, location:{href:''}, localStorage:{getItem(){return null;},setItem(){},removeItem(){}}, matchMedia(){return {matches:false, addEventListener(){}};}, navigator:{serviceWorker:undefined} },
  localStorage: { getItem(){return null;}, setItem(){}, removeItem(){} },
  navigator: { serviceWorker: undefined, onLine: true },
  fetch: async () => ({ ok:false, json: async()=>({}) }),
  setTimeout, clearTimeout, setInterval, clearInterval,
  requestAnimationFrame: (fn)=>setTimeout(fn,0),
  crypto: { randomUUID: () => 'xxxx-xxxx-xxxx-xxxx-'+Math.random().toString(36).slice(2) },
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
try {
  vm.runInContext(code, sandbox, { filename: 'app.js' });
} catch(e) {
  console.error('RUNTIME ERROR during load:', e.message);
  process.exit(1);
}

const { app, ensureSeedTeamsAndSchedule, ensureOpponentSchoolResults, computeGameScore, CURRENT_ROSTERS, SEED_SCHOOL_RESULTS } = sandbox.__exports;

ensureSeedTeamsAndSchedule();
ensureOpponentSchoolResults();
const count1 = app.games.length;
ensureSeedTeamsAndSchedule();
ensureOpponentSchoolResults();
const count2 = app.games.length;
console.log('Idempotency:', count1, '->', count2, count1===count2 ? 'OK' : 'FAIL');

const newTeams = ['Navy','Fordham','Iona','Marist',"Mount St. Mary's",'Bucknell','Johns Hopkins','George Washington','Princeton','Harvard','Brown','MIT'];
for (const name of newTeams) {
  const team = app.teams.find(t=>t.name.toLowerCase()===name.toLowerCase());
  if (!team) { console.log(name, '-> NO TEAM CREATED'); continue; }
  const games = app.games.filter(g=>g.teamId===team.id);
  console.log(name, '-> team created,', games.length, 'games');
  for (const g of games) {
    const seedEntry = (SEED_SCHOOL_RESULTS[name]||[]).find(s=>s.date===g.date && s.opponent===g.opponent);
    if (seedEntry) {
      const score = computeGameScore(g);
      const ok = score.team === seedEntry.teamScore && score.opponent === seedEntry.oppScore;
      if (!ok) console.log('  MISMATCH', g.date, g.opponent, 'expected', seedEntry.teamScore+'-'+seedEntry.oppScore, 'got', score.team+'-'+score.opponent);
    }
  }
}
console.log('Total games in app:', app.games.length);
console.log('Total teams in app:', app.teams.length);
