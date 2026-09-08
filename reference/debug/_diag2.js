const C=require('./00_core.js'), PL=require('./02_planner.js'), PR=require('./03_probe.js'), EN=require('./04_engine.js'), WK=require('./01_walker.js');
const N=parseInt(process.argv[2]||'12',10), score=parseInt(process.argv[3]||'70',10);
for(let i=0;i<N;i++){
  const seed=5000+i*131;
  const rng=C.makeRNG(seed^0x9e3779b9);
  const plan=new PL.PathPlanner().plan(seed,{score,norm:0.47,dnaLen:3});
  const em=new PL.Emitter(rng,plan.biome);
  const build=pl=>{const els=em.elements(pl);const r=PL.Assembler.build(pl,els);return {grid:r.grid,elements:els,protect:r.protect};};
  let b=build(plan); const patcher=new EN.Patcher(); patcher.patchProbes(plan,build,3); b=build(plan);
  const sc=EN.DifficultyScorer.score(plan,b.grid,{});
  const map=EN.MapAssembler.assemble(plan,b.elements,sc,{rng,stageNo:11+i});
  const v=new EN.Validator({units:5}).validate(b.grid,plan,map,false,b.protect);
  const tr=(v.diag&&v.diag.trace)||[];
  const last=tr[tr.length-1]||{};
  const kinds=plan.transitions.map(t=>t.kind).join(',');
  const fail=v.probeFail||{};
  // 실패 지점 근처 transition 찾기
  let near='';
  for(const t of plan.transitions){ if(Math.abs(t.x-(fail.x||0))<70) near+=t.kind+'@'+t.x+' '; }
  console.log(`#${i} ${v.ok?'OK  ':'FAIL'} ${fail.reason||'-'} at (${fail.x},${fail.y}) lastState=${last.s}@(${last.x},${last.y}) near=[${near.trim()}]`);
  console.log(`    kinds: ${kinds}`);
  console.log(`    trig: ${JSON.stringify(plan.triggers.map(t=>t.skill[0]+t.x))} missed=${JSON.stringify((v.diag&&v.diag.missed||[]).slice(0,3).map(m=>m.skill+':'+m.state+'@'+m.wx))}`);
  console.log(`    trace: ${JSON.stringify(tr.slice(-8).map(t=>t.s+'@'+t.x+','+t.y))}`);
}
