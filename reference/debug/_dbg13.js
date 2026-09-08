const C=require('./00_core.js'), PL=require('./02_planner.js'), PR=require('./03_probe.js'), EN=require('./04_engine.js');
const seed=parseInt(process.argv[2]||'5131',10);
const rng=C.makeRNG(seed^0x9e3779b9);
const plan=new PL.PathPlanner().plan(seed,{score:70,norm:0.47,dnaLen:3});
const em=new PL.Emitter(rng,plan.biome);
const build=pl=>{const els=em.elements(pl);const r=PL.Assembler.build(pl,els);return {grid:r.grid,elements:els,protect:r.protect};};
let b=build(plan);
const patcher=new EN.Patcher(); patcher.patchProbes(plan,build,3); b=build(plan);
console.log('patch log:',JSON.stringify(patcher.log.map(l=>(l.skill||l.scope)+':'+l.code)));
console.log('slabs',JSON.stringify(plan.slabs.map(s=>({id:s.id,x0:s.x0,x1:s.x1,y:s.y,th:s.th,role:s.role}))));
console.log('trans',JSON.stringify(plan.transitions.map(t=>({k:t.kind,x:t.x,from:t.fromSlab,to:t.toSlab,p:t.params}))));
console.log('trig',JSON.stringify(plan.triggers));
const tr=plan.transitions.find(t=>t.kind==='LETHAL_DROP');
if(tr){ const land=plan.slabs[tr.toSlab];
  console.log('column at exitX', tr.params.takeoffX+3);
  for(let y=70;y<=Math.min(449,land.y+30);y+=4){ let row=''; for(let x=(tr.params.takeoffX-8);x<=(tr.params.takeoffX+16);x++) row+=(b.grid.get(x,y)||'.'); console.log(String(y).padStart(4),row); }
  console.log('probeFloat',JSON.stringify(PR.PROBES.probeFloat(new PR.Prober(b.grid),plan,tr)));
  console.log('issues',JSON.stringify(PR.probeAll(b.grid,plan).map(i=>(i.skill||i.scope)+':'+i.code)));
}
