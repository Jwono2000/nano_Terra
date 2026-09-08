const C=require('./00_core.js'), PL=require('./02_planner.js'), PR=require('./03_probe.js'), EN=require('./04_engine.js');
function mk(seed){
  const rng=C.makeRNG(seed^0x9e3779b9);
  const plan=new PL.PathPlanner().plan(seed,{score:70,norm:0.47,dnaLen:3});
  const em=new PL.Emitter(rng,plan.biome);
  const build=pl=>{const els=em.elements(pl);const r=PL.Assembler.build(pl,els);return {grid:r.grid,elements:els,protect:r.protect};};
  return {plan,build,rng};
}
const A=mk(5131); const bA=A.build(A.plan);
console.log('A issues',PR.probeAll(bA.grid,A.plan).map(i=>(i.skill||i.scope)+':'+i.code));
const B=mk(5131); const bB=B.build(B.plan);
console.log('B issues',PR.probeAll(bB.grid,B.plan).map(i=>(i.skill||i.scope)+':'+i.code));
console.log('same slabs?',JSON.stringify(A.plan.slabs.map(s=>[s.x0,s.x1,s.y]))===JSON.stringify(B.plan.slabs.map(s=>[s.x0,s.x1,s.y])));
console.log('A slabs',JSON.stringify(A.plan.slabs.map(s=>[s.x0,s.x1,s.y])));
console.log('B slabs',JSON.stringify(B.plan.slabs.map(s=>[s.x0,s.x1,s.y])));
console.log('A walls',JSON.stringify(A.plan.walls.map(w=>[w.x,w.y,w.w,w.h,w.role])));
console.log('B walls',JSON.stringify(B.plan.walls.map(w=>[w.x,w.y,w.w,w.h,w.role])));
console.log('A deco n',A.plan.deco.length,'B deco n',B.plan.deco.length);
let diff=0; for(let i=0;i<bA.grid.cells.length;i++) if(bA.grid.cells[i]!==bB.grid.cells[i]) diff++;
console.log('grid cell diff count',diff);
