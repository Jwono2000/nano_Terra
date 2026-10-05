// --- MovingPlatformArchitect.js ---
// Procedural module to safely design and inject kinematic moving platforms into stages.
// Features an intelligent "Air Corridor" & "Chasm Ferry" discovery algorithm that GUARANTEES
// zero overlap with existing static terrain, walls, ceilings, spawn hatches, or exit gates.

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MovingPlatformArchitect = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const SOLID_TYPES = [
    'platform', 'steelBarrier', 'rockWall', 'craggyRock',
    'volcanicBasalt', 'quantumCrystal', 'steelPlatform',
    'triangleSlope', 'diagonalBeam', 'jumpPad'
  ];

  /**
   * Fast AABB intersection check with optional clearance margin
   */
  function boxesIntersect(b1, b2, margin = 4) {
    const xOverlap = Math.max(0, Math.min(b1.x + b1.w, b2.x + b2.w + margin) - Math.max(b1.x, b2.x - margin));
    const yOverlap = Math.max(0, Math.min(b1.y + b1.h, b2.y + b2.h + margin) - Math.max(b1.y, b2.y - margin));
    return xOverlap > 0 && yOverlap > 0;
  }

  /**
   * Computes the complete swept bounding volume of a moving platform across its entire trajectory.
   * @param {Object} p - { x, y, w, h, axis, range }
   * @returns {Object} { x, y, w, h }
   */
  function computeSweptBox(p) {
    if (p.axis === 'vertical') {
      return {
        x: p.x,
        y: p.y,
        w: p.w,
        h: p.h + p.range
      };
    }
    return {
      x: p.x,
      y: p.y,
      w: p.w + p.range,
      h: p.h
    };
  }

  /**
   * Rigorously checks whether a candidate moving platform's swept trajectory is 100% clear of:
   * 1. Canvas boundaries (stays inside screen with safe padding)
   * 2. All static terrain elements (rocks, basalt, crystal, platforms, steel barriers)
   * 3. Spawn hatch and drop corridor
   * 4. Exit warp gate
   * 5. Other already placed moving platforms (including their swept volumes)
   */
  function isSweptVolumeClear(candidate, staticElements, spawn, gate, existingMoving = []) {
    const swept = computeSweptBox(candidate);

    // 1. Canvas boundary check (nano_Terra playfield: 800 x 450)
    if (swept.x < 15 || swept.x + swept.w > 785) return false;
    if (swept.y < 35 || swept.y + swept.h > 415) return false;

    // 2. Static terrain collision check (with 4px safety buffer)
    for (const el of staticElements) {
      if (boxesIntersect(swept, el, 4)) {
        return false;
      }
    }

    // 3. Spawn area clearance (Hatch + drop safety column)
    if (spawn && typeof spawn.x === 'number' && typeof spawn.y === 'number') {
      const spawnBox = { x: spawn.x - 26, y: spawn.y - 36, w: 52, h: 68 };
      if (boxesIntersect(swept, spawnBox, 6)) return false;
    }

    // 4. Exit warp gate clearance
    if (gate && typeof gate.x === 'number' && typeof gate.y === 'number') {
      const gateBox = { x: gate.x - 26, y: gate.y - 26, w: 52, h: 52 };
      if (boxesIntersect(swept, gateBox, 6)) return false;
    }

    // 5. Existing moving platforms check (Swept vs. Swept clearance)
    for (const other of existingMoving) {
      const otherSwept = computeSweptBox(other);
      if (boxesIntersect(swept, otherSwept, 10)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Intelligently scans existing stage geometry to discover viable, non-overlapping
   * Air Corridors and Chasm Ferry routes.
   *
   * Strategy:
   * 1. Chasm Bridge: Detect gaps between static platforms where units need a ferry shuttle.
   * 2. Open Air Corridors: Scan free horizontal and vertical airspace slices.
   */
  function findAirCorridors(elements, spawn, gate, rnd) {
    const staticElements = elements.filter(el => SOLID_TYPES.includes(el.type));
    const candidates = [];

    // --- Technique 1: Chasm Ferry Detection ---
    // Look for platform pairs separated by horizontal voids
    const platforms = staticElements.filter(el => el.type === 'platform' || el.h <= 30);
    for (let i = 0; i < platforms.length; i++) {
      const a = platforms[i];
      for (let j = 0; j < platforms.length; j++) {
        if (i === j) continue;
        const b = platforms[j];
        // Check if b is to the right of a
        const gapLeft = a.x + a.w;
        const gapRight = b.x;
        const gapWidth = gapRight - gapLeft;
        const yDiff = Math.abs(a.y - b.y);

        // Gap suitable for a ferry: 100px ~ 340px wide, platforms roughly aligned (yDiff <= 40px)
        if (gapWidth >= 100 && gapWidth <= 340 && yDiff <= 40) {
          const platW = Math.max(50, Math.min(85, Math.round((gapWidth * 0.4) / 10) * 10));
          const pad = 4; // Clearance so platform docks near the edge (leaves 4px docking gap, easily bridged by unit's step)
          const startX = gapLeft + pad;
          const range = gapWidth - platW - pad * 2;

          if (range >= 30) {
            const ferryY = Math.min(a.y, b.y) + (a.y !== b.y ? 2 : 0);
            candidates.push({
              type: 'movingPlatform',
              x: startX,
              y: ferryY,
              w: platW,
              h: 18,
              axis: 'horizontal',
              range: range,
              speed: 0.70 + Math.round(rnd() * 3) * 0.05, // 0.70 ~ 0.85 (calibrated below unit 1.25)
              pauseTicks: 35,
              score: 100 + range // High priority: naturally bridges gaps
            });
          }
        }
      }
    }

    // --- Technique 2: Horizontal Open Air Corridors ---
    // Scan horizontal altitude lines: Y = 130, 170, 210, 250, 290, 330
    const scanYs = [140, 180, 220, 260, 300, 340];
    for (const testY of scanYs) {
      // Find open horizontal segments between x = 60 and 740
      let curStart = null;
      for (let testX = 60; testX <= 740; testX += 10) {
        const testBox = { x: testX - 4, y: testY - 6, w: 18, h: 30 };
        const collides = staticElements.some(el => boxesIntersect(testBox, el, 4)) ||
                         (spawn && boxesIntersect(testBox, { x: spawn.x - 24, y: spawn.y - 24, w: 48, h: 48 }, 4)) ||
                         (gate && boxesIntersect(testBox, { x: gate.x - 24, y: gate.y - 24, w: 48, h: 48 }, 4));

        if (!collides) {
          if (curStart === null) curStart = testX;
        } else {
          if (curStart !== null) {
            const segW = testX - curStart;
            if (segW >= 140) {
              const platW = 80;
              const range = Math.max(30, Math.min(220, segW - platW - 20));
              candidates.push({
                type: 'movingPlatform',
                x: curStart + 10,
                y: testY,
                w: platW,
                h: 18,
                axis: 'horizontal',
                range: range,
                speed: 0.70 + Math.round(rnd() * 3) * 0.05,
                pauseTicks: 35,
                score: 50 + range
              });
            }
            curStart = null;
          }
        }
      }
      if (curStart !== null) {
        const segW = 740 - curStart;
        if (segW >= 140) {
          const platW = 80;
          const range = Math.max(30, Math.min(220, segW - platW - 20));
          candidates.push({
            type: 'movingPlatform',
            x: curStart + 10,
            y: testY,
            w: platW,
            h: 18,
            axis: 'horizontal',
            range: range,
            speed: 0.70 + Math.round(rnd() * 3) * 0.05,
            pauseTicks: 35,
            score: 50 + range
          });
        }
      }
    }

    // --- Technique 3: Vertical Shaft Elevator Detection ---
    // Scan vertical columns between X = 160 and 640
    const scanXs = [180, 260, 340, 420, 500, 580, 640];
    for (const testX of scanXs) {
      let curStart = null;
      for (let testY = 80; testY <= 380; testY += 10) {
        const testBox = { x: testX - 4, y: testY - 4, w: 88, h: 18 };
        const collides = staticElements.some(el => boxesIntersect(testBox, el, 4)) ||
                         (spawn && boxesIntersect(testBox, { x: spawn.x - 24, y: spawn.y - 24, w: 48, h: 48 }, 4)) ||
                         (gate && boxesIntersect(testBox, { x: gate.x - 24, y: gate.y - 24, w: 48, h: 48 }, 4));

        if (!collides) {
          if (curStart === null) curStart = testY;
        } else {
          if (curStart !== null) {
            const segH = testY - curStart;
            if (segH >= 120) {
              const range = Math.max(40, Math.min(160, segH - 36));
              candidates.push({
                type: 'movingPlatform',
                x: testX,
                y: curStart + 8,
                w: 80,
                h: 18,
                axis: 'vertical',
                range: range,
                speed: 0.70 + Math.round(rnd() * 3) * 0.05,
                pauseTicks: 30,
                score: 70 + range
              });
            }
            curStart = null;
          }
        }
      }
      if (curStart !== null) {
        const segH = 380 - curStart;
        if (segH >= 120) {
          const range = Math.max(40, Math.min(160, segH - 36));
          candidates.push({
            type: 'movingPlatform',
            x: testX,
            y: curStart + 8,
            w: 80,
            h: 18,
            axis: 'vertical',
            range: range,
            speed: 0.70 + Math.round(rnd() * 3) * 0.05,
            pauseTicks: 30,
            score: 70 + range
          });
        }
      }
    }

    return candidates;
  }

  /**
   * Analyzes an existing stage layout and intelligently adds kinematic moving platforms
   * without disturbing existing static puzzle geometry or overlapping with any elements.
   *
   * @param {Object} levelData           - Target level data JSON
   * @param {Object} [opts={}]
   * @param {string} [opts.style='auto'] - 'auto' | 'shuttle' | 'elevator' | 'chasm'
   * @param {number} [opts.count=1]      - Number of moving platforms to add (1 ~ 3)
   * @param {number} [opts.seed=12345]   - Random seed
   * @returns {Object} Deep cloned levelData with moving platforms added
   */
  function injectMovingPlatforms(levelData, opts = {}) {
    if (!levelData) return levelData;
    const data = JSON.parse(JSON.stringify(levelData));
    if (!Array.isArray(data.elements)) data.elements = [];

    const count = Math.max(1, Math.min(3, opts.count || 1));
    const style = opts.style || 'auto';
    const seed = opts.seed != null ? opts.seed : ((Math.random() * 1e9) | 0);
    const themePal = data.terrainTheme || 'cyan';

    // Simple deterministic pseudo-random generator
    let s = (seed & 0x7fffffff) || 1234567;
    const rnd = () => {
      s = (s * 16807) % 2147483647;
      return (s - 1) / 2147483646;
    };

    const spawn = {
      x: typeof data.spawnX === 'number' ? data.spawnX : 90,
      y: typeof data.spawnY === 'number' ? data.spawnY : 60
    };
    const gate = {
      x: typeof data.gateX === 'number' ? data.gateX : 710,
      y: typeof data.gateY === 'number' ? data.gateY : 254
    };

    const staticElements = data.elements.filter(el => SOLID_TYPES.includes(el.type));
    const existingMoving = data.elements.filter(el => el.type === 'movingPlatform');

    // 1. Discover all non-overlapping Air Corridor candidates
    const allCandidates = findAirCorridors(data.elements, spawn, gate, rnd);

    // Filter by requested style if specified
    let filtered = allCandidates;
    if (style === 'elevator') {
      filtered = allCandidates.filter(c => c.axis === 'vertical');
    } else if (style === 'shuttle' || style === 'chasm') {
      filtered = allCandidates.filter(c => c.axis === 'horizontal');
    }

    // Fallback if style filter eliminated everything
    if (filtered.length === 0) filtered = allCandidates;

    // Shuffle and sort candidates with score + randomness
    filtered.sort((a, b) => (b.score + rnd() * 40) - (a.score + rnd() * 40));

    let addedCount = 0;
    for (const cand of filtered) {
      if (addedCount >= count) break;

      // Absolute verification: check swept box against static terrain, spawn, gate, and existing moving platforms
      if (isSweptVolumeClear(cand, staticElements, spawn, gate, existingMoving)) {
        const plat = {
          type: 'movingPlatform',
          x: cand.x,
          y: cand.y,
          w: cand.w,
          h: cand.h,
          axis: cand.axis,
          range: cand.range,
          // Platform speed clamped strictly between 0.65 and 0.85 (NanoUnit walkSpeed is 1.25)
          speed: Math.max(0.65, Math.min(0.85, cand.speed || 0.75)),
          pauseTicks: cand.pauseTicks || 35,
          palette: themePal
        };

        data.elements.push(plat);
        existingMoving.push(plat);
        addedCount++;
      }
    }

    return data;
  }

  /**
   * Generates a dedicated "Quantum Kinetic Transit" theme level built around moving platforms.
   * Completely calibrated for zero-overlap and smooth carrier traversal.
   */
  function createKineticChallengeStage(opts = {}) {
    const seed = opts.seed != null ? opts.seed : ((Math.random() * 1e9) | 0);
    const theme = opts.palette || 'cyan';

    const stage = {
      id: "KINETIC_CORRIDOR",
      title: "QUANTUM KINETIC PASSAGE",
      bgImg: "assets/bg_level_1.jpg",
      terrainTheme: theme,
      desc: "자기부상 및 위상 이동 플랫폼을 이용한 초정밀 타이밍 작전 구역입니다. 나노봇 군단의 이동 주기를 통제하십시오.",
      totalUnits: 15,
      needPercent: 70,
      spawnRate: 20,
      timeLimit: 240,
      skills: {
        climb: 4, float: 4, bash: 4, mine: 4, drill: 4, bomb: 2, build: 6, block: 4, portal: 1
      },
      spawnX: 90,
      spawnY: 60,
      gateX: 710,
      gateY: 260,
      elements: [
        // Spawn starting drop platform [x: 40..170]
        { type: 'platform', x: 40, y: 120, w: 130, h: 20, palette: theme },
        // Mid horizontal ferry: spans gap between 170 and 390 without touching either platform
        // x: 174, w: 80, range: 132 -> swept volume: [174, 128] to [386, 146]. Leaves 4px clearance on left and 4px on right!
        { type: 'movingPlatform', x: 174, y: 128, w: 80, h: 18, axis: 'horizontal', range: 132, speed: 0.75, pauseTicks: 35, palette: theme },
        // Middle island [x: 390..480]
        { type: 'platform', x: 390, y: 140, w: 90, h: 20, palette: theme },
        // Vertical elevator: shaft between 480 and 590
        // x: 500, y: 150, range: 110, w: 80, h: 18 -> swept Y: 150..278. Drops down to landing level without collision!
        { type: 'movingPlatform', x: 500, y: 150, w: 80, h: 18, axis: 'vertical', range: 110, speed: 0.75, pauseTicks: 35, palette: theme },
        // Gate landing platform [x: 600..750]
        { type: 'platform', x: 600, y: 290, w: 150, h: 20, palette: theme }
      ],
      solutionDna: ["BLOCK", "BUILD"],
      difficultyScore: 65,
      seed
    };

    return stage;
  }

  return {
    findAirCorridors,
    isSweptVolumeClear,
    computeSweptBox,
    injectMovingPlatforms,
    createKineticChallengeStage
  };
});
