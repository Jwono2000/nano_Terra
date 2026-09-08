const C=require('./00_core.js'), PL=require('./02_planner.js'), EN=require('./04_engine.js'), WK=require('./01_walker.js');
const seed=parseInt(process.argv[2]||'5131',10);
const rng=C.makeRNG(seed^0x9e3779b9);
const plan=new PL.PathPlanner().plan(seed,{score:70,norm:0.47,dnaLen:3});
const em=new PL.Emitter(rng,plan.biome);
const build=pl=>{const els=em.elements(pl);const r=PL.Assembler.build(pl,els);return {grid:r.grid,elements:els,protect:r.protect};};
let b=build(plan); new EN.Patcher().patchProbes(plan,build,3); b=build(plan);
const sc=EN.DifficultyScorer.score(plan,b.grid,{});
const map=EN.MapAssembler.assemble(plan,b.elements,sc,{rng,stageNo:11});
console.log('skills',JSON.stringify(map.skills),'spawn',JSON.stringify(plan.spawn),'gate',JSON.stringify(plan.gate));
console.log('slabs',JSON.stringify(plan.slabs.map(s=>({id:s.id,x0:s.x0,x1:s.x1,y:s.y,role:s.role}))));
console.log('trans',JSON.stringify(plan.transitions.map(t=>({k:t.kind,s:t.skill,x:t.x,y:t.y}))));
console.log('trig',JSON.stringify(plan.triggers));
const g=b.grid.clone();
const sim=new WK.Sim(g,{gate:plan.gate,gateR:15,budget:{...map.skills},triggers:plan.triggers.map(t=>({...t,used:false})),portals:plan.portals||null,protect:b.protect,maxAge:900});
const w=sim.spawn(plan.spawn.x,plan.spawn.y,1,0,0,plan.triggers.map(t=>({...t,used:false})));
w.autoClimb=true;
let last='';
for(let f=0;f<900;f++){ sim.frame=f; const before=w.x; w.step();
  const sig=w.state+'|'+w.skill;
  if(sig!==last||f%25===0){ console.log(`f${f} st=${w.state} sk=${w.skill} x=${w.x.toFixed(1)} y=${w.y.toFixed(1)} dir=${w.dir} vy=${w.vy.toFixed(2)} fallStart=${w.fallStart} alive=${w.alive}`); last=sig; }
  if(!w.alive||w.saved){console.log('END',w.saved?'SAVED':'DEAD '+w.deathReason, w.x.toFixed(1), w.y.toFixed(1), 'used',JSON.stringify(w.usedSkills), 'log', JSON.stringify(w.log)); break;} }
