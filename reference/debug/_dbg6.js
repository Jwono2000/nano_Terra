const C=require('./00_core.js'), PL=require('./02_planner.js'), EN=require('./04_engine.js'), WK=require('./01_walker.js');
const seed=5000;
const rng=C.makeRNG(seed^0x9e3779b9);
const plan=new PL.PathPlanner().plan(seed,{score:70,norm:0.47,dnaLen:3});
const em=new PL.Emitter(rng,plan.biome);
const build=pl=>{const els=em.elements(pl);const r=PL.Assembler.build(pl,els);return {grid:r.grid,elements:els,protect:r.protect};};
let b=build(plan);
new EN.Patcher().patchProbes(plan,build,3); b=build(plan);
const g=b.grid.clone();
const sim=new WK.Sim(g,{gate:plan.gate,gateR:15,budget:{climb:4,float:4,bash:4,mine:4,drill:4,bomb:2,build:6,block:3,portal:2},triggers:plan.triggers.map(t=>({...t,used:false})),portals:plan.portals||null,protect:b.protect,maxAge:1200});
const w=sim.spawn(plan.spawn.x,plan.spawn.y,1,0,0,plan.triggers.map(t=>({...t,used:false})));
w.autoClimb=true;
for(let f=0;f<1200;f++){ sim.frame=f; w.step();
  if(w.state==='CLIMB'||w.skill==='climb'){ if(f%4===0||w.climbTop!=null&&f<1500) console.log('f',f,'state',w.state,'y',w.y.toFixed(1),'x',w.x.toFixed(1),'climbTop',w.climbTop,'skillT',w.skillT); }
  if(!w.alive||w.saved){console.log('END f',f,w.alive?'SAVED':'DEAD '+w.deathReason, Math.round(w.x), Math.round(w.y)); break;} }
console.log('final',w.state,Math.round(w.x),Math.round(w.y),w.usedSkills);
