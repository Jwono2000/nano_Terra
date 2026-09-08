const C=require('./00_core.js'), PL=require('./02_planner.js'), PR=require('./03_probe.js'), EN=require('./04_engine.js');
const seed=parseInt(process.argv[2]||'5131',10);
const rng=C.makeRNG(seed^0x9e3779b9);
const plan=new PL.PathPlanner().plan(seed,{score:70,norm:0.47,dnaLen:3});
const em=new PL.Emitter(rng,plan.biome);
const build=pl=>{const els=em.elements(pl);const r=PL.Assembler.build(pl,els);return {grid:r.grid,elements:els,protect:r.protect};};
let b=build(plan); const patcher=new EN.Patcher(); patcher.patchProbes(plan,build,3); b=build(plan);
const g=b.grid, TN=v=>'.#SX'[v]||'?';
const x0=+process.argv[3]||280, x1=+process.argv[4]||320, y0=+process.argv[5]||180, y1=+process.argv[6]||230;
let hdr='     '; for(let i=x0;i<=x1;i++) hdr+=(i%10); console.log(hdr);
for(let j=y0;j<=y1;j++){ let row=String(j).padStart(4)+' '; for(let i=x0;i<=x1;i++) row+=TN(g.get(i,j)); console.log(row); }
