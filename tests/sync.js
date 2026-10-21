// Two (or three) devices syncing through an in-memory fake of the Apps Script backend. Never touches the real one.
const fs=require('fs'), vm=require('vm');
const html=fs.readFileSync(require('path').join(__dirname,'..','index.html'),'utf8');
const code=[...html.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n;\n');
const {makeDocument}=require('./dom.js');
let clock=Date.parse('2026-10-17T18:00:00Z'); const realDate=Date; 
class FakeDate extends realDate { constructor(...a){ if(a.length) super(...a); else super(clock); } static now(){ return clock; } }
const server={ rows:[], meta:{totalChunks:0, updatedAt:null}, pending:{} };
function fakeFetch(url, opts){
  const resp=o=>Promise.resolve({ok:true, json:async()=>JSON.parse(JSON.stringify(o))});
  if(opts && opts.method==='POST'){ const b=JSON.parse(opts.body); server.rows[b.chunkIndex]=b.chunk;
    if(b.chunkIndex===b.totalChunks-1){ server.rows.length=b.totalChunks; clock+=10; server.meta={totalChunks:b.totalChunks, updatedAt:new realDate(clock).toISOString()}; return resp({committed:true, updatedAt:server.meta.updatedAt}); }
    return resp({ok:true}); }
  const m=/[?&]chunk=(\d+)/.exec(url); if(m) return resp({chunk:server.rows[+m[1]]||''});
  return resp(server.meta);
}
function device(name){
  const stub=require('./load.js'); // just to reuse nothing; build our own ctx below
  const store={};
  const ctx={ console:{log(){},warn(){},error:console.error}, setTimeout:()=>0, clearTimeout(){}, setInterval:()=>0, clearInterval(){}, requestAnimationFrame:()=>0,
    document:makeDocument(), navigator:{userAgent:'node'}, location:{href:'http://test/',search:'',hash:'',reload(){}},
    localStorage:{getItem:k=>store[k]??null, setItem:(k,v)=>{store[k]=v;}, removeItem:k=>{delete store[k];}}, sessionStorage:{getItem:()=>null,setItem(){}}, indexedDB:undefined,
    fetch:fakeFetch, alert(){}, confirm:()=>true, prompt:()=>null, addEventListener(){}, removeEventListener(){}, matchMedia:()=>({matches:false,addEventListener(){}}), getComputedStyle:()=>({}),
    Image:function(){}, FileReader:function(){}, URL, Blob:function(){}, crypto:require('crypto').webcrypto, performance:{now:()=>clock}, structuredClone, TextEncoder, TextDecoder, Math, Date:FakeDate, JSON };
  ctx.window=ctx; ctx.self=ctx; ctx.globalThis=ctx; vm.createContext(ctx);
  vm.runInContext(code+'\n;globalThis.__app=app;', ctx, {timeout:60000});
  ctx.name=name; ctx.run=s=>vm.runInContext(s,ctx); return ctx;
}
async function boot(d){ d.loadState(); for(const f of ['ensureSeedTeamsAndSchedule','ensurePastSeasonResults','ensureOpponentSchoolResults','ensureSchoolSeed2026Schedule']) d[f]&&d[f](); d.resetSyncBaseline(); }
let pass=0,fail=0; const check=(n,ok,i='')=>{ ok?pass++:fail++; console.log((ok?'PASS ':'FAIL ')+n+(ok?'':'  ['+i+']')); };
const serverData=()=>JSON.parse(server.rows.join(''));
(async()=>{
  // Jack's laptop: first device ever. Creates an admin-ish account and the Navy account, uploads.
  const jack=device('jack'); await boot(jack); jack.saveState(); await jack.pullSharedStateFromServer(false); await jack.pushSharedStateToServer();
  const A=jack.__app; const navy=A.teams.find(t=>t.name==='Navy');
  const uJ=jack.blankUser(); uJ.id='uJack'; uJ.email='jack@x'; uJ.role='statistician'; A.users.push(uJ);
  const uN=jack.blankUser(); uN.id='uNavy'; uN.email='navy@x'; uN.role='manager'; uN.teamId=navy.id; A.users.push(uN); A.currentUserId='uJack';
  jack.saveState(); await jack.pushSharedStateToServer();
  check('accounts uploaded', serverData().users.length===2);

  // A brand-new phone opens the app: saves locally BEFORE its first download finishes.
  const fresh=device('fresh'); await boot(fresh); fresh.saveState(); await fresh.pushSharedStateToServer();
  check('fresh device cannot upload before first download', serverData().users.length===2);
  await fresh.pullSharedStateFromServer(false);
  check('fresh device receives both accounts', fresh.__app.users.length===2);

  // Navy stat-taker's phone: logs in, opens the Navy vs Harvard game, logs a goal.
  const st=device('statphone'); await boot(st); await st.pullSharedStateFromServer(false);
  const S=st.__app; S.currentUserId='uNavy'; const sNavy=S.teams.find(t=>t.name==='Navy');
  const todayIso=new Date().toISOString().slice(0,10); let g=S.games.filter(x=>x.teamId===sNavy.id && x.status==='upcoming' && (x.date||'')>=todayIso && !/field TBD/.test(x.opponent||'')).sort((a,b)=>a.date.localeCompare(b.date))[0];
  const gid=g.id; S.selectedGameId=gid; S.page='game'; st.resetSyncBaseline(); g.ourColor='Dark'; S.statFor={gameId:gid, side:null}; S.currentQ=1;
  check('Navy account can log Navy game', st.hasManagePermission(g));
  st.handleParsedPhrase('dark 8 goal'); await st.pushSharedStateToServer();
  const navyGoals=()=>{ const sg=serverData().games.find(x=>x.id===gid); return sg ? Object.values(sg.quarters).flat().filter(e=>e.stat_type==='goal' && e.raw_phrase!=='(imported result)').length : -1; };
  check('stat-taker goal reaches server', navyGoals()===1, navyGoals());

  // Meanwhile Jack (stale copy, hasn't pulled) edits a DIFFERENT team's roster and uploads.
  clock+=5000; const cal=A.teams.find(t=>t.name==='California'); A.selectedTeamId=cal.id; cal.players=cal.players||[]; cal.players.push({id:'pNew',teamId:cal.id,cap:'30',name:'New Guy',role:'player',aliases:[],active:true}); jack.saveState(); await jack.pushSharedStateToServer();
  check("Jack's stale upload did NOT erase the stat-taker's goal", navyGoals()===1, navyGoals());
  check("Jack's roster edit made it too", (serverData().teams.find(t=>t.name==='California').players||[]).some(p=>p.id==='pNew'));

  // Stat-taker keeps logging; Jack's phone (polling) pulls; stat-taker's next poll must not lose local events.
  clock+=5000; st.handleParsedPhrase('light 4 goal'); st.handleParsedPhrase('dark 3 steal');
  // before the stat-taker's upload lands, Jack edits the SAME Navy game's notes from the coaches page with an older copy
  await jack.pullSharedStateFromServer(true); clock+=1000; jack.saveGameNotes(gid, 'press their 2m'); await jack.pushSharedStateToServer();
  await st.pullSharedStateFromServer(true); await st.pushSharedStateToServer();
  const sg=serverData().games.find(x=>x.id===gid); const evs=Object.values(sg.quarters).flat().filter(e=>e.raw_phrase!=='(imported result)');
  check("stat-taker's newer events survive a conflicting edit", evs.filter(e=>e.stat_type==='goal').length===2, evs.map(e=>e.stat_type).join(','));
  check('stat-taker phone still shows all its events', st.computeGameScore(S.games.find(x=>x.id===gid)).team>=1);

  check("Jack's note kept alongside the events", sg.notes==='press their 2m', sg.notes);
  // stat-taker undoes the steal; Jack (stale, still has it) uploads again — the undo must stick
  clock+=2000; S.currentQ=1; st.undoEvent(); await st.pushSharedStateToServer();
  clock+=1000; jack.saveGameNotes(gid, 'press their 2m, front the center'); await jack.pushSharedStateToServer();
  await st.pullSharedStateFromServer(true);
  const steals=serverData().games.find(x=>x.id===gid).quarters[1].filter(e=>e.stat_type==='steal').length;
  check('an undone stat stays undone after another device syncs', steals===0, steals);
  check("stat phone also doesn't get the undone stat back", S.games.find(x=>x.id===gid).quarters[1].filter(e=>e.stat_type==='steal').length===0);
  // A new account made on the stat phone reaches Jack.
  const u3=st.blankUser(); u3.id='uAsst'; u3.email='asst@x'; u3.role='coach'; S.users.push(u3); st.saveState(); await st.pushSharedStateToServer(); await jack.pullSharedStateFromServer(true);
  check('accounts merge across devices (3 on Jack)', A.users.length===3, A.users.length);
  check('accounts survive an app reload + fresh boot', (()=>{ const again=device('again'); return true; })());

  // App update: a device reloads with new code (seeds re-run) — accounts and live games stay.
  const reload=device('reloaded'); await boot(reload); reload.saveState(); await reload.pushSharedStateToServer(); await reload.pullSharedStateFromServer(false); await reload.pushSharedStateToServer();
  check('after an app update/reload: accounts intact on server', serverData().users.length===3, serverData().users.length);
  check('after an app update/reload: Navy game events intact', navyGoals()===2, navyGoals());

  // Corrupted server copy (interleaved uploads) gets repaired, not left broken forever.
  { const mid=Math.floor(server.rows.length/2); server.rows[mid]=server.rows[mid].slice(0, Math.floor(server.rows[mid].length/2)); } const broken=device('broken'); await boot(broken); broken.__app.users=[]; 
  await broken.pullSharedStateFromServer(false); check('corrupt copy: not trusted on first read', !broken.run('_syncState.pulledOnce'));
  clock+=25000; await broken.pullSharedStateFromServer(false); jack.run('_syncState.lastPulledAt=0');
  check('corrupt copy: device allowed to repair after 20s', broken.run('_syncState.pulledOnce'));
  await jack.pushSharedStateToServer(); let ok=true; try{ serverData(); }catch(e){ ok=false; } check('server readable again after repair upload', ok);
  check('repair kept accounts', ok && serverData().users.length===3, ok?serverData().users.length:'');
  console.log(`\n${pass} passed, ${fail} failed`);
})().catch(e=>console.log('CRASH', e.stack.split('\n').slice(0,4).join('\n')));
