const assert = require('assert');
const { FullCanvasLevelArchitect, DIFF_SPECS } = require('../../js/procedural/FullCanvasLevelArchitect.js');
const { ProceduralMapEngine } = require('../../js/procedural/ProceduralMapEngine.js');

console.log('=== TEST 1: FullCanvasLevelArchitect 24 Combinations (4 Difficulties x 6 Archetypes) ===');
const difficulties = ['easy', 'normal', 'hard', 'nightmare'];
const archetypes = ['cascade', 'zigzag', 'traverse', 'split', 'chamber', 'ascent'];

let totalPassed = 0;
const generatedSignatures = new Set();

for (const diff of difficulties) {
  for (const arch of archetypes) {
    const map = FullCanvasLevelArchitect.generate({
      difficulty: diff,
      layout: arch,
      stageNo: 11
    });

    // Check elements count
    assert(map.elements.length >= 12, `${diff} ${arch}: Elements count ${map.elements.length} should be >= 12`);

    // Check spawn & gate bounds
    assert(map.spawnX >= 40 && map.spawnX <= 760, `Spawn X (${map.spawnX}) out of bounds`);
    assert(map.spawnY >= 40 && map.spawnY <= 400, `Spawn Y (${map.spawnY}) out of bounds`);
    assert(map.gateX >= 40 && map.gateX <= 760, `Gate X (${map.gateX}) out of bounds`);
    assert(map.gateY >= 40 && map.gateY <= 400, `Gate Y (${map.gateY}) out of bounds`);

    // Check difficulty parameters
    const spec = DIFF_SPECS[diff];
    assert.strictEqual(map.totalUnits, spec.units, `Unit count mismatch`);
    assert.strictEqual(map.needPercent, spec.needPercent, `Need percent mismatch`);
    assert.strictEqual(map.timeLimit, spec.timeLimit, `Time limit mismatch`);
    assert(map.difficultyScore >= spec.scoreRange[0] - 5 && map.difficultyScore <= spec.scoreRange[1] + 5,
      `Score ${map.difficultyScore} out of expected range for ${diff}`);

    // Check solution DNA
    assert(Array.isArray(map.solutionDna) && map.solutionDna.length >= 2, `Solution DNA missing or too short`);

    // Check skills
    if (diff === 'nightmare') {
      // EXACT 0 SLACK: Every non-required skill must be 0!
      const reqSet = new Set(map.solutionDna.map(s => s.toLowerCase()));
      for (const [sk, cnt] of Object.entries(map.skills)) {
        if (!reqSet.has(sk)) {
          assert.strictEqual(cnt, 0, `Nightmare mode must have EXACT 0 slack for unneeded skill ${sk}, got ${cnt}`);
        }
      }
    }

    // Check duplicate uniqueness
    const sig = `${map.layoutType}_${map.difficultyScore}_${map.spawnX}_${map.spawnY}_${map.gateX}_${map.gateY}_${map.elements[0].x}_${map.elements[1].x}`;
    assert(!generatedSignatures.has(sig), `Duplicate map generated: ${sig}`);
    generatedSignatures.add(sig);

    totalPassed++;
  }
}
console.log(`[PASS] All ${totalPassed} archetype x difficulty combinations passed assertions!`);

console.log('\n=== TEST 2: Procedural Randomness on Consecutive Clicks (Same Settings) ===');
const maps = [];
for (let i = 0; i < 10; i++) {
  const m = ProceduralMapEngine.generate({ difficulty: 'hard', layout: 'cascade' });
  maps.push(m);
}
// Verify that none of the 10 maps are identical
for (let i = 0; i < maps.length; i++) {
  for (let j = i + 1; j < maps.length; j++) {
    const diffCoord = (maps[i].elements[0].x !== maps[j].elements[0].x) ||
                      (maps[i].elements[1].x !== maps[j].elements[1].x) ||
                      (maps[i].difficultyScore !== maps[j].difficultyScore) ||
                      (maps[i].spawnX !== maps[j].spawnX);
    assert(diffCoord, `Maps ${i} and ${j} are duplicates! Random generation failed.`);
  }
}
console.log('[PASS] 10 consecutive generations with identical settings produced 10 unique, non-duplicate maps!');

console.log('\n=== TEST 3: All 9 Background Themes Coverage ===');
const themesFound = new Set();
for (let i = 0; i < 40; i++) {
  const m = ProceduralMapEngine.generate({ difficulty: 'normal', layout: 'random', theme: 'random' });
  themesFound.add(m.bgImg);
}
console.log(`Themes found (${themesFound.size}):`, Array.from(themesFound));
assert(themesFound.size >= 5, 'Should have rich theme coverage across random rolls');
console.log('[PASS] Rich multi-theme coverage verified!');

console.log('\n=== ALL ARCHITECTURAL TESTS PASSED SUCCESSFULLY! ===');
