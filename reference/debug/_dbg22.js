const C=require('./00_core.js'), PL=require('./02_planner.js'), PR=require('./03_probe.js'), EN=require('./04_engine.js'), WK=require('./01_walker.js');
const seed=parseInt(process.argv[2]||'5131',10);
const rng=C.makeRNG(seed^0x9e3779b9);
const plan=new PL.PathPlanner().plan(seed,{score:70,norm:0.47,dnaLen:3});
const em=new PL.Emitter(rng,plan.biome);
const build=pl=>{const els=em.elements(pl);const r=PL.Assembler.build(pl,els);return {grid:r.grid,elements:els,protect:r.protect};};
let b=build(plan); const patcher=new EN.Patcher(); patcher.patchProbes(plan,build,3); b=build(plan);
const g=b.grid, TN=v=>'.#SX'[v]||'?';
console.log('slabs',JSON.stringify(plan.slabs.map(s=>[s.id,s.x0,s.x1,s.y,s.th,s.role])));
console.log('trans',JSON.stringify(plan.transitions.map(t=>[t.kind,t.x,t.params])));
console.log('trig',JSON.stringify(plan.triggers.map(t=>[t.skill,t.x,t.y,t.dir])));
console.log('walls',JSON.stringify(plan.walls.map(w=>[w.x,w.y,w.w,w.h,w.kind,w.role])));
console.log('els',JSON.stringify(b.elements.filter(e=>!e.deco).map(e=>[e.type,e.x,e.y,e.w,e.h,e.palette,e._role])));
const xs=process.argv[3]?process.argv[3].split(',').map(Number):[297];
for(const cx of xs){
  console.log(`--- column x=${cx} ---`);
  for(let j=60;j<=300;j++){ let row=''; for(let i=cx-10;i<=cx+14;i++) row+=TN(g.get(i,j)); console.log(String(j).padStart(3),row); }
}
// 스폰 덱 좌변 확인
console.log('spawn deck row at slab0.y:');
{const s0=plan.slabs[0]; let row=''; for(let i=0;i<=40;i++) row+=TN(g.get(i,s0.y)); console.log('y='+s0.y,row);}
