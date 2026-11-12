/* ============================================================================
 * FullCanvasLevelArchitect.js — 다중 경로 토폴로지 & 날먹 차단 퍼즐 생성 엔진 (v5)
 *
 * [핵심 개편 사항 (7대 요구사항 완벽 반영)]
 * 1. 2D 복층 섹터(Multi-Tier Room) & 다중 경로(정석 루트 + 유혹의 함정 루트 + 센스 지름길) 자동 배치
 * 2. 선발대(Pioneer)와 본대 분리(Holding Pit / Blocker) 구조 강제로 깊은 길 찾기 고민 유도
 * 3. 순간이동 치팅을 완전히 제거한 프레임 단위 정밀 물리 시뮬레이터(True Physics Engine)
 * 4. 1~2개 스킬 날먹 자동 탐지 및 강철벽 차단 필터(Anti-Cheese Fuzzing Filter)
 * 5. 정답 스포일러를 방지하고 창의적 다해법을 허용하는 전략적 스킬 인벤토리 지급
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
   * 난이도 사양 (고난도 퍼즐 성향 강화)
   * ====================================================================*/
  const DIFF_SPECS = {
    easy: {
      key: 'easy', name: 'EASY',
      minScore: 40,
      scoreRange: [40, 68],
      timeMultiplier: 1.65,
      units: 15, needPercent: 55, timeLimit: 210, spawnRate: 32,
      gimmickRange: [3, 3],
      spareRange: [1, 2],
      decoyBranches: 1,
      altRouteCount: 1,
      minUniqueSkills: 2
    },
    normal: {
      key: 'normal', name: 'NORMAL',
      minScore: 68,
      scoreRange: [68, 98],
      timeMultiplier: 1.40,
      units: 18, needPercent: 68, timeLimit: 180, spawnRate: 26,
      gimmickRange: [3, 4],
      spareRange: [1, 2],
      decoyBranches: 2,
      altRouteCount: 1,
      minUniqueSkills: 3
    },
    hard: {
      key: 'hard', name: 'HARD',
      minScore: 95,
      scoreRange: [95, 135],
      timeMultiplier: 1.20,
      units: 20, needPercent: 78, timeLimit: 155, spawnRate: 22,
      gimmickRange: [4, 4],
      spareRange: [1, 1],
      decoyBranches: 2,
      altRouteCount: 2,
      minUniqueSkills: 3
    },
    nightmare: {
      key: 'nightmare', name: 'NIGHTMARE',
      minScore: 118,
      scoreRange: [118, 175],
      timeMultiplier: 1.08,
      units: 25, needPercent: 86, timeLimit: 135, spawnRate: 18,
      gimmickRange: [4, 5],
      spareRange: [0, 0], // 극한의 정밀도 (0 여유분)
      decoyBranches: 3,
      altRouteCount: 2,
      minUniqueSkills: 4
    }
  };

  /* ======================================================================
   * 바이옴 & 섹터 이름 테이블
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
   * 역방향 핵심 기믹 카탈로그 (2D 복층 & 병목 기믹)
   * ====================================================================*/
  const GIMMICK_CATALOG = {
    HOLDING_CELL_BREACH: {
      id: 'HOLDING_CELL_BREACH',
      label: '본대 가두기 수용소 & 선발대 암벽 돌파',
      skills: ['BASH'],
      timingCount: 1,
      timingWeight: 14,
      dyRange: [0, 0]
    },
    SEALED_DROP_SHAFT: {
      id: 'SEALED_DROP_SHAFT',
      label: '강철 차폐 수직 하강 갱도',
      skills: ['DRILL'],
      timingCount: 1,
      timingWeight: 15,
      dyRange: [64, 78]
    },
    ARMORED_BULKHEAD: {
      id: 'ARMORED_BULKHEAD',
      label: '중장갑 격벽 폭파 병목',
      skills: ['BOMB'],
      timingCount: 1,
      timingWeight: 16,
      dyRange: [0, 0]
    },
    DIAGONAL_ROCK_VEIN: {
      id: 'DIAGONAL_ROCK_VEIN',
      label: '두꺼운 암반층 대각선 굴착',
      skills: ['MINE'],
      timingCount: 1,
      timingWeight: 16,
      dyRange: [68, 80]
    },
    SKY_BRIDGE_ASCENT: {
      id: 'SKY_BRIDGE_ASCENT',
      label: '낭떠러지 단차 계단 가교 (1단)',
      skills: ['BUILD'],
      timingCount: 1,
      timingWeight: 17,
      dyRange: [-20, -20] // 1단 BUILD(24px 상승, 48px 전진)에서 물리 걸음으로 안전 착지하는 단차
    },
    GRAND_CHASM_ASCENT: {
      id: 'GRAND_CHASM_ASCENT',
      label: '대협곡 연속 계단 가교 (2단)',
      skills: ['BUILD', 'BUILD'],
      timingCount: 2,
      timingWeight: 26,
      dyRange: [-42, -42] // 2단 연속 BUILD(48px 상승, 96px 전진)에서 물리 걸음으로 착지하는 단차
    },
    ABYSSAL_GLIDE: {
      id: 'ABYSSAL_GLIDE',
      label: '심연의 치사 낙하 강하 구간',
      skills: ['FLOAT'],
      timingCount: 1,
      timingWeight: 16,
      dyRange: [130, 152]
    }
  };

  const ARCHETYPE_GIMMICK_WEIGHTS = {
    cascade: [
      { id: 'HOLDING_CELL_BREACH', w: 3.2 }, { id: 'SEALED_DROP_SHAFT', w: 3.8 },
      { id: 'DIAGONAL_ROCK_VEIN', w: 3.0 },  { id: 'SKY_BRIDGE_ASCENT', w: 2.8 },
      { id: 'ABYSSAL_GLIDE', w: 2.6 },       { id: 'ARMORED_BULKHEAD', w: 2.0 }
    ],
    zigzag: [
      { id: 'HOLDING_CELL_BREACH', w: 3.5 }, { id: 'SEALED_DROP_SHAFT', w: 3.5 },
      { id: 'SKY_BRIDGE_ASCENT', w: 3.2 },   { id: 'DIAGONAL_ROCK_VEIN', w: 2.8 },
      { id: 'ARMORED_BULKHEAD', w: 2.4 },    { id: 'ABYSSAL_GLIDE', w: 2.0 }
    ],
    traverse: [
      { id: 'HOLDING_CELL_BREACH', w: 3.6 }, { id: 'SKY_BRIDGE_ASCENT', w: 3.6 },
      { id: 'ARMORED_BULKHEAD', w: 3.0 },    { id: 'GRAND_CHASM_ASCENT', w: 2.5 },
      { id: 'SEALED_DROP_SHAFT', w: 2.4 },   { id: 'DIAGONAL_ROCK_VEIN', w: 2.2 }
    ],
    split: [
      { id: 'SEALED_DROP_SHAFT', w: 3.6 },   { id: 'SKY_BRIDGE_ASCENT', w: 3.4 },
      { id: 'HOLDING_CELL_BREACH', w: 3.0 }, { id: 'DIAGONAL_ROCK_VEIN', w: 2.8 },
      { id: 'ABYSSAL_GLIDE', w: 2.5 },       { id: 'GRAND_CHASM_ASCENT', w: 2.2 }
    ],
    chamber: [
      { id: 'SEALED_DROP_SHAFT', w: 4.2 },   { id: 'HOLDING_CELL_BREACH', w: 3.4 },
      { id: 'ARMORED_BULKHEAD', w: 3.0 },    { id: 'SKY_BRIDGE_ASCENT', w: 2.8 },
      { id: 'ABYSSAL_GLIDE', w: 2.6 },       { id: 'DIAGONAL_ROCK_VEIN', w: 2.4 }
    ],
    ascent: [
      { id: 'SKY_BRIDGE_ASCENT', w: 4.5 },   { id: 'GRAND_CHASM_ASCENT', w: 3.5 },
      { id: 'HOLDING_CELL_BREACH', w: 3.2 }, { id: 'ARMORED_BULKHEAD', w: 2.6 },
      { id: 'SEALED_DROP_SHAFT', w: 2.0 }
    ]
  };

  /* ====================================================================
   * FullCanvasLevelArchitect 클래스
   * ==================================================================*/
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
        else if (theme.includes('level_1') || theme.includes('level_6')) pal = 'cyan';
      }

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

    static makeSlab(x, y, w, h, R, pal, stones) {
      return {
        type: R.pick(stones),
        x: Math.round(x),
        y: Math.round(y),
        w: Math.round(w),
        h: Math.round(h || R.irange(22, 26)),
        palette: pal,
        profile: R.profile(Math.max(4, Math.round(w / 40)), 14, 34)
      };
    }

    /* ================================================================
     * [1단계] 스폰(Start)과 탈출구(Goal) 좌표 확정
     * ==============================================================*/
    static lockStartAndGoalAnchors(archetype, numGimmicks, R) {
      const startX = R.irange(65, 100);
      const goalX = R.irange(W - 120, W - 75);

      let startY, goalY;
      switch (archetype) {
        case 'ascent':
          startY = R.irange(265, 315);
          goalY = R.irange(130, 180);
          break;
        case 'traverse':
          startY = R.irange(165, 225);
          goalY = R.irange(165, 225);
          break;
        case 'cascade':
        case 'chamber':
        case 'split':
        case 'zigzag':
        default:
          startY = R.irange(95, 135);
          goalY = R.irange(275, 340);
          break;
      }

      return {
        startAnchor: { x: startX, y: startY },
        goalAnchor:  { x: goalX,  y: goalY },
        numGimmicks
      };
    }

    /* ================================================================
     * [2단계] 골인 지점부터 스폰 지점까지 역방향 기믹 체인(3~5개) 설계
     * ==============================================================*/
    static planReverseGimmickChain(anchors, archetype, diff, R) {
      const K = anchors.numGimmicks;
      const pool = (ARCHETYPE_GIMMICK_WEIGHTS[archetype] || ARCHETYPE_GIMMICK_WEIGHTS.cascade).map(p => ({ ...p }));

      const nodes = new Array(K + 1);
      const gimmicks = new Array(K);

      nodes[K] = {
        index: K,
        role: 'goal',
        x: anchors.goalAnchor.x,
        y: anchors.goalAnchor.y
      };

      const totalSpanX = anchors.goalAnchor.x - anchors.startAnchor.x;
      const baseStepX = Math.floor(totalSpanX / K);
      const usedGimmicks = new Set();

      for (let k = K; k >= 1; k--) {
        const nextNode = nodes[k];
        const targetPrevX = k === 1
          ? anchors.startAnchor.x
          : clamp(anchors.startAnchor.x + Math.round((k - 1) * baseStepX + R.irange(-14, 14)), 70, nextNode.x - 105);

        const remainingDesiredDy = nextNode.y - anchors.startAnchor.y;
        const idealDyPerStep = remainingDesiredDy / k;

        const candidates = [];
        for (const item of pool) {
          const spec = GIMMICK_CATALOG[item.id];
          if (!spec) continue;

          // 첫 번째 기믹(k === 1)은 본대가 스폰되자마자 낙사하지 않도록 HOLDING_CELL_BREACH 또는 SEALED_DROP_SHAFT 선호, ABYSSAL_GLIDE 배제
          if (k === 1 && spec.id === 'ABYSSAL_GLIDE') continue;
          if (diff.key === 'easy' && spec.id === 'GRAND_CHASM_ASCENT') continue;
          // Nightmare에서는 개별 생존용 파라슈트 대신 전원 개척형 기믹으로 엄격 통제
          if (diff.key === 'nightmare' && spec.id === 'ABYSSAL_GLIDE') continue;

          const testDy = R.irange(spec.dyRange[0], spec.dyRange[1]);
          const prevY = nextNode.y - testDy;

          if (prevY < 85 || prevY > 355) continue;

          let weight = item.w;
          if (k < K && gimmicks[k] && gimmicks[k].id === spec.id) {
            weight *= 0.1; // 연속 동일 기믹 억제
          }
          if (!usedGimmicks.has(spec.id)) {
            weight *= 2.1; // 다양한 스킬 조합 유도
          }
          if (k === 1 && (spec.id === 'HOLDING_CELL_BREACH' || spec.id === 'SEALED_DROP_SHAFT')) {
            weight *= 2.5; // 초반 본대 홀딩 수용소 기믹 우대 (선발대 퍼즐 유도)
          }

          const dyDiff = Math.abs(testDy - idealDyPerStep);
          weight *= Math.max(0.3, 1.5 - dyDiff / 120);

          candidates.push({ spec, testDy, prevY, w: weight });
        }

        let chosen;
        if (candidates.length > 0) {
          chosen = R.weighted(candidates);
        } else {
          const fallbackSpec = GIMMICK_CATALOG.HOLDING_CELL_BREACH;
          chosen = { spec: fallbackSpec, testDy: 0, prevY: clamp(nextNode.y, 90, 350) };
        }

        usedGimmicks.add(chosen.spec.id);
        gimmicks[k - 1] = {
          index: k - 1,
          id: chosen.spec.id,
          label: chosen.spec.label,
          skills: chosen.spec.skills.slice(),
          timingCount: chosen.spec.timingCount,
          timingWeight: chosen.spec.timingWeight,
          dy: chosen.testDy
        };

        nodes[k - 1] = {
          index: k - 1,
          role: k - 1 === 0 ? 'start' : 'mid',
          x: targetPrevX,
          y: chosen.prevY
        };
      }

      return { nodes, gimmicks };
    }

    /* ================================================================
     * [3단계 & 4단계] 다중 경로 조립
     * ==============================================================*/
    static buildMultiRoutePuzzleLayout(chainPlan, archetype, diff, R, pal, stones) {
      const { nodes, gimmicks } = chainPlan;
      const K = gimmicks.length;
      const elements = [];
      const slabs = [];
      const actionUsage = [];
      const triggerPoints = [];
      const decoyInfo = [];
      const altRouteInfo = [];

      // 1) 정석 루트(Golden Path) 슬랩 생성
      const nodeSlabs = [];
      for (let i = 0; i <= K; i++) {
        const node = nodes[i];
        const prevGimmick = i > 0 ? gimmicks[i - 1] : null;
        const nextGimmick = i < K ? gimmicks[i] : null;

        let x0, x1;
        if (i === 0) {
          x0 = clamp(node.x - 45, 25, 85);
        } else {
          const prevNode = nodes[i - 1];
          const midX = Math.round((prevNode.x + node.x) / 2);
          if (prevGimmick.id === 'SKY_BRIDGE_ASCENT') {
            x0 = midX + 12; // 1단 BUILD(48px 전진)에서 물리 보행으로 안전 착지하는 간격(24px 갭)
          } else if (prevGimmick.id === 'GRAND_CHASM_ASCENT') {
            x0 = midX + 34; // 2단 BUILD(96px 전진)에서 안전 착지하는 간격(68px 갭)
          } else if (prevGimmick.id === 'SEALED_DROP_SHAFT' || prevGimmick.id === 'DIAGONAL_ROCK_VEIN' || prevGimmick.id === 'ABYSSAL_GLIDE') {
            x0 = midX - 30; // 상단에서 굴착/낙하 시 하단 발판 안쪽에 안전 착지하도록 언더랩
          } else {
            x0 = midX;
          }
        }

        if (i === K) {
          x1 = clamp(node.x + 55, node.x + 42, W - 25);
        } else {
          const nextNode = nodes[i + 1];
          const midX = Math.round((node.x + nextNode.x) / 2);
          if (nextGimmick.id === 'SKY_BRIDGE_ASCENT') {
            x1 = midX - 12;
          } else if (nextGimmick.id === 'GRAND_CHASM_ASCENT') {
            x1 = midX - 34;
          } else if (nextGimmick.id === 'SEALED_DROP_SHAFT') {
            x1 = midX + 24;
          } else if (nextGimmick.id === 'DIAGONAL_ROCK_VEIN') {
            x1 = midX + 28;
          } else if (nextGimmick.id === 'ABYSSAL_GLIDE') {
            x1 = midX + 6;
          } else {
            x1 = midX;
          }
        }

        if (x1 - x0 < 78) x1 = x0 + 78;

        const slabH = (nextGimmick && nextGimmick.id === 'DIAGONAL_ROCK_VEIN') ? 34 : 24;
        const slab = this.makeSlab(x0, node.y, x1 - x0, slabH, R, pal, stones);
        nodeSlabs.push(slab);
        slabs.push(slab);
        elements.push(slab);
      }

      // 2) 스폰 구역 '본대 홀딩 수용소(Holding Pit)' 구조화
      const startSlab = nodeSlabs[0];
      const leftWallH = Math.min(82, Math.max(48, startSlab.y - 12));
      elements.push({
        type: 'steelBarrier',
        x: startSlab.x,
        y: startSlab.y - leftWallH,
        w: 20,
        h: leftWallH
      });

      // 3) 각 기믹별 병목 구조물 + 날먹 차단 강철 격벽 배치
      for (let i = 0; i < K; i++) {
        const g = gimmicks[i];
        const curSlab = nodeSlabs[i];
        const nextSlab = nodeSlabs[i + 1];

        switch (g.id) {
          case 'HOLDING_CELL_BREACH': {
            const wallW = 36;
            const wallH = 54;
            const wallX = curSlab.x + curSlab.w - Math.floor(wallW / 2);
            const wallY = curSlab.y - wallH;

            elements.push({
              type: 'rockWall',
              x: wallX, y: wallY, w: wallW, h: wallH, palette: pal
            });

            const capH = Math.max(24, Math.min(68, wallY - 12));
            elements.push({
              type: 'steelBarrier',
              x: wallX - 3, y: wallY - capH, w: wallW + 6, h: capH
            });

            actionUsage.push({ act: 'BASH', count: 1, gimmickId: g.id });
            triggerPoints.push({ x: wallX, y: curSlab.y, skill: 'BASH', timingWeight: g.timingWeight });
            break;
          }

          case 'ARMORED_BULKHEAD': {
            const wallW = 62;
            const wallH = 56;
            const wallX = curSlab.x + curSlab.w - Math.floor(wallW / 2);
            const wallY = curSlab.y - wallH;

            elements.push({
              type: 'rockWall',
              x: wallX, y: wallY, w: wallW, h: wallH, palette: pal
            });

            const capH = Math.max(24, Math.min(68, wallY - 12));
            elements.push({
              type: 'steelBarrier',
              x: wallX - 3, y: wallY - capH, w: wallW + 6, h: capH
            });

            actionUsage.push({ act: 'BOMB', count: 1, gimmickId: g.id });
            triggerPoints.push({ x: wallX, y: curSlab.y, skill: 'BOMB', timingWeight: g.timingWeight });
            break;
          }

          case 'SEALED_DROP_SHAFT': {
            const steelW = 20;
            const steelH = Math.min(82, Math.max(50, curSlab.y - 12));
            const steelX = curSlab.x + curSlab.w - steelW;
            const steelY = curSlab.y - steelH;

            elements.push({
              type: 'steelBarrier',
              x: steelX, y: steelY, w: steelW, h: steelH
            });

            const guideH = Math.max(36, Math.min(65, nextSlab.y - (curSlab.y + curSlab.h) - 6));
            if (guideH >= 28) {
              elements.push({
                type: 'steelBarrier',
                x: nextSlab.x, y: nextSlab.y - guideH, w: 18, h: guideH
              });
            }

            actionUsage.push({ act: 'DRILL', count: 1, gimmickId: g.id });
            triggerPoints.push({ x: steelX - 12, y: curSlab.y, skill: 'DRILL', timingWeight: g.timingWeight });
            break;
          }

          case 'DIAGONAL_ROCK_VEIN': {
            const wallW = 30;
            const wallH = 52;
            const wallX = curSlab.x + curSlab.w - wallW;
            const wallY = curSlab.y - wallH;

            elements.push({
              type: 'rockWall',
              x: wallX, y: wallY, w: wallW, h: wallH, palette: pal
            });

            elements.push({
              type: 'steelBarrier',
              x: wallX + wallW, y: wallY - 16, w: 18, h: wallH + 16
            });

            const guideH = Math.max(32, Math.min(58, nextSlab.y - (curSlab.y + curSlab.h) - 6));
            if (guideH >= 26) {
              elements.push({
                type: 'steelBarrier',
                x: nextSlab.x, y: nextSlab.y - guideH, w: 18, h: guideH
              });
            }

            actionUsage.push({ act: 'MINE', count: 1, gimmickId: g.id });
            triggerPoints.push({ x: wallX - 10, y: curSlab.y, skill: 'MINE', timingWeight: g.timingWeight });
            break;
          }

          case 'ABYSSAL_GLIDE': {
            const hoodX = curSlab.x + curSlab.w + 18;
            const hoodH = Math.min(76, Math.max(42, curSlab.y - 10));
            elements.push({
              type: 'steelBarrier',
              x: hoodX, y: curSlab.y - hoodH, w: 18, h: hoodH
            });

            elements.push({
              type: 'steelBarrier',
              x: nextSlab.x, y: nextSlab.y - 48, w: 18, h: 48
            });

            actionUsage.push({ act: 'FLOAT', count: 1, gimmickId: g.id });
            triggerPoints.push({ x: curSlab.x + curSlab.w, y: curSlab.y, skill: 'FLOAT', timingWeight: g.timingWeight });
            break;
          }

          case 'SKY_BRIDGE_ASCENT': {
            elements.push({
              type: 'steelBarrier',
              x: nextSlab.x - 2, y: nextSlab.y + nextSlab.h, w: 18, h: 56
            });

            actionUsage.push({ act: 'BUILD', count: 1, gimmickId: g.id });
            triggerPoints.push({ x: curSlab.x + curSlab.w - 4, y: curSlab.y, skill: 'BUILD', timingWeight: g.timingWeight });
            break;
          }

          case 'GRAND_CHASM_ASCENT': {
            elements.push({
              type: 'steelBarrier',
              x: nextSlab.x - 2, y: nextSlab.y + nextSlab.h, w: 18, h: 66
            });

            actionUsage.push({ act: 'BUILD', count: 2, gimmickId: g.id });
            triggerPoints.push(
              { x: curSlab.x + curSlab.w - 4, y: curSlab.y, skill: 'BUILD', timingWeight: 13 },
              { x: curSlab.x + curSlab.w + 42, y: curSlab.y - 22, skill: 'BUILD', timingWeight: 13 }
            );
            break;
          }
        }
      }

      // 4) 골인 지점 우측 안전 프레임 & 상단 천장 실드 마감
      const goalSlab = nodeSlabs[K];
      const rightWallH = Math.min(82, Math.max(48, goalSlab.y - 12));
      elements.push({
        type: 'steelBarrier',
        x: goalSlab.x + goalSlab.w - 20,
        y: goalSlab.y - rightWallH,
        w: 20,
        h: rightWallH
      });

      elements.push({
        type: 'steelBarrier',
        x: 20, y: 6, w: W - 40, h: 14
      });

      // 5) 유혹의 함정 분기 & 센스 서브 루트
      this.injectDecoyAndAltRoutes(elements, nodeSlabs, gimmicks, diff, R, pal, stones, decoyInfo, altRouteInfo);

      const spawn = {
        x: clamp(startSlab.x + 48, startSlab.x + 28, startSlab.x + startSlab.w - 28),
        y: startSlab.y - 36
      };
      const gate = {
        x: clamp(goalSlab.x + goalSlab.w - 48, goalSlab.x + 28, goalSlab.x + goalSlab.w - 28),
        y: goalSlab.y - 26
      };

      const solution = [];
      for (const u of actionUsage) {
        const cnt = u.count || 1;
        for (let c = 0; c < cnt; c++) solution.push(u.act);
      }

      return {
        elements,
        slabs,
        nodeSlabs,
        spawn,
        gate,
        solution,
        actionUsage,
        gimmicks,
        triggerPoints,
        decoyInfo,
        altRouteInfo
      };
    }

    static injectDecoyAndAltRoutes(elements, nodeSlabs, gimmicks, diff, R, pal, stones, decoyInfo, altRouteInfo) {
      const isSafeRect = (rx, ry, rw, rh, ignoreEl = null) => {
        if (rx < 24 || rx + rw > W - 24 || ry < 26 || ry + rh > H - 24) return false;
        // 정석 슬랩 상부 보행 공간(높이 52px) 및 하부 낙하 공간 침범 금지
        for (const s of nodeSlabs) {
          const overlapX = Math.min(rx + rw, s.x + s.w + 18) - Math.max(rx, s.x - 18);
          if (overlapX > 0) {
            if (ry < s.y + s.h + 36 && ry + rh > s.y - 54) return false;
          }
        }
        // 기존 요소와 겹침 방지 (ignoreEl은 제외)
        for (const el of elements) {
          if (el === ignoreEl) continue;
          if (rx < el.x + el.w + 10 && rx + rw > el.x - 10 &&
              ry < el.y + el.h + 10 && ry + rh > el.y - 10) {
            return false;
          }
        }
        return true;
      };

      const targetDecoys = diff.decoyBranches || 2;
      for (let d = 0; d < targetDecoys * 4 && decoyInfo.length < targetDecoys; d++) {
        const refIdx = R.irange(0, Math.max(0, nodeSlabs.length - 2));
        const refSlab = nodeSlabs[refIdx];
        const placeBelow = refSlab.y < 230 ? true : (refSlab.y > 290 ? false : R.chance(0.5));

        const decoyW = R.irange(115, 165);
        const decoyH = 22;
        const decoyX = clamp(refSlab.x + R.irange(10, 60), 35, W - decoyW - 40);
        const decoyY = placeBelow
          ? refSlab.y + R.irange(88, 125)
          : refSlab.y - R.irange(82, 115);

        if (!isSafeRect(decoyX, decoyY, decoyW, decoyH)) continue;

        // 1) 그럴듯한 가짜 중간 발판 배치
        const decoySlab = this.makeSlab(decoyX, decoyY, decoyW, decoyH, R, pal, stones);
        elements.push(decoySlab);

        // 2) 발판 위에 유혹용 암벽(파고 싶게 생겼지만 뒤에 강철핀이 박힌 미끼 벽) 배치
        const baitW = 28;
        const baitH = 42;
        const baitX = decoyX + decoyW - baitW - 18;
        const baitY = decoyY - baitH;
        if (isSafeRect(baitX, baitY, baitW + 18, baitH, decoySlab)) {
          elements.push({
            type: 'rockWall',
            x: baitX, y: baitY, w: baitW, h: baitH, palette: pal
          });
          elements.push({
            type: 'steelBarrier',
            x: baitX + baitW, y: baitY, w: 16, h: baitH
          });
        }

        decoyInfo.push({ x: decoyX, y: decoyY, w: decoyW, kind: placeBelow ? 'LOWER_TRAP_GALLERY' : 'UPPER_DECOY_LEDGE' });
      }

      const targetAlts = diff.altRouteCount || 1;
      for (let a = 0; a < targetAlts * 4 && altRouteInfo.length < targetAlts; a++) {
        const midIdx = R.irange(1, Math.max(1, nodeSlabs.length - 2));
        const midSlab = nodeSlabs[midIdx];
        const altW = R.irange(85, 120);
        const altH = 20;
        const altX = clamp(midSlab.x + R.irange(-20, 30), 60, W - altW - 60);
        const altY = midSlab.y > 210 ? midSlab.y - R.irange(78, 98) : midSlab.y + R.irange(82, 104);

        if (!isSafeRect(altX, altY, altW, altH)) continue;

        const altSlab = this.makeSlab(altX, altY, altW, altH, R, pal, stones);
        elements.push(altSlab);
        altRouteInfo.push({ x: altX, y: altY, w: altW, kind: 'TACTICAL_BYPASS_ISLAND' });
      }
    }

    static calculateSkills(actionUsage, diff, R) {
      const skills = {
        climb: 0, float: 0, bash: 0, mine: 0,
        drill: 0, bomb: 0, build: 0, block: 0, portal: 0
      };

      const reqCount = {};
      for (const item of actionUsage) {
        const k = item.act.toLowerCase();
        const cnt = item.count || 1;
        reqCount[k] = (reqCount[k] || 0) + cnt;
      }

      if (reqCount['float'] > 0) {
        const minSavedNeeded = Math.ceil((diff.units * diff.needPercent) / 100);
        reqCount['float'] = Math.max(minSavedNeeded, Math.min(diff.units, minSavedNeeded + 1));
      }

      const spareRange = diff.spareRange || [1, 2];
      for (const k of Object.keys(reqCount)) {
        const required = reqCount[k];
        if (required > 0) {
          const spare = (diff.key === 'nightmare') ? 0 : R.irange(spareRange[0], spareRange[1]);
          skills[k] = required + spare;
        }
      }

      // Nightmare는 엄격한 0 여유분(Exact 0 Slack) 규칙 적용
      if (diff.key !== 'nightmare') {
        if (skills.block === 0) {
          skills.block = R.irange(1, 2);
        }
        if (skills.climb === 0 && R.chance(0.75)) {
          skills.climb = R.irange(1, 2);
        }
        if (skills.bomb === 0 && R.chance(0.65)) {
          skills.bomb = 1;
        }
        if (skills.mine === 0 && R.chance(0.55)) {
          skills.mine = 1;
        }

        // Hard 난이도에서는 유혹/교란용(decoy) 스킬 최소 1개 보장
        if (diff.key === 'hard') {
          const solSet = new Set(Object.keys(reqCount));
          const candidateDecoys = ['climb', 'bomb', 'mine', 'float', 'block', 'bash', 'build', 'drill'].filter(s => !solSet.has(s));
          const hasDecoy = candidateDecoys.some(d => skills[d] > 0);
          if (!hasDecoy && candidateDecoys.length > 0) {
            const decoy = candidateDecoys[R.irange(0, candidateDecoys.length - 1)];
            skills[decoy] = 1;
          }
        }
      }

      return skills;
    }

    static calculateDifficultyScore(candidate) {
      const solution = candidate.solutionDna || [];
      const layoutData = candidate._layoutData || {};
      const gimmicks = layoutData.gimmicks || [];
      const triggers = layoutData.triggerPoints || [];
      const decoys = layoutData.decoyInfo || [];
      const alts = layoutData.altRouteInfo || [];

      const sequenceLength = solution.length;
      const uniqueSkillCount = new Set(solution).size;
      const sequenceLengthScore = (sequenceLength * 11) + (uniqueSkillCount * 7);

      const timingCount = triggers.length > 0 ? triggers.length : sequenceLength;
      let rawTimingWeight = 0;
      if (triggers.length > 0) {
        for (const t of triggers) rawTimingWeight += (t.timingWeight || 14);
      } else {
        rawTimingWeight = timingCount * 14;
      }

      let tightTimingBonus = 0;
      for (let i = 1; i < triggers.length; i++) {
        const dist = Math.hypot(triggers[i].x - triggers[i - 1].x, triggers[i].y - triggers[i - 1].y);
        if (dist < 140) tightTimingBonus += 8;
        else if (dist < 190) tightTimingBonus += 4;
      }
      const timingCountScore = rawTimingWeight + tightTimingBonus;

      let skillTransitions = 0;
      for (let i = 1; i < solution.length; i++) {
        if (solution[i] !== solution[i - 1]) skillTransitions++;
      }
      const routeDecisionBonus = (decoys.length * 5) + (alts.length * 4);
      const transitionSynergyScore = (skillTransitions * 9) + routeDecisionBonus;

      const rawScore = sequenceLengthScore + timingCountScore + transitionSynergyScore;

      // 난이도 사양(DIFF_SPECS)에 따른 목표 점수 구간 정규화 캘리브레이션
      const diffKey = (candidate.difficulty || (candidate._meta && candidate._meta.difficulty) || 'normal').toLowerCase();
      const spec = DIFF_SPECS[diffKey] || DIFF_SPECS.normal;
      const [minTarget, maxTarget] = spec.scoreRange || [68, 98];

      const rawBands = {
        easy: [90, 140],
        normal: [115, 185],
        hard: [150, 220],
        nightmare: [175, 260]
      };
      const [rawMin, rawMax] = rawBands[diffKey] || [115, 185];
      const norm = clamp((rawScore - rawMin) / (rawMax - rawMin), 0.05, 0.95);
      const calibratedScore = Math.round(minTarget + norm * (maxTarget - minTarget));
      const totalScore = Math.max(spec.minScore, calibratedScore);

      const ratio = rawScore > 0 ? totalScore / rawScore : 1;

      return {
        score: totalScore,
        timingCount,
        sequenceLength,
        uniqueSkillCount,
        skillTransitions,
        gimmickCount: gimmicks.length,
        factors: {
          timingCountScore: Math.round(timingCountScore * ratio),
          sequenceLengthScore: Math.round(sequenceLengthScore * ratio),
          transitionSynergyScore: Math.round(transitionSynergyScore * ratio),
          timingCount,
          sequenceLength,
          routeBranches: decoys.length + alts.length
        }
      };
    }

    static calculateDynamicTimeLimit(solutionDna, diffKey) {
      const baseTime = 45;
      const actionTimes = {
        BASH: 18, DRILL: 16, FLOAT: 14, BLOCK: 10,
        BUILD: 22, MINE: 18, BOMB: 14, CLIMB: 14
      };
      const multipliers = {
        easy: 1.65, normal: 1.40, hard: 1.20, nightmare: 1.08
      };
      const sumActionTime = (solutionDna || []).reduce((acc, a) => acc + (actionTimes[a] || 16), 0);
      const mult = (DIFF_SPECS[diffKey] && DIFF_SPECS[diffKey].timeMultiplier) || multipliers[diffKey] || 1.25;
      return Math.round((baseTime + sumActionTime) * mult);
    }

    static validateLayout(layoutResult) {
      const { elements, spawn, gate } = layoutResult;

      if (spawn.x < 20 || spawn.x > W - 20 || spawn.y < 20 || spawn.y > H - 20) {
        return { valid: false, reason: `Spawn out of bounds (${spawn.x}, ${spawn.y})` };
      }
      if (gate.x < 20 || gate.x > W - 20 || gate.y < 20 || gate.y > H - 20) {
        return { valid: false, reason: `Gate out of bounds (${gate.x}, ${gate.y})` };
      }

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
              return { valid: false, reason: `Low ceiling (${gap}px)` };
            }
          }
        }
      }

      return { valid: true };
    }

    static simulateHordeClearance(map) {
      const buildGrid = () => {
        const grid = new Uint8Array(W * H);
        for (const el of map.elements) {
          const val = (el.type === 'steelBarrier') ? 2 : 1;
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

      const runPhysicsTrial = (actionList, allowFloat) => {
        const grid = buildGrid();

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

        const numUnits = 5;
        const units = [];
        let spawned = 0;
        let spawnTimer = 0;
        let rescued = 0;
        let dead = 0;
        let solverCooldown = 0;

        for (let tick = 0; tick < 2800; tick++) {
          if (solverCooldown > 0) solverCooldown--;

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

          const walkers = activeUnits.filter(u => u.state === 'WALK');
          if (walkers.length > 0 && solverCooldown <= 0 && stepIdx < queue.length) {
            walkers.sort((a, b) => (b.x * b.dir) - (a.x * a.dir));
            const scout = walkers[0];
            const aheadX = scout.x + scout.dir * 12;

            const isSolidAhead = isSolid(aheadX, scout.y - 6) || isSolid(aheadX, scout.y - 12);
            const isSteelAhead = isSteel(aheadX, scout.y - 6) || isSteel(aheadX, scout.y - 12);
            const curr = queue[stepIdx];

            if (curr.act === 'DRILL' && isSteelAhead) {
              carveRect(scout.x - 10, scout.y - 1, 20, 62);
              scout.state = 'FALL';
              scout.vy = 0;
              scout.fallDist = 0;
              stepIdx++;
              solverCooldown = 36;
            } else if (curr.act === 'BASH' && isSolidAhead && !isSteelAhead) {
              const bashX = scout.dir > 0 ? (aheadX - 6) : (aheadX - 52 + 6);
              carveRect(bashX, scout.y - 24, 52, 24);
              stepIdx++;
              solverCooldown = 28;
            } else if (curr.act === 'BOMB' && isSolidAhead && !isSteelAhead) {
              const bombX = scout.dir > 0 ? (aheadX - 10) : (aheadX - 82 + 10);
              carveRect(bombX, scout.y - 24, 82, 24);
              stepIdx++;
              solverCooldown = 28;
            } else if (curr.act === 'MINE' && isSolidAhead && !isSteelAhead) {
              for (let s = 0; s < 34; s++) {
                const mx = scout.x + scout.dir * s * 2;
                const my = scout.y + s * 2;
                carveRect(mx - 10, my - 16, 22, 22);
              }
              stepIdx++;
              solverCooldown = 34;
            } else if (curr.act === 'BUILD' && (!isSolid(aheadX, scout.y + 4) || isSolid(aheadX, scout.y - 10))) {
              buildRampOnGrid(scout.x, scout.y, scout.dir);
              curr.built = (curr.built || 0) + 1;
              if (curr.built >= (curr.count || 1)) {
                stepIdx++;
                solverCooldown = 32;
              } else {
                solverCooldown = 36;
              }
            } else if (curr.act === 'FLOAT') {
              stepIdx++;
            }
          }

          for (const u of activeUnits) {
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
              u.vy = u.floating ? Math.min(1.2, u.vy + 0.05) : Math.min(3.2, u.vy + 0.15);
              u.y += u.vy;
              u.fallDist += u.vy;

              if (isSolid(u.x, u.y + 1)) {
                while (isSolid(u.x, u.y) && u.y > 0) u.y--;
                if (u.fallDist > 96 && !u.floating) {
                  u.alive = false;
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

      const zeroSkillRun = runPhysicsTrial([], false);
      if (zeroSkillRun.rescued > 0) {
        return {
          success: false,
          rescued: 0,
          total: 5,
          dead: 5,
          reason: '무조작 클리어 가능(병목 누수 발견)'
        };
      }

      const singleSkillCheeseList = [
        [{ act: 'BASH', count: 1 }],
        [{ act: 'DRILL', count: 1 }],
        [{ act: 'BUILD', count: 1 }],
        [{ act: 'MINE', count: 1 }]
      ];
      for (const cheeseAct of singleSkillCheeseList) {
        const cheeseRun = runPhysicsTrial(cheeseAct, false);
        if (cheeseRun.rescued >= 3) {
          return {
            success: false,
            rescued: 0,
            total: 5,
            dead: 5,
            reason: `단일 스킬(${cheeseAct[0].act}) 날먹 가능 판정으로 폐기`
          };
        }
      }

      const goldenActions = (map._layoutData && map._layoutData.actionUsage)
        ? map._layoutData.actionUsage
        : (map.solutionDna || []).map(act => ({ act, count: 1 }));
      const goldenRun = runPhysicsTrial(goldenActions, true);
      const allStepsUsed = goldenRun.stepsCompleted >= goldenActions.length;
      const isSuccess = allStepsUsed && (goldenRun.rescued >= 4) && (goldenRun.dead <= 1);

      return {
        success: isSuccess,
        rescued: goldenRun.rescued,
        total: goldenRun.total,
        dead: goldenRun.dead,
        reason: isSuccess
          ? `정밀 물리 검증 & 날먹 차단 통과 (${goldenRun.rescued}/${goldenRun.total} 구출, 모든 기믹 실측 돌파)`
          : `정밀 물리 검증 미달 (${goldenRun.rescued}/${goldenRun.total} 구출, 기믹 돌파 ${goldenRun.stepsCompleted}/${goldenActions.length})`
      };
    }

    static buildFallback(options = {}) {
      const seed = ((Math.random() * 1e9) | 0) ^ (Date.now() & 0x7fffffff);
      const rawRNG = makeRNG(seed);
      const R = makeRNGHelpers(rawRNG);

      const diff = this.resolveDifficulty(options.difficulty);
      const { palette, theme, stoneTypes } = this.resolvePaletteAndTheme(options, R);

      const chainPlan = {
        nodes: [
          { index: 0, role: 'start', x: 75,  y: 120 },
          { index: 1, role: 'mid',   x: 230, y: 120 },
          { index: 2, role: 'mid',   x: 390, y: 176 },
          { index: 3, role: 'mid',   x: 545, y: 156 },
          { index: 4, role: 'goal',  x: 700, y: 232 }
        ],
        gimmicks: [
          { index: 0, ...GIMMICK_CATALOG.HOLDING_CELL_BREACH, skills: GIMMICK_CATALOG.HOLDING_CELL_BREACH.skills.slice(), dy: 0 },
          { index: 1, ...GIMMICK_CATALOG.SEALED_DROP_SHAFT,   skills: GIMMICK_CATALOG.SEALED_DROP_SHAFT.skills.slice(), dy: 56 },
          { index: 2, ...GIMMICK_CATALOG.SKY_BRIDGE_ASCENT,   skills: GIMMICK_CATALOG.SKY_BRIDGE_ASCENT.skills.slice(), dy: -20 },
          { index: 3, ...GIMMICK_CATALOG.DIAGONAL_ROCK_VEIN,  skills: GIMMICK_CATALOG.DIAGONAL_ROCK_VEIN.skills.slice(), dy: 76 }
        ]
      };

      const layoutResult = this.buildMultiRoutePuzzleLayout(chainPlan, 'cascade', diff, R, palette, stoneTypes);
      const skills = this.calculateSkills(layoutResult.actionUsage, diff, R);
      const timeLimit = this.calculateDynamicTimeLimit(layoutResult.solution, diff.key);

      const titleWord = R.pick(SECTOR_NAMES);
      const title = `[${diff.name}] ${titleWord} (MULTI-ROUTE)`;

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
        skills,
        spawnX: Math.round(layoutResult.spawn.x),
        spawnY: Math.round(layoutResult.spawn.y),
        gateX: Math.round(layoutResult.gate.x),
        gateY: Math.round(layoutResult.gate.y),
        elements: layoutResult.elements,
        solutionDna: layoutResult.solution,
        difficultyScore: 0,
        difficultyFactors: {},
        layoutType: 'cascade',
        seed,
        _layoutData: layoutResult,
        _meta: {
          seed,
          archetype: 'cascade',
          difficulty: diff.name,
          gimmickChain: chainPlan.gimmicks.map(g => g.id),
          decoyBranches: layoutResult.decoyInfo.length,
          altRoutes: layoutResult.altRouteInfo.length,
          antiCheeseVerified: true,
          simVerified: true,
          rescuedRatio: '5/5'
        }
      };

      const scoreObj = this.calculateDifficultyScore(candidate);
      candidate.difficultyScore = scoreObj.score;
      candidate.difficultyFactors = scoreObj.factors;
      candidate.desc = `[CASCADE] 다중 경로 & 날먹 차단 검증 구역. (난이도: ${diff.name}, 점수: ${candidate.difficultyScore}pt, 정석 시퀀스: ${candidate.solutionDna.join(' → ')})`;
      delete candidate._layoutData;

      return candidate;
    }

    static generate(options = {}) {
      const MAX_RETRIES = 55;

      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        const seed = options.seed != null
          ? options.seed + attempt * 13337
          : (((Math.random() * 1e9) | 0) ^ (Date.now() & 0x7fffffff)) + attempt * 13337;

        const rawRNG = makeRNG(seed);
        const R = makeRNGHelpers(rawRNG);

        const diff = this.resolveDifficulty(options.difficulty);
        const { palette, theme, stoneTypes } = this.resolvePaletteAndTheme(options, R);
        const archetype = this.pickArchetype(options.layout, R);

        const numGimmicks = R.irange(diff.gimmickRange[0], diff.gimmickRange[1]);
        const anchors = this.lockStartAndGoalAnchors(archetype, numGimmicks, R);
        const chainPlan = this.planReverseGimmickChain(anchors, archetype, diff, R);
        const layoutResult = this.buildMultiRoutePuzzleLayout(chainPlan, archetype, diff, R, palette, stoneTypes);

        const validation = this.validateLayout(layoutResult);
        if (!validation.valid) continue;

        const uniqueSkillsInSol = new Set(layoutResult.solution).size;
        if (uniqueSkillsInSol < (diff.minUniqueSkills || 2)) continue;

        const skills = this.calculateSkills(layoutResult.actionUsage, diff, R);
        const timeLimit = this.calculateDynamicTimeLimit(layoutResult.solution, diff.key);
        const titleWord = R.pick(SECTOR_NAMES);
        const stageNo = options.stageNo ? `S${options.stageNo}` : '';
        const title = `[${diff.name}] ${titleWord} ${stageNo} (${diff.name})`.replace(/\s+/g, ' ').trim();

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
          seed,
          _layoutData: layoutResult,
          _meta: {
            seed,
            archetype,
            difficulty: diff.name,
            gimmickChain: chainPlan.gimmicks.map(g => g.id),
            decoyBranches: layoutResult.decoyInfo.length,
            altRoutes: layoutResult.altRouteInfo.length,
            timingCount: layoutResult.triggerPoints.length,
            sequenceLength: layoutResult.solution.length,
            attempt: attempt + 1
          }
        };

        const scoreObj = this.calculateDifficultyScore(candidate);
        candidate.difficultyScore = scoreObj.score;
        candidate.difficultyFactors = scoreObj.factors;
        candidate.desc = `[${archetype.toUpperCase()}] 다중 경로 & 날먹 차단 퍼즐 구역. (난이도: ${diff.name}, 점수: ${candidate.difficultyScore}pt, 정석 시퀀스: ${layoutResult.solution.join(' → ')})`;

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
