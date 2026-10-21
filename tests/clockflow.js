const vm=require('vm'); const {makeDocument}=require('./dom.js');
const {c,app,g}=require('./setup.js'); c.document=makeDocument();
const run=s=>vm.runInContext(s,c);
let pass=0,fail=0; const check=(n,ok,i='')=>{ ok?pass++:fail++; console.log((ok?'PASS ':'FAIL ')+n+(ok?'':'  ['+i+']')); };
(async()=>{
  const reset=()=>{ run('clockSyncPulledThisSession=true; clockSyncLastAppliedMs=null; clockSyncLastAppliedQ=null; clockSyncQuarterMaxMs={}; clockSyncPeriodMs=480000;'); g.quarters={1:[],2:[],3:[],4:[]}; g.quarterStart={}; app.currentQ=1; app.page='game'; };
  const read=async ms=>{ await c.applyClockSyncReading(ms); };
  // A: coach forgets to switch tabs
  reset(); for(const ms of [480000,300000,20000,5000,0]) await read(ms);
  check('Q1 still selected at 0:00', app.currentQ===1);
  await read(480000); check('reset to 8:00 auto-advances to Q2', app.currentQ===2, app.currentQ);
  const startQ2=g.quarterStart[2]; check('Q2 clock anchored, Q1 anchor untouched', typeof startQ2==='number' && Math.abs(Date.now()-startQ2)<1000 && g.quarterStart[1]!==startQ2);
  c.handleParsedPhrase('light 8 goal'); check('next phrase lands in Q2', g.quarters[2].length>0 && g.quarters[1].length===0);
  await read(479000); check('normal ticking does not advance again', app.currentQ===2);
  // B: break timer (2:00 countdown between quarters) then reset
  for(const ms of [200000,0,120000,60000,0,480000]) await read(ms);
  check('break timer then reset -> Q3 (not Q4)', app.currentQ===3, app.currentQ);
  // C: coach already tapped next tab during break
  reset(); for(const ms of [100000,0]) await read(ms); app.currentQ=2; await read(0); await read(480000);
  check('manual tab switch is not double-advanced', app.currentQ===2, app.currentQ);
  // D: Q4 end never auto-creates OT
  reset(); app.currentQ=4; for(const ms of [10000,0,480000]) await read(ms);
  check('Q4 -> no automatic overtime', app.currentQ===4 && !g.extraPeriods?.includes('OT1'));
  // E: mid-quarter misread-free large correction (table fixes clock 1:00 -> 3:00) does not advance
  reset(); for(const ms of [60000,180000]) await read(ms); check('clock correction mid-quarter does not advance', app.currentQ===1);
  // F: shrunk sync window (a read every ~400ms) on a running clock with glitches: the game clock must follow
  { reset(); run('clockSyncTrust=null; clockSyncPending=null; clockSyncFrameVotes=[];');
    const realNow=Date.now; let t=realNow(); c.Date.now=()=>t; const start=t; const startRemain=5*60000+29000;
    let applied=0; const glitchAt=new Set([7,8,19,33]);
    for(let i=0;i<60;i++){ t=start+i*400; const trueMs=Math.ceil((startRemain-(t-start))/1000)*1000;
      const readMs = glitchAt.has(i) ? 34*60000+3000 : (i===20 ? 91000 : trueMs);
      const v=c.clockVotedReading(readMs); if(v!==null && c.clockReadingAccepted(v)){ await c.applyClockSyncReading(v); applied++; } }
    const shown = 480000 - (t - g.quarterStart[app.currentQ]); const trueNow = startRemain-(t-start);
    c.Date.now=realNow;
    check('shrunk window: readings reach the game clock', applied>5, 'applied '+applied);
    check('shrunk window: game clock within 1.5s of the real clock despite glitches', Math.abs(shown-trueNow) <= 1500, `shown ${(shown/1000).toFixed(1)}s real ${(trueNow/1000).toFixed(1)}s`);
  }
  // G: fresh start, window open (a read every 200ms): the first sync lands within ~1 second
  { reset(); run('clockSyncTrust=null; clockSyncPending=null; clockSyncFrameVotes=[]; clockSyncPulledThisSession=false; clockSyncLastAppliedMs=null;');
    let fetches=0; const realFetch=c.fetch; c.fetch=(...a)=>{ fetches++; return realFetch(...a); };
    const realNow=Date.now; let t=realNow(); c.Date.now=()=>t; const start=t; let firstAt=null;
    for(let i=0;i<20 && firstAt===null;i++){ t=start+i*200; const ms=Math.ceil((328000-(t-start))/1000)*1000;
      const v=c.clockVotedReading(ms); if(v!==null && c.clockReadingAccepted(v)){ await c.applyClockSyncReading(v); if(g.quarterStart[app.currentQ]) firstAt=t-start; } }
    c.Date.now=realNow; c.fetch=realFetch;
    check('first sync lands within ~1 second of reading the clock', firstAt!==null && firstAt<=1000, 'ms '+firstAt);
    check('first sync does not download the whole shared backend first', fetches===0, fetches+' fetches');
  }
  // H: real clock PAUSED at 7:26 (timeout / paused video): the game clock must hold at 7:26, not run on
  { reset(); run('clockSyncTrust=null; clockSyncPending=null; clockSyncFrameVotes=[]; clockSyncLastAppliedMs=null;');
    const realNow=Date.now; let t=realNow(); c.Date.now=()=>t; const start=t;
    for(let i=0;i<10;i++){ t=start+i*400; const ms=Math.ceil((448000-(t-start))/1000)*1000; const v=c.clockVotedReading(ms); if(v!==null && c.clockReadingAccepted(v)) await c.applyClockSyncReading(v); }
    const pausedAt = Math.ceil((448000-(t-start))/1000)*1000;
    for(let i=1;i<=100;i++){ t+=400; const v=c.clockVotedReading(pausedAt); if(v!==null && c.clockReadingAccepted(v)) await c.applyClockSyncReading(v); }
    const shown = 480000 - (t - g.quarterStart[app.currentQ]); c.Date.now=realNow;
    check('paused real clock (40 s): game clock holds within 1 s', Math.abs(shown - pausedAt) <= 1000, `shown ${(shown/1000).toFixed(1)}s, real ${(pausedAt/1000)}s`);
  }
  // I: clock corrections don't upload every second (quiet: at most every 30 s)
  { const due = run('_syncState.pushDueAt'); check('clock corrections schedule a quiet (30 s) upload, not an immediate one', !due || due - Date.now() > 5000, 'due in '+(due-Date.now())+'ms'); }
  console.log(`\n${pass} passed, ${fail} failed`);
})();
