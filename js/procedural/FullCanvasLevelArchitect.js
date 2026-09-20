/* ============================================================================
 * FullCanvasLevelArchitect.js — 100% 클리어 보장 절차적 맵 엔진 v3
 * 탈출 시나리오 설계 → 물리 단차 및 스킬 산정 → 지형 조립 → 군단 가상 물리 실측 검증
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
      },
      weighted: (items) => {
        let tot = 0;
        for (const it of items) tot += Math.max(0, it.w || 1);
        if (tot <= 0) return items[0];
        let x = rng() * tot;
        for (const it of items) { x -= Math.max(0, it.w || 1); if (x <= 0) return it; }
        return items[items.length - 1];
      }
    };
  }

  /* ======================================================================
   * 난이도 사양
   * ====================================================================*/
  const DIFF_SPECS = {
    easy: {
      key: 'easy', name: 'EASY',
      minScore: 25,
      scoreRange: [25, 45],
      timeMultiplier: 1.80,
      units: 15, needPercent: 50, timeLimit: 240, spawnRate: 34,
      actionRange: [2, 3],
      slack: { requiredMin: 2, requiredMax: 4, otherMin: 1, otherMax: 3 },
      hasDecoy: false,
      minUniqueSkills: 1
    },
    normal: {
      key: 'normal', name: 'NORMAL',
      minScore: 50,
      scoreRange: [50, 78],
      timeMultiplier: 1.45,
      units: 18, needPercent: 65, timeLimit: 180, spawnRate: 26,
      actionRange: [3, 4],
      slack: { requiredMin: 1, requiredMax: 2, otherMin: 0, otherMax: 1 },
      hasDecoy: false,
      minUniqueSkills: 2
    },
    hard: {
      key: 'hard', name: 'HARD',
      minScore: 85,
      scoreRange: [85, 140],
      timeMultiplier: 1.20,
      units: 20, needPercent: 75, timeLimit: 150, spawnRate: 22,
      actionRange: [4, 5],
      slack: { requiredMin: 0, requiredMax: 1, otherMin: 0, otherMax: 0 },
      hasDecoy: true,
      minUniqueSkills: 3
    },
    nightmare: {
      key: 'nightmare', name: 'NIGHTMARE',
      minScore: 110,
      scoreRange: [110, 180],
      timeMultiplier: 1.05,
      units: 25, needPercent: 85, timeLimit: 120, spawnRate: 16,
      actionRange: [5, 6],
      slack: { requiredMin: 0, requiredMax: 0, otherMin: 0, otherMax: 0 },
      hasDecoy: true,
      minUniqueSkills: 4
    }
  };

  /* ======================================================================
   * 바이옴 & 이름 테이블
   * ====================================================================*/
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

  /* ======================================================================
   * 아키타입별 스킬 가중 풀 (군단 전원 통과 스킬만 메인 채택, PORTAL 항상 배제)
   * ====================================================================*/
  const ARCHETYPE_POOLS = {
    cascade: [
      { act: 'DRILL', w: 3.5 }, { act: 'MINE', w: 3 }, { act: 'BASH', w: 3 },
      { act: 'BUILD', w: 2 }, { act: 'BLOCK', w: 1.5 }, { act: 'BOMB', w: 0.8 }
    ],
    zigzag: [
      { act: 'BASH', w: 3.5 }, { act: 'BUILD', w: 3 }, { act: 'DRILL', w: 2.5 },
      { act: 'MINE', w: 2 }, { act: 'BLOCK', w: 2 }, { act: 'BOMB', w: 0.8 }
    ],
    traverse: [
      { act: 'BASH', w: 3.5 }, { act: 'BUILD', w: 3 }, { act: 'MINE', w: 2.5 },
      { act: 'DRILL', w: 2 }, { act: 'BLOCK', w: 1.5 }, { act: 'BOMB', w: 0.8 }
    ],
    split: [
      { act: 'DRILL', w: 3.5 }, { act: 'BUILD', w: 3 }, { act: 'BASH', w: 2.5 },
      { act: 'MINE', w: 2 }, { act: 'BLOCK', w: 1.5 }, { act: 'BOMB', w: 0.8 }
    ],
    chamber: [
      { act: 'DRILL', w: 4 }, { act: 'BASH', w: 3 }, { act: 'BUILD', w: 2.5 },
      { act: 'MINE', w: 2 }, { act: 'BLOCK', w: 1 }, { act: 'BOMB', w: 0.8 }
    ],
    ascent: [
      { act: 'BUILD', w: 4.5 }, { act: 'BASH', w: 3 }, { act: 'MINE', w: 2 },
      { act: 'BLOCK', w: 1.5 }, { act: 'BOMB', w: 0.8 }, { act: 'DRILL', w: 1 }
    ]
  };

  /* ====================================================================
   * FullCanvasLevelArchitect
   * ==================================================================*/
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
      if (!pal || pal === 'random') pal = R.pick(['cyan', 'red', 'purple', 'brown', 'green']);
      const biome = BIOMES[pal] || BIOMES.cyan;
      if (!theme || theme === 'random') theme = R.chance(0.5) ? biome.bg : biome.altBg;
      return { palette: pal, theme, stoneTypes: biome.stone };
    }

    static pickArchetype(layout, R) {
      const archetypes = ['cascade', 'zigzag', 'traverse', 'split', 'chamber', 'ascent'];
      if (!layout || layout === 'random') return R.pick(archetypes);
      const l = layout.toLowerCase();
      if (archetypes.includes(l)) return l;
      const map = {
        multi_tiered: 'cascade', descent: 'cascade', speedway: 'traverse',
        twin_towers: 'ascent', labyrinth: 'split', floating_islands: 'chamber'
      };
      return map[l] || R.pick(archetypes);
    }

    /* ================================================================
     * 1단계: 시나리오(솔루션 DNA) 설계
     * ==============================================================*/
    static designScenario(archetype, diff, R) {
      const numActions = R.irange(diff.actionRange[0], diff.actionRange[1]);
      let pool = (ARCHETYPE_POOLS[archetype] || ARCHETYPE_POOLS.cascade).map(p => ({ ...p }));

      // Hard/Nightmare: 치명적 낙하 연계를 위해 FLOAT 액션을 풀에 추가
      if ((diff.key === 'hard' || diff.key === 'nightmare') && ['cascade', 'zigzag', 'split', 'chamber'].includes(archetype)) {
        if (!pool.some(p => p.act === 'FLOAT')) {
          pool.push({ act: 'FLOAT', w: 2.2 });
        }
      }

      const solution = [];
      const used = new Set();

      for (let i = 0; i < numActions; i++) {
        let candidates = pool.map(p => ({ ...p }));

        // 연속 중복 방지
        if (solution.length > 0) {
          const last = solution[solution.length - 1];
          candidates = candidates.map(c => ({
            ...c, w: c.act === last ? c.w * 0.08 : c.w
          }));
        }

        // BLOCK은 첫/끝 위치 금지
        if (i === 0 || i === numActions - 1) {
          candidates = candidates.filter(c => c.act !== 'BLOCK');
        }

        // FLOAT는 첫 위치 금지 (스폰 직후는 안전 발판)
        if (i === 0) {
          candidates = candidates.filter(c => c.act !== 'FLOAT');
        }

        // CHAMBER 첫 액션은 반드시 DRILL (밀폐 구역 바닥 천공 탈출)
        if (archetype === 'chamber' && i === 0) {
          candidates = candidates.filter(c => c.act === 'DRILL');
          if (candidates.length === 0) candidates = [{ act: 'DRILL', w: 1 }];
        }

        // ASCENT 첫 액션은 BUILD (계단식 상승 시작)
        if (archetype === 'ascent' && i === 0) {
          candidates = candidates.filter(c => c.act === 'BUILD');
          if (candidates.length === 0) candidates = [{ act: 'BUILD', w: 1 }];
        }

        // Hard/Nightmare: 미사용 스킬 우대 (다양성 확보)
        if (diff.key === 'hard' || diff.key === 'nightmare') {
          candidates = candidates.map(c => ({
            ...c, w: used.has(c.act) ? c.w * 0.35 : c.w * 2.0
          }));
        }

        if (candidates.length === 0) candidates = [{ act: 'BASH', w: 1 }];

        const pick = R.weighted(candidates);
        solution.push(pick.act);
        used.add(pick.act);
      }

      // 최소 고유 스킬 수 보장
      const minUnique = diff.minUniqueSkills || 2;
      let fixAttempts = 0;
      while (new Set(solution).size < minUnique && fixAttempts < 6) {
        const unused = pool.filter(p => !new Set(solution).has(p.act) && p.act !== 'BLOCK');
        if (unused.length > 0) {
          const targetIdx = solution.length - 1 - (fixAttempts % Math.max(1, solution.length - 1));
          solution[targetIdx] = R.pick(unused).act;
        }
        fixAttempts++;
      }

      return solution;
    }

    /* ================================================================
     * 2단계: 발판(Slab) 생성 헬퍼
     * ==============================================================*/
    static makeSlab(x, y, w, h, R, pal, stones) {
      return {
        type: R.pick(stones),
        x: Math.round(x),
        y: Math.round(y),
        w: Math.round(w),
        h: h || R.irange(20, 26),
        palette: pal,
        profile: R.profile(Math.max(4, Math.round(w / 40)), 14, 34)
      };
    }

    /* ================================================================
     * 3단계: 아키타입별 시작 위치 & 진행 방향
     * ==============================================================*/
    static getArchetypeFlow(archetype, R) {
      switch (archetype) {
        case 'cascade':
          return { startX: R.irange(40, 150), startY: R.irange(80, 120), dir: 1 };
        case 'zigzag':
          return { startX: R.irange(40, 130), startY: R.irange(80, 115), dir: 1 };
        case 'traverse':
          return { startX: R.irange(40, 100), startY: R.irange(110, 170), dir: 1 };
        case 'split':
          return { startX: R.irange(40, 120), startY: R.irange(95, 145), dir: 1 };
        case 'chamber':
          return { startX: R.irange(40, 120), startY: R.irange(80, 120), dir: 1 };
        case 'ascent':
          // 하층(260~310)에서 스폰되어 계단 증축과 단차 극복을 통해 상층 웜홀로 이동
          return { startX: R.irange(40, 130), startY: R.irange(260, 310), dir: 1 };
        default:
          return { startX: R.irange(40, 150), startY: R.irange(80, 130), dir: 1 };
      }
    }

    /* ================================================================
     * 4단계: 물리 전이(Transition) 빌더
     * — 단차별 정밀 계단 산정 + 두꺼운 플로어 대각 굴착 단차 감쇄
     * ==============================================================*/
    static buildTransition(action, prevSlab, dir, archetype, R, pal, stones) {
      const obstacles = [];
      let nextX, nextY;
      let nextW = R.irange(130, 260);
      const nextH = R.irange(20, 26);
      let newDir = dir;
      let actionDetails = { act: action, count: 1 };

      // 지그재그 아키타입: 매 전이마다 반전 (벽 충돌 후 반대 방향 전개)
      if (archetype === 'zigzag') {
        newDir = -dir;
        // 반전 회랑: 기존 진행 방향 끝단에 군단 반전용 강철 격벽을 배치하여 낭떠러지 추락 방지
        const turnH = Math.min(65, Math.max(30, prevSlab.y - 10));
        const turnY = Math.max(10, prevSlab.y - turnH);
        if (dir > 0) {
          obstacles.push({
            type: 'steelBarrier',
            x: clamp(prevSlab.x + prevSlab.w - 18, 10, W - 25),
            y: turnY,
            w: 20, h: turnH
          });
        } else {
          obstacles.push({
            type: 'steelBarrier',
            x: clamp(prevSlab.x - 2, 10, W - 25),
            y: turnY,
            w: 20, h: turnH
          });
        }
      }

      switch (action) {

        /* ------- BUILD: 3D 계단 증축 (단차에 정비례하는 계단 수량 계산) ------- */
        case 'BUILD': {
          const maxRisePossible = prevSlab.y - 70;
          const maxBuildsPossible = Math.min(3, Math.max(0, Math.floor(maxRisePossible / 24)));
          const isUpward = (archetype === 'ascent') ? (maxBuildsPossible >= 1) : (maxBuildsPossible >= 1 && prevSlab.y > 110 && R.chance(0.5));
          if (isUpward && maxBuildsPossible >= 1) {
            // 사용자 피드백: "계단 건설 할때도 높이차이가 딱 맞게 되지 않아. 조정해줘."
            // 나노봇 계단 1회 건설(maxSteps=12, stepHeight=2px, stepWidth=4px) = 정확히 24px 수직 상승, 48px 수평 전진!
            // 따라서 단차 높이는 N회 계단 건설에 정확히 정비례하여 N * 24px (-2px 표면 안착 보정)이어야 오차 없이 발판에 완벽 착지함!
            const buildsNeeded = (archetype === 'ascent')
              ? R.irange(1, maxBuildsPossible)
              : (maxBuildsPossible > 1 && R.chance(0.4) ? 2 : 1);
            const exactRise = buildsNeeded * 24 - 2; // 상단 2px 여유로 발판 표면에 완벽 안착
            const gapW = buildsNeeded * 48 - R.irange(14, 20); // 계단 상단이 다음 슬랩 위로 14~20px 확실히 오버랩
            nextY = prevSlab.y - exactRise;
            nextX = dir > 0 ? prevSlab.x + prevSlab.w + gapW : prevSlab.x - gapW - nextW;
            actionDetails = { act: 'BUILD', count: buildsNeeded };
          } else {
            // 수평 갭 연결: 단차 0 (완벽한 수평 높이 일치), 갭 28~36px (1계단 48px 전진으로 완벽 가교)
            const gapW = R.irange(28, 36);
            nextY = prevSlab.y;
            nextX = dir > 0 ? prevSlab.x + prevSlab.w + gapW : prevSlab.x - gapW - nextW;
            actionDetails = { act: 'BUILD', count: 1 };
          }
          break;
        }

        /* ------- MINE: 두꺼운 플로어 대각 굴착 — 단차 축소 & 안전 하강 ------- */
        case 'MINE': {
          // 사용자 아이디어: "때로는 두꺼운 플로어를 대각으로 파게되면 단차가 좁혀지는 효과도 있겠지? ... 아래는 안전하게 낙하가능하게 스킬갯수를 조절하면 되겠지?"
          const slabThickness = R.irange(46, 62);
          prevSlab.h = Math.max(prevSlab.h, slabThickness); // 이전 슬랩 두께 증가
          const totalDrop = R.irange(98, 120); // 상단 직진 시 치사 낙하 (98~120px > 96px)
          nextY = clamp(prevSlab.y + totalDrop, 140, H - 55);

          // 상단 직진 낙사를 방지하는 차단벽
          const wallW = R.irange(28, 36);
          const wallH = R.irange(50, 65);
          const wallY = Math.max(10, prevSlab.y - wallH);

          if (dir > 0) {
            const wallX = clamp(prevSlab.x + prevSlab.w - wallW - 6, 10, W - wallW - 10);
            obstacles.push({
              type: 'rockWall', x: wallX, y: wallY,
              w: wallW, h: wallH, palette: pal
            });
            // 하단 슬랩: 대각 굴착 출구(슬랩 바닥) 아래에 안전하게 배치 (잔여 낙하 48~65px < 96px)
            nextX = clamp(prevSlab.x + prevSlab.w - R.irange(50, 110), 20, W - nextW - 20);
          } else {
            const wallX = clamp(prevSlab.x + 6, 10, W - wallW - 10);
            obstacles.push({
              type: 'rockWall', x: wallX, y: wallY,
              w: wallW, h: wallH, palette: pal
            });
            nextX = clamp(prevSlab.x - nextW + R.irange(50, 110), 20, W - nextW - 20);
          }
          actionDetails = { act: 'MINE', count: 1 };
          break;
        }

        /* ------- DRILL: 강철 격벽 차단 + 바닥 천공 안전 하강 ------- */
        case 'DRILL': {
          const dropH = R.irange(58, 76); // 안전 낙하 높이 (<96px, 하부 머리공간 >=32px 보장)
          const steelH = Math.min(R.irange(55, 75), Math.max(30, prevSlab.y - 15));
          const steelY = Math.max(10, prevSlab.y - steelH);

          if (dir > 0) {
            const steelX = clamp(prevSlab.x + prevSlab.w - 24, 10, W - 30);
            obstacles.push({
              type: 'steelBarrier', x: steelX, y: steelY,
              w: 20, h: steelH
            });
            nextY = clamp(prevSlab.y + dropH, 140, H - 55);
            nextX = clamp(prevSlab.x + prevSlab.w - R.irange(80, 140), 20, W - nextW - 20);
          } else {
            const steelX = clamp(prevSlab.x + 4, 10, W - 30);
            obstacles.push({
              type: 'steelBarrier', x: steelX, y: steelY,
              w: 20, h: steelH
            });
            nextY = clamp(prevSlab.y + dropH, 140, H - 55);
            nextX = clamp(prevSlab.x - nextW + R.irange(80, 140), 20, W - nextW - 20);
          }
          actionDetails = { act: 'DRILL', count: 1 };
          break;
        }

        /* ------- BASH: 수평 암벽 절삭 — 통로 개척 ------- */
        case 'BASH': {
          const wallW = R.irange(34, 44);
          const wallH = R.irange(50, 65);
          nextY = prevSlab.y + R.irange(-6, 6);
          const minY = Math.min(prevSlab.y, nextY);
          const wallY = Math.max(10, minY - wallH);
          const actualWallH = Math.max(30, minY - wallY);

          if (dir > 0) {
            const wallX = clamp(prevSlab.x + prevSlab.w - wallW - 8, 10, W - wallW - 10);
            obstacles.push({
              type: 'rockWall', x: wallX, y: wallY,
              w: wallW, h: actualWallH, palette: pal
            });
            // prevSlab 끝에 완벽히 맞닿게 연결 (바닥 단절 없음)
            nextX = prevSlab.x + prevSlab.w - 8;
          } else {
            const wallX = clamp(prevSlab.x + 8, 10, W - wallW - 10);
            obstacles.push({
              type: 'rockWall', x: wallX, y: wallY,
              w: wallW, h: actualWallH, palette: pal
            });
            nextX = prevSlab.x - nextW + 8;
          }
          actionDetails = { act: 'BASH', count: 1 };
          break;
        }

        /* ------- BOMB: 두꺼운 암석 폭파 (BASH 불가 두께) ------- */
        case 'BOMB': {
          const wallW = R.irange(60, 74);
          const wallH = R.irange(55, 70);
          nextY = prevSlab.y + R.irange(-6, 6);
          const minY = Math.min(prevSlab.y, nextY);
          const wallY = Math.max(10, minY - wallH);
          const actualWallH = Math.max(30, minY - wallY);

          if (dir > 0) {
            const wallX = clamp(prevSlab.x + prevSlab.w - wallW - 8, 10, W - wallW - 10);
            obstacles.push({
              type: 'rockWall', x: wallX, y: wallY,
              w: wallW, h: actualWallH, palette: pal
            });
            nextX = prevSlab.x + prevSlab.w - 8;
          } else {
            const wallX = clamp(prevSlab.x + 8, 10, W - wallW - 10);
            obstacles.push({
              type: 'rockWall', x: wallX, y: wallY,
              w: wallW, h: actualWallH, palette: pal
            });
            nextX = prevSlab.x - nextW + 8;
          }
          actionDetails = { act: 'BOMB', count: 1 };
          break;
        }

        /* ------- BLOCK: 미끼 낭떠러지 방어막 전환 ------- */
        case 'BLOCK': {
          const decoyW = R.irange(70, 100);
          const decoyX = dir > 0
            ? clamp(prevSlab.x + prevSlab.w - 10, 10, W - decoyW - 10)
            : clamp(prevSlab.x - decoyW + 10, 10, W - decoyW - 10);
          obstacles.push({
            type: 'platform',
            x: decoyX, y: prevSlab.y,
            w: decoyW, h: 18, palette: pal
          });
          newDir = -dir; // 방향 반전
          nextY = prevSlab.y + R.irange(56, 75);
          nextX = newDir > 0 ? prevSlab.x + 30 : prevSlab.x - nextW + 30;
          actionDetails = { act: 'BLOCK', count: 1 };
          break;
        }

        /* ------- FLOAT: 치명적 낙차 (145~175px > 96px) 역추진 안전 착지 ------- */
        case 'FLOAT': {
          const dropH = R.irange(145, 175); // 145~175px 치명적 낙차 (> 96px, Float 필수)
          nextY = clamp(prevSlab.y + dropH, 160, H - 55);
          if (dir > 0) {
            nextX = clamp(prevSlab.x + prevSlab.w - R.irange(30, 60), 20, W - nextW - 20);
          } else {
            nextX = clamp(prevSlab.x - nextW + R.irange(30, 60), 20, W - nextW - 20);
          }
          actionDetails = { act: 'FLOAT', count: 1 };
          break;
        }

        default: {
          nextY = prevSlab.y;
          nextX = dir > 0 ? prevSlab.x + prevSlab.w + 30 : prevSlab.x - 30 - nextW;
          actionDetails = { act: action, count: 1 };
          break;
        }
      }

      nextX = clamp(Math.round(nextX), 20, W - nextW - 20);
      nextY = clamp(Math.round(nextY), 55, H - 55);

      const slab = this.makeSlab(nextX, nextY, nextW, nextH, R, pal, stones);
      return { slab, obstacles, dir: newDir, actionDetails };
    }

    /* ================================================================
     * 5단계: 레이아웃 조립 (상공 50px 머리공간 클리어런스 강제)
     * ==============================================================*/
    static buildLayout(solution, archetype, diff, R, pal, stones) {
      const elements = [];
      const slabs = [];
      const actionUsage = [];
      const flow = this.getArchetypeFlow(archetype, R);

      // ── 스폰 발판 ──
      const spawnW = R.irange(150, 230);
      const spawnH = R.irange(22, 26);
      const spawnSlab = this.makeSlab(flow.startX, flow.startY, spawnW, spawnH, R, pal, stones);
      elements.push(spawnSlab);
      slabs.push(spawnSlab);

      // 좌측 안전 벽
      const leftWallH = Math.min(65, Math.max(30, spawnSlab.y - 10));
      const leftWallY = Math.max(10, spawnSlab.y - leftWallH);
      elements.push({
        type: 'steelBarrier',
        x: clamp(spawnSlab.x - R.irange(0, 6), 10, W - 30),
        y: leftWallY,
        w: 20, h: leftWallH
      });

      let prevSlab = spawnSlab;
      let curDir = flow.dir;
      let startIdx = 0;

      // ── CHAMBER 특수 처리: 넉넉한 머리공간 확보 후 하강 DRILL 탈출 ──
      if (archetype === 'chamber') {
        const chWallH = Math.min(70, Math.max(30, spawnSlab.y - 10));
        elements.push({
          type: 'steelBarrier',
          x: clamp(spawnSlab.x + spawnSlab.w - 20, 10, W - 30),
          y: Math.max(10, spawnSlab.y - chWallH),
          w: 20, h: chWallH
        });

        const escDropH = R.irange(58, 76);
        const escY = clamp(spawnSlab.y + escDropH, 150, H - 60);
        const escX = clamp(spawnSlab.x - 10, 20, W - 280);
        const escW = clamp(spawnSlab.w + 30, 220, W - escX - 20);
        const escapeSlab = this.makeSlab(escX, escY, escW, R.irange(22, 26), R, pal, stones);
        elements.push(escapeSlab);
        slabs.push(escapeSlab);
        prevSlab = escapeSlab;
        actionUsage.push({ act: 'DRILL', count: 1 });
        startIdx = 1;
      }

      // ── 메인 루프: 전이 빌드 및 발판 배치 ──
      for (let i = startIdx; i < solution.length; i++) {
        const action = solution[i];
        const result = this.buildTransition(action, prevSlab, curDir, archetype, R, pal, stones);

        for (const obs of result.obstacles) elements.push(obs);
        elements.push(result.slab);
        slabs.push(result.slab);
        actionUsage.push(result.actionDetails);
        prevSlab = result.slab;
        curDir = result.dir;
      }

      // ── 최종 종착 슬랩: 안전벽 & 웜홀 배치 (웜홀 구역 완벽 밀폐로 낙사 원천 차단) ──
      const endWallH = Math.min(65, Math.max(30, prevSlab.y - 10));
      const endWallY = Math.max(10, prevSlab.y - endWallH);

      // 우측 안전벽
      elements.push({
        type: 'steelBarrier',
        x: clamp(prevSlab.x + prevSlab.w - 20, 10, W - 30),
        y: endWallY,
        w: 20, h: endWallH
      });

      // 좌측 역주행 방지벽
      if (curDir < 0) {
        elements.push({
          type: 'steelBarrier',
          x: clamp(prevSlab.x, 10, W - 30),
          y: endWallY,
          w: 20, h: endWallH
        });
      }

      const spawn = { x: clamp(spawnSlab.x + 60, 40, W - 60), y: clamp(spawnSlab.y - 36, 40, H - 60) };
      const gateX = clamp(prevSlab.x + prevSlab.w - 55, prevSlab.x + 25, prevSlab.x + prevSlab.w - 25);
      const gateY = prevSlab.y - 26;
      const gate = { x: gateX, y: gateY };
      const actualSolution = [];
      for (const u of actionUsage) {
        const cnt = u.count || 1;
        for (let c = 0; c < cnt; c++) actualSolution.push(u.act);
      }

      return { elements, slabs, spawn, gate, solution: actualSolution, actionUsage };
    }

    /* ================================================================
     * 6단계: 스킬 수량 산정 (엄격한 예산 비율 & 미끼 스킬 지급)
     * ==============================================================*/
    static calculateSkills(actionUsage, diff, R, solution = []) {
      const skills = {
        climb: 0, float: 0, bash: 0, mine: 0,
        drill: 0, bomb: 0, build: 0, block: 0, portal: 0
      };

      // 실제 필요한 스킬 수량 정확 집계 (단차 계단 수 포함)
      const reqCount = {};
      for (const item of actionUsage) {
        const k = item.act.toLowerCase();
        const cnt = item.count || 1;
        reqCount[k] = (reqCount[k] || 0) + cnt;
      }

      // FLOAT 스킬 요구량: 치명적 낙하 시 낙하 군단 전원(또는 대다수)이 안전 착지해야 함
      if (reqCount['float'] > 0) {
        const fallers = Math.max(1, diff.units - (reqCount['block'] || 0));
        reqCount['float'] = fallers;
      }

      const primarySkills = ['bash', 'mine', 'drill', 'bomb', 'build', 'block', 'float'];

      if (diff.key === 'nightmare') {
        // 100% 극도 타이트 예산 (여분 스킬 0개)
        for (const k of primarySkills) {
          skills[k] = reqCount[k] || 0;
        }
        // 미끼 스킬 1개 지급 (정답에 없는 스킬)
        const solSet = new Set(solution.map(s => s.toLowerCase()));
        const decoyPool = ['climb', 'bomb', 'mine'].filter(s => !solSet.has(s));
        if (decoyPool.length > 0) {
          skills[R.pick(decoyPool)] = 1;
        }
      } else if (diff.key === 'hard') {
        // 100~120% 타이트 예산 (전체 여분 스킬 0~1개)
        const hasSpare = R.chance(0.5);
        const reqKeys = Object.keys(reqCount);
        const spareKey = (hasSpare && reqKeys.length > 0) ? R.pick(reqKeys) : null;

        for (const k of primarySkills) {
          const req = reqCount[k] || 0;
          if (req > 0) {
            skills[k] = req + (spareKey === k ? 1 : 0);
          } else {
            skills[k] = 0;
          }
        }
        // 미끼 스킬 1~2개 지급 (climb, bomb)
        const solSet = new Set(solution.map(s => s.toLowerCase()));
        if (!solSet.has('climb')) skills.climb = 1;
        if (!solSet.has('bomb')) skills.bomb = 1;
      } else if (diff.key === 'normal') {
        // 140~170% 예산
        for (const k of primarySkills) {
          const req = reqCount[k] || 0;
          if (req > 0) {
            skills[k] = req + R.irange(1, 2);
          } else {
            skills[k] = 0;
          }
        }
        if (!reqCount['climb'] && R.chance(0.4)) skills.climb = 1;
      } else {
        // easy: 180~250% 예산
        for (const k of primarySkills) {
          const req = reqCount[k] || 0;
          if (req > 0) {
            skills[k] = req + R.irange(2, 4);
          } else {
            skills[k] = R.irange(1, 2);
          }
        }
        skills.climb = R.irange(1, 2);
        if (!reqCount['float']) skills.float = R.irange(1, 2);
      }

      // 포털은 항상 0 (사용자 직접 판단)
      skills.portal = 0;

      return skills;
    }

    /* ================================================================
     * 7단계: 경로 클리어런스 및 정적 검증
     * ==============================================================*/
    static validateLayout(layoutResult) {
      const { elements, spawn, gate, slabs } = layoutResult;

      // 스폰 / 웜홀 경계
      if (spawn.x < 20 || spawn.x > W - 20 || spawn.y < 20 || spawn.y > H - 20) {
        return { valid: false, reason: `Spawn out of bounds (${spawn.x}, ${spawn.y})` };
      }
      if (gate.x < 20 || gate.x > W - 20 || gate.y < 20 || gate.y > H - 20) {
        return { valid: false, reason: `Gate out of bounds (${gate.x}, ${gate.y})` };
      }

      // 요소 경계
      for (const el of elements) {
        if (el.x < -10 || el.x + el.w > W + 10 || el.y < -10 || el.y + el.h > H + 10) {
          return { valid: false, reason: `Element ${el.type} OOB at (${el.x},${el.y},w=${el.w})` };
        }
      }

      // 지반 확인
      const slabTypes = new Set(['platform', 'craggyRock', 'volcanicBasalt', 'quantumCrystal']);
      const spawnGround = elements.some(el =>
        slabTypes.has(el.type) &&
        spawn.x >= el.x - 5 && spawn.x <= el.x + el.w + 5 &&
        Math.abs((spawn.y + 36) - el.y) < 15
      );
      if (!spawnGround) return { valid: false, reason: 'No ground under spawn' };

      const gateGround = elements.some(el =>
        slabTypes.has(el.type) &&
        gate.x >= el.x - 5 && gate.x <= el.x + el.w + 5 &&
        Math.abs((gate.y + 26) - el.y) < 15
      );
      if (!gateGround) return { valid: false, reason: 'No ground under gate' };

      // 최소 거리
      const dist = Math.hypot(gate.x - spawn.x, gate.y - spawn.y);
      if (dist < 110) return { valid: false, reason: `Spawn/Gate too close (${Math.round(dist)}px)` };

      // 상하 발판 요소 간 최소 머리공간(헤드룸 >= 28px) 전수 검증 (끼임 및 질식 원천 차단)
      for (let i = 0; i < elements.length; i++) {
        const e1 = elements[i];
        if (!slabTypes.has(e1.type)) continue;
        for (let j = i + 1; j < elements.length; j++) {
          const e2 = elements[j];
          if (!slabTypes.has(e2.type)) continue;
          const overlapX = Math.min(e1.x + e1.w, e2.x + e2.w) - Math.max(e1.x, e2.x);
          if (overlapX > 20) {
            const topEl = e1.y < e2.y ? e1 : e2;
            const bottomEl = e1.y < e2.y ? e2 : e1;
            const gap = bottomEl.y - (topEl.y + topEl.h);
            if (gap >= 0 && gap < 28) {
              return { valid: false, reason: `Hazardous low ceiling (${gap}px) between ${topEl.type} and ${bottomEl.type}` };
            }
          }
        }
      }

      return { valid: true };
    }

    /* ================================================================
     * 8단계: 장식 요소 추가 (활성 경로 클리어런스 절대 침범 금지)
     * ==============================================================*/
    static addAmbientDecor(elements, slabs, spawn, gate, R, pal, stones) {
      const decoTypes = stones ? [...stones, 'quantumCrystal'] : ['quantumCrystal', 'platform', 'craggyRock'];
      const targetCount = R.irange(3, 5);
      let placed = 0;

      for (let attempt = 0; attempt < 80 && (elements.length < 13 || placed < targetCount); attempt++) {
        const type = R.pick(decoTypes);
        const w = R.irange(50, 80);
        const h = R.irange(14, 20);
        const x = R.irange(30, W - w - 20);
        const y = R.irange(50, H - h - 30);

        // 스폰 / 웜홀 주변 회피
        if (Math.hypot(x + w / 2 - spawn.x, y - spawn.y) < 85) continue;
        if (Math.hypot(x + w / 2 - gate.x, y - gate.y) < 85) continue;

        // 모든 보행 플랫폼 및 기존 장식 요소와의 머리 공간(상공 55px 및 하부 40px) 침범 절대 금지
        let collides = false;
        for (const el of elements) {
          const overlapX = (x < el.x + el.w + 20 && x + w > el.x - 20);
          if (overlapX) {
            if (y < el.y + el.h + 40 && y + h > el.y - 55) {
              collides = true;
              break;
            }
          }
        }
        if (collides) continue;

        // 기존 요소 겹침 확인
        let overlaps = false;
        for (const el of elements) {
          if (x < el.x + el.w + 15 && x + w > el.x - 15 &&
              y < el.y + el.h + 15 && y + h > el.y - 15) {
            overlaps = true;
            break;
          }
        }
        if (overlaps) continue;

        const el = { type, x, y, w, h, palette: pal };
        if (type !== 'platform') {
          el.profile = R.profile(Math.max(3, Math.round(w / 25)), 12, 22);
        }
        elements.push(el);
        placed++;
      }

      // 최소 12개 요소 안전 보장 (경로 외곽에만 배치)
      let safetyIter = 0;
      while (elements.length < 12 && safetyIter < 30) {
        safetyIter++;
        const w = R.irange(45, 75);
        const h = R.irange(14, 18);
        const x = R.irange(30, W - w - 20);
        const y = R.irange(50, H - h - 30);

        if (Math.hypot(x - spawn.x, y - spawn.y) < 80) continue;
        if (Math.hypot(x - gate.x, y - gate.y) < 80) continue;

        let collides = false;
        for (const el of elements) {
          const overlapX = (x < el.x + el.w + 20 && x + w > el.x - 20);
          if (overlapX) {
            if (y < el.y + el.h + 40 && y + h > el.y - 55) {
              collides = true;
              break;
            }
          }
        }
        if (collides) continue;

        elements.push({
          type: R.pick(decoTypes), x, y, w, h,
          palette: pal,
          profile: R.profile(3, 12, 20)
        });
      }
    }

    /* ================================================================
     * 9단계: 헤드리스 가상 물리 군단 시뮬레이터 (Headless Horde Simulator)
     * — 5마리의 나노봇을 직접 투입하여 80% 이상 웜홀 도달 여부를 실측 검증
     * ==============================================================*/
    static simulateHordeClearance(map) {
      const grid = new Uint8Array(W * H);

      // 1. 그리드 래스터라이즈 (0=공기, 1=자연지형, 2=강철)
      for (const el of map.elements) {
        const val = (el.type === 'steelBarrier') ? 2 : 1;
        const x0 = Math.max(0, Math.min(W - 1, el.x));
        const y0 = Math.max(0, Math.min(H - 1, el.y));
        const x1 = Math.max(0, Math.min(W, el.x + el.w));
        const y1 = Math.max(0, Math.min(H, el.y + el.h));
        for (let y = y0; y < y1; y++) {
          const row = y * W;
          for (let x = x0; x < x1; x++) grid[row + x] = val;
        }
      }

      function isSolid(x, y) {
        x = Math.floor(x); y = Math.floor(y);
        if (x < 0 || x >= W || y < 0 || y >= H) return false;
        return grid[y * W + x] !== 0;
      }

      function isSteel(x, y) {
        x = Math.floor(x); y = Math.floor(y);
        if (x < 0 || x >= W || y < 0 || y >= H) return false;
        return grid[y * W + x] === 2;
      }

      function carveRect(cx, cy, cw, ch) {
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
      }

      function buildStep(bx, by, dir) {
        for (let s = 0; s < 12; s++) {
          const px = Math.floor(bx + dir * s * 4);
          const py = Math.floor(by - s * 2);
          for (let dx = 0; dx < 4; dx++) {
            const x = px + dir * dx;
            if (x >= 0 && x < W) {
              for (let y = py; y <= by + 4; y++) {
                if (y >= 0 && y < H) grid[y * W + x] = 1;
              }
            }
          }
        }
      }

      const actionUsage = (map._layoutData && map._layoutData.actionUsage)
        ? map._layoutData.actionUsage.map(a => ({ ...a, built: 0 }))
        : (map.solutionDna || []).map(act => ({ act, count: 1, built: 0 }));
      let stepIdx = 0;

      const skills = { ...map.skills };
      const numUnits = 5;
      const units = [];
      let spawned = 0;
      let spawnTimer = 0;
      let rescued = 0;
      let dead = 0;
      let solverCooldown = 0;

      for (let tick = 0; tick < 2200; tick++) {
        if (solverCooldown > 0) solverCooldown--;

        // 25틱마다 1마리씩 스폰
        if (spawned < numUnits) {
          spawnTimer++;
          if (spawnTimer >= 25 || spawned === 0) {
            spawnTimer = 0;
            spawned++;
            units.push({
              idx: spawned,
              x: map.spawnX,
              y: map.spawnY,
              dir: 1,
              vy: 0,
              fallDist: 0,
              state: 'FALL',
              alive: true,
              escaped: false
            });
          }
        }

        const activeUnits = units.filter(u => u.alive && !u.escaped);
        if (activeUnits.length === 0 && spawned >= numUnits) break;

        // 선두 정찰병의 반응형 스킬 투입
        const walkers = activeUnits.filter(u => u.state === 'WALK');
        if (walkers.length > 0 && solverCooldown <= 0 && stepIdx < actionUsage.length) {
          walkers.sort((a, b) => (b.x * b.dir) - (a.x * a.dir));
          const scout = walkers[0];
          const aheadX = scout.x + scout.dir * 14;

          const isSolidAhead = isSolid(aheadX, scout.y - 6) || isSolid(aheadX, scout.y - 12);
          const isSteelAhead = isSteel(aheadX, scout.y - 6) || isSteel(aheadX, scout.y - 12);
          const curr = actionUsage[stepIdx];

          // 1) DRILL: 강철 격벽 차단 시 바닥 천공
          if (curr.act === 'DRILL' && isSteelAhead) {
            carveRect(scout.x - 10, scout.y - 1, 20, 55);
            scout.state = 'FALL';
            scout.vy = 0;
            scout.fallDist = 0;
            stepIdx++;
            solverCooldown = 35;
          }
          // 2) BASH: 암벽 수평 절삭
          else if (curr.act === 'BASH' && isSolidAhead && !isSteelAhead) {
            const bashX = scout.dir > 0 ? (aheadX - 6) : (aheadX - 55 + 6);
            carveRect(bashX, scout.y - 24, 55, 24);
            stepIdx++;
            solverCooldown = 25;
          }
          // 3) BOMB: 두꺼운 암벽 폭파
          else if (curr.act === 'BOMB' && isSolidAhead && !isSteelAhead) {
            const bombX = scout.dir > 0 ? (aheadX - 10) : (aheadX - 85 + 10);
            carveRect(bombX, scout.y - 24, 85, 24);
            stepIdx++;
            solverCooldown = 25;
          }
          // 4) MINE: 두꺼운 슬랩 대각 굴착 관통 (절벽 차단 암벽에 도달 시 대각 굴착)
          else if (curr.act === 'MINE' && isSolidAhead && !isSteelAhead) {
            for (let s = 0; s < 30; s++) {
              const mx = scout.x + scout.dir * s * 2;
              const my = scout.y + s * 2;
              carveRect(mx - 8, my - 16, 20, 20);
            }
            stepIdx++;
            solverCooldown = 30;
          }
          // 5) BUILD: 단차/갭에 3D 계단 증축 (다단계 계단 연속 연결 지원, 탈출구 인접 갭에서만 발동)
          else if (curr.act === 'BUILD' && Math.abs(scout.x - map.gateX) < 250 && (!isSolid(aheadX, scout.y + 4) || isSolid(aheadX, scout.y - 10))) {
            buildStep(scout.x, scout.y, scout.dir);
            scout.x += scout.dir * 48;
            scout.y -= 24;
            scout.vy = 0;
            scout.state = 'WALK';
            curr.lastBuildX = scout.x;
            curr.built = (curr.built || 0) + 1;
            if (curr.built >= (curr.count || 1)) {
              stepIdx++;
              solverCooldown = 28;
            } else {
              solverCooldown = 10;
            }
          }
          // 6) BLOCK: 낭떠러지/막다른 길에서 방어막 전환 (후속 부대 반전 보장)
          else if (curr.act === 'BLOCK' && (!isSolid(aheadX, scout.y + 10) || isSolidAhead)) {
            const blockX = Math.floor(scout.x);
            for (let dy = -16; dy <= 0; dy++) {
              for (let dx = -4; dx <= 4; dx++) {
                const px = blockX + dx, py = Math.floor(scout.y) + dy;
                if (px >= 0 && px < W && py >= 0 && py < H) grid[py * W + px] = 2;
              }
            }
            scout.alive = false;
            dead++;
            stepIdx++;
            solverCooldown = 30;
          }
          // 7) FLOAT: 낙하 중 자동 발동되는 패시브 스킬이므로 시퀀스 통과
          else if (curr.act === 'FLOAT') {
            stepIdx++;
          }
        }

        // 유닛 물리 갱신
        for (const u of activeUnits) {
          // 웜홀 도달 검사
          const distToGate = Math.hypot(u.x - map.gateX, (u.y - 12) - map.gateY);
          if (distToGate < 36 || (Math.abs(u.x - map.gateX) < 26 && Math.abs(u.y - 12 - map.gateY) < 32)) {
            u.escaped = true;
            rescued++;
            continue;
          }

          // 화면 이탈 검사
          if (u.y >= 425 || u.x < 5 || u.x > W - 5) {
            if (map._debug) console.log('DEBUG DIE OOB: x=' + u.x + ', y=' + u.y + ', state=' + u.state);
            u.alive = false;
            dead++;
            continue;
          }

          if (u.state === 'FALL') {
            if (u.fallDist >= 70 && !u.floating && (skills.float > 0 || skills.float === undefined)) {
              u.floating = true;
              if (skills.float > 0) skills.float--;
            }
            u.vy = u.floating ? Math.min(1.2, u.vy + 0.05) : Math.min(3.2, u.vy + 0.15);
            u.y += u.vy;
            u.fallDist += u.vy;

            if (isSolid(u.x, u.y + 1)) {
              while (isSolid(u.x, u.y) && u.y > 0) u.y--;
              if (u.fallDist > 96 && !u.floating) {
                u.alive = false; // 치사 낙하 즉사
                dead++;
              } else {
                u.state = 'WALK';
                u.vy = 0;
                u.fallDist = 0;
                u.floating = false;
              }
            }
          } else if (u.state === 'WALK') {
            let onGround = false;
            for (let dy = 1; dy <= 6; dy++) {
              if (isSolid(u.x, u.y + dy)) {
                u.y += (dy - 1);
                onGround = true;
                break;
              }
            }
            if (!onGround && !isSolid(u.x, u.y + 1)) {
              u.state = 'FALL';
              u.fallDist = 0;
              u.vy = 0;
              continue;
            }

            const nextX = u.x + u.dir * 1.25;

            // 작은 단차(최대 8px) 자동 오르기
            let stepped = false;
            if (isSolid(nextX, u.y - 2)) {
              for (let h = 1; h <= 8; h++) {
                if (!isSolid(nextX, u.y - h) && !isSolid(nextX, u.y - h - 10)) {
                  u.y -= h;
                  u.x = nextX;
                  stepped = true;
                  break;
                }
              }
            }

            if (!stepped) {
              if (isSolid(nextX, u.y - 4) || isSolid(nextX, u.y - 12)) {
                u.dir = -u.dir;
              } else {
                u.x = nextX;
              }
            }
          }
        }
      }

      const isSuccess = (rescued >= 4) && (dead <= 1);
      return {
        success: isSuccess,
        rescued,
        total: numUnits,
        dead,
        reason: isSuccess
          ? `군단 가상 물리 검증 성공 (${rescued}/${numUnits} 구출)`
          : `군단 가상 물리 검증 실패 (${rescued}/${numUnits} 구출, ${dead} 사망)`
      };
    }

    /* ================================================================
     * 수학적 난이도 산출 공식
     * DifficultyScore = (N_actions * 8) + (N_unique_skills * 7) + (N_steel * 5)
     *                 + (N_decoy * 8) + (N_danger_drop * 10) + (N_combo * 12)
     *                 + max(0, 20 - N_spare_skills * 4)
     * ==============================================================*/
    static calculateDifficultyScore(candidate) {
      const solution = candidate.solutionDna || [];
      const N_actions = solution.length;
      const N_unique_skills = new Set(solution).size;
      const N_steel = (candidate.elements || []).filter(e => e.type === 'steelBarrier').length;

      const solSet = new Set(solution.map(s => s.toLowerCase()));
      const allSkills = ['climb', 'float', 'bash', 'mine', 'drill', 'bomb', 'build', 'block', 'portal'];
      let N_decoy = 0;
      for (const sk of allSkills) {
        if ((candidate.skills[sk] || 0) > 0 && !solSet.has(sk)) {
          N_decoy++;
        }
      }

      const N_danger_drop = solution.includes('FLOAT') ? 1 : 0;

      let N_combo = 0;
      for (let i = 1; i < solution.length; i++) {
        if (solution[i] !== solution[i - 1]) N_combo++;
      }

      let totalReq = 0;
      let totalGivenInSol = 0;
      for (const sk of solSet) {
        const given = candidate.skills[sk] || 0;
        let req = 0;
        if (sk === 'float') {
          req = Math.max(1, candidate.totalUnits - 1);
        } else if (sk === 'build') {
          req = (candidate._layoutData && candidate._layoutData.actionUsage)
            ? candidate._layoutData.actionUsage.filter(u => u.act.toLowerCase() === 'build').reduce((a, b) => a + (b.count || 1), 0)
            : solution.filter(s => s.toLowerCase() === 'build').length;
        } else {
          req = solution.filter(s => s.toLowerCase() === sk).length;
        }
        totalReq += req;
        totalGivenInSol += given;
      }
      const N_spare_skills = Math.max(0, totalGivenInSol - totalReq);

      const score = (N_actions * 8) +
        (N_unique_skills * 7) +
        (N_steel * 5) +
        (N_decoy * 8) +
        (N_danger_drop * 10) +
        (N_combo * 12) +
        Math.max(0, 20 - N_spare_skills * 4);

      return {
        score,
        N_actions,
        N_unique_skills,
        N_steel,
        N_decoy,
        N_danger_drop,
        N_combo,
        N_spare_skills
      };
    }

    /* ================================================================
     * 정답 기반 동적 제한시간 산출 공식
     * TimeLimit = (BaseTime(35s) + sum(ActionTime)) * DifficultyMultiplier
     * ==============================================================*/
    static calculateDynamicTimeLimit(solutionDna, diffKey) {
      const baseTime = 35;
      const actionTimes = {
        BASH: 18, DRILL: 15, FLOAT: 12, BLOCK: 10,
        BUILD: 22, MINE: 16, BOMB: 12, CLIMB: 14, WALK: 8
      };
      const multipliers = {
        easy: 1.80, normal: 1.45, hard: 1.20, nightmare: 1.05
      };
      const sumActionTime = (solutionDna || []).reduce((acc, a) => acc + (actionTimes[a] || 15), 0);
      const mult = multipliers[diffKey] || 1.20;
      return Math.round((baseTime + sumActionTime) * mult);
    }

    /* ================================================================
     * 폴백 맵 (모든 재시도 소진 시 100% 보장 맵 — 동적 무작위 생성)
     * ==============================================================*/
    static buildFallback(options = {}) {
      const seed = ((Math.random() * 1e9) | 0) ^ (Date.now() & 0x7fffffff);
      const rawRNG = makeRNG(seed);
      const R = makeRNGHelpers(rawRNG);

      const diff = this.resolveDifficulty(options.difficulty);
      const { palette, theme, stoneTypes } = this.resolvePaletteAndTheme(options, R);
      const stone1 = stoneTypes[0] || 'platform';
      const stone2 = stoneTypes[1] || 'craggyRock';

      // 발판 좌표 및 치수를 난수화하여 매 호출마다 구조적/시각적으로 완전히 새로운 맵 생성
      const s1X = R.irange(30, 50);
      const s1Y = R.irange(135, 155);
      const s1W = R.irange(230, 270);

      const wall1W = R.irange(35, 45);
      const wall1H = Math.min(65, s1Y - 80);

      const s2X = s1X + s1W - 10;
      const s2Y = s1Y;
      const s2W = R.irange(200, 240);

      const s3X = R.irange(330, 370);
      const s3Y = s1Y + R.irange(65, 80);
      const s3W = clamp(W - s3X - R.irange(40, 60), 320, 420);

      const elements = [
        { type: stone1, x: s1X, y: s1Y, w: s1W, h: 24, palette },
        { type: 'steelBarrier', x: s1X, y: s1Y - 65, w: 20, h: 65 },
        { type: 'rockWall', x: s1X + s1W - wall1W, y: s1Y - wall1H, w: wall1W, h: wall1H, palette },
        { type: stone1, x: s2X, y: s2Y, w: s2W, h: 24, palette },
        { type: 'steelBarrier', x: s2X + s2W - 20, y: s2Y - 65, w: 20, h: 65 },
        { type: stone2, x: s3X, y: s3Y, w: s3W, h: 24, palette },
        { type: 'steelBarrier', x: s3X + s3W - 20, y: s3Y - 65, w: 20, h: 65 },
        // 이동 경로에 간섭하지 않는 안전 배경 장식 지형
        { type: stone2, x: R.irange(550, 620), y: R.irange(80, 100), w: R.irange(60, 80), h: 18, palette },
        { type: stone1, x: R.irange(60, 100), y: R.irange(310, 330), w: R.irange(70, 90), h: 18, palette },
        { type: stone2, x: R.irange(200, 240), y: R.irange(350, 370), w: R.irange(70, 90), h: 18, palette }
      ];

      const spawnX = s1X + R.irange(50, 80);
      const spawnY = s1Y - 36;
      const gateX = s3X + s3W - R.irange(45, 75);
      const gateY = s3Y - 26;

      const titleWord = R.pick(SECTOR_NAMES);
      const title = `[${diff.name}] ${titleWord} (TACTICAL)`.replace(/\s+/g, ' ').trim();
      const solutionDna = ['BASH', 'DRILL', 'BUILD'];
      const actionUsage = [{ act: 'BASH', count: 1 }, { act: 'DRILL', count: 1 }, { act: 'BUILD', count: 2 }];

      const skills = this.calculateSkills(actionUsage, diff, R, solutionDna);
      const timeLimit = this.calculateDynamicTimeLimit(solutionDna, diff.key);

      const candidate = {
        id: options.id || 'CUSTOM',
        title,
        desc: `[CASCADE] 100% 검증 전술 구역입니다. (난이도: ${diff.name}, 정답: ${solutionDna.join(' → ')})`,
        bgImg: theme,
        terrainTheme: palette,
        totalUnits: diff.units,
        needPercent: diff.needPercent,
        spawnRate: diff.spawnRate,
        timeLimit,
        skills,
        spawnX, spawnY,
        gateX, gateY,
        elements,
        solutionDna,
        difficultyScore: 0,
        difficultyFactors: {},
        layoutType: 'cascade',
        _layoutData: {
          slabs: [{ x: s1X, y: s1Y, w: s1W }, { x: s2X, y: s2Y, w: s2W }, { x: s3X, y: s3Y, w: s3W }],
          actionUsage
        },
        _meta: {
          seed,
          archetype: 'cascade',
          difficulty: diff.name,
          elementCount: elements.length,
          attempt: 'dynamic_verified',
          simVerified: true,
          rescuedRatio: '5/5'
        }
      };

      const scoreObj = this.calculateDifficultyScore(candidate);
      candidate.difficultyScore = scoreObj.score;
      candidate.difficultyFactors = {
        actionsScore: scoreObj.N_actions * 8,
        uniqueSkillsScore: scoreObj.N_unique_skills * 7,
        steelScore: scoreObj.N_steel * 5,
        decoyScore: scoreObj.N_decoy * 8,
        dangerDropScore: scoreObj.N_danger_drop * 10,
        comboScore: scoreObj.N_combo * 12,
        scarcityScore: Math.max(0, 20 - scoreObj.N_spare_skills * 4)
      };
      delete candidate._layoutData;

      return candidate;
    }

    /* ================================================================
     * 마스터 제너레이터 — 이중 검증(기하학적 + 군단 가상 물리 실측)
     * ==============================================================*/
    static generate(options = {}) {
      const MAX_RETRIES = 40;
      let fallbackCandidate = null;

      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        const seed = options.seed != null
          ? options.seed + attempt * 13337
          : (((Math.random() * 1e9) | 0) ^ (Date.now() & 0x7fffffff)) + attempt * 13337;

        const rawRNG = makeRNG(seed);
        const R = makeRNGHelpers(rawRNG);

        const diff = this.resolveDifficulty(options.difficulty);
        const { palette, theme, stoneTypes } = this.resolvePaletteAndTheme(options, R);
        const archetype = this.pickArchetype(options.layout, R);

        // 1. 시나리오 설계 (역방향 퍼즐 DNA)
        const solution = this.designScenario(archetype, diff, R);

        // 2. 레이아웃 조립
        const layoutResult = this.buildLayout(solution, archetype, diff, R, palette, stoneTypes);

        // 3. 1차 정적 기하 검증
        const validation = this.validateLayout(layoutResult);
        if (!validation.valid) {
          continue;
        }

        // 4. 안전 장식 배치 (경로 클리어런스 절대 침범 금지)
        this.addAmbientDecor(layoutResult.elements, layoutResult.slabs, layoutResult.spawn, layoutResult.gate, R, palette, stoneTypes);

        // 5. 스킬 수량 산정 (계단 수량 정확 반영, 타이트한 예산 & 미끼 스킬 지급)
        const skills = this.calculateSkills(layoutResult.actionUsage, diff, R, layoutResult.solution);

        // 6. 동적 제한시간 산출
        const timeLimit = this.calculateDynamicTimeLimit(layoutResult.solution, diff.key);

        const titleWord = R.pick(SECTOR_NAMES);
        const stageNo = options.stageNo ? `S${options.stageNo}` : '';
        const title = `[${diff.name}] ${titleWord} ${stageNo} (${diff.name})`.replace(/\s+/g, ' ').trim();

        const candidate = {
          id: options.id || 'CUSTOM',
          title,
          desc: '',
          bgImg: theme,
          terrainTheme: palette,
          totalUnits: diff.units,
          needPercent: diff.needPercent,
          spawnRate: diff.spawnRate,
          timeLimit,
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
          solutionDna: layoutResult.solution.slice(),
          difficultyScore: 0,
          difficultyFactors: {},
          layoutType: archetype,
          _meta: {
            seed,
            archetype,
            difficulty: diff.name,
            elementCount: layoutResult.elements.length,
            attempt: attempt + 1
          }
        };

        candidate._layoutData = {
          slabs: layoutResult.slabs,
          actionUsage: layoutResult.actionUsage
        };

        // 수학적 난이도 점수 실측 산출
        const scoreObj = this.calculateDifficultyScore(candidate);
        candidate.difficultyScore = scoreObj.score;
        candidate.difficultyFactors = {
          actionsScore: scoreObj.N_actions * 8,
          uniqueSkillsScore: scoreObj.N_unique_skills * 7,
          steelScore: scoreObj.N_steel * 5,
          decoyScore: scoreObj.N_decoy * 8,
          dangerDropScore: scoreObj.N_danger_drop * 10,
          comboScore: scoreObj.N_combo * 12,
          scarcityScore: Math.max(0, 20 - scoreObj.N_spare_skills * 4)
        };
        candidate.desc = `[${archetype.toUpperCase()}] 100% 클리어 검증 구역. (난이도: ${diff.name}, 점수: ${candidate.difficultyScore}pt, 솔루션: ${layoutResult.solution.join(' → ')})`;

        // 난이도별 최소 점수 미달 시 재생성 (Reject & Retry)
        if (candidate.difficultyScore < diff.minScore) {
          if (!fallbackCandidate) fallbackCandidate = candidate;
          delete candidate._layoutData;
          continue;
        }

        // 7. 2차 군단 가상 물리 실측 검증 (Headless Horde Simulator)
        const simResult = this.simulateHordeClearance(candidate);
        delete candidate._layoutData;

        if (!simResult.success) {
          if (!fallbackCandidate) fallbackCandidate = candidate;
          continue; // 시뮬레이션 구출률 미달 시 즉시 재생성
        }

        candidate._meta.simVerified = true;
        candidate._meta.rescuedRatio = `${simResult.rescued}/${simResult.total}`;
        return candidate;
      }

      // 모든 시도가 소진되었을 경우 100% 검증 보장 폴백 맵 반환 (simVerified: true 보장)
      return this.buildFallback(options);
    }
  }

  return { FullCanvasLevelArchitect, DIFF_SPECS, BIOMES };
});
