const C=require('./00_core.js'), PL=require('./02_planner.js'), EN=require('./04_engine.js');
const seed=+process.argv[2]||5001;
const out=EN.generate(seed,{targetScore:70,trials:0,mode:'scripted'});
const plan=out.plan;
console.log('slabs',JSON.stringify(plan.slabs.map(s=>[s.id,s.x0,s.x1,s.y,s.th])));
console.log('plugs',JSON.stringify(plan.plugs.map(p=>[p.x,p.y,p.w,p.h,p.kind])));
console.log('walls',JSON.stringify(plan.walls.map(w=>[w.x,w.y,w.w,w.h,w.role])));
console.log('steps',JSON.stringify(plan.steps.map(t=>[t.x,t.y,t.w,t.h,t.kind])));
console.log('trans',JSON.stringify(plan.transitions.map(t=>[t.kind,t.x,t.fromSlab,t.toSlab,t.params])));
const g=out.grid;
const W=800;
const tr=plan.transitions.find(t=>t.kind==='STEEL_PLUG');
if(tr){
  const x0=tr.params.plugX-6, x1=tr.params.steelX+8;
  const y=plan.slabs[tr.fromSlab].y;
  for(let j=y-8;j<y+26;j++){
    let row=''; for(let i=x0;i<=x1;i++) row+=C.TN(g.get(i,j));
    console.log(String(j).padStart(3),row);
  }
}
