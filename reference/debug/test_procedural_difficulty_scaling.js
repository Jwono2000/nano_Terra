const assert = require('assert');
const { FullCanvasLevelArchitect, DIFF_SPECS } = require('../../js/procedural/FullCanvasLevelArchitect.js');
const { ProceduralMapEngine } = require('../../js/procedural/ProceduralMapEngine.js');

console.log('====================================================================');
console.log('=== TEST: PROCEDURAL GENERATOR MATHEMATICAL DIFFICULTY SCALING ===');
console.log('====================================================================');

const diffKeys = ['easy', 'normal', 'hard', 'nightmare'];
const archetypes = ['cascade', 'zigzag', 'traverse', 'split', 'chamber', 'ascent'];

for (const diff of diffKeys) {
  console.log(`\n--- Testing Difficulty: [${diff.toUpperCase()}] ---`);
  for (let i = 0; i < 3; i++) {
    const arch = archetypes[(i * 2) % archetypes.length];
    const map = ProceduralMapEngine.generate({
      difficulty: diff,
      layout: arch,
      seed: 1000 + i * 777
    });

    // 1. Difficulty score threshold check
    const minExpected = DIFF_SPECS[diff].minScore;
    console.log(`  [Map ${i+1}: ${map.title}]`);
    console.log(`    - Archetype: ${map.layoutType} | DNA: ${map.solutionDna.join(' -> ')}`);
    console.log(`    - Difficulty Score: ${map.difficultyScore}pt (Min Required: ${minExpected}pt)`);
    assert(map.difficultyScore >= minExpected, `Score ${map.difficultyScore} must be >= ${minExpected} for ${diff}`);

    // 2. Dynamic time limit check
    const baseTime = 35;
    const actionTimes = { BASH: 18, DRILL: 15, FLOAT: 12, BLOCK: 10, BUILD: 22, MINE: 16, BOMB: 12, CLIMB: 14, WALK: 8 };
    const multipliers = { easy: 1.80, normal: 1.45, hard: 1.20, nightmare: 1.05 };
    const expectedTime = Math.round((baseTime + map.solutionDna.reduce((acc, a) => acc + (actionTimes[a] || 15), 0)) * multipliers[diff]);
    console.log(`    - Dynamic Time Limit: ${map.timeLimit}s (Formula: ${expectedTime}s)`);
    assert.strictEqual(map.timeLimit, expectedTime, 'Time limit must match dynamic time formula');

    // 3. Decoy skills and tight budget checks for HARD/NIGHTMARE
    if (diff === 'hard' || diff === 'nightmare') {
      const solSet = new Set(map.solutionDna.map(s => s.toLowerCase()));
      const allSkills = ['climb', 'float', 'bash', 'mine', 'drill', 'bomb', 'build', 'block'];
      const decoys = allSkills.filter(s => (map.skills[s] || 0) > 0 && !solSet.has(s));
      console.log(`    - Decoy Skills present: [${decoys.join(', ')}]`);
      assert(decoys.length > 0, `High difficulty ${diff} must include at least 1 decoy skill`);

      // Check unique skills
      assert(new Set(map.solutionDna).size >= DIFF_SPECS[diff].minUniqueSkills, `Unique skills must be >= ${DIFF_SPECS[diff].minUniqueSkills}`);
    }

    // 4. Verification flag
    assert(map._meta && map._meta.simVerified, 'Map must be verified by headless horde simulation');
  }
}

console.log('\n====================================================================');
console.log('=== ALL PROCEDURAL DIFFICULTY SCALING TESTS PASSED (100%) ===');
console.log('====================================================================\n');
