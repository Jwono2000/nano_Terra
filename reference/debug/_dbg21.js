const C=require('./00_core.js'), PL=require('./02_planner.js'), PR=require('./03_probe.js'), EN=require('./04_engine.js'), WK=require('./01_walker.js');
const seed=parseInt(process.argv[2]||'5001',10);
const rng=C.makeRNG(seed^0x9e3779b9);
const plan=new PL.PathPlanner().plan(seed,{score:70,norm:0.47,dnaLen:3});
const em=new PL.Emitter(rng,plan.biome);
const build=pl=>{const els=em.elements(pl);const r=PL.Assembler.build(pl,els);return {grid:r.grid,elements:els,protect:r.protect};};
let b=build(plan); const patcher=new EN.Patcher(); patcher.patchProbes(plan,build,3); b=build(plan);
console.log('slabs',JSON.stringify(plan.slabs.map(s=>[s.id,s.x0,s.x1,s.y,s.th])));
console.log('trans',JSON.stringify(plan.transitions.map(t=>[t.kind,t.x,t.fromSlab,t.toSlab,t.params])));
console.log('trig',JSON.stringify(plan.triggers.map(t=>[t.skill,t.x,t.y,t.dir])));
console.log('plugs',JSON.stringify(plan.plugs.map(p=>[p.x,p.y,p.w,p.h,p.kind||p.elType])));
console.log('walls',JSON.stringify(plan.walls.map(w=>[w.x,w.y,w.w,w.h,w.role,w.kind])));
// 원본 use() 가로채기
const g=b.grid;
const sim=new WK.Sim(g,{});
const W=800;
// 트리거 근처 그리드 열 덤프
for(const t of plan.triggers){
  if(t.skill!=='BASH') continue;
  console.log(`--- BASH trigger x=${t.x} y=${t.y} dir=${t.dir} ---`);
  for(let j=t.y-14;j<=t.y+6;j++){
    let row=''; for(let i=t.x-6;i<=t.x+22;i++) row+=C.TN(g.get(i,j));
    console.log(String(j).padStart(3),row);
  }
}
