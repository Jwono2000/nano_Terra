const C=require('./00_core.js'), PL=require('./02_planner.js'), PR=require('./03_probe.js'), EN=require('./04_engine.js');
const seed=5131;
const rng=C.makeRNG(seed^0x9e3779b9);
const plan=new PL.PathPlanner().plan(seed,{score:70,norm:0.47,dnaLen:3});
const em=new PL.Emitter(rng,plan.biome);
const build=pl=>{const els=em.elements(pl);const r=PL.Assembler.build(pl,els);return {grid:r.grid,elements:els,protect:r.protect};};
let b=build(plan);
for(let round=0;round<3;round++){
  const issues=PR.probeAll(b.grid,plan);
  console.log(`round${round} slabY=${JSON.stringify(plan.slabs.map(s=>s.y))} issues=${JSON.stringify(issues.map(i=>(i.skill||i.scope)+':'+i.code+':'+JSON.stringify(i.info.drop!=null?i.info.drop:(i.info.th!=null?i.info.th:''))))}`);
  if(!issues.length)break;
  const r=PR.patchPlan(plan,issues,18);
  console.log('   applied',r.applied);
  b=build(plan);
}
console.log('final slabs',JSON.stringify(plan.slabs.map(s=>({x0:s.x0,x1:s.x1,y:s.y,role:s.role}))));
