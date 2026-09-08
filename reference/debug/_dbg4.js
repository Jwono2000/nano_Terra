const C=require('./00_core.js'), PL=require('./02_planner.js'), PR=require('./03_probe.js'), EN=require('./04_engine.js'), WK=require('./01_walker.js');
const seed=parseInt(process.argv[2]||'5000',10);
const rng=C.makeRNG(seed^0x9e3779b9);
const plan=new PL.PathPlanner().plan(seed,{score:70,norm:0.47,dnaLen:3});
const em=new PL.Emitter(rng,plan.biome);
const build=pl=>{const els=em.elements(pl);const r=PL.Assembler.build(pl,els);return {grid:r.grid,elements:els,protect:r.protect};};
let b=build(plan);
const patcher=new EN.Patcher(); patcher.patchProbes(plan,build,3); b=build(plan);
console.log('SLABS'); plan.slabs.forEach(s=>console.log(`  #${s.id} x[${s.x0},${s.x1}] y=${s.y} th=${s.th} role=${s.role} placed=${s.placed} void=${JSON.stringify(s.voidBelow||null)}`));
console.log('WALLS',JSON.stringify(plan.walls.map(w=>({x:w.x,y:w.y,w:w.w,h:w.h,role:w.role,k:w.kind}))));
console.log('ROOFS',JSON.stringify(plan.roofs.map(r=>({x:r.x,y:r.y,w:r.w,h:r.h,role:r.role}))));
console.log('STEPS',JSON.stringify(plan.steps));
console.log('PLUGS',JSON.stringify(plan.plugs));
console.log('TRANS'); plan.transitions.forEach(t=>console.log(`  ${t.kind} skill=${t.skill||t.skills} x=${t.x} y=${t.y} from=${t.fromSlab} to=${t.toSlab} ${JSON.stringify(t.params)}`));
console.log('TRIG',JSON.stringify(plan.triggers));
const issues=PR.probeAll(b.grid,plan);
console.log('ISSUES',JSON.stringify(issues.map(i=>({s:i.skill||i.scope,c:i.code,info:i.info,x:i.tr&&i.tr.x}))));
const sc=EN.DifficultyScorer.score(plan,b.grid,{});
const map=EN.MapAssembler.assemble(plan,b.elements,sc,{rng,stageNo:11});
const v=new EN.Validator({units:5}).validate(b.grid,plan,map,false,b.protect);
console.log('VALIDATE ok=',v.ok,'fail=',JSON.stringify(v.probeFail));
console.log('MISSED',JSON.stringify(v.diag&&v.diag.missed));
console.log('TRACE',JSON.stringify((v.diag&&v.diag.trace||[]).slice(0,24)));
function ascii(grid,plan){const cols=100,rows=34,sx=8,sy=450/rows;const buf=[];
for(let j=0;j<rows;j++){let line='';for(let i=0;i<cols;i++){let solid=0,steel=0,built=0;
for(let y=Math.floor(j*sy);y<Math.floor((j+1)*sy);y++)for(let x=i*sx;x<(i+1)*sx;x++){const v=grid.get(x,y);if(v===2)steel++;else if(v===3)built++;else if(v)solid++;}
line+= steel?'S': built?'B': solid>sx*sy*0.5?'#': solid>2?'+': solid>0?':':'.';}buf.push(line);}
const put=(x,y,ch)=>{const i=Math.floor(x/sx),j=Math.floor(y/sy);if(i>=0&&i<cols&&j>=0&&j<rows)buf[j]=buf[j].slice(0,i)+ch+buf[j].slice(i+1);};
for(const t of plan.triggers)put(t.x,t.y-6,t.skill[0]);put(plan.spawn.x,plan.spawn.y,'@');put(plan.gate.x,plan.gate.y,'G');
return buf.join('\n');}
console.log(ascii(b.grid,plan));
