// Draws synthetic scoreboard clocks pixel by pixel and runs the app's real digit reader on them.
const {c}=require('./setup.js');
const SEG={0:'abcdef',1:'bc',2:'abged',3:'abgcd',4:'fgbc',5:'afgcd',6:'afgecd',7:'abc',8:'abcdefg',9:'abcdfg'};
function render(text,{H=120,style='solid',slant=0,margin=30,blur=0,noise=0,color=[255,40,30],bg=12,colon=true,ghost=0,glare=0}={}){
  const W=Math.round(H*0.55), gapD=Math.round(H*0.25), th=Math.max(3,Math.round(H*0.11));
  const chars=text.split(''); let width=margin*2; chars.forEach(ch=>{ width += ch===':' ? Math.round(H*0.3) : W+gapD; });
  const w=width, h=H+margin*2; const img=new Float32Array(w*h).fill(0);
  const line=(x1,y1,x2,y2)=>{ const len=Math.hypot(x2-x1,y2-y1); const steps=Math.ceil(len);
    const dot=style==='dots'; const spacing=dot?th*1.8:1;
    for(let t=0;t<=len;t+=spacing){ const x=x1+(x2-x1)*t/len, y=y1+(y2-y1)*t/len; const rad=dot?th*0.42:th/2;
      for(let yy=Math.floor(y-rad);yy<=y+rad;yy++) for(let xx=Math.floor(x-rad);xx<=x+rad;xx++){ if(dot && Math.hypot(xx-x,yy-y)>rad) continue; const sx=Math.round(xx+(margin+H-yy)*slant); if(sx>=0&&sx<w&&yy>=0&&yy<h) img[yy*w+sx]=1; } } };
  let cx=margin;
  chars.forEach(ch=>{
    if(ch===':'){ if(colon){ const x=cx+H*0.12; [[0.33],[0.7]].forEach(([f])=>{ for(let yy=-th/2;yy<th/2;yy++) for(let xx=-th/2;xx<th/2;xx++){ const X=Math.round(x+xx+(margin+H-(margin+f*H+yy))*slant), Y=Math.round(margin+f*H+yy); img[Y*w+X]=1; } }); } cx+=Math.round(H*0.3); return; }
    const s=SEG[ch], L=cx+th/2, R=cx+W-th/2, T=margin+th/2, M=margin+H/2, B=margin+H-th/2;
    if(ghost){ const keep=img.slice(); ['a','g','d','f','b','e','c'].forEach(sg=>{ if(s.includes(sg)) return; const before=img.slice();
      ({a:()=>line(L,T,R,T),g:()=>line(L,M,R,M),d:()=>line(L,B,R,B),f:()=>line(L,T,L,M),b:()=>line(R,T,R,M),e:()=>line(L,M,L,B),c:()=>line(R,M,R,B)})[sg]();
      for(let q=0;q<img.length;q++) if(img[q]===1 && before[q]!==1) img[q]=ghost; }); }
    if(s.includes('a')) line(L,T,R,T); if(s.includes('g')) line(L,M,R,M); if(s.includes('d')) line(L,B,R,B);
    if(s.includes('f')) line(L,T,L,M); if(s.includes('b')) line(R,T,R,M); if(s.includes('e')) line(L,M,L,B); if(s.includes('c')) line(R,M,R,B);
    cx+=W+gapD; });
  // blur
  let out=img; for(let k=0;k<blur;k++){ const n=new Float32Array(w*h); for(let y=1;y<h-1;y++) for(let x=1;x<w-1;x++){ let sum=0; for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++) sum+=out[(y+dy)*w+x+dx]; n[y*w+x]=sum/9; } out=n; }
  const data=new Uint8ClampedArray(w*h*4); let seed=7; const rnd=()=>{ seed=(seed*16807)%2147483647; return seed/2147483647; };
  for(let p=0;p<w*h;p++){ const v=out[p]; const nz=(rnd()-0.5)*noise; const gl=glare*((p%w)/w); for(let k=0;k<3;k++) data[p*4+k]=bg+gl+v*(color[k]-bg)+nz; data[p*4+3]=255; }
  return {w,h,ctx:{getImageData:(x,y,ww,hh)=>{ const d=new Uint8ClampedArray(ww*hh*4); for(let j=0;j<hh;j++) for(let i=0;i<ww;i++){ const sx=x+i, sy=y+j; if(sx<0||sy<0||sx>=w||sy>=h) continue; for(let k=0;k<4;k++) d[(j*ww+i)*4+k]=data[(sy*w+sx)*4+k]; } return {data:d}; }}};
}
let pass=0, fail=0; const fails=[];
const times=['7:36','0:08','8:00','4:59','1:11','2:20','3:45','5:17','6:02','9:39','07:36','10:05','00:00'];
const styles=[ {name:'solid LED', o:{}}, {name:'dot-matrix (YouTube timer)', o:{style:'dots'}}, {name:'slanted', o:{slant:0.12}}, {name:'dots+slant', o:{style:'dots',slant:0.1}},
  {name:'blurry camera', o:{blur:2,noise:30}}, {name:'small & noisy', o:{H:48,noise:25,margin:12}}, {name:'amber on grey', o:{color:[255,170,20],bg:60}}, {name:'loose box', o:{margin:70}},
  {name:'ghost segments (unlit bars faintly visible)', o:{ghost:0.35}}, {name:'ghost + overexposed pink digits', o:{ghost:0.45,color:[255,190,180],bg:25,blur:1,noise:15}},
  {name:'ghost + glare across screen', o:{ghost:0.3,glare:70,noise:15}}, {name:'dots + ghost', o:{style:'dots',ghost:0.3}} ];
for(const st of styles){ let ok=0;
  for(const t of times){ const r=render(t, st.o); const count=t.replace(':','').length;
    const res=c.readClockDigits(r.ctx, {x:0,y:0,w:r.w,h:r.h}, count);
    const got=res ? res.digits.map(d=>d===null?'x':d).join('') : 'null'; const want=t.replace(':','');
    if(got===want) ok++; else fails.push(`${st.name} ${t} -> ${got}`); }
  const allOk = ok===times.length; allOk?pass++:fail++; console.log(`${allOk?'PASS':'FAIL'} ${st.name}: ${ok}/${times.length}`); }
if(fails.length) console.log(fails.slice(0,20).join('\n'));
console.log(`\n${pass} passed, ${fail} failed`);
