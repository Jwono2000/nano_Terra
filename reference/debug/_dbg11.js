const C=require('./00_core.js'), PL=require('./02_planner.js');
const seed=5000;
const rng=C.makeRNG(seed^0x9e3779b9);
const plan=new PL.PathPlanner().plan(seed,{score:70,norm:0.47,dnaLen:3});
const em=new PL.Emitter(rng,plan.biome);
const els=em.elements(plan);
const slabEls=els.filter(e=>e._role==='slab');
console.log('slab els:',JSON.stringify(slabEls.map(e=>({x:e.x,y:e.y,w:e.w,h:e.h,prof:e.profile}))));
const g=new C.Grid(800,450); const raz=new C.Rasterizer(g);
raz.rasterizeAll(els.filter(e=>!e.deco));
const col=(grid,x,a,b)=>{let s='';for(let y=a;y<=b;y++)s+=(grid.get(x,y)||'.');return s;};
console.log('after A col100:',col(g,100,76,102));
const protect=new Set(); for(const s of plan.slabs){protect.add(s.y);protect.add(s.y+1);protect.add(s.y+2);}
console.log('protect rows:',[...protect].sort((a,b)=>a-b).join(','));
const excl=[]; for(const w of plan.walls)excl.push([w.x-1,w.x+w.w]); for(const st of plan.steps)excl.push([st.x-1,st.x+st.w]); for(const pl of plan.plugs)excl.push([pl.x-1,pl.x+pl.w]);
console.log('excl:',JSON.stringify(excl));
for(const s of plan.slabs){const le=excl.filter(r=>!(r[1]<s.x0||r[0]>s.x1)); raz.flattenWalkway(s.x0,s.x1,s.y,16,5,protect,le);}
console.log('after flatten col100:',col(g,100,76,102));
console.log('slabs:',JSON.stringify(plan.slabs.map(s=>({x0:s.x0,x1:s.x1,y:s.y,th:s.th}))));
