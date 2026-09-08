/* ============================================================================
 * FullCanvasLevelArchitect.js — 800x450 풀 캔버스 1:1 물리 결합 2D 절차적 맵 엔진
 * ==========================================================================*/
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  Object.assign(root, api);
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const W = 800;
  const H = 450;

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function makeRNG(seed) {
    let s = (seed >>> 0) || 123456789;
    return function () {
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function makeRNGHelpers(rng) {
    return {
      next: rng,
      range: (min, max) => min + rng() * (max - min),
      irange: (min, max) => Math.floor(min + rng() * (max - min + 1)),
      pick: (arr) => arr[Math.floor(rng() * arr.length)],
      chance: (p) => rng() < p,
      profile: (len = 6, minH = 14, maxH = 34) => {
        const arr = [];
        for (let i = 0; i < len; i++) {
          arr.push(Math.floor(minH + rng() * (maxH - minH + 1)));
        }
        return arr;
      }
    };
  }

  const DIFF_SPECS = {
    easy: {
      key: 'easy',
      name: 'EASY',
      scoreRange: [30, 42],
      units: 15,
      needPercent: 50,
      timeLimit: 240,
      spawnRate: 34,
      slack: { requiredMin: 2, requiredMax: 4, otherMin: 1, otherMax: 3 }
    },
    normal: {
      key: 'normal',
      name: 'NORMAL',
      scoreRange: [60, 75],
      units: 18,
      needPercent: 65,
      timeLimit: 180,
      spawnRate: 26,
      slack: { requiredMin: 1, requiredMax: 2, otherMin: 0, otherMax: 1 }
    },
    hard: {
      key: 'hard',
      name: 'HARD',
      scoreRange: [92, 110],
      units: 20,
      needPercent: 75,
      timeLimit: 150,
      spawnRate: 22,
      slack: { requiredMin: 0, requiredMax: 1, otherMin: 0, otherMax: 0 }
    },
    nightmare: {
      key: 'nightmare',
      name: 'NIGHTMARE',
      scoreRange: [126, 142],
      units: 25,
      needPercent: 85,
      timeLimit: 120,
      spawnRate: 16,
      slack: { requiredMin: 0, requiredMax: 0, otherMin: 0, otherMax: 0 } // EXACT 0 SLACK
    }
  };

  const BIOMES = {
    cyan: { palette: 'cyan', bg: 'assets/bg_level_1.jpg', altBg: 'assets/bg_level_6.jpg', stone: ['craggyRock', 'platform'] },
    red: { palette: 'red', bg: 'assets/bg_level_2.jpg', altBg: 'assets/bg_level_7.jpg', stone: ['volcanicBasalt', 'craggyRock'] },
    purple: { palette: 'purple', bg: 'assets/bg_level_3.jpg', altBg: 'assets/bg_level_8.jpg', stone: ['quantumCrystal', 'platform'] },
    brown: { palette: 'brown', bg: 'assets/bg_level_4.jpg', altBg: 'assets/bg_level_9.jpg', stone: ['platform', 'craggyRock'] },
    green: { palette: 'green', bg: 'assets/bg_level_5.jpg', altBg: 'assets/bg_level_1.jpg', stone: ['craggyRock', 'quantumCrystal'] }
  };

  const SECTOR_NAMES = [
    'GENESIS', 'VALKYRIE', 'HYPERION', 'NEBULA', 'ECLIPSE', 'QUANTUM',
    'SOLARIS', 'CYBERDYNE', 'KRONOS', 'ABYSS', 'PROMETHEUS', 'TITAN',
    'NEXUS', 'VORTEX', 'OLYMPUS', 'ANDROMEDA', 'AURORA', 'ZENITH'
  ];

  /* =========================================================================
   * FullCanvasLevelArchitect
   * =======================================================================*/
  class FullCanvasLevelArchitect {

    static resolveDifficulty(diff) {
      if (typeof diff === 'number') {
        if (diff < 48) return DIFF_SPECS.easy;
        if (diff < 82) return DIFF_SPECS.normal;
        if (diff < 118) return DIFF_SPECS.hard;
        return DIFF_SPECS.nightmare;
      }
      const k = (diff || 'normal').toLowerCase();
      return DIFF_SPECS[k] || DIFF_SPECS.normal;
    }

    static resolvePaletteAndTheme(options, R) {
      let pal = options.palette;
      let theme = options.theme;

      if (!pal || pal === 'random') {
        pal = R.pick(['cyan', 'red', 'purple', 'brown', 'green']);
      }
      const biomeInfo = BIOMES[pal] || BIOMES.cyan;

      if (!theme || theme === 'random') {
        theme = R.chance(0.5) ? biomeInfo.bg : biomeInfo.altBg;
      }
      return { palette: pal, theme: theme, stoneTypes: biomeInfo.stone };
    }

    static pickArchetype(layout, R) {
      const archetypes = ['cascade', 'zigzag', 'traverse', 'split', 'chamber', 'ascent'];
      if (!layout || layout === 'random') return R.pick(archetypes);
      const l = layout.toLowerCase();
      if (archetypes.includes(l)) return l;
      if (l === 'multi_tiered') return 'cascade';
      if (l === 'speedway') return 'traverse';
      if (l === 'twin_towers') return 'ascent';
      if (l === 'labyrinth') return 'split';
      if (l === 'floating_islands') return 'chamber';
      if (l === 'descent') return 'cascade';
      return R.pick(archetypes);
    }

    /* -----------------------------------------------------------------------
     * 1. CASCADE Archetype (Downhill Stepwise Cascade)
     * ---------------------------------------------------------------------*/
    static buildCascade(R, diff, pal, stones) {
      const elements = [];
      const jx = () => R.irange(-6, 6);
      const jy = () => R.irange(-4, 4);

      // Tier 1: Safe Spawn Platform
      const t1 = {
        type: R.pick(stones),
        x: 40 + jx(),
        y: 95 + jy(),
        w: 190,
        h: 22,
        palette: pal,
        profile: R.profile(6, 14, 26)
      };
      // Left safety boundary wall: prevents left-walking spawned units from falling into void
      elements.push({
        type: 'steelBarrier',
        x: t1.x,
        y: t1.y - 65,
        w: 20,
        h: 65
      });
      elements.push(t1);

      // Transition T1 -> T2
      // In Easy: safe drop (drop 60px). In Normal/Hard/Nightmare: lethal drop (115px > 96px, requires FLOAT)
      const t2Y = diff.key === 'easy' ? t1.y + 60 : t1.y + 115;
      const t2 = {
        type: R.pick(stones),
        x: 160 + jx(),
        y: t2Y + jy(),
        w: 260,
        h: 24,
        palette: pal,
        profile: R.profile(7, 16, 30)
      };
      elements.push(t2);

      // Obstacle on Tier 2: Destructible Rock Wall (Requires BASH)
      elements.push({
        type: 'rockWall',
        x: t2.x + 85 + jx(),
        y: t2.y - 65,
        w: 42,
        h: 65,
        palette: pal
      });

      // Ceiling above Tier 2
      elements.push({
        type: 'platform',
        x: t2.x + 90,
        y: t2.y - 50,
        w: 90,
        h: 16,
        palette: pal
      });

      // End of Tier 2: Steel barrier blocking path, forcing downward DRILL through 20px floor
      elements.push({
        type: 'steelBarrier',
        x: t2.x + t2.w - 24,
        y: t2.y - 75,
        w: 20,
        h: 75
      });

      // Tier 3: Catch platform beneath drill hole
      const t3 = {
        type: R.pick(stones),
        x: 320 + jx(),
        y: t2.y + 80 + jy(),
        w: 250,
        h: 24,
        palette: pal,
        profile: R.profile(6, 16, 28)
      };
      elements.push(t3);

      // Decoy Path on Tier 3 (Abyss drop trap requiring BLOCK on Hard/Nightmare)
      if (diff.key === 'hard' || diff.key === 'nightmare') {
        elements.push({
          type: 'platform',
          x: t3.x + t3.w - 10,
          y: t3.y,
          w: 110,
          h: 18,
          palette: pal
        });
      }

      // Step from Tier 3 to Tier 4: Gap of 48px & rise 20px (Solvable by 1 BUILD ramp)
      const t4X = t3.x + 130;
      const t4Y = clamp(t3.y + 70 + jy(), 340, 380);
      const t4 = {
        type: R.pick(stones),
        x: clamp(t4X + 48, 480, 540),
        y: t4Y,
        w: 220,
        h: 24,
        palette: pal,
        profile: R.profile(6, 16, 30)
      };
      elements.push(t4);

      // Right boundary wall at goal platform: prevents overshooting units from falling into abyss
      elements.push({
        type: 'steelBarrier',
        x: t4.x + t4.w - 20,
        y: t4.y - 65,
        w: 20,
        h: 65
      });

      // Ambient decorative crystal formations
      elements.push({
        type: 'quantumCrystal',
        x: 50 + jx(),
        y: 270 + jy(),
        w: 75,
        h: 18,
        palette: pal,
        profile: R.profile(4, 12, 20)
      });
      elements.push({
        type: 'platform',
        x: 640 + jx(),
        y: 110 + jy(),
        w: 80,
        h: 16,
        palette: pal
      });
      elements.push({
        type: 'quantumCrystal',
        x: 680 + jx(),
        y: 220 + jy(),
        w: 70,
        h: 18,
        palette: pal,
        profile: R.profile(4, 12, 20)
      });
      elements.push({
        type: 'platform',
        x: 50 + jx(),
        y: 390 + jy(),
        w: 90,
        h: 20,
        palette: pal
      });

      const spawn = { x: t1.x + 60, y: t1.y - 36 };
      const gate = { x: t4.x + t4.w - 55, y: t4.y - 26 };

      const solution = diff.key === 'easy'
        ? ['BASH', 'BUILD']
        : diff.key === 'normal'
          ? ['FLOAT', 'BASH', 'DRILL']
          : diff.key === 'hard'
            ? ['FLOAT', 'BASH', 'DRILL', 'BLOCK', 'BUILD']
            : ['FLOAT', 'BASH', 'DRILL', 'BLOCK', 'BUILD'];

      return { elements, spawn, gate, solution };
    }

    /* -----------------------------------------------------------------------
     * 2. ZIGZAG Archetype (3-Tier Switchback with Exact Trajectory Links)
     * ---------------------------------------------------------------------*/
    static buildZigzag(R, diff, pal, stones) {
      const elements = [];
      const jx = () => R.irange(-6, 6);
      const jy = () => R.irange(-4, 4);

      // Tier 1 (Top Runway: Left -> Right): y = 95
      const t1 = {
        type: R.pick(stones),
        x: 40 + jx(),
        y: 96 + jy(),
        w: 680,
        h: 22,
        palette: pal,
        profile: R.profile(8, 16, 30)
      };
      elements.push({
        type: 'steelBarrier',
        x: t1.x,
        y: t1.y - 65,
        w: 20,
        h: 65
      });
      elements.push(t1);

      // Rock wall on Tier 1 (BASH)
      elements.push({
        type: 'rockWall',
        x: 310 + jx(),
        y: t1.y - 65,
        w: 42,
        h: 65,
        palette: pal
      });

      // Steel barrier at right edge of Tier 1 forcing downward DRILL or lethal cliff drop
      elements.push({
        type: 'steelBarrier',
        x: t1.x + t1.w - 24,
        y: t1.y - 75,
        w: 20,
        h: 75
      });

      // Tier 2 (Middle Runway: Right -> Left): y = 225 (drop 125px > 96px, requires FLOAT or DRILL)
      const t2 = {
        type: R.pick(stones),
        x: 70 + jx(),
        y: 225 + jy(),
        w: 660,
        h: 24,
        palette: pal,
        profile: R.profile(8, 16, 30)
      };
      elements.push(t2);

      // Low ceiling on Tier 2 (MINE)
      elements.push({
        type: 'platform',
        x: 360 + jx(),
        y: t2.y - 42,
        w: 110,
        h: 18,
        palette: pal
      });

      // Decoy false ledge into abyss at left end of Tier 2
      elements.push({
        type: 'platform',
        x: 20,
        y: t2.y,
        w: 55,
        h: 16,
        palette: pal
      });

      // Tier 3 (Bottom Runway: Left -> Right): y = 360
      const t3A = {
        type: R.pick(stones),
        x: 40 + jx(),
        y: 360 + jy(),
        w: 320,
        h: 24,
        palette: pal,
        profile: R.profile(6, 16, 28)
      };
      // Exact 48px gap requiring 1 BUILD ramp
      const t3B = {
        type: R.pick(stones),
        x: t3A.x + t3A.w + 48,
        y: t3A.y,
        w: clamp(W - 30 - (t3A.x + t3A.w + 48), 240, 340),
        h: 24,
        palette: pal,
        profile: R.profile(6, 16, 30)
      };
      elements.push(t3A, t3B);

      // Right safety wall at goal
      elements.push({
        type: 'steelBarrier',
        x: t3B.x + t3B.w - 20,
        y: t3B.y - 65,
        w: 20,
        h: 65
      });

      // Ambient crystals
      elements.push({
        type: 'quantumCrystal',
        x: 690 + jx(),
        y: 300 + jy(),
        w: 70,
        h: 18,
        palette: pal,
        profile: R.profile(4, 12, 20)
      });
      elements.push({
        type: 'platform',
        x: 270 + jx(),
        y: 410 + jy(),
        w: 90,
        h: 18,
        palette: pal
      });

      const spawn = { x: t1.x + 60, y: t1.y - 36 };
      const gate = { x: t3B.x + t3B.w - 55, y: t3B.y - 26 };

      const solution = diff.key === 'easy'
        ? ['BASH', 'BUILD']
        : diff.key === 'normal'
          ? ['BASH', 'FLOAT', 'BUILD']
          : diff.key === 'hard'
            ? ['BASH', 'DRILL', 'BLOCK', 'BUILD']
            : ['BASH', 'DRILL', 'MINE', 'BLOCK', 'BUILD'];

      return { elements, spawn, gate, solution };
    }

    /* -----------------------------------------------------------------------
     * 3. TRAVERSE Archetype (West Fortress & Great Central Chasm)
     * ---------------------------------------------------------------------*/
    static buildTraverse(R, diff, pal, stones) {
      const elements = [];
      const jx = () => R.irange(-4, 4);
      const jy = () => R.irange(-4, 4);

      // West Fortress (Spawn): y = 145
      const westUpper = {
        type: R.pick(stones),
        x: 40 + jx(),
        y: 145 + jy(),
        w: 160,
        h: 24,
        palette: pal,
        profile: R.profile(6, 16, 28)
      };
      elements.push({
        type: 'steelBarrier',
        x: westUpper.x,
        y: westUpper.y - 65,
        w: 20,
        h: 65
      });
      elements.push(westUpper);

      // West Tower Wall (BASH)
      elements.push({
        type: 'rockWall',
        x: westUpper.x + westUpper.w - 38,
        y: westUpper.y - 75,
        w: 40,
        h: 75,
        palette: pal
      });

      // Central Chasm Island 1: Gap 48px from west tower, solvable by 1 BUILD
      const islandA = {
        type: 'quantumCrystal',
        x: westUpper.x + westUpper.w + 48,
        y: 195 + jy(),
        w: 110,
        h: 22,
        palette: pal,
        profile: R.profile(5, 14, 26)
      };
      // Island 2: Gap 48px from Island 1
      const islandB = {
        type: 'craggyRock',
        x: islandA.x + islandA.w + 48,
        y: 225 + jy(),
        w: 100,
        h: 20,
        palette: pal,
        profile: R.profile(4, 14, 24)
      };
      elements.push(islandA, islandB);

      // East Citadel Upper Bastion: Reached via step-up BUILD from Island B
      const eastUpper = {
        type: R.pick(stones),
        x: islandB.x + islandB.w + 48,
        y: 165 + jy(),
        w: 180,
        h: 24,
        palette: pal,
        profile: R.profile(6, 16, 28)
      };
      elements.push(eastUpper);

      // Steel Barrier on East Citadel blocking surface entry
      elements.push({
        type: 'steelBarrier',
        x: eastUpper.x + 50,
        y: eastUpper.y - 80,
        w: 20,
        h: 80
      });

      // East Citadel Lower Vault (Goal Sanctuary): Directly under drill hole at eastUpper.x + 20
      const eastLower = {
        type: R.pick(stones),
        x: eastUpper.x - 20,
        y: 350 + jy(),
        w: 200,
        h: 26,
        palette: pal,
        profile: R.profile(6, 16, 28)
      };
      elements.push(eastLower);

      // Right boundary wall at goal
      elements.push({
        type: 'steelBarrier',
        x: eastLower.x + eastLower.w - 20,
        y: eastLower.y - 65,
        w: 20,
        h: 65
      });

      // Decoy false springboard
      elements.push({
        type: 'platform',
        x: westUpper.x + 70,
        y: 270,
        w: 80,
        h: 18,
        palette: pal
      });
      // Ambient crystals
      elements.push({
        type: 'quantumCrystal',
        x: 290 + jx(),
        y: 380 + jy(),
        w: 80,
        h: 18,
        palette: pal,
        profile: R.profile(4, 12, 20)
      });
      elements.push({
        type: 'platform',
        x: 660 + jx(),
        y: 80 + jy(),
        w: 75,
        h: 16,
        palette: pal
      });

      const spawn = { x: westUpper.x + 60, y: westUpper.y - 36 };
      const gate = { x: clamp(eastLower.x + eastLower.w - 55, 600, 720), y: eastLower.y - 26 };

      const solution = diff.key === 'easy'
        ? ['BASH', 'BUILD']
        : diff.key === 'normal'
          ? ['BASH', 'FLOAT', 'BUILD', 'DRILL']
          : diff.key === 'hard'
            ? ['BASH', 'BUILD', 'FLOAT', 'BLOCK', 'DRILL']
            : ['BASH', 'BUILD', 'FLOAT', 'BLOCK', 'DRILL'];

      return { elements, spawn, gate, solution };
    }

    /* -----------------------------------------------------------------------
     * 4. SPLIT Archetype (High & Low Dual-Path Labyrinth + Decoy Abyss Trap)
     * ---------------------------------------------------------------------*/
    static buildSplit(R, diff, pal, stones) {
      const elements = [];
      const jx = () => R.irange(-6, 6);
      const jy = () => R.irange(-4, 4);

      // Forking Station (Spawn): y = 175
      const forkSlab = {
        type: R.pick(stones),
        x: 40 + jx(),
        y: 175 + jy(),
        w: 180,
        h: 22,
        palette: pal,
        profile: R.profile(6, 14, 28)
      };
      elements.push({
        type: 'steelBarrier',
        x: forkSlab.x,
        y: forkSlab.y - 65,
        w: 20,
        h: 65
      });
      elements.push(forkSlab);

      // Decoy Path: Flat runway straight into the bottomless abyss (Requires BLOCK!)
      const decoySlab = {
        type: 'platform',
        x: forkSlab.x + forkSlab.w - 10,
        y: forkSlab.y,
        w: 120,
        h: 18,
        palette: pal
      };
      elements.push(decoySlab);

      // High Route: Towering Wall (Height 68px, requires CLIMB)
      elements.push({
        type: 'rockWall',
        x: forkSlab.x + 110,
        y: 105,
        w: 36,
        h: forkSlab.y - 105,
        palette: pal
      });
      // High Skyway: y = 105
      const highSlab = {
        type: 'quantumCrystal',
        x: forkSlab.x + 110,
        y: 105,
        w: 250,
        h: 22,
        palette: pal,
        profile: R.profile(6, 14, 26)
      };
      elements.push(highSlab);

      // High Route Drop: Drop from y = 105 to y = 225 (120px > 96px lethal fall, requires FLOAT!)
      const goalSlab = {
        type: R.pick(stones),
        x: 550 + jx(),
        y: 225 + jy(),
        w: 210,
        h: 24,
        palette: pal,
        profile: R.profile(6, 16, 30)
      };
      elements.push(goalSlab);

      // Low Route (Cavern): Drilled down to y = 325 (DRILL + BASH)
      const lowSlab = {
        type: R.pick(stones),
        x: 200 + jx(),
        y: 325 + jy(),
        w: 240,
        h: 24,
        palette: pal,
        profile: R.profile(6, 16, 30)
      };
      elements.push({
        type: 'rockWall',
        x: lowSlab.x + 90,
        y: lowSlab.y - 65,
        w: 42,
        h: 65,
        palette: pal
      });
      elements.push(lowSlab);

      // Right boundary wall at goal
      elements.push({
        type: 'steelBarrier',
        x: goalSlab.x + goalSlab.w - 20,
        y: goalSlab.y - 65,
        w: 20,
        h: 65
      });

      // Ambient crystals
      elements.push({
        type: 'quantumCrystal',
        x: 480 + jx(),
        y: 200 + jy(),
        w: 65,
        h: 18,
        palette: pal,
        profile: R.profile(4, 12, 20)
      });
      elements.push({
        type: 'platform',
        x: 80 + jx(),
        y: 380 + jy(),
        w: 90,
        h: 20,
        palette: pal
      });

      const spawn = { x: forkSlab.x + 60, y: forkSlab.y - 36 };
      const gate = { x: goalSlab.x + goalSlab.w - 55, y: goalSlab.y - 26 };

      const solution = diff.key === 'easy'
        ? ['CLIMB', 'BUILD']
        : diff.key === 'normal'
          ? ['CLIMB', 'FLOAT', 'BUILD']
          : diff.key === 'hard'
            ? ['BLOCK', 'CLIMB', 'FLOAT', 'BUILD']
            : ['BLOCK', 'CLIMB', 'FLOAT', 'BASH', 'BUILD'];

      return { elements, spawn, gate, solution };
    }

    /* -----------------------------------------------------------------------
     * 5. CHAMBER Archetype (Sealed Steel Vault & Floating Quantum Islands)
     * ---------------------------------------------------------------------*/
    static buildChamber(R, diff, pal, stones) {
      const elements = [];
      const jx = () => R.irange(-6, 6);
      const jy = () => R.irange(-4, 4);

      // Top-Left Sealed Vault Floor: y = 115
      const vaultFloor = {
        type: 'volcanicBasalt',
        x: 40 + jx(),
        y: 115 + jy(),
        w: 200,
        h: 22,
        palette: pal === 'cyan' ? 'red' : pal,
        profile: R.profile(6, 16, 28)
      };
      elements.push({
        type: 'steelBarrier',
        x: vaultFloor.x,
        y: vaultFloor.y - 65,
        w: 20,
        h: 65
      });
      elements.push(vaultFloor);

      // Sealed Vault Right Steel Wall & Roof
      elements.push({
        type: 'steelBarrier',
        x: vaultFloor.x + vaultFloor.w - 20,
        y: vaultFloor.y - 75,
        w: 20,
        h: 75
      });
      elements.push({
        type: 'platform',
        x: vaultFloor.x,
        y: vaultFloor.y - 70,
        w: vaultFloor.w,
        h: 18,
        palette: pal
      });

      // Exit Breach: Floor drill hole at vaultFloor.x + 130 down to Island 1 (y = 220, drop 105px > 96px, requires FLOAT)
      const island1 = {
        type: 'quantumCrystal',
        x: 230 + jx(),
        y: 220 + jy(),
        w: 130,
        h: 22,
        palette: pal,
        profile: R.profile(5, 14, 26)
      };
      // Island 2: Gap 48px from Island 1 (Requires BUILD ramp)
      const island2 = {
        type: R.pick(stones),
        x: island1.x + island1.w + 48,
        y: 240 + jy(),
        w: 130,
        h: 24,
        palette: pal,
        profile: R.profile(5, 16, 28)
      };
      elements.push(island1, island2);

      // Rock wall on Island 2 (Requires BASH)
      elements.push({
        type: 'rockWall',
        x: island2.x + 35,
        y: island2.y - 60,
        w: 42,
        h: 60,
        palette: pal
      });

      // Sky Citadel Goal Sanctuary: y = 135 (Reached via 65px climbing wall or BUILD from Island 2)
      const goalPlatform = {
        type: R.pick(stones),
        x: 600 + jx(),
        y: 135 + jy(),
        w: 160,
        h: 24,
        palette: pal,
        profile: R.profile(5, 16, 28)
      };
      // Climbing rock wall to goal
      elements.push({
        type: 'rockWall',
        x: goalPlatform.x - 25,
        y: goalPlatform.y,
        w: 35,
        h: island2.y - goalPlatform.y + 4,
        palette: pal
      });
      elements.push(goalPlatform);

      // Right boundary wall at goal
      elements.push({
        type: 'steelBarrier',
        x: goalPlatform.x + goalPlatform.w - 20,
        y: goalPlatform.y - 65,
        w: 20,
        h: 65
      });

      // Lower safety catch & ambient platforms
      elements.push({
        type: 'platform',
        x: 320 + jx(),
        y: 380,
        w: 150,
        h: 20,
        palette: pal
      });
      elements.push({
        type: 'quantumCrystal',
        x: 680 + jx(),
        y: 320 + jy(),
        w: 75,
        h: 18,
        palette: pal,
        profile: R.profile(4, 12, 20)
      });
      elements.push({
        type: 'platform',
        x: 80 + jx(),
        y: 290 + jy(),
        w: 90,
        h: 18,
        palette: pal
      });

      const spawn = { x: vaultFloor.x + 60, y: vaultFloor.y - 36 };
      const gate = { x: goalPlatform.x + goalPlatform.w - 55, y: goalPlatform.y - 26 };

      const solution = diff.key === 'easy'
        ? ['DRILL', 'BUILD']
        : diff.key === 'normal'
          ? ['DRILL', 'FLOAT', 'BASH', 'BUILD']
          : diff.key === 'hard'
            ? ['DRILL', 'FLOAT', 'BASH', 'CLIMB', 'BUILD']
            : ['DRILL', 'FLOAT', 'BASH', 'CLIMB', 'BUILD'];

      return { elements, spawn, gate, solution };
    }

    /* -----------------------------------------------------------------------
     * 6. ASCENT Archetype (Ground-to-Sky Tower Climb with Strict Steps)
     * ---------------------------------------------------------------------*/
    static buildAscent(R, diff, pal, stones) {
      const elements = [];
      const jx = () => R.irange(-6, 6);
      const jy = () => R.irange(-4, 4);

      // Tier 1: Ground Launch Base (Spawn): y = 375
      const groundSlab = {
        type: R.pick(stones),
        x: 40 + jx(),
        y: 375 + jy(),
        w: 200,
        h: 26,
        palette: pal,
        profile: R.profile(6, 18, 34)
      };
      elements.push({
        type: 'steelBarrier',
        x: groundSlab.x,
        y: groundSlab.y - 65,
        w: 20,
        h: 65
      });
      elements.push(groundSlab);

      // Towering Wall 1 (Base to Tier 2: height 68px, requires CLIMB)
      elements.push({
        type: 'rockWall',
        x: groundSlab.x + groundSlab.w - 38,
        y: 305,
        w: 42,
        h: groundSlab.y - 305,
        palette: pal
      });

      // Tier 2: Terrace starting directly at top of Wall 1: y = 305
      const terraceSlab = {
        type: R.pick(stones),
        x: groundSlab.x + groundSlab.w - 38,
        y: 305,
        w: 220,
        h: 24,
        palette: pal,
        profile: R.profile(6, 16, 30)
      };
      elements.push(terraceSlab);

      // Rock wall on Tier 2 (Requires BASH)
      elements.push({
        type: 'rockWall',
        x: terraceSlab.x + 85,
        y: terraceSlab.y - 60,
        w: 42,
        h: 60,
        palette: pal
      });

      // Towering Wall 2 (Terrace to Tier 3: height 70px, requires CLIMB)
      elements.push({
        type: 'rockWall',
        x: terraceSlab.x + terraceSlab.w - 38,
        y: 235,
        w: 42,
        h: terraceSlab.y - 235,
        palette: pal
      });

      // Tier 3: Plateau starting directly at top of Wall 2: y = 235
      const plateauSlab = {
        type: R.pick(stones),
        x: terraceSlab.x + terraceSlab.w - 38,
        y: 235,
        w: 180,
        h: 24,
        palette: pal,
        profile: R.profile(6, 16, 28)
      };
      elements.push(plateauSlab);

      // Step to Tier 4: Gap of 48px from plateau to Sky Citadel (Solvable by 1 BUILD ramp)
      const skyCitadel = {
        type: 'quantumCrystal',
        x: plateauSlab.x + plateauSlab.w + 48,
        y: 135 + jy(),
        w: 160,
        h: 22,
        palette: pal,
        profile: R.profile(5, 14, 26)
      };
      // Climbing step ramp from plateau
      elements.push({
        type: 'rockWall',
        x: skyCitadel.x - 25,
        y: skyCitadel.y,
        w: 35,
        h: plateauSlab.y - skyCitadel.y + 4,
        palette: pal
      });
      elements.push(skyCitadel);

      // Right boundary wall at goal
      elements.push({
        type: 'steelBarrier',
        x: skyCitadel.x + skyCitadel.w - 20,
        y: skyCitadel.y - 65,
        w: 20,
        h: 65
      });

      // Decoy dead-end runway extending right on ground level into toxic abyss (Hard/Nightmare)
      elements.push({
        type: 'platform',
        x: groundSlab.x + groundSlab.w,
        y: groundSlab.y,
        w: 100,
        h: 18,
        palette: pal
      });

      // Ambient platforms
      elements.push({
        type: 'platform',
        x: 60 + jx(),
        y: 190 + jy(),
        w: 80,
        h: 16,
        palette: pal
      });
      elements.push({
        type: 'quantumCrystal',
        x: 680 + jx(),
        y: 280 + jy(),
        w: 75,
        h: 18,
        palette: pal,
        profile: R.profile(4, 12, 20)
      });

      const spawn = { x: groundSlab.x + 60, y: groundSlab.y - 36 };
      const gate = { x: skyCitadel.x + skyCitadel.w - 55, y: skyCitadel.y - 26 };

      const solution = diff.key === 'easy'
        ? ['CLIMB', 'BUILD']
        : diff.key === 'normal'
          ? ['CLIMB', 'BASH', 'BUILD']
          : diff.key === 'hard'
            ? ['BLOCK', 'CLIMB', 'BASH', 'BUILD']
            : ['BLOCK', 'CLIMB', 'BASH', 'CLIMB', 'BUILD'];

      return { elements, spawn, gate, solution };
    }

    /* -----------------------------------------------------------------------
     * Skill Budget Calculator (Strict Slack Scaling)
     * ---------------------------------------------------------------------*/
    static calculateSkills(solution, diff, R) {
      const skills = {
        climb: 0, float: 0, bash: 0, mine: 0, drill: 0, bomb: 0, build: 0, block: 0, portal: 0
      };

      // Count required skills in solution
      const reqCount = {};
      for (const act of solution) {
        const k = act.toLowerCase();
        reqCount[k] = (reqCount[k] || 0) + 1;
      }

      const allKeys = ['climb', 'float', 'bash', 'mine', 'drill', 'bomb', 'build', 'block', 'portal'];
      const slack = diff.slack;

      for (const k of allKeys) {
        const need = reqCount[k] || 0;
        if (need > 0) {
          const extra = R.irange(slack.requiredMin, slack.requiredMax);
          skills[k] = need + extra;
        } else {
          const extra = R.irange(slack.otherMin, slack.otherMax);
          skills[k] = extra;
        }
      }

      return skills;
    }

    /* -----------------------------------------------------------------------
     * Master Generator Function
     * ---------------------------------------------------------------------*/
    static generate(options = {}) {
      const seed = options.seed != null ? options.seed : (((Math.random() * 1e9) | 0) ^ (Date.now() & 0x7fffffff));
      const rawRNG = makeRNG(seed);
      const R = makeRNGHelpers(rawRNG);

      const diff = this.resolveDifficulty(options.difficulty);
      const { palette, theme, stoneTypes } = this.resolvePaletteAndTheme(options, R);
      const archetype = this.pickArchetype(options.layout, R);

      let layoutResult = null;
      switch (archetype) {
        case 'cascade':
          layoutResult = this.buildCascade(R, diff, palette, stoneTypes);
          break;
        case 'zigzag':
          layoutResult = this.buildZigzag(R, diff, palette, stoneTypes);
          break;
        case 'traverse':
          layoutResult = this.buildTraverse(R, diff, palette, stoneTypes);
          break;
        case 'split':
          layoutResult = this.buildSplit(R, diff, palette, stoneTypes);
          break;
        case 'chamber':
          layoutResult = this.buildChamber(R, diff, palette, stoneTypes);
          break;
        case 'ascent':
          layoutResult = this.buildAscent(R, diff, palette, stoneTypes);
          break;
        default:
          layoutResult = this.buildCascade(R, diff, palette, stoneTypes);
          break;
      }

      // Ensure minimum 13 elements across all archetypes and difficulties
      const ambientSpots = [
        { type: 'quantumCrystal', x: 670, y: 75, w: 80, h: 18, profile: [12, 18, 22, 14] },
        { type: 'platform', x: 280, y: 50, w: 90, h: 16 },
        { type: 'quantumCrystal', x: 60, y: 260, w: 75, h: 18, profile: [14, 20, 16, 12] },
        { type: 'platform', x: 50, y: 395, w: 85, h: 20 },
        { type: 'quantumCrystal', x: 380, y: 410, w: 95, h: 18, profile: [16, 22, 18, 14] }
      ];
      for (const spot of ambientSpots) {
        if (layoutResult.elements.length >= 13) break;
        const distSpawn = Math.hypot(spot.x - layoutResult.spawn.x, spot.y - layoutResult.spawn.y);
        const distGate = Math.hypot(spot.x - layoutResult.gate.x, spot.y - layoutResult.gate.y);
        if (distSpawn > 70 && distGate > 70) {
          layoutResult.elements.push({
            type: spot.type,
            x: spot.x + R.irange(-10, 10),
            y: spot.y + R.irange(-5, 5),
            w: spot.w,
            h: spot.h,
            palette,
            profile: spot.profile
          });
        }
      }

      // If options.dna was provided, override or blend
      const finalSolution = (options.dna && options.dna.length) ? options.dna : layoutResult.solution;
      const skills = this.calculateSkills(finalSolution, diff, R);

      const score = clamp(R.irange(diff.scoreRange[0], diff.scoreRange[1]), 10, 150);
      const titleWord = R.pick(SECTOR_NAMES);
      const stageNo = options.stageNo ? `S${options.stageNo}` : '';
      const title = `[${diff.name}] ${titleWord} ${stageNo} (${diff.name})`.replace(/\s+/g, ' ').trim();

      const desc = `[${archetype.toUpperCase()}] 1:1 물리 결합 전술 구역입니다. (난이도: ${diff.name}, 점수: ${score}pt, 정답: ${finalSolution.join(' → ')})`;

      return {
        id: options.id || 'CUSTOM',
        title,
        desc,
        bgImg: theme,
        terrainTheme: palette,
        totalUnits: diff.units,
        needPercent: diff.needPercent,
        spawnRate: diff.spawnRate,
        timeLimit: diff.timeLimit,
        skills,
        spawnX: Math.round(layoutResult.spawn.x),
        spawnY: Math.round(layoutResult.spawn.y),
        gateX: Math.round(layoutResult.gate.x),
        gateY: Math.round(layoutResult.gate.y),
        elements: layoutResult.elements.map(e => ({
          type: e.type,
          x: Math.round(e.x),
          y: Math.round(e.y),
          w: Math.round(e.w),
          h: Math.round(e.h),
          palette: e.palette,
          profile: e.profile
        })),
        solutionDna: finalSolution.slice(),
        difficultyScore: score,
        difficultyFactors: {
          skillDemand: Math.round(score * 0.28),
          comboDepth: Math.round(score * 0.22),
          hazard: Math.round(score * 0.20),
          steel: Math.round(score * 0.15),
          precision: Math.round(score * 0.15)
        },
        layoutType: archetype,
        _meta: {
          seed,
          archetype,
          difficulty: diff.name,
          elementCount: layoutResult.elements.length
        }
      };
    }
  }

  return { FullCanvasLevelArchitect, DIFF_SPECS, BIOMES };
});
