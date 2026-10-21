// Dump every seeded final game per tracked team (date, opponent, score) so crawlers can match box scores to them.
const fs = require('fs'); const vm = require('vm');
const src = fs.readFileSync(require('path').join(__dirname,'..','..','index.html'), 'utf8');
let code = src.match(/<script>([\s\S]*)<\/script>/)[1];
code += '\nglobalThis.__x = { app, ensureSeedTeamsAndSchedule, reconcileSeedRosters, ensurePastSeasonResults, ensureOpponentSchoolResults, ensureSchoolSeed2026Schedule, computeGameScore, getGameEvents, isPlaceholderSeedEvent };';
const nop=()=>{};
const sb = { console, document:{addEventListener:nop,readyState:'complete',getElementById(){return null},querySelector(){return null},querySelectorAll(){return []},createElement(){return {style:{},classList:{add:nop,remove:nop},setAttribute:nop,appendChild:nop,addEventListener:nop}},body:{appendChild:nop,classList:{add:nop,remove:nop}}},
  window:{addEventListener:nop,location:{href:''},localStorage:{getItem(){return null},setItem:nop,removeItem:nop},matchMedia(){return{matches:false,addEventListener:nop}},navigator:{serviceWorker:undefined}},
  localStorage:{getItem(){return null},setItem:nop,removeItem:nop}, navigator:{serviceWorker:undefined,onLine:true}, fetch:async()=>({ok:false,json:async()=>({})}),
  setTimeout:()=>0,clearTimeout,setInterval:()=>0,clearInterval,requestAnimationFrame:()=>0,crypto:{randomUUID:()=>'x'} };
sb.globalThis = sb; vm.createContext(sb); vm.runInContext(code, sb, {filename:'app.js'});
const X = sb.__x, {app} = X;
X.ensureSeedTeamsAndSchedule(); X.reconcileSeedRosters(); X.ensurePastSeasonResults(); X.ensureOpponentSchoolResults(); X.ensureSchoolSeed2026Schedule();
const names = ['Navy','Fordham','Iona',"Mount St. Mary's",'Bucknell','Johns Hopkins','George Washington','Princeton','Harvard','Brown','MIT','California','Stanford','UCLA','USC','Pacific','UC Davis','Pepperdine',"Saint Mary's"];
const out = {};
for (const n of names) {
  const t = app.teams.find(x=>x.name===n); if(!t) continue;
  out[n] = app.games.filter(g=>g.teamId===t.id && g.status==='final').map(g=>{ const s = X.computeGameScore(g); const ev = X.getGameEvents(g);
    return {date:g.date, opponent:g.opponent, ts:s.team, os:s.opponent, gn:g.gameNumber||null, pbp: ev.some(e=>!X.isPlaceholderSeedEvent(e) && e.stat_type)}; }).sort((a,b)=>a.date.localeCompare(b.date));
}
fs.writeFileSync(require('path').join(__dirname,'..','boxdata','app_games.json'), JSON.stringify(out));
// every name each tracked school has on file (roster + stat rows), so 6-8 matching can check which cap colour each school really wore
const rosters = {};
const stats = vm.runInContext('typeof SEED_SCHOOL_PLAYER_STATS!=="undefined" ? SEED_SCHOOL_PLAYER_STATS : {}', sb);
for (const n of names) { const t = app.teams.find(x=>x.name===n); rosters[n] = Array.from(new Set([...(t ? t.players.map(p=>p.name) : []), ...Object.keys(stats[n]||{})])).filter(Boolean); }
fs.writeFileSync(require('path').join(__dirname,'..','boxdata','team_names.json'), JSON.stringify(rosters));
for (const [k,v] of Object.entries(out)) console.log(k.padEnd(18), v.length, 'finals,', v.filter(g=>g.pbp).length, 'with real events');
process.exit(0);
