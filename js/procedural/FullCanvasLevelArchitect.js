/* ============================================================================
 * FullCanvasLevelArchitect.js — 유연한 다해법 & 정밀 물리 기반 퍼즐 생성 엔진 (v6)
 *
 * [핵심 설계 원칙]
 * 1. "4개 스킬 각 1개씩만 주던" 억까 폐기 → 핵심 스킬 여유분 + 전술 보조 스킬을
 *    균형 있게 지급하여 정해진 답 외에 창의적·유연한 대안 해법(Multi-Solution) 허용
 * 2. 각 스킬의 실제 인게임 물리(NanoUnit.js) 100% 반영:
 *    - BUILD 1회 = 가로 48px, 높이 24px (간격/단차에 맞게 충분한 갯수 부여)
 *    - BOMB = 유닛 1명 자폭 사망 + 반경 32px 파괴 (인원 여유 자동 반영)
 *    - BLOCK = 유닛 1명 고정 (탈출/파기 수단 또는 인원 여유 보장)
 *    - CLIMB = 1회성 벽 오르기 (상단 강철 뚜껑 남발을 줄여 등반/우회 루트 개방)
 *    - 안전 낙하 = maxSafeFall(96px) 이하(<= 82px) 유지, 마우스 광클 Float 강요 제거
 * 3. 스타팅 안전 벙커(Holding Bunker) + 실질적으로 연결되는 상/하단 우회 루트 구축
 * 4. 0-스킬 날먹 차단 + 군단 물리 시뮬레이션 검증으로 100% 클리어 가능 보장
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
   * 난이도 사양 (유닛 손실 여유 & 스킬 다양성 반영)
   * ====================================================================*/
  const DIFF_SPECS = {
    easy: {
      key: 'easy', name: 'EASY',
      minScore: 38,
      scoreRange: [38, 68],
      timeMultiplier: 1.75,
      units: 16, needPercent: 50, timeLimit: 220, spawnRate: 32,
      gimmickRange: [3, 3],
      spareRange: [2, 2],
      extraSkillTypes: 3,
      decoyBranches: 1,
      altRouteCount: 2,
      minUniqueSkills: 2
    },
    normal: {
      key: 'normal', name: 'NORMAL',
      minScore: 62,
      scoreRange: [62, 95],
      timeMultiplier: 1.45,
      units: 18, needPercent: 60, timeLimit: 190, spawnRate: 26,
      gimmickRange: [3, 4],
      spareRange: [1, 2],
      extraSkillTypes: 3,
      decoyBranches: 1,
      altRouteCount: 2,
      minUniqueSkills: 3
    },
    hard: {
      key: 'hard', name: 'HARD',
      minScore: 88,
      scoreRange: [88, 130],
      timeMultiplier: 1.25,
      units: 20, needPercent: 70, timeLimit: 165, spawnRate: 22,
      gimmickRange: [4, 4],
      spareRange: [1, 2],
      extraSkillTypes: 2,
      decoyBranches: 2,
      altRouteCount: 2,
      minUniqueSkills: 3
    },
    nightmare: {
      key: 'nightmare', name: 'NIGHTMARE',
      minScore: 112,
      scoreRange: [112, 165],
      timeMultiplier: 1.12,
      units: 22, needPercent: 78, timeLimit: 145, spawnRate: 18,
      gimmickRange: [4, 4],
      spareRange: [1, 1], // 최소한의 실수 복구 & 대안 여유 1개 보장
      extraSkillTypes: 2,
      decoyBranches: 2,
      altRouteCount: 2,
      minUniqueSkills: 3
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
   * 핵심 기믹 카탈로그 (안전 낙하 <= 82px 준수 & 다해법 개방형)
   * ====================================================================*/
  const GIMMICK_CATALOG = {
    HOLDING_CELL_BREACH: {
      id: 'HOLDING_CELL_BREACH',
      label: '암벽 돌파 관문 (BASH / BOMB / CLIMB 대안 가능)',
      skills: ['BASH'],
      timingCount: 1,
      timingWeight: 14,
      dyRange: [0, 0]
    },
    SEALED_DROP_SHAFT: {
      id: 'SEALED_DROP_SHAFT',
      label: '수직 하강 갱도 (DRILL 하강 또는 BUILD 우회 가능)',
      skills: ['DRILL'],
      timingCount: 1,
      timingWeight: 15,
      dyRange: [56, 74] // maxSafeFall(96) 대비 충분한 안전 여유
    },
    ARMORED_BULKHEAD: {
      id: 'ARMORED_BULKHEAD',
      label: '중장갑 격벽 폭파 (BOMB 또는 BASHx2 / CLIMB 대안)',
      skills: ['BOMB'],
      timingCount: 1,
      timingWeight: 16,
      dyRange: [0, 0]
    },
    DIAGONAL_ROCK_VEIN: {
      id: 'DIAGONAL_ROCK_VEIN',
      label: '두꺼운 암반층 대각선 굴착 (MINE / DRILL 대안)',
      skills: ['MINE'],
      timingCount: 1,
      timingWeight: 16,
      dyRange: [58, 76]
    },
    SKY_BRIDGE_ASCENT: {
      id: 'SKY_BRIDGE_ASCENT',
      label: '단차 계단 가교 (1단 BUILD)',
      skills: ['BUILD'],
      timingCount: 1,
      timingWeight: 17,
      dyRange: [-20, -20]
    },
    GRAND_CHASM_ASCENT: {
      id: 'GRAND_CHASM_ASCENT',
      label: '대협곡 연속 계단 가교 (2단 BUILD)',
      skills: ['BUILD', 'BUILD'],
      timingCount: 2,
      timingWeight: 26,
      dyRange: [-40, -40]
    },
    HIGH_WALL_VAULT: {
      id: 'HIGH_WALL_VAULT',
      label: '고지대 성벽 등반 (CLIMB 또는 BUILD 계단 등반)',
      skills: ['CLIMB'],
      timingCount: 1,
      timingWeight: 15,
      dyRange: [-28, -24]
    }
  };

  const ARCHETYPE_GIMMICK_WEIGHTS = {
    cascade: [
      { id: 'HOLDING_CELL_BREACH', w: 3.2 }, { id: 'SEALED_DROP_SHAFT', w: 3.6 },
      { id: 'DIAGONAL_ROCK_VEIN', w: 3.2 },  { id: 'SKY_BRIDGE_ASCENT', w: 2.8 },
      { id: 'HIGH_WALL_VAULT', w: 2.2 },     { id: 'ARMORED_BULKHEAD', w: 2.0 }
    ],
    zigzag: [
      { id: 'HOLDING_CELL_BREACH', w: 3.4 }, { id: 'SEALED_DROP_SHAFT', w: 3.4 },
      { id: 'SKY_BRIDGE_ASCENT', w: 3.2 },   { id: 'DIAGONAL_ROCK_VEIN', w: 2.8 },
      { id: 'ARMORED_BULKHEAD', w: 2.4 },    { id: 'HIGH_WALL_VAULT', w: 2.2 }
    ],
    traverse: [
      { id: 'HOLDING_CELL_BREACH', w: 3.5 }, { id: 'SKY_BRIDGE_ASCENT', w: 3.5 },
      { id: 'ARMORED_BULKHEAD', w: 2.8 },    { id: 'GRAND_CHASM_ASCENT', w: 2.4 },
      { id: 'HIGH_WALL_VAULT', w: 2.4 },     { id: 'SEALED_DROP_SHAFT', w: 2.2 }
    ],
    split: [
      { id: 'SEALED_DROP_SHAFT', w: 3.5 },   { id: 'SKY_BRIDGE_ASCENT', w: 3.4 },
      { id: 'HOLDING_CELL_BREACH', w: 3.0 }, { id: 'DIAGONAL_ROCK_VEIN', w: 2.8 },
      { id: 'HIGH_WALL_VAULT', w: 2.4 },     { id: 'GRAND_CHASM_ASCENT', w: 2.2 }
    ],
    chamber: [
      { id: 'SEALED_DROP_SHAFT', w: 3.8 },   { id: 'HOLDING_CELL_BREACH', w: 3.4 },
      { id: 'ARMORED_BULKHEAD', w: 2.8 },    { id: 'SKY_BRIDGE_ASCENT', w: 2.8 },
      { id: 'DIAGONAL_ROCK_VEIN', w: 2.6 },  { id: 'HIGH_WALL_VAULT', w: 2.2 }
    ],
    ascent: [
      { id: 'SKY_BRIDGE_ASCENT', w: 4.2 },   { id: 'GRAND_CHASM_ASCENT', w: 3.4 },
      { id: 'HIGH_WALL_VAULT', w: 3.0 },     { id: 'HOLDING_CELL_BREACH', w: 3.0 },
      { id: 'ARMORED_BULKHEAD', w: 2.4 },    { id: 'SEALED_DROP_SHAFT', w: 1.8 }
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
        else pal = 'cyan';
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
      return R.pick(archetypes);
    }

    static makeSlab(x, y, w, h, R, pal, stones) {
      const stone = R.pick(stones);
      return {
        type: stone,
        x: Math.round(x),
        y: Math.round(y),
        w: Math.round(w),
        h: Math.round(h),
        palette: pal,
        profile: R.profile(Math.max(4, Math.min(8, Math.round(w / 28))), 12, 32)
      };
    }

    static pickFlowMode(archetype, R) {
      if (archetype === 'chamber' || archetype === 'zigzag') {
        return R.chance(0.75) ? 'uturn' : (R.chance(0.5) ? 'rtl' : 'ltr');
      }
      if (archetype === 'split') {
        return R.chance(0.55) ? 'uturn' : 'ltr';
      }
      return R.chance(0.35) ? 'rtl' : 'ltr';
    }

    static lockStartAndGoalAnchors(archetype, numGimmicks, R, flowMode = 'ltr') {
      if (flowMode === 'uturn') {
        const startX = R.irange(75, 110);
        const startY = R.irange(105, 135);
        const goalX = R.irange(85, 130);
        const goalY = R.irange(285, 330);
        return { startX, startY, goalX, goalY, flowMode };
      }

      const isRtl = (flowMode === 'rtl');
      const startX = isRtl ? R.irange(695, 730) : R.irange(65, 92);
      const goalX = isRtl ? R.irange(68, 102) : R.irange(695, 730);
      let startY, goalY;

      switch (archetype) {
        case 'cascade':
          startY = R.irange(110, 145);
          goalY = clamp(startY + numGimmicks * R.irange(32, 48), 220, 350);
          break;
        case 'ascent':
          startY = R.irange(295, 340);
          goalY = clamp(startY - numGimmicks * R.irange(28, 42), 115, 225);
          break;
        case 'zigzag':
          startY = R.irange(160, 215);
          goalY = R.irange(195, 275);
          break;
        case 'chamber':
          startY = R.irange(140, 185);
          goalY = R.irange(240, 320);
          break;
        case 'split':
          startY = R.irange(150, 200);
          goalY = R.irange(220, 310);
          break;
        case 'traverse':
        default:
          startY = R.irange(185, 245);
          goalY = clamp(startY + R.irange(-35, 45), 140, 320);
          break;
      }

      return { startX, startY, goalX, goalY, flowMode };
    }

    static planReverseGimmickChain(anchors, archetype, diff, R) {
      const flowMode = anchors.flowMode || 'ltr';

      if (flowMode === 'uturn') {
        const K = 4; // 상층 1개 -> 하강 전환 1개 -> 하층 2개 (총 4기믹 2층 U턴 구조)
        const topY = R.irange(112, 138);
        const midDropY = topY + R.irange(68, 78);
        const botY = midDropY + R.irange(68, 78);

        const nodes = [
          { index: 0, role: 'start', x: 110, y: topY },
          { index: 1, role: 'mid',   x: 380, y: topY },
          { index: 2, role: 'mid',   x: 660, y: topY },
          { index: 3, role: 'mid',   x: 420, y: midDropY },
          { index: 4, role: 'goal',  x: 130, y: botY }
        ];

        const topGimmick = R.pick([GIMMICK_CATALOG.HOLDING_CELL_BREACH, GIMMICK_CATALOG.ARMORED_BULKHEAD, GIMMICK_CATALOG.HIGH_WALL_VAULT]);
        const dropGimmick = R.pick([GIMMICK_CATALOG.SEALED_DROP_SHAFT, GIMMICK_CATALOG.DIAGONAL_ROCK_VEIN]);
        const botGimmick1 = R.pick([GIMMICK_CATALOG.HOLDING_CELL_BREACH, GIMMICK_CATALOG.SKY_BRIDGE_ASCENT, GIMMICK_CATALOG.ARMORED_BULKHEAD]);
        const botGimmick2 = R.pick([GIMMICK_CATALOG.SEALED_DROP_SHAFT, GIMMICK_CATALOG.DIAGONAL_ROCK_VEIN]);

        const gimmicks = [
          { index: 0, ...topGimmick, skills: topGimmick.skills.slice(), dy: 0 },
          { index: 1, ...dropGimmick, skills: dropGimmick.skills.slice(), dy: midDropY - topY, isUTurnPivot: true },
          { index: 2, ...botGimmick1, skills: botGimmick1.skills.slice(), dy: 0 },
          { index: 3, ...botGimmick2, skills: botGimmick2.skills.slice(), dy: botY - midDropY }
        ];
        // 노드 2 -> 3은 같은 우측 수직 하강 구간이므로 X좌표 정렬
        nodes[2].x = 640;
        nodes[3].x = 600;
        nodes[3].y = midDropY;
        nodes.splice(4, 0, { index: 4, role: 'mid', x: 350, y: midDropY });
        nodes[5] = { index: 5, role: 'goal', x: 115, y: botY };
        // K=4에 맞춰 5개 노드로 재정렬: 0(좌상)->1(우상)->2(우중,하강)->3(좌중)->4(좌하,골)
        const cleanNodes = [
          { index: 0, role: 'start', x: 115, y: topY },
          { index: 1, role: 'mid',   x: 420, y: topY },
          { index: 2, role: 'mid',   x: 650, y: topY },
          { index: 3, role: 'mid',   x: 380, y: midDropY },
          { index: 4, role: 'goal',  x: 115, y: botY }
        ];
        return { nodes: cleanNodes, gimmicks, flowMode: 'uturn' };
      }

      const K = R.irange(diff.gimmickRange[0], diff.gimmickRange[1]);
      const pool = ARCHETYPE_GIMMICK_WEIGHTS[archetype] || ARCHETYPE_GIMMICK_WEIGHTS.cascade;

      const nodes = new Array(K + 1);
      const gimmicks = new Array(K);
      nodes[K] = { index: K, role: 'goal', x: anchors.goalX, y: anchors.goalY };

      const usedGimmicks = new Set();
      let curY = anchors.goalY;

      for (let k = K; k >= 1; k--) {
        const tPrev = (k - 1) / K;
        const prevX = Math.round(anchors.startX + (anchors.goalX - anchors.startX) * tPrev);
        const candidates = [];

        for (const item of pool) {
          const spec = GIMMICK_CATALOG[item.id];
          if (!spec) continue;
          if (diff.key === 'easy' && spec.id === 'GRAND_CHASM_ASCENT') continue;

          const dy = R.irange(spec.dyRange[0], spec.dyRange[1]);
          const prevY = curY - dy;

          if (prevY < 95 || prevY > 350) continue;

          let weight = item.w;
          if (k < K && gimmicks[k] && gimmicks[k].id === spec.id) {
            weight *= 0.25;
          }
          if (!usedGimmicks.has(spec.id)) {
            weight *= 2.2;
          }
          if (k === 1 && (spec.id === 'HOLDING_CELL_BREACH' || spec.id === 'SEALED_DROP_SHAFT' || spec.id === 'SKY_BRIDGE_ASCENT')) {
            weight *= 1.6;
          }

          candidates.push({ spec, dy, prevY, w: weight });
        }

        let chosen;
        if (candidates.length > 0) {
          chosen = R.weighted(candidates);
        } else {
          const fallbackSpec = (curY > 235)
            ? GIMMICK_CATALOG.SEALED_DROP_SHAFT
            : (curY < 160 ? GIMMICK_CATALOG.SKY_BRIDGE_ASCENT : GIMMICK_CATALOG.HOLDING_CELL_BREACH);
          const dy = clamp(fallbackSpec.dyRange[0], -40, 74);
          chosen = {
            spec: fallbackSpec,
            dy,
            prevY: clamp(curY - dy, 100, 345)
          };
        }

        usedGimmicks.add(chosen.spec.id);
        gimmicks[k - 1] = {
          index: k - 1,
          ...chosen.spec,
          skills: chosen.spec.skills.slice(),
          dy: chosen.dy
        };
        curY = chosen.prevY;
        nodes[k - 1] = {
          index: k - 1,
          role: (k - 1 === 0) ? 'start' : 'mid',
          x: prevX,
          y: curY
        };
      }

      nodes[0].x = anchors.startX;
      return { nodes, gimmicks, flowMode };
    }

    static buildMultiRoutePuzzleLayout(chainPlan, archetype, diff, R, pal, stones) {
      const { nodes, gimmicks, flowMode = 'ltr' } = chainPlan;
      const K = gimmicks.length;
      const elements = [];
      const slabs = [];
      const actionUsage = [];
      const triggerPoints = [];
      const decoyInfo = [];
      const altRouteInfo = [];

      // 각 노드의 진행 방향 계산 (+1: 우측, -1: 좌측)
      const getOutDir = (i) => {
        if (i < K) return (nodes[i + 1].x >= nodes[i].x) ? 1 : -1;
        return (nodes[i].x >= nodes[i - 1].x) ? 1 : -1;
      };

      // 1) 정석 루트(Golden Path) 슬랩 생성 — 8px 단위 깔끔한 그리드 스냅
      const snap8 = (v) => Math.round(v / 8) * 8;
      const nodeSlabs = [];

      for (let i = 0; i <= K; i++) {
        const node = nodes[i];
        const outDir = getOutDir(i);
        const prevGimmick = i > 0 ? gimmicks[i - 1] : null;
        const nextGimmick = i < K ? gimmicks[i] : null;

        let x0, x1;
        if (flowMode === 'uturn') {
          // 2층 U턴 전용 깔끔한 대칭 슬랩 배치
          if (i === 0) { x0 = 56; x1 = 264; }
          else if (i === 1) { x0 = 264; x1 = 496; }
          else if (i === 2) { x0 = 496; x1 = 720; }
          else if (i === 3) { x0 = 272; x1 = 704; }
          else { x0 = 64; x1 = 272; }
        } else if (outDir === 1) {
          // 좌 -> 우 정방향
          if (i === 0) {
            x0 = snap8(clamp(node.x - 44, 24, 72));
          } else {
            const prevNode = nodes[i - 1];
            const midX = snap8((prevNode.x + node.x) / 2);
            if (prevGimmick.id === 'SKY_BRIDGE_ASCENT') x0 = midX + 8;
            else if (prevGimmick.id === 'GRAND_CHASM_ASCENT') x0 = midX + 32;
            else if (prevGimmick.id === 'HIGH_WALL_VAULT') x0 = midX - 8;
            else if (prevGimmick.id === 'SEALED_DROP_SHAFT' || prevGimmick.id === 'DIAGONAL_ROCK_VEIN') x0 = midX - 32;
            else x0 = midX;
          }

          if (i === K) {
            x1 = snap8(clamp(node.x + 64, node.x + 48, W - 24));
          } else {
            const nextNode = nodes[i + 1];
            const midX = snap8((node.x + nextNode.x) / 2);
            if (nextGimmick.id === 'SKY_BRIDGE_ASCENT') x1 = midX - 8;
            else if (nextGimmick.id === 'GRAND_CHASM_ASCENT') x1 = midX - 32;
            else if (nextGimmick.id === 'HIGH_WALL_VAULT') x1 = midX + 8;
            else if (nextGimmick.id === 'SEALED_DROP_SHAFT' || nextGimmick.id === 'DIAGONAL_ROCK_VEIN') x1 = midX + 24;
            else x1 = midX;
          }
        } else {
          // 우 -> 좌 역방향 (dir = -1)
          if (i === 0) {
            x1 = snap8(clamp(node.x + 44, W - 72, W - 24));
          } else {
            const prevNode = nodes[i - 1];
            const midX = snap8((prevNode.x + node.x) / 2);
            if (prevGimmick.id === 'SKY_BRIDGE_ASCENT') x1 = midX - 8;
            else if (prevGimmick.id === 'GRAND_CHASM_ASCENT') x1 = midX - 32;
            else if (prevGimmick.id === 'HIGH_WALL_VAULT') x1 = midX + 8;
            else if (prevGimmick.id === 'SEALED_DROP_SHAFT' || prevGimmick.id === 'DIAGONAL_ROCK_VEIN') x1 = midX + 32;
            else x1 = midX;
          }

          if (i === K) {
            x0 = snap8(clamp(node.x - 64, 24, node.x - 48));
          } else {
            const nextNode = nodes[i + 1];
            const midX = snap8((node.x + nextNode.x) / 2);
            if (nextGimmick.id === 'SKY_BRIDGE_ASCENT') x0 = midX + 8;
            else if (nextGimmick.id === 'GRAND_CHASM_ASCENT') x0 = midX + 32;
            else if (nextGimmick.id === 'HIGH_WALL_VAULT') x0 = midX - 8;
            else if (nextGimmick.id === 'SEALED_DROP_SHAFT' || nextGimmick.id === 'DIAGONAL_ROCK_VEIN') x0 = midX - 24;
            else x0 = midX;
          }
        }

        const minW = (i === 0) ? 108 : 84;
        if (x1 - x0 < minW) {
          if (outDir === 1) x1 = x0 + minW;
          else x0 = x1 - minW;
        }
        x0 = clamp(x0, 24, W - 108);
        x1 = clamp(x1, x0 + 84, W - 24);

        const slabH = (nextGimmick && nextGimmick.id === 'DIAGONAL_ROCK_VEIN') ? 32 : 24;
        const slab = this.makeSlab(x0, snap8(node.y), x1 - x0, slabH, R, pal, stones);
        nodeSlabs.push(slab);
        slabs.push(slab);
        elements.push(slab);
      }

      // 2) 스폰 구역 안전 벙커 벽 (진행 반대편을 막아 본대 안전 확보 & 역방향 시 자동 턴 유도)
      const startSlab = nodeSlabs[0];
      const startOutDir = getOutDir(0);
      const startWallH = Math.min(80, Math.max(48, startSlab.y - 16));
      elements.push({
        type: 'steelBarrier',
        x: startOutDir === 1 ? startSlab.x : (startSlab.x + startSlab.w - 18),
        y: startSlab.y - startWallH,
        w: 18,
        h: startWallH
      });

      // U턴 모드일 때는 하층(nodeSlabs[3]) 우측에 반전 벽을 세워 좌측으로 턴 유도
      if (flowMode === 'uturn' && nodeSlabs[3]) {
        const lowerTurnSlab = nodeSlabs[3];
        const turnH = Math.min(72, Math.max(48, lowerTurnSlab.y - (nodeSlabs[2].y + nodeSlabs[2].h) - 8));
        if (turnH >= 32) {
          elements.push({
            type: 'steelBarrier',
            x: lowerTurnSlab.x + lowerTurnSlab.w - 18,
            y: lowerTurnSlab.y - turnH,
            w: 18,
            h: turnH
          });
        }
      }

      // 3) 각 기믹별 구조물 배치 (진행 방향 dir=+1 / -1 완벽 지원)
      for (let i = 0; i < K; i++) {
        const g = gimmicks[i];
        const curSlab = nodeSlabs[i];
        const nextSlab = nodeSlabs[i + 1];
        const dir = (flowMode === 'uturn')
          ? (i < 2 ? 1 : -1)
          : getOutDir(i);

        const frontEdgeX = (dir === 1) ? (curSlab.x + curSlab.w) : curSlab.x;

        switch (g.id) {
          case 'HOLDING_CELL_BREACH': {
            const wallW = 34;
            const wallH = 52;
            const wallX = (dir === 1) ? (frontEdgeX - Math.floor(wallW / 2)) : (frontEdgeX - Math.floor(wallW / 2));
            const wallY = curSlab.y - wallH;

            elements.push({
              type: 'rockWall',
              x: wallX, y: wallY, w: wallW, h: wallH, palette: pal
            });

            if (R.chance(0.45)) {
              const capH = Math.max(22, Math.min(54, wallY - 16));
              elements.push({
                type: 'steelBarrier',
                x: wallX - 2, y: wallY - capH, w: wallW + 4, h: capH
              });
            }

            actionUsage.push({ act: 'BASH', count: 1, gimmickId: g.id });
            triggerPoints.push({ x: wallX, y: curSlab.y, skill: 'BASH', timingWeight: g.timingWeight });
            break;
          }

          case 'ARMORED_BULKHEAD': {
            const wallW = 52;
            const wallH = 54;
            const wallX = frontEdgeX - Math.floor(wallW / 2);
            const wallY = curSlab.y - wallH;

            elements.push({
              type: 'rockWall',
              x: wallX, y: wallY, w: wallW, h: wallH, palette: pal
            });

            if (R.chance(0.35)) {
              const capH = Math.max(22, Math.min(50, wallY - 18));
              elements.push({
                type: 'steelBarrier',
                x: wallX - 2, y: wallY - capH, w: wallW + 4, h: capH
              });
            }

            actionUsage.push({ act: 'BOMB', count: 1, gimmickId: g.id });
            triggerPoints.push({ x: wallX, y: curSlab.y, skill: 'BOMB', timingWeight: g.timingWeight });
            break;
          }

          case 'SEALED_DROP_SHAFT': {
            const steelW = 18;
            const steelH = Math.min(64, Math.max(42, curSlab.y - 24));
            const steelX = (dir === 1) ? (frontEdgeX - steelW) : frontEdgeX;
            const steelY = curSlab.y - steelH;

            elements.push({
              type: 'steelBarrier',
              x: steelX, y: steelY, w: steelW, h: steelH
            });

            actionUsage.push({ act: 'DRILL', count: 1, gimmickId: g.id });
            triggerPoints.push({ x: steelX - dir * 12, y: curSlab.y, skill: 'DRILL', timingWeight: g.timingWeight });
            break;
          }

          case 'DIAGONAL_ROCK_VEIN': {
            const wallW = 28;
            const wallH = 48;
            const wallX = (dir === 1) ? (frontEdgeX - wallW) : frontEdgeX;
            const wallY = curSlab.y - wallH;

            elements.push({
              type: 'rockWall',
              x: wallX, y: wallY, w: wallW, h: wallH, palette: pal
            });

            elements.push({
              type: 'steelBarrier',
              x: (dir === 1) ? (wallX + wallW) : (wallX - 16),
              y: wallY - 12,
              w: 16,
              h: wallH + 12
            });

            actionUsage.push({ act: 'MINE', count: 1, gimmickId: g.id });
            triggerPoints.push({ x: wallX - dir * 10, y: curSlab.y, skill: 'MINE', timingWeight: g.timingWeight });
            break;
          }

          case 'HIGH_WALL_VAULT': {
            const stepWallW = 22;
            const stepWallH = Math.max(34, curSlab.y - nextSlab.y + 18);
            const wallX = (dir === 1) ? (frontEdgeX - stepWallW) : frontEdgeX;
            const wallY = curSlab.y - stepWallH;

            elements.push({
              type: 'rockWall',
              x: wallX, y: wallY, w: stepWallW, h: stepWallH, palette: pal
            });

            actionUsage.push({ act: 'CLIMB', count: 1, gimmickId: g.id });
            triggerPoints.push({ x: wallX - dir * 8, y: curSlab.y, skill: 'CLIMB', timingWeight: g.timingWeight });
            break;
          }

          case 'SKY_BRIDGE_ASCENT': {
            const blockX = (dir === 1) ? (nextSlab.x - 2) : (nextSlab.x + nextSlab.w - 14);
            elements.push({
              type: 'steelBarrier',
              x: blockX, y: nextSlab.y + nextSlab.h, w: 16, h: 48
            });

            actionUsage.push({ act: 'BUILD', count: 1, gimmickId: g.id });
            triggerPoints.push({ x: frontEdgeX - dir * 4, y: curSlab.y, skill: 'BUILD', timingWeight: g.timingWeight });
            break;
          }

          case 'GRAND_CHASM_ASCENT': {
            const blockX = (dir === 1) ? (nextSlab.x - 2) : (nextSlab.x + nextSlab.w - 14);
            elements.push({
              type: 'steelBarrier',
              x: blockX, y: nextSlab.y + nextSlab.h, w: 16, h: 56
            });

            actionUsage.push({ act: 'BUILD', count: 2, gimmickId: g.id });
            triggerPoints.push(
              { x: frontEdgeX - dir * 4, y: curSlab.y, skill: 'BUILD', timingWeight: 13 },
              { x: frontEdgeX + dir * 42, y: curSlab.y - 22, skill: 'BUILD', timingWeight: 13 }
            );
            break;
          }
        }
      }

      // 4) 골인 지점 안전 프레임 (진행 방향 끝을 막아 유닛 왕복 유도)
      const goalSlab = nodeSlabs[K];
      const goalOutDir = (flowMode === 'uturn') ? -1 : getOutDir(K);
      const goalWallH = Math.min(80, Math.max(48, goalSlab.y - 16));
      elements.push({
        type: 'steelBarrier',
        x: (goalOutDir === 1) ? (goalSlab.x + goalSlab.w - 18) : goalSlab.x,
        y: goalSlab.y - goalWallH,
        w: 18,
        h: goalWallH
      });

      // 5) 정돈된 상/하단 다해법 연결 브릿지 배치 (너저분한 파편 발판 제거)
      this.injectConnectedAltRoutes(elements, nodeSlabs, gimmicks, diff, R, pal, stones, decoyInfo, altRouteInfo);

      const spawn = {
        x: (startOutDir === 1)
          ? clamp(startSlab.x + 48, startSlab.x + 32, startSlab.x + startSlab.w - 28)
          : clamp(startSlab.x + startSlab.w - 48, startSlab.x + 28, startSlab.x + startSlab.w - 32),
        y: startSlab.y - 36
      };
      const gate = {
        x: (goalOutDir === 1)
          ? clamp(goalSlab.x + goalSlab.w - 46, goalSlab.x + 28, goalSlab.x + goalSlab.w - 28)
          : clamp(goalSlab.x + 46, goalSlab.x + 28, goalSlab.x + goalSlab.w - 28),
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

    /* ================================================================
     * 실질적으로 연결되는 상/하단 다해법 우회 발판 & 전술 함정 배치
     * ==============================================================*/
    static injectConnectedAltRoutes(elements, nodeSlabs, gimmicks, diff, R, pal, stones, decoyInfo, altRouteInfo) {
      const isSafeRect = (rx, ry, rw, rh, ignoreEl = null) => {
        if (rx < 24 || rx + rw > W - 24 || ry < 26 || ry + rh > H - 24) return false;
        for (const s of nodeSlabs) {
          const overlapX = Math.min(rx + rw, s.x + s.w + 18) - Math.max(rx, s.x - 18);
          if (overlapX > 0) {
            if (ry < s.y + s.h + 36 && ry + rh > s.y - 54) return false;
          }
        }
        for (const el of elements) {
          if (el === ignoreEl) continue;
          if (rx < el.x + el.w + 10 && rx + rw > el.x - 10 &&
              ry < el.y + el.h + 32 && ry + rh > el.y - 32) {
            return false;
          }
        }
        return true;
      };

      // 1) 대안 루트: 인접한 두 슬랩(i -> i+1)을 상단 또는 하단으로 우회 연결하는 브릿지 발판
      const targetAlts = diff.altRouteCount || 2;
      for (let i = 0; i < nodeSlabs.length - 1 && altRouteInfo.length < targetAlts; i++) {
        const sA = nodeSlabs[i];
        const sB = nodeSlabs[i + 1];
        const midX = Math.round((sA.x + sA.w + sB.x) / 2);
        const altW = R.irange(95, 130);
        const altH = 20;

        // 상단 우회 발판 시도 (충분한 머리 공간 >= 34px 확보)
        const upperY = Math.min(sA.y, sB.y) - R.irange(56, 72);
        const upperX = clamp(midX - Math.floor(altW / 2), 36, W - altW - 36);
        if (isSafeRect(upperX, upperY, altW, altH)) {
          const altSlab = this.makeSlab(upperX, upperY, altW, altH, R, pal, stones);
          elements.push(altSlab);
          altRouteInfo.push({ x: upperX, y: upperY, w: altW, kind: 'UPPER_BYPASS_BRIDGE' });
          continue;
        }

        // 하단 우회 발판 시도 (DRILL/MINE으로 파고 내려와 BUILD로 복귀 가능, 낙사 높이 <= 80px 준수)
        const lowerY = Math.max(sA.y, sB.y) + R.irange(62, 78);
        const lowerX = clamp(midX - Math.floor(altW / 2), 36, W - altW - 36);
        if (isSafeRect(lowerX, lowerY, altW, altH)) {
          const altSlab = this.makeSlab(lowerX, lowerY, altW, altH, R, pal, stones);
          elements.push(altSlab);
          altRouteInfo.push({ x: lowerX, y: lowerY, w: altW, kind: 'LOWER_UNDERPASS_ROUTE' });
        }
      }
    }

    /* ====================================================================
     * [핵심 개편] 유연한 다해법(Multi-Solution) 스킬 인벤토리 산출
     * - 4개 스킬 각 1개씩만 주던 빈약한 인벤토리 완전 폐기
     * - 정석 필수 스킬 + 실수 복구 여유분 + 대안 해법(CLIMB/BUILD/BLOCK/파괴) 스킬 부여
     * ==================================================================*/
    static calculateSkills(actionUsage, diff, R) {
      const skills = {
        climb: 0, float: 0, bash: 0, mine: 0,
        drill: 0, bomb: 0, build: 0, block: 0, portal: 0
      };

      // 1) 정석 해법에 필요한 기본 횟수 집계
      const reqCount = {};
      for (const item of actionUsage) {
        const k = item.act.toLowerCase();
        const cnt = item.count || 1;
        reqCount[k] = (reqCount[k] || 0) + cnt;
      }

      // 2) 핵심 스킬에 난이도별 여유분(Slack) 부여 (1개만 줘서 억까 나는 현상 방지)
      const spareRange = diff.spareRange || [1, 2];
      for (const k of Object.keys(reqCount)) {
        const required = reqCount[k];
        if (required > 0) {
          let spare = R.irange(spareRange[0], spareRange[1]);
          // BUILD는 1회당 48px밖에 못 가므로 최소 +1~+2개 더 여유 지급
          if (k === 'build') {
            spare = Math.max(spare, diff.key === 'nightmare' ? 1 : 2);
          }
          skills[k] = required + spare;
        }
      }

      // 3) 유연한 다해법을 이끌어내는 필수 전술 보조 스킬 부여
      // - BUILD: 우회/복구/연결의 핵심 만능 스킬 (최소 2~3개 보장)
      const minBuild = diff.key === 'easy' ? 3 : (diff.key === 'nightmare' ? 2 : 3);
      if (skills.build < minBuild) {
        skills.build = minBuild;
      }

      // - CLIMB: 벽을 넘어 상단 루트로 우회할 수 있는 선택지 (최소 1~2개)
      if (skills.climb === 0) {
        skills.climb = diff.key === 'easy' ? 2 : R.irange(1, 2);
      }

      // - BLOCK: 선발대와 본대 분리를 위한 전략 스킬 (1~2개)
      if (skills.block === 0) {
        skills.block = diff.key === 'nightmare' ? 1 : R.irange(1, 2);
      }

      // - 대체 돌파 스킬 (BASH, MINE, DRILL, BOMB 중 미보유 스킬 2~3종 추가 부여)
      const altPool = R.shuffle(['bash', 'mine', 'drill', 'bomb', 'float']);
      const extraTarget = diff.extraSkillTypes || 2;
      let added = 0;
      for (const altSkill of altPool) {
        if (added >= extraTarget) break;
        if (skills[altSkill] === 0) {
          if (altSkill === 'float') {
            skills[altSkill] = R.irange(2, 3);
          } else {
            skills[altSkill] = (diff.key === 'easy') ? 2 : R.irange(1, 2);
          }
          added++;
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

      let rawTimingWeight = 0;
      if (triggers.length > 0) {
        for (const t of triggers) rawTimingWeight += (t.timingWeight || 14);
      } else {
        for (const g of gimmicks) rawTimingWeight += (g.timingWeight || 14);
      }

      let tightTimingBonus = 0;
      for (let i = 1; i < triggers.length; i++) {
        const dist = Math.hypot((triggers[i].x || 0) - (triggers[i - 1].x || 0), (triggers[i].y || 0) - (triggers[i - 1].y || 0));
        if (dist < 140) tightTimingBonus += 8;
        else if (dist < 190) tightTimingBonus += 4;
      }
      const timingCountScore = Math.round(rawTimingWeight * 0.78) + tightTimingBonus;

      let skillTransitions = 0;
      for (let i = 1; i < solution.length; i++) {
        if (solution[i] !== solution[i - 1]) skillTransitions++;
      }
      const routeComplexityBonus = (decoys.length * 4) + (alts.length * 4);
      const comboSynergyScore = (skillTransitions * 9) + routeComplexityBonus;

      const diffKey = candidate.difficulty || 'normal';
      const diffFloor = diffKey === 'nightmare' ? 112 : (diffKey === 'hard' ? 88 : (diffKey === 'normal' ? 62 : 38));
      const score = clamp(Math.round(Math.max(diffFloor, sequenceLengthScore * 0.40 + timingCountScore * 0.36 + comboSynergyScore * 0.24 + (sequenceLength * 6))), 30, 175);

      return {
        score,
        factors: {
          timingCount: clamp(timingCountScore, 0, 100),
          sequenceLength: clamp(sequenceLengthScore, 0, 100),
          comboSynergy: clamp(comboSynergyScore, 0, 100),
          gimmickCount: gimmicks.length,
          decoyBranches: decoys.length,
          altRoutes: alts.length,
          uniqueSkills: uniqueSkillCount,
          skillTransitions
        }
      };
    }

    static calculateDynamicTimeLimit(solutionDna, diffKey) {
      const spec = this.resolveDifficulty(diffKey);
      const baseTime = 45 + (solutionDna.length * 20);
      return clamp(Math.round(baseTime * spec.timeMultiplier), 95, 250);
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
      const spawnGround = elements.some(e =>
        slabTypes.has(e.type) && spawn.x >= e.x + 8 && spawn.x <= e.x + e.w - 8 &&
        e.y > spawn.y && e.y - spawn.y <= 60
      );
      if (!spawnGround) return { valid: false, reason: 'No ground under spawn' };

      const gateGround = elements.some(e =>
        slabTypes.has(e.type) && gate.x >= e.x + 8 && gate.x <= e.x + e.w - 8 &&
        e.y > gate.y && e.y - gate.y <= 46
      );
      if (!gateGround) return { valid: false, reason: 'No ground under gate' };

      for (let i = 0; i < elements.length; i++) {
        const e1 = elements[i];
        if (!slabTypes.has(e1.type)) continue;
        for (let j = i + 1; j < elements.length; j++) {
          const e2 = elements[j];
          if (!slabTypes.has(e2.type)) continue;
          const overlapX = Math.min(e1.x + e1.w, e2.x + e2.w) - Math.max(e1.x, e2.x);
          if (overlapX > 0) {
            const topE = e1.y < e2.y ? e1 : e2;
            const botE = e1.y < e2.y ? e2 : e1;
            const gap = botE.y - (topE.y + topE.h);
            if (gap >= 0 && gap < 28) {
              return { valid: false, reason: 'Insufficient headroom between overlapping slabs' };
            }
          }
        }
      }

      return { valid: true };
    }

    /* ==================================================================
     * 정밀 군단 물리 시뮬레이터 (실제 NanoUnit.js 물리 1:1 반영)
     * - 10마리 군단 동시 시뮬레이션
     * - BOMB 사용 시 시뮬레이터에서도 유닛 1마리 자폭 사망 정확히 반영
     * - CLIMB / BASH / DRILL / MINE / BUILD / FLOAT 물리 반영
     * - 0-스킬(방치) 클리어 불가 검증 + 정석 해법 needPercent 달성 검증
     * ================================================================*/
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
        const carveCircle = (cx, cy, radius) => {
          const r2 = radius * radius;
          const x0 = Math.max(0, Math.floor(cx - radius));
          const y0 = Math.max(0, Math.floor(cy - radius));
          const x1 = Math.min(W, Math.ceil(cx + radius));
          const y1 = Math.min(H, Math.ceil(cy + radius));
          for (let y = y0; y < y1; y++) {
            const dy = y - cy;
            const row = y * W;
            for (let x = x0; x < x1; x++) {
              const dx = x - cx;
              if (dx * dx + dy * dy <= r2 && grid[row + x] === 1) {
                grid[row + x] = 0;
              }
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

        for (let tick = 0; tick < 3400; tick++) {
          if (solverCooldown > 0) solverCooldown--;

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
              const bashX = scout.dir > 0 ? (aheadX - 6) : (aheadX - 48 + 6);
              carveRect(bashX, scout.y - 26, 48, 26);
              stepIdx++;
              solverCooldown = 28;
            } else if (curr.act === 'BOMB' && isSolidAhead && !isSteelAhead) {
              // 실제 게임과 동일: BOMB는 유닛 1명 자폭 사망 + 반경 32px 원형 파괴
              carveCircle(scout.x + scout.dir * 14, scout.y - 12, 32);
              scout.alive = false;
              dead++;
              stepIdx++;
              solverCooldown = 32;
            } else if (curr.act === 'CLIMB' && isSolidAhead && !isSteelAhead) {
              // 벽 위로 등반
              let topY = scout.y;
              while (isSolid(aheadX, topY - 1) && topY > 14) topY--;
              if (!isSolid(aheadX, topY - 12)) {
                scout.x = aheadX + scout.dir * 6;
                scout.y = topY - 1;
                scout.fallDist = 0;
              }
              stepIdx++;
              solverCooldown = 26;
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
            if (!u.alive || u.escaped) continue;
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
              u.vy = u.floating ? 0.85 : Math.min(3.6, u.vy + 0.15);
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

      // 1) 무조작(0-스킬) 클리어 불가 검증
      const zeroSkillRun = runPhysicsTrial([], false);
      if (zeroSkillRun.rescued > 0) {
        return {
          success: false,
          rescued: 0,
          total: 10,
          dead: 10,
          reason: '무조작 클리어 가능(병목 누수 발견)'
        };
      }

      // 2) 단일 스킬 1회 날먹 방지 검증
      const singleSkillCheeseList = [
        [{ act: 'BASH', count: 1 }],
        [{ act: 'DRILL', count: 1 }],
        [{ act: 'BUILD', count: 1 }],
        [{ act: 'MINE', count: 1 }],
        [{ act: 'CLIMB', count: 1 }]
      ];
      for (const cheeseAct of singleSkillCheeseList) {
        const cheeseRun = runPhysicsTrial(cheeseAct, false);
        if (cheeseRun.rescued >= 5) {
          return {
            success: false,
            rescued: 0,
            total: 10,
            dead: 10,
            reason: `단일 스킬(${cheeseAct[0].act}) 날먹 가능 판정으로 폐기`
          };
        }
      }

      // 3) 정석 해법(Golden Path) 풀 군단 시뮬레이션 검증
      const goldenActions = (map._layoutData && map._layoutData.actionUsage)
        ? map._layoutData.actionUsage
        : (map.solutionDna || []).map(act => ({ act, count: 1 }));
      const goldenRun = runPhysicsTrial(goldenActions, true);
      const requiredRescued = Math.ceil((10 * (map.needPercent || 65)) / 100);
      const allStepsUsed = goldenRun.stepsCompleted >= goldenActions.length;
      const isSuccess = allStepsUsed && (goldenRun.rescued >= requiredRescued);

      return {
        success: isSuccess,
        rescued: goldenRun.rescued,
        total: goldenRun.total,
        dead: goldenRun.dead,
        reason: isSuccess
          ? `군단 물리 검증 통과 (${goldenRun.rescued}/${goldenRun.total} 구출, 목표 ${requiredRescued}명 이상)`
          : `군단 물리 검증 미달 (${goldenRun.rescued}/${goldenRun.total} 구출, 기믹 ${goldenRun.stepsCompleted}/${goldenActions.length})`
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
          { index: 0, role: 'start', x: 75,  y: 130 },
          { index: 1, role: 'mid',   x: 230, y: 130 },
          { index: 2, role: 'mid',   x: 390, y: 196 },
          { index: 3, role: 'mid',   x: 545, y: 176 },
          { index: 4, role: 'goal',  x: 700, y: 242 }
        ],
        gimmicks: [
          { index: 0, ...GIMMICK_CATALOG.HOLDING_CELL_BREACH, skills: GIMMICK_CATALOG.HOLDING_CELL_BREACH.skills.slice(), dy: 0 },
          { index: 1, ...GIMMICK_CATALOG.SEALED_DROP_SHAFT,   skills: GIMMICK_CATALOG.SEALED_DROP_SHAFT.skills.slice(), dy: 66 },
          { index: 2, ...GIMMICK_CATALOG.SKY_BRIDGE_ASCENT,   skills: GIMMICK_CATALOG.SKY_BRIDGE_ASCENT.skills.slice(), dy: -20 },
          { index: 3, ...GIMMICK_CATALOG.DIAGONAL_ROCK_VEIN,  skills: GIMMICK_CATALOG.DIAGONAL_ROCK_VEIN.skills.slice(), dy: 66 }
        ]
      };

      const layoutResult = this.buildMultiRoutePuzzleLayout(chainPlan, 'cascade', diff, R, palette, stoneTypes);
      const skills = this.calculateSkills(layoutResult.actionUsage, diff, R);
      const timeLimit = this.calculateDynamicTimeLimit(layoutResult.solution, diff.key);

      const titleWord = R.pick(SECTOR_NAMES);
      const title = `[${diff.name}] ${titleWord} (MULTI-SOLUTION)`;

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
        spawnX: layoutResult.spawn.x,
        spawnY: layoutResult.spawn.y,
        gateX: layoutResult.gate.x,
        gateY: layoutResult.gate.y,
        skills,
        elements: layoutResult.elements,
        solutionDna: layoutResult.solution,
        difficultyScore: 0,
        difficultyFactors: {},
        layoutType: 'cascade',
        _layoutData: layoutResult,
        _meta: {
          seed,
          archetype: 'cascade',
          difficulty: diff.name,
          gimmickChain: chainPlan.gimmicks.map(g => g.id),
          timingCount: layoutResult.triggerPoints.length,
          sequenceLength: layoutResult.solution.length,
          fallback: true,
          simVerified: true
        }
      };

      const scoreObj = this.calculateDifficultyScore(candidate);
      candidate.difficultyScore = scoreObj.score;
      candidate.difficultyFactors = scoreObj.factors;
      candidate.desc = `[CASCADE] 유연한 다해법 퍼즐 구역. (난이도: ${diff.name}, 점수: ${candidate.difficultyScore}pt, 정석 시퀀스: ${candidate.solutionDna.join(' → ')})`;
      delete candidate._layoutData;

      return candidate;
    }

    static generate(options = {}) {
      const MAX_RETRIES = 55;

      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        const seed = options.seed != null
          ? ((options.seed + attempt * 7919) >>> 0)
          : ((((Math.random() * 1e9) | 0) ^ (Date.now() & 0x7fffffff) ^ (attempt * 104729)) >>> 0);

        const rawRNG = makeRNG(seed);
        const R = makeRNGHelpers(rawRNG);

        const diff = this.resolveDifficulty(options.difficulty);
        const { palette, theme, stoneTypes } = this.resolvePaletteAndTheme(options, R);
        const archetype = this.pickArchetype(options.layout, R);

        const numGimmicks = R.irange(diff.gimmickRange[0], diff.gimmickRange[1]);
        const flowMode = this.pickFlowMode(archetype, R);
        const anchors = this.lockStartAndGoalAnchors(archetype, numGimmicks, R, flowMode);
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
          spawnX: layoutResult.spawn.x,
          spawnY: layoutResult.spawn.y,
          gateX: layoutResult.gate.x,
          gateY: layoutResult.gate.y,
          skills,
          elements: layoutResult.elements,
          solutionDna: layoutResult.solution,
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
        candidate.desc = `[${archetype.toUpperCase()}] 유연한 다해법 퍼즐 구역. (난이도: ${diff.name}, 점수: ${candidate.difficultyScore}pt, 정석 시퀀스: ${layoutResult.solution.join(' → ')})`;

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
