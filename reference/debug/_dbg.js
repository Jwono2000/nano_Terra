const C=require('./00_core.js'), PL=require('./02_planner.js'), PR=require('./03_probe.js'), EN=require('./04_engine.js'), WK=require('./01_walker.js');
const seed=1234;
const rng=C.makeRNG(seed^0x9e3779b9);
const planner=new PL.PathPlanner();
const plan=planner.plan(seed,{score:72,norm:0.48,dnaLen:3});
const em=new PL.Emitter(rng,plan.biome); const els=em.elements(plan);
const {grid}=PL.Assembler.build(plan,els,em.corridorRects(plan));
console.log('SPAWN',plan.spawn,'GATE',plan.gate,'unplaced',plan.unplaced);
console.log('SLABS'); plan.slabs.forEach(s=>console.log(`  #${s.id} x[${s.x0},${s.x1}] y=${s.y} th=${s.th} role=${s.role} floor=${s.hasFloor}`));
console.log('TRANS'); plan.transitions.forEach(t=>console.log(`  ${t.kind} skill=${t.skill} x=${t.x} y=${t.y} to=${t.toSlab} ${JSON.stringify(t.params)}`));
console.log('TRIG', JSON.stringify(plan.triggers));
console.log('WALLS', JSON.stringify(plan.walls.map(w=>({x:w.x,y:w.y,w:w.w,h:w.h,k:w.kind}))));
console.log('ROOFS', JSON.stringify(plan.roofs));
const pr=new PR.Prober(grid);
console.log('floor under spawn:', pr.floorAt(plan.spawn.x, plan.spawn.y));
// ASCII
function ascii(grid,plan){const cols=100,rows=34,sx=8,sy=450/rows;const buf=[];
for(let j=0;j<rows;j++){let line='';for(let i=0;i<cols;i++){let solid=0,steel=0;
for(let y=Math.floor(j*sy);y<Math.floor((j+1)*sy);y++)for(let x=i*sx;x<(i+1)*sx;x++){const v=grid.get(x,y);if(v===2)steel++;else if(v)solid++;}
line+= steel?'S': solid>sx*sy*0.5?'#': solid>2?'+': solid>0?':':'.';}buf.push(line);}
const put=(x,y,ch)=>{const i=Math.floor(x/sx),j=Math.floor(y/sy);if(i>=0&&i<cols&&j>=0&&j<rows)buf[j]=buf[j].slice(0,i)+ch+buf[j].slice(i+1);};
for(const t of plan.triggers)put(t.x,t.y-6,t.skill[0]);put(plan.spawn.x,plan.spawn.y,'@');put(plan.gate.x,plan.gate.y,'G');
return buf.join('\n');}
console.log(ascii(grid,plan));
// walker trace
const map={skills:{climb:4,float:4,bash:4,mine:4,drill:4,bomb:2,build:6,block:3,portal:2},spawnRate:25,needPercent:70,totalUnits:5};
const sim=new WK.Sim(grid.clone(),{gate:plan.gate,gateR:15,budget:{...map.skills},triggers:plan.triggers.map(t=>({...t,used:false})),portals:plan.portals||null,maxAge:1200});
const w=sim.spawn(plan.spawn.x,plan.spawn.y,1,0,0,plan.triggers.map(t=>({...t,used:false})));
sim.run(600);
console.log('STATE',w.state,'alive',w.alive,'saved',w.saved,'pos',Math.round(w.x),Math.round(w.y),'skills',w.usedSkills);
console.log('TRACE',JSON.stringify(w.trace));
