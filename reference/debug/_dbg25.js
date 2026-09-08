const C=require('./00_core.js'), PL=require('./02_planner.js'), PR=require('./03_probe.js'), EN=require('./04_engine.js');
const seed=parseInt(process.argv[2]||'5262',10);
const rng=C.makeRNG(seed^0x9e3779b9);
const plan=new PL.PathPlanner().plan(seed,{score:70,norm:0.47,dnaLen:3});
const em=new PL.Emitter(rng,plan.biome);
const build=pl=>{const els=em.elements(pl);const r=PL.Assembler.build(pl,els);return {grid:r.grid,elements:els,protect:r.protect};};
let b=build(plan); new EN.Patcher().patchProbes(plan,build,3); b=build(plan);
const pr=new PR.Prober(b.grid);
const tr=plan.transitions.find(t=>t.kind==='WALL_CLIMB');
const {wallX,wallT}=tr.params;
const launch=PR.refSlab(plan,tr.fromSlab,wallX-6);
const cs=PR.clearSpot?PR.clearSpot(plan,launch,wallX-8):wallX-8;
const footY=pr.floorOfSlab(launch,cs);
const h=pr.wallHeight(wallX+1,footY);
console.log('wallX',wallX,'launch',JSON.stringify([launch.x0,launch.x1,launch.y]),'clearSpot',cs,'footY',footY,'h',h,'topY',footY-h);
console.log('probeClimb',JSON.stringify(PR.PROBES.probeClimb(pr,plan,tr)));
for(let j=footY-3;j>footY-h+2;j-=3){ console.log('j',j,'solid(wallX-3=',wallX-3,')=',pr.g.solid(wallX-3,j),'val',b.grid.get(wallX-3,j)); }
