const C=require('./00_core.js'), PL=require('./02_planner.js'), PR=require('./03_probe.js'), EN=require('./04_engine.js');
const seed=parseInt(process.argv[2]||'5000',10);
const rng=C.makeRNG(seed^0x9e3779b9);
const plan=new PL.PathPlanner().plan(seed,{score:70,norm:0.47,dnaLen:3});
const em=new PL.Emitter(rng,plan.biome);
const build=pl=>{const els=em.elements(pl);const r=PL.Assembler.build(pl,els);return {grid:r.grid,elements:els,protect:r.protect};};
let b=build(plan);
console.log('ROOFS(plan)',JSON.stringify(plan.roofs.map(r=>({x:r.x,y:r.y,w:r.w,h:r.h,role:r.role}))));
console.log('roof elements',JSON.stringify(b.elements.filter(e=>e._role==='roof')));
const tr=plan.transitions.find(t=>t.kind==='LOW_CEILING');
if(tr){const {ceilX,ceilW}=tr.params; const s=plan.slabs[tr.fromSlab];
console.log('slab y',s.y,'ceilX',ceilX,'ceilW',ceilW);
for(let y=s.y-30;y<=s.y+2;y++){let row='';for(let x=ceilX-14;x<=ceilX+ceilW+8;x++)row+=(b.grid.get(x,y)||'.');console.log(String(y).padStart(4),row);}
const pr=new PR.Prober(b.grid);
console.log('probeMine',JSON.stringify(PR.PROBES.probeMine(pr,plan,tr)));
}
const td=plan.transitions.find(t=>t.kind==='FLOOR_HOLE');
if(td){const s=plan.slabs[td.fromSlab];
console.log('FLOOR_HOLE slab',JSON.stringify({x0:s.x0,x1:s.x1,y:s.y,th:s.th,void:s.voidBelow}),'holeX',td.params.holeX);
for(let y=s.y-2;y<=s.y+s.th+6;y++){let row='';for(let x=td.params.holeX-8;x<=td.params.holeX+26;x++)row+=(b.grid.get(x,y)||'.');console.log(String(y).padStart(4),row);}
const pr=new PR.Prober(b.grid);
console.log('probeDrill',JSON.stringify(PR.PROBES.probeDrill(pr,plan,td)));
}
