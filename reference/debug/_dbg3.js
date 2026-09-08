const C=require('./00_core.js');
const g=new C.Grid(800,450);
g.fillRect(24,84,102,15,1);
console.log('get(126,84)=',g.get(126,84));
console.log('firstSolidBelow(126,80,60)=',g.firstSolidBelow(126,80,60));
console.log('firstSolidBelow(130,80,60)=',g.firstSolidBelow(130,80,60));
console.log('src', g.firstSolidBelow.toString());
