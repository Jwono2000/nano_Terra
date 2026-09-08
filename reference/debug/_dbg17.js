const C=require('./00_core.js'), PL=require('./02_planner.js'), PR=require('./03_probe.js'), EN=require('./04_engine.js');
function mk(seed){
  const rng=C.makeRNG(seed^0x9e3779b9);
  const plan=new PL.PathPlanner().plan(seed,{score:70,norm:0.47,dnaLen:3});
  const em=new PL.Emitter(rng,plan.biome);
  const build=pl=>{const els=em.elements(pl);const r=PL.Assembler.build(pl,els);return {grid:r.grid,elements:els,protect:r.protect};};
  return {plan,build,rng};
}
// path 1: build once then probe
const A=mk(5131); let bA=A.build(A.plan);
console.log('P1 issues:',PR.probeAll(bA.grid,A.plan).map(i=>(i.skill||i.scope)+':'+i.code));
// path 2: build twice then probe (em.elements called twice)
const B=mk(5131); B.build(B.plan); const bB2=B.build(B.plan);
console.log('P2 issues:',PR.probeAll(bB2.grid,B.plan).map(i=>(i.skill||i.scope)+':'+i.code));
console.log('P2 slabs:',JSON.stringify(B.plan.slabs.map(s=>[s.x0,s.x1,s.y,s.th])));
console.log('P1 slabs:',JSON.stringify(A.plan.slabs.map(s=>[s.x0,s.x1,s.y,s.th])));
console.log('P2 walls:',JSON.stringify(B.plan.walls.map(w=>[w.x,w.y,w.w,w.h])));
