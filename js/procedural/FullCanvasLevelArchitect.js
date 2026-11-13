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
        variant = ((opts.variant % 3) + 3) % 3;
      } else {
        this._variantByArch = this._variantByArch || {};
        const prev = this._variantByArch[archetype];
        variant = prev == null ? 0 : (prev + 1) % 3;
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
          } else {
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
          } else {
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
          } else {
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
          } else {
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
          } else {
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
          } else {
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
      this.addTopCavernCeiling(elements, pal, R);

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
                const bashX = candidate.dir > 0 ? (aheadX - 6) : (aheadX - 52 + 6);
                carveRect(bashX, candidate.y - 26, 52, 26);
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
        ? (((options.variant % 3) + 3) % 3)
        : (this._variantByArch[primaryArchetype] == null ? (initSeed % 3) : ((this._variantByArch[primaryArchetype] + 1) % 3));
      this._variantByArch[primaryArchetype] = baseVariant;

      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        const seed = options.seed != null
          ? ((options.seed + attempt * 7919) >>> 0)
          : ((((Math.random() * 1e9) | 0) ^ (Date.now() & 0x7fffffff) ^ Math.imul(this._genSeq, 2654435761) ^ (attempt * 104729)) >>> 0);

        const rawRNG = makeRNG(seed);
        const R = makeRNGHelpers(rawRNG);

        const diff = this.resolveDifficulty(options.difficulty);
        const { palette, theme } = this.resolvePaletteAndTheme(options, R);
        const archetype = primaryArchetype;
        const variant = (baseVariant + attempt) % 3;

        const bp = this.buildMacroPuzzleBlueprint(archetype, diff, R, palette, { ...options, variant });
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
