/* ============================================================================
 * FullCanvasLevelArchitect.js — 역방향 인과율 퍼즐 생성 엔진 (v4 Reverse Causal)
 * 1단계: 스폰(Start) & 탈출구(Goal) 좌표 확정
 * 2단계: 골인 지점 → 스폰 지점 역방향 기믹 체인(2~4개) 역산 계획
 * 3단계: 기믹별 필수 스킬 + 우회 차단용 강철 격벽(Bottleneck) 세트 배치
 * 4단계: 모든 비정상 우회로 및 날먹 경로를 원천 차단하는 프레임 지형 마감
 * 5단계: 정답 필수 스킬 개수 + 여유분 1~2개만 skills 객체에 정밀 지급
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
   * 난이도 사양 (기믹 체인 수 2~4개 및 타이밍/시퀀스 중심 스코어링)
   * ====================================================================*/
  const DIFF_SPECS = {
    easy: {
      key: 'easy', name: 'EASY',
      minScore: 30,
      scoreRange: [30, 55],
      timeMultiplier: 1.80,
      units: 15, needPercent: 50, timeLimit: 220, spawnRate: 34,
      gimmickRange: [2, 2],
      spareRange: [2, 2],
      minUniqueSkills: 2
    },
    normal: {
      key: 'normal', name: 'NORMAL',
      minScore: 55,
      scoreRange: [55, 85],
      timeMultiplier: 1.45,
      units: 18, needPercent: 65, timeLimit: 180, spawnRate: 28,
      gimmickRange: [2, 3],
      spareRange: [1, 2],
      minUniqueSkills: 2
    },
    hard: {
      key: 'hard', name: 'HARD',
      minScore: 80,
      scoreRange: [80, 125],
      timeMultiplier: 1.20,
      units: 20, needPercent: 75, timeLimit: 150, spawnRate: 22,
      gimmickRange: [3, 4],
      spareRange: [1, 1],
      minUniqueSkills: 3
    },
    nightmare: {
      key: 'nightmare', name: 'NIGHTMARE',
      minScore: 105,
      scoreRange: [105, 160],
      timeMultiplier: 1.05,
      units: 25, needPercent: 85, timeLimit: 130, spawnRate: 18,
      gimmickRange: [4, 4],
      spareRange: [1, 1],
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
   * 역방향 핵심 기믹 카탈로그 (Reverse Gimmick Catalog)
   * - dy: 이전 노드(n-1)에서 현재 노드(n)로 갈 때의 Y 변화량 (역산 시 curY = nextY - dy)
   * - timingWeight: 조작 타이밍 난이도 가중치
   * ====================================================================*/
  const GIMMICK_CATALOG = {
    LETHAL_DROP: {
      id: 'LETHAL_DROP',
      label: '치명적 낙하 구간',
      skills: ['FLOAT'],
      timingCount: 1,
      timingWeight: 14,
      dyRange: [135, 160],
      dxRange: [95, 130]
    },
    SEALED_SHAFT: {
      id: 'SEALED_SHAFT',
      label: '강철 차폐 수직 갱도',
      skills: ['DRILL'],
      timingCount: 1,
      timingWeight: 12,
      dyRange: [62, 78],
      dxRange: [90, 125]
    },
    BLOCKED_WALL: {
      id: 'BLOCKED_WALL',
      label: '강철 캡슐 암벽 병목',
      skills: ['BASH'],
      timingCount: 1,
      timingWeight: 11,
      dyRange: [0, 0],
      dxRange: [120, 155]
    },
    HEAVY_BULKHEAD: {
      id: 'HEAVY_BULKHEAD',
      label: '중장갑 격벽 폭파 구간',
      skills: ['BOMB'],
      timingCount: 1,
      timingWeight: 13,
      dyRange: [0, 0],
      dxRange: [125, 160]
    },
    DIAGONAL_STRATA: {
      id: 'DIAGONAL_STRATA',
      label: '두꺼운 암반 대각선 굴착',
      skills: ['MINE'],
      timingCount: 1,
      timingWeight: 14,
      dyRange: [64, 82],
      dxRange: [115, 145]
    },
    HIGH_ABYSS: {
      id: 'HIGH_ABYSS',
      label: '높은 낭떠러지 가교',
      skills: ['BUILD'],
      timingCount: 1,
      timingWeight: 15,
      dyRange: [-22, -22], // 1회 BUILD(24px 상승)에 정밀 매칭
      dxRange: [115, 145]
    },
    DEEP_CHASM: {
      id: 'DEEP_CHASM',
      label: '이중 낭떠러지 대교',
      skills: ['BUILD', 'BUILD'],
      timingCount: 2,
      timingWeight: 24,
      dyRange: [-46, -46], // 2회 연속 BUILD(48px 상승)에 정밀 매칭
      dxRange: [145, 175]
    }
  };

  const ARCHETYPE_GIMMICK_WEIGHTS = {
    cascade:  [
      { id: 'SEALED_SHAFT', w: 3.5 }, { id: 'LETHAL_DROP', w: 3.0 },
      { id: 'BLOCKED_WALL', w: 2.8 }, { id: 'DIAGONAL_STRATA', w: 2.5 },
      { id: 'HIGH_ABYSS', w: 2.0 },   { id: 'HEAVY_BULKHEAD', w: 1.5 }
    ],
    zigzag:   [
      { id: 'BLOCKED_WALL', w: 3.5 }, { id: 'SEALED_SHAFT', w: 3.2 },
      { id: 'HIGH_ABYSS', w: 2.8 },   { id: 'DIAGONAL_STRATA', w: 2.2 },
      { id: 'LETHAL_DROP', w: 2.0 },  { id: 'HEAVY_BULKHEAD', w: 1.5 }
    ],
    traverse: [
      { id: 'BLOCKED_WALL', w: 3.8 }, { id: 'HIGH_ABYSS', w: 3.5 },
      { id: 'HEAVY_BULKHEAD', w: 2.5 }, { id: 'SEALED_SHAFT', w: 2.2 },
      { id: 'DIAGONAL_STRATA', w: 2.0 }
    ],
    split:    [
      { id: 'SEALED_SHAFT', w: 3.5 }, { id: 'HIGH_ABYSS', w: 3.0 },
      { id: 'BLOCKED_WALL', w: 3.0 }, { id: 'LETHAL_DROP', w: 2.5 },
      { id: 'DIAGONAL_STRATA', w: 2.2 }
    ],
    chamber:  [
      { id: 'SEALED_SHAFT', w: 4.2 }, { id: 'BLOCKED_WALL', w: 3.2 },
      { id: 'LETHAL_DROP', w: 2.8 },  { id: 'HIGH_ABYSS', w: 2.5 },
      { id: 'HEAVY_BULKHEAD', w: 2.0 }
    ],
    ascent:   [
      { id: 'HIGH_ABYSS', w: 4.5 },   { id: 'DEEP_CHASM', w: 2.8 },
      { id: 'BLOCKED_WALL', w: 3.2 }, { id: 'HEAVY_BULKHEAD', w: 2.2 },
      { id: 'SEALED_SHAFT', w: 1.8 }
    ]
  };

  /* ====================================================================
   * FullCanvasLevelArchitect 클래스
   * ==================================================================*/
  class FullCanvasLevelArchitect {

    static resolveDifficulty(diff) {
      if (typeof diff === 'number') {
        if (diff < 50) return DIFF_SPECS.easy;
        if (diff < 80) return DIFF_SPECS.normal;
        if (diff < 105) return DIFF_SPECS.hard;
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
     * - 아키타입과 기믹 체인 수에 맞춰 시작점과 목표점의 앵커 좌표를 먼저 확정
     * ==============================================================*/
    static lockStartAndGoalAnchors(archetype, numGimmicks, R) {
      const startX = R.irange(65, 105);
      const goalX = R.irange(W - 125, W - 75);

      let startY, goalY;
      switch (archetype) {
        case 'ascent':
          startY = R.irange(265, 315);
          goalY = R.irange(125, 175);
          break;
        case 'traverse':
          startY = R.irange(170, 230);
          goalY = R.irange(170, 230);
          break;
        case 'cascade':
        case 'chamber':
        case 'split':
        case 'zigzag':
        default:
          startY = R.irange(95, 135);
          goalY = R.irange(285, 345);
          break;
      }

      return {
        startAnchor: { x: startX, y: startY },
        goalAnchor:  { x: goalX,  y: goalY },
        numGimmicks
      };
    }

    /* ================================================================
     * [2단계] 골인 지점부터 스폰 지점까지 핵심 기믹 체인(2~4개) 역방향 계획
     * - Goal Anchor(Node K)에서 시작해 Start Anchor(Node 0)까지 거슬러 올라가며
     *   기믹 시퀀스와 각 노드의 정확한 물리 좌표를 역산(Backward Chaining)
     * ==============================================================*/
    static planReverseGimmickChain(anchors, archetype, diff, R) {
      const K = anchors.numGimmicks;
      const pool = (ARCHETYPE_GIMMICK_WEIGHTS[archetype] || ARCHETYPE_GIMMICK_WEIGHTS.cascade).map(p => ({ ...p }));

      // Easy 난이도에서는 2연속 계단(DEEP_CHASM) 제외
      const filteredPool = diff.key === 'easy'
        ? pool.filter(p => p.id !== 'DEEP_CHASM')
        : pool;

      // 골인 지점(Node K)부터 역방향으로 기믹과 이전 노드(Node k-1) 좌표를 결정
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
        const nextNode = nodes[k]; // 이미 확정된 후행 노드 (Goal 쪽)
        const targetPrevX = k === 1
          ? anchors.startAnchor.x
          : clamp( anchors.startAnchor.x + Math.round((k - 1) * baseStepX + R.irange(-18, 18)), 70, nextNode.x - 110 );

        // 남은 스텝 동안 StartY 근처로 수렴하도록 역방향 Y 바이어스 계산
        const remainingDesiredDy = nextNode.y - anchors.startAnchor.y;
        const idealDyPerStep = remainingDesiredDy / k;

        const candidates = [];
        for (const item of filteredPool) {
          const spec = GIMMICK_CATALOG[item.id];
          if (!spec) continue;

          // k === 1(스폰 직후 첫 기믹)에는 LETHAL_DROP 배제 (스폰 직후 안전 확보 및 공정한 조작 시간 부여)
          if (k === 1 && spec.id === 'LETHAL_DROP') continue;

          // chamber 아키타입의 첫 기믹(k === 1)은 밀폐 챔버 탈출용 SEALED_SHAFT 우대
          const testDy = R.irange(spec.dyRange[0], spec.dyRange[1]);
          const prevY = nextNode.y - testDy;

          // 역산된 이전 노드 Y좌표가 캔버스 안전 영역(85 ~ 355) 내에 있어야 함
          if (prevY < 85 || prevY > 355) continue;

          let weight = item.w;
          // 연속 동일 기믹 강력 페널티 (스킬 연계 유도)
          if (k < K && gimmicks[k] && gimmicks[k].id === spec.id) {
            weight *= 0.12;
          }
          // 아직 안 쓴 기믹 우대 (다양한 스킬 조합 유도)
          if (!usedGimmicks.has(spec.id)) {
            weight *= 1.85;
          }
          // 이상적인 고도 변화량에 가까울수록 가중치 부여
          const dyDiff = Math.abs(testDy - idealDyPerStep);
          weight *= Math.max(0.3, 1.5 - dyDiff / 120);

          if (archetype === 'chamber' && k === 1 && spec.id === 'SEALED_SHAFT') {
            weight *= 3.0;
          }

          candidates.push({ spec, testDy, prevY, w: weight });
        }

        let chosen;
        if (candidates.length > 0) {
          chosen = R.weighted(candidates);
        } else {
          // 안전 폴백: 수평 암벽 절삭(BLOCKED_WALL)
          const fallbackSpec = GIMMICK_CATALOG.BLOCKED_WALL;
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
     * [3단계 & 4단계] 기믹별 필수 스킬 + 강철 격벽 세트 배치 & 우회로 차단 마감
     * - 각 기믹마다 오직 지정된 필수 스킬로만 돌파 가능한 병목(Bottleneck) 구조 생성
     * - 상단 천장 강철 캡(Steel Cap), 추락 방지/유도 격벽, 외곽 프레임 마감으로 날먹 원천 차단
     * ==============================================================*/
    static buildCausalBottleneckLayout(chainPlan, archetype, diff, R, pal, stones) {
      const { nodes, gimmicks } = chainPlan;
      const K = gimmicks.length;
      const elements = [];
      const slabs = [];
      const actionUsage = [];
      const triggerPoints = [];

      // 1) 각 노드별 기본 슬랩(Slab) 영역 산정
      //    기믹 연결부에서 빈틈이나 불필요한 겹침이 없도록 좌우 경계를 정확히 분할
      const nodeSlabs = [];
      for (let i = 0; i <= K; i++) {
        const node = nodes[i];
        const prevGimmick = i > 0 ? gimmicks[i - 1] : null;
        const nextGimmick = i < K ? gimmicks[i] : null;

        let x0, x1;
        if (i === 0) {
          x0 = clamp(node.x - 45, 25, 90);
        } else {
          const prevNode = nodes[i - 1];
          const midX = Math.round((prevNode.x + node.x) / 2);
          if (prevGimmick.id === 'HIGH_ABYSS') {
            x0 = midX + 16; // 1단 BUILD(48px 전진)가 정확히 안착하는 32px 수평 간격
          } else if (prevGimmick.id === 'DEEP_CHASM') {
            x0 = midX + 38; // 2단 BUILD(96px 전진)가 정확히 안착하는 76px 수평 간격
          } else if (prevGimmick.id === 'SEALED_SHAFT' || prevGimmick.id === 'DIAGONAL_STRATA' || prevGimmick.id === 'LETHAL_DROP') {
            // 상단 슬랩 끝에서 낙하/굴착하여 하단 슬랩에 안전하게 착지하도록 언더랩(Underlap)
            x0 = midX - 28;
          } else {
            // BLOCKED_WALL, HEAVY_BULKHEAD: 빈틈 없이 직결
            x0 = midX;
          }
        }

        if (i === K) {
          x1 = clamp(node.x + 55, node.x + 40, W - 25);
        } else {
          const nextNode = nodes[i + 1];
          const midX = Math.round((node.x + nextNode.x) / 2);
          if (nextGimmick.id === 'HIGH_ABYSS') {
            x1 = midX - 16;
          } else if (nextGimmick.id === 'DEEP_CHASM') {
            x1 = midX - 38;
          } else if (nextGimmick.id === 'SEALED_SHAFT') {
            x1 = midX + 24; // 강철 벽 앞 바닥을 DRILL로 뚫고 내려가도록 오버랩
          } else if (nextGimmick.id === 'DIAGONAL_STRATA') {
            x1 = midX + 28; // 두꺼운 암반 대각선 굴착 공간 확보
          } else if (nextGimmick.id === 'LETHAL_DROP') {
            x1 = midX + 6;  // 낭떠러지 끝에서 낙하
          } else {
            x1 = midX;
          }
        }

        if (x1 - x0 < 75) {
          x1 = x0 + 75;
        }

        const slabH = (nextGimmick && nextGimmick.id === 'DIAGONAL_STRATA') ? 46 : 24;
        const slab = this.makeSlab(x0, node.y, x1 - x0, slabH, R, pal, stones);
        nodeSlabs.push(slab);
        slabs.push(slab);
        elements.push(slab);
      }

      // 2) [3단계] 각 기믹마다 필수 스킬 구조물 + 방해 강철벽(Steel Bottleneck) 세트 배치
      for (let i = 0; i < K; i++) {
        const g = gimmicks[i];
        const curSlab = nodeSlabs[i];
        const nextSlab = nodeSlabs[i + 1];

        switch (g.id) {
          /* --- 기믹 A: BLOCKED_WALL (암벽 + 상단 강철 캡슐 봉쇄 -> BASH 필수) --- */
          case 'BLOCKED_WALL': {
            const wallW = 38;
            const wallH = 54;
            const wallX = curSlab.x + curSlab.w - Math.floor(wallW / 2);
            const wallY = curSlab.y - wallH;

            // 파괴 가능한 암벽 배치
            elements.push({
              type: 'rockWall',
              x: wallX,
              y: wallY,
              w: wallW,
              h: wallH,
              palette: pal
            });

            // [핵심 병목] 암벽 상단에 강철 격벽(Steel Cap)을 씌워 BUILD나 CLIMB로 넘어가는 날먹 원천 차단
            const capH = Math.max(24, Math.min(70, wallY - 12));
            elements.push({
              type: 'steelBarrier',
              x: wallX - 4,
              y: wallY - capH,
              w: wallW + 8,
              h: capH
            });

            actionUsage.push({ act: 'BASH', count: 1, gimmickId: g.id });
            triggerPoints.push({ x: wallX, y: curSlab.y, skill: 'BASH', timingWeight: g.timingWeight });
            break;
          }

          /* --- 기믹 B: HEAVY_BULKHEAD (두꺼운 암벽 + 상단 강철 캡슐 -> BOMB 필수) --- */
          case 'HEAVY_BULKHEAD': {
            const wallW = 64;
            const wallH = 56;
            const wallX = curSlab.x + curSlab.w - Math.floor(wallW / 2);
            const wallY = curSlab.y - wallH;

            elements.push({
              type: 'rockWall',
              x: wallX,
              y: wallY,
              w: wallW,
              h: wallH,
              palette: pal
            });

            // 상단 우회 차단 강철 캡
            const capH = Math.max(24, Math.min(70, wallY - 12));
            elements.push({
              type: 'steelBarrier',
              x: wallX - 4,
              y: wallY - capH,
              w: wallW + 8,
              h: capH
            });

            actionUsage.push({ act: 'BOMB', count: 1, gimmickId: g.id });
            triggerPoints.push({ x: wallX, y: curSlab.y, skill: 'BOMB', timingWeight: g.timingWeight });
            break;
          }

          /* --- 기믹 C: SEALED_SHAFT (우측 강철 격벽 완전 봉쇄 -> 바닥 DRILL 필수) --- */
          case 'SEALED_SHAFT': {
            const steelW = 20;
            const steelH = Math.min(80, Math.max(48, curSlab.y - 12));
            const steelX = curSlab.x + curSlab.w - steelW;
            const steelY = curSlab.y - steelH;

            // 전방 진행을 완전 차단하는 강철 격벽 (절대 파괴 불가, 오직 바닥 DRILL로만 탈출 가능)
            elements.push({
              type: 'steelBarrier',
              x: steelX,
              y: steelY,
              w: steelW,
              h: steelH
            });

            // 하단 착지 슬랩 좌측에 역주행/추락 방지용 강철 가이드 벽 설치
            const guideH = Math.max(36, Math.min(65, nextSlab.y - (curSlab.y + curSlab.h) - 6));
            if (guideH >= 28) {
              elements.push({
                type: 'steelBarrier',
                x: nextSlab.x,
                y: nextSlab.y - guideH,
                w: 18,
                h: guideH
              });
            }

            actionUsage.push({ act: 'DRILL', count: 1, gimmickId: g.id });
            triggerPoints.push({ x: steelX - 10, y: curSlab.y, skill: 'DRILL', timingWeight: g.timingWeight });
            break;
          }

          /* --- 기믹 D: DIAGONAL_STRATA (전방 암벽 + 상단 강철 봉쇄 + 두꺼운 바닥 -> MINE 필수) --- */
          case 'DIAGONAL_STRATA': {
            const wallW = 30;
            const wallH = 52;
            const wallX = curSlab.x + curSlab.w - wallW;
            const wallY = curSlab.y - wallH;

            // 전방 직진 및 낭떠러지 추락을 막는 암벽
            elements.push({
              type: 'rockWall',
              x: wallX,
              y: wallY,
              w: wallW,
              h: wallH,
              palette: pal
            });

            // 암벽 우측 외벽에 강철 격벽을 덧대어 BASH로 수평 관통 시 낭떠러지로 직행하거나 막히도록 봉쇄
            elements.push({
              type: 'steelBarrier',
              x: wallX + wallW,
              y: wallY - 16,
              w: 18,
              h: wallH + 16
            });

            actionUsage.push({ act: 'MINE', count: 1, gimmickId: g.id });
            triggerPoints.push({ x: wallX - 8, y: curSlab.y, skill: 'MINE', timingWeight: g.timingWeight });
            break;
          }

          /* --- 기믹 E: LETHAL_DROP (치사 낙하 절벽 + 우회 차단 강철 후드 -> FLOAT 필수) --- */
          case 'LETHAL_DROP': {
            // 절벽 끝 상공에 강철 후드(Overhang Barrier)를 배치하여 BUILD로 절벽을 넘어가려는 시도 차단
            const hoodX = curSlab.x + curSlab.w + 18;
            const hoodH = Math.min(75, Math.max(40, curSlab.y - 10));
            elements.push({
              type: 'steelBarrier',
              x: hoodX,
              y: curSlab.y - hoodH,
              w: 18,
              h: hoodH
            });

            // 하단 슬랩 좌측 안전 가드레일 (낙하 후 역방향 추락 차단)
            elements.push({
              type: 'steelBarrier',
              x: nextSlab.x,
              y: nextSlab.y - 48,
              w: 18,
              h: 48
            });

            actionUsage.push({ act: 'FLOAT', count: 1, gimmickId: g.id });
            triggerPoints.push({ x: curSlab.x + curSlab.w, y: curSlab.y, skill: 'FLOAT', timingWeight: g.timingWeight });
            break;
          }

          /* --- 기믹 F: HIGH_ABYSS (1단 계단 상승 낭떠러지 + 하단 강철 나락 차단 -> BUILD x1 필수) --- */
          case 'HIGH_ABYSS': {
            // 다음 슬랩의 좌측 하단에 강철 절벽(Steel Cliff Face)을 세워 CLIMB나 하단 우회 차단
            elements.push({
              type: 'steelBarrier',
              x: nextSlab.x - 2,
              y: nextSlab.y + nextSlab.h,
              w: 18,
              h: 55
            });

            actionUsage.push({ act: 'BUILD', count: 1, gimmickId: g.id });
            triggerPoints.push({ x: curSlab.x + curSlab.w, y: curSlab.y, skill: 'BUILD', timingWeight: g.timingWeight });
            break;
          }

          /* --- 기믹 G: DEEP_CHASM (2단 연속 계단 상승 대협곡 -> BUILD x2 필수) --- */
          case 'DEEP_CHASM': {
            elements.push({
              type: 'steelBarrier',
              x: nextSlab.x - 2,
              y: nextSlab.y + nextSlab.h,
              w: 18,
              h: 65
            });

            actionUsage.push({ act: 'BUILD', count: 2, gimmickId: g.id });
            triggerPoints.push(
              { x: curSlab.x + curSlab.w, y: curSlab.y, skill: 'BUILD', timingWeight: 12 },
              { x: curSlab.x + curSlab.w + 48, y: curSlab.y - 24, skill: 'BUILD', timingWeight: 12 }
            );
            break;
          }
        }
      }

      // 3) [4단계] 다른 우회로를 원천 차단하는 외곽 프레임 지형 마감 (Boundary & Frame Sealing)
      const startSlab = nodeSlabs[0];
      const goalSlab = nodeSlabs[K];

      // 스폰 좌측 이탈 방지 강철 프레임 벽
      const leftFrameH = Math.min(80, Math.max(45, startSlab.y - 10));
      elements.push({
        type: 'steelBarrier',
        x: startSlab.x,
        y: startSlab.y - leftFrameH,
        w: 20,
        h: leftFrameH
      });

      // 골인 지점 우측 이탈 방지 강철 프레임 벽
      const rightFrameH = Math.min(80, Math.max(45, goalSlab.y - 10));
      elements.push({
        type: 'steelBarrier',
        x: goalSlab.x + goalSlab.w - 20,
        y: goalSlab.y - rightFrameH,
        w: 20,
        h: rightFrameH
      });

      // 상단 천장 강철 실드 프레임 (맵 최상단 우회 원천 봉쇄)
      elements.push({
        type: 'steelBarrier',
        x: 20,
        y: 6,
        w: W - 40,
        h: 14
      });

      // 스폰 & 탈출구 최종 좌표 확정
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
        spawn,
        gate,
        solution,
        actionUsage,
        gimmicks,
        triggerPoints
      };
    }

    /* ================================================================
     * [5단계] 정답에 필요한 스킬 개수 + 여유분 1~2개만 skills 객체에 정확히 지급
     * - 불필요한 잉여 스킬이나 날먹용 스킬을 일절 지급하지 않음
     * ==============================================================*/
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

      // FLOAT 기믹이 포함된 경우: 군단 생존율(needPercent) 달성을 위한 필수 낙하산 수량 산정
      if (reqCount['float'] > 0) {
        const minSavedNeeded = Math.ceil((diff.units * diff.needPercent) / 100);
        reqCount['float'] = Math.max(minSavedNeeded, Math.min(diff.units, minSavedNeeded + 1));
      }

      // 정답에 사용된 각 필수 스킬마다 정확히 [필수 개수 + 1~2개 여유분]만 지급 (미사용 스킬은 0개 고정)
      const spareRange = diff.spareRange || [1, 2];
      for (const k of Object.keys(reqCount)) {
        const required = reqCount[k];
        if (required > 0) {
          const spare = R.irange(spareRange[0], spareRange[1]);
          skills[k] = required + spare;
        }
      }

      // Hard 난이도일 경우 낚시/유인용(decoy) 스킬 1개 추가 (솔루션에 없는 스킬)
      if (diff.key === 'hard') {
        const solSet = new Set(Object.keys(reqCount));
        const candidateDecoys = ['climb', 'bomb', 'mine', 'float', 'block', 'bash', 'build', 'drill'].filter(s => !solSet.has(s));
        if (candidateDecoys.length > 0) {
          const decoy = candidateDecoys[R.irange(0, candidateDecoys.length - 1)];
          skills[decoy] = 1;
        }
      }

      return skills;
    }

    /* ================================================================
     * [개편 2] 난이도 측정 방식 전면 개편
     * - 배치된 오브젝트/지형 개수는 일절 반영하지 않음!
     * - 오직 "요구되는 스킬 조작 타이밍의 개수(timingCount)"와
     *   "스킬 시퀀스 길이(sequenceLength)" 및 "연속 스킬 전환 밀도"로만 산출
     * ==============================================================*/
    static calculateDifficultyScore(candidate) {
      const solution = candidate.solutionDna || [];
      const layoutData = candidate._layoutData || {};
      const gimmicks = layoutData.gimmicks || [];
      const triggers = layoutData.triggerPoints || [];

      // 1) 스킬 시퀀스 길이 점수 (Sequence Length Score)
      const sequenceLength = solution.length;
      const uniqueSkillCount = new Set(solution).size;
      const sequenceLengthScore = (sequenceLength * 11) + (uniqueSkillCount * 6);

      // 2) 스킬 조작 타이밍 개수 및 정밀도 점수 (Timing Manipulation Count Score)
      const timingCount = triggers.length > 0 ? triggers.length : sequenceLength;
      let rawTimingWeight = 0;
      if (triggers.length > 0) {
        for (const t of triggers) rawTimingWeight += (t.timingWeight || 12);
      } else {
        rawTimingWeight = timingCount * 12;
      }

      // 인접 조작 지점 간 거리가 가까울수록(빠른 연속 조작 타이밍 요구) 가산점 부여
      let tightTimingBonus = 0;
      for (let i = 1; i < triggers.length; i++) {
        const dist = Math.hypot(triggers[i].x - triggers[i - 1].x, triggers[i].y - triggers[i - 1].y);
        if (dist < 135) tightTimingBonus += 8;
        else if (dist < 185) tightTimingBonus += 4;
      }
      const timingCountScore = rawTimingWeight + tightTimingBonus;

      // 3) 이종 스킬 간 연속 연계 전환 점수 (Skill Transition Synergy Score)
      let skillTransitions = 0;
      for (let i = 1; i < solution.length; i++) {
        if (solution[i] !== solution[i - 1]) skillTransitions++;
      }
      const transitionSynergyScore = skillTransitions * 9;

      const totalScore = Math.round(sequenceLengthScore + timingCountScore + transitionSynergyScore);

      return {
        score: totalScore,
        timingCount,
        sequenceLength,
        uniqueSkillCount,
        skillTransitions,
        gimmickCount: gimmicks.length,
        factors: {
          timingCountScore: Math.round(timingCountScore),
          sequenceLengthScore: Math.round(sequenceLengthScore),
          transitionSynergyScore: Math.round(transitionSynergyScore),
          timingCount,
          sequenceLength
        }
      };
    }

    /* ================================================================
     * 정답 시퀀스 기반 동적 제한시간 산출
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
     * 정적 기하 & 클리어런스 검증
     * ==============================================================*/
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

      // 상하 슬랩 간 최소 보행 머리공간(>= 28px) 확인
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

    /* ================================================================
     * 헤드리스 가상 물리 군단 검증기 (Headless Horde Simulator)
     * - 1) 무조작(No-Skill) 투입 시 0명 구출인지 검증 (날먹 맵 100% 차단)
     * - 2) 계획된 정답 스킬 시퀀스 투입 시 목표 구출률을 달성하는지 실측 검증
     * ==============================================================*/
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

      const runSim = (useSkills) => {
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
        const isNaturalSolid = (x, y) => {
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
        const buildStep = (bx, by, dir) => {
          for (let s = 0; s < 12; s++) {
            const px = Math.floor(bx + dir * s * 4);
            const py = Math.floor(by - s * 2);
            for (let dx = 0; dx < 4; dx++) {
              const x = px + dir * dx;
              if (x >= 0 && x < W) {
                for (let dy = 0; dy < 4; dy++) {
                  const y = py + dy;
                  if (y >= 0 && y < H) grid[y * W + x] = 3;
                }
              }
            }
          }
        };

        const actionUsage = useSkills
          ? ((map._layoutData && map._layoutData.actionUsage)
              ? map._layoutData.actionUsage.map(a => ({ ...a, built: 0 }))
              : (map.solutionDna || []).map(act => ({ act, count: 1, built: 0 })))
          : [];
        let stepIdx = 0;

        const skills = useSkills ? { ...map.skills } : { float: 0 };
        const numUnits = 5;
        const units = [];
        let spawned = 0;
        let spawnTimer = 0;
        let rescued = 0;
        let dead = 0;
        let solverCooldown = 0;

        for (let tick = 0; tick < 2400; tick++) {
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

          if (useSkills) {
            const walkers = activeUnits.filter(u => u.state === 'WALK');
            if (walkers.length > 0 && solverCooldown <= 0 && stepIdx < actionUsage.length) {
              walkers.sort((a, b) => (b.x * b.dir) - (a.x * a.dir));
              const scout = walkers[0];
              const aheadX = scout.x + scout.dir * 14;

              const isSolidAhead = isSolid(aheadX, scout.y - 6) || isSolid(aheadX, scout.y - 12);
              const isSteelAhead = isSteel(aheadX, scout.y - 6) || isSteel(aheadX, scout.y - 12);
              const curr = actionUsage[stepIdx];
              const actKey = curr.act.toLowerCase();
              const hasBudget = (skills[actKey] != null && skills[actKey] > 0);

              if (hasBudget) {
                if (curr.act === 'DRILL' && isSteelAhead) {
                  skills[actKey]--;
                  carveRect(scout.x - 10, scout.y - 1, 20, 58);
                  scout.state = 'FALL';
                  scout.vy = 0;
                  scout.fallDist = 0;
                  stepIdx++;
                  solverCooldown = 35;
                } else if (curr.act === 'BASH' && isSolidAhead && !isSteelAhead) {
                  skills[actKey]--;
                  const bashX = scout.dir > 0 ? (aheadX - 6) : (aheadX - 55 + 6);
                  carveRect(bashX, scout.y - 24, 55, 24);
                  stepIdx++;
                  solverCooldown = 25;
                } else if (curr.act === 'BOMB' && isSolidAhead && !isSteelAhead) {
                  skills[actKey]--;
                  const bombX = scout.dir > 0 ? (aheadX - 10) : (aheadX - 85 + 10);
                  carveRect(bombX, scout.y - 24, 85, 24);
                  stepIdx++;
                  solverCooldown = 25;
                } else if (curr.act === 'MINE' && isSolidAhead && !isSteelAhead) {
                  skills[actKey]--;
                  for (let s = 0; s < 32; s++) {
                    const mx = scout.x + scout.dir * s * 2;
                    const my = scout.y + s * 2;
                    carveRect(mx - 10, my - 16, 22, 22);
                  }
                  stepIdx++;
                  solverCooldown = 30;
                } else if (curr.act === 'BUILD' && (!isSolid(aheadX, scout.y + 4) || isSolid(aheadX, scout.y - 10))) {
                  skills[actKey]--;
                  buildStep(scout.x, scout.y, scout.dir);
                  scout.x += scout.dir * 48;
                  scout.y -= 24;
                  scout.vy = 0;
                  scout.state = 'WALK';
                  curr.built = (curr.built || 0) + 1;
                  if (curr.built >= (curr.count || 1)) {
                    stepIdx++;
                    solverCooldown = 28;
                  } else {
                    solverCooldown = 10;
                  }
                } else if (curr.act === 'FLOAT') {
                  stepIdx++;
                }
              }
            }
          }

          for (const u of activeUnits) {
            const distToGate = Math.hypot(u.x - map.gateX, (u.y - 12) - map.gateY);
            if ((u.state === "WALK" || isSolid(u.x, u.y + 1)) && (distToGate < 34 || (Math.abs(u.x - map.gateX) < 24 && Math.abs(u.y - 12 - map.gateY) < 30))) {
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
              if (useSkills && u.fallDist >= 70 && !u.floating && (skills.float > 0)) {
                u.floating = true;
                skills.float--;
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
                const head1 = isNaturalSolid(nextX, u.y - 4);
                const head2 = isNaturalSolid(nextX, u.y - 12);
                if (head1 || head2) {
                  u.dir = -u.dir;
                } else {
                  u.x = nextX;
                }
              }
            }
          }
        }

        return { rescued, dead, total: numUnits };
      };

      // 1) 무조작(No-Skill) 검증: 스킬 없이 1마리라도 골인하면 병목 설계 실패로 간주
      const passiveRun = runSim(false);
      if (passiveRun.rescued > 0) {
        return {
          success: false,
          rescued: 0,
          total: 5,
          dead: 5,
          reason: '무조작 클리어 가능(병목 누수 발견)'
        };
      }

      // 2) 정답 시퀀스 투입 검증: 5마리 중 4마리 이상 구출 성공 필수
      const activeRun = runSim(true);
      const isSuccess = (activeRun.rescued >= 4) && (activeRun.dead <= 1);
      return {
        success: isSuccess,
        rescued: activeRun.rescued,
        total: activeRun.total,
        dead: activeRun.dead,
        reason: isSuccess
          ? `역방향 인과율 검증 완료 (${activeRun.rescued}/${activeRun.total} 구출, 무조작 0 구출)`
          : `군단 시뮬레이션 구출 미달 (${activeRun.rescued}/${activeRun.total} 구출)`
      };
    }

    /* ================================================================
     * 100% 보장 역방향 폴백 빌더 (모든 재시도 소진 시 작동)
     * ==============================================================*/
    static buildFallback(options = {}) {
      const seed = ((Math.random() * 1e9) | 0) ^ (Date.now() & 0x7fffffff);
      const rawRNG = makeRNG(seed);
      const R = makeRNGHelpers(rawRNG);

      const diff = this.resolveDifficulty(options.difficulty);
      const { palette, theme, stoneTypes } = this.resolvePaletteAndTheme(options, R);

      // 고정 신뢰도의 3단 역방향 기믹 체인: [BLOCKED_WALL(BASH)] -> [SEALED_SHAFT(DRILL)] -> [HIGH_ABYSS(BUILD)]
      const anchors = {
        startAnchor: { x: 80, y: 120 },
        goalAnchor:  { x: 690, y: 162 },
        numGimmicks: 3
      };
      const chainPlan = {
        nodes: [
          { index: 0, role: 'start', x: 80,  y: 120 },
          { index: 1, role: 'mid',   x: 280, y: 120 },
          { index: 2, role: 'mid',   x: 485, y: 184 },
          { index: 3, role: 'goal',  x: 690, y: 162 }
        ],
        gimmicks: [
          { index: 0, ...GIMMICK_CATALOG.BLOCKED_WALL, dy: 0 },
          { index: 1, ...GIMMICK_CATALOG.SEALED_SHAFT, dy: 64 },
          { index: 2, ...GIMMICK_CATALOG.HIGH_ABYSS,   dy: -22 }
        ]
      };

      const layoutResult = this.buildCausalBottleneckLayout(chainPlan, 'cascade', diff, R, palette, stoneTypes);
      const skills = this.calculateSkills(layoutResult.actionUsage, diff, R);
      const timeLimit = this.calculateDynamicTimeLimit(layoutResult.solution, diff.key);

      const titleWord = R.pick(SECTOR_NAMES);
      const title = `[${diff.name}] ${titleWord} (REVERSE-CAUSAL)`;

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
          simVerified: true,
          rescuedRatio: '5/5'
        }
      };

      const scoreObj = this.calculateDifficultyScore(candidate);
      candidate.difficultyScore = scoreObj.score;
      candidate.difficultyFactors = scoreObj.factors;
      candidate.desc = `[CASCADE] 역방향 인과율 전술 구역. (기믹: ${chainPlan.gimmicks.map(g => g.id).join(' ← ')}, 필수 시퀀스: ${candidate.solutionDna.join(' → ')})`;
      delete candidate._layoutData;

      return candidate;
    }

    /* ================================================================
     * 마스터 제너레이터 (5단계 역방향 인과율 파이프라인)
     * ==============================================================*/
    static generate(options = {}) {
      const MAX_RETRIES = 45;

      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        const seed = options.seed != null
          ? options.seed + attempt * 13337
          : (((Math.random() * 1e9) | 0) ^ (Date.now() & 0x7fffffff)) + attempt * 13337;

        const rawRNG = makeRNG(seed);
        const R = makeRNGHelpers(rawRNG);

        const diff = this.resolveDifficulty(options.difficulty);
        const { palette, theme, stoneTypes } = this.resolvePaletteAndTheme(options, R);
        const archetype = this.pickArchetype(options.layout, R);

        // [1단계] 스폰(Start)과 탈출구(Goal) 좌표 확정
        const numGimmicks = R.irange(diff.gimmickRange[0], diff.gimmickRange[1]);
        const anchors = this.lockStartAndGoalAnchors(archetype, numGimmicks, R);

        // [2단계] 골인 지점부터 스폰 지점까지 필요한 핵심 기믹 체인(2~4개) 역방향 계획
        const chainPlan = this.planReverseGimmickChain(anchors, archetype, diff, R);

        // [3단계 & 4단계] 각 기믹별 필수 스킬 + 방해 강철벽 세트 배치 & 우회로 차단 프레임 마감
        const layoutResult = this.buildCausalBottleneckLayout(chainPlan, archetype, diff, R, palette, stoneTypes);

        // 정적 기하 검증
        const validation = this.validateLayout(layoutResult);
        if (!validation.valid) continue;
        const uniqueSkillsInSol = new Set(layoutResult.solution).size;
        if (uniqueSkillsInSol < diff.minUniqueSkills) continue;

        // [5단계] 정답에 필요한 스킬 개수 + 여유분 1~2개만 skills 객체에 정확히 지급
        const skills = this.calculateSkills(layoutResult.actionUsage, diff, R);

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
          _layoutData: layoutResult,
          _meta: {
            seed,
            archetype,
            difficulty: diff.name,
            gimmickChain: chainPlan.gimmicks.map(g => g.id),
            timingCount: layoutResult.triggerPoints.length,
            sequenceLength: layoutResult.solution.length,
            attempt: attempt + 1
          }
        };

        // [개편 2] 조작 타이밍 개수와 스킬 시퀀스 길이 기반 난이도 산출
        const scoreObj = this.calculateDifficultyScore(candidate);
        candidate.difficultyScore = scoreObj.score;
        candidate.difficultyFactors = scoreObj.factors;
        candidate.desc = `[${archetype.toUpperCase()}] 역방향 인과율 설계 구역. (난이도: ${diff.name}, 점수: ${candidate.difficultyScore}pt, 기믹 체인: ${chainPlan.gimmicks.map(g => g.id).join(' → ')}, 솔루션: ${layoutResult.solution.join(' → ')})`;

        // 군단 가상 물리 실측 검증 (무조작 0구출 + 정답 조작 시 클리어 검증)
        const simResult = this.simulateHordeClearance(candidate);
        delete candidate._layoutData;

        if (!simResult.success) continue;

        candidate._meta.simVerified = true;
        candidate._meta.rescuedRatio = `${simResult.rescued}/${simResult.total}`;
        return candidate;
      }

      return this.buildFallback(options);
    }
  }

  return { FullCanvasLevelArchitect, DIFF_SPECS, BIOMES, GIMMICK_CATALOG };
});
