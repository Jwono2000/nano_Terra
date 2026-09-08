const C=require('./00_core.js'), PL=require('./02_planner.js'), PR=require('./03_probe.js'), EN=require('./04_engine.js');
const N=parseInt(process.argv[2]||'30',10), score=parseInt(process.argv[3]||'70',10);
const planner=new PL.PathPlanner(), validator=new EN.Validator({units:5});
const tally={death:{},missed:{},kind:{},probe:{},patched:0,unplaced:0,tier2fail:{}};
let okc=0; const times=[];
for(let i=0;i<N;i++){
  const seed=5000+i*131; const t0=process.hrtime.bigint();
  const rng=C.makeRNG(seed^0x9e3779b9);
  const budget=EN.DifficultyScorer.budgetFor(score,rng);
  const plan=planner.plan(seed,{score,norm:budget.norm,dnaLen:budget.dnaLen,repeatChance:0.2});
  if(plan.unplaced) tally.unplaced++;
  const em=new PL.Emitter(rng,plan.biome);
  const build=(pl)=>{const els=em.elements(pl); const r=PL.Assembler.build(pl,els); return {grid:r.grid,elements:els};};
  let built=build(plan);
  const patcher=new EN.Patcher();
  patcher.patchProbes(plan,build,3);
  built=build(plan);
  tally.patched+=patcher.log.length;
  const issues=PR.probeAll(built.grid,plan);
  for(const iss of issues) tally.tier2fail[(iss.skill||iss.scope)+':'+iss.code]=(tally.tier2fail[(iss.skill||iss.scope)+':'+iss.code]||0)+1;
  const sc=EN.DifficultyScorer.score(plan,built.grid,{});
  const map=EN.MapAssembler.assemble(plan,built.elements,sc,{rng,stageNo:11+i});
  const v=validator.validate(built.grid,plan,map,false);
  for(const t of plan.transitions) tally.kind[t.kind]=(tally.kind[t.kind]||0)+1;
  times.push(Number(process.hrtime.bigint()-t0)/1e6);
  if(v.ok){okc++;continue;}
  const d=v.probeFail||{};
  tally.death[d.reason||'NO_SAVE']=(tally.death[d.reason||'NO_SAVE']||0)+1;
  for(const m of ((v.diag&&v.diag.missed)||[])) tally.missed[m.skill+':'+m.state]=(tally.missed[m.skill+':'+m.state]||0)+1;
}
times.sort((a,b)=>a-b);
console.log(`tier3a pass ${okc}/${N}  unplaced ${tally.unplaced}  patches ${tally.patched}  t p50 ${times[times.length>>1].toFixed(1)}ms max ${times[times.length-1].toFixed(1)}ms`);
console.log('fail reasons:',JSON.stringify(tally.death));
console.log('missed triggers:',JSON.stringify(tally.missed));
console.log('residual tier2 issues:',JSON.stringify(tally.tier2fail));
console.log('kinds:',JSON.stringify(tally.kind));
