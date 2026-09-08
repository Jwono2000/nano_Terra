/* ============================================================================
 * FullCanvasLevelArchitect.js — 800x450 풀 캔버스 2D 멀티 티어 절차적 맵 엔진
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
      baseScore: 34,
      scoreRange: [28, 42],
      units: 15,
      needPercent: 55,
      timeLimit: 240,
      spawnRate: 34,
      obstacles: { lethalDrop: 0, steel: 0, decoys: 0, walls: 1 },
      slack: { requiredMin: 3, requiredMax: 5, otherMin: 2, otherMax: 4 }
    },
    normal: {
      key: 'normal',
      name: 'NORMAL',
      baseScore: 66,
      scoreRange: [58, 74],
      units: 18,
      needPercent: 65,
      timeLimit: 180,
      spawnRate: 26,
      obstacles: { lethalDrop: 1, steel: 1, decoys: 1, walls: 2 },
      slack: { requiredMin: 1, requiredMax: 2, otherMin: 1, otherMax: 2 }
    },
    hard: {
      key: 'hard',
      name: 'HARD',
      baseScore: 98,
      scoreRange: [90, 110],
      units: 20,
      needPercent: 75,
      timeLimit: 150,
      spawnRate: 22,
      obstacles: { lethalDrop: 2, steel: 2, decoys: 2, walls: 3 },
      slack: { requiredMin: 0, requiredMax: 1, otherMin: 0, otherMax: 1 }
    },
    nightmare: {
      key: 'nightmare',
      name: 'NIGHTMARE',
      baseScore: 130,
      scoreRange: [124, 142],
      units: 25,
      needPercent: 85,
      timeLimit: 120,
      spawnRate: 16,
      obstacles: { lethalDrop: 3, steel: 3, decoys: 2, walls: 3 },
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
     * 1. CASCADE Archetype (4 Tiers descending Top-Left to Bottom-Right)
     * ---------------------------------------------------------------------*/
    static buildCascade(R, diff, pal, stones) {
      const elements = [];
      const jx = () => R.irange(-14, 14);
      const jy = () => R.irange(-8, 8);
      const jw = () => R.irange(-16, 20);

      // Tier 1: Spawn Platform (x: 40~260, y: 90)
      const t1 = {
        type: R.pick(stones),
        x: clamp(40 + jx(), 20, 70),
        y: clamp(92 + jy(), 80, 110),
        w: clamp(230 + jw(), 190, 270),
        h: 22,
        palette: pal,
        profile: R.profile(6, 14, 28)
      };
      elements.push(t1);

      // Tier 2: Mid-High Landing (x: 170~490, y: 190)
      const t2Y = diff.key === 'easy' ? t1.y + 68 : t1.y + 104; // lethal drop for normal/hard/nightmare
      const t2 = {
        type: R.pick(stones),
        x: clamp(170 + jx(), 140, 210),
        y: clamp(t2Y + jy(), 180, 215),
        w: clamp(310 + jw(), 260, 360),
        h: 24,
        palette: pal,
        profile: R.profile(7, 16, 32)
      };
      elements.push(t2);

      // Obstacle on Tier 2: RockWall (BASH)
      elements.push({
        type: 'rockWall',
        x: clamp(t2.x + 90 + jx(), t2.x + 40, t2.x + 150),
        y: t2.y - 70,
        w: 60,
        h: 70,
        palette: pal
      });

      // Ceiling / Upper Ledge above Tier 2
      elements.push({
        type: 'platform',
        x: t2.x + 130 + jx(),
        y: t2.y - 48,
        w: clamp(110 + jw(), 85, 145),
        h: 16,
        palette: pal
      });

      // Tier 3: Mid-Low Terrace (x: 340~660, y: 285)
      const t3 = {
        type: R.pick(stones),
        x: clamp(340 + jx(), 310, 380),
        y: clamp(285 + jy(), 270, 305),
        w: clamp(290 + jw(), 250, 340),
        h: 24,
        palette: pal,
        profile: R.profile(7, 16, 30)
      };
      elements.push(t3);

      // Barrier between Tier 2 & Tier 3: Steel Barrier or Rock Column forcing DRILL
      if (diff.obstacles.steel > 0) {
        elements.push({
          type: 'steelBarrier',
          x: clamp(t2.x + t2.w - 36, 440, 520),
          y: t2.y - 80,
          w: 22,
          h: 80
        });
      } else {
        elements.push({
          type: 'rockWall',
          x: clamp(t2.x + t2.w - 40, 440, 500),
          y: t2.y - 65,
          w: 45,
          h: 65,
          palette: pal
        });
      }

      // Obstacle on Tier 3: Step-up rock barrier (BUILD)
      elements.push({
        type: 'rockWall',
        x: clamp(t3.x + 120 + jx(), t3.x + 80, t3.x + 160),
        y: t3.y - 50,
        w: 50,
        h: 50,
        palette: pal
      });

      // Tier 4: Goal Platform (x: 480~770, y: 375)
      const t4 = {
        type: R.pick(stones),
        x: clamp(480 + jx(), 450, 520),
        y: clamp(375 + jy(), 360, 395),
        w: clamp(280 + jw(), 240, 310),
        h: 24,
        palette: pal,
        profile: R.profile(6, 16, 32)
      };
      elements.push(t4);

      // Decoy Path or Lower Observation Deck
      elements.push({
        type: 'platform',
        x: clamp(t3.x + t3.w - 40, 580, 640),
        y: t3.y,
        w: 110,
        h: 18,
        palette: pal
      });
      if (diff.obstacles.steel > 1 || diff.key === 'nightmare') {
        elements.push({
          type: 'steelBarrier',
          x: 740,
          y: t3.y - 80,
          w: 20,
          h: 80
        });
      }

      // Aesthetic ambient floating platforms & crystal formations
      elements.push({
        type: 'quantumCrystal',
        x: clamp(60 + jx(), 40, 90),
        y: 260 + jy(),
        w: 80,
        h: 18,
        palette: pal,
        profile: R.profile(4, 12, 22)
      });
      elements.push({
        type: 'platform',
        x: clamp(320 + jx(), 280, 360),
        y: 110 + jy(),
        w: 90,
        h: 16,
        palette: pal
      });
      elements.push({
        type: 'quantumCrystal',
        x: clamp(620 + jx(), 590, 660),
        y: 130 + jy(),
        w: 85,
        h: 18,
        palette: pal,
        profile: R.profile(5, 12, 22)
      });
      elements.push({
        type: 'platform',
        x: clamp(60 + jx(), 40, 90),
        y: 385 + jy(),
        w: 95,
        h: 20,
        palette: pal
      });

      const spawn = { x: t1.x + 50, y: t1.y - 36 };
      const gate = { x: clamp(t4.x + t4.w - 50, 680, 750), y: t4.y - 26 };

      const solution = diff.key === 'easy'
        ? ['BASH', 'BUILD']
        : diff.key === 'normal'
          ? ['FLOAT', 'BASH', 'DRILL', 'BUILD']
          : diff.key === 'hard'
            ? ['FLOAT', 'BASH', 'DRILL', 'BLOCK', 'BUILD']
            : ['FLOAT', 'BASH', 'DRILL', 'BLOCK', 'BUILD', 'BOMB'];

      return { elements, spawn, gate, solution };
    }

    /* -----------------------------------------------------------------------
     * 2. ZIGZAG Archetype (3 Wide Switchback Tiers spanning full 800px width)
     * ---------------------------------------------------------------------*/
    static buildZigzag(R, diff, pal, stones) {
      const elements = [];
      const jx = () => R.irange(-12, 12);
      const jy = () => R.irange(-6, 6);
      const jw = () => R.irange(-18, 18);

      // Tier 1 (Top Runway: Left -> Right): x: 30~740, y: 95
      const t1A = {
        type: R.pick(stones),
        x: 40 + jx(),
        y: clamp(96 + jy(), 84, 108),
        w: clamp(380 + jw(), 330, 420),
        h: 22,
        palette: pal,
        profile: R.profile(8, 16, 30)
      };
      const t1B = {
        type: 'platform',
        x: t1A.x + t1A.w - 10,
        y: t1A.y,
        w: clamp(W - 80 - (t1A.x + t1A.w), 240, 360),
        h: 20,
        palette: pal
      };
      elements.push(t1A, t1B);

      // Barrier at right edge of Tier 1 blocking escape
      if (diff.obstacles.steel > 0) {
        elements.push({
          type: 'steelBarrier',
          x: clamp(t1B.x + t1B.w - 24, 710, 750),
          y: t1A.y - 80,
          w: 20,
          h: 80
        });
      } else {
        elements.push({
          type: 'rockWall',
          x: clamp(t1B.x + t1B.w - 35, 700, 745),
          y: t1A.y - 70,
          w: 40,
          h: 70,
          palette: pal
        });
      }

      // Rock wall on Tier 1 (BASH)
      elements.push({
        type: 'rockWall',
        x: clamp(t1A.x + 220 + jx(), 220, 320),
        y: t1A.y - 65,
        w: 56,
        h: 65,
        palette: pal
      });

      // Tier 2 (Middle Runway: Right -> Left): x: 60~760, y: 225
      const t2Drop = diff.key === 'easy' ? 115 : 130;
      const t2A = {
        type: R.pick(stones),
        x: clamp(380 + jx(), 340, 420),
        y: clamp(t1A.y + t2Drop + jy(), 215, 240),
        w: clamp(360 + jw(), 320, 400),
        h: 24,
        palette: pal,
        profile: R.profile(8, 16, 32)
      };
      const t2B = {
        type: 'platform',
        x: clamp(70 + jx(), 50, 90),
        y: t2A.y,
        w: clamp(t2A.x - 50, 260, 350),
        h: 20,
        palette: pal
      };
      elements.push(t2A, t2B);

      // Obstacles on Tier 2: Low ceiling tunnel (MINE) & Barrier
      elements.push({
        type: 'platform',
        x: clamp(t2A.x - 60, 300, 380),
        y: t2A.y - 42,
        w: 120,
        h: 18,
        palette: pal
      });
      if (diff.obstacles.steel > 1) {
        elements.push({
          type: 'steelBarrier',
          x: clamp(t2B.x + 60, 110, 160),
          y: t2A.y - 80,
          w: 20,
          h: 80
        });
      } else {
        elements.push({
          type: 'rockWall',
          x: clamp(t2B.x + 70, 110, 160),
          y: t2A.y - 55,
          w: 45,
          h: 55,
          palette: pal
        });
      }

      // Tier 3 (Bottom Runway: Left -> Right): x: 50~760, y: 360
      const t3A = {
        type: R.pick(stones),
        x: clamp(40 + jx(), 30, 60),
        y: clamp(360 + jy(), 345, 375),
        w: clamp(340 + jw(), 300, 380),
        h: 24,
        palette: pal,
        profile: R.profile(7, 16, 30)
      };
      // Gap in Tier 3 requiring BUILD stairs
      const t3B = {
        type: R.pick(stones),
        x: clamp(t3A.x + t3A.w + 60 + jx(), 420, 480),
        y: t3A.y,
        w: clamp(W - 40 - (t3A.x + t3A.w + 60), 260, 330),
        h: 24,
        palette: pal,
        profile: R.profile(6, 16, 30)
      };
      elements.push(t3A, t3B);

      // Decoy ledge into void on Tier 2
      elements.push({
        type: 'platform',
        x: 20,
        y: t2A.y,
        w: 60,
        h: 16,
        palette: pal
      });

      // Ambient crystals & secondary platforms
      elements.push({
        type: 'quantumCrystal',
        x: clamp(680 + jx(), 660, 720),
        y: 300 + jy(),
        w: 70,
        h: 18,
        palette: pal,
        profile: R.profile(4, 12, 22)
      });
      elements.push({
        type: 'platform',
        x: clamp(280 + jx(), 250, 320),
        y: 410 + jy(),
        w: 95,
        h: 18,
        palette: pal
      });
      elements.push({
        type: 'quantumCrystal',
        x: clamp(40 + jx(), 20, 60),
        y: 200 + jy(),
        w: 65,
        h: 16,
        palette: pal,
        profile: R.profile(4, 10, 20)
      });

      const spawn = { x: t1A.x + 50, y: t1A.y - 36 };
      const gate = { x: clamp(t3B.x + t3B.w - 50, 680, 750), y: t3B.y - 26 };

      const solution = diff.key === 'easy'
        ? ['BASH', 'BUILD']
        : diff.key === 'normal'
          ? ['BASH', 'FLOAT', 'MINE', 'BUILD']
          : diff.key === 'hard'
            ? ['BASH', 'FLOAT', 'MINE', 'BLOCK', 'BUILD']
            : ['BASH', 'FLOAT', 'MINE', 'DRILL', 'BLOCK', 'BUILD'];

      return { elements, spawn, gate, solution };
    }

    /* -----------------------------------------------------------------------
     * 3. TRAVERSE Archetype (West Fortress & Great Central Chasm)
     * ---------------------------------------------------------------------*/
    static buildTraverse(R, diff, pal, stones) {
      const elements = [];
      const jx = () => R.irange(-12, 12);
      const jy = () => R.irange(-8, 8);
      const jw = () => R.irange(-16, 16);

      // West Fortress Upper Deck (Spawn): x: 30~260, y: 145
      const westUpper = {
        type: R.pick(stones),
        x: clamp(30 + jx(), 20, 50),
        y: clamp(145 + jy(), 130, 160),
        w: clamp(230 + jw(), 190, 260),
        h: 24,
        palette: pal,
        profile: R.profile(6, 16, 32)
      };
      elements.push(westUpper);

      // West Fortress Tower Wall
      elements.push({
        type: 'rockWall',
        x: westUpper.x + westUpper.w - 44,
        y: westUpper.y - 85,
        w: 52,
        h: 85,
        palette: pal
      });

      // West Fortress Lower Terrace: x: 30~220, y: 270
      const westLower = {
        type: 'platform',
        x: westUpper.x,
        y: clamp(270 + jy(), 255, 290),
        w: clamp(190 + jw(), 160, 220),
        h: 20,
        palette: pal
      };
      elements.push(westLower);

      // The Great Chasm (x: 240 ~ 480): Central Stepping Stone Island
      const islandA = {
        type: 'quantumCrystal',
        x: clamp(320 + jx(), 290, 350),
        y: clamp(230 + jy(), 215, 255),
        w: clamp(120 + jw(), 95, 140),
        h: 22,
        palette: pal,
        profile: R.profile(5, 14, 28)
      };
      const islandB = {
        type: 'craggyRock',
        x: clamp(islandA.x + islandA.w + 30 + jx(), 420, 470),
        y: clamp(islandA.y + 40 + jy(), 260, 290),
        w: clamp(100 + jw(), 80, 120),
        h: 20,
        palette: pal,
        profile: R.profile(4, 14, 24)
      };
      elements.push(islandA, islandB);

      // East Citadel Upper Bastion: x: 480~770, y: 155
      const eastUpper = {
        type: R.pick(stones),
        x: clamp(520 + jx(), 490, 550),
        y: clamp(155 + jy(), 140, 170),
        w: clamp(240 + jw(), 210, 270),
        h: 24,
        palette: pal,
        profile: R.profile(6, 16, 32)
      };
      elements.push(eastUpper);

      // Barrier on East Citadel blocking surface entry
      if (diff.obstacles.steel > 0) {
        elements.push({
          type: 'steelBarrier',
          x: clamp(eastUpper.x + 80 + jx(), eastUpper.x + 60, eastUpper.x + 110),
          y: eastUpper.y - 85,
          w: 22,
          h: 85
        });
      } else {
        elements.push({
          type: 'rockWall',
          x: clamp(eastUpper.x + 80 + jx(), eastUpper.x + 60, eastUpper.x + 110),
          y: eastUpper.y - 65,
          w: 48,
          h: 65,
          palette: pal
        });
      }

      // East Citadel Lower Vault (Goal Sanctuary): x: 460~770, y: 350
      const eastLower = {
        type: R.pick(stones),
        x: clamp(470 + jx(), 440, 500),
        y: clamp(350 + jy(), 335, 370),
        w: clamp(290 + jw(), 260, 320),
        h: 26,
        palette: pal,
        profile: R.profile(7, 18, 34)
      };
      elements.push(eastLower);

      // Rock wall in lower vault (BASH)
      elements.push({
        type: 'rockWall',
        x: clamp(eastLower.x + 130 + jx(), eastLower.x + 100, eastLower.x + 170),
        y: eastLower.y - 60,
        w: 50,
        h: 60,
        palette: pal
      });

      // Decoy false springboard over abyss
      elements.push({
        type: 'platform',
        x: clamp(westUpper.x + westUpper.w + 10, 250, 290),
        y: westUpper.y + 40,
        w: 70,
        h: 16,
        palette: pal
      });

      // Ceiling overhang
      elements.push({
        type: 'platform',
        x: eastUpper.x + 100,
        y: 65,
        w: 140,
        h: 16,
        palette: pal
      });

      // Ambient crystal formations
      elements.push({
        type: 'quantumCrystal',
        x: clamp(300 + jx(), 270, 330),
        y: 380 + jy(),
        w: 80,
        h: 18,
        palette: pal,
        profile: R.profile(4, 12, 22)
      });
      elements.push({
        type: 'platform',
        x: clamp(80 + jx(), 50, 110),
        y: 380 + jy(),
        w: 90,
        h: 20,
        palette: pal
      });

      const spawn = { x: westUpper.x + 50, y: westUpper.y - 36 };
      const gate = { x: clamp(eastLower.x + eastLower.w - 50, 680, 750), y: eastLower.y - 26 };

      const solution = diff.key === 'easy'
        ? ['BUILD', 'BASH']
        : diff.key === 'normal'
          ? ['FLOAT', 'BUILD', 'BASH', 'DRILL']
          : diff.key === 'hard'
            ? ['FLOAT', 'BUILD', 'BASH', 'DRILL', 'BLOCK']
            : ['FLOAT', 'BUILD', 'BASH', 'DRILL', 'BLOCK', 'PORTAL'];

      return { elements, spawn, gate, solution };
    }

    /* -----------------------------------------------------------------------
     * 4. SPLIT Archetype (High & Low Dual-Path Labyrinth)
     * ---------------------------------------------------------------------*/
    static buildSplit(R, diff, pal, stones) {
      const elements = [];
      const jx = () => R.irange(-12, 12);
      const jy = () => R.irange(-8, 8);
      const jw = () => R.irange(-16, 16);

      // Forking Station (Spawn): x: 30~210, y: 175
      const forkSlab = {
        type: R.pick(stones),
        x: clamp(30 + jx(), 20, 50),
        y: clamp(175 + jy(), 160, 195),
        w: clamp(200 + jw(), 170, 230),
        h: 22,
        palette: pal,
        profile: R.profile(6, 14, 28)
      };
      elements.push(forkSlab);

      // High Route Platform A: x: 210~410, y: 105 (requires CLIMB or BUILD)
      const highA = {
        type: 'quantumCrystal',
        x: clamp(220 + jx(), 190, 250),
        y: clamp(105 + jy(), 90, 120),
        w: clamp(190 + jw(), 160, 220),
        h: 20,
        palette: pal,
        profile: R.profile(5, 14, 26)
      };
      // High Route Wall (CLIMB)
      elements.push({
        type: 'rockWall',
        x: highA.x - 20,
        y: highA.y,
        w: 36,
        h: forkSlab.y - highA.y + 6,
        palette: pal
      });
      // High Route Platform B: x: 400~590, y: 115
      const highB = {
        type: 'platform',
        x: clamp(highA.x + highA.w + 10, 390, 430),
        y: highA.y + 10,
        w: clamp(180 + jw(), 150, 210),
        h: 20,
        palette: pal
      };
      elements.push(highA, highB);

      // Low Route Platform A (Subterranean Cavern): x: 200~420, y: 315 (requires DRILL)
      const lowA = {
        type: R.pick(stones),
        x: clamp(200 + jx(), 170, 230),
        y: clamp(315 + jy(), 300, 335),
        w: clamp(220 + jw(), 190, 250),
        h: 24,
        palette: pal,
        profile: R.profile(6, 16, 32)
      };
      // Low Route Rock Wall (BASH)
      elements.push({
        type: 'rockWall',
        x: lowA.x + 90,
        y: lowA.y - 65,
        w: 52,
        h: 65,
        palette: pal
      });
      // Low Route Platform B: x: 410~600, y: 330
      const lowB = {
        type: R.pick(stones),
        x: clamp(lowA.x + lowA.w + 10, 400, 440),
        y: lowA.y + 15,
        w: clamp(190 + jw(), 160, 220),
        h: 24,
        palette: pal,
        profile: R.profile(5, 16, 30)
      };
      elements.push(lowA, lowB);

      // Decoy Path: Straight forward into the bottomless void (needs BLOCK)
      const decoySlab = {
        type: 'platform',
        x: forkSlab.x + forkSlab.w - 10,
        y: forkSlab.y,
        w: 130,
        h: 18,
        palette: pal
      };
      elements.push(decoySlab);

      // Convergence Platform (East Landing Dock / Goal): x: 570~770, y: 225
      const goalSlab = {
        type: R.pick(stones),
        x: clamp(580 + jx(), 550, 610),
        y: clamp(225 + jy(), 210, 245),
        w: clamp(200 + jw(), 170, 230),
        h: 24,
        palette: pal,
        profile: R.profile(6, 16, 30)
      };
      elements.push(goalSlab);

      // Barrier on goal platform blocking direct high jump
      if (diff.obstacles.steel > 0) {
        elements.push({
          type: 'steelBarrier',
          x: goalSlab.x + 20,
          y: goalSlab.y - 75,
          w: 20,
          h: 75
        });
      } else {
        elements.push({
          type: 'rockWall',
          x: goalSlab.x + 20,
          y: goalSlab.y - 55,
          w: 45,
          h: 55,
          palette: pal
        });
      }

      // Floating support crystals & platforms
      elements.push({
        type: 'quantumCrystal',
        x: clamp(510 + jx(), 480, 540),
        y: 200 + jy(),
        w: 75,
        h: 18,
        palette: pal,
        profile: R.profile(4, 12, 20)
      });
      elements.push({
        type: 'platform',
        x: clamp(80 + jx(), 50, 110),
        y: 380 + jy(),
        w: 95,
        h: 20,
        palette: pal
      });
      elements.push({
        type: 'quantumCrystal',
        x: clamp(310 + jx(), 280, 340),
        y: 410 + jy(),
        w: 80,
        h: 18,
        palette: pal,
        profile: R.profile(4, 12, 22)
      });

      const spawn = { x: forkSlab.x + 50, y: forkSlab.y - 36 };
      const gate = { x: clamp(goalSlab.x + goalSlab.w - 50, 680, 750), y: goalSlab.y - 26 };

      const solution = diff.key === 'easy'
        ? ['BUILD', 'BASH']
        : diff.key === 'normal'
          ? ['BUILD', 'CLIMB', 'FLOAT', 'BASH']
          : diff.key === 'hard'
            ? ['BLOCK', 'CLIMB', 'FLOAT', 'BASH', 'BUILD']
            : ['BLOCK', 'CLIMB', 'FLOAT', 'BASH', 'DRILL', 'BOMB'];

      return { elements, spawn, gate, solution };
    }

    /* -----------------------------------------------------------------------
     * 5. CHAMBER Archetype (Sealed Steel Vault & Floating Quantum Islands)
     * ---------------------------------------------------------------------*/
    static buildChamber(R, diff, pal, stones) {
      const elements = [];
      const jx = () => R.irange(-12, 12);
      const jy = () => R.irange(-8, 8);
      const jw = () => R.irange(-16, 16);

      // Top-Left Sealed Vault Floor: x: 30~270, y: 120
      const vaultFloor = {
        type: 'volcanicBasalt',
        x: clamp(30 + jx(), 20, 50),
        y: clamp(120 + jy(), 105, 135),
        w: clamp(240 + jw(), 210, 270),
        h: 24,
        palette: pal === 'cyan' ? 'red' : pal,
        profile: R.profile(6, 16, 30)
      };
      elements.push(vaultFloor);

      // Vault Steel Walls & Roof
      elements.push({
        type: 'steelBarrier',
        x: vaultFloor.x + vaultFloor.w - 24,
        y: vaultFloor.y - 85,
        w: 22,
        h: 85
      });
      elements.push({
        type: 'platform',
        x: vaultFloor.x,
        y: vaultFloor.y - 80,
        w: vaultFloor.w,
        h: 18,
        palette: pal
      });

      // Central Void Floating Islands
      const island1 = {
        type: 'quantumCrystal',
        x: clamp(290 + jx(), 260, 320),
        y: clamp(220 + jy(), 200, 240),
        w: clamp(120 + jw(), 95, 145),
        h: 22,
        palette: pal,
        profile: R.profile(5, 14, 28)
      };
      const island2 = {
        type: R.pick(stones),
        x: clamp(430 + jx(), 400, 460),
        y: clamp(290 + jy(), 270, 310),
        w: clamp(130 + jw(), 105, 155),
        h: 24,
        palette: pal,
        profile: R.profile(5, 16, 30)
      };
      const island3 = {
        type: 'quantumCrystal',
        x: clamp(560 + jx(), 530, 590),
        y: clamp(210 + jy(), 190, 230),
        w: clamp(120 + jw(), 95, 145),
        h: 22,
        palette: pal,
        profile: R.profile(5, 14, 28)
      };
      elements.push(island1, island2, island3);

      // Sky Sanctuary Citadel (Goal): x: 620~770, y: 135
      const goalPlatform = {
        type: R.pick(stones),
        x: clamp(630 + jx(), 600, 660),
        y: clamp(135 + jy(), 120, 155),
        w: clamp(150 + jw(), 130, 180),
        h: 24,
        palette: pal,
        profile: R.profile(5, 16, 30)
      };
      elements.push(goalPlatform);

      // Rock wall on Island 2 (BASH)
      elements.push({
        type: 'rockWall',
        x: island2.x + 35,
        y: island2.y - 55,
        w: 48,
        h: 55,
        palette: pal
      });

      // Bottom Safety Catch / Lower Terraces
      const bottomCatch = {
        type: 'platform',
        x: clamp(340 + jx(), 310, 370),
        y: 380,
        w: 160,
        h: 20,
        palette: pal
      };
      elements.push(bottomCatch);

      if (diff.obstacles.steel > 1) {
        elements.push({
          type: 'steelBarrier',
          x: goalPlatform.x - 10,
          y: goalPlatform.y - 70,
          w: 20,
          h: 70
        });
      } else {
        elements.push({
          type: 'rockWall',
          x: goalPlatform.x - 15,
          y: goalPlatform.y - 55,
          w: 40,
          h: 55,
          palette: pal
        });
      }

      // Ambient floating crystal formations
      elements.push({
        type: 'quantumCrystal',
        x: clamp(680 + jx(), 650, 710),
        y: 320 + jy(),
        w: 75,
        h: 18,
        palette: pal,
        profile: R.profile(4, 12, 22)
      });
      elements.push({
        type: 'platform',
        x: clamp(80 + jx(), 50, 110),
        y: 290 + jy(),
        w: 90,
        h: 18,
        palette: pal
      });
      elements.push({
        type: 'quantumCrystal',
        x: clamp(480 + jx(), 450, 510),
        y: 110 + jy(),
        w: 80,
        h: 16,
        palette: pal,
        profile: R.profile(4, 10, 20)
      });

      const spawn = { x: vaultFloor.x + 50, y: vaultFloor.y - 36 };
      const gate = { x: clamp(goalPlatform.x + goalPlatform.w - 45, 680, 750), y: goalPlatform.y - 26 };

      const solution = diff.key === 'easy'
        ? ['DRILL', 'BUILD']
        : diff.key === 'normal'
          ? ['BOMB', 'FLOAT', 'BUILD', 'BASH']
          : diff.key === 'hard'
            ? ['BOMB', 'FLOAT', 'BUILD', 'BASH', 'PORTAL']
            : ['BOMB', 'FLOAT', 'BUILD', 'BASH', 'BLOCK', 'PORTAL'];

      return { elements, spawn, gate, solution };
    }

    /* -----------------------------------------------------------------------
     * 6. ASCENT Archetype (Inverted Ground-to-Sky Tower Climb)
     * ---------------------------------------------------------------------*/
    static buildAscent(R, diff, pal, stones) {
      const elements = [];
      const jx = () => R.irange(-12, 12);
      const jy = () => R.irange(-8, 8);
      const jw = () => R.irange(-16, 16);

      // Tier 1: Ground Launch Base (Spawn): x: 30~250, y: 380
      const groundSlab = {
        type: R.pick(stones),
        x: clamp(30 + jx(), 20, 50),
        y: clamp(380 + jy(), 365, 395),
        w: clamp(230 + jw(), 190, 260),
        h: 26,
        palette: pal,
        profile: R.profile(6, 18, 34)
      };
      elements.push(groundSlab);

      // Towering Wall 1 (Base to Tier 2: requires CLIMB or BUILD)
      elements.push({
        type: 'rockWall',
        x: groundSlab.x + groundSlab.w - 46,
        y: groundSlab.y - 110,
        w: 56,
        h: 110,
        palette: pal
      });

      // Tier 2: Mid-Level Terrace: x: 180~480, y: 275
      const terraceSlab = {
        type: R.pick(stones),
        x: clamp(200 + jx(), 170, 230),
        y: clamp(275 + jy(), 260, 295),
        w: clamp(280 + jw(), 240, 320),
        h: 24,
        palette: pal,
        profile: R.profile(7, 16, 32)
      };
      elements.push(terraceSlab);

      // Rock wall on Tier 2 (BASH)
      elements.push({
        type: 'rockWall',
        x: terraceSlab.x + 90,
        y: terraceSlab.y - 60,
        w: 52,
        h: 60,
        palette: pal
      });

      // Towering Wall 2 (Tier 2 to Tier 3)
      elements.push({
        type: 'rockWall',
        x: terraceSlab.x + terraceSlab.w - 44,
        y: terraceSlab.y - 105,
        w: 54,
        h: 105,
        palette: pal
      });

      // Tier 3: High Plateau: x: 360~640, y: 175
      const plateauSlab = {
        type: R.pick(stones),
        x: clamp(380 + jx(), 350, 410),
        y: clamp(175 + jy(), 160, 195),
        w: clamp(260 + jw(), 220, 300),
        h: 24,
        palette: pal,
        profile: R.profile(6, 16, 30)
      };
      elements.push(plateauSlab);

      // Barrier on High Plateau forcing detour
      if (diff.obstacles.steel > 0) {
        elements.push({
          type: 'steelBarrier',
          x: plateauSlab.x + 110,
          y: plateauSlab.y - 75,
          w: 20,
          h: 75
        });
      } else {
        elements.push({
          type: 'rockWall',
          x: plateauSlab.x + 110,
          y: plateauSlab.y - 55,
          w: 48,
          h: 55,
          palette: pal
        });
      }

      // Tier 4: Sky Citadel Peak (Goal): x: 530~770, y: 90
      const skyCitadel = {
        type: 'quantumCrystal',
        x: clamp(540 + jx(), 510, 570),
        y: clamp(92 + jy(), 80, 108),
        w: clamp(220 + jw(), 190, 250),
        h: 22,
        palette: pal,
        profile: R.profile(6, 14, 28)
      };
      elements.push(skyCitadel);

      // Decoy dead-end runway extending right on ground level into toxic abyss
      elements.push({
        type: 'platform',
        x: groundSlab.x + groundSlab.w,
        y: groundSlab.y,
        w: 120,
        h: 18,
        palette: pal
      });

      // Ambient support platforms & crystal formations
      elements.push({
        type: 'platform',
        x: clamp(60 + jx(), 40, 80),
        y: 190 + jy(),
        w: 80,
        h: 16,
        palette: pal
      });
      elements.push({
        type: 'quantumCrystal',
        x: clamp(680 + jx(), 650, 710),
        y: 280 + jy(),
        w: 75,
        h: 18,
        palette: pal,
        profile: R.profile(4, 12, 22)
      });
      elements.push({
        type: 'platform',
        x: clamp(330 + jx(), 300, 360),
        y: 80 + jy(),
        w: 90,
        h: 16,
        palette: pal
      });

      const spawn = { x: groundSlab.x + 50, y: groundSlab.y - 36 };
      const gate = { x: clamp(skyCitadel.x + skyCitadel.w - 50, 680, 750), y: skyCitadel.y - 26 };

      const solution = diff.key === 'easy'
        ? ['BUILD', 'CLIMB']
        : diff.key === 'normal'
          ? ['BUILD', 'CLIMB', 'BASH', 'BUILD']
          : diff.key === 'hard'
            ? ['BLOCK', 'BUILD', 'CLIMB', 'BASH', 'BUILD']
            : ['BLOCK', 'BUILD', 'CLIMB', 'BASH', 'DRILL', 'BUILD'];

      return { elements, spawn, gate, solution };
    }

    /* -----------------------------------------------------------------------
     * Skill Budget Calculator (Exact Slack Scaling)
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

      // If options.dna was provided, override or blend
      const finalSolution = (options.dna && options.dna.length) ? options.dna : layoutResult.solution;
      const skills = this.calculateSkills(finalSolution, diff, R);

      const score = clamp(R.irange(diff.scoreRange[0], diff.scoreRange[1]), 10, 150);
      const titleWord = R.pick(SECTOR_NAMES);
      const stageNo = options.stageNo ? `S${options.stageNo}` : '';
      const title = `[${diff.name}] ${titleWord} ${stageNo} (${diff.name})`.replace(/\s+/g, ' ').trim();

      const desc = `[${archetype.toUpperCase()}] 아키타입의 AI 역방향 제약 전술 구역입니다. (난이도: ${diff.name}, 점수: ${score}pt, 솔루션: ${finalSolution.join(' → ')})`;

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
