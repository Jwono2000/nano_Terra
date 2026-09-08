const C=require('./00_core.js'), PL=require('./02_planner.js');
const seed=5000;
const rng=C.makeRNG(seed^0x9e3779b9);
const plan=new PL.PathPlanner().plan(seed,{score:70,norm:0.47,dnaLen:3});
const em=new PL.Emitter(rng,plan.biome);
const els=em.elements(plan);
console.log('slab0 el:',JSON.stringify(els.filter(e=>e._role==='slab')[0]));
console.log('slab0 plan:',JSON.stringify({x0:plan.slabs[0].x0,x1:plan.slabs[0].x1,y:plan.slabs[0].y,th:plan.slabs[0].th}));
const {grid}=PL.Assembler.build(plan,els);
const col=(x)=>{let s='';for(let y=76;y<=102;y++)s+=(grid.get(x,y)||'.');return s;};
console.log('col 100:',col(100));
console.log('col 200:',col(200));
console.log('col 300:',col(300));
// 직접 래스터 테스트
const g2=new C.Grid(800,450); const r2=new C.Rasterizer(g2);
r2.rasterize(els.filter(e=>e._role==='slab')[0]);
console.log('col 100 (fresh):',(function(x){let s='';for(let y=76;y<=102;y++)s+=(g2.get(x,y)||'.');return s;})(100));
