const C=require('./00_core.js'), PL=require('./02_planner.js'), EN=require('./04_engine.js'), WK=require('./01_walker.js');
const seed=parseInt(process.argv[2]||'5262',10);
const rng=C.makeRNG(seed^0x9e3779b9);
const plan=new PL.PathPlanner().plan(seed,{score:70,norm:0.47,dnaLen:3});
const em=new PL.Emitter(rng,plan.biome);
const build=pl=>{const els=em.elements(pl);const r=PL.Assembler.build(pl,els);return {grid:r.grid,elements:els,protect:r.protect};};
let b=build(plan); new EN.Patcher().patchProbes(plan,build,3); b=build(plan);
const sc=EN.DifficultyScorer.score(plan,b.grid,{});
const map=EN.MapAssembler.assemble(plan,b.elements,sc,{rng,stageNo:11});
console.log('spawn',JSON.stringify(plan.spawn),'slabs',JSON.stringify(plan.slabs.map(s=>[s.x0,s.x1,s.y])));
console.log('trig',JSON.stringify(plan.triggers.map(t=>t.skill+'@'+t.x+','+t.y)));
const sim=new WK.Sim(b.grid.clone(),{gate:plan.gate,gateR:15,budget:{...map.skills},triggers:plan.triggers.map(t=>({...t,used:false})),portals:plan.portals||null,protect:b.protect,maxAge:900});
const w=sim.spawn(plan.spawn.x,plan.spawn.y,1,0,0,plan.triggers.map(t=>({...t,used:false})));
let px=w.x, py=w.y;
for(let f=0;f<900;f++){ sim.frame=f; w.step();
  if(Math.abs(w.x-px)>4||Math.abs(w.y-py)>4||f%20===0) console.log(`f${f} (${w.x.toFixed(1)},${w.y.toFixed(1)}) state=${w.state} skill=${w.skill} dir=${w.dir} build=${w.buildCount}`);
  px=w.x; py=w.y;
  if(!w.alive||w.saved){console.log('END',w.saved?'SAVED':'DEAD '+w.deathReason,w.x.toFixed(1),w.y.toFixed(1),'used',JSON.stringify(w.usedSkills));break;} }
console.log('skills budget',JSON.stringify(map.skills));
