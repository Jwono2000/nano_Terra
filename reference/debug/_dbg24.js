const C=require('./00_core.js'), PL=require('./02_planner.js'), EN=require('./04_engine.js');
const seed=parseInt(process.argv[2]||'5262',10);
const rng=C.makeRNG(seed^0x9e3779b9);
const plan=new PL.PathPlanner().plan(seed,{score:70,norm:0.47,dnaLen:3});
console.log('slabs',JSON.stringify(plan.slabs.map(s=>[s.id,s.x0,s.x1,s.y,s.th,s.role])));
console.log('trans',JSON.stringify(plan.transitions.map(t=>({k:t.kind,x:t.x,y:t.y,from:t.fromSlab,to:t.toSlab,p:t.params}))));
console.log('trig',JSON.stringify(plan.triggers.map(t=>[t.skill,t.x,t.y,t.dir])));
console.log('walls',JSON.stringify(plan.walls.map(w=>[w.x,w.y,w.w,w.h,w.kind,w.role])));
console.log('steps',JSON.stringify(plan.steps.map(t=>[t.x,t.y,t.w,t.h,t.kind])));
// --- after patch ---
const em=new PL.Emitter(rng,plan.biome);
const build=pl=>{const els=em.elements(pl);const r=PL.Assembler.build(pl,els);return {grid:r.grid,elements:els,protect:r.protect};};
let b=build(plan); const pa=new EN.Patcher(); pa.patchProbes(plan,build,3); b=build(plan);
console.log('PATCHLOG',JSON.stringify(pa.log.map(l=>(l.skill||l.scope||l.type)+':'+l.code)));
console.log('A slabs',JSON.stringify(plan.slabs.map(s=>[s.id,s.x0,s.x1,s.y,s.th])));
console.log('A trig',JSON.stringify(plan.triggers.map(t=>[t.skill,t.x,t.y,t.dir])));
console.log('A trans',JSON.stringify(plan.transitions.map(t=>({k:t.kind,x:t.x,y:t.y,from:t.fromSlab,to:t.toSlab}))));
