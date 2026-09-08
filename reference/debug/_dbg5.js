const C=require('./00_core.js'), PL=require('./02_planner.js'), PR=require('./03_probe.js'), EN=require('./04_engine.js'), WK=require('./01_walker.js');
const seed=5000;
const rng=C.makeRNG(seed^0x9e3779b9);
const plan=new PL.PathPlanner().plan(seed,{score:70,norm:0.47,dnaLen:3});
const em=new PL.Emitter(rng,plan.biome);
const build=pl=>{const els=em.elements(pl);const r=PL.Assembler.build(pl,els);return {grid:r.grid,elements:els,protect:r.protect};};
let b=build(plan);
const w=plan.walls[0];
console.log('wall',JSON.stringify({x:w.x,y:w.y,w:w.w,h:w.h}));
for(let y=w.y-4;y<w.y+w.h+4;y+=2){
  let row='';
  for(let x=w.x-8;x<w.x+w.w+14;x++) row+= (b.grid.get(x,y)||'.');
  console.log(String(y).padStart(4), row);
}
console.log('--- slab1 y', plan.slabs[1].y, 'slab2 y', plan.slabs[2].y);
for(let y=plan.slabs[2].y-3;y<plan.slabs[2].y+4;y++){
  let row='';
  for(let x=w.x-8;x<w.x+w.w+14;x++) row+= (b.grid.get(x,y)||'.');
  console.log(String(y).padStart(4), row);
}
console.log('protect has 120?', b.protect.has(120), '157?', b.protect.has(157));

console.log('--- column dump around wall ---');
for (const col of [398,399,400,401,402,410]) {
  let s2='';
  for (let y=112;y<=162;y++) s2 += (b.grid.get(col,y)||'.');
  console.log('col',col, s2);
}
console.log('slab0', JSON.stringify({x0:plan.slabs[0].x0,x1:plan.slabs[0].x1,y:plan.slabs[0].y,th:plan.slabs[0].th}));
