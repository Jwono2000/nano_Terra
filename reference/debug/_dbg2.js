const C=require('./00_core.js'), PL=require('./02_planner.js');
const seed=1234;
const rng=C.makeRNG(seed^0x9e3779b9);
const plan=new PL.PathPlanner().plan(seed,{score:72,norm:0.48,dnaLen:3});
const em=new PL.Emitter(rng,plan.biome); const els=em.elements(plan);
const {grid}=PL.Assembler.build(plan,els,em.corridorRects(plan));
for (const y of [82,83,84,85,86]) {
  let row='';
  for(let x=100;x<=150;x++) row+=grid.get(x,y)||'.';
  console.log('y='+y, row);
}
console.log('firstSolidBelow(130,80)=',grid.firstSolidBelow(130,80,60));
console.log('firstSolidBelow(126,80)=',grid.firstSolidBelow(126,80,60));
console.log('slab0',JSON.stringify(plan.slabs[0]),'slab1',JSON.stringify(plan.slabs[1]));
