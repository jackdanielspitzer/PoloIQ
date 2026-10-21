// Load PoloIQ's real app script in Node with an inert fake DOM (no network, no storage writes).
const fs=require('fs'), vm=require('vm');
const html=fs.readFileSync(require('path').join(__dirname,'..','index.html'),'utf8');
const code=[...html.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n;\n');
function stub(){ const f=function(){ return P; }; const P=new Proxy(f,{ get(t,k){ if(k===Symbol.toPrimitive) return ()=>''; if(k==='length') return 0; if(k===Symbol.iterator) return function*(){}; if(k==='then') return undefined; if(k==='value'||k==='textContent'||k==='innerHTML') return ''; if(k==='style') return {}; if(k==='checked') return false; return P; }, set(){ return true; }, apply(){ return P; }, construct(){ return P; } }); return P; }
const S=stub();
const ctx={ console, setTimeout:()=>0, clearTimeout:()=>{}, setInterval:()=>0, clearInterval:()=>{}, requestAnimationFrame:()=>0,
  document:S, navigator:{ serviceWorker:undefined, mediaDevices:undefined, userAgent:'node' }, location:{ href:'http://test/', search:'', hash:'', reload(){} },
  localStorage:{ getItem:()=>null, setItem(){}, removeItem(){} }, sessionStorage:{ getItem:()=>null, setItem(){} }, indexedDB:undefined,
  fetch:()=>Promise.reject(new Error('offline test')), alert(){}, confirm:()=>false, prompt:()=>null, addEventListener(){}, removeEventListener(){},
  matchMedia:()=>({matches:false, addEventListener(){}}), getComputedStyle:()=>({}), Image:function(){}, FileReader:function(){}, URL, Blob:function(){}, crypto:require('crypto').webcrypto,
  performance:{ now:()=>Date.now() }, structuredClone, TextEncoder, TextDecoder, Math, Date, JSON };
ctx.window=ctx; ctx.self=ctx; ctx.globalThis=ctx;
vm.createContext(ctx);
try{ vm.runInContext(code+'\n;globalThis.__app=app;', ctx, {timeout:60000}); }catch(e){ console.log('LOAD ERROR', e.message.slice(0,300)); }
module.exports=ctx;
