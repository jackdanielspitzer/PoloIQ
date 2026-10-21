const fs = require('fs'); const vm = require('vm');
const src = fs.readFileSync(require('path').join(__dirname,'..','..','index.html'),'utf8');
let code = src.match(/<script>([\s\S]*)<\/script>/)[1] + '\nglobalThis.__e={app,ensureSeedTeamsAndSchedule,reconcileSeedRosters,buildPlayerSeasonStats};';
const sb={console,document:{addEventListener(){},readyState:'complete',getElementById(){return null;},querySelector(){return null;},querySelectorAll(){return [];},createElement(){return {style:{},classList:{add(){},remove(){}},setAttribute(){},appendChild(){},addEventListener(){}};},body:{appendChild(){},classList:{add(){},remove(){}}}},window:{addEventListener(){},location:{href:''},localStorage:{getItem(){return null;},setItem(){},removeItem(){}},matchMedia(){return{matches:false,addEventListener(){}};},navigator:{serviceWorker:undefined}},localStorage:{getItem(){return null;},setItem(){},removeItem(){}},navigator:{serviceWorker:undefined,onLine:true},fetch:async()=>({ok:false,json:async()=>({})}),setTimeout:()=>0,clearTimeout,setInterval:()=>0,clearInterval,requestAnimationFrame:()=>0,crypto:{randomUUID:()=>'x'}};
sb.globalThis=sb; vm.createContext(sb); vm.runInContext(code,sb);
const {app,ensureSeedTeamsAndSchedule,reconcileSeedRosters,buildPlayerSeasonStats}=sb.__e;
ensureSeedTeamsAndSchedule();
const cal=app.teams.find(t=>t.name==='California');
const P=n=>cal.players.find(p=>p.name===n);
// fresh seed state sanity
console.log('fresh seed: players',cal.players.length,'| inactive',cal.players.filter(p=>p.active===false).length,'| Pina cap',P('Aran Pina').cap);
// build the OLD saved state
const old={'Riley Clansen':'1','James Peace III':'26','Aran Pina':'27','Kai Inoue':'3','Maddox Arlett':'4','Dominic Brown':'5','Chase Wilson':'6','Loui Schuler':'10'};
Object.entries(old).forEach(([n,c])=>{P(n).cap=c;});
['Ilias Angelopoulos','Amir Shafrir','Wyatt Williamson','João Leme','Mason Netzer'].forEach(n=>cal.players.splice(cal.players.findIndex(p=>p.name===n),1));
cal.players.forEach(p=>{delete p.active; delete p.seedInactiveDone;});
P('Chase Wilson').cap='99';            // coach hand-edit: must survive
const before=cal.players.length;
reconcileSeedRosters();
console.log('after reconcile: players',before,'->',cal.players.length,'(expect 24+5=29... or',before+5+')');
console.log('caps fixed:',['Riley Clansen','James Peace III','Aran Pina','Kai Inoue','Maddox Arlett','Dominic Brown','Loui Schuler'].map(n=>P(n).cap).join(','),'(expect 1A,1B,1,5,10,3,15)  hand-edited Wilson kept:',P('Chase Wilson').cap==='99');
console.log('graduates hidden:',['Albert Ponferrada','Marci Szatmary','Nik Mirkovic','Patrick Stice','Bende Pardi','William Kelly'].every(n=>P(n).active===false));
P('Albert Ponferrada').active=true;      // coach re-activates
const snap=JSON.stringify(cal.players); reconcileSeedRosters();
console.log('idempotent:',snap===JSON.stringify(cal.players),'| re-activated stays active:',P('Albert Ponferrada').active===true);
const s=buildPlayerSeasonStats(P('Beso Akhvlediani')).seasons.map(x=>[x.year,x.g,x.a,x.sh]);
console.log('Beso stats',JSON.stringify(s),'| Netzer 2026 g:',buildPlayerSeasonStats(P('Mason Netzer')).seasons.find(x=>x.year==='2026').g);
process.exit(0);
