const assert = require('assert');
const { FullCanvasLevelArchitect } = require('../../js/procedural/FullCanvasLevelArchitect.js');
const { AutoSolver } = require('../../js/procedural/AutoSolver.js');

console.log('=== TEST: AutoSolver & Walkthrough Guide on Generated Maps ===');

const map = FullCanvasLevelArchitect.generate({ difficulty: 'nightmare', layout: 'cascade' });
console.log('Generated Map:', map.title);
console.log('Solution DNA:', map.solutionDna);
console.log('Skills:', map.skills);

const steps = AutoSolver.generateSteps(map);
console.log('Generated Steps Count:', steps.length);
steps.forEach(s => console.log(`  Step ${s.step}: [${s.icon} ${s.name}] - ${s.desc}`));

assert(steps.length >= 2, 'Steps should have at least 2 actions');
assert.strictEqual(steps.length, map.solutionDna.length + 1, 'Steps count must match solution DNA length plus final exit step');
console.log('[PASS] AutoSolver integration successfully verified!');
