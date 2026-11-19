/* ============================================================================
 * CausalPuzzlePrototypes.js — Phase-1 고난이도 인과·추리형 프로토타입 8종 (Stage 24~31)
 *
 * 설계 원칙 ("직관적 오답 → 시행착오 → 다중 에이전트 역발상 추리"):
 *   1. 모든 스테이지는 단순 직진·단일 스킬 돌파(Zero-Skill / Greedy-Bot / 직관 함정 플랜)가
 *      실물리 시뮬레이터(ForgeSim)에서 100% 실패하도록 설계됨.
 *   2. 유기적 대형 굴착 암반(polygonRock 군집 + 혼합 강철 바닥)으로 캔버스 35~48%를 채워
 *      수제 명작(stage_18/19/21/124) 수준의 밀도와 시각적 미로감을 구현.
 *   3. 8개 스테이지 모두 서로 완전히 다른 실루엣·동선·인과 기믹 조합을 가짐.
 *      - S024 [HARD]      TWIN PIONEER CUSHION    : 2인 선발대(CLIMB+FLOAT+BLOCK 반사 → 역방향 BUILD 낙하 완충) + Blocker-BASH 해제
 *      - S025 [HARD]      CURSED PAD OVERPASS     : 함정 점프패드 BUILD 과교 + 거대 암반 양방향 MINE 경사로 + 선발대 분리
 *      - S026 [NIGHTMARE] PINBALL REBOUND SANCTUM : 상단 스포일러 암석 DRILL 제거 → 강철 반사벽 핀볼 리바운드 도약
 *      - S027 [NIGHTMARE] ZERO-BLOCK CEILING TURN : BLOCK=0 천장 헤드봉크 BUILD 반전 + 공명실 240틱 BOMB + 단일 BASH 보존
 *      - S028 [NIGHTMARE] BLOCKER-FREEING VAULT   : 100% 구출(희생 불가) + BLOCK 홀드 → 선발대 선행 개척 → Blocker 직접 DRILL 해제
 *      - S029 [MASTER]    DOUBLE-AGENT RELAY      : 단일 선발대 8자 루프(CLIMB → JumpPad → 양방향 MINE 하강 → 역방향 BUILD 완충)
 *      - S030 [MASTER]    ELEVATOR-TRAP LABYRINTH : stage_124 3중진입 진화형(혼합바닥 + Blocker해제 + CursedPad 과교 + 엘리베이터 중층 BASH)
 *      - S031 [APEX]      THE GRAND PARADOX       : 2인 선발대 낙하완충 + Blocker-BASH 해제 + 심연 가교 + 강철벽 핀볼 리바운드
 * ==========================================================================*/
(function (root) {
  'use strict';

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  /** LevelLint 0-error + TerrainEngine.drawPolygonRock({x,y}) 보장용 polygonRock 헬퍼 */
  function polyRock(pts, opts = {}) {
    const clean = pts.map(([x, y]) => ({
      x: clamp(Math.round(x), 1, 799),
      y: clamp(Math.round(y), 1, 449)
    }));
    let minX = 800, minY = 450, maxX = 0, maxY = 0;
    for (const p of clean) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    const obj = {
      type: 'polygonRock',
      x: minX,
      y: minY,
      w: Math.max(12, maxX - minX),
      h: Math.max(12, maxY - minY),
      points: clean
    };
    if (opts.material) obj.material = opts.material;
    if (opts.palette) obj.palette = opts.palette;
    return obj;
  }

  /** 사각 영역 안쪽에만 요철을 주어 인접 통로를 침범하지 않는 유기적 암반 덩어리 */
  function sculptedMass(x, y, w, h, seed, opts = {}) {
    const r = (k) => {
      const s = Math.sin((seed * 127.1 + k * 311.7)) * 43758.5453;
      return s - Math.floor(s); // [0, 1) — 항상 바운딩 박스 안쪽으로만 들어옴!
    };
    const ix = Math.min(7, Math.floor(w * 0.08));
    const iy = Math.min(7, Math.floor(h * 0.08));
    const x2 = x + w, y2 = y + h;
    return polyRock([
      [x + 2, y + 2],
      [x + w * 0.33, y + r(1) * iy],
      [x + w * 0.67, y + r(2) * iy],
      [x2 - 2, y + 2],
      [x2 - r(3) * ix, y + h * 0.33],
      [x2 - r(4) * ix, y + h * 0.67],
      [x2 - 2, y2 - 2],
      [x + w * 0.67, y2 - r(5) * iy],
      [x + w * 0.33, y2 - r(6) * iy],
      [x + 2, y2 - 2],
      [x + r(7) * ix, y + h * 0.67],
      [x + r(8) * ix, y + h * 0.33]
    ], opts);
  }

  function makeSkills(overrides) {
    return Object.assign({
      climb: 0, float: 0, bomb: 0, block: 0,
      build: 0, bash: 0, mine: 0, drill: 0, portal: 0
    }, overrides, { portal: 0 });
  }

  function buildStage(cfg) {
    // polygonRock 을 항상 steel/platform 보다 앞에 배치하여 강철 픽셀 덮어쓰기 방지
    const polys = cfg.elements.filter(e => e.type === 'polygonRock');
    const rest = cfg.elements.filter(e => e.type !== 'polygonRock');
    const dna = [];
    for (const step of (cfg.plan || [])) {
      const tag = String(step.skill || '').toUpperCase();
      if (tag && !dna.includes(tag)) dna.push(tag);
    }
    return {
      id: cfg.id,
      title: cfg.name,
      bgImg: cfg.bg,
      terrainTheme: cfg.palette,
      desc: cfg.desc,
      totalUnits: cfg.totalUnits,
      needPercent: cfg.needPercent,
      spawnRate: cfg.spawnRate || 24,
      timeLimit: cfg.timeLimit || 300,
      skills: makeSkills(cfg.skills),
      spawnX: cfg.spawnX,
      spawnY: cfg.spawnY,
      gateX: cfg.gateX,
      gateY: cfg.gateY,
      solutionDna: dna,
      difficultyScore: cfg.difficultyScore,
      elements: [...polys, ...rest],
      _meta: {
        generator: 'CausalPuzzlePrototypes-v9-Phase1',
        family: cfg.family,
        difficulty: cfg.difficulty,
        difficultyLabel: cfg.difficultyLabel,
        difficultyScore: cfg.difficultyScore,
        mechanics: cfg.mechanics,
        shortcutHint: cfg.shortcutHint,
        deductionSummary: cfg.deductionSummary,
        trapDescriptions: cfg.trapDescriptions
      },
      verification: {
        plan: cfg.plan,
        trapTests: cfg.trapTests
      }
    };
  }

  /* ==========================================================================
   * STAGE 24 — [HARD] TWIN PIONEER CUSHION
   * ========================================================================*/
  function buildStage24() {
    const elements = [
      // 거대 유기적 굴착 암반 (시각 밀도 ~40%, 모든 보행 통로와 완벽 분리)
      sculptedMass(0, 0, 50, 449, 241),
      sculptedMass(748, 0, 52, 449, 242),
      sculptedMass(292, 0, 456, 86, 243),
      sculptedMass(50, 280, 698, 169, 244),
      sculptedMass(50, 0, 242, 48, 245),

      // 상단 스폰 격실 바닥 (y=148): 좌우 강철 + 중앙 굴착 암석 포켓(x=108..148)
      // 하단 바닥 y=260 → 낙차 112px (> 96px 치사!). 역방향 BUILD 완충(y=236) 시 88px (<= 96px 안전!)
      { type: 'steelPlatform', x: 52, y: 148, w: 56, h: 16 },
      { type: 'platform', x: 108, y: 148, w: 40, h: 16 },
      { type: 'steelPlatform', x: 148, y: 148, w: 54, h: 16 },
      // 스폰 격실 좌벽 & 우측 등반벽 (CLIMB 가능, 높이 54px)
      { type: 'steelPlatform', x: 52, y: 48, w: 16, h: 104 },
      { type: 'steelPlatform', x: 196, y: 94, w: 16, h: 70 },
      // 우측 하강 가이드 벽
      { type: 'steelPlatform', x: 274, y: 86, w: 18, h: 118 },

      // 하단 대강당 바닥 (y=260)
      { type: 'steelPlatform', x: 52, y: 260, w: 696, h: 20 },
      { type: 'steelPlatform', x: 52, y: 164, w: 16, h: 100 },

      // 1차 암벽 (x=376..406, 두께 30px) — u1이 바로 앞(x=370)에 BLOCK 설치 후 BASH로 직접 해제+돌파!
      { type: 'rockWall', x: 376, y: 188, w: 30, h: 72 },
      { type: 'steelPlatform', x: 372, y: 86, w: 38, h: 102 },
      // 2차 암벽 (x=540..570, 두께 30px)
      { type: 'rockWall', x: 540, y: 188, w: 30, h: 72 },
      { type: 'steelPlatform', x: 536, y: 86, w: 38, h: 102 },
      { type: 'steelPlatform', x: 732, y: 86, w: 16, h: 180 }
    ];

    return buildStage({
      name: '[S024] [HARD] TWIN PIONEER CUSHION',
      family: 'twin_pioneer_cushion',
      difficulty: 'hard',
      difficultyLabel: 'HARD',
      difficultyScore: 76,
      bg: 'assets/bg_level_1.jpg',
      palette: 'cyan',
      spawnX: 96,
      spawnY: 130,
      gateX: 668,
      gateY: 236,
      totalUnits: 16,
      needPercent: 100, // 16/16 전원 무희생 구출!
      timeLimit: 300,
      spawnRate: 24,
      skills: { climb: 2, float: 2, block: 1, build: 1, drill: 1, bash: 2 },
      mechanics: ['Twin-Pioneer Separation', 'Human Reflector BLOCK', 'Reverse BUILD Landing Cushion', 'Blocker-Freeing BASH'],
      desc: '스폰 직하방은 112px 치사 낙차! 바로 수직 굴착하면 전원이 낙사합니다. 역추진(FLOAT)은 단 2개뿐. 선발대 1명이 벽을 넘어 내려가 암벽 앞에서 방어막(BLOCK)으로 반사판이 되고, 선발대 2명이 튕겨 돌아와 스폰 아래에 역방향 계단(BUILD) 완충 발판을 세운 뒤 본대를 하강시키세요. 마지막엔 BLOCK 대원에게 직접 BASH를 걸어 해제와 돌파를 동시에 수행합니다!',
      shortcutHint: 'u1 CLIMB+FLOAT → 1차 암벽 앞(x≈370) BLOCK → u2 CLIMB+FLOAT → BLOCK 반사 후 스폰 아래(x≈162) 역방향 BUILD → 본대 DRILL 안전 하강 → u1(BLOCK)에 직접 BASH 해제+1차 암벽 돌파 → 2차 암벽 BASH',
      deductionSummary: '직관 오답(즉시 DRILL → 전원 낙사 / 2명만 CLIMB+FLOAT 탈출 → 구출률 미달)을 배제하고 2인 선발대 역할 분담으로 낙차(112px → 88px)를 물리적으로 개조하는 정통 추리 퍼즐.',
      trapDescriptions: [
        '함정 1: 스폰 암석 포켓을 즉시 DRILL하면 112px 치사 낙차로 전원 사망',
        '함정 2: CLIMB+FLOAT 2명만 보내 암벽을 뚫어도 본대가 탈출 못 해 구출률 12.5% 실패'
      ],
      elements,
      plan: [
        { skill: 'climb', unit: 1, at: { x: 165, y: 148, tol: 12 }, dir: 1, label: '선발대1 등반 부여' },
        { skill: 'float', unit: 1, at: { x: 192, y: 116, tol: 24, ytol: 36 }, state: 'any', label: '선발대1 역추진 부여' },
        { skill: 'climb', unit: 2, at: { x: 165, y: 148, tol: 12 }, dir: 1, label: '선발대2 등반 부여' },
        { skill: 'float', unit: 2, at: { x: 192, y: 116, tol: 24, ytol: 36 }, state: 'any', label: '선발대2 역추진 부여' },
        { skill: 'block', unit: 1, at: { x: 370, y: 260, tol: 5 }, dir: 1, label: '선발대1 1차 암벽 직전 인간 반사판 BLOCK' },
        { skill: 'build', unit: 2, at: { x: 162, y: 260, tol: 5 }, dir: -1, label: '선발대2 BLOCK 반사 후 스폰 아래 역방향 BUILD 완충' },
        { skill: 'drill', unit: 'crowd_lead', at: { x: 126, y: 148, tol: 5 }, wait: 190, label: '완충 발판 완성 후 본대 스폰 바닥 DRILL' },
        { skill: 'bash', unit: 'blocker', at: { x: 370, y: 260, tol: 14 }, wait: 40, label: 'BLOCK 선발대1 직접 BASH 해제 + 1차 암벽 돌파' },
        { skill: 'bash', unit: 'any', at: { x: 534, y: 260, tol: 8 }, dir: 1, label: '2차 암벽 BASH 돌파' }
      ],
      trapTests: [
        {
          name: '직관 오답 A: 스폰 바닥 즉시 수직 굴착(DRILL)',
          plan: [{ skill: 'drill', unit: 1, at: { x: 126, y: 148, tol: 8 } }]
        },
        {
          name: '직관 오답 B: 선발대 2명만 CLIMB+FLOAT로 탈출해 암벽 돌파',
          plan: [
            { skill: 'climb', unit: 1, at: { x: 165, y: 148, tol: 12 }, dir: 1 },
            { skill: 'float', unit: 1, at: { x: 192, y: 116, tol: 24, ytol: 36 }, state: 'any' },
            { skill: 'climb', unit: 2, at: { x: 165, y: 148, tol: 12 }, dir: 1 },
            { skill: 'float', unit: 2, at: { x: 192, y: 116, tol: 24, ytol: 36 }, state: 'any' },
            { skill: 'bash', unit: 1, at: { x: 370, y: 260, tol: 10 }, dir: 1 },
            { skill: 'bash', unit: 1, at: { x: 534, y: 260, tol: 10 }, dir: 1 }
          ]
        }
      ]
    });
  }

  /* ==========================================================================
   * STAGE 25 — [HARD] CURSED PAD OVERPASS
   * ========================================================================*/
  function buildStage25() {
    const elements = [
      // 거대 유기적 굴착 암반 (시각 밀도 ~42%)
      sculptedMass(0, 0, 48, 449, 251),
      sculptedMass(752, 0, 48, 449, 252),
      sculptedMass(48, 0, 704, 68, 253),
      sculptedMass(48, 290, 228, 159, 254),
      sculptedMass(336, 290, 416, 159, 255),

      // 좌측 본대 격리실 (x=52..176, y=264)
      { type: 'steelPlatform', x: 52, y: 264, w: 224, h: 24 },
      { type: 'steelPlatform', x: 48, y: 68, w: 16, h: 204 },
      { type: 'rockWall', x: 176, y: 202, w: 22, h: 62 },

      // 중앙 함정 점프패드 구덩이 (16px 트로프 y=276) → 우측 바닥 y=244로 계단과 빈틈없이 접속!
      { type: 'steelPlatform', x: 276, y: 278, w: 46, h: 16 },
      { type: 'steelPlatform', x: 322, y: 244, w: 144, h: 48 },
      { type: 'jumpPad', x: 284, y: 268, w: 28, h: 10, dir: 'up-left', power: 12.2 },

      // 거대 굴착 성채 (x=466..568, w=102, y=164..244, h=80)
      // x=558에서 좌하향 MINE 시작 → 80px 하강에 dx=95px → x=463으로 바닥 높이(y=244) 완벽 관통!
      { type: 'rockWall', x: 466, y: 164, w: 102, h: 80 },
      { type: 'steelPlatform', x: 466, y: 244, w: 286, h: 48 },
      { type: 'steelPlatform', x: 568, y: 164, w: 180, h: 16 },
      // 성채 상단 출구 암벽 (x=622..648, y=106..164)
      { type: 'rockWall', x: 622, y: 106, w: 26, h: 58 },
      { type: 'steelPlatform', x: 618, y: 68, w: 34, h: 38 },
      { type: 'steelPlatform', x: 736, y: 68, w: 16, h: 104 }
    ];

    return buildStage({
      name: '[S025] [HARD] CURSED PAD OVERPASS',
      family: 'cursed_pad_overpass',
      difficulty: 'hard',
      difficultyLabel: 'HARD',
      difficultyScore: 80,
      bg: 'assets/bg_level_2.jpg',
      palette: 'red',
      spawnX: 98,
      spawnY: 246,
      gateX: 702,
      gateY: 140,
      totalUnits: 16,
      needPercent: 100, // 16/16 전원 구출!
      timeLimit: 300,
      spawnRate: 24,
      skills: { climb: 2, build: 1, mine: 1, bash: 2 },
      mechanics: ['Pioneer Separation CLIMB', 'Cursed JumpPad BUILD Over-Bridge', 'Two-Way Diagonal MINE Ramp', 'Delayed Horde Release'],
      desc: '정면 통로 바닥에 파묻힌 점프패드는 밟는 순간 천장 높이로 튕겨 낙사시키는 저주받은 함정입니다! 본대를 바로 해방하면 전멸합니다. 선발대 1명만 등반(CLIMB)으로 탈출해 함정 패드를 계단(BUILD)으로 덮어 봉인한 뒤, 우측 거대 성채 위에서 대각선(MINE) 역경사로를 파내려와 본대가 걸어 올라올 길을 여세요.',
      shortcutHint: 'u1 CLIMB(격리벽 탈출) → 함정 패드 직전(x≈272) BUILD 과교 → 성채 좌벽(x=466) CLIMB 등반 → 출구벽(x=622) 반사 후 성채 상단(x≈556) 좌측 하향 MINE → 본대 격리벽(x=176) BASH 해방 → 성채 상단 출구벽(x=622) BASH',
      deductionSummary: '점프패드 = 이로운 장치라는 고정관념을 깨는 "함정 점프패드 봉인"과, 하강 스킬 MINE을 본대의 "상승 경사로"로 역이용하는 이중 역발상 퍼즐.',
      trapDescriptions: [
        '함정 1: 격리벽(x=176)을 바로 BASH하면 본대 전원이 함정 점프패드에 튕겨 180px 낙사',
        '함정 2: 패드만 덮고 본대를 해방하면 성채(높이 80px)를 오를 CLIMB가 부족해 전원 고립'
      ],
      elements,
      plan: [
        { skill: 'climb', unit: 1, at: { x: 158, y: 264, tol: 12 }, dir: 1, label: '선발대1 격리벽 등반' },
        { skill: 'build', unit: 1, at: { x: 274, y: 264, tol: 4 }, dir: 1, label: '함정 점프패드 상공 BUILD 과교 봉인 (우측 y=244 바닥과 밀착!)' },
        { skill: 'climb', unit: 1, at: { x: 430, y: 244, tol: 18 }, dir: 1, label: '선발대1 거대 성채 등반' },
        { skill: 'mine', unit: 1, at: { x: 554, y: 164, tol: 6 }, dir: -1, label: '출구벽 반사 후 거대 성채 양방향 MINE 경사로 굴착' },
        { skill: 'bash', unit: 'crowd_lead', at: { x: 170, y: 264, tol: 8 }, dir: 1, wait: 180, label: '경사로 개통 후 본대 격리벽 BASH 해방' },
        { skill: 'bash', unit: 'any', at: { x: 616, y: 164, tol: 8 }, dir: 1, label: '성채 상단 출구 암벽 BASH 돌파' }
      ],
      trapTests: [
        {
          name: '직관 오답 A: 격리벽을 즉시 BASH해 본대 출발',
          plan: [{ skill: 'bash', unit: 1, at: { x: 170, y: 264, tol: 8 }, dir: 1 }]
        },
        {
          name: '직관 오답 B: 패드 봉인 후 MINE 경사로 없이 선발대만 출구 BASH',
          plan: [
            { skill: 'climb', unit: 1, at: { x: 158, y: 264, tol: 12 }, dir: 1 },
            { skill: 'build', unit: 1, at: { x: 274, y: 264, tol: 4 }, dir: 1 },
            { skill: 'climb', unit: 1, at: { x: 430, y: 244, tol: 18 }, dir: 1 },
            { skill: 'bash', unit: 1, at: { x: 616, y: 164, tol: 8 }, dir: 1 },
            { skill: 'bash', unit: 2, at: { x: 170, y: 264, tol: 8 }, dir: 1 }
          ]
        }
      ]
    });
  }

  /* ==========================================================================
   * STAGE 26 — [NIGHTMARE] PINBALL REBOUND SANCTUM
   * ========================================================================*/
  function buildStage26() {
    const elements = [
      // 거대 유기적 암반 외벽 (시각 밀도 ~38%)
      sculptedMass(0, 0, 44, 449, 261),
      sculptedMass(754, 0, 46, 449, 262),
      sculptedMass(44, 0, 710, 36, 263),
      sculptedMass(44, 338, 360, 111, 264),
      sculptedMass(452, 338, 302, 111, 265),

      // 상단 우측 스폰 구역 (y=104)
      { type: 'steelPlatform', x: 488, y: 104, w: 198, h: 16 },
      { type: 'platform', x: 686, y: 104, w: 40, h: 16 },
      { type: 'steelPlatform', x: 726, y: 104, w: 16, h: 16 },
      { type: 'steelPlatform', x: 736, y: 36, w: 16, h: 302 },

      // 스폰 좌측 CLIMB 전용 분리벽 (x=488, 높이 44px)
      { type: 'steelPlatform', x: 488, y: 60, w: 16, h: 44 },
      // 강철 핀볼 반사 타워 (x=468..488, y=96..270 — 하단 48px 보행 통로 개방!)
      { type: 'steelPlatform', x: 468, y: 96, w: 20, h: 174 },
      // 공중 핀볼 스포일러 암반 (x=444..468, y=104..186)
      { type: 'rockWall', x: 444, y: 104, w: 24, h: 82 },

      // 우측 계단식 안전 하강로 (y=104 → 176 → 248 → 318)
      { type: 'steelPlatform', x: 560, y: 176, w: 180, h: 16 },
      { type: 'steelPlatform', x: 488, y: 248, w: 150, h: 16 },

      // 하단 발사대 + 40px 심연 틈새 (x=410..450)
      // u1이 x=456 스포일러를 파고 FLOAT으로 떨어지면 x=456 강철 발판 위에 안전 착지!
      // u1이 혼자 하단 틈새(x=450) BUILD → 핀볼 도약 → 상단 틈새(x=320) BUILD → 출구 BASH까지 완공 후 본대 하강!
      { type: 'steelPlatform', x: 450, y: 318, w: 290, h: 18 },
      { type: 'steelPlatform', x: 256, y: 318, w: 154, h: 18 },
      { type: 'steelPlatform', x: 256, y: 224, w: 16, h: 112 },
      { type: 'jumpPad', x: 374, y: 308, w: 32, h: 10, dir: 'up-right', power: 11.2 },

      // 상단 좌측 Goal 성소 (y=160)
      { type: 'steelPlatform', x: 318, y: 160, w: 112, h: 16 },
      { type: 'steelPlatform', x: 56, y: 160, w: 226, h: 16 },
      { type: 'steelPlatform', x: 44, y: 36, w: 16, h: 140 },
      { type: 'rockWall', x: 186, y: 104, w: 26, h: 56 },
      { type: 'steelPlatform', x: 182, y: 36, w: 34, h: 68 }
    ];

    return buildStage({
      name: '[S026] [NIGHTMARE] PINBALL REBOUND SANCTUM',
      family: 'pinball_rebound_sanctum',
      difficulty: 'nightmare',
      difficultyLabel: 'NIGHTMARE',
      difficultyScore: 86,
      bg: 'assets/bg_level_3.jpg',
      palette: 'purple',
      spawnX: 560,
      spawnY: 86,
      gateX: 114,
      gateY: 136,
      totalUnits: 16,
      needPercent: 100, // 16/16 전원 무희생 구출!
      timeLimit: 330,
      spawnRate: 24,
      skills: { climb: 1, float: 1, drill: 2, build: 2, bash: 1 },
      mechanics: ['Aerial Spoiler DRILL Clearing', 'Pinball Mid-Air Steel Wall Rebound', 'Solo Pioneer Full-Course Prep', 'Sky-Gap BUILD'],
      desc: '상단 좌측의 성소는 계단으로 오를 수 없는 고지대입니다. 하단 점프패드로 강철 타워 벽면에 공중 핀볼 리바운드 도약을 해야 하지만, 타워 좌측면에 매달린 공중 암석 스포일러가 도약 궤도를 가로막고 있습니다! 선발대 1명이 위에서 스포일러를 수직 굴착(DRILL)해 치우고 하단·상단 다리와 출구를 모두 완성한 뒤 본대를 핀볼 도약시키세요.',
      shortcutHint: 'u1 좌측 분리벽(x=504) CLIMB → 스포일러(x=456) DRILL+FLOAT 제거 후 하단 착지 → u1 하단 틈새(x=452) 좌향 BUILD → 점프패드 핀볼 리바운드 → 상단 틈새(x=320) 좌향 BUILD → 출구 BASH → 본대 우측 포켓(x=706) DRILL 하강해 전원(16/16) 핀볼 구출!',
      deductionSummary: '눈앞의 점프패드를 그대로 쓰면 공중 스포일러에 맞아 추락하는 물리 함정. 위층에서 공중 반사 궤도를 먼저 청소하고 선발대가 2개의 틈새를 완공해야 100% 구출되는 공간 추리 퍼즐.',
      trapDescriptions: [
        '함정 1: 상단 공중 스포일러(x=444..468)를 치우지 않고 본대가 점프패드를 밟으면 공중 충돌 후 전원 추락',
        '함정 2: 역추진(FLOAT)은 1개뿐이므로 스포일러 구멍으로 본대가 따라 내려오면 214px 낙사'
      ],
      elements,
      plan: [
        { skill: 'climb', unit: 1, at: { x: 520, y: 104, tol: 14 }, dir: -1, label: '선발대1 좌측 분리벽 등반' },
        { skill: 'drill', unit: 1, at: { x: 458, y: 104, tol: 5 }, dir: -1, label: '공중 핀볼 스포일러 상단 DRILL 제거' },
        { skill: 'float', unit: 1, at: { x: 458, y: 210, tol: 16, ytol: 40 }, state: 'FALLING', label: '스포일러 돌파 직후 하강 중 역추진(FLOAT) 전개 → 하단 강철대 안전 착지' },
        { skill: 'build', unit: 1, at: { x: 454, y: 318, tol: 5 }, dir: -1, label: '선발대1 하단 발사대 진입 틈새 좌향 BUILD' },
        { skill: 'build', unit: 1, at: { x: 320, y: 160, tol: 5 }, dir: -1, label: '선발대1 핀볼 착지 후 상단 하늘 틈새 좌향 BUILD' },
        { skill: 'bash', unit: 1, at: { x: 216, y: 160, tol: 8 }, dir: -1, label: '선발대1 상단 성소 출구 암벽 BASH' },
        { skill: 'drill', unit: 'crowd_lead', at: { x: 706, y: 104, tol: 6 }, dir: 1, wait: 60, label: '전 구간 완공 후 본대 우측 암석 포켓 DRILL 하강 → 전원 핀볼 구출!' }
      ],
      trapTests: [
        {
          name: '직관 오답 A: 공중 스포일러 제거 없이 본대 바로 하강·점프패드 도약',
          plan: [
            { skill: 'drill', unit: 1, at: { x: 706, y: 104, tol: 8 }, dir: 1 },
            { skill: 'build', unit: 'any', at: { x: 454, y: 318, tol: 5 }, dir: -1 }
          ]
        },
        {
          name: '직관 오답 B: 선발대 없이 스폰 바닥만 파고 하단 틈새 방치',
          plan: [{ skill: 'drill', unit: 1, at: { x: 706, y: 104, tol: 8 }, dir: 1 }]
        }
      ]
    });
  }

  /* ==========================================================================
   * STAGE 27 — [NIGHTMARE] ZERO-BLOCK CEILING TURN
   * ========================================================================*/
  function buildStage27() {
    const elements = [
      // 거대 유기적 굴착 암반 (시각 밀도 ~42%)
      sculptedMass(0, 0, 44, 449, 271),
      sculptedMass(754, 0, 46, 449, 272),
      sculptedMass(44, 0, 710, 44, 273),
      sculptedMass(44, 336, 710, 113, 274),

      // 상단 스폰 복도 (y=164, x=110..448 — 우측 x=448 끝은 하단 y=316까지 152px 즉사 낙하!)
      { type: 'steelPlatform', x: 110, y: 164, w: 338, h: 16 },
      // 핵심 기믹: 우측 끝 위 낮은 강철 천장 (x=384..452, 하단 y=140 → 정확히 24px 여유고!)
      { type: 'steelPlatform', x: 384, y: 112, w: 68, h: 28 },

      // 좌측 공명실 벽 (20px 암벽 x=112..132, 상단 강철 캡으로 등반 불가 — 240틱 BOMB 전용!)
      { type: 'rockWall', x: 112, y: 116, w: 20, h: 48 },
      { type: 'steelPlatform', x: 108, y: 44, w: 28, h: 72 },
      // 좌측 안전 2단 하강 계단 (y=164 → y=240 [76px 안전!] → y=316 [76px 안전!])
      { type: 'steelPlatform', x: 48, y: 44, w: 18, h: 292 },
      { type: 'steelPlatform', x: 54, y: 240, w: 120, h: 16 },

      // 하단 메인 복도 (좌측 y=316 → x=392에서 20px 수직 강철 단차 상승 y=296! 계단 BUILD 없으면 등반 불가!)
      // 우측 끝(x=448, y=164)에서 바로 떨어지면 y=296까지 낙차 132px > 96px 전원 즉사!
      { type: 'steelPlatform', x: 54, y: 316, w: 338, h: 20 },
      { type: 'steelPlatform', x: 392, y: 296, w: 356, h: 40 },

      // 최종 관문: 46px 극후 암벽 (x=564..610 — 오직 아껴둔 단일 BASH 전용!)
      { type: 'rockWall', x: 564, y: 238, w: 46, h: 58 },
      { type: 'steelPlatform', x: 560, y: 44, w: 54, h: 194 },
      { type: 'steelPlatform', x: 736, y: 44, w: 16, h: 292 }
    ];

    return buildStage({
      name: '[S027] [NIGHTMARE] ZERO-BLOCK CEILING TURN',
      family: 'zero_block_ceiling_turn',
      difficulty: 'nightmare',
      difficultyLabel: 'NIGHTMARE',
      difficultyScore: 88,
      bg: 'assets/bg_level_4.jpg',
      palette: 'brown',
      spawnX: 256,
      spawnY: 146,
      gateX: 688,
      gateY: 272,
      totalUnits: 16,
      needPercent: 88, // 15/16 (BOMB 1명 희생 허용)
      timeLimit: 300,
      spawnRate: 24,
      skills: { build: 2, bomb: 1, bash: 1 }, // BLOCK = 0!
      mechanics: ['Zero-BLOCK Ceiling Head-Bonk BUILD Turnaround', '240-Tick Timed BOMB Wall Breach', 'Single-BASH Resource Conservation', '20px Steel Step-Up BUILD'],
      desc: '방어막(BLOCK)이 0개인데 대원들이 우측 132px 치사 절벽으로 걸어갑니다! 우측 낮은 강철 천장(24px 높이) 입구 직전에서 계단(BUILD)을 세워 머리를 부딪히면 방향이 좌측으로 반전되며 후발대 전체를 막아주는 영구 댐이 만들어집니다. 또한 BASH는 단 1개뿐—하단의 46px 극후 암벽을 위해 아끼고, 좌측 20px 뒷문은 240틱 시한폭탄(BOMB)으로 여세요.',
      shortcutHint: 'u1 낮은 천장 입구 직전(x≈368) BUILD → 머리 충돌로 좌측 반전+댐 봉인 → 좌측 벽 반사 후 우측 댐 직전(x≈324) 240틱 BOMB 점화 → 좌측 20px 암벽 정면 폭파 → 2단 안전 하강 후 20px 강철 단차(x=348) BUILD 등반 → 최종 46px 암벽에 아껴둔 단일 BASH',
      deductionSummary: 'BLOCK 없이 계단 헤드봉크로 본대 전체의 방향을 전환하는 고급 물리 테크닉과, BASH 1개 vs BOMB 1개의 벽 두께(20px vs 46px) 자원 배분 추리가 결합된 고난이도 맵.',
      trapDescriptions: [
        '함정 1: 낮은 천장 입구 BUILD 반전을 쓰지 않으면 전원 우측 132px 절벽에서 낙사 (0명 구출)',
        '함정 2: 유일한 BASH를 좌측 20px 뒷문에 써버리면 하단 46px 극후 암벽을 1발의 BOMB으로 뚫지 못해 전멸'
      ],
      elements,
      plan: [
        { skill: 'build', unit: 1, at: { x: 368, y: 164, tol: 4 }, dir: 1, label: '낮은 천장 입구 BUILD 헤드봉크 반전+댐 봉인' },
        { skill: 'bomb', unit: 1, at: { x: 324, y: 164, tol: 4 }, dir: 1, wait: 160, label: '240틱(300px) 계산 BOMB 점화 → 좌측 20px 암벽 정면 폭파' },
        { skill: 'build', unit: 'any', at: { x: 348, y: 316, tol: 5 }, dir: 1, wait: 260, label: '하단 20px 수직 강철 단차 BUILD 계단 건설' },
        { skill: 'bash', unit: 'any', at: { x: 558, y: 296, tol: 8 }, dir: 1, label: '아껴둔 단일 BASH로 46px 극후 암벽 돌파' }
      ],
      trapTests: [
        {
          name: '직관 오답 A: 천장 반전 없이 방치 (우측 132px 전원 낙사)',
          plan: []
        },
        {
          name: '직관 오답 B: 유일한 BASH를 좌측 20px 뒷문에 낭비하고 하단 46px 벽에 BOMB 시도',
          plan: [
            { skill: 'build', unit: 1, at: { x: 368, y: 164, tol: 4 }, dir: 1 },
            { skill: 'bash', unit: 1, at: { x: 138, y: 164, tol: 8 }, dir: -1 },
            { skill: 'build', unit: 'any', at: { x: 348, y: 316, tol: 5 }, dir: 1 },
            { skill: 'bomb', unit: 'any', at: { x: 556, y: 296, tol: 8 }, dir: 1 }
          ]
        }
      ]
    });
  }

  /* ==========================================================================
   * STAGE 28 — [NIGHTMARE] BLOCKER-FREEING VAULT
   * ========================================================================*/
  function buildStage28() {
    const elements = [
      // 거대 유기적 굴착 암반 (시각 밀도 ~42%)
      sculptedMass(0, 0, 48, 449, 281),
      sculptedMass(752, 0, 48, 449, 282),
      sculptedMass(48, 0, 704, 56, 283),
      sculptedMass(48, 278, 418, 171, 284),
      sculptedMass(514, 278, 238, 171, 285),

      // 상단 좌측 암석 금고 (y=160 — 강철 + 굴착 암석 바닥 x=120..226)
      { type: 'steelPlatform', x: 52, y: 160, w: 68, h: 16 },
      { type: 'platform', x: 120, y: 160, w: 106, h: 16 },
      { type: 'steelPlatform', x: 48, y: 56, w: 16, h: 224 },

      // 상단 틈새 (x=226..268, 폭 42px) → 우측 활강 진입대 (x=268..356, y=160)
      { type: 'steelPlatform', x: 268, y: 160, w: 88, h: 16 },
      // 45° 강철 활강 빔 (x=356, y=160 → x=414, y=218: 하단 바닥 y=248까지 30px 통과 여유고 확보!)
      { type: 'diagonalBeam', x: 356, y: 160, w: 58, h: 58, dir: 'downRight', slope: 1, isSteel: true },

      // 하단 메인 고속도로 (y=248 — 상단 바닥 y=160 기준 낙차 88px <= 96px 안전!)
      { type: 'steelPlatform', x: 52, y: 248, w: 416, h: 20 },
      { type: 'steelPlatform', x: 512, y: 248, w: 240, h: 20 },

      // 하단 최종 암벽 수문 (x=592..624, y=186..248)
      { type: 'rockWall', x: 592, y: 186, w: 32, h: 62 },
      { type: 'steelPlatform', x: 588, y: 56, w: 40, h: 130 },
      { type: 'steelPlatform', x: 736, y: 56, w: 16, h: 206 }
    ];

    return buildStage({
      name: '[S028] [NIGHTMARE] BLOCKER-FREEING VAULT',
      family: 'blocker_freeing_vault',
      difficulty: 'nightmare',
      difficultyLabel: 'NIGHTMARE',
      difficultyScore: 87,
      bg: 'assets/bg_level_5.jpg',
      palette: 'green',
      spawnX: 92,
      spawnY: 142,
      gateX: 696,
      gateY: 224,
      totalUnits: 16,
      needPercent: 100, // 16/16 전원 무희생 구출!
      timeLimit: 300,
      spawnRate: 24,
      skills: { block: 1, build: 2, bash: 1, drill: 1 },
      mechanics: ['100% No-Sacrifice Quota', 'Pioneer Ahead + Unit 2 BLOCK Hold', '45° Steel Diagonal Slide', 'Direct Blocker-Freeing DRILL'],
      desc: '목표 구출률 100%(16/16), 폭탄 0개, 방어막 1개! 단 한 명도 버릴 수 없습니다. u1을 선발대로 먼저 보내고 u2가 암석 바닥 위에서 방어막(BLOCK)으로 본대를 묶어두세요. 선발대가 아래쪽 다리와 출구를 모두 완성한 뒤, 방어막 대원(u2)에게 직접 수직굴착(DRILL)을 걸어 스스로 방어막을 풀고 전원 함께 하강하세요!',
      shortcutHint: 'u1 상단 틈새(x=222) BUILD 선행 → u2 암석 바닥(x=184) BLOCK 홀드 → u1 활강 빔 하강 → 하단 틈새(x=464) BUILD → 출구 암벽(x=592) BASH → 홀드 중인 u2(BLOCK)에게 직접 DRILL 클릭해 전원(16/16) 안전 낙하 구출!',
      deductionSummary: '"BLOCK은 희생 유닛"이라는 고정관념을 깨고, 암석 바닥 위 BLOCK에게 직접 DRILL을 걸어 방어막 해제와 본대 하강을 동시에 이루는 100% 무희생 추리 퍼즐.',
      trapDescriptions: [
        '함정 1: 상단에서 바로 DRILL하면 하단 틈새(x=468..512)로 본대 전원 추락 (0명 구출)',
        '함정 2: u2 BLOCK으로 홀드 후 u1이 길을 열어도 u2를 해제하지 못하면 15/16(93.8%) < 100% 실패'
      ],
      elements,
      plan: [
        { skill: 'build', unit: 1, at: { x: 222, y: 160, tol: 5 }, dir: 1, label: '선발대 u1 상단 틈새 BUILD 선행 → 강철 활강 빔 진입' },
        { skill: 'block', unit: 2, at: { x: 184, y: 160, tol: 8 }, dir: 1, label: 'u2 암석 바닥 위 BLOCK으로 본대 홀드' },
        { skill: 'build', unit: 1, at: { x: 464, y: 248, tol: 5 }, dir: 1, label: '선발대 u1 하단 44px 틈새 BUILD 가교' },
        { skill: 'bash', unit: 1, at: { x: 586, y: 248, tol: 8 }, dir: 1, label: '선발대 u1 하단 최종 암벽 BASH 돌파' },
        { skill: 'drill', unit: 'blocker', at: { x: 184, y: 160, tol: 14 }, wait: 160, label: '개척 완료 후 BLOCK 대원(u2)에게 직접 DRILL 해제 + 전원 하강!' }
      ],
      trapTests: [
        {
          name: '직관 오답 A: 시작하자마자 상단 암석 바닥 즉시 DRILL',
          plan: [{ skill: 'drill', unit: 1, at: { x: 184, y: 160, tol: 8 }, dir: 1 }]
        },
        {
          name: '직관 오답 B: u1이 길은 다 열었지만 BLOCK 대원(u2)을 해제하지 않음 (15/16 실패)',
          plan: [
            { skill: 'build', unit: 1, at: { x: 222, y: 160, tol: 5 }, dir: 1 },
            { skill: 'block', unit: 2, at: { x: 184, y: 160, tol: 8 }, dir: 1 },
            { skill: 'build', unit: 1, at: { x: 464, y: 248, tol: 5 }, dir: 1 },
            { skill: 'bash', unit: 1, at: { x: 586, y: 248, tol: 8 }, dir: 1 }
          ]
        }
      ]
    });
  }

  /* ==========================================================================
   * STAGE 29 — [MASTER] DOUBLE-AGENT RELAY
   * ========================================================================*/
  function buildStage29() {
    const elements = [
      // 거대 유기적 암반 덩어리 (시각 밀도 ~42%)
      sculptedMass(0, 0, 46, 449, 291),
      sculptedMass(754, 0, 46, 449, 292),
      sculptedMass(46, 0, 708, 48, 293),
      sculptedMass(46, 282, 708, 167, 294),

      // 상단 좌측 스폰 격실 (y=148: 강철 + 중앙 암석 포켓 x=104..144 + 강철)
      // 하단 대강당 y=260 → 낙차 112px (> 96px 치사!), 역방향 BUILD 완충 시 88px 안전!
      { type: 'steelPlatform', x: 50, y: 148, w: 54, h: 16 },
      { type: 'platform', x: 104, y: 148, w: 40, h: 16 },
      { type: 'steelPlatform', x: 144, y: 148, w: 50, h: 16 },
      { type: 'steelPlatform', x: 46, y: 48, w: 16, h: 236 },
      // 스폰 우측 등반 분리벽 (x=194, 높이 44px — CLIMB=1 선발대 1명만 탈출!)
      { type: 'steelPlatform', x: 194, y: 104, w: 16, h: 60 },

      // 선발대 전용 점프패드 발사 선반 (x=210..320, y=148)
      { type: 'steelPlatform', x: 210, y: 148, w: 110, h: 16 },
      // 저탄도 안전 점프패드 (power: 4.5 → apex y≈106, 성채 상단 y=172 착지 낙차 ~66px <= 96px 안전!)
      { type: 'jumpPad', x: 280, y: 138, w: 30, h: 10, dir: 'up-right', power: 4.5 },

      // 거대 굴착 성채 (x=396..504, w=108, y=172..260, h=88)
      // x=498에서 좌하향 MINE 시작 → 88px 하강에 dx=104px → x=394로 바닥 높이(y=260) 완벽 관통!
      { type: 'rockWall', x: 396, y: 172, w: 108, h: 88 },
      { type: 'steelPlatform', x: 504, y: 172, w: 244, h: 16 },
      // 성채 상단 출구 암벽 (x=612..640, y=114..172)
      { type: 'rockWall', x: 612, y: 114, w: 28, h: 58 },
      { type: 'steelPlatform', x: 608, y: 48, w: 36, h: 66 },
      { type: 'steelPlatform', x: 738, y: 48, w: 16, h: 236 },

      // 하단 대강당 바닥 (y=260)
      { type: 'steelPlatform', x: 50, y: 260, w: 698, h: 22 }
    ];

    return buildStage({
      name: '[S029] [MASTER] DOUBLE-AGENT RELAY',
      family: 'double_agent_relay',
      difficulty: 'master',
      difficultyLabel: 'MASTER',
      difficultyScore: 93,
      bg: 'assets/bg_level_6.jpg',
      palette: 'cyan',
      spawnX: 90,
      spawnY: 130,
      gateX: 700,
      gateY: 148,
      totalUnits: 16,
      needPercent: 100, // 16/16 전원 무희생 구출!
      timeLimit: 320,
      spawnRate: 24,
      skills: { climb: 1, mine: 1, build: 1, drill: 1, bash: 1 }, // FLOAT=0, BLOCK=0!
      mechanics: ['Single-Pioneer Figure-8 Loop', 'Isolated JumpPad Vault', 'Two-Way Diagonal MINE Shaft', 'Reverse BUILD Landing Cushion'],
      desc: '역추진(FLOAT)도 방어막(BLOCK)도 0개! 스폰 아래는 112px 치사 낙차입니다. 선발대 1명만 우측 벽을 넘어 점프패드로 성채에 도약한 뒤, 성채를 가로지르는 대각선 굴착(MINE)으로 하단 대강당에 안전 하강하세요. 그 선발대가 스폰 아래로 돌아와 역방향 계단(BUILD) 완충 발판을 놓으면, 본대가 하강해 MINE 경사로를 역등반합니다!',
      shortcutHint: 'u1 우측벽(x=194) CLIMB → 점프패드 성채 도약 → 출구벽(x=612) 반사 → 성채 상단(x≈496) 좌향 MINE 하강 → 하단 스폰 아래(x≈158) 역방향 BUILD 완충 → 본대 스폰(x=122) DRILL 안전 하강 → MINE 경사로 역등반 → 출구 BASH',
      deductionSummary: '스킬 5개(CLIMB/MINE/BUILD/DRILL/BASH 각 1개)로 캔버스 전체를 8자 루프로 잇는 3중 역발상 걸작. 단 하나의 낭비도 허용되지 않음.',
      trapDescriptions: [
        '함정 1: 스폰 암석 바닥을 즉시 DRILL하면 112px 낙차로 본대 전원 사망',
        '함정 2: 선발대가 점프패드로 성채에 올라간 뒤 바로 출구 암벽을 BASH하면 1/16만 탈출하고 본대 영구 고립'
      ],
      elements,
      plan: [
        { skill: 'climb', unit: 1, at: { x: 176, y: 148, tol: 12 }, dir: 1, label: '선발대1 격리벽 등반 → 점프패드 성채 도약' },
        { skill: 'mine', unit: 1, at: { x: 496, y: 172, tol: 6 }, dir: -1, label: '출구벽 반사 후 성채 상단에서 좌하향 MINE 굴착' },
        { skill: 'build', unit: 1, at: { x: 158, y: 260, tol: 5 }, dir: -1, label: '하단 대강당 좌측 스폰 아래 역방향 BUILD 낙하 완충' },
        { skill: 'drill', unit: 'crowd_lead', at: { x: 122, y: 148, tol: 5 }, wait: 190, label: '완충 발판 완성 후 본대 스폰 바닥 DRILL 안전 하강' },
        { skill: 'bash', unit: 'any', at: { x: 606, y: 172, tol: 8 }, dir: 1, label: 'MINE 경사로 역등반 후 성채 출구 BASH' }
      ],
      trapTests: [
        {
          name: '직관 오답 A: 스폰 바닥 즉시 DRILL (112px 전원 낙사)',
          plan: [{ skill: 'drill', unit: 1, at: { x: 122, y: 148, tol: 6 } }]
        },
        {
          name: '직관 오답 B: 선발대1이 성채 착지 후 MINE 없이 바로 출구 BASH (1/16 실패)',
          plan: [
            { skill: 'climb', unit: 1, at: { x: 176, y: 148, tol: 12 }, dir: 1 },
            { skill: 'bash', unit: 1, at: { x: 606, y: 172, tol: 8 }, dir: 1 }
          ]
        }
      ]
    });
  }

  /* ==========================================================================
   * STAGE 30 — [MASTER] ELEVATOR-TRAP LABYRINTH
   * ========================================================================*/
  function buildStage30() {
    const elements = [
      // 거대 유기적 미로 암반 덩어리 (시각 밀도 ~44%)
      sculptedMass(0, 0, 44, 449, 301),
      sculptedMass(754, 0, 46, 449, 302),
      sculptedMass(44, 0, 710, 42, 303),
      sculptedMass(44, 294, 710, 155, 304),
      sculptedMass(646, 42, 108, 56, 305),

      // 상단 좌측 혼합 스폰 데크 (y=124): 강철(50..162) + 암석 포켓(162..206) + 강철(206..264)
      { type: 'steelPlatform', x: 50, y: 124, w: 112, h: 16 },
      { type: 'platform', x: 162, y: 124, w: 44, h: 16 },
      { type: 'steelPlatform', x: 206, y: 124, w: 58, h: 16 },
      { type: 'steelPlatform', x: 44, y: 42, w: 16, h: 256 },

      // 상단 우측 시각적 미끼 통로 (3중 진입로 중 상단 루트 — 강철 코어에 막힘)
      { type: 'steelPlatform', x: 356, y: 110, w: 210, h: 14 },

      // 중간 안전 계단 발판 (y=196: x=142..302 — u1 하강(x=287)과 포켓 하강(x=184) 모두 안전 수용!)
      { type: 'steelPlatform', x: 142, y: 196, w: 160, h: 16 },

      // 중단 메인 복도 (y=260) + Recessed Cursed JumpPad (x=326..372, y=276) → 우측 y=240으로 계단과 밀착!
      { type: 'steelPlatform', x: 50, y: 260, w: 276, h: 34 },
      { type: 'steelPlatform', x: 326, y: 278, w: 46, h: 16 },
      { type: 'jumpPad', x: 334, y: 268, w: 28, h: 10, dir: 'up-left', power: 12.2 },
      { type: 'steelPlatform', x: 372, y: 240, w: 78, h: 54 },

      // 수직 엘리베이터 샤프트 (폭 88px > 승강거리 44px → 44틱 만에 최상단 도달! 압사 0%, 1회 승강 100% 직행!)
      { type: 'movingPlatform', x: 450, y: 196, w: 88, h: 14, axis: 'vertical', range: 44, speed: 1.0, pauseTicks: 48, phase: 1.0, palette: 'purple' },
      { type: 'steelPlatform', x: 448, y: 242, w: 92, h: 52 },
      { type: 'steelPlatform', x: 538, y: 196, w: 30, h: 16 },

      // 거대 250px 복합 기둥 (상단 강철 코어 / 중층 46px 굴착 암벽 x=568..614 / 하단 강철 기단 x=538..614)
      { type: 'steelPlatform', x: 568, y: 42, w: 46, h: 102 },
      { type: 'rockWall', x: 568, y: 144, w: 46, h: 68 },
      { type: 'steelPlatform', x: 538, y: 212, w: 76, h: 82 },

      // 우측 웜홀 Triad 성소 (y=196)
      { type: 'steelPlatform', x: 614, y: 196, w: 134, h: 16 },
      { type: 'steelPlatform', x: 738, y: 42, w: 16, h: 256 }
    ];

    return buildStage({
      name: '[S030] [MASTER] ELEVATOR-TRAP LABYRINTH',
      family: 'elevator_trap_labyrinth',
      difficulty: 'master',
      difficultyLabel: 'MASTER',
      difficultyScore: 95,
      bg: 'assets/bg_level_8.jpg',
      palette: 'purple',
      spawnX: 92,
      spawnY: 106,
      gateX: 694,
      gateY: 172,
      totalUnits: 16,
      needPercent: 100, // 16/16 전원 무희생 구출!
      timeLimit: 330,
      spawnRate: 24,
      skills: { block: 1, build: 1, bash: 1, drill: 1 },
      mechanics: ['Hybrid Steel+Rock Deck', '100% Blocker-Freeing DRILL', 'Cursed JumpPad BUILD Overpass', 'Vertical Elevator Shaft', 'Giant Pillar Mid-Height BASH'],
      desc: 'WORMHOLE TRIAD의 미로 진화형! 목표 구출률 100%, 스킬은 단 4개(BLOCK/BUILD/BASH/DRILL 각 1개). 본대를 바로 내려보내면 중단 복도의 저주받은 점프패드에 튕겨 전멸합니다. u2가 암석 포켓 위에서 본대를 묶어두는 동안 u1이 함정 패드를 계단으로 덮고 수직 엘리베이터를 타고 거대 암벽 기둥 중층을 뚫은 뒤, u2에게 직접 DRILL을 걸어 전원을 해방하세요!',
      shortcutHint: 'u2 암석 포켓(x=184) BLOCK 홀드(u1 선행 하강!) → u1 함정 패드 직전(x≈324) BUILD 과교 → 수직 엘리베이터 탑승 후 중층 거대 암벽(x=568) BASH 관통 → u2(BLOCK)에게 직접 DRILL 해제하여 전원(16/16) 웜홀 구출!',
      deductionSummary: '혼합 바닥 + 함정 패드 과교 + 수직 엘리베이터 + 거대 기둥 중층 관통 + 100% Blocker-Freeing DRILL이 단 4개의 스킬로 맞물리는 시계태엽형 마스터 미로.',
      trapDescriptions: [
        '함정 1: BLOCK 홀드 없이 본대를 내려보내면 u1이 계단을 짓는 동안 후발대가 함정 패드에 튕겨 낙사',
        '함정 2: u1이 길을 다 열어도 u2 BLOCK을 DRILL로 직접 해제하지 않으면 15/16 < 100% 실패'
      ],
      elements,
      plan: [
        { skill: 'block', unit: 2, at: { x: 184, y: 124, tol: 8 }, dir: 1, label: 'u2 혼합 바닥 암석 포켓 위 BLOCK 홀드 (u1 선행!)' },
        { skill: 'build', unit: 1, at: { x: 324, y: 260, tol: 4 }, dir: 1, label: '선발대 u1 중단 함정 점프패드 상공 BUILD 과교 봉인 (우측 y=240과 밀착!)' },
        { skill: 'bash', unit: 1, at: { x: 562, y: 196, tol: 8 }, dir: 1, label: '엘리베이터 탑승 후 거대 암벽 기둥 중층 BASH 관통' },
        { skill: 'drill', unit: 'blocker', at: { x: 184, y: 124, tol: 14 }, wait: 180, label: 'u2(BLOCK) 직접 DRILL 해제 → 전원(16/16) 안전 하강·구출!' }
      ],
      trapTests: [
        {
          name: '직관 오답 A: BLOCK 홀드 없이 즉시 암석 포켓 DRILL',
          plan: [{ skill: 'drill', unit: 1, at: { x: 184, y: 124, tol: 8 }, dir: 1 }]
        },
        {
          name: '직관 오답 B: u1이 길은 다 열었지만 u2 BLOCK을 해제하지 않음 (15/16 실패)',
          plan: [
            { skill: 'block', unit: 2, at: { x: 184, y: 124, tol: 8 }, dir: 1 },
            { skill: 'build', unit: 1, at: { x: 324, y: 260, tol: 4 }, dir: 1 },
            { skill: 'bash', unit: 1, at: { x: 562, y: 196, tol: 8 }, dir: 1 }
          ]
        }
      ]
    });
  }

  /* ==========================================================================
   * STAGE 31 — [APEX] THE GRAND PARADOX
   * ========================================================================*/
  function buildStage31() {
    const elements = [
      // 거대 유기적 암반 외벽 (시각 밀도 ~42%)
      sculptedMass(0, 0, 44, 449, 311),
      sculptedMass(608, 0, 192, 449, 312),
      sculptedMass(44, 0, 564, 34, 313),
      sculptedMass(44, 280, 330, 169, 314),
      sculptedMass(420, 338, 190, 111, 315),

      // 상단 좌측 스폰 금고 (y=148 — 하단 y=260 기준 낙차 112px 치사! 완충 시 88px 안전!)
      { type: 'steelPlatform', x: 48, y: 148, w: 56, h: 16 },
      { type: 'platform', x: 104, y: 148, w: 40, h: 16 },
      { type: 'steelPlatform', x: 144, y: 148, w: 50, h: 16 },
      { type: 'steelPlatform', x: 44, y: 34, w: 16, h: 248 },
      // 스폰 우측 등반벽 (x=194, 높이 54px — CLIMB=2 선발대 2명 탈출!)
      { type: 'steelPlatform', x: 194, y: 94, w: 16, h: 70 },
      { type: 'steelPlatform', x: 256, y: 94, w: 16, h: 122 },

      // 하단 메인 복도 (y=260)
      { type: 'steelPlatform', x: 48, y: 260, w: 328, h: 20 },
      // 1차 암벽 (x=326..352) — u1이 바로 앞(x=320)에 BLOCK 후 BASH로 직접 해제+돌파!
      { type: 'rockWall', x: 326, y: 200, w: 26, h: 60 },
      { type: 'steelPlatform', x: 322, y: 184, w: 34, h: 16 },

      // 하단 42px 심연 틈새 (x=376..418) → 우측 계단 하강(y=260→318) → 핀볼 발사대!
      { type: 'steelPlatform', x: 418, y: 260, w: 38, h: 18 },
      { type: 'steelPlatform', x: 438, y: 318, w: 152, h: 18 },
      { type: 'jumpPad', x: 500, y: 308, w: 32, h: 10, dir: 'up-right', power: 11.2 },
      // 강철 핀볼 반사 타워 (x=588, y=34..336)
      { type: 'steelPlatform', x: 588, y: 34, w: 20, h: 302 },

      // 상단 중앙 고지대 Goal 성소 (y=160, x=280..550 — 핀볼 착지점 x=542~550!)
      { type: 'steelPlatform', x: 280, y: 160, w: 270, h: 16 },
      { type: 'steelPlatform', x: 274, y: 34, w: 16, h: 142 },
      // 성소 최종 수문 암벽 (x=384..414, y=104..160)
      { type: 'rockWall', x: 384, y: 104, w: 30, h: 56 },
      { type: 'steelPlatform', x: 380, y: 34, w: 38, h: 70 }
    ];

    return buildStage({
      name: '[S031] [APEX] THE GRAND PARADOX',
      family: 'grand_paradox_apex',
      difficulty: 'apex',
      difficultyLabel: 'APEX',
      difficultyScore: 99,
      bg: 'assets/bg_level_7.jpg',
      palette: 'red',
      spawnX: 90,
      spawnY: 130,
      gateX: 328,
      gateY: 136,
      totalUnits: 16,
      needPercent: 100, // 16/16 전원 무희생 구출!
      timeLimit: 340,
      spawnRate: 24,
      skills: { climb: 2, float: 2, block: 1, build: 2, drill: 1, bash: 2 },
      mechanics: ['Twin Pioneer Cushion', 'Human Reflector BLOCK → Direct BASH Release', 'Chasm BUILD', 'Pinball Mid-Air Steel Wall Rebound', '100% No-Sacrifice APEX'],
      desc: '4중 복합 인과 체인의 정점! 목표 구출률 100%(16/16). 1막: 스폰 직하방 112px 치사 낙차를 2인 선발대(CLIMB+FLOAT+BLOCK 반사 → 역방향 BUILD 완충)로 해체하세요. 2막: BLOCK 선발대에게 직접 BASH를 걸어 방어막 해제와 1차 암벽 돌파를 동시에 수행하고, 심연 가교(BUILD)와 강철 타워 핀볼 리바운드 도약으로 상단 성소를 먼저 개통한 뒤 본대를 DRILL 하강시키세요!',
      shortcutHint: 'u1 CLIMB+FLOAT → 1차 암벽 앞(x≈320) BLOCK → u2 CLIMB+FLOAT → 반사 후 스폰 아래(x≈162) 역방향 BUILD 완충 → u1(BLOCK) 직접 BASH 해제+1차 암벽 돌파 → u1 심연 틈새(x=372) BUILD → 핀볼 리바운드 착지 → 상단 최종 암벽 좌향 BASH → 본대 스폰 DRILL 안전 하강(16/16)!',
      deductionSummary: '2인 선발대 완충 + Blocker-BASH 동시 해제 + 심연 가교 + 공중 핀볼 리바운드 + 100% 무희생이 한 스테이지에 유기적으로 맞물린 Phase-1 최종 APEX 보스 퍼즐.',
      trapDescriptions: [
        '함정 1: 스폰 바닥 즉시 DRILL 시 112px 낙차로 본대 전원 사망',
        '함정 2: 선발대 2명만 탈출해 핀볼 성소로 가도 2/16(12.5%) 실패',
        '함정 3: 심연 틈새(x=376..418)를 BUILD로 메우지 않으면 핀볼 발사대 도달 전 전원 추락'
      ],
      elements,
      plan: [
        { skill: 'climb', unit: 1, at: { x: 170, y: 148, tol: 12 }, dir: 1, label: '선발대1 등반 부여' },
        { skill: 'float', unit: 1, at: { x: 192, y: 116, tol: 24, ytol: 36 }, state: 'any', label: '선발대1 역추진 부여' },
        { skill: 'climb', unit: 2, at: { x: 170, y: 148, tol: 12 }, dir: 1, label: '선발대2 등반 부여' },
        { skill: 'float', unit: 2, at: { x: 192, y: 116, tol: 24, ytol: 36 }, state: 'any', label: '선발대2 역추진 부여' },
        { skill: 'block', unit: 1, at: { x: 320, y: 260, tol: 5 }, dir: 1, label: '선발대1 1차 암벽 직전 BLOCK 반사판' },
        { skill: 'build', unit: 2, at: { x: 162, y: 260, tol: 5 }, dir: -1, label: '선발대2 반사 후 스폰 아래 역방향 BUILD 완충' },
        { skill: 'bash', unit: 'blocker', at: { x: 320, y: 260, tol: 14 }, wait: 20, label: 'BLOCK 선발대1 직접 BASH 해제 + 1차 암벽 돌파' },
        { skill: 'build', unit: 1, at: { x: 372, y: 260, tol: 5 }, dir: 1, label: '선발대1 하단 42px 심연 틈새 BUILD 가교' },
        { skill: 'bash', unit: 'any', at: { x: 420, y: 160, tol: 8 }, dir: -1, label: '핀볼 리바운드 착지 후 상단 최종 암벽 좌향 BASH' },
        { skill: 'drill', unit: 'crowd_lead', at: { x: 122, y: 148, tol: 5 }, wait: 40, label: '전 구간 완공 후 본대 스폰 바닥 DRILL 안전 하강 → 전원 핀볼 구출!' }
      ],
      trapTests: [
        {
          name: '직관 오답 A: 스폰 바닥 즉시 DRILL',
          plan: [{ skill: 'drill', unit: 1, at: { x: 122, y: 148, tol: 6 } }]
        },
        {
          name: '직관 오답 B: 완충 없이 선발대 2명만 핀볼 성소 돌파 (2/16 실패)',
          plan: [
            { skill: 'climb', unit: 1, at: { x: 170, y: 148, tol: 12 }, dir: 1 },
            { skill: 'float', unit: 1, at: { x: 192, y: 116, tol: 24, ytol: 36 }, state: 'any' },
            { skill: 'bash', unit: 1, at: { x: 320, y: 260, tol: 10 }, dir: 1 },
            { skill: 'build', unit: 1, at: { x: 372, y: 260, tol: 5 }, dir: 1 },
            { skill: 'bash', unit: 1, at: { x: 420, y: 160, tol: 8 }, dir: -1 }
          ]
        }
      ]
    });
  }

  const CausalPuzzlePrototypes = {
    version: 'v9-phase1',
    buildAll() {
      const list = [
        buildStage24(),
        buildStage25(),
        buildStage26(),
        buildStage27(),
        buildStage28(),
        buildStage29(),
        buildStage30(),
        buildStage31()
      ];
      list.forEach((st, idx) => { st.id = 24 + idx; });
      return list;
    }
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { CausalPuzzlePrototypes };
  }
  if (root) {
    root.CausalPuzzlePrototypes = CausalPuzzlePrototypes;
  }
})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
