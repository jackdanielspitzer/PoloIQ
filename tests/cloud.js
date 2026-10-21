// Several devices running the real app against an in-memory fake of the Supabase database, with the same
// row-level rules as supabase/schema.sql. Never touches the real database.
const fs=require('fs'), vm=require('vm');
const {makeDocument}=require('./dom.js');
const html=fs.readFileSync(require('path').join(__dirname,'..','index.html'),'utf8');
const code=[...html.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n;\n');
const clone=x=>JSON.parse(JSON.stringify(x));

// ---------------- fake Supabase ----------------
const server={ online:true, tables:{profiles:[],teams:[],games:[],events:[],app_lists:[]}, users:[], subs:[], autoconfirm:false };
const OWNER='jackdanielspitzer@gmail.com';
function profileOf(uid){ return server.tables.profiles.find(p=>p.id===uid); }
function canManageTeam(uid,t){ const p=profileOf(uid); return !!p && (['admin','statistician'].includes(p.role) || (['manager','coach'].includes(p.role) && p.team_id===t)); }
function allowed(uid, table, op, row, existing){
  if(op==='select') return table!=='profiles' || !!uid;
  if(!uid) return false;
  if(table==='profiles') return row.id===uid && !(row.role==='admin' && (profileOf(uid)||{}).email!==OWNER);
  if(table==='teams') return !existing || canManageTeam(uid,existing.id) || ((existing.data||{}).claimStatus!=='claimed');
  if(table==='games') return canManageTeam(uid,(row||existing).team_id);
  if(table==='events'){ const g=server.tables.games.find(x=>x.id===(row||existing).game_id); return !!g && canManageTeam(uid,g.team_id); }
  if(table==='app_lists'){ const p=profileOf(uid); return !!p && ['admin','statistician','manager','coach'].includes(p.role); }
  return false;
}
function broadcast(table, eventType, nw, old){ server.subs.forEach(s=>{ if(s.table===table) setImmediate(()=>s.cb({eventType, new:clone(nw||{}), old:clone(old||{})})); }); }
function fakeSupabase(){
  return { createClient(){
    let session=null; const listeners=[];
    const net=()=> server.online ? null : {message:'TypeError: Failed to fetch'};
    const auth={
      async getSession(){ return {data:{session}}; },
      onAuthStateChange(cb){ listeners.push(cb); return {data:{subscription:{unsubscribe(){}}}}; },
      async signUp({email,password,options}){ if(net()) return {error:net()}; if(server.users.some(u=>u.email===email)) return {error:{message:'User already registered'}};
        const md=(options||{}).data||{}; if(md.role==='admin' && email!==OWNER) return {error:{message:'Database error saving new user: The Admin role is only for the app owner.'}};
        const u={id:'u-'+(server.users.length+1), email, password, confirmed:server.autoconfirm, user_metadata:md}; server.users.push(u);
        server.tables.profiles.push({id:u.id,email,name:md.name||email.split('@')[0],role:md.role||'player',team_id:md.team_id||null,profile_pic:null});
        if(u.confirmed){ session={user:{id:u.id,email,user_metadata:md}}; }
        return {data:{user:{id:u.id,email,identities:[{}]}, session}}; },
      async resend({email}){ server.resent=(server.resent||0)+1; return {error:null}; },
      async signInWithPassword({email,password}){ if(net()) return {error:net()}; const u=server.users.find(x=>x.email===email&&x.password===password); if(!u) return {error:{message:'Invalid login credentials'}}; if(!u.confirmed) return {error:{message:'Email not confirmed'}}; session={user:{id:u.id,email,user_metadata:u.user_metadata}}; listeners.forEach(f=>f('SIGNED_IN')); return {data:{session}}; },
      async signOut(){ session=null; listeners.forEach(f=>f('SIGNED_OUT')); return {}; },
      async updateUser({password}){ const u=server.users.find(x=>session&&x.id===session.user.id); if(u&&password) u.password=password; return {data:{}}; },
    };
    function from(table){
      const q={table, filters:[], range:null, order:null, op:'select', payload:null};
      const b={
        select(){ return b; }, order(c){ q.order=c; return b; }, range(a,z){ q.range=[a,z]; return b; },
        eq(c,v){ q.filters.push([c,v]); return b; },
        upsert(rows){ q.op='upsert'; q.payload=Array.isArray(rows)?rows:[rows]; return b; },
        update(row){ q.op='update'; q.payload=row; return b; },
        delete(){ q.op='delete'; return b; },
        then(res,rej){ return Promise.resolve(run()).then(res,rej); },
      };
      function run(){
        const uid=session&&session.user.id; const T=server.tables[table]; const key=table==='app_lists'?'key':'id';
        if(net()) return {data:null, error:net()};
        if(q.op==='select'){ if(!allowed(uid,table,'select')) return {data:[], error:null}; let rows=T.slice(); if(q.order) rows.sort((a,z)=>a[q.order]-z[q.order]); if(q.range) rows=rows.slice(q.range[0], q.range[1]+1); return {data:clone(rows), error:null}; }
        if(q.op==='upsert'){ for(const r of q.payload){ const ex=T.find(x=>x[key]===r[key]); if(!allowed(uid,table,'write',r,ex)) return {error:{message:'new row violates row-level security policy', code:'42501'}};
            if(ex){ Object.assign(ex, clone(r)); broadcast(table,'UPDATE',ex,ex); } else { const nr=clone(r); if(table==='events' && nr.seq==null) nr.seq=Date.now(); T.push(nr); broadcast(table,'INSERT',nr,null); } } return {error:null}; }
        const match=r=>q.filters.every(([c,v])=>r[c]===v);
        if(q.op==='update'){ const rows=T.filter(match); for(const r of rows){ const nr={...r,...q.payload}; if(!allowed(uid,table,'write',nr,r)) return {error:{message:'violates row-level security policy',code:'42501'}}; Object.assign(r,q.payload); broadcast(table,'UPDATE',r,r); } return {error:null}; }
        if(q.op==='delete'){ const rows=T.filter(match); for(const r of rows){ if(!allowed(uid,table,'write',null,r)) return {error:{message:'violates row-level security policy',code:'42501'}}; } server.tables[table]=T.filter(r=>!match(r)); if(table==='games') server.tables.events=server.tables.events.filter(e=>!rows.some(g=>g.id===e.game_id)); rows.forEach(r=>broadcast(table,'DELETE',null,{id:r.id})); return {error:null}; }
      }
      return b;
    }
    function channel(){ const ch={ on(_k,f,cb){ server.subs.push({table:f.table, cb}); return ch; }, subscribe(){ return ch; } }; return ch; }
    return { auth, from, channel };
  } };
}

// ---------------- devices ----------------
let oldBackend=null; // for the import test
function device(name, hash){
  const store={};
  const ctx={ console:{log(){},warn(){},error:console.error,info(){}}, setTimeout:(f,ms)=>{ if(!ms) setImmediate(f); return 0; }, clearTimeout(){}, setInterval:()=>0, clearInterval(){}, requestAnimationFrame:()=>0,
    document:makeDocument(), navigator:{userAgent:'node', onLine:true}, location:{href:'https://x/PoloIQ/', origin:'https://x', pathname:'/PoloIQ/', search:'', hash:hash||'', reload(){}}, history:{replaceState(){}},
    localStorage:{getItem:k=>store[k]??null, setItem:(k,v)=>{store[k]=String(v);}, removeItem:k=>{delete store[k];}}, sessionStorage:{getItem:()=>null,setItem(){}}, indexedDB:{deleteDatabase(){}},
    fetch: async (url)=>{ if(!oldBackend) throw new Error('offline'); const m=/[?&]chunk=(\d+)/.exec(url); return {ok:true, json:async()=> m ? {chunk:oldBackend.rows[+m[1]]} : oldBackend.meta}; },
    alert(){}, confirm:()=>true, prompt:()=>null, addEventListener(){}, removeEventListener(){}, matchMedia:()=>({matches:false,addEventListener(){}}), getComputedStyle:()=>({}),
    Image:function(){}, FileReader:function(){}, URL, Blob:function(){}, crypto:require('crypto').webcrypto, performance:{now:()=>Date.now()}, structuredClone, TextEncoder, TextDecoder, Math, Date, JSON, AbortController, URLSearchParams };
  ctx.window=ctx; ctx.self=ctx; ctx.globalThis=ctx; ctx.supabase=fakeSupabase();
  vm.createContext(ctx); vm.runInContext(code+'\n;globalThis.__app=app;', ctx, {timeout:60000});
  ctx.name=name; ctx.store=store; ctx.run=s=>vm.runInContext(s,ctx); return ctx;
}
const settle=async(n=40)=>{ for(let i=0;i<n;i++) await new Promise(r=>setImmediate(r)); };
let pass=0,fail=0; const check=(n,ok,i='')=>{ ok?pass++:fail++; console.log((ok?'PASS ':'FAIL ')+n+(ok&&!i?'':'  ['+i+']')); };
async function form(d, {mode, email, password, role='player', team='', name='Test'}){
  const D=id=>d.document.getElementById(id);
  d.showUserForm(mode==='login'?{loginMode:true}:{}); D('userNameInput').value=name; D('userEmailInput').value=email; D('userPasswordInput').value=password;
  D('userLoginMode').checked = mode==='login'; D('userRoleInput').value=role; D('userTeamAssign').value=team; D('userFormError').textContent=''; D('userFormError').style.display='none';
  await d.saveUser(); await settle(); return D('userFormError').textContent;
}

(async()=>{
  // Jack's laptop
  const jack=device('jack'); await jack.cloudBoot(); await settle();
  const J=jack.__app;
  check('boots from built-in data (no download)', J.games.length>1000 && J.teams.length>=19, J.games.length+' games');
  // the next real Navy game that hasn't been played yet (never a fixed date: once a game is played the
  // daily update turns it into a final result, and a test must not stand in the way of that)
  const todayIso=new Date().toISOString().slice(0,10);
  const nextNavy=J.games.filter(g=>g.teamId==='team-navy' && g.status==='upcoming' && (g.date||'')>=todayIso && !/field TBD/.test(g.opponent||'')).sort((a,b)=>a.date.localeCompare(b.date))[0];
  check('stable ids for teams and games', J.teams.some(t=>t.id==='team-navy') && !!nextNavy && /^g-navy-\d{4}-\d{2}-\d{2}-[a-z0-9-]+$/.test(nextNavy.id), nextNavy && nextNavy.id);
  check('nothing shared is stored on the computer', !jack.store['poloai-app-state'] && Object.keys(jack.store).every(k=>/^poloiq-(outbox|practice)$/.test(k) || k.startsWith('sb-')), Object.keys(jack.store).join(','));

  let msg=await form(jack,{mode:'signup', email:'someone@else.com', password:'secret1', role:'admin'});
  check('only the owner can be Admin', /only for the app owner/i.test(msg), msg);
  await form(jack,{mode:'signup', email:OWNER, password:'secret1', role:'admin', name:'Jack Spitzer'});
  const JD=id=>jack.document.getElementById(id);
  check('sign-up closes the form and shows "Check your email"', JD('userFormPanel').style.display==='none' && JD('authNoticeTitle').textContent==='Check your email' && /jackdanielspitzer@gmail\.com/.test(JD('authNoticeBody').innerHTML), JD('authNoticeTitle').textContent);
  const resendBtn=JD('authNoticeActions').children.find(b=>b.textContent==='Resend email'); await resendBtn.onclick(); await settle();
  check('Resend email sends again and says so', server.resent===1 && /Sent again/.test(JD('authNoticeSmall').textContent), JD('authNoticeSmall').textContent);
  const backBtn=JD('authNoticeActions').children.find(b=>b.textContent==='Back to log in'); await backBtn.onclick(); await settle();
  check('Back to log in opens the login form with the email filled in', JD('userFormPanel').style.display==='flex' && JD('userEmailInput').value===OWNER);
  await form(jack,{mode:'login', email:OWNER, password:'secret1'});
  check('login before confirming shows "Confirm your email first"', JD('authNoticeTitle').textContent==='Confirm your email first');
  server.users.forEach(u=>u.confirmed=true);
  msg=await form(jack,{mode:'login', email:OWNER, password:'wrong'});
  check('wrong password refused', /incorrect/i.test(msg), msg);
  msg=await form(jack,{mode:'login', email:OWNER, password:'secret1'});
  const me=jack.currentUser(); check('admin logs in', me && me.role==='admin', msg);

  // Navy stat-taker account + phone
  const navyPhone=device('navy'); await navyPhone.cloudBoot(); await settle();
  await form(navyPhone,{mode:'signup', email:'jackspitzer@berkeley.edu', password:'test-pass-navy-1', role:'manager', team:'team-navy', name:'Navy Stats'});
  server.users.forEach(u=>u.confirmed=true);
  await form(navyPhone,{mode:'login', email:'jackspitzer@berkeley.edu', password:'test-pass-navy-1'});
  const N=navyPhone.__app; const nu=navyPhone.currentUser();
  check('Navy manager logs in, linked to Navy', nu && nu.role==='manager' && nu.teamId==='team-navy', JSON.stringify(nu));

  // Navy phone logs a goal in Navy's next game
  const gid=nextNavy.id;
  N.selectedGameId=gid; N.page='game'; N.manageMode=true; navyPhone.resetSyncBaseline(); N.currentQ=1;
  navyPhone.setGameColor('Dark'); navyPhone.setStatFor(null);
  navyPhone.handleParsedPhrase('dark 8 goal assisted by dark 2'); await settle();
  const evRows=()=>server.tables.events.filter(e=>e.game_id===gid);
  check('stat saved to the database as rows', evRows().length===3 && server.tables.games.some(g=>g.id===gid), evRows().map(e=>e.data.stat_type).join(','));
  check('cap color saved on the game', (server.tables.games.find(g=>g.id===gid)||{}).data.ourColor==='Dark');
  const Jg=()=>J.games.find(g=>g.id===gid);
  check('Jack’s laptop got the stat live', jack.computeGameScore(Jg()).team===1, JSON.stringify(jack.computeGameScore(Jg())));

  // Jack logs from his laptop into the same game, Navy phone sees it
  J.selectedGameId=gid; J.page='game'; J.manageMode=true; jack.resetSyncBaseline(); J.currentQ=1; J.statFor={gameId:gid, side:null};
  jack.handleParsedPhrase('dark 5 steal'); await settle();
  check('both devices’ stats in one game', Object.values(N.games.find(g=>g.id===gid).quarters).flat().some(e=>e.stat_type==='steal') && evRows().length===4);

  // undo on the Navy phone removes its last call everywhere
  navyPhone.handleParsedPhrase('light 4 goal'); await settle(); const before=evRows().length;
  navyPhone.undoEvent(); await settle();
  check('undo deletes the rows, everywhere', evRows().length===before-2 && jack.computeGameScore(Jg()).opponent===0, before+' -> '+evRows().length);

  // pool Wi-Fi drops mid-game
  server.online=false; navyPhone.handleParsedPhrase('dark 3 goal'); await settle();
  check('offline: stat waits in the small unsent queue', !!navyPhone.store['poloiq-outbox'] && JSON.parse(navyPhone.store['poloiq-outbox']).length>=2);
  check('offline: the phone still shows it', navyPhone.computeGameScore(N.games.find(g=>g.id===gid)).team===2);
  server.online=true; await navyPhone.cloudFlush(); await settle();
  check('back online: queued stats reach the database', !navyPhone.store['poloiq-outbox'] && jack.computeGameScore(Jg()).team===2, JSON.stringify(jack.computeGameScore(Jg())));

  // permissions
  const calGame=N.games.find(g=>g.teamId==='team-california' && g.status==='upcoming');
  check('Navy account can’t manage Cal games', !navyPhone.hasManagePermission(calGame));
  const nEvents=server.tables.events.length; calGame.notes='hacked'; navyPhone.saveState(); await settle();
  check('a change it isn’t allowed to make is never sent', server.tables.events.length===nEvents && !server.tables.games.some(g=>g.id===calGame.id));

  // a logged-out visitor on a fresh computer
  const viewer=device('viewer'); await viewer.cloudBoot(); await settle();
  const V=viewer.__app; const vg=V.games.find(g=>g.id===gid);
  check('visitor sees the live game without logging in', viewer.computeGameScore(vg).team===2 && !viewer.currentUser());
  ['renderHome','renderTeams','renderGames','renderDataPage'].forEach(f=>{ try{ viewer[f](); }catch(e){} }); viewer.saveState(); await settle();
  check('visitor’s browser never writes anything', !viewer.store['poloiq-outbox']);

  // mark final, reload device: everything comes back from the database
  N.selectedGameId=gid; navyPhone.toggleGameFinal(); await settle();
  const again=device('reload'); await again.cloudBoot(); await settle();
  const ag=again.__app.games.find(g=>g.id===gid);
  check('after a reload: game, stats and Final status all come back', ag.status==='final' && again.computeGameScore(ag).team===2, ag.status+' '+JSON.stringify(again.computeGameScore(ag)));

  // roster edit by Navy manager reaches others
  const navyTeam=N.teams.find(t=>t.id==='team-navy'); N.selectedTeamId='team-navy';
  navyTeam.players.push({id:'p-navy-new-guy', teamId:'team-navy', cap:'30', name:'New Guy', role:'player', wpPosition:'', aliases:[], active:true}); navyPhone.saveState(); await settle();
  check('roster edit saved and shown on other devices', J.teams.find(t=>t.id==='team-navy').players.some(p=>p.name==='New Guy'));

  // script injection attempt from another account
  { N.teams.find(t=>t.id==='team-navy').players.push({id:'p-navy-evil', teamId:'team-navy', cap:'31', name:'<img src=x onerror=alert(1)>', role:'player', wpPosition:'', aliases:[], active:true});
    N.selectedTeamId='team-navy'; navyPhone.saveState(); await settle();
    N.selectedGameId=gid; N.currentQ=1; { const ND=id=>navyPhone.document.getElementById(id); ND('manualPlayerSelect').value=N.teams.find(t=>t.id==='team-navy').players[0].id; ND('manualNoteText').value='"><script>grab(document.cookie)</script>'; navyPhone.addManualNote(); } await settle();
    server.tables.games.push({id:"g-evil');alert(1);//", team_id:'team-navy', date:'2026-10-30', opponent:'X', status:'upcoming', data:{}});
    const fresh=device('victim'); await fresh.cloudBoot(); await settle(); const F=fresh.__app;
    const srvNavy=0; 0&&console.log('DBG server navy players', srvNavy && srvNavy.data.players.length, 'has evil', srvNavy && srvNavy.data.players.some(p=>p.cap==='31'), 'victim players', F.teams.find(t=>t.id==='team-navy').players.length, 'srv events note', server.tables.events.filter(e=>e.data.stat_type==='note').length, 'outbox', navyPhone.store['poloiq-outbox']||'none', 'navy game status', (N.games.find(g=>g.id===gid)||{}).status, 'last events', JSON.stringify(Object.values(N.games.find(g=>g.id===gid).quarters).flat().slice(-3).map(e=>[e.stat_type,e.note,e.eid?1:0])));
    const evil=F.teams.find(t=>t.id==='team-navy').players.find(p=>p.cap==='31');
    check('malicious player name arrives harmless', evil && !/[<>]/.test(evil.name), evil && evil.name);
    const notes=Object.values(F.games.find(g=>g.id===gid).quarters).flat().filter(e=>e.stat_type==='note');
    check('malicious note arrives harmless', notes.length && notes.every(n=>!/[<>"]/.test(n.note||'') && !/[<>"]/.test(n.raw_phrase||'')), JSON.stringify(notes.map(n=>n.note)));
    check('game with a malicious id is ignored', !F.games.some(g=>/alert/.test(g.id)));
    F.selectedTeamId='team-navy'; F.page='team'; try{ fresh.renderTeam(); }catch(e){}
    const htmlOut=Object.values(fresh.document.__els).map(e=>e.innerHTML||'').join(' ');
    check('nothing executable rendered on the team page', !/<img src=x|<script>/i.test(htmlOut));
    check('real names with apostrophes still match (Saint Mary’s team)', F.teams.some(t=>t.name==="Saint Mary's") && F.teams.some(t=>t.name==="Mount St. Mary's")); }
  // import from the old backend (admin)
  const D=process.env.REALDIR;
  if(D){ const n=fs.readdirSync(D).length; oldBackend={meta:{totalChunks:n, updatedAt:'x'}, rows:[...Array(n)].map((_,i)=>JSON.parse(fs.readFileSync(D+'/'+i+'.json')).chunk)};
    await jack.cloudImportFromOldBackend(); await settle(200);
    const old=JSON.parse(oldBackend.rows.join('')); const missing=old.teams.filter(t=>{ const a=J.teams.find(x=>x.name===t.name); return !a || (t.players||[]).some(p=>!a.players.some(q=>q.name===p.name)); });
    check('import: every old team and roster is in the app', missing.length===0, missing.map(t=>t.name).join(','));
    check('import: Navy stats from today untouched', jack.computeGameScore(Jg()).team===2);
  }
  // arriving from the confirmation email
  { const land=device('landing', '#access_token=x&type=signup'); await land.cloudBoot(); await settle(); const LD=id=>land.document.getElementById(id);
    check('opening the email link shows "Email verified"', LD('authNoticeTitle').textContent==='Email verified', LD('authNoticeTitle').textContent);
    const exp=device('expired', '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired'); await exp.cloudBoot(); await settle(); const ED=id=>exp.document.getElementById(id);
    check('an expired link says so and offers log in', ED('authNoticeTitle').textContent==='That link has expired' && ED('authNoticeActions').children.some(b=>b.textContent==='Go to log in'), ED('authNoticeTitle').textContent); }
  console.log(`\n${pass} passed, ${fail} failed`);
})().catch(e=>console.log('CRASH', e.stack.split('\n').slice(0,5).join('\n')));
