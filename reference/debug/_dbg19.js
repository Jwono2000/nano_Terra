const C=require('./00_core.js'), PL=require('./02_planner.js'), PR=require('./03_probe.js');
const seed=5131;
const rng=C.makeRNG(seed^0x9e3779b9);
const plan=new PL.PathPlanner().plan(seed,{score:70,norm:0.47,dnaLen:3});
const em=new PL.Emitter(rng,plan.biome);
const build=pl=>{const els=em.elements(pl);const r=PL.Assembler.build(pl,els);return {grid:r.grid,elements:els,protect:r.protect};};
const r1=build(plan); const g1=r1.grid.clone();
const tr=plan.transitions.find(t=>t.kind==='LETHAL_DROP');
const land=plan.slabs[tr.toSlab];
const pr1=new PR.Prober(g1);
console.log('build1 takeY',pr1.floorAt(tr.params.takeoffX,0),'landY',pr1.floorAt((land.x0+land.x1)/2,0),'probe',JSON.stringify(PR.PROBES.probeFloat(pr1,plan,tr)));
const r2=build(plan); const pr2=new PR.Prober(r2.grid);
console.log('build2 takeY',pr2.floorAt(tr.params.takeoffX,0),'landY',pr2.floorAt((land.x0+land.x1)/2,0),'probe',JSON.stringify(PR.PROBES.probeFloat(pr2,plan,tr)));
console.log('land slab', JSON.stringify({x0:land.x0,x1:land.x1,y:land.y,th:land.th}));
let d=0,first=[];for(let i=0;i<g1.cells.length;i++)if(g1.cells[i]!==r2.grid.cells[i]){d++;if(first.length<10)first.push([i%800,Math.floor(i/800),g1.cells[i],r2.grid.cells[i]]);}
console.log('diff',d,JSON.stringify(first));
console.log('deco1',JSON.stringify(r1.elements.filter(e=>e.deco).map(e=>[e.type,e.x,e.y,e.w,e.h])));
console.log('deco2',JSON.stringify(r2.elements.filter(e=>e.deco).map(e=>[e.type,e.x,e.y,e.w,e.h])));
