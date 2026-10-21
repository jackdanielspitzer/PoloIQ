// A recording fake DOM: getElementById returns one persistent element per id, so tests can set
// form values (manual entry) and read back rendered innerHTML (box score, tactics panel).
function makeEl(id){
  const store={ id, value:'', innerHTML:'', textContent:'', checked:false, disabled:false, style:{}, dataset:{}, children:[], options:[], className:'' };
  store.classList={ add(){}, remove(){}, toggle(){}, contains:()=>false };
  let P;
  const fn=function(){ return P; };
  P=new Proxy(fn,{
    get(t,k){
      if(k in store) return store[k];
      if(k===Symbol.toPrimitive) return ()=>'';
      if(k===Symbol.iterator) return function*(){};
      if(k==='then') return undefined;
      if(k==='length') return 0;
      if(k==='appendChild'||k==='insertBefore'||k==='append') return (x)=>{ store.children.push(x); return x; };
      if(k==='querySelectorAll'||k==='getElementsByTagName'||k==='getElementsByClassName') return ()=>[];
      if(k==='getContext') return ()=>null;
      return (...a)=>makeEl();
    },
    set(t,k,v){ store[k]=v; return true; },
    apply(){ return makeEl(); }, construct(){ return makeEl(); }
  });
  return P;
}
function makeDocument(){
  const els={};
  const doc=makeEl('document');
  const getById=(id)=> els[id] || (els[id]=makeEl(id));
  return new Proxy(doc,{ get(t,k){ if(k==='getElementById') return getById; if(k==='createElement') return ()=>makeEl(); if(k==='querySelector') return ()=>null; if(k==='querySelectorAll') return ()=>[]; if(k==='body'||k==='documentElement'||k==='head') return getById('__'+k); if(k==='__els') return els; return t[k]; } });
}
module.exports={makeDocument};
