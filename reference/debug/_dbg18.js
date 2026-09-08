const C=require('./00_core.js'), PL=require('./02_planner.js'), PR=require('./03_probe.js');
function mk(seed){
  const rng=C.makeRNG(seed^0x9e3779b9);
  const plan=new PL.PathPlanner().plan(seed,{score:70,norm:0.47,dnaLen:3});
  const em=new PL.Emitter(rng,plan.biome);
  const build=pl=>{const els=em.elements(pl);const r=PL.Assembler.build(pl,els);return {grid:r.grid,elements:els,protect:r.protect};};
  return {plan,build,rng};
}
const B=mk(5131);
const r1=B.build(B.plan); const els1=r1.elements.map(e=>JSON.stringify(e));
const snap1=JSON.stringify({slabs:B.plan.slabs.map(s=>[s.x0,s.x1,s.y,s.th]),walls:B.plan.walls,roofs:B.plan.roofs,steps:B.plan.steps,plugs:B.plan.plugs,trig:B.plan.triggers,trans:B.plan.transitions.map(t=>[t.kind,t.x,t.y,t.fromSlab,t.toSlab,t.params])});
const g1=Buffer.from(r1.grid.cells);
const r2=B.build(B.plan); const els2=r2.elements.map(e=>JSON.stringify(e));
const snap2=JSON.stringify({slabs:B.plan.slabs.map(s=>[s.x0,s.x1,s.y,s.th]),walls:B.plan.walls,roofs:B.plan.roofs,steps:B.plan.steps,plugs:B.plan.plugs,trig:B.plan.triggers,trans:B.plan.transitions.map(t=>[t.kind,t.x,t.y,t.fromSlab,t.toSlab,t.params])});
console.log('plan snapshot identical?', snap1===snap2);
if(snap1!==snap2){ const a=JSON.parse(snap1),b=JSON.parse(snap2); for(const k of Object.keys(a)) if(JSON.stringify(a[k])!==JSON.stringify(b[k])) console.log('DIFF in',k,'\n  1:',JSON.stringify(a[k]),'\n  2:',JSON.stringify(b[k])); }
let diff=0, first=[]; for(let i=0;i<g1.length;i++) if(g1[i]!==r2.grid.cells[i]){diff++; if(first.length<12) first.push([i%800, Math.floor(i/800), g1[i], r2.grid.cells[i]]);}
console.log('grid diff cells',diff, JSON.stringify(first));
console.log('elements identical?', els1.join('|')===els2.join('|'));
if(els1.join('|')!==els2.join('|')){ for(let i=0;i<Math.max(els1.length,els2.length);i++) if(els1[i]!==els2[i]) console.log('EL DIFF',i,'\n 1:',els1[i],'\n 2:',els2[i]); }
