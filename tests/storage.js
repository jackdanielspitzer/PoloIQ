// Saved/synced state stays small: imported-result filler events are packed, and come back identical.
const vm=require('vm'); const {c,app}=require('./setup.js');
let pass=0,fail=0; const check=(n,ok,i='')=>{ ok?pass++:fail++; console.log((ok?'PASS ':'FAIL ')+n+(ok?'':'  ['+i+']')); };
const before=JSON.stringify(app.games);
const full=Buffer.byteLength(JSON.stringify(app)), packed=Buffer.byteLength(c.serializeAppState());
console.log(`saved state: ${(full/1024).toFixed(0)} KB -> ${(packed/1024).toFixed(0)} KB`);
check('saved state under 3.5 MB (browser cache ~5 MB)', packed < 3.5*1024*1024, (packed/1024).toFixed(0)+' KB');
check('serializing does not change live games', JSON.stringify(app.games)===before);
const back=JSON.parse(c.serializeAppState()); c.unpackGames(back.games);
check('round trip: every game identical after save + load', JSON.stringify(back.games)===before);
// sync payload (what gets uploaded) is packed too, and a pull of it unpacks identically
const keys=vm.runInContext('SHARED_KEYS',c); const payload={}; keys.forEach(k=>payload[k]=app[k]); payload.games=app.games.map(c.packGame);
const chunks=Math.ceil(JSON.stringify(payload).length/vm.runInContext('SHARED_STATE_CHUNK_SIZE',c));
console.log('upload chunks per sync:', chunks);
const pulled=JSON.parse(JSON.stringify(payload)); c.unpackGames(pulled.games);
check('pulled games identical to originals', JSON.stringify(pulled.games)===before);
// scores of imported games survive
const sample=back.games.filter(g=>g.quarters[1].some(e=>e.raw_phrase==='(imported result)')).slice(0,50);
check('imported game scores unchanged', sample.every(g=>{ const o=app.games.find(x=>x.id===g.id); return JSON.stringify(c.computeGameScore(o))===JSON.stringify(c.computeGameScore(g)); }));
// a live-tracked game is never packed
const live=c.blankGame(app.games[0].teamId); live.quarters[1].push({stat_type:'goal',side:'team',playerCap:8,raw_phrase:'dark 8 goal'});
check('live-tracked game kept as-is', c.packGame(live)===live);
// mixed: imported events + a real one -> kept as-is
const mixed=JSON.parse(JSON.stringify(app.games.find(g=>c.isPackableImportedGame(g)))); mixed.quarters[2].push({stat_type:'note',side:'team',note:'x',raw_phrase:'dark 3 x'});
check('imported game with a real event added is kept as-is', c.packGame(mixed)===mixed);
// a packed game that later gets real events (newer client) unpacks safely
const pg=c.packGame(app.games.find(g=>c.isPackableImportedGame(g))); check('packed form has no events', Object.values(pg.quarters).flat().length===0 && Array.isArray(pg.importedScore));
// loadState from a packed localStorage snapshot
const snap=c.serializeAppState(); c.localStorage.getItem=k=>k==='poloai-app-state'?snap:null; app.games=[]; c.loadState();
check('loadState restores full games from packed cache', JSON.stringify(app.games.filter(g=>before.includes(g.id)).length)>0 && c.getGameEvents(app.games.find(g=>g.quarters&&g.quarters[1]&&g.quarters[1].some(e=>e.raw_phrase==='(imported result)'))||{quarters:{}}).length>0);
console.log(`\n${pass} passed, ${fail} failed`);
