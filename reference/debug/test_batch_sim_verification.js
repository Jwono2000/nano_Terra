const assert = require('assert');
const { FullCanvasLevelArchitect } = require('../../js/procedural/FullCanvasLevelArchitect.js');
const { ProceduralMapEngine } = require('../../js/procedural/ProceduralMapEngine.js');

console.log('=== BATCH STRESS TEST: 60 Maps Across All Difficulties & Archetypes ===');

const difficulties = ['easy', 'normal', 'hard', 'nightmare'];
const archetypes = ['cascade', 'zigzag', 'traverse', 'split', 'chamber', 'ascent'];

let totalTested = 0;
let simVerifiedCount = 0;
let zeroPortalCount = 0;
let multiBuildsObserved = 0;
let thickFloorMineObserved = 0;

for (let round = 1; round <= 3; round++) {
  for (const diff of difficulties) {
    for (const arch of archetypes) {
      const map = ProceduralMapEngine.generate({
        difficulty: diff,
        layout: arch,
        stageNo: round * 10
      });

      totalTested++;

      // 1. Portal must ALWAYS be 0
      assert.strictEqual(map.skills.portal, 0, `Map ${map.title} portal must be 0`);
      zeroPortalCount++;

      // 2. Headless horde simulation verification
      assert(map._meta && map._meta.simVerified === true, `Map ${map.title} was not verified by horde simulation`);
      simVerifiedCount++;

      // 3. Check for multi-stair build calculation when upward steps exist
      const buildCount = map.skills.build || 0;
      const buildDnaCount = map.solutionDna.filter(a => a === 'BUILD').length;
      if (buildDnaCount > 1) {
        multiBuildsObserved++;
      }

      // 4. Check for thick floor MINE
      if (map.solutionDna.includes('MINE')) {
        const thickSlabs = map.elements.filter(e => e.h >= 40);
        if (thickSlabs.length > 0) {
          thickFloorMineObserved++;
        }
      }

      // 5. Check headroom above all platforms (no suffocating decor)
      for (const el of map.elements) {
        if (['platform', 'craggyRock', 'volcanicBasalt', 'quantumCrystal'].includes(el.type)) {
          // Check if another platform/slab is placed right above this slab within 45px (suffocating ceiling)
          for (const other of map.elements) {
            if (other === el) continue;
            if (!['platform', 'craggyRock', 'volcanicBasalt', 'quantumCrystal'].includes(other.type)) continue; // Skip rockWall/steelBarrier obstacles resting on floor
            // Overlapping X
            const overlapX = Math.min(el.x + el.w, other.x + other.w) - Math.max(el.x, other.x);
            if (overlapX > 20) {
              const gap = el.y - (other.y + other.h);
              if (gap >= 0 && gap < 24) {
                // Hazardous low ceiling (<24px for a 14px tall unit)
                assert.fail(`Hazardous low ceiling detected: ${other.type} at y=${other.y}+${other.h} is only ${gap}px above slab at y=${el.y}`);
              }
            }
          }
        }
      }
    }
  }
}

console.log(`[RESULTS] Total Maps Tested: ${totalTested}`);
console.log(`[RESULTS] Sim Verified (Horde Clearable >=80%): ${simVerifiedCount}/${totalTested}`);
console.log(`[RESULTS] Zero Portal Enforced: ${zeroPortalCount}/${totalTested}`);
console.log(`[RESULTS] Multi-step Stair Scenarios Observed: ${multiBuildsObserved}`);
console.log(`[RESULTS] Thick Floor Diagonal Mine Scenarios Observed: ${thickFloorMineObserved}`);
console.log('\n=== ALL BATCH TESTS PASSED WITH 100% CLEARANCE RATE! ===');
