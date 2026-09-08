const assert = require('assert');
const { FullCanvasLevelArchitect, DIFF_SPECS } = require('../../js/procedural/FullCanvasLevelArchitect.js');
const { ProceduralMapEngine } = require('../../js/procedural/ProceduralMapEngine.js');

console.log('=== TEST 1: 1:1 Physics Link & Bounds Verification (24 combinations) ===');
const difficulties = ['easy', 'normal', 'hard', 'nightmare'];
const archetypes = ['cascade', 'zigzag', 'traverse', 'split', 'chamber', 'ascent'];

let totalPassed = 0;
const generatedSignatures = new Set();

for (const diff of difficulties) {
  for (const arch of archetypes) {
    const map = ProceduralMapEngine.generate({
      difficulty: diff,
      layout: arch,
      stageNo: 11
    });

    // 1. Elements count >= 12
    assert(map.elements.length >= 12, `${diff} ${arch}: Element count ${map.elements.length} should be >= 12`);

    // 2. Spawn and Gate within valid boundaries
    assert(map.spawnX >= 40 && map.spawnX <= 760, `${diff} ${arch}: Spawn X (${map.spawnX}) out of bounds`);
    assert(map.spawnY >= 40 && map.spawnY <= 400, `${diff} ${arch}: Spawn Y (${map.spawnY}) out of bounds`);
    assert(map.gateX >= 40 && map.gateX <= 760, `${diff} ${arch}: Gate X (${map.gateX}) out of bounds`);
    assert(map.gateY >= 40 && map.gateY <= 400, `${diff} ${arch}: Gate Y (${map.gateY}) out of bounds`);

    // 3. Left safety boundary wall exists near spawn
    const leftWall = map.elements.find(e =>
      (e.type === 'steelBarrier' || e.type === 'rockWall') &&
      e.x <= map.spawnX &&
      Math.abs(e.y + e.h - (map.spawnY + 36)) < 40
    );
    assert(leftWall, `${diff} ${arch}: Left safety wall missing near spawn (${map.spawnX}, ${map.spawnY})`);

    // 4. Right safety barrier exists near gate
    const rightWall = map.elements.find(e =>
      (e.type === 'steelBarrier' || e.type === 'rockWall') &&
      e.x >= map.gateX - 20 &&
      Math.abs(e.y + e.h - (map.gateY + 26)) < 45
    );
    assert(rightWall, `${diff} ${arch}: Right safety wall missing near gate (${map.gateX}, ${map.gateY})`);

    // 5. Solution DNA must be a valid chain
    assert(Array.isArray(map.solutionDna) && map.solutionDna.length >= 2, `${diff} ${arch}: Solution DNA missing or too short`);

    // 6. Skill budget must strictly cover every skill in solutionDna
    const reqCounts = {};
    for (const act of map.solutionDna) {
      const k = act.toLowerCase();
      reqCounts[k] = (reqCounts[k] || 0) + 1;
    }
    for (const [k, count] of Object.entries(reqCounts)) {
      assert(map.skills[k] >= count, `${diff} ${arch}: Required skill '${k}' needed ${count} but got ${map.skills[k]}`);
    }

    // 7. Nightmare EXACT ZERO SLACK check
    if (diff === 'nightmare') {
      for (const [sk, count] of Object.entries(map.skills)) {
        const needed = reqCounts[sk] || 0;
        assert.strictEqual(count, needed, `Nightmare mode violation for '${sk}': needed ${needed}, got ${count}`);
      }
    }

    // 8. Uniqueness signature check
    const sig = `${map.layoutType}_${map.difficultyScore}_${map.spawnX}_${map.spawnY}_${map.gateX}_${map.gateY}_${map.elements[0].x}_${map.elements[1].x}`;
    assert(!generatedSignatures.has(sig), `Duplicate map generated: ${sig}`);
    generatedSignatures.add(sig);

    totalPassed++;
  }
}
console.log(`[PASS] All ${totalPassed} 1:1 physical link checks passed successfully!`);

console.log('\n=== TEST 2: Procedural Randomness on Consecutive Clicks ===');
const maps = [];
for (let i = 0; i < 10; i++) {
  const m = ProceduralMapEngine.generate({ difficulty: 'hard', layout: 'cascade' });
  maps.push(m);
}
for (let i = 0; i < maps.length; i++) {
  for (let j = i + 1; j < maps.length; j++) {
    const isDifferent = (maps[i].elements[0].x !== maps[j].elements[0].x) ||
                        (maps[i].elements[1].x !== maps[j].elements[1].x) ||
                        (maps[i].difficultyScore !== maps[j].difficultyScore) ||
                        (maps[i].spawnX !== maps[j].spawnX);
    assert(isDifferent, `Maps ${i} and ${j} are duplicates!`);
  }
}
console.log('[PASS] 10 consecutive generations with identical settings produced 10 unique maps!');

console.log('\n=== ALL 1:1 PHYSICS LINK VERIFICATIONS COMPLETED SUCCESSFULLY! ===');
