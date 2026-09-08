const C=require('./00_core.js'), PL=require('./02_planner.js');
const seed=5131;
const rng=C.makeRNG(seed^0x9e3779b9);
const plan=new PL.PathPlanner().plan(seed,{score:70,norm:0.47,dnaLen:3});
console.log(JSON.stringify(plan.slabs.map(s=>({id:s.id,x0:s.x0,x1:s.x1,y:s.y,role:s.role})),null,0));
console.log(JSON.stringify(plan.transitions.map(t=>({k:t.kind,x:t.x,y:t.y,from:t.fromSlab,to:t.toSlab,p:t.params})),null,0));
console.log(JSON.stringify(plan.triggers));
