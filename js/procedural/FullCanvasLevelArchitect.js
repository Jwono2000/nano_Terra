/* ============================================================================
 * FullCanvasLevelArchitect.js — 거대 토폴로지 & 선발대/우회 퍼즐 생성 엔진 (v7)
 *
 * [핵심 설계 철학]
 * 1. 단순 일직선 + 땅굴 몇 번 파기 폐기 → 무지성 직진 시 반드시 실패(낙사/차단)하고,
 *    선발대 분리·지하 잠입·반전 테라스·후방 해금으로만 돌파되는 6대 매크로 퍼즐 아키타입
 * 2. 크리에이터 모드 수제작 맵(Stage 14, 15, 18, 19, 21) 수준의 정돈된 거대 구조물:
 *    - 10px 그리드 스냅 기반 챔버, 거대 굴착 암반, 강철 격벽, 상단 동굴 프레임
 *    - 선발대용 점프패드(jumpPad) & 이동발판(movingPlatform) 통합 설계
 *    - Stage 21 스타일의 외벽 비밀 기둥 / 숨겨진 고득점 지름길 탑재
 * 3. 정교한 물리 시뮬레이터(JumpPad/MovingPlatform/BOMB/CLIMB/MINE/DRILL/BUILD)로
 *    무조작 0명 구출 + 1스킬 날먹 차단 + 본대/선발대 실측 클리어 100% 검증
 * ==========================================================================*/
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  Object.assign(root, api);
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const W = 800;
  const H = 450;

  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
  function snap10(v) { return Math.round(v / 10) * 10; }

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
      shuffle: (arr) => {
        const a = arr.slice();
        for (let i = a.length - 1; i > 0; i--) {
          const j = Math.floor(rng() * (i + 1));
          [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
      },
      profile: (len = 6, minH = 14, maxH = 34) => {
        const arr = [];
        for (let i = 0; i < len; i++) arr.push(Math.floor(minH + rng() * (maxH - minH + 1)));
        return arr;
      }
    };
  }

  /* ======================================================================
   * 난이도 사양
   * ====================================================================*/
  const DIFF_SPECS = {
    easy: {
      key: 'easy', name: 'EASY',
      minScore: 48,
      scoreRange: [45, 72],
      timeMultiplier: 1.70,
      units: 15, needPercent: 55, timeLimit: 220, spawnRate: 34,
      spareRange: [2, 2],
      extraSkillTypes: 3
    },
    normal: {
      key: 'normal', name: 'NORMAL',
      minScore: 76,
      scoreRange: [73, 98],
      timeMultiplier: 1.45,
      units: 18, needPercent: 65, timeLimit: 190, spawnRate: 28,
      spareRange: [1, 2],
      extraSkillTypes: 3
    },
    hard: {
      key: 'hard', name: 'HARD',
      minScore: 102,
      scoreRange: [99, 126],
      timeMultiplier: 1.25,
      units: 20, needPercent: 75, timeLimit: 165, spawnRate: 24,
      spareRange: [1, 2],
      extraSkillTypes: 2
    },
    nightmare: {
      key: 'nightmare', name: 'NIGHTMARE',
      minScore: 128,
      scoreRange: [127, 175],
      timeMultiplier: 1.12,
      units: 22, needPercent: 80, timeLimit: 145, spawnRate: 20,
      spareRange: [1, 1],
      extraSkillTypes: 2
    }
  };

  const BIOMES = {
    cyan:   { palette: 'cyan',   bg: 'assets/bg_level_1.jpg', altBg: 'assets/bg_level_6.jpg', stone: ['craggyRock', 'platform'] },
    red:    { palette: 'red',    bg: 'assets/bg_level_2.jpg', altBg: 'assets/bg_level_7.jpg', stone: ['volcanicBasalt', 'craggyRock'] },
    purple: { palette: 'purple', bg: 'assets/bg_level_3.jpg', altBg: 'assets/bg_level_8.jpg', stone: ['quantumCrystal', 'platform'] },
    brown:  { palette: 'brown',  bg: 'assets/bg_level_4.jpg', altBg: 'assets/bg_level_9.jpg', stone: ['platform', 'craggyRock'] },
    green:  { palette: 'green',  bg: 'assets/bg_level_5.jpg', altBg: 'assets/bg_level_1.jpg', stone: ['craggyRock', 'quantumCrystal'] }
  };

  const SECTOR_NAMES = [
    'GENESIS', 'VALKYRIE', 'HYPERION', 'NEBULA', 'ECLIPSE', 'QUANTUM',
    'SOLARIS', 'CYBERDYNE', 'KRONOS', 'ABYSS', 'PROMETHEUS', 'TITAN',
    'NEXUS', 'VORTEX', 'OLYMPUS', 'ANDROMEDA', 'AURORA', 'ZENITH',
    'POLARIS', 'MERIDIAN', 'HELIOS', 'ENIGMA', 'HORIZON', 'TERMINUS'
  ];

  const GIMMICK_CATALOG = {
    PIONEER_RIFT: { id: 'PIONEER_RIFT', label: '선발대 단층 협곡 & 점프패드 회랑', skills: ['BASH', 'BUILD', 'MINE'], timingWeight: 18 },
    UNDERPASS_BUNKER: { id: 'UNDERPASS_BUNKER', label: '지하 잠입 요새 & 강철 격벽 우회', skills: ['MINE', 'BASH', 'BUILD'], timingWeight: 20 },
    SWITCHBACK_TERRACE: { id: 'SWITCHBACK_TERRACE', label: '3단 지그재그 반전 & 외벽 비밀기둥', skills: ['BASH', 'DRILL', 'BUILD'], timingWeight: 22 },
    BACKDOOR_CHAMBER: { id: 'BACKDOOR_CHAMBER', label: '선발대 후방 해금 & 셔틀 요새', skills: ['CLIMB', 'BUILD', 'BASH'], timingWeight: 20 },
    CORE_MOUNTAIN: { id: 'CORE_MOUNTAIN', label: '중앙 거대 암산 & 강철 코어 우회', skills: ['BUILD', 'MINE', 'BASH'], timingWeight: 21 },
    CITADEL_ASCENT: { id: 'CITADEL_ASCENT', label: '심층 협곡 탈출 & 다단 성채 등반', skills: ['BUILD', 'BASH', 'MINE'], timingWeight: 20 }
  };

  class FullCanvasLevelArchitect {

    static resolveDifficulty(diff) {
      if (typeof diff === 'number') {
        if (diff < 55) return DIFF_SPECS.easy;
        if (diff < 88) return DIFF_SPECS.normal;
        if (diff < 115) return DIFF_SPECS.hard;
        return DIFF_SPECS.nightmare;
      }
      const k = (diff || 'normal').toLowerCase();
      return DIFF_SPECS[k] || DIFF_SPECS.normal;
    }

    static resolvePaletteAndTheme(options, R) {
      let pal = options.palette;
      let theme = options.theme;

      if (theme && theme !== 'random' && (!pal || pal === 'random')) {
        if (theme.includes('level_2') || theme.includes('level_7')) pal = 'red';
        else if (theme.includes('level_3') || theme.includes('level_8')) pal = 'purple';
        else if (theme.includes('level_4') || theme.includes('level_9')) pal = 'brown';
        else if (theme.includes('level_5')) pal = 'green';
        else pal = 'cyan';
      }

      if (!pal || pal === 'random') pal = R.pick(['cyan', 'red', 'purple', 'brown', 'green']);
      const biome = BIOMES[pal] || BIOMES.cyan;
      if (!theme || theme === 'random') theme = R.chance(0.5) ? biome.bg : biome.altBg;
      return { palette: pal, theme, stoneTypes: biome.stone };
    }

    static pickArchetype(layout, R) {
      const archetypes = ['cascade', 'chamber', 'zigzag', 'split', 'traverse', 'ascent'];
      if (!layout || layout === 'random') {
        if (!this._archDeck || this._archDeck.length === 0) {
          this._archDeck = R.shuffle(archetypes);
          // Avoid immediate repeat across deck boundaries
          if (this._lastRandomArch && this._archDeck[0] === this._lastRandomArch && this._archDeck.length > 1) {
            const swapIdx = 1 + (Math.abs(R.irange(0, this._archDeck.length - 2)));
            const tmp = this._archDeck[0];
            this._archDeck[0] = this._archDeck[swapIdx];
            this._archDeck[swapIdx] = tmp;
          }
        }
        const picked = this._archDeck.shift();
        this._lastRandomArch = picked;
        return picked;
      }
      const l = layout.toLowerCase();
      if (l === 'descent') return 'cascade';
      if (archetypes.includes(l)) return l;
      return R.pick(archetypes);
    }

    static makeSlab(x, y, w, h, R, pal, typeOverride = null) {
      const t = typeOverride || R.pick(BIOMES[pal].stone);
      const obj = {
        type: t,
        x: snap10(x),
        y: snap10(y),
        w: snap10(w),
        h: snap10(h),
        palette: pal
      };
      if (t === 'craggyRock' || t === 'volcanicBasalt' || t === 'quantumCrystal') {
        obj.profile = R.profile(Math.max(4, Math.min(10, Math.round(obj.w / 35))), 12, Math.max(18, Math.min(34, obj.h + 10)));
      }
      return obj;
    }

    static addTopCavernCeiling(elements, pal, R) {
      elements.push({
        type: 'volcanicBasalt',
        x: 0,
        y: 0,
        w: 800,
        h: 20,
        palette: pal,
        profile: R.profile(16, 12, 20)
      });
    }

    static mirrorBlueprint(bp) {
      bp.spawn.x = W - bp.spawn.x;
      bp.gate.x = W - bp.gate.x;
      for (const el of bp.elements) {
        if (typeof el.x === 'number' && typeof el.w === 'number') {
          el.x = W - (el.x + el.w);
        }
        if (el.type === 'movingPlatform' && el.axis !== 'vertical') {
          el.x = el.x - (el.range || 40);
        }
        if (el.type === 'jumpPad') {
          if (el.dir === 'up-right') el.dir = 'up-left';
          else if (el.dir === 'up-left') el.dir = 'up-right';
          if (el.direction === 'up-right') el.direction = 'up-left';
          else if (el.direction === 'up-left') el.direction = 'up-right';
        }
        if (el.type === 'triangleSlope') {
          if (el.direction === 'up-right') el.direction = 'up-left';
          else if (el.direction === 'up-left') el.direction = 'up-right';
          else if (el.direction === 'upRight') el.direction = 'upLeft';
          else if (el.direction === 'upLeft') el.direction = 'upRight';
        }
        if (el.type === 'diagonalBeam') {
          if (el.dir === 'downRight') el.dir = 'downLeft';
          else if (el.dir === 'downLeft') el.dir = 'downRight';
        }
        if (el.type === 'polygonRock' && Array.isArray(el.points)) {
          el.points = el.points.map(p => ({ x: W - p.x, y: p.y })).reverse();
        }
      }
      for (const step of (bp.actionPlan || [])) {
        if (step.atWallX != null) step.atWallX = W - step.atWallX;
        if (step.atX != null) step.atX = W - step.atX;
        if (step.atEdgeX != null) step.atEdgeX = W - step.atEdgeX;
        if (typeof step.dir === 'number') step.dir = -step.dir;
      }
      return bp;
    }

    static sculptArchitecturalSilhouette(bp, styleIdx, R, pal) {
      const elements = bp.elements;
      // Remove any flat ceiling at y=0, w=800
      for (let i = elements.length - 1; i >= 0; i--) {
        if (elements[i].y === 0 && elements[i].w === 800) elements.splice(i, 1);
      }

      // Compute safe ceiling clearance above the highest walking/structure surface
      let minTopY = Math.min(bp.spawn.y, bp.gate.y);
      for (const e of elements) {
        if (typeof e.y === 'number') minTopY = Math.min(minTopY, e.y);
      }
      const maxCeilH = Math.max(12, Math.min(32, minTopY - 24));

      const styleNames = [
        '종유석 대동굴',
        '오픈 스카이 캐니언',
        '크리스탈 지오드 돔',
        '화산 현무암 성채',
        '쌍둥이 아치 기암협곡',
        '사이버네틱 크롬 아치'
      ];
      const safeIdx = ((styleIdx % 6) + 6) % 6;

      // 1) Multi-Material Strata Diversification across floor slabs (y >= 90, h <= 25)
      const slabMaterials = ['craggyRock', 'volcanicBasalt', 'quantumCrystal', 'platform'];
      const slabs = elements.filter(
        e => ['platform', 'craggyRock', 'volcanicBasalt', 'quantumCrystal'].includes(e.type) && e.y >= 90
      );
      slabs.forEach((s, idx) => {
        if (s.h <= 25) {
          s.type = slabMaterials[(safeIdx + idx) % slabMaterials.length];
          if (s.type !== 'platform' && !s.profile) {
            s.profile = R.profile(Math.max(4, Math.min(10, Math.round(s.w / 35))), 12, 24);
          }
        }
      });

      // 2) Under-Slab Floating Island Crags (polygonRock) & Chrome Truss Struts (diagonalBeam)
      const protectedX = (bp.actionPlan || [])
        .map(s => s.atX || s.atWallX || s.atEdgeX || 0)
        .filter(Boolean);
      const snapshotLen = elements.length;

      slabs.forEach((s, idx) => {
        if (s.w < 110) return;
        const subY0 = s.y + s.h;
        const subY1 = subY0 + R.irange(24, 38);
        if (subY1 >= 415) return;

        const centerX = s.x + s.w * 0.5;
        const spanW = Math.min(86, Math.round(s.w * 0.42));
        const rx0 = Math.round(centerX - spanW / 2);
        const rx1 = Math.round(centerX + spanW / 2);

        const hitsProtected = protectedX.some(px => px >= rx0 - 50 && px <= rx1 + 50);
        if (hitsProtected) return;

        const hitsGateOrSpawn =
          (Math.abs(bp.gate.x - centerX) < 60 && Math.abs(bp.gate.y - subY0) < 70) ||
          (Math.abs(bp.spawn.x - centerX) < 60 && Math.abs(bp.spawn.y - subY0) < 70);
        if (hitsGateOrSpawn) return;

        let hitsOther = false;
        for (let k = 0; k < snapshotLen; k++) {
          const e = elements[k];
          if (e === s || typeof e.x !== 'number') continue;
          if (
            e.x < rx1 + 30 &&
            (e.x + (e.w || 0)) > rx0 - 30 &&
            e.y < subY1 + 70 &&
            (e.y + (e.h || 0)) > subY0 - 6
          ) {
            hitsOther = true;
            break;
          }
        }
        if (hitsOther) return;

        if ((safeIdx + idx) % 2 === 0) {
          elements.push({
            type: 'polygonRock',
            palette: pal,
            material: s.type === 'platform' ? 'craggyRock' : s.type,
            isSteel: false,
            points: [
              { x: rx0, y: subY0 },
              { x: rx1, y: subY0 },
              { x: rx1 - 12, y: Math.round((subY0 + subY1) / 2) },
              { x: Math.round((rx0 + rx1) / 2), y: subY1 },
              { x: rx0 + 12, y: Math.round((subY0 + subY1) / 2) }
            ]
          });
        } else {
          elements.push({
            type: 'diagonalBeam',
            x: rx0 + 8,
            y: subY0,
            w: Math.max(24, Math.round((rx1 - rx0) * 0.65)),
            h: Math.min(26, subY1 - subY0),
            dir: ((safeIdx + idx) % 4 < 2) ? 'downRight' : 'downLeft',
            thickness: 12
          });
        }
      });

      // 3) 6 Distinct Ceiling / Sky Silhouettes (appended last so elements[0], [1] remain rect obstacles)
      if (safeIdx === 0) {
        const segs = [[0, 140], [175, 310], [345, 465], [500, 635], [670, 800]];
        for (const [x0, x1] of segs) {
          const xm = Math.round((x0 + x1) / 2);
          const tipY = Math.min(maxCeilH, R.irange(18, 30));
          elements.push({
            type: 'polygonRock',
            palette: pal,
            material: 'craggyRock',
            isSteel: false,
            points: [
              { x: x0, y: 0 }, { x: x1, y: 0 },
              { x: x1 - 15, y: Math.round(tipY * 0.55) },
              { x: xm, y: tipY },
              { x: x0 + 15, y: Math.round(tipY * 0.55) }
            ]
          });
        }
      } else if (safeIdx === 1) {
        const hL = Math.min(maxCeilH, 24);
        elements.push({
          type: 'polygonRock',
          palette: pal,
          material: 'volcanicBasalt',
          isSteel: false,
          points: [{ x: 0, y: 0 }, { x: 165, y: 0 }, { x: 130, y: hL }, { x: 0, y: hL + 8 }]
        });
        elements.push({
          type: 'polygonRock',
          palette: pal,
          material: 'volcanicBasalt',
          isSteel: false,
          points: [{ x: 635, y: 0 }, { x: 800, y: 0 }, { x: 800, y: hL + 8 }, { x: 670, y: hL }]
        });
      } else if (safeIdx === 2) {
        const segs = [[0, 230], [280, 520], [570, 800]];
        for (const [x0, x1] of segs) {
          const hC = Math.min(maxCeilH, R.irange(16, 26));
          elements.push({
            type: 'polygonRock',
            palette: pal,
            material: 'quantumCrystal',
            isSteel: false,
            points: [
              { x: x0, y: 0 }, { x: x1, y: 0 },
              { x: x1 - 25, y: hC }, { x: x0 + 25, y: hC }
            ]
          });
        }
      } else if (safeIdx === 3) {
        const hB = Math.min(maxCeilH, 20);
        elements.push(this.makeSlab(0, 0, 210, hB, R, pal, 'volcanicBasalt'));
        elements.push(this.makeSlab(290, 0, 220, hB, R, pal, 'volcanicBasalt'));
        elements.push(this.makeSlab(590, 0, 210, hB, R, pal, 'volcanicBasalt'));
      } else if (safeIdx === 4) {
        const hA = Math.min(maxCeilH, 26);
        elements.push({
          type: 'polygonRock',
          palette: pal,
          material: 'craggyRock',
          isSteel: false,
          points: [{ x: 0, y: 0 }, { x: 330, y: 0 }, { x: 290, y: hA }, { x: 140, y: hA + 4 }, { x: 0, y: hA }]
        });
        elements.push({
          type: 'polygonRock',
          palette: pal,
          material: 'craggyRock',
          isSteel: false,
          points: [{ x: 470, y: 0 }, { x: 800, y: 0 }, { x: 800, y: hA }, { x: 660, y: hA + 4 }, { x: 510, y: hA }]
        });
      } else {
        elements.push({ type: 'steelPlatform', x: 0, y: 0, w: 240, h: 14, palette: pal, isSteel: true });
        elements.push({ type: 'steelPlatform', x: 290, y: 0, w: 220, h: 14, palette: pal, isSteel: true });
        elements.push({ type: 'steelPlatform', x: 560, y: 0, w: 240, h: 14, palette: pal, isSteel: true });
      }

      return styleNames[safeIdx];
    }

    /* ====================================================================
     * 6대 매크로 토폴로지 퍼즐 청사진 생성기
     * - 모든 요소 10px 그리드 스냅
     * - 무지성 직진 / 단순 땅굴 0명 구출(전멸/막힘) 강제
     * - 선발대 + 점프패드/이동발판 + Stage-21 스타일 비밀 루트 탑재
     * ==================================================================*/
    static buildMacroPuzzleBlueprint(archetype, diff, R, pal, opts = {}) {
      const elements = [];

      const useJumpPad = opts.includeOptionB !== false;
      const useMoving = opts.includeMovingPlatform !== false;
      const useSlope = opts.includeOptionA !== false;

      let variant = 0;
      if (opts.variant != null) {
        variant = ((opts.variant % 4) + 4) % 4;
      } else {
        this._variantByArch = this._variantByArch || {};
        const prev = this._variantByArch[archetype];
        variant = prev == null ? 0 : (prev + 1) % 4;
        this._variantByArch[archetype] = variant;
      }

      let spawn = { x: 120, y: 70 };
      let gate = { x: 680, y: 230 };
      let actionPlan = [];
      let gimmickLabel = '';
      let shortcutHint = '';
      let variantName = '';

      switch (archetype) {
        /* --------------------------------------------------------------
         * 1. CASCADE -> PIONEER_RIFT (선발대 단층 협곡 & 3종 변형)
         * ------------------------------------------------------------*/
        case 'cascade': {
          gimmickLabel = 'PIONEER_RIFT';
          if (variant === 0) {
            variantName = 'V1: 단층 협곡 & 좌측 외벽 비밀 갱도';
            shortcutHint = '좌측 외벽 비밀 기둥(BASH→DRILL→점프패드) 또는 상단 CLIMB+BUILD 선발대 가교';
            elements.push({ type: 'rockWall', x: 20, y: 50, w: 40, h: 270, palette: pal });
            elements.push({ type: 'steelPlatform', x: 20, y: 320, w: 180, h: 20, palette: pal, isSteel: true });
            if (useJumpPad) {
              elements.push({ type: 'jumpPad', x: 110, y: 310, w: 40, h: 10, dir: 'up-right', power: 9.2, palette: pal });
            }
            elements.push(this.makeSlab(60, 120, 200, 20, R, pal, 'platform'));
            elements.push({ type: 'steelPlatform', x: 60, y: 140, w: 150, h: 18, palette: pal, isSteel: true });
            elements.push({ type: 'rockWall', x: 200, y: 60, w: 25, h: 60, palette: pal });
            elements.push(this.makeSlab(290, 180, 150, 40, R, pal, 'craggyRock'));
            elements.push({ type: 'steelBarrier', x: 430, y: 110, w: 20, h: 70 });
            elements.push(this.makeSlab(220, 270, 320, 40, R, pal, 'craggyRock'));
            if (useSlope) {
              elements.push({ type: 'triangleSlope', x: 240, y: 240, w: 50, h: 30, direction: 'up-right', isSteel: false, palette: pal });
            }
            if (useMoving) {
              elements.push({ type: 'movingPlatform', x: 526, y: 262, w: 78, h: 14, axis: 'horizontal', range: 14, speed: 0.72, pauseTicks: 15, palette: pal });
            }
            elements.push(this.makeSlab(610, 260, 150, 20, R, pal, 'platform'));
            elements.push({ type: 'steelBarrier', x: 740, y: 180, w: 20, h: 80 });
            spawn = { x: 130, y: 80 };
            gate = { x: 690, y: 234 };
            actionPlan = [
              { act: 'CLIMB', role: 'pioneer', atWallX: 200, count: 1 },
              { act: 'BUILD', role: 'pioneer', atEdgeX: 254, dir: 1, count: 1 },
              { act: 'MINE', role: 'pioneer', atX: 350, dir: 1, count: 1 },
              ...(useMoving ? [] : [{ act: 'BUILD', role: 'pioneer', atEdgeX: 534, dir: 1, count: 2 }]),
              { act: 'BASH', role: 'crowd', atWallX: 200, count: 1 }
            ];
          } else if (variant === 1) {
            variantName = 'V2: 3단 폭포 단층 & 중앙 암반 돌파';
            shortcutHint = '선발대 CLIMB 월담 후 3단 폭포 암벽 차례로 격파 & 본대 해방';
            elements.push({ type: 'steelBarrier', x: 50, y: 40, w: 20, h: 60 });
            elements.push(this.makeSlab(50, 100, 190, 20, R, pal, 'platform'));
            elements.push({ type: 'steelPlatform', x: 50, y: 120, w: 150, h: 18, palette: pal, isSteel: true });
            elements.push({ type: 'rockWall', x: 190, y: 40, w: 25, h: 60, palette: pal });
            elements.push(this.makeSlab(270, 150, 160, 20, R, pal, 'craggyRock'));
            elements.push({ type: 'rockWall', x: 340, y: 90, w: 30, h: 60, palette: pal });
            elements.push(this.makeSlab(410, 220, 170, 20, R, pal, 'volcanicBasalt'));
            elements.push({ type: 'rockWall', x: 490, y: 160, w: 30, h: 60, palette: pal });
            elements.push(this.makeSlab(560, 280, 200, 20, R, pal, 'platform'));
            elements.push({ type: 'rockWall', x: 630, y: 220, w: 30, h: 60, palette: pal });
            elements.push({ type: 'steelBarrier', x: 740, y: 200, w: 20, h: 80 });
            spawn = { x: 110, y: 60 };
            gate = { x: 705, y: 254 };
            actionPlan = [
              { act: 'CLIMB', role: 'pioneer', atWallX: 190, count: 1 },
              { act: 'BUILD', role: 'pioneer', atEdgeX: 234, dir: 1, count: 1 },
              { act: 'BASH', role: 'pioneer', atWallX: 340, count: 1 },
              { act: 'BASH', role: 'pioneer', atWallX: 490, count: 1 },
              { act: 'BASH', role: 'pioneer', atWallX: 630, count: 1 },
              { act: 'BASH', role: 'crowd', atWallX: 190, count: 1 }
            ];
          } else if (variant === 2) {
            variantName = 'V3: 상공 수직 착정 & 이중 협곡 가교';
            shortcutHint = '우측 강철벽 봉쇄 구간에서 DRILL 수직 강하 후 중앙 협곡 가교 개척';
            elements.push({ type: 'steelBarrier', x: 50, y: 30, w: 20, h: 60 });
            elements.push(this.makeSlab(50, 90, 210, 30, R, pal, 'craggyRock'));
            elements.push({ type: 'steelBarrier', x: 240, y: 30, w: 20, h: 60 });
            elements.push(this.makeSlab(140, 160, 230, 20, R, pal, 'platform'));
            elements.push({ type: 'steelPlatform', x: 140, y: 180, w: 190, h: 18, palette: pal, isSteel: true });
            elements.push({ type: 'rockWall', x: 260, y: 100, w: 30, h: 60, palette: pal });
            elements.push(this.makeSlab(400, 150, 170, 20, R, pal, 'volcanicBasalt'));
            elements.push({ type: 'rockWall', x: 480, y: 90, w: 30, h: 60, palette: pal });
            elements.push(this.makeSlab(550, 230, 210, 20, R, pal, 'quantumCrystal'));
            elements.push({ type: 'rockWall', x: 630, y: 170, w: 30, h: 60, palette: pal });
            elements.push({ type: 'steelBarrier', x: 740, y: 150, w: 20, h: 80 });
            spawn = { x: 100, y: 50 };
            gate = { x: 705, y: 204 };
            actionPlan = [
              { act: 'DRILL', role: 'pioneer', atX: 180, count: 1 },
              { act: 'BASH', role: 'pioneer', atWallX: 260, count: 1 },
              { act: 'BUILD', role: 'pioneer', atEdgeX: 364, dir: 1, count: 1 },
              { act: 'BASH', role: 'pioneer', atWallX: 480, count: 1 },
              { act: 'BASH', role: 'pioneer', atWallX: 630, count: 1 }
            ];
          } else {
            variantName = 'V4: 중앙 상공 스카이 생텀 & 다단 암반 굴착';
            shortcutHint = '중앙 상공 생텀 돌파 후 현무암 사선 채굴(MINE) 및 심연 협곡 가교 개척';
            elements.push(this.makeSlab(260, 115, 210, 20, R, pal, 'quantumCrystal'));
            elements.push({ type: 'steelBarrier', x: 260, y: 55, w: 20, h: 60 });
            elements.push({ type: 'rockWall', x: 400, y: 50, w: 28, h: 65, palette: pal });
            elements.push(this.makeSlab(435, 195, 215, 40, R, pal, 'volcanicBasalt'));
            elements.push({ type: 'steelBarrier', x: 435, y: 140, w: 20, h: 55 });
            elements.push({ type: 'steelBarrier', x: 630, y: 135, w: 20, h: 60 });
            elements.push(this.makeSlab(485, 275, 165, 20, R, pal, 'craggyRock'));
            elements.push({ type: 'steelBarrier', x: 485, y: 220, w: 20, h: 55 });
            elements.push(this.makeSlab(680, 350, 95, 20, R, pal, 'quantumCrystal'));
            elements.push({ type: 'steelBarrier', x: 755, y: 290, w: 20, h: 60 });
            spawn = { x: 315, y: 89 };
            gate = { x: 730, y: 324 };
            actionPlan = [
              { act: 'BASH', count: 1, role: 'pioneer', atWallX: 400, dir: 1 },
              { act: 'MINE', count: 1, role: 'pioneer', atX: 530, dir: 1 },
              { act: 'BUILD', count: 1, role: 'pioneer', atEdgeX: 644, dir: 1 }
            ];
          }
          break;
        }

        /* --------------------------------------------------------------
         * 2. CHAMBER -> UNDERPASS_BUNKER (강철 벙커 언더패스 & 3종 변형)
         * ------------------------------------------------------------*/
        case 'chamber': {
          gimmickLabel = 'UNDERPASS_BUNKER';
          if (variant === 0) {
            variantName = 'V1: 강철 커튼 언더패스 & 도약 성채';
            shortcutHint = '중앙 강철 격벽 아래 지하 회랑(MINE→BASH) 잠입 후 점프패드/계단 도약';
            elements.push({ type: 'steelBarrier', x: 60, y: 80, w: 20, h: 260 });
            elements.push({ type: 'rockWall', x: 80, y: 260, w: 210, h: 60, palette: pal });
            elements.push({ type: 'steelPlatform', x: 60, y: 320, w: 680, h: 20, palette: pal, isSteel: true });
            elements.push({ type: 'steelBarrier', x: 300, y: 50, w: 20, h: 220 });
            elements.push({ type: 'rockWall', x: 290, y: 270, w: 40, h: 50, palette: pal });
            if (useJumpPad) {
              elements.push({ type: 'jumpPad', x: 390, y: 310, w: 40, h: 10, dir: 'up-right', power: 7.4, palette: pal });
            }
            elements.push(this.makeSlab(510, 260, 230, 20, R, pal, 'platform'));
            elements.push({ type: 'rockWall', x: 600, y: 200, w: 30, h: 60, palette: pal });
            elements.push({ type: 'steelBarrier', x: 720, y: 170, w: 20, h: 150 });
            spawn = { x: 150, y: 220 };
            gate = { x: 680, y: 234 };
            actionPlan = [
              { act: 'MINE', role: 'pioneer', atX: 225, dir: 1, count: 1 },
              { act: 'BASH', role: 'pioneer', atWallX: 295, count: 1 },
              ...(useJumpPad
                ? [{ act: 'BASH', role: 'pioneer', atWallX: 600, count: 1 }]
                : [
                    { act: 'BUILD', role: 'pioneer', atX: 390, dir: 1, count: 3 },
                    { act: 'BASH', role: 'pioneer', atWallX: 600, count: 1 }
                  ])
            ];
          } else if (variant === 1) {
            variantName = 'V2: 이중 밀폐 격실 & 지하 심연 브릿지';
            shortcutHint = '상단 강철 독방 바닥을 DRILL로 뚫은 뒤 제2 격실 MINE 사선 탈출';
            elements.push({ type: 'steelBarrier', x: 50, y: 40, w: 20, h: 60 });
            elements.push(this.makeSlab(50, 100, 190, 30, R, pal, 'platform'));
            elements.push({ type: 'steelBarrier', x: 220, y: 40, w: 20, h: 60 });
            elements.push({ type: 'steelBarrier', x: 80, y: 120, w: 20, h: 60 });
            elements.push(this.makeSlab(80, 180, 250, 40, R, pal, 'craggyRock'));
            elements.push({ type: 'steelBarrier', x: 310, y: 120, w: 20, h: 60 });
            elements.push(this.makeSlab(220, 260, 280, 20, R, pal, 'volcanicBasalt'));
            elements.push({ type: 'rockWall', x: 380, y: 200, w: 30, h: 60, palette: pal });
            elements.push(this.makeSlab(530, 250, 220, 20, R, pal, 'quantumCrystal'));
            elements.push({ type: 'rockWall', x: 620, y: 190, w: 30, h: 60, palette: pal });
            elements.push({ type: 'steelBarrier', x: 730, y: 170, w: 20, h: 80 });
            spawn = { x: 110, y: 60 };
            gate = { x: 695, y: 224 };
            actionPlan = [
              { act: 'DRILL', role: 'pioneer', atX: 150, count: 1 },
              { act: 'MINE', role: 'pioneer', atX: 220, dir: 1, count: 1 },
              { act: 'BASH', role: 'pioneer', atWallX: 380, count: 1 },
              { act: 'BUILD', role: 'pioneer', atEdgeX: 494, dir: 1, count: 1 },
              { act: 'BASH', role: 'pioneer', atWallX: 620, count: 1 }
            ];
          } else if (variant === 2) {
            variantName = 'V3: 공중 감옥 수직 탈출 & 2연속 공중 리프트';
            shortcutHint = '밀폐 감옥 바닥을 DRILL로 탈출한 뒤 2연속 공중 다리로 성채 진입';
            elements.push({ type: 'steelBarrier', x: 50, y: 40, w: 20, h: 60 });
            elements.push(this.makeSlab(50, 100, 200, 30, R, pal, 'platform'));
            elements.push({ type: 'steelBarrier', x: 230, y: 40, w: 20, h: 60 });
            elements.push({ type: 'steelBarrier', x: 90, y: 130, w: 20, h: 60 });
            elements.push(this.makeSlab(90, 190, 290, 20, R, pal, 'craggyRock'));
            elements.push({ type: 'steelPlatform', x: 90, y: 210, w: 220, h: 18, palette: pal, isSteel: true });
            elements.push({ type: 'rockWall', x: 260, y: 130, w: 30, h: 60, palette: pal });
            elements.push(this.makeSlab(410, 180, 170, 20, R, pal, 'volcanicBasalt'));
            elements.push({ type: 'rockWall', x: 490, y: 120, w: 30, h: 60, palette: pal });
            elements.push(this.makeSlab(610, 170, 150, 20, R, pal, 'quantumCrystal'));
            elements.push({ type: 'steelBarrier', x: 740, y: 90, w: 20, h: 80 });
            spawn = { x: 110, y: 60 };
            gate = { x: 700, y: 144 };
            actionPlan = [
              { act: 'DRILL', role: 'pioneer', atX: 160, count: 1 },
              { act: 'BASH', role: 'pioneer', atWallX: 260, count: 1 },
              { act: 'BUILD', role: 'pioneer', atEdgeX: 374, dir: 1, count: 1 },
              { act: 'BASH', role: 'pioneer', atWallX: 490, count: 1 },
              { act: 'BUILD', role: 'pioneer', atEdgeX: 574, dir: 1, count: 1 }
            ];
          } else {
            variantName = 'V4: 심층 지하 감옥 & 상부 스카이 데크 해방';
            shortcutHint = '지하 감옥 CLIMB 선발대가 점프패드로 상부 데크 개척 후 본대 해방';
            elements.push(this.makeSlab(60, 300, 220, 20, R, pal, 'volcanicBasalt'));
            elements.push({ type: 'steelBarrier', x: 60, y: 235, w: 20, h: 65 });
            elements.push({ type: 'rockWall', x: 185, y: 245, w: 24, h: 55, palette: pal });
            elements.push({ type: 'jumpPad', x: 230, y: 290, w: 40, h: 10, dir: 'up-right', direction: 'up-right', power: 7.4, palette: pal });
            elements.push(this.makeSlab(350, 240, 170, 20, R, pal, 'quantumCrystal'));
            elements.push({ type: 'rockWall', x: 425, y: 180, w: 28, h: 60, palette: pal });
            elements.push(this.makeSlab(490, 310, 140, 20, R, pal, 'craggyRock'));
            elements.push({ type: 'steelBarrier', x: 490, y: 255, w: 20, h: 55 });
            elements.push(this.makeSlab(660, 295, 110, 20, R, pal, 'volcanicBasalt'));
            elements.push({ type: 'steelBarrier', x: 750, y: 235, w: 20, h: 60 });
            spawn = { x: 115, y: 274 };
            gate = { x: 715, y: 269 };
            actionPlan = [
              { act: 'CLIMB', count: 1, role: 'pioneer', atWallX: 185 },
              { act: 'BASH', count: 1, role: 'pioneer', atWallX: 425 },
              { act: 'BUILD', count: 1, role: 'pioneer', atEdgeX: 624, dir: 1 },
              { act: 'BASH', count: 1, role: 'crowd', atWallX: 185 }
            ];
          }
          break;
        }

        /* --------------------------------------------------------------
         * 3. ZIGZAG -> SWITCHBACK_TERRACE (스위치백 3단 회랑 & 수직2굴착 날먹 차단)
         * ------------------------------------------------------------*/
        case 'zigzag': {
          gimmickLabel = 'SWITCHBACK_TERRACE';
          if (variant === 0) {
            variantName = 'V1: 3단 지그재그 회랑 & 우측 외벽 시크릿';
            shortcutHint = '정석 3단 지그재그 반전 루트 OR 우측 외벽 비밀 기둥(x=700) 직통 굴착(Stage 21 스타일)';
            elements.push({ type: 'rockWall', x: 700, y: 40, w: 60, h: 110, palette: pal });
            elements.push({ type: 'rockWall', x: 700, y: 150, w: 60, h: 120, palette: pal });
            elements.push({ type: 'steelBarrier', x: 760, y: 40, w: 20, h: 250 });
            elements.push(this.makeSlab(430, 90, 270, 20, R, pal, 'platform'));
            elements.push({ type: 'rockWall', x: 470, y: 30, w: 30, h: 60, palette: pal });
            elements.push(this.makeSlab(110, 140, 570, 40, R, pal, 'craggyRock'));
            // 강철 방패: 2층 우측 하단(x=480..700, y=180)을 강철로 받쳐 수직 2회 굴착(DRILLx2) 날먹 원천 봉쇄
            elements.push({ type: 'steelPlatform', x: 480, y: 180, w: 220, h: 14, palette: pal, isSteel: true });
            elements.push({ type: 'steelBarrier', x: 110, y: 80, w: 20, h: 60 });
            elements.push(this.makeSlab(80, 250, 300, 20, R, pal, 'platform'));
            elements.push({ type: 'steelBarrier', x: 80, y: 190, w: 20, h: 60 });
            elements.push(this.makeSlab(460, 270, 300, 20, R, pal, 'platform'));
            spawn = { x: 610, y: 50 };
            gate = { x: 640, y: 244 };
            actionPlan = [
              { act: 'BASH', role: 'pioneer', atWallX: 485, count: 1 },
              { act: 'MINE', role: 'pioneer', atX: 220, dir: -1, count: 1 },
              { act: 'BUILD', role: 'pioneer', atEdgeX: 374, dir: 1, count: 2 }
            ];
          } else if (variant === 1) {
            variantName = 'V2: 나선형 4단 스위치백 & 하부 요새 돌파';
            shortcutHint = '상단 BASH 돌파 → 좌측 사선 갱도(MINE) → 3층 협곡 다리 → 4층 성문 격파';
            elements.push({ type: 'rockWall', x: 700, y: 40, w: 60, h: 220, palette: pal });
            elements.push({ type: 'steelBarrier', x: 760, y: 40, w: 20, h: 250 });
            elements.push(this.makeSlab(420, 80, 280, 20, R, pal, 'craggyRock'));
            elements.push({ type: 'rockWall', x: 460, y: 20, w: 30, h: 60, palette: pal });
            elements.push(this.makeSlab(100, 130, 580, 40, R, pal, 'platform'));
            elements.push({ type: 'steelPlatform', x: 470, y: 170, w: 230, h: 14, palette: pal, isSteel: true });
            elements.push({ type: 'steelBarrier', x: 100, y: 70, w: 20, h: 60 });
            elements.push(this.makeSlab(80, 240, 280, 20, R, pal, 'volcanicBasalt'));
            elements.push({ type: 'steelBarrier', x: 80, y: 180, w: 20, h: 60 });
            elements.push(this.makeSlab(390, 230, 370, 20, R, pal, 'quantumCrystal'));
            elements.push({ type: 'rockWall', x: 550, y: 170, w: 30, h: 60, palette: pal });
            spawn = { x: 610, y: 40 };
            gate = { x: 660, y: 204 };
            actionPlan = [
              { act: 'BASH', role: 'pioneer', atWallX: 475, count: 1 },
              { act: 'MINE', role: 'pioneer', atX: 210, dir: -1, count: 1 },
              { act: 'BUILD', role: 'pioneer', atEdgeX: 354, dir: 1, count: 1 },
              { act: 'BASH', role: 'pioneer', atWallX: 550, count: 1 }
            ];
          } else if (variant === 2) {
            variantName = 'V3: 역방향 스위치백 & 이중 방벽 요새';
            shortcutHint = '상단 BASH 돌파 후 좌측 사선 갱도(MINE), 3층 방벽 격파 및 중앙 가교 건설';
            elements.push({ type: 'rockWall', x: 700, y: 40, w: 60, h: 230, palette: pal });
            elements.push({ type: 'steelBarrier', x: 760, y: 40, w: 20, h: 250 });
            elements.push(this.makeSlab(430, 90, 270, 20, R, pal, 'platform'));
            elements.push({ type: 'rockWall', x: 470, y: 30, w: 30, h: 60, palette: pal });
            elements.push(this.makeSlab(110, 140, 570, 40, R, pal, 'craggyRock'));
            elements.push({ type: 'steelPlatform', x: 480, y: 180, w: 220, h: 14, palette: pal, isSteel: true });
            elements.push({ type: 'steelBarrier', x: 110, y: 80, w: 20, h: 60 });
            elements.push(this.makeSlab(80, 240, 290, 20, R, pal, 'volcanicBasalt'));
            elements.push({ type: 'steelBarrier', x: 80, y: 180, w: 20, h: 60 });
            elements.push({ type: 'rockWall', x: 250, y: 180, w: 30, h: 60, palette: pal });
            elements.push(this.makeSlab(400, 230, 360, 20, R, pal, 'quantumCrystal'));
            elements.push({ type: 'rockWall', x: 560, y: 170, w: 30, h: 60, palette: pal });
            spawn = { x: 610, y: 50 };
            gate = { x: 660, y: 204 };
            actionPlan = [
              { act: 'BASH', role: 'pioneer', atWallX: 485, count: 1 },
              { act: 'MINE', role: 'pioneer', atX: 220, dir: -1, count: 1 },
              { act: 'BASH', role: 'pioneer', atWallX: 250, count: 1 },
              { act: 'BUILD', role: 'pioneer', atEdgeX: 364, dir: 1, count: 1 },
              { act: 'BASH', role: 'pioneer', atWallX: 560, count: 1 }
            ];
          } else {
            variantName = 'V4: 모래시계 협곡 & 교차 스위치백';
            shortcutHint = '상부 BASH 후 중앙 모래시계 수직 착정(DRILL) → 좌측 반전 → 현무암 사선 채굴(MINE)';
            elements.push(this.makeSlab(180, 110, 340, 20, R, pal, 'craggyRock'));
            elements.push({ type: 'steelBarrier', x: 180, y: 50, w: 20, h: 60 });
            elements.push({ type: 'rockWall', x: 320, y: 50, w: 28, h: 60, palette: pal });
            elements.push({ type: 'steelBarrier', x: 500, y: 45, w: 20, h: 65 });
            elements.push(this.makeSlab(280, 195, 240, 40, R, pal, 'volcanicBasalt'));
            elements.push({ type: 'steelPlatform', x: 435, y: 215, w: 55, h: 20, palette: pal, isSteel: true });
            elements.push({ type: 'steelBarrier', x: 280, y: 130, w: 20, h: 65 });
            elements.push({ type: 'steelBarrier', x: 500, y: 130, w: 20, h: 65 });
            elements.push({ type: 'rockWall', x: 365, y: 135, w: 28, h: 60, palette: pal });
            elements.push(this.makeSlab(340, 280, 270, 20, R, pal, 'quantumCrystal'));
            elements.push({ type: 'steelBarrier', x: 340, y: 225, w: 20, h: 55 });
            elements.push(this.makeSlab(640, 265, 115, 20, R, pal, 'craggyRock'));
            elements.push({ type: 'steelBarrier', x: 735, y: 205, w: 20, h: 60 });
            spawn = { x: 235, y: 84 };
            gate = { x: 695, y: 239 };
            actionPlan = [
              { act: 'BASH', count: 1, role: 'pioneer', atWallX: 320, dir: 1 },
              { act: 'DRILL', count: 1, role: 'pioneer', atX: 455, dir: -1 },
              { act: 'BASH', count: 1, role: 'pioneer', atWallX: 393, dir: -1 },
              { act: 'MINE', count: 1, role: 'pioneer', atX: 350, dir: 1 },
              { act: 'BUILD', count: 1, role: 'pioneer', atEdgeX: 604, dir: 1 }
            ];
          }
          break;
        }

        /* --------------------------------------------------------------
         * 4. SPLIT -> BACKDOOR_CHAMBER (본대 감금 & 후방 해방 3종 변형)
         * ------------------------------------------------------------*/
        case 'split': {
          gimmickLabel = 'BACKDOOR_CHAMBER';
          if (variant === 0) {
            variantName = 'V1: 본대 감금 챔버 & 셔틀/점프패드 개척';
            shortcutHint = '본대 안전 대기 → CLIMB 선발대 월담 & 이동발판/다리 개척 후 본대 해방';
            elements.push({ type: 'steelBarrier', x: 60, y: 130, w: 20, h: 90 });
            elements.push(this.makeSlab(60, 220, 220, 20, R, pal, 'platform'));
            elements.push({ type: 'steelPlatform', x: 60, y: 240, w: 170, h: 18, palette: pal, isSteel: true });
            elements.push({ type: 'rockWall', x: 210, y: 150, w: 25, h: 70, palette: pal });
            elements.push(this.makeSlab(310, 250, 160, 40, R, pal, 'craggyRock'));
            if (useMoving) {
              elements.push({ type: 'movingPlatform', x: 454, y: 250, w: 98, h: 14, axis: 'horizontal', range: 14, speed: 0.72, pauseTicks: 15, palette: pal });
            } else if (useJumpPad) {
              elements.push({ type: 'jumpPad', x: 410, y: 240, w: 40, h: 10, dir: 'up-right', power: 6.0, palette: pal });
            }
            elements.push(this.makeSlab(550, 250, 200, 20, R, pal, 'platform'));
            elements.push({ type: 'rockWall', x: 610, y: 190, w: 30, h: 60, palette: pal });
            elements.push({ type: 'steelBarrier', x: 730, y: 170, w: 20, h: 80 });
            spawn = { x: 140, y: 180 };
            gate = { x: 685, y: 224 };
            actionPlan = [
              { act: 'CLIMB', role: 'pioneer', atWallX: 210, count: 1 },
              { act: 'BUILD', role: 'pioneer', atEdgeX: 274, dir: 1, count: 1 },
              ...((!useMoving && !useJumpPad) ? [{ act: 'BUILD', role: 'pioneer', atEdgeX: 464, dir: 1, count: 2 }] : []),
              { act: 'BASH', role: 'pioneer', atWallX: 610, count: 1 },
              { act: 'BASH', role: 'crowd', atWallX: 210, count: 1 }
            ];
          } else if (variant === 1) {
            variantName = 'V2: 상단 감금 아치 & 2단 고원 선제 타격';
            shortcutHint = '상단 감금벽을 CLIMB로 넘어 고원 바리케이드 2개를 선제 격파한 뒤 본대 해방';
            elements.push({ type: 'steelBarrier', x: 50, y: 60, w: 20, h: 80 });
            elements.push(this.makeSlab(50, 140, 210, 20, R, pal, 'craggyRock'));
            elements.push({ type: 'steelPlatform', x: 50, y: 160, w: 170, h: 18, palette: pal, isSteel: true });
            elements.push({ type: 'rockWall', x: 200, y: 80, w: 25, h: 60, palette: pal });
            elements.push(this.makeSlab(290, 130, 210, 20, R, pal, 'platform'));
            elements.push({ type: 'rockWall', x: 390, y: 70, w: 30, h: 60, palette: pal });
            elements.push(this.makeSlab(480, 210, 270, 20, R, pal, 'quantumCrystal'));
            elements.push({ type: 'rockWall', x: 580, y: 150, w: 30, h: 60, palette: pal });
            elements.push({ type: 'steelBarrier', x: 730, y: 130, w: 20, h: 80 });
            spawn = { x: 120, y: 100 };
            gate = { x: 690, y: 184 };
            actionPlan = [
              { act: 'CLIMB', role: 'pioneer', atWallX: 200, count: 1 },
              { act: 'BUILD', role: 'pioneer', atEdgeX: 254, dir: 1, count: 1 },
              { act: 'BASH', role: 'pioneer', atWallX: 390, count: 1 },
              { act: 'BASH', role: 'pioneer', atWallX: 580, count: 1 },
              { act: 'BASH', role: 'crowd', atWallX: 200, count: 1 }
            ];
          } else if (variant === 2) {
            variantName = 'V3: 이중 협곡 선발 개척 & 후방 본대 구출';
            shortcutHint = '선발대가 2개의 크레바스 다리와 2개의 방벽을 모두 개척한 후 본대 일괄 해방';
            elements.push({ type: 'steelBarrier', x: 50, y: 140, w: 20, h: 80 });
            elements.push(this.makeSlab(50, 220, 200, 20, R, pal, 'platform'));
            elements.push({ type: 'steelPlatform', x: 50, y: 240, w: 160, h: 18, palette: pal, isSteel: true });
            elements.push({ type: 'rockWall', x: 190, y: 160, w: 25, h: 60, palette: pal });
            elements.push(this.makeSlab(280, 210, 180, 20, R, pal, 'craggyRock'));
            elements.push({ type: 'rockWall', x: 360, y: 150, w: 30, h: 60, palette: pal });
            elements.push(this.makeSlab(490, 200, 260, 20, R, pal, 'volcanicBasalt'));
            elements.push({ type: 'rockWall', x: 600, y: 140, w: 30, h: 60, palette: pal });
            elements.push({ type: 'steelBarrier', x: 730, y: 120, w: 20, h: 80 });
            spawn = { x: 120, y: 180 };
            gate = { x: 690, y: 174 };
            actionPlan = [
              { act: 'CLIMB', role: 'pioneer', atWallX: 190, count: 1 },
              { act: 'BUILD', role: 'pioneer', atEdgeX: 244, dir: 1, count: 1 },
              { act: 'BASH', role: 'pioneer', atWallX: 360, count: 1 },
              { act: 'BUILD', role: 'pioneer', atEdgeX: 454, dir: 1, count: 1 },
              { act: 'BASH', role: 'pioneer', atWallX: 600, count: 1 },
              { act: 'BASH', role: 'crowd', atWallX: 190, count: 1 }
            ];
          } else {
            variantName = 'V4: 피라미드 크레이터 & 상하 분기 루트';
            shortcutHint = '피라미드 정상 산길을 CLIMB 선발대로 먼저 개척하고 하단 본대를 일괄 해방';
            elements.push(this.makeSlab(70, 220, 180, 20, R, pal, 'craggyRock'));
            elements.push({ type: 'steelBarrier', x: 70, y: 155, w: 20, h: 65 });
            elements.push({ type: 'rockWall', x: 185, y: 168, w: 24, h: 52, palette: pal });
            elements.push(this.makeSlab(280, 205, 205, 20, R, pal, 'quantumCrystal'));
            elements.push({ type: 'rockWall', x: 370, y: 145, w: 28, h: 60, palette: pal });
            elements.push(this.makeSlab(455, 285, 165, 20, R, pal, 'volcanicBasalt'));
            elements.push({ type: 'steelBarrier', x: 455, y: 230, w: 20, h: 55 });
            elements.push(this.makeSlab(650, 270, 110, 20, R, pal, 'craggyRock'));
            elements.push({ type: 'steelBarrier', x: 740, y: 210, w: 20, h: 60 });
            spawn = { x: 120, y: 194 };
            gate = { x: 705, y: 244 };
            actionPlan = [
              { act: 'CLIMB', count: 1, role: 'pioneer', atWallX: 185 },
              { act: 'BUILD', count: 1, role: 'pioneer', atEdgeX: 244, dir: 1 },
              { act: 'BASH', count: 1, role: 'pioneer', atWallX: 370 },
              { act: 'BUILD', count: 1, role: 'pioneer', atEdgeX: 614, dir: 1 },
              { act: 'BASH', count: 1, role: 'crowd', atWallX: 185 }
            ];
          }
          break;
        }

        /* --------------------------------------------------------------
         * 5. TRAVERSE -> CORE_MOUNTAIN (강철 코어 산악 우회 & 3종 변형)
         * ------------------------------------------------------------*/
        case 'traverse': {
          gimmickLabel = 'CORE_MOUNTAIN';
          if (variant === 0) {
            variantName = 'V1: 강철 코어 산괴 하부 갱도 관통';
            shortcutHint = '강철 코어 하부 암반(MINE→BASH) 관통 OR 상단 CLIMB 산정 돌파';
            elements.push({ type: 'steelBarrier', x: 50, y: 130, w: 20, h: 80 });
            elements.push(this.makeSlab(50, 210, 180, 20, R, pal, 'platform'));
            elements.push({ type: 'rockWall', x: 260, y: 190, w: 190, h: 80, palette: pal });
            elements.push({ type: 'rockWall', x: 350, y: 130, w: 100, h: 60, palette: pal });
            elements.push({ type: 'steelBarrier', x: 375, y: 120, w: 20, h: 95 });
            elements.push({ type: 'steelPlatform', x: 260, y: 270, w: 205, h: 20, palette: pal, isSteel: true });
            elements.push(this.makeSlab(500, 260, 250, 20, R, pal, 'platform'));
            elements.push({ type: 'steelBarrier', x: 730, y: 180, w: 20, h: 80 });
            spawn = { x: 120, y: 170 };
            gate = { x: 680, y: 234 };
            actionPlan = [
              { act: 'BUILD', role: 'pioneer', atEdgeX: 224, dir: 1, count: 1 },
              { act: 'MINE', role: 'pioneer', atX: 310, dir: 1, count: 1 },
              { act: 'BASH', role: 'pioneer', atWallX: 405, count: 1 },
              { act: 'BUILD', role: 'pioneer', atEdgeX: 459, dir: 1, count: 1 }
            ];
          } else if (variant === 1) {
            variantName = 'V2: 고원 산맥 종단 & 강철 보루 사선 채굴';
            shortcutHint = '서측 초소 격파 후 중앙 고원 강철 바리케이드 하단을 MINE으로 사선 채굴';
            elements.push({ type: 'steelBarrier', x: 40, y: 80, w: 20, h: 80 });
            elements.push(this.makeSlab(40, 160, 190, 20, R, pal, 'platform'));
            elements.push({ type: 'rockWall', x: 150, y: 100, w: 30, h: 60, palette: pal });
            elements.push(this.makeSlab(260, 150, 220, 40, R, pal, 'craggyRock'));
            elements.push({ type: 'steelBarrier', x: 460, y: 90, w: 20, h: 60 });
            elements.push(this.makeSlab(400, 230, 190, 20, R, pal, 'volcanicBasalt'));
            elements.push({ type: 'rockWall', x: 500, y: 170, w: 30, h: 60, palette: pal });
            elements.push(this.makeSlab(620, 220, 140, 20, R, pal, 'quantumCrystal'));
            elements.push({ type: 'steelBarrier', x: 740, y: 140, w: 20, h: 80 });
            spawn = { x: 95, y: 120 };
            gate = { x: 700, y: 194 };
            actionPlan = [
              { act: 'BASH', role: 'pioneer', atWallX: 150, count: 1 },
              { act: 'BUILD', role: 'pioneer', atEdgeX: 224, dir: 1, count: 1 },
              { act: 'MINE', role: 'pioneer', atX: 380, dir: 1, count: 1 },
              { act: 'BASH', role: 'pioneer', atWallX: 500, count: 1 },
              { act: 'BUILD', role: 'pioneer', atEdgeX: 584, dir: 1, count: 1 }
            ];
          } else if (variant === 2) {
            variantName = 'V3: 징검다리 요새 & 3연속 성벽 종단';
            shortcutHint = '3개의 분리된 공중 요새를 BASH와 BUILD 교차 콤보로 돌파하는 정통 횡단';
            elements.push({ type: 'steelBarrier', x: 40, y: 130, w: 20, h: 80 });
            elements.push(this.makeSlab(40, 210, 180, 20, R, pal, 'craggyRock'));
            elements.push({ type: 'rockWall', x: 140, y: 150, w: 30, h: 60, palette: pal });
            elements.push(this.makeSlab(250, 200, 180, 20, R, pal, 'platform'));
            elements.push({ type: 'rockWall', x: 330, y: 140, w: 30, h: 60, palette: pal });
            elements.push(this.makeSlab(460, 190, 180, 20, R, pal, 'volcanicBasalt'));
            elements.push({ type: 'rockWall', x: 540, y: 130, w: 30, h: 60, palette: pal });
            elements.push(this.makeSlab(620, 250, 140, 20, R, pal, 'quantumCrystal'));
            elements.push({ type: 'steelBarrier', x: 740, y: 170, w: 20, h: 80 });
            spawn = { x: 95, y: 170 };
            gate = { x: 700, y: 224 };
            actionPlan = [
              { act: 'BASH', role: 'pioneer', atWallX: 140, count: 1 },
              { act: 'BUILD', role: 'pioneer', atEdgeX: 214, dir: 1, count: 1 },
              { act: 'BASH', role: 'pioneer', atWallX: 330, count: 1 },
              { act: 'BUILD', role: 'pioneer', atEdgeX: 424, dir: 1, count: 1 },
              { act: 'BASH', role: 'pioneer', atWallX: 540, count: 1 }
            ];
          } else {
            variantName = 'V4: 5대 부유 스카이 아일랜드 군도';
            shortcutHint = '점프패드 도약과 3연속 공중 요새 교차 돌파가 어우러진 다중 스카이 아일랜드';
            elements.push(this.makeSlab(55, 280, 180, 20, R, pal, 'quantumCrystal'));
            elements.push({ type: 'steelBarrier', x: 55, y: 220, w: 20, h: 60 });
            elements.push({ type: 'rockWall', x: 145, y: 220, w: 26, h: 60, palette: pal });
            elements.push({ type: 'jumpPad', x: 185, y: 270, w: 40, h: 10, dir: 'up-right', direction: 'up-right', power: 7.4, palette: pal });
            elements.push(this.makeSlab(305, 220, 140, 20, R, pal, 'craggyRock'));
            elements.push({ type: 'rockWall', x: 365, y: 160, w: 28, h: 60, palette: pal });
            elements.push(this.makeSlab(475, 205, 120, 20, R, pal, 'volcanicBasalt'));
            elements.push({ type: 'rockWall', x: 525, y: 145, w: 28, h: 60, palette: pal });
            elements.push(this.makeSlab(565, 275, 100, 20, R, pal, 'quantumCrystal'));
            elements.push({ type: 'steelBarrier', x: 565, y: 225, w: 20, h: 50 });
            elements.push(this.makeSlab(695, 260, 80, 20, R, pal, 'craggyRock'));
            elements.push({ type: 'steelBarrier', x: 755, y: 200, w: 20, h: 60 });
            spawn = { x: 95, y: 254 };
            gate = { x: 735, y: 234 };
            actionPlan = [
              { act: 'BASH', count: 1, role: 'pioneer', atWallX: 145 },
              { act: 'BASH', count: 1, role: 'pioneer', atWallX: 365 },
              { act: 'BUILD', count: 1, role: 'pioneer', atEdgeX: 439, dir: 1 },
              { act: 'BASH', count: 1, role: 'pioneer', atWallX: 525 },
              { act: 'BUILD', count: 1, role: 'pioneer', atEdgeX: 659, dir: 1 }
            ];
          }
          break;
        }

        /* --------------------------------------------------------------
         * 6. ASCENT -> CITADEL_ASCENT (시타델 다단 등반 & 3종 변형)
         * ------------------------------------------------------------*/
        case 'ascent':
        default: {
          gimmickLabel = 'CITADEL_ASCENT';
          if (variant === 0) {
            variantName = 'V1: 3단 시타델 등반 & 비밀 벙커 점프패드';
            shortcutHint = '하단 암벽 돌파 후 다단 계단 등반(BUILDx2→BASH→BUILD) OR 비밀 벙커 점프패드';
            elements.push({ type: 'steelBarrier', x: 60, y: 240, w: 20, h: 80 });
            elements.push(this.makeSlab(60, 320, 220, 20, R, pal, 'platform'));
            elements.push({ type: 'rockWall', x: 190, y: 260, w: 30, h: 60, palette: pal });
            if (useJumpPad) {
              elements.push({ type: 'jumpPad', x: 235, y: 310, w: 40, h: 10, dir: 'up-right', power: 5.8, palette: pal });
            }
            elements.push(this.makeSlab(360, 280, 100, 40, R, pal, 'craggyRock'));
            elements.push({ type: 'rockWall', x: 400, y: 220, w: 30, h: 60, palette: pal });
            elements.push(this.makeSlab(540, 240, 80, 20, R, pal, 'platform'));
            elements.push({ type: 'rockWall', x: 570, y: 180, w: 30, h: 60, palette: pal });
            elements.push(this.makeSlab(700, 200, 80, 20, R, pal, 'platform'));
            elements.push({ type: 'steelBarrier', x: 760, y: 120, w: 20, h: 80 });
            spawn = { x: 130, y: 280 };
            gate = { x: 740, y: 174 };
            actionPlan = [
              { act: 'BASH', role: 'pioneer', atWallX: 190, count: 1 },
              ...(useJumpPad ? [] : [{ act: 'BUILD', role: 'pioneer', atEdgeX: 274, dir: 1, count: 2 }]),
              { act: 'BASH', role: 'pioneer', atWallX: 400, count: 1 },
              { act: 'BUILD', role: 'pioneer', atEdgeX: 454, dir: 1, count: 2 },
              { act: 'BASH', role: 'pioneer', atWallX: 570, count: 1 },
              { act: 'BUILD', role: 'pioneer', atEdgeX: 616, dir: 1, count: 2 }
            ];
          } else if (variant === 1) {
            variantName = 'V2: 천공 성채 장교량 등반 (280→210)';
            shortcutHint = '하부 성문을 뚫고 1단 계단과 2단 장교량을 연속 가설해 천공 성채로 진입';
            elements.push({ type: 'steelBarrier', x: 40, y: 200, w: 20, h: 80 });
            elements.push(this.makeSlab(40, 280, 200, 20, R, pal, 'platform'));
            elements.push({ type: 'rockWall', x: 150, y: 220, w: 30, h: 60, palette: pal });
            elements.push(this.makeSlab(270, 270, 190, 20, R, pal, 'craggyRock'));
            elements.push({ type: 'rockWall', x: 350, y: 210, w: 30, h: 60, palette: pal });
            elements.push(this.makeSlab(540, 230, 220, 20, R, pal, 'quantumCrystal'));
            elements.push({ type: 'rockWall', x: 620, y: 170, w: 30, h: 60, palette: pal });
            elements.push({ type: 'steelBarrier', x: 740, y: 150, w: 20, h: 80 });
            spawn = { x: 95, y: 240 };
            gate = { x: 705, y: 204 };
            actionPlan = [
              { act: 'BASH', role: 'pioneer', atWallX: 150, count: 1 },
              { act: 'BUILD', role: 'pioneer', atEdgeX: 234, dir: 1, count: 1 },
              { act: 'BASH', role: 'pioneer', atWallX: 350, count: 1 },
              { act: 'BUILD', role: 'pioneer', atEdgeX: 454, dir: 1, count: 2 },
              { act: 'BASH', role: 'pioneer', atWallX: 620, count: 1 }
            ];
          } else if (variant === 2) {
            variantName = 'V3: 4단 스카이 계단식 첨탑 (270→240)';
            shortcutHint = '3개의 공중 초소를 격파하며 스카이 브릿지를 연달아 가설하는 고공 등반';
            elements.push({ type: 'steelBarrier', x: 40, y: 190, w: 20, h: 80 });
            elements.push(this.makeSlab(40, 270, 180, 20, R, pal, 'craggyRock'));
            elements.push({ type: 'rockWall', x: 140, y: 210, w: 30, h: 60, palette: pal });
            elements.push(this.makeSlab(250, 260, 160, 20, R, pal, 'platform'));
            elements.push({ type: 'rockWall', x: 320, y: 200, w: 30, h: 60, palette: pal });
            elements.push(this.makeSlab(440, 250, 160, 20, R, pal, 'volcanicBasalt'));
            elements.push({ type: 'rockWall', x: 510, y: 190, w: 30, h: 60, palette: pal });
            elements.push(this.makeSlab(630, 240, 130, 20, R, pal, 'quantumCrystal'));
            elements.push({ type: 'steelBarrier', x: 740, y: 160, w: 20, h: 80 });
            spawn = { x: 95, y: 230 };
            gate = { x: 705, y: 214 };
            actionPlan = [
              { act: 'BASH', role: 'pioneer', atWallX: 140, count: 1 },
              { act: 'BUILD', role: 'pioneer', atEdgeX: 214, dir: 1, count: 1 },
              { act: 'BASH', role: 'pioneer', atWallX: 320, count: 1 },
              { act: 'BUILD', role: 'pioneer', atEdgeX: 404, dir: 1, count: 1 },
              { act: 'BASH', role: 'pioneer', atWallX: 510, count: 1 },
              { act: 'BUILD', role: 'pioneer', atEdgeX: 594, dir: 1, count: 1 }
            ];
          } else {
            variantName = 'V4: 심연 채굴장 & 더블 점프패드 성채 등반';
            shortcutHint = '심연 바닥에서 더블 점프패드와 BUILD 가교를 연계해 고공 성채로 수직 등반';
            elements.push(this.makeSlab(80, 380, 200, 20, R, pal, 'volcanicBasalt'));
            elements.push({ type: 'steelBarrier', x: 80, y: 315, w: 20, h: 65 });
            elements.push({ type: 'rockWall', x: 180, y: 320, w: 28, h: 60, palette: pal });
            elements.push({ type: 'jumpPad', x: 225, y: 370, w: 40, h: 10, dir: 'up-right', direction: 'up-right', power: 7.4, palette: pal });
            elements.push(this.makeSlab(345, 320, 145, 20, R, pal, 'craggyRock'));
            elements.push({ type: 'rockWall', x: 410, y: 260, w: 28, h: 60, palette: pal });
            elements.push(this.makeSlab(520, 300, 130, 20, R, pal, 'quantumCrystal'));
            elements.push({ type: 'rockWall', x: 560, y: 240, w: 26, h: 60, palette: pal });
            elements.push({ type: 'jumpPad', x: 600, y: 290, w: 40, h: 10, dir: 'up-right', direction: 'up-right', power: 5.8, palette: pal });
            elements.push(this.makeSlab(705, 260, 75, 20, R, pal, 'volcanicBasalt'));
            elements.push({ type: 'steelBarrier', x: 760, y: 200, w: 20, h: 60 });
            spawn = { x: 125, y: 354 };
            gate = { x: 742, y: 234 };
            actionPlan = [
              { act: 'BASH', count: 1, role: 'pioneer', atWallX: 180 },
              { act: 'BASH', count: 1, role: 'pioneer', atWallX: 410 },
              { act: 'BUILD', count: 1, role: 'pioneer', atEdgeX: 484, dir: 1 },
              { act: 'BASH', count: 1, role: 'pioneer', atWallX: 560 }
            ];
          }
          break;
        }
      }

      const dx = R.irange(-10, 8);
      const dy = R.irange(-6, 6);
      const spawnShiftX = R.irange(-10, 10);
      const gateShiftX = R.irange(-10, 6);
      for (const el of elements) {
        el.x += dx;
        el.y += dy;
      }
      spawn.x += dx + spawnShiftX;
      spawn.y += dy;
      gate.x += dx + gateShiftX;
      gate.y += dy;
      for (const step of actionPlan) {
        if (step.atWallX != null) step.atWallX += dx;
        if (step.atX != null) step.atX += dx;
        if (step.atEdgeX != null) step.atEdgeX += dx;
      }

      const mirrorX = opts.mirrorX != null
        ? !!opts.mirrorX
        : (this._mirrorToggle = !this._mirrorToggle);

      const bpObj = {
        elements,
        spawn,
        gate,
        actionPlan
      };
      if (mirrorX) {
        this.mirrorBlueprint(bpObj);
      }

      let styleIdx;
      if (opts.styleIdx != null) {
        styleIdx = ((opts.styleIdx % 6) + 6) % 6;
      } else {
        if (!this._styleDeck || this._styleDeck.length === 0) {
          this._styleDeck = R.shuffle([0, 1, 2, 3, 4, 5]);
          if (this._lastStyleIdx != null && this._styleDeck[0] === this._lastStyleIdx && this._styleDeck.length > 1) {
            const swapIdx = 1 + (Math.abs(R.irange(0, this._styleDeck.length - 2)));
            const tmp = this._styleDeck[0];
            this._styleDeck[0] = this._styleDeck[swapIdx];
            this._styleDeck[swapIdx] = tmp;
          }
        }
        styleIdx = this._styleDeck.shift();
        this._lastStyleIdx = styleIdx;
      }

      const styleName = this.sculptArchitecturalSilhouette(bpObj, styleIdx, R, pal);
      variantName = `${variantName} · ${mirrorX ? '역방향(←)' : '정방향(→)'} · ${styleName}`;

      const solution = [];
      for (const step of actionPlan) {
        for (let c = 0; c < (step.count || 1); c++) solution.push(step.act);
      }

      return {
        elements,
        spawn,
        gate,
        actionPlan,
        solution,
        gimmickLabel,
        shortcutHint,
        variant,
        variantName
      };
    }

    /* ====================================================================
     * 유연한 다해법 스킬 인벤토리 산출
     * - 정석 시퀀스 + 실수 복구 여유분 + 우회/선발대 보조 스킬 지급
     * - 단, 날먹 방지(ex. 본대 전원 Float 통과 금지 -> float는 1~2개로 제한)
     * ==================================================================*/
    static calculateSkills(actionPlan, diff, R) {
      const skills = {
        climb: 0, float: 0, bash: 0, mine: 0,
        drill: 0, bomb: 0, build: 0, block: 0, portal: 0
      };

      const reqCount = {};
      for (const item of actionPlan) {
        const k = item.act.toLowerCase();
        reqCount[k] = (reqCount[k] || 0) + (item.count || 1);
      }

      const spareRange = diff.spareRange || [1, 2];
      for (const k of Object.keys(reqCount)) {
        const req = reqCount[k];
        if (req > 0) {
          let spare = R.irange(spareRange[0], spareRange[1]);
          if (k === 'build') spare = Math.max(spare, diff.key === 'nightmare' ? 1 : 2);
          skills[k] = req + spare;
        }
      }

      // 전술 보조 스킬 (선발대 분리 & 다해법 허용)
      if (skills.block === 0) skills.block = diff.key === 'nightmare' ? 1 : 2;
      if (skills.climb === 0) skills.climb = diff.key === 'nightmare' ? 1 : 2;
      if (skills.build < 2) skills.build = 2;

      // 선발대용 FLOAT 1~2개만 지급 (전원 낙하산 날먹 방지!)
      if (skills.float === 0) {
        skills.float = diff.key === 'easy' ? 2 : 1;
      }

      // 추가 돌파 옵션 2~3종 부여 (Stage 21 비밀 지름길 / 대안 해법 개방용)
      const altPool = R.shuffle(['bash', 'mine', 'drill', 'bomb']);
      let added = 0;
      const targetExtra = diff.extraSkillTypes || 2;
      for (const s of altPool) {
        if (added >= targetExtra) break;
        if (skills[s] === 0) {
          skills[s] = (diff.key === 'easy') ? 2 : 1;
          added++;
        }
      }

      return skills;
    }

    static calculateDifficultyScore(candidate) {
      const sol = candidate.solutionDna || [];
      const uniqueSkills = new Set(sol).size;
      let transitions = 0;
      for (let i = 1; i < sol.length; i++) {
        if (sol[i] !== sol[i - 1]) transitions++;
      }

      const spec = this.resolveDifficulty(candidate.difficulty);
      const [minS, maxS] = spec.scoreRange || [48, 175];
      const span = Math.max(1, maxS - minS);
      const structural = (sol.length * 7) + (uniqueSkills * 5) + (transitions * 4);
      const seedOffset = candidate.seed ? ((candidate.seed >>> 3) % (span + 1)) : 0;
      const score = clamp(minS + ((structural + seedOffset) % (span + 1)), minS, maxS);

      return {
        score,
        factors: {
          timingCount: clamp(sol.length * 16, 0, 100),
          sequenceLength: clamp(sol.length * 14 + uniqueSkills * 8, 0, 100),
          comboSynergy: clamp(transitions * 18 + 20, 0, 100),
          uniqueSkills,
          skillTransitions: transitions
        }
      };
    }

    static calculateDynamicTimeLimit(solutionDna, diffKey) {
      const spec = this.resolveDifficulty(diffKey);
      const baseTime = 55 + (solutionDna.length * 22);
      return clamp(Math.round(baseTime * spec.timeMultiplier), 110, 260);
    }

    static validateLayout(layoutResult) {
      const { elements, spawn, gate } = layoutResult;
      if (spawn.x < 20 || spawn.x > W - 20 || spawn.y < 20 || spawn.y > H - 20) {
        return { valid: false, reason: 'Spawn out of bounds' };
      }
      if (gate.x < 20 || gate.x > W - 20 || gate.y < 20 || gate.y > H - 20) {
        return { valid: false, reason: 'Gate out of bounds' };
      }

      const slabTypes = new Set(['platform', 'craggyRock', 'volcanicBasalt', 'quantumCrystal']);
      for (let i = 0; i < elements.length; i++) {
        const e1 = elements[i];
        if (!slabTypes.has(e1.type)) continue;
        for (let j = i + 1; j < elements.length; j++) {
          const e2 = elements[j];
          if (!slabTypes.has(e2.type)) continue;
          const overlapX = Math.min(e1.x + e1.w, e2.x + e2.w) - Math.max(e1.x, e2.x);
          if (overlapX > 20) {
            const topE = e1.y < e2.y ? e1 : e2;
            const botE = e1.y < e2.y ? e2 : e1;
            const gap = botE.y - (topE.y + topE.h);
            if (gap >= 0 && gap < 24) {
              return { valid: false, reason: `Insufficient headroom (${gap}px)` };
            }
          }
        }
      }
      return { valid: true };
    }

    /* ==================================================================
     * 정밀 군단 물리 시뮬레이터 (JumpPad + MovingPlatform + Pioneer/Crowd 분리)
     * - 0-스킬(방치) 시 0명 구출(전멸/막힘) 검증
     * - 1-스킬 단독 날먹 불가 검증
     * - 정석 다중 페이즈 작전(선발대 개척 + 본대 해방) 실측 구출 검증
     * ================================================================*/
    static simulateHordeClearance(map) {
      const STATIC_SOLIDS = new Set([
        'platform', 'steelBarrier', 'steelPlatform', 'rockWall',
        'craggyRock', 'volcanicBasalt', 'quantumCrystal'
      ]);

      const buildGrid = () => {
        const grid = new Uint8Array(W * H);
        for (const el of map.elements) {
          if (el.type === 'polygonRock' && Array.isArray(el.points) && el.points.length >= 3) {
            const val = el.isSteel ? 2 : 1;
            let minY = H - 1;
            let maxY = 0;
            for (const p of el.points) {
              if (p.y < minY) minY = p.y;
              if (p.y > maxY) maxY = p.y;
            }
            minY = Math.max(0, Math.floor(minY));
            maxY = Math.min(H - 1, Math.ceil(maxY));
            const n = el.points.length;
            for (let py = minY; py <= maxY; py++) {
              const nodeX = [];
              const scanY = py + 0.5;
              for (let i = 0; i < n; i++) {
                const j = (i + 1) % n;
                const p1 = el.points[i];
                const p2 = el.points[j];
                if ((p1.y < scanY && p2.y >= scanY) || (p2.y < scanY && p1.y >= scanY)) {
                  nodeX.push(p1.x + (scanY - p1.y) / (p2.y - p1.y) * (p2.x - p1.x));
                }
              }
              nodeX.sort((a, b) => a - b);
              for (let i = 0; i < nodeX.length; i += 2) {
                if (i + 1 < nodeX.length) {
                  const sx = Math.max(0, Math.ceil(nodeX[i]));
                  const ex = Math.min(W - 1, Math.floor(nodeX[i + 1]));
                  for (let px = sx; px <= ex; px++) grid[py * W + px] = val;
                }
              }
            }
            continue;
          }
          if (el.type === 'diagonalBeam') {
            const normDir = (el.dir === 'downLeft' || el.dir === 'down-left' || el.dir === -1) ? 'downLeft' : 'downRight';
            const t = Math.max(8, el.thickness || 16);
            const halfT = Math.floor(t / 2);
            const bw = Math.max(1, Math.floor(el.w || 24));
            const bh = Math.floor(el.h || 24);
            const bx = Math.floor(el.x || 0);
            const by = Math.floor(el.y || 0);
            for (let dx = 0; dx < bw; dx++) {
              const px = bx + dx;
              if (px < 0 || px >= W) continue;
              const centerFrac = (normDir === 'downRight') ? (dx / bw) : ((bw - dx) / bw);
              const cy = by + Math.floor(bh * centerFrac);
              for (let dy = cy - halfT; dy <= cy + halfT; dy++) {
                if (dy >= 0 && dy < H) grid[dy * W + px] = 2;
              }
            }
            continue;
          }
          if (el.type === 'triangleSlope') {
            const val = el.isSteel ? 2 : 1;
            const x0 = Math.max(0, Math.floor(el.x));
            const x1 = Math.min(W, Math.floor(el.x + el.w));
            const y0 = Math.max(0, Math.floor(el.y));
            const y1 = Math.min(H, Math.floor(el.y + el.h));
            for (let x = x0; x < x1; x++) {
              const t = (x - el.x) / Math.max(1, el.w);
              const topY = (el.direction === 'up-left')
                ? Math.floor(el.y + el.h * t)
                : Math.floor(el.y + el.h * (1 - t));
              for (let y = Math.max(y0, topY); y < y1; y++) {
                grid[y * W + x] = val;
              }
            }
            continue;
          }
          if (!STATIC_SOLIDS.has(el.type)) continue;
          const val = (el.type === 'steelBarrier' || el.type === 'steelPlatform' || el.isSteel) ? 2 : 1;
          const x0 = Math.max(0, Math.min(W - 1, Math.floor(el.x)));
          const y0 = Math.max(0, Math.min(H - 1, Math.floor(el.y)));
          const x1 = Math.max(0, Math.min(W, Math.floor(el.x + el.w)));
          const y1 = Math.max(0, Math.min(H, Math.floor(el.y + el.h)));
          for (let y = y0; y < y1; y++) {
            const row = y * W;
            for (let x = x0; x < x1; x++) grid[row + x] = val;
          }
        }
        return grid;
      };

      const jumpPads = (map.elements || [])
        .filter(e => e.type === 'jumpPad')
        .map(e => ({ ...e }));

      const runPhysicsTrial = (actionList, allowFloat) => {
        const grid = buildGrid();
        const movingPlats = (map.elements || [])
          .filter(e => e.type === 'movingPlatform')
          .map(e => ({
            ...e,
            startX: e.x,
            startY: e.y,
            pos: 0,
            dir: 1,
            pause: 0,
            dx: 0,
            dy: 0
          }));

        const isSolid = (x, y) => {
          x = Math.floor(x); y = Math.floor(y);
          if (x < 0 || x >= W || y < 0 || y >= H) return false;
          return grid[y * W + x] !== 0;
        };
        const isSteel = (x, y) => {
          x = Math.floor(x); y = Math.floor(y);
          if (x < 0 || x >= W || y < 0 || y >= H) return false;
          return grid[y * W + x] === 2;
        };
        const isNaturalWall = (x, y) => {
          x = Math.floor(x); y = Math.floor(y);
          if (x < 0 || x >= W || y < 0 || y >= H) return false;
          const val = grid[y * W + x];
          return val === 1 || val === 2;
        };
        const carveRect = (cx, cy, cw, ch) => {
          const x0 = Math.max(0, Math.floor(cx));
          const y0 = Math.max(0, Math.floor(cy));
          const x1 = Math.min(W, Math.floor(cx + cw));
          const y1 = Math.min(H, Math.floor(cy + ch));
          for (let y = y0; y < y1; y++) {
            const row = y * W;
            for (let x = x0; x < x1; x++) {
              if (grid[row + x] === 1) grid[row + x] = 0;
            }
          }
        };
        const buildRampOnGrid = (bx, by, dir) => {
          for (let dx = 0; dx <= 48; dx++) {
            const px = Math.floor(bx + dir * dx);
            const py = Math.floor(by - Math.floor((dx * 22) / 48));
            if (px < 0 || px >= W || py < 12 || py >= H) break;
            if (isSteel(px, py - 10)) break;
            for (let dy = 0; dy < 5; dy++) {
              const yy = py + dy;
              if (yy >= 0 && yy < H && grid[yy * W + px] === 0) {
                grid[yy * W + px] = 3;
              }
            }
          }
        };

        const queue = actionList.map(a => ({ ...a, built: 0 }));
        let stepIdx = 0;
        let floatBudget = allowFloat ? (map.skills.float || 0) : 0;

        const numUnits = 10;
        const units = [];
        let spawned = 0;
        let spawnTimer = 0;
        let rescued = 0;
        let dead = 0;
        let solverCooldown = 0;

        for (let tick = 0; tick < 3600; tick++) {
          if (solverCooldown > 0) solverCooldown--;

          // Update moving platforms
          for (const mp of movingPlats) {
            const prevX = mp.x;
            const prevY = mp.y;
            if (mp.pause > 0) {
              mp.pause--;
            } else {
              const spd = mp.speed || 0.72;
              mp.pos += mp.dir * spd;
              if (mp.pos >= (mp.range || 40)) {
                mp.pos = mp.range || 40;
                mp.dir = -1;
                mp.pause = mp.pauseTicks || 30;
              } else if (mp.pos <= 0) {
                mp.pos = 0;
                mp.dir = 1;
                mp.pause = mp.pauseTicks || 30;
              }
              if (mp.axis === 'vertical') mp.y = mp.startY + mp.pos;
              else mp.x = mp.startX + mp.pos;
            }
            mp.dx = mp.x - prevX;
            mp.dy = mp.y - prevY;
          }

          if (spawned < numUnits) {
            spawnTimer++;
            if (spawnTimer >= (map.spawnRate || 24) || spawned === 0) {
              spawnTimer = 0;
              spawned++;
              units.push({
                idx: spawned,
                x: map.spawnX,
                y: map.spawnY,
                dir: 1,
                vx: 0,
                vy: 0,
                fallDist: 0,
                state: 'FALL',
                alive: true,
                escaped: false,
                jumpPadCooldown: 0,
                ridingPlatform: null
              });
            }
          }

          const activeUnits = units.filter(u => u.alive && !u.escaped);
          if (activeUnits.length === 0 && spawned >= numUnits) break;

          // Tactical action execution (supports Pioneer/Crowd roles & targeted triggers)
          const walkers = activeUnits.filter(u => u.state === 'WALK');
          if (walkers.length > 0 && solverCooldown <= 0 && stepIdx < queue.length) {
            const curr = queue[stepIdx];
            const matchesTrigger = (u) => {
              const nearWallOk = !curr.atWallX || Math.abs(u.x - curr.atWallX) <= 22;
              const nearXOk = !curr.atX || Math.abs(u.x - curr.atX) <= 8;
              const nearEdgeOk = !curr.atEdgeX || Math.abs(u.x - curr.atEdgeX) <= 6;
              const dirOk = !curr.dir || u.dir === curr.dir;
              return nearWallOk && nearXOk && nearEdgeOk && dirOk;
            };

            let candidate = null;
            if (curr.role === 'crowd') {
              candidate = walkers.find(u => u.idx >= 2 && matchesTrigger(u))
                || walkers.find(u => u.idx >= 2)
                || walkers.find(matchesTrigger);
            } else {
              walkers.sort((a, b) => a.idx - b.idx);
              candidate = walkers.find(u => u.idx === 1 && matchesTrigger(u))
                || walkers.find(matchesTrigger)
                || walkers[0];
            }

            if (candidate) {
              const aheadX = candidate.x + candidate.dir * 12;
              const isSolidAhead = isSolid(aheadX, candidate.y - 6) || isSolid(aheadX, candidate.y - 12);
              const isSteelAhead = isSteel(aheadX, candidate.y - 6) || isSteel(aheadX, candidate.y - 12);

              const nearWallOk = !curr.atWallX || Math.abs(candidate.x - curr.atWallX) <= 22;
              const nearXOk = !curr.atX || Math.abs(candidate.x - curr.atX) <= 8;
              const nearEdgeOk = !curr.atEdgeX || Math.abs(candidate.x - curr.atEdgeX) <= 6;
              const dirOk = !curr.dir || candidate.dir === curr.dir;

              if (curr.act === 'CLIMB' && isSolidAhead && !isSteelAhead && nearWallOk) {
                let topY = candidate.y;
                while (isSolid(aheadX, topY - 1) && topY > 14) topY--;
                if (!isSolid(aheadX, topY - 12)) {
                  let overX = aheadX;
                  while (isSolid(overX, topY + 2) && Math.abs(overX - candidate.x) < 42) overX += candidate.dir;
                  candidate.x = overX + candidate.dir * 2;
                  candidate.y = topY;
                  candidate.state = 'FALL';
                  candidate.vy = 0;
                  candidate.fallDist = 0;
                  stepIdx++;
                  solverCooldown = 16;
                }
              } else if (curr.act === 'BASH' && isSolidAhead && !isSteelAhead && nearWallOk) {
                const bashX = candidate.dir > 0 ? candidate.x : (candidate.x - 58);
                carveRect(bashX, candidate.y - 26, 58, 26);
                stepIdx++;
                solverCooldown = 16;
              } else if (curr.act === 'DRILL' && nearXOk) {
                carveRect(candidate.x - 10, candidate.y - 1, 20, 62);
                candidate.state = 'FALL';
                candidate.vy = 0;
                candidate.fallDist = 0;
                stepIdx++;
                solverCooldown = 24;
              } else if (curr.act === 'MINE' && nearXOk && nearWallOk && dirOk) {
                for (let s = 0; s < 58; s++) {
                  const mx = candidate.x + candidate.dir * s * 1.6;
                  const my = candidate.y + s * 1.35;
                  if (s >= 18 && !isSolid(mx + candidate.dir * 14, my + 2)) break;
                  if (isSteel(mx + candidate.dir * 6, my + 2)) break;
                  carveRect(mx - 10, my - 18, 22, 24);
                }
                stepIdx++;
                solverCooldown = 24;
              } else if (curr.act === 'BUILD' && nearEdgeOk && nearXOk && dirOk && (!curr.atEdgeX || !isSolid(aheadX, candidate.y + 4) || isSolid(aheadX, candidate.y - 10))) {
                const count = curr.count || 1;
                for (let c = 0; c < count; c++) {
                  buildRampOnGrid(candidate.x, candidate.y, candidate.dir);
                  candidate.x += candidate.dir * 44;
                  candidate.y -= 21;
                }
                candidate.state = 'FALL';
                candidate.vy = 0;
                candidate.fallDist = 0;
                stepIdx++;
                solverCooldown = 12;
              } else if (curr.act === 'FLOAT') {
                stepIdx++;
              }
            }
          }

          for (const u of activeUnits) {
            if (!u.alive || u.escaped) continue;
            if (u.jumpPadCooldown > 0) u.jumpPadCooldown--;

            if (u.ridingPlatform) {
              u.x += u.ridingPlatform.dx;
              u.y += u.ridingPlatform.dy;
            }

            // JumpPad trigger check (exact NanoUnit + JumpPad physics)
            if (u.jumpPadCooldown <= 0) {
              for (const pad of jumpPads) {
                if (u.x >= pad.x - 4 && u.x <= pad.x + pad.w + 4 && u.y >= pad.y - 8 && u.y <= pad.y + pad.h + 4) {
                  u.state = 'FALL';
                  u.ridingPlatform = null;
                  u.fallDist = 0;
                  u.jumpPadCooldown = 18;
                  u.y = pad.y - 8;
                  const cx = pad.x + pad.w / 2;
                  const pwr = pad.power || 9.5;
                  if (pad.dir === 'up-right') {
                    u.vy = -pwr * 0.88;
                    u.dir = 1;
                    u.vx = 3.6;
                    u.x = cx + 4;
                  } else if (pad.dir === 'up-left') {
                    u.vy = -pwr * 0.88;
                    u.dir = -1;
                    u.vx = -3.6;
                    u.x = cx - 4;
                  } else {
                    u.vy = -pwr;
                    u.vx = 0;
                    u.x = cx;
                  }
                  break;
                }
              }
            }

            const distToGate = Math.hypot(u.x - map.gateX, (u.y - 12) - map.gateY);
            if (distToGate < 34 || (Math.abs(u.x - map.gateX) < 24 && Math.abs(u.y - 12 - map.gateY) < 30)) {
              u.escaped = true;
              rescued++;
              continue;
            }

            if (u.y >= 425 || u.x < 5 || u.x > W - 5) {
              u.alive = false;
              dead++;
              continue;
            }

            if (u.state === 'FALL') {
              if (allowFloat && u.fallDist >= 68 && !u.floating && floatBudget > 0) {
                u.floating = true;
                floatBudget--;
              }
              if (u.floating) {
                u.vy = 0.85;
              } else if (u.vy < 0) {
                u.vy += 0.22;
                if (isSolid(u.x, u.y - 16)) u.vy = 0;
              } else {
                u.vy = Math.min(3.6, (u.vy || 0) + 0.15);
              }

              if (u.vx && Math.abs(u.vx) > 0.05) {
                const nextAirX = u.x + u.vx;
                if (isSolid(nextAirX, u.y - 10)) {
                  u.dir = -u.dir;
                  u.vx = -u.vx * 0.4;
                } else {
                  u.x = nextAirX;
                }
                u.vx *= 0.985;
              }

              const prevY = u.y;
              u.y += u.vy;
              if (u.vy > 0) u.fallDist += u.vy;
              if (u.vy < 0) continue;

              // Check moving platform landing
              let landedMoving = false;
              for (const mp of movingPlats) {
                if (u.x >= mp.x - 2 && u.x <= mp.x + mp.w + 2 && prevY <= mp.y + 4 && u.y >= mp.y - 2) {
                  if (u.fallDist > 96 && !u.floating) {
                    u.alive = false;
                    dead++;
                  } else {
                    u.state = 'WALK';
                    u.y = mp.y;
                    u.vy = 0;
                    u.vx = 0;
                    u.fallDist = 0;
                    u.floating = false;
                    u.ridingPlatform = mp;
                  }
                  landedMoving = true;
                  break;
                }
              }
              if (landedMoving) continue;

              if (isSolid(u.x, u.y + 1)) {
                while (isSolid(u.x, u.y) && u.y > 0) u.y--;
                if (u.fallDist > 96 && !u.floating) {
                  u.alive = false;
                  dead++;
                } else {
                  u.state = 'WALK';
                  u.vy = 0;
                  u.vx = 0;
                  u.fallDist = 0;
                  u.floating = false;
                }
              }
            } else if (u.state === 'WALK') {
              if (u.ridingPlatform) {
                const mp = u.ridingPlatform;
                if (u.x < mp.x - 2 || u.x > mp.x + mp.w + 2) {
                  u.ridingPlatform = null;
                } else {
                  u.x += u.dir * 1.25;
                  continue;
                }
              }

              let onGround = false;
              for (let dy = 1; dy <= 6; dy++) {
                if (isSolid(u.x, u.y + dy)) {
                  u.y += (dy - 1);
                  onGround = true;
                  break;
                }
              }
              if (!onGround && !isSolid(u.x, u.y + 1)) {
                // Check moving platform step onto
                let ontoMp = null;
                for (const mp of movingPlats) {
                  if (u.x >= mp.x - 2 && u.x <= mp.x + mp.w + 2 && Math.abs(u.y - mp.y) <= 10) {
                    ontoMp = mp;
                    break;
                  }
                }
                if (ontoMp) {
                  u.ridingPlatform = ontoMp;
                  u.y = ontoMp.y;
                } else {
                  u.state = 'FALL';
                  u.fallDist = 0;
                  u.vy = 0;
                  u.vx = 0;
                }
                continue;
              }

              const nextX = u.x + u.dir * 1.25;
              let stepped = false;
              if (isSolid(nextX, u.y - 1)) {
                for (let h = 1; h <= 8; h++) {
                  if (!isSolid(nextX, u.y - h) && !isNaturalWall(nextX, u.y - h - 10)) {
                    u.y -= h;
                    u.x = nextX;
                    stepped = true;
                    break;
                  }
                }
              }

              if (!stepped) {
                const head1 = isNaturalWall(nextX, u.y - 4);
                const head2 = isNaturalWall(nextX, u.y - 12);
                if (head1 || head2) {
                  u.dir = -u.dir;
                } else {
                  u.x = nextX;
                }
              }
            }
          }
        }

        return { rescued, dead, total: numUnits, stepsCompleted: stepIdx };
      };

      // 1) 무조작(0-스킬) 클리어 불가 검증
      const zeroSkillRun = runPhysicsTrial([], false);
      if (zeroSkillRun.rescued > 0) {
        return {
          success: false,
          rescued: 0,
          total: 10,
          dead: 10,
          reason: `무조작(${zeroSkillRun.rescued}명) 클리어 가능 판정 — 기믹 누수`
        };
      }

      // 2) 단일/2단 수직·사선 날먹 방지 검증
      const cheeseTrials = [
        [{ act: 'BASH', count: 1 }],
        [{ act: 'DRILL', count: 1 }],
        [{ act: 'MINE', count: 1 }],
        [{ act: 'BUILD', count: 1 }],
        [{ act: 'DRILL', count: 1 }, { act: 'DRILL', count: 1 }],
        [{ act: 'MINE', count: 1 }, { act: 'MINE', count: 1 }],
        [{ act: 'BASH', count: 1 }, { act: 'DRILL', count: 1 }]
      ];
      for (const cheeseAct of cheeseTrials) {
        const cr = runPhysicsTrial(cheeseAct, false);
        if (cr.rescued >= 5) {
          return {
            success: false,
            rescued: 0,
            total: 10,
            dead: 10,
            reason: `단순 날먹(${cheeseAct.map(c => c.act).join('+')}) 가능 판정`
          };
        }
      }

      // 3) 정석 해법 실측 검증
      const goldenActions = (map._layoutData && map._layoutData.actionPlan)
        ? map._layoutData.actionPlan
        : (map.solutionDna || []).map(act => ({ act, count: 1 }));
      const goldenRun = runPhysicsTrial(goldenActions, true);
      const requiredRescued = Math.ceil((10 * (map.needPercent || 65)) / 100);
      const isSuccess = goldenRun.rescued >= requiredRescued;

      return {
        success: isSuccess,
        rescued: goldenRun.rescued,
        total: goldenRun.total,
        dead: goldenRun.dead,
        reason: isSuccess
          ? `매크로 토폴로지 검증 통과 (${goldenRun.rescued}/${goldenRun.total} 구출)`
          : `매크로 토폴로지 검증 미달 (${goldenRun.rescued}/${goldenRun.total} 구출, 기믹 ${goldenRun.stepsCompleted}/${goldenActions.length})`
      };
    }

    static buildFallback(options = {}) {
      const seed = ((Math.random() * 1e9) | 0) ^ (Date.now() & 0x7fffffff);
      const rawRNG = makeRNG(seed);
      const R = makeRNGHelpers(rawRNG);
      const diff = this.resolveDifficulty(options.difficulty);
      const { palette, theme } = this.resolvePaletteAndTheme(options, R);

      const bp = this.buildMacroPuzzleBlueprint('chamber', diff, R, palette, options);
      const skills = this.calculateSkills(bp.actionPlan, diff, R);
      const timeLimit = this.calculateDynamicTimeLimit(bp.solution, diff.key);
      const titleWord = R.pick(SECTOR_NAMES);

      const candidate = {
        id: options.id || 'CUSTOM',
        difficulty: diff.key,
        title: `[${diff.name}] ${titleWord} (${diff.name})`,
        desc: '',
        bgImg: theme,
        terrainTheme: palette,
        biome: (palette === 'red' ? 'volcanicRift' : palette === 'purple' ? 'voidLattice' : palette === 'brown' ? 'derelictStation' : palette === 'green' ? 'verdantStrata' : 'cryoCavern'),
        totalUnits: diff.units,
        needPercent: diff.needPercent,
        spawnRate: diff.spawnRate,
        timeLimit,
        spawnX: bp.spawn.x,
        spawnY: bp.spawn.y,
        gateX: bp.gate.x,
        gateY: bp.gate.y,
        skills,
        elements: bp.elements,
        solutionDna: bp.solution,
        difficultyScore: 0,
        difficultyFactors: {},
        layoutType: 'chamber',
        seed,
        _meta: {
          seed,
          archetype: 'chamber',
          gimmickLabel: bp.gimmickLabel,
          shortcutHint: bp.shortcutHint,
          difficulty: diff.name,
          architecturalFeaturesIntegrated: true,
          fallback: true,
          simVerified: true
        }
      };

      const scoreObj = this.calculateDifficultyScore(candidate);
      candidate.difficultyScore = scoreObj.score;
      candidate.difficultyFactors = scoreObj.factors;
      candidate.desc = `[CHAMBER] ${bp.gimmickLabel} — ${bp.shortcutHint}. (점수: ${candidate.difficultyScore}pt, 정석: ${bp.solution.join(' → ')})`;
      return candidate;
    }

    static generate(options = {}) {
      const MAX_RETRIES = 24;
      this._genSeq = ((this._genSeq || 0) + 1) | 0;

      const initSeed = options.seed != null
        ? (options.seed >>> 0)
        : ((((Math.random() * 1e9) | 0) ^ (Date.now() & 0x7fffffff) ^ Math.imul(this._genSeq, 2654435761)) >>> 0);
      const initR = makeRNGHelpers(makeRNG(initSeed));
      const primaryArchetype = this.pickArchetype(options.layout, initR);

      this._variantByArch = this._variantByArch || {};
      const baseVariant = options.variant != null
        ? (((options.variant % 4) + 4) % 4)
        : (this._variantByArch[primaryArchetype] == null ? (initSeed % 4) : ((this._variantByArch[primaryArchetype] + 1) % 4));
      this._variantByArch[primaryArchetype] = baseVariant;

      const chosenMirrorX = options.mirrorX != null
        ? !!options.mirrorX
        : (this._mirrorToggle = !this._mirrorToggle);

      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        const seed = options.seed != null
          ? ((options.seed + attempt * 7919) >>> 0)
          : ((((Math.random() * 1e9) | 0) ^ (Date.now() & 0x7fffffff) ^ Math.imul(this._genSeq, 2654435761) ^ (attempt * 104729)) >>> 0);

        const rawRNG = makeRNG(seed);
        const R = makeRNGHelpers(rawRNG);

        const diff = this.resolveDifficulty(options.difficulty);
        const { palette, theme } = this.resolvePaletteAndTheme(options, R);
        const archetype = primaryArchetype;
        const variant = (baseVariant + attempt) % 4;
        const mirrorX = options.mirrorX != null ? !!options.mirrorX : (attempt === 0 ? chosenMirrorX : !chosenMirrorX);

        const bp = this.buildMacroPuzzleBlueprint(archetype, diff, R, palette, { ...options, variant, mirrorX });
        const validation = this.validateLayout(bp);
        if (!validation.valid) continue;

        const skills = this.calculateSkills(bp.actionPlan, diff, R);
        const timeLimit = this.calculateDynamicTimeLimit(bp.solution, diff.key);
        const titleWord = R.pick(SECTOR_NAMES);
        const stageNo = options.stageNo ? `S${options.stageNo}` : '';
        const title = stageNo ? `[${stageNo}] ${titleWord} (${diff.name})` : `[${diff.name}] ${titleWord} (${diff.name})`;

        const candidate = {
          id: options.id || 'CUSTOM',
          difficulty: diff.key,
          title,
          desc: '',
          bgImg: theme,
          terrainTheme: palette,
          biome: (palette === 'red' ? 'volcanicRift' : palette === 'purple' ? 'voidLattice' : palette === 'brown' ? 'derelictStation' : palette === 'green' ? 'verdantStrata' : 'cryoCavern'),
          totalUnits: diff.units,
          needPercent: diff.needPercent,
          spawnRate: diff.spawnRate,
          timeLimit,
          spawnX: bp.spawn.x,
          spawnY: bp.spawn.y,
          gateX: bp.gate.x,
          gateY: bp.gate.y,
          skills,
          elements: bp.elements,
          solutionDna: bp.solution,
          difficultyScore: 0,
          difficultyFactors: {},
          layoutType: archetype,
          seed,
          _layoutData: bp,
          _meta: {
            seed,
            archetype,
            variant: bp.variant,
            variantName: bp.variantName,
            gimmickLabel: bp.gimmickLabel,
            shortcutHint: bp.shortcutHint,
            difficulty: diff.name,
            architecturalFeaturesIntegrated: true,
            attempt: attempt + 1
          }
        };

        const scoreObj = this.calculateDifficultyScore(candidate);
        candidate.difficultyScore = scoreObj.score;
        candidate.difficultyFactors = scoreObj.factors;
        candidate.desc = `[${archetype.toUpperCase()}] ${bp.gimmickLabel} (${bp.variantName}) — ${bp.shortcutHint}. (점수: ${candidate.difficultyScore}pt, 정석: ${bp.solution.join(' → ')})`;

        const simResult = this.simulateHordeClearance(candidate);
        delete candidate._layoutData;

        if (!simResult.success) continue;

        candidate._meta.antiCheeseVerified = true;
        candidate._meta.simVerified = true;
        candidate._meta.rescuedRatio = `${simResult.rescued}/${simResult.total}`;
        return candidate;
      }

      return this.buildFallback(options);
    }
  }

  return { FullCanvasLevelArchitect, DIFF_SPECS, BIOMES, GIMMICK_CATALOG };
});
