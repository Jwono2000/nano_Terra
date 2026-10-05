// --- AdvancedFeatureArchitect.js ---
// Procedural module to inject Option A (Walking Triangle Slopes & Permanent Steel Platforms)
// and Option B (45° Diagonal Steel Beams & Repulsor Jump Pads) into generated stages.
// Eliminates map monotony while preserving 100% stage solvability.

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AdvancedFeatureArchitect = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

  function makeRNG(seed) {
    let s = (seed >>> 0) || 54321;
    return function () {
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function boxesIntersect(b1, b2, margin = 4) {
    const xOverlap = Math.max(0, Math.min(b1.x + b1.w, b2.x + b2.w + margin) - Math.max(b1.x, b2.x - margin));
    const yOverlap = Math.max(0, Math.min(b1.y + b1.h, b2.y + b2.h + margin) - Math.max(b1.y, b2.y - margin));
    return xOverlap > 0 && yOverlap > 0;
  }

  function isClearOfCrucialZones(box, spawn, gate, margin = 16) {
    if (spawn && typeof spawn.x === 'number' && typeof spawn.y === 'number') {
      const spawnBox = { x: spawn.x - 30, y: spawn.y - 20, w: 60, h: 70 };
      if (boxesIntersect(box, spawnBox, margin)) return false;
    }
    if (gate && typeof gate.x === 'number' && typeof gate.y === 'number') {
      const gateBox = { x: gate.x - 26, y: gate.y - 26, w: 52, h: 52 };
      if (boxesIntersect(box, gateBox, margin)) return false;
    }
    return true;
  }

  /**
   * Option A: Inject Triangle Slopes & Steel Platforms
   */
  function injectOptionA(stage, rng, palette) {
    const elements = stage.elements || [];
    const newElements = [];
    const spawn = { x: stage.spawnX, y: stage.spawnY };
    const gate = { x: stage.gateX, y: stage.gateY };

    // 1. Convert 1~2 suitable platforms to Permanent Steel Platforms
    const candidatesForSteel = elements.filter(e =>
      (e.type === 'platform' || e.type === 'craggyRock') &&
      e.w >= 80 && e.w <= 240 &&
      isClearOfCrucialZones(e, spawn, gate, 20)
    );

    let steelReplaced = 0;
    for (const el of candidatesForSteel) {
      if (rng() < 0.45 && steelReplaced < 2) {
        el.type = 'steelPlatform';
        el.isSteel = true;
        steelReplaced++;
      }
    }

    // 2. Discover platform edges to attach Triangle Slopes (◣ or ◢)
    // Slopes allow units to naturally walk up/down without using skills!
    const solidPlatforms = elements.filter(e =>
      (e.type === 'platform' || e.type === 'steelPlatform' || e.type === 'craggyRock') &&
      e.w >= 60 && e.y >= 70 && e.y <= 380
    );

    let slopesAdded = 0;
    for (const plat of solidPlatforms) {
      if (slopesAdded >= 3) break;
      if (rng() > 0.6) continue;

      const slopeW = 40 + Math.floor(rng() * 3) * 10; // 40~60px
      const slopeH = 20 + Math.floor(rng() * 2) * 10; // 20~30px
      const side = rng() < 0.5 ? 'right' : 'left';
      const isRampUp = rng() < 0.35; // 35% chance to ramp UP to higher elevation, 65% ramp DOWN

      let candX, candY, dir;
      if (side === 'right') {
        candX = plat.x + plat.w;
        if (isRampUp) {
          candY = plat.y - slopeH;
          dir = 'up-right'; // ◣: ascends from plat.y to plat.y - slopeH
        } else {
          candY = plat.y;
          dir = 'up-left'; // ◢: descends from plat.y to plat.y + slopeH
        }
      } else {
        candX = plat.x - slopeW;
        if (isRampUp) {
          candY = plat.y - slopeH;
          dir = 'up-left'; // ◢: ascends from plat.y to plat.y - slopeH
        } else {
          candY = plat.y;
          dir = 'up-right'; // ◣: descends from plat.y to plat.y + slopeH
        }
      }

      if (candX < 20 || candX + slopeW > 780 || candY < 30 || candY + slopeH > 420) continue;

      const slopeBox = { x: candX, y: candY, w: slopeW, h: slopeH };
      if (!isClearOfCrucialZones(slopeBox, spawn, gate, 12)) continue;

      // Check collision with other elements (excluding the parent platform it attaches to)
      let collides = false;
      for (const other of elements) {
        if (other !== plat && boxesIntersect(slopeBox, other, 2)) {
          collides = true;
          break;
        }
      }

      if (!collides) {
        newElements.push({
          type: 'triangleSlope',
          x: candX,
          y: candY,
          w: slopeW,
          h: slopeH,
          direction: dir,
          isSteel: rng() < 0.25, // 25% chance of titanium steel slope
          palette: palette
        });
        slopesAdded++;
      }
    }

    elements.push(...newElements);
    return { slopesAdded, steelReplaced };
  }

  /**
   * Option B: Inject 45° Diagonal Steel Beams & Repulsor Jump Pads
   */
  function injectOptionB(stage, rng, palette) {
    const elements = stage.elements || [];
    const newElements = [];
    const spawn = { x: stage.spawnX, y: stage.spawnY };
    const gate = { x: stage.gateX, y: stage.gateY };

    // 1. Inject Repulsor Jump Pad in chasm valleys or near tall steps
    // Placing a jump pad allows units to catapult over obstacles!
    const solidFloors = elements.filter(e =>
      (e.type === 'platform' || e.type === 'steelPlatform' || e.type === 'craggyRock') &&
      e.w >= 70 && e.y >= 140 && e.y <= 400
    );

    let jumpPadsAdded = 0;
    for (const floor of solidFloors) {
      if (jumpPadsAdded >= 2) break;
      if (rng() > 0.5) continue;

      const padW = 40;
      const padH = 10;
      // Position pad on top surface of the floor
      const padX = floor.x + Math.floor(floor.w * 0.35 + rng() * floor.w * 0.3);
      const padY = floor.y - padH;

      if (padX < 30 || padX + padW > 770 || padY < 40) continue;

      const padBox = { x: padX, y: padY, w: padW, h: padH };
      if (!isClearOfCrucialZones(padBox, spawn, gate, 24)) continue;

      // Verify clearance above jump pad (needs at least 80px headroom for catapult launch)
      const headroomBox = { x: padX, y: padY - 80, w: padW, h: 80 };
      let blockedHeadroom = false;
      for (const other of elements) {
        if (other !== floor && boxesIntersect(headroomBox, other, 4)) {
          blockedHeadroom = true;
          break;
        }
      }

      if (!blockedHeadroom) {
        // Choose propulsion vector
        const dirChoice = rng();
        let dir = 'up';
        if (dirChoice < 0.4) dir = 'up';
        else if (dirChoice < 0.75) dir = 'up-right';
        else dir = 'up-left';

        newElements.push({
          type: 'jumpPad',
          x: padX,
          y: padY,
          w: padW,
          h: padH,
          dir: dir,
          power: 9.0 + Math.round(rng() * 20) / 10, // 9.0G ~ 11.0G
          palette: palette
        });
        jumpPadsAdded++;
      }
    }

    // 2. Inject 45° Diagonal Steel Beam (Truss Barricade / Deflector)
    let beamsAdded = 0;
    for (let attempts = 0; attempts < 10; attempts++) {
      if (beamsAdded >= 1) break;

      const beamW = 70 + Math.floor(rng() * 3) * 15; // 70~100px
      const beamH = beamW; // 45 degrees
      const candX = 120 + Math.floor(rng() * (560 - beamW));
      const candY = 80 + Math.floor(rng() * (240 - beamH));

      const beamBox = { x: candX, y: candY, w: beamW, h: beamH };
      if (!isClearOfCrucialZones(beamBox, spawn, gate, 28)) continue;

      // Ensure it doesn't heavily overlap platforms (allow light grazing or free air)
      let heavyOverlap = false;
      for (const other of elements) {
        if (boxesIntersect(beamBox, other, 0)) {
          heavyOverlap = true;
          break;
        }
      }

      if (!heavyOverlap) {
        newElements.push({
          type: 'diagonalBeam',
          x: candX,
          y: candY,
          w: beamW,
          h: beamH,
          slope: rng() < 0.5 ? 1 : -1,
          thickness: 16,
          isSteel: true,
          palette: palette
        });
        beamsAdded++;
      }
    }

    elements.push(...newElements);
    return { jumpPadsAdded, beamsAdded };
  }

  /**
   * Main API: Injects both Option A and Option B features into stageData
   */
  function injectFeatures(stageData, opts = {}) {
    if (!stageData || !stageData.elements) return stageData;

    const data = JSON.parse(JSON.stringify(stageData));
    const seed = opts.seed != null ? opts.seed : (data.seed || 12345);
    const rng = makeRNG(seed + 8881);
    const palette = data.terrainTheme || 'cyan';

    const doOptA = opts.optionA !== false;
    const doOptB = opts.optionB !== false;

    let resA = { slopesAdded: 0, steelReplaced: 0 };
    let resB = { jumpPadsAdded: 0, beamsAdded: 0 };

    if (doOptA) {
      resA = injectOptionA(data, rng, palette);
    }
    if (doOptB) {
      resB = injectOptionB(data, rng, palette);
    }

    // Enrich description with injected feature badges
    const badges = [];
    if (resA.slopesAdded > 0) badges.push(`📐경사로 ${resA.slopesAdded}개`);
    if (resA.steelReplaced > 0) badges.push(`⬛스틸발판 ${resA.steelReplaced}개`);
    if (resB.beamsAdded > 0) badges.push(`🥢사선빔 ${resB.beamsAdded}개`);
    if (resB.jumpPadsAdded > 0) badges.push(`🚀점프패드 ${resB.jumpPadsAdded}개`);

    if (badges.length > 0 && data.desc) {
      data.desc += ` · [기믹: ${badges.join(', ')}]`;
    }

    return data;
  }

  return { injectFeatures, injectOptionA, injectOptionB };
});
