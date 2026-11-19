/* ============================================================================
 * CausalGrammarEngine.js — v9 "Causal Puzzle Grammar" (16개 핵심 아키타입 × 변형 × 미러링)
 *
 * Stage 33~124 (92개) 고난이도 인과·추리형 스테이지 생성기.
 * 향후 1,000스테이지 확장을 대비한 모듈형 아키텍처:
 *   - 16개 완전히 다른 인과 퍼즐 아키타입 (신규 기믹 6종 + 1단계 기믹 진화형 + 3/4층 S자·나선형 대장정)
 *   - 변형 파라미터(추가 관문, 함정 변주, 미끼 스킬 Decoy Economy, Y-시프트, 테마/암반 시드, 좌우 반전 mirrorX)
 *   - 모든 스테이지에 실물리(ForgeSim) 검증용 golden plan + 직관 오답 trapTests + 중복 방지 fingerprint 내장
 *   - portal: 0 엄격 준수, polygonRock 먼저 배치(강철 덮어쓰기 방지)
 * ==========================================================================*/
(function (root) {
  'use strict';

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  const THEMES = ['cyan', 'red', 'purple', 'brown', 'green'];
  const BGS = {
    cyan:   ['assets/bg_level_1.jpg', 'assets/bg_level_6.jpg'],
    red:    ['assets/bg_level_2.jpg', 'assets/bg_level_7.jpg'],
    purple: ['assets/bg_level_3.jpg', 'assets/bg_level_8.jpg'],
    brown:  ['assets/bg_level_4.jpg', 'assets/bg_level_9.jpg'],
    green:  ['assets/bg_level_5.jpg', 'assets/bg_level_1.jpg']
  };

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

  function sculptedMass(x, y, w, h, seed, opts = {}) {
    if (w < 14 || h < 14) return null;
    const r = (k) => {
      const s = Math.sin(seed * 127.1 + k * 311.7) * 43758.5453;
      return s - Math.floor(s);
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

  /**
   * 좌우 반전(mirrorX) 변환기:
   *   - 모든 지형 요소, 스폰, 웜홀, 점프패드, 대각선 빔, 플랜, 트랩 플랜을 x -> 800 - x 반전
   *   - NanoUnit은 항상 dir=+1(우측)로 스폰되므로, 반전된 스폰 우측에 얇은 강철 반사벽을 배치해
   *     스폰 직후 15틱 이내에 자동으로 dir=-1(좌측)로 전환되어 반전 맵을 완벽히 수행함!
   */
  function mirrorPlan(plan) {
    return (plan || []).map(step => {
      const s = Object.assign({}, step);
      if (s.at) {
        s.at = Object.assign({}, s.at, { x: 800 - s.at.x });
      }
      if (s.dir) s.dir = -s.dir;
      return s;
    });
  }

  function mirrorStageX(stage, bounceWallOffset = 20, skipMirrorBounce = false) {
    const els = stage.elements.map(e => {
      const c = Object.assign({}, e);
      if (c.type === 'polygonRock' && Array.isArray(c.points)) {
        c.points = c.points.map(p => ({ x: clamp(800 - p.x, 1, 799), y: p.y }));
        let minX = 800, maxX = 0;
        for (const p of c.points) { if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x; }
        c.x = minX;
        c.w = Math.max(12, maxX - minX);
      } else if (typeof c.x === 'number' && typeof c.w === 'number') {
        c.x = 800 - (c.x + c.w);
      }
      if (c.type === 'jumpPad') {
        if (c.dir === 'up-right') c.dir = 'up-left';
        else if (c.dir === 'up-left') c.dir = 'up-right';
      }
      if (c.type === 'diagonalBeam') {
        if (c.dir === 'downRight') { c.dir = 'downLeft'; c.slope = -1; }
        else if (c.dir === 'downLeft') { c.dir = 'downRight'; c.slope = 1; }
      }
      if (c.type === 'movingPlatform' && c.axis === 'horizontal') {
        c.x = 800 - (e.x + e.w + (e.range || 0));
        c.phase = 1.0 - (e.phase || 0);
      }
      return c;
    });

    const newSpawnX = 800 - stage.spawnX;
    const newGateX = 800 - stage.gateX;
    if (!skipMirrorBounce) {
      const wallX = clamp(newSpawnX + bounceWallOffset, 16, 780);
      const hasWallNear = els.some(e =>
        (e.type === 'steelPlatform' || e.type === 'rockWall') &&
        e.x >= newSpawnX + 4 && e.x <= newSpawnX + 46 &&
        e.y <= stage.spawnY + 12 && (e.y + e.h) >= stage.spawnY - 10
      );
      if (!hasWallNear) {
        els.push({ type: 'steelPlatform', x: wallX, y: Math.max(40, stage.spawnY - 26), w: 12, h: 48 });
      }
    }

    const polys = els.filter(e => e.type === 'polygonRock');
    const rest = els.filter(e => e.type !== 'polygonRock');
    return Object.assign({}, stage, {
      spawnX: newSpawnX,
      gateX: newGateX,
      elements: [...polys, ...rest],
      _meta: Object.assign({}, stage._meta, { mirrorX: true }),
      verification: {
        plan: mirrorPlan(stage.verification.plan),
        trapTests: (stage.verification.trapTests || []).map(t => ({
          name: t.name,
          plan: mirrorPlan(t.plan)
        }))
      }
    });
  }

  function finalizeStage(cfg, spec) {
    const theme = spec.theme || THEMES[spec.seed % THEMES.length];
    const bgList = BGS[theme] || BGS.cyan;
    const bgImg = spec.bgImg || bgList[spec.seed % bgList.length];

    const skills = makeSkills(cfg.skills);
    // Decoy Economy 적용 (정석엔 불필요하지만 플레이어를 유혹하는 미끼 스킬 1개 추가!)
    let decoyNote = '';
    if (spec.decoy && skills[spec.decoy] === 0) {
      skills[spec.decoy] = 1;
      decoyNote = ` [미끼 주의: ${spec.decoy.toUpperCase()} 1개는 함정 유인용!]`;
    }

    const cleanEls = cfg.elements.filter(Boolean);
    const polys = cleanEls.filter(e => e.type === 'polygonRock');
    const rest = cleanEls.filter(e => e.type !== 'polygonRock');

    const dna = [];
    for (const step of (cfg.plan || [])) {
      const tag = String(step.skill || '').toUpperCase();
      if (tag && !dna.includes(tag)) dna.push(tag);
    }

    let st = {
      id: spec.id,
      title: `[S${String(spec.id).padStart(3, '0')}] [${spec.diffLabel}] ${spec.name}`,
      bgImg,
      terrainTheme: theme,
      desc: cfg.desc + decoyNote,
      totalUnits: spec.totalUnits || cfg.totalUnits || 16,
      needPercent: spec.needPercent != null ? spec.needPercent : (cfg.needPercent != null ? cfg.needPercent : 100),
      spawnRate: spec.spawnRate || cfg.spawnRate || 24,
      timeLimit: cfg.timeLimit || 330,
      skills,
      spawnX: cfg.spawnX,
      spawnY: cfg.spawnY,
      gateX: cfg.gateX,
      gateY: cfg.gateY,
      solutionDna: dna,
      difficultyScore: spec.diffScore,
      elements: [...polys, ...rest],
      _meta: {
        generator: 'CausalGrammarEngine-v9-Phase2',
        family: cfg.family,
        variant: spec.variantKey,
        mirrorX: false,
        decoy: spec.decoy || null,
        difficulty: spec.diffKey,
        difficultyLabel: spec.diffLabel,
        difficultyScore: spec.diffScore,
        mechanics: cfg.mechanics,
        shortcutHint: cfg.shortcutHint,
        fingerprint: `${cfg.family}|${spec.variantKey}|${spec.mirrorX ? 'M' : 'N'}|${spec.decoy || 'none'}`
      },
      verification: {
        plan: cfg.plan,
        trapTests: cfg.trapTests
      }
    };

    if (spec.mirrorX) {
      st = mirrorStageX(st, cfg.mirrorBounceOffset || 22, !!cfg.skipMirrorBounce);
    }
    return st;
  }

  /* ==========================================================================
   * 1) SWITCHABLE JUMP PAD (신규 기믹 #1: 1패드 2목적지 궤도 전환!)
   *   - 공중 암석 반사판(x=432, y=204..232)이 있을 때: 점프패드가 u1을 중단 작업대(y=252)로 배달!
   *   - u1이 작업대에서 BUILD 비계로 공중 반사판에 접근해 BOMB으로 반사판+비계를 동시에 폭파 소거!
   *   - 공중 궤도가 완전히 열리면 이제 똑같은 점프패드가 뒤쪽 강철벽(x=468)까지 날아가
   *     본대 15/16 전원을 상단 웜홀 성소(y=160)로 쏘아 올림!
   * ========================================================================*/
  function buildSwitchablePad(spec) {
    const s = spec.seed;
    const extraGate = spec.variant === 1 || spec.variant === 2;
    const upperGap = spec.variant === 2;
    const elements = [
      sculptedMass(0, 0, 44, 449, s + 1),
      sculptedMass(756, 0, 44, 449, s + 2),
      sculptedMass(44, 0, 712, 36, s + 3),
      sculptedMass(44, 336, 712, 113, s + 4),
      sculptedMass(490, 36, 266, 298, s + 5),

      // 하단 스폰 및 발사대 (y=318, x=56..468)
      { type: 'steelPlatform', x: 52, y: 318, w: 416, h: 18 },
      { type: 'steelPlatform', x: 44, y: 36, w: 16, h: 300 },
      { type: 'rockWall', x: 186, y: 262, w: 24, h: 56 },
      { type: 'jumpPad', x: 380, y: 308, w: 32, h: 10, dir: 'up-right', power: 11.2 },

      // 뒤쪽 강철 핀볼 반사벽 (x=468, y=36..318)
      { type: 'steelPlatform', x: 468, y: 36, w: 20, h: 284 },
      // 스위치용 공중 암석 반사판 (x=432..456, y=204..232) — 1차 궤도를 중단 작업대로 반사!
      { type: 'rockWall', x: 432, y: 204, w: 24, h: 28 },

      // 중단 작업대 (y=252, x=240..406) + 좌측 반사턱(x=234)
      // u1이 BUILD로 반사판(x=432)에 접속 후 BOMB(반경32) 점화 → 반사판+비계 동시 폭파 소거!
      { type: 'steelPlatform', x: 240, y: 252, w: 166, h: 14 },
      { type: 'steelPlatform', x: 234, y: 206, w: 12, h: 60 },

      // 상단 Goal 성소 (y=160) — upperGap 변형 시 x=376에서 12px 일방통행 드롭(y=172) 후 20px 강철 단차(y=152)!
      // 일방통행 12px 드롭 덕분에 계단 건설 중 후발대가 절대로 우측 끝(x=430)으로 떨어지지 않음!
      upperGap
        ? { type: 'steelPlatform', x: 376, y: 160, w: 54, h: 28 }
        : { type: 'steelPlatform', x: 56, y: 160, w: 374, h: 16 },
      upperGap ? { type: 'steelPlatform', x: 286, y: 172, w: 90, h: 16 } : null,
      upperGap ? { type: 'steelPlatform', x: 56, y: 152, w: 230, h: 36 } : null,
      extraGate ? { type: 'rockWall', x: 182, y: (upperGap ? 152 : 160) - 56, w: 26, h: 56 } : null,
      extraGate ? { type: 'steelPlatform', x: 178, y: 36, w: 34, h: (upperGap ? 152 : 160) - 92 } : null
    ];

    const uY = upperGap ? 152 : 160;
    const skills = {
      climb: 1,
      build: upperGap ? 2 : 1,
      bomb: 1,
      bash: extraGate ? 2 : 1
    };

    const plan = [
      { skill: 'climb', unit: 1, at: { x: 166, y: 318, tol: 12 }, dir: 1, label: 'u1 격리벽 등반 → 점프패드 1차 궤도(중단 작업대) 착지' },
      { skill: 'build', unit: 1, at: { x: 396, y: 252, tol: 4 }, dir: 1, label: '작업대 우측 끝 BUILD 비계로 공중 반사판(x=432) 접속' },
      { skill: 'bomb', unit: 1, at: { x: 362, y: 252, tol: 5, ytol: 16 }, dir: -1, wait: 160, label: '좌향 이동 중 240틱(300px) 정밀 BOMB 점화 → 반사판+비계 동시 폭파 소거!' },
      { skill: 'bash', unit: 'crowd_lead', at: { x: 180, y: 318, tol: 8 }, dir: 1, wait: 260, label: '2차 궤도 개통 완료 후 본대 격리벽 BASH 해방 → 전원 상단 성소 도약!' }
    ];
    if (upperGap) {
      plan.push({ skill: 'build', unit: 'any', at: { x: 332, y: 172, tol: 5 }, dir: -1, label: '2차 궤도 일방통행 드롭 후 20px 강철 단차 좌향 BUILD' });
    }
    if (extraGate) {
      plan.push({ skill: 'bash', unit: 'any', at: { x: 214, y: uY, tol: 8 }, dir: -1, label: '상단 성소 출구 암벽 좌향 BASH' });
    }

    return finalizeStage({
      family: 'switchable_pad',
      spawnX: 96, spawnY: 300, gateX: 112, gateY: uY - 24,
      needPercent: 88, // 15/16 (선발대 BOMB 1명 희생)
      skills,
      mechanics: ['Switchable JumpPad (1 Pad → 2 Destinations)', 'BUILD Scaffolding + 240-Tick BOMB Self-Clearing', 'Pioneer Separation'],
      desc: '하나의 점프패드가 두 개의 목적지를 가집니다! 지금 상태로 점프하면 공중 암석 반사판에 튕겨 중단 작업대로만 갑니다. 선발대 1명이 1차 궤도로 작업대에 올라가 계단(BUILD) 비계를 깔고 시한폭탄(BOMB)으로 반사판과 비계를 동시에 폭파하면, 똑같은 점프패드가 뒤쪽 강철벽까지 날아가 본대를 상단 웜홀 성소로 쏘아 올립니다!',
      shortcutHint: 'u1 CLIMB(격리벽) → 1차 점프(작업대 y=252) → 우측 끝 BUILD 비계 → 좌향 복귀 중(x≈362) 240틱 BOMB(반사판+비계 동시 폭파) → 본대 격리벽 BASH 해방!',
      elements,
      plan,
      trapTests: [
        { name: '직관 오답 A: 반사판 제거 없이 본대 격리벽 즉시 BASH', plan: [{ skill: 'bash', unit: 1, at: { x: 180, y: 318, tol: 8 }, dir: 1 }] },
        { name: '직관 오답 B: 작업대 비계만 짓고 폭파하지 않음 (비계가 점프 궤도를 차단)', plan: [
          { skill: 'climb', unit: 1, at: { x: 166, y: 318, tol: 12 }, dir: 1 },
          { skill: 'build', unit: 1, at: { x: 396, y: 252, tol: 4 }, dir: 1 },
          { skill: 'bash', unit: 'crowd_lead', at: { x: 180, y: 318, tol: 8 }, dir: 1, wait: 220 }
        ] }
      ]
    }, spec);
  }

  /* ==========================================================================
   * 2) SELF-BREAKING DAM (신규 기믹 #2: BLOCK=0 자가 댐 건설 & 철거 100% 무희생!)
   *   - u1이 앞장서서 하류 함정(심연 틈새 / 함정 점프패드 / 출구 암벽)을 개척하는 동안,
   *     u2가 파괴 가능한 암석 천장(24px 여유고) 아래에서 BUILD로 자가 댐을 세워 본대를 안전 홀드!
   *   - u1이 모든 길을 완성하면, 홀드된 본대가 자신이 세운 BUILD 댐 + 암석 천장을 BASH로 부수고 100% 구출!
   * ========================================================================*/
  function buildSelfBreakingDam(spec) {
    const s = spec.seed;
    const withCursedPad = spec.variant === 1 || spec.variant === 3;
    const doubleGap = spec.variant === 2 || spec.variant === 3;
    const yFloor = 240 + ((spec.variant % 2) * 16);

    const elements = [
      sculptedMass(0, 0, 44, 449, s + 11),
      sculptedMass(756, 0, 44, 449, s + 12),
      sculptedMass(44, 0, 712, 68, s + 13),
      sculptedMass(44, yFloor + 34, 276, 449 - (yFloor + 34), s + 14),
      sculptedMass(doubleGap ? 416 : 386, yFloor + 34, 340, 449 - (yFloor + 34), s + 15),

      // 좌측 홀드 복도 + 파괴 가능 암석 천장 오버행(x=220..248, 24px 여유고!)
      { type: 'steelPlatform', x: 52, y: yFloor, w: 274, h: 18 },
      { type: 'steelPlatform', x: 44, y: 68, w: 16, h: yFloor - 50 },
      { type: 'rockWall', x: 220, y: yFloor - 52, w: 28, h: 28 }, // 하단 yFloor - 24!

      // 중앙 심연(42px 또는 72px 이중 계단)
      doubleGap
        ? { type: 'steelPlatform', x: 400, y: yFloor, w: 348, h: 18 }
        : { type: 'steelPlatform', x: 368, y: yFloor, w: 380, h: 18 },

      // 선택적 하류 함정 점프패드(트로프) 또는 2차 암벽
      withCursedPad
        ? { type: 'steelPlatform', x: 468, y: yFloor + 14, w: 46, h: 16 }
        : null,
      withCursedPad
        ? { type: 'jumpPad', x: 476, y: yFloor + 4, w: 28, h: 10, dir: 'up-left', power: 12.2 }
        : null,
      // 트로프가 있으면 x=468..514 구간의 강철바닥을 비워야 함 → 아래에서 깔끔히 분할!
      // 최종 출구 암벽 (x=612..642)
      { type: 'rockWall', x: 612, y: yFloor - 58, w: 30, h: 58 },
      { type: 'steelPlatform', x: 608, y: 68, w: 38, h: yFloor - 126 },
      { type: 'steelPlatform', x: 738, y: 68, w: 16, h: yFloor - 50 }
    ];

    // withCursedPad일 때 우측 강철바닥을 트로프 전후로 정확히 분할 (우측 yFloor-20 밀착!)
    let finalEls = elements.filter(Boolean);
    let gateY = yFloor - 24;
    if (withCursedPad) {
      finalEls = finalEls.filter(e => !(e.type === 'steelPlatform' && (e.x === 400 || e.x === 368) && e.y === yFloor));
      const startX = doubleGap ? 400 : 368;
      finalEls.push({ type: 'steelPlatform', x: startX, y: yFloor, w: 468 - startX, h: 18 });
      finalEls.push({ type: 'steelPlatform', x: 514, y: yFloor - 20, w: 234, h: 38 });
      // 출구 암벽과 Gate도 yFloor - 20에 맞춤!
      finalEls = finalEls.filter(e => !(e.type === 'rockWall' && e.x === 612) && !(e.type === 'steelPlatform' && e.x === 608));
      finalEls.push({ type: 'rockWall', x: 612, y: yFloor - 78, w: 30, h: 58 });
      finalEls.push({ type: 'steelPlatform', x: 608, y: 68, w: 38, h: yFloor - 146 });
      gateY = yFloor - 44;
    }

    const skills = {
      build: 1 + (doubleGap ? 2 : 1) + (withCursedPad ? 1 : 0),
      bash: 2 // 1: 자가 댐 철거, 1: 최종 암벽
    };

    const plan = [
      { skill: 'build', unit: 2, at: { x: 206, y: yFloor, tol: 4 }, dir: 1, label: 'u2 암석 천장 아래 BUILD 자가 댐 건설 (BLOCK=0 본대 홀드!)' },
      { skill: 'build', unit: 1, at: { x: 322, y: yFloor, tol: 5 }, dir: 1, label: '선발대 u1 중앙 심연 1차 BUILD 가교' }
    ];
    if (doubleGap) {
      plan.push({ skill: 'build', unit: 1, at: { x: 368, y: yFloor - 24, tol: 6, ytol: 12 }, dir: 1, wait: 160, label: '선발대 u1 74px 광폭 심연 2차 연쇄 BUILD' });
    }
    if (withCursedPad) {
      plan.push({ skill: 'build', unit: 1, at: { x: 466, y: yFloor, tol: 4 }, dir: 1, label: '선발대 u1 하류 함정 점프패드 BUILD 과교 봉인' });
    }
    const exitY = withCursedPad ? yFloor - 20 : yFloor;
    plan.push({ skill: 'bash', unit: 1, at: { x: 606, y: exitY, tol: 8 }, dir: 1, label: '선발대 u1 최종 출구 암벽 BASH 돌파' });
    plan.push({ skill: 'bash', unit: 'crowd_lead', at: { x: 208, y: yFloor - 8, tol: 16, ytol: 16 }, dir: 1, wait: 140, label: '완공 후 본대가 자신이 세운 BUILD 댐을 BASH로 철거 → 100% 무희생 구출!' });

    return finalizeStage({
      family: 'self_breaking_dam',
      spawnX: 90, spawnY: yFloor - 18, gateX: 696, gateY,
      skills,
      mechanics: ['Zero-BLOCK Self-Breaking BUILD Dam', 'Pioneer Ahead Prep', doubleGap ? '74px Double-Stair Chasm' : 'Chasm BUILD', withCursedPad ? 'Cursed JumpPad Overpass' : 'Timed Dam BASH Release'],
      desc: '방어막(BLOCK)도 폭탄(BOMB)도 0개인데 100% 전원 구출! u1이 혼자 심연을 건너는 동안 후발대가 따라오면 전원 추락합니다. u2가 암석 천장(24px 높이) 아래에 계단(BUILD)으로 자가 댐을 세워 본대를 가둔 뒤, u1이 길을 다 열면 그 댐을 BASH로 부숴 전원을 해방하세요!',
      shortcutHint: 'u1 선행 통과 → u2 암석 천장 아래(x≈206) BUILD 댐 봉인 → u1 심연 가교(+함정패드 과교) & 출구 BASH → 본대가 BUILD 댐을 직접 BASH로 철거해 100% 구출!',
      elements: finalEls,
      plan,
      trapTests: [
        { name: '직관 오답 A: 자가 댐 홀드 없이 u1만 바로 중앙 심연 BUILD (후발대 추락)', plan: [{ skill: 'build', unit: 1, at: { x: 322, y: yFloor, tol: 5 }, dir: 1 }] },
        { name: '직관 오답 B: 자가 댐만 세우고 철거하지 않음', plan: plan.slice(0, plan.length - 1) }
      ]
    }, spec);
  }

  /* ==========================================================================
   * 3) MONOLITH L/Z-CARVE (신규 기믹 #3: 거대 암반 내부 MINE → 중도 BASH 캔슬 L자·Z자 굴착!)
   *   - 화면을 가로막는 육중한 거대 암반! 끝까지 대각선 MINE으로 파면 하단 216px 낙사!
   *   - 정확히 안전 높이(yMid=208)에서 MINE을 BASH로 캔슬해 부드러운 진입로 + 수평 터널 개척!
   *   - Z-carve 변형은 2차 거대 암반에서도 MINE → BASH 연쇄 중도 캔슬!
   * ========================================================================*/
  function buildMonolithCarve(spec) {
    const s = spec.seed;
    const isZ = spec.variant === 1 || spec.variant === 3;
    const withGap = spec.variant === 2 || spec.variant === 3;
    const yTop = 128;
    const yMid = 208;
    const yBot = 284;

    const elements = [
      sculptedMass(0, 0, 44, 449, s + 21),
      sculptedMass(756, 0, 44, 449, s + 22),
      sculptedMass(44, 0, 712, 46, s + 23),
      sculptedMass(44, 360, 712, 89, s + 24),

      // 상단 좌측 스폰 데크 (y=128)
      { type: 'steelPlatform', x: 52, y: yTop, w: 108, h: 16 },
      { type: 'steelPlatform', x: 44, y: 46, w: 16, h: 316 },

      // 거대 굴착 가능 암반 모노리스 #1 (x=160..348, y=128..318)
      // 내부 우측 중층에 숨겨진 강철 착지판(x=264..348, y=208) → MINE이 턱(sump) 없이 y=208에 밀착 정지 → BASH로 수평 L자 관통!
      // 너무 일찍(좌측) MINE하거나 DRILL하면 강철판을 빗나가 하단 344로 치사 추락!
      { type: 'rockWall', x: 160, y: yTop, w: 188, h: 190 },
      { type: 'steelPlatform', x: 264, y: yMid, w: 84, h: 16 },
      { type: 'steelPlatform', x: 256, y: 46, w: 92, h: 82 },

      // 중층 숨겨진 통로 (y=208)
      isZ
        ? { type: 'steelPlatform', x: 348, y: yMid, w: 56, h: 16 }
        : (withGap
          ? { type: 'steelPlatform', x: 348, y: yMid, w: 152, h: 16 }
          : { type: 'steelPlatform', x: 348, y: yMid, w: 400, h: 16 }),

      (!isZ && withGap) ? { type: 'steelPlatform', x: 500, y: yMid - 20, w: 248, h: 36 } : null,
      (!isZ) ? { type: 'rockWall', x: 580, y: (withGap ? yMid - 20 : yMid) - 58, w: 28, h: 58 } : null,
      (!isZ) ? { type: 'steelPlatform', x: 576, y: 46, w: 36, h: (withGap ? yMid - 20 : yMid) - 104 } : null,

      // Z-carve: 2차 거대 모노리스 (x=404..574, y=208..348) + 내부 중층 강철 착지판(x=502..574, y=284)
      isZ ? { type: 'rockWall', x: 404, y: yMid, w: 170, h: 140 } : null,
      isZ ? { type: 'steelPlatform', x: 502, y: yBot, w: 72, h: 16 } : null,
      isZ ? { type: 'steelPlatform', x: 492, y: 46, w: 82, h: 162 } : null,
      isZ ? { type: 'steelPlatform', x: 574, y: yBot, w: 174, h: 16 } : null,
      isZ && withGap ? { type: 'rockWall', x: 616, y: yBot - 58, w: 26, h: 58 } : null,
      isZ && withGap ? { type: 'steelPlatform', x: 612, y: 46, w: 34, h: yBot - 104 } : null,

      // 하단 치사 바닥 (y=344)
      { type: 'steelPlatform', x: 52, y: 344, w: 520, h: 18 },
      { type: 'steelPlatform', x: 738, y: 46, w: 16, h: 316 }
    ];

    const skills = {
      mine: isZ ? 2 : 1,
      bash: isZ ? (withGap ? 3 : 2) : 2,
      build: (!isZ && withGap) ? 1 : 0
    };

    const plan = [
      { skill: 'mine', unit: 1, at: { x: 184, y: yTop, tol: 5 }, dir: 1, label: '거대 모노리스 상단 대각선 MINE 진입 → 내부 중층 강철판(y=208)에 밀착 정지' },
      { skill: 'bash', unit: 1, at: { x: 274, y: yMid, tol: 14, ytol: 10 }, state: 'WALKING', dir: 1, label: '내부 강철판 위에서 BASH 전환 → L자 비밀 갱도 관통!' }
    ];
    if (isZ) {
      plan.push({ skill: 'mine', unit: 1, at: { x: 426, y: yMid, tol: 5 }, dir: 1, label: '2차 모노리스 대각선 MINE 진입 → 2차 내부 강철판(y=284) 착지' });
      plan.push({ skill: 'bash', unit: 1, at: { x: 512, y: yBot, tol: 14, ytol: 10 }, state: 'WALKING', dir: 1, label: '2차 내부 강철판 위에서 BASH 전환 → Z자 비밀 갱도 완성!' });
      if (withGap) {
        plan.push({ skill: 'bash', unit: 1, at: { x: 610, y: yBot, tol: 8 }, dir: 1, label: '최종 성소 수문 BASH' });
      }
    } else {
      if (withGap) {
        plan.push({ skill: 'build', unit: 1, at: { x: 456, y: yMid, tol: 5 }, dir: 1, label: '중층 20px 강철 단차 BUILD 계단 건설' });
        plan.push({ skill: 'bash', unit: 1, at: { x: 574, y: yMid - 20, tol: 8 }, dir: 1, label: '최종 암벽 BASH 돌파' });
      } else {
        plan.push({ skill: 'bash', unit: 1, at: { x: 574, y: yMid, tol: 8 }, dir: 1, label: '최종 암벽 BASH 돌파' });
      }
    }

    const gateY = isZ ? (yBot - 24) : (withGap ? yMid - 44 : yMid - 24);
    return finalizeStage({
      family: 'monolith_l_carve',
      spawnX: 88, spawnY: yTop - 18, gateX: 696, gateY,
      skills,
      mechanics: [isZ ? 'Double Monolith Z-Carve (MINE→BASH→MINE→BASH)' : 'Giant Monolith L-Carve (Mid-Shaft MINE→BASH Cancel)', 'Safe-Depth Interception'],
      desc: isZ
        ? '화면을 가로막은 2개의 거대 암반 모노리스! 대각선 굴착(MINE)을 끝까지 하면 하단 치사 바닥으로 추락합니다. 정확히 중층 높이에서 BASH로 수평 꺾고, 2차 암반에서도 다시 MINE → BASH로 Z자 비밀 갱도를 파내세요!'
        : '거대한 단단한 암반 산맥이 길을 막고 있습니다. 대각선 굴착(MINE)을 끝까지 하면 하단으로 추락해 전멸! 정확히 중층 통로 높이에서 BASH로 중도 캔슬해 암반 내부에 L자 비밀 갱도를 뚫으세요.',
      shortcutHint: isZ
        ? '1차 모노리스(x=178) MINE → y=206에서 BASH 캔슬 → 2차 모노리스(x=422) MINE → y=282에서 BASH 캔슬!'
        : '모노리스(x=178) MINE → y=206(중층 통로 높이)에서 BASH 캔슬 → 우측 통로 관통!',
      elements,
      plan,
      trapTests: [
        { name: '직관 오답 A: 모노리스를 끝까지 MINE (하단 추락/고립)', plan: [{ skill: 'mine', unit: 1, at: { x: 178, y: yTop, tol: 6 }, dir: 1 }] },
        { name: '직관 오답 B: 상단에서 바로 BASH (강철 코어에 차단)', plan: [{ skill: 'bash', unit: 1, at: { x: 248, y: yTop, tol: 10 }, dir: 1 }] }
      ]
    }, spec);
  }

  /* ==========================================================================
   * 4) DOUBLE-STAIR INTERLOCK (신규 기믹 #4: 74px 광폭 심연 2연쇄 계단 + 선발대 분리)
   *   - 74px 광폭 심연은 BUILD 2번을 이어 붙여야 건널 수 있음.
   *   - 본대를 바로 데려가면 1차 계단 완공 순간 후발대가 심연으로 추락!
   *   - 변형 0/2: CLIMB 격리벽 선발대 분리 → 2연쇄 BUILD → 출구 BASH → 본대 해방
   *   - 변형 1/3: 100% Blocker-Freeing DRILL + 74px 광폭 심연 2연쇄 BUILD!
   * ========================================================================*/
  function buildDoubleStairInterlock(spec) {
    const s = spec.seed;
    const useBlockerFree = (spec.variant % 2) === 1;
    const withCursedPad = spec.variant >= 2;
    const yBase = 248;

    if (useBlockerFree) {
      // 상단 암석 금고(y=160) → u1 상단 42px 가교 + 활강 빔 → 하단(y=248) 74px 광폭 심연 2연쇄 BUILD → 출구 BASH → u2 BLOCK 직접 DRILL 해제!
      const elements = [
        sculptedMass(0, 0, 44, 449, s + 31),
        sculptedMass(756, 0, 44, 449, s + 32),
        sculptedMass(44, 0, 712, 54, s + 33),
        sculptedMass(44, 278, 376, 171, s + 34),
        sculptedMass(500, 278, 256, 171, s + 35),

        { type: 'steelPlatform', x: 50, y: 160, w: 66, h: 16 },
        { type: 'platform', x: 116, y: 160, w: 106, h: 16 },
        { type: 'steelPlatform', x: 44, y: 54, w: 16, h: 226 },
        { type: 'steelPlatform', x: 262, y: 160, w: 72, h: 16 },
        { type: 'diagonalBeam', x: 334, y: 160, w: 58, h: 58, dir: 'downRight', slope: 1, isSteel: true },

        // 하단 고속도로 y=248 + 74px 광폭 심연 (x=422..496)!
        { type: 'steelPlatform', x: 50, y: yBase, w: 372, h: 20 },
        { type: 'steelPlatform', x: 496, y: yBase, w: 252, h: 20 },
        { type: 'rockWall', x: 604, y: yBase - 60, w: 30, h: 60 },
        { type: 'steelPlatform', x: 600, y: 54, w: 38, h: yBase - 114 },
        { type: 'steelPlatform', x: 738, y: 54, w: 16, h: 226 }
      ];

      return finalizeStage({
        family: 'double_stair_interlock',
        spawnX: 90, spawnY: 142, gateX: 696, gateY: yBase - 24,
        skills: { block: 1, build: 3, bash: 1, drill: 1 },
        mechanics: ['74px Double-Stair Chasm Interlock', '100% Blocker-Freeing DRILL', '45° Steel Diagonal Slide'],
        desc: '하단의 74px 광폭 심연은 계단 1개(48px)로는 절대 닿지 않아 2연쇄 BUILD가 필요합니다! 바로 내려보내면 전멸합니다. u1이 선행해 상단 다리와 하단 2연쇄 계단, 출구까지 완공하는 동안 u2가 암석 바닥 위에서 BLOCK으로 홀드한 뒤, u2에게 직접 DRILL을 걸어 100% 전원 구출하세요!',
        shortcutHint: 'u1 상단 틈새(x=218) BUILD → u2 암석 바닥(x=178) BLOCK → u1 74px 심연 2연쇄 BUILD(x=418, x=464) → 출구 BASH → u2(BLOCK) 직접 DRILL 해제!',
        elements,
        plan: [
          { skill: 'build', unit: 1, at: { x: 218, y: 160, tol: 5 }, dir: 1, label: 'u1 상단 틈새 BUILD 선행' },
          { skill: 'block', unit: 2, at: { x: 178, y: 160, tol: 8 }, dir: 1, label: 'u2 암석 바닥 위 BLOCK 홀드' },
          { skill: 'build', unit: 1, at: { x: 418, y: yBase, tol: 4 }, dir: 1, label: 'u1 하단 74px 광폭 심연 1차 BUILD' },
          { skill: 'build', unit: 1, at: { x: 464, y: yBase - 24, tol: 6, ytol: 12 }, dir: 1, wait: 160, label: 'u1 하단 74px 광폭 심연 2차 연쇄 BUILD' },
          { skill: 'bash', unit: 1, at: { x: 598, y: yBase, tol: 8 }, dir: 1, label: 'u1 출구 암벽 BASH' },
          { skill: 'drill', unit: 'blocker', at: { x: 178, y: 160, tol: 14 }, wait: 140, label: '완공 후 u2(BLOCK) 직접 DRILL 해제 → 100% 구출!' }
        ],
        trapTests: [
          { name: '직관 오답 A: 홀드 없이 바로 암석 바닥 DRILL', plan: [{ skill: 'drill', unit: 1, at: { x: 178, y: 160, tol: 8 }, dir: 1 }] },
          { name: '직관 오답 B: 74px 심연에 BUILD 1개만 시도', plan: [
            { skill: 'build', unit: 1, at: { x: 218, y: 160, tol: 5 }, dir: 1 },
            { skill: 'block', unit: 2, at: { x: 178, y: 160, tol: 8 }, dir: 1 },
            { skill: 'build', unit: 1, at: { x: 418, y: yBase, tol: 4 }, dir: 1 }
          ] }
        ]
      }, spec);
    }

    // CLIMB 격리벽 선발대 분리 + 74px 광폭 심연 (+선택적 함정 패드 과교)
    const elements = [
      sculptedMass(0, 0, 44, 449, s + 36),
      sculptedMass(756, 0, 44, 449, s + 37),
      sculptedMass(44, 0, 712, 66, s + 38),
      sculptedMass(44, 286, 224, 163, s + 39),
      sculptedMass(348, 286, 408, 163, s + 40),

      { type: 'steelPlatform', x: 50, y: 262, w: 222, h: 20 },
      { type: 'steelPlatform', x: 44, y: 66, w: 16, h: 216 },
      { type: 'rockWall', x: 176, y: 202, w: 24, h: 60 },
      // 74px 광폭 심연 (x=272..346)!
      withCursedPad
        ? { type: 'steelPlatform', x: 346, y: 262, w: 112, h: 20 }
        : { type: 'steelPlatform', x: 346, y: 262, w: 402, h: 20 },
      withCursedPad ? { type: 'steelPlatform', x: 458, y: 278, w: 46, h: 16 } : null,
      withCursedPad ? { type: 'jumpPad', x: 466, y: 268, w: 28, h: 10, dir: 'up-left', power: 12.2 } : null,
      withCursedPad ? { type: 'steelPlatform', x: 504, y: 242, w: 244, h: 40 } : null,

      { type: 'rockWall', x: 600, y: (withCursedPad ? 242 : 262) - 58, w: 30, h: 58 },
      { type: 'steelPlatform', x: 596, y: 66, w: 38, h: (withCursedPad ? 242 : 262) - 124 },
      { type: 'steelPlatform', x: 738, y: 66, w: 16, h: 216 }
    ];

    const exitY = withCursedPad ? 242 : 262;
    const plan = [
      { skill: 'climb', unit: 1, at: { x: 158, y: 262, tol: 12 }, dir: 1, label: '선발대 u1 격리벽 CLIMB 단독 출격' },
      { skill: 'build', unit: 1, at: { x: 268, y: 262, tol: 4 }, dir: 1, label: 'u1 74px 광폭 심연 1차 BUILD' },
      { skill: 'build', unit: 1, at: { x: 314, y: 238, tol: 6, ytol: 12 }, dir: 1, wait: 160, label: 'u1 74px 광폭 심연 2차 연쇄 BUILD 완공' }
    ];
    if (withCursedPad) {
      plan.push({ skill: 'build', unit: 1, at: { x: 456, y: 262, tol: 4 }, dir: 1, label: 'u1 하류 함정 점프패드 BUILD 과교 봉인' });
    }
    plan.push({ skill: 'bash', unit: 1, at: { x: 594, y: exitY, tol: 8 }, dir: 1, label: 'u1 최종 출구 암벽 BASH 개통' });
    plan.push({ skill: 'bash', unit: 'crowd_lead', at: { x: 170, y: 262, tol: 8 }, dir: 1, wait: 140, label: '전 구간 완공 후 본대 격리벽 BASH 해방 → 100% 구출!' });

    return finalizeStage({
      family: 'double_stair_interlock',
      spawnX: 94, spawnY: 244, gateX: 696, gateY: exitY - 24,
      skills: { climb: 1, build: withCursedPad ? 3 : 2, bash: 2 },
      mechanics: ['Pioneer Separation CLIMB', '74px Double-Stair Chasm Interlock', withCursedPad ? 'Cursed JumpPad Overpass' : 'Delayed Horde Release'],
      desc: '74px 광폭 심연은 계단 2개를 연속으로 이어야 건널 수 있습니다! 격리벽을 바로 뚫고 본대와 함께 가면 1차 계단 끝에서 후발대가 전원 추락합니다. 선발대 1명만 등반(CLIMB)해 2연쇄 다리를 완공한 뒤 본대를 해방하세요!',
      shortcutHint: 'u1 CLIMB → 74px 심연 2연쇄 BUILD → 출구 BASH → 본대 격리벽 BASH 해방',
      elements,
      plan,
      trapTests: [
        { name: '직관 오답 A: 격리벽 즉시 BASH 후 1차 계단만 시도', plan: [
          { skill: 'bash', unit: 1, at: { x: 170, y: 262, tol: 8 }, dir: 1 },
          { skill: 'build', unit: 1, at: { x: 268, y: 262, tol: 4 }, dir: 1 }
        ] },
        { name: '직관 오답 B: 선발대가 2연쇄 BUILD 없이 바로 출발', plan: [{ skill: 'climb', unit: 1, at: { x: 158, y: 262, tol: 12 }, dir: 1 }] }
      ]
    }, spec);
  }

  /* ==========================================================================
   * 5) SPLIT & CONVERGE CO-OP (신규 기믹 #5: A조 상단 / B조 하단 양동 작전!)
   *   - u1(A조): 우측 격리벽 CLIMB → 상단 천공 루트로 이동해 중앙 웜홀 상부 암석 잠금/스포일러 제거
   *   - u2(B조): 우측 격리벽 CLIMB+FLOAT → 하단 대강당으로 내려가 u1 반사 또는 역방향 완충/경사로 개척
   *   - 본대: 하강 후 A조·B조가 동시에 완성한 루트를 통해 중앙/우측 웜홀에서 합류!
   * ========================================================================*/
  function buildSplitConverge(spec) {
    const s = spec.seed;
    const withStep = (spec.variant % 2) === 1;
    const yTop = 146;
    const yBot = 258; // 낙차 112px 치사!

    // 좌측 스폰(y=146) → u1(A조)은 상단 점프패드/다리로 우측 성채 상단(y=170) 진입해 MINE 역경사로 + 출구 BASH!
    // u2(B조)는 CLIMB+FLOAT으로 하단(y=258) 하강 → u3가 아니라 우측 성채 벽(x=396)에 반사되어 좌측으로 걸어와
    // 스폰 아래(x=162) 역방향 BUILD 낙하 완충 발판 건설!
    // → A조(상단 성채 MINE+출구) + B조(하단 낙하 완충) 동시 양동 작전! (BLOCK=0!)
    const elements = [
      sculptedMass(0, 0, 44, 449, s + 41),
      sculptedMass(756, 0, 44, 449, s + 42),
      sculptedMass(44, 0, 712, 46, s + 43),
      sculptedMass(44, 282, 712, 167, s + 44),

      // 상단 좌측 스폰 격실 (y=146: 강철 + 암석 포켓 x=104..144 + 강철)
      { type: 'steelPlatform', x: 50, y: yTop, w: 54, h: 16 },
      { type: 'platform', x: 104, y: yTop, w: 40, h: 16 },
      { type: 'steelPlatform', x: 144, y: yTop, w: 50, h: 16 },
      { type: 'steelPlatform', x: 44, y: 46, w: 16, h: 240 },
      // 스폰 우측 등반벽 (x=194, 높이 44px — CLIMB=2: A조 u1 + B조 u2 출격!)
      { type: 'steelPlatform', x: 194, y: yTop - 44, w: 16, h: 60 },

      // 분기 선반 (x=210..312, y=146): 점프패드(x=270)는 A조 u1이 밟고 상단 성채로!
      // B조 u2는 점프패드 직전(x=242)에 암석 바닥(x=224..260)을 DRILL? 아니! 더 깔끔한 분기:
      // 점프패드 없이도! 선반 끝에 틈새가 있고:
      //   u1(A조)은 BUILD로 상단 공중 다리를 건너 성채 상단(x=396, y=170) 진입 → MINE 역경사로 + 출구 BASH!
      //   u2(B조)는 FLOAT 장착 후 선반 아래로 낙하 → 성채 좌측 벽(x=396)에 반사(dir=-1) → 스폰 아래 역방향 BUILD 완충!
      // 잠깐! u1이 상단 다리를 지으면 u2도 다리를 건너지 않나?
      // → u2(B조)가 먼저 CLIMB+FLOAT으로 떨어져(아직 다리 없음!) 하단 완충 작업을 시작하고,
      //   그 다음 u1(A조)이 CLIMB+BUILD로 상단 다리를 지어 성채 상단으로 건너간다!!
      // OH!! 진짜 A조·B조 분기(하단 낙하 팀 vs 상단 가교 팀)!!
      { type: 'steelPlatform', x: 210, y: yTop, w: 80, h: 16 }, // x=290 끝!
      // 상단 44px 하늘 틈새 (x=290..334) → 성채 상단 연결 선반 (x=334..404, y=146) → 계단 낙하(24px) → 성채(y=170)!
      { type: 'steelPlatform', x: 334, y: yTop, w: 72, h: 16 },

      // 거대 굴착 성채 (x=406..514, w=108, y=170..258, h=88)
      { type: 'rockWall', x: 406, y: 170, w: 108, h: 88 },
      { type: 'steelPlatform', x: 514, y: 170, w: 234, h: 16 },
      { type: 'rockWall', x: 616, y: 112, w: 28, h: 58 },
      { type: 'steelPlatform', x: 612, y: 46, w: 36, h: 66 },
      { type: 'steelPlatform', x: 738, y: 46, w: 16, h: 240 },

      // 하단 대강당 (y=258) — withStep 변형이면 x=250에 낮은 8px 이하? 아니 성채 좌측 하단(y=258) 바닥 연속
      { type: 'steelPlatform', x: 50, y: yBot, w: 698, h: 22 },
      // withStep 변형: 출구 직전에 2차 암벽 하나 추가
      withStep ? { type: 'rockWall', x: 556, y: 112, w: 24, h: 58 } : null,
      withStep ? { type: 'steelPlatform', x: 552, y: 46, w: 32, h: 66 } : null
    ];

    const plan = [
      // B조(u1): 먼저 등반+역추진으로 하단 추락 → 성채 벽(x=406) 반사 → 스폰 아래 역방향 BUILD 완충!
      { skill: 'climb', unit: 1, at: { x: 174, y: yTop, tol: 12 }, dir: 1, label: 'B조(u1) 격리벽 등반 (하단 완충 임무)' },
      { skill: 'float', unit: 1, at: { x: 250, y: yTop, tol: 24, ytol: 30 }, state: 'any', label: 'B조(u1) 역추진 장착 → 틈새로 하단 안전 하강' },
      // A조(u2): 등반 → 상단 44px 틈새 BUILD로 건너 성채 상단 점령!
      { skill: 'climb', unit: 2, at: { x: 174, y: yTop, tol: 12 }, dir: 1, label: 'A조(u2) 격리벽 등반 (상단 성채 임무)' },
      { skill: 'build', unit: 2, at: { x: 286, y: yTop, tol: 5 }, dir: 1, label: 'A조(u2) 상단 하늘 틈새 BUILD → 성채 상단 진입!' },
      // B조(u1) 하단에서 성채 벽(x=406) 반사 후 스폰 아래 역방향 BUILD 완충!
      { skill: 'build', unit: 1, at: { x: 162, y: yBot, tol: 5 }, dir: -1, label: 'B조(u1) 성채 벽 반사 후 스폰 아래 역방향 BUILD 완충 발판!' },
      // A조(u2) 상단 성채 출구 반사 후 좌하향 MINE 역경사로 굴착!
      { skill: 'mine', unit: 2, at: { x: 506, y: 170, tol: 8 }, dir: -1, label: 'A조(u2) 성채 상단에서 양방향 MINE 경사로 굴착!' },
      // 본대 스폰 DRILL 안전 하강 → MINE 경사로 역등반 → 출구 BASH 합류!
      { skill: 'drill', unit: 'crowd_lead', at: { x: 122, y: yTop, tol: 5 }, wait: 180, label: 'A·B조 동시 완공 후 본대 스폰 바닥 DRILL 안전 하강!' }
    ];
    if (withStep) {
      plan.push({ skill: 'bash', unit: 'any', at: { x: 550, y: 170, tol: 8 }, dir: 1, label: '성채 1차 암벽 BASH' });
    }
    plan.push({ skill: 'bash', unit: 'any', at: { x: 610, y: 170, tol: 8 }, dir: 1, label: '성채 최종 출구 BASH → A·B조+본대 100% 합류 구출!' });

    return finalizeStage({
      family: 'split_converge_coop',
      spawnX: 90, spawnY: yTop - 18, gateX: 700, gateY: 146,
      skills: { climb: 2, float: 1, build: 2, mine: 1, drill: 1, bash: withStep ? 2 : 1 },
      mechanics: ['Split & Converge Co-op (Team A Upper / Team B Lower)', 'Zero-BLOCK Reverse BUILD Cushion', 'Two-Way MINE Ramp'],
      desc: '방어막(BLOCK)은 0개, 역추진(FLOAT)은 1개! 선발대 2명을 상·하 양동 작전으로 분리하세요. B조(u1)는 먼저 다리가 없는 틈새로 역추진 하강해 성채 벽에 튕겨 스폰 아래 완충 발판을 짓고, A조(u2)는 뒤따라 상단 틈새에 다리를 놓아 성채 위에서 양방향 MINE 경사로를 파내려와 본대와 합류합니다!',
      shortcutHint: 'u1 CLIMB+FLOAT(하단 낙하→성채벽 반사→스폰 아래 역방향 BUILD) / u2 CLIMB→상단 틈새 BUILD→성채 상단 MINE 하강 → 본대 DRILL 하강 후 합류·BASH!',
      elements,
      plan,
      trapTests: [
        { name: '직관 오답 A: 스폰 바닥 즉시 DRILL (112px 전원 낙사)', plan: [{ skill: 'drill', unit: 1, at: { x: 122, y: yTop, tol: 6 } }] },
        { name: '직관 오답 B: u1이 먼저 상단 다리를 지어버려 하단 완충팀 분리 실패', plan: [
          { skill: 'climb', unit: 1, at: { x: 174, y: yTop, tol: 12 }, dir: 1 },
          { skill: 'build', unit: 1, at: { x: 286, y: yTop, tol: 5 }, dir: 1 },
          { skill: 'bash', unit: 1, at: { x: 610, y: 170, tol: 8 }, dir: 1 }
        ] }
      ]
    }, spec);
  }

  /* ==========================================================================
   * 6) 3-TIER SERPENTINE MARATHON (신규 기믹 #6: 3층 S자 사행 대장정 ~1,700px!)
   *   - 1층(y=118, 좌→우): 낮은 천장(24px) 헤드봉크 반전(BLOCK=0) + 좌측 20px 뒷문 240틱 BOMB(또는 혼합바닥 DRILL)
   *   - 2층(y=214, 좌→우): 함정 점프패드 BUILD 과교 봉인 + 20px 강철 단차 상승
   *   - 3층(y=312, 우→좌): 46px 극후 최종 암벽 단일 BASH 돌파 → 하단 좌측 웜홀!
   * ========================================================================*/
  function buildSerpentine3Tier(spec) {
    const s = spec.seed;
    const useBomb = (spec.variant % 2) === 0;
    const withExtraWall = spec.variant >= 2;
    const y1 = 122, y2 = 216, y3 = 310;

    if (useBomb) {
      // 1층: BLOCK=0 천장 헤드봉크 반전 → 좌측 20px 벽 240틱 BOMB → 2층 안전 착지(94px -> 82px 안전!)
      // 잠깐! y1=122 → y2=204 (낙차 82px 안전!), y2=204 → y3=290 (낙차 86px 안전!)
      const l1 = 122, l2 = 204, l3 = 290;
      const elements = [
        sculptedMass(0, 0, 44, 449, s + 51),
        sculptedMass(756, 0, 44, 449, s + 52),
        sculptedMass(44, 0, 712, 34, s + 53),
        sculptedMass(44, 314, 712, 135, s + 54),

        // 1층 (y=122, x=110..448): 우측 끝 떨어지면 y=290까지 168px 즉사!
        { type: 'steelPlatform', x: 110, y: l1, w: 338, h: 16 },
        { type: 'steelPlatform', x: 384, y: l1 - 52, w: 68, h: 28 }, // 24px 여유고 천장!
        { type: 'rockWall', x: 112, y: l1 - 48, w: 20, h: 48 },
        { type: 'steelPlatform', x: 108, y: 34, w: 28, h: l1 - 82 },
        { type: 'steelPlatform', x: 48, y: 34, w: 18, h: 280 },

        // 2층 (y=204, x=54..686): 중앙 20px 강철 단차 상승(x=440 → y=184) + 우측 끝 x=686에서 3층 안전 하강!
        // 단, 1층 우측 끝(x=448)에서 바로 떨어지면 l2(y=204)에 안전 착지하지 않도록 l2 좌측은 x=54..416까지만 두고
        // 아니! 1층 우측 x=448 바로 아래엔 함정 점프패드? 아니면 1층을 우측(x=360..710)이 아닌 x=110..448에 두고
        // 2층 x=448~520 구간을 20px 강철 단차 대신 **함정 점프패드(up-left)**로 배치하면 1층에서 떨어져도 패드/심연 직행!
        // 더 깔끔하게: 1층 끝 x=448 아래 x=426..518엔 바닥이 비어있거나(치사 낙차 168px), 2층 바닥이 x=54..420 → BUILD 가교(420..458? 아니 x=458은 448과 겹침) →
        // 1층을 x=110..418로 30px 왼쪽으로 당기고, 2층에 함정 패드를 x=394..440에 배치하면 1층에서 떨어지면 그대로 함정 패드/심연!
        // 가장 깔끔하고 100% 직관적인 S자 배치:
        //   1층(y=122): x=110..448 → 우측 끝(x=448)에 **높이 72px 강철 가벽(x=448..510, y=122..290? 아니 2층이 막힘!)**
        //   아니! 2층이 x=54..680(y=204)이면, 1층 우측 끝(x=448)에서 떨어지면 y=204로 안전 착지해버리잖아!
        //   그걸 원천 차단하는 천재적 방법: **1층 바닥 바로 오른쪽(x=448..748)은 2층이 없고, 2층이 y=240(낙차 118px > 96px LETHAL!)**!!
        //   그리고 좌측 20px 벽 너머(x=54..110)에만 **중간 안전 발판(y=184, 낙차 62px → y=240 낙차 56px)**이 있다!!
        //   BINGO!! 확인:
        //     - 1층 우측 끝(x=448, y=122) → 2층(y=240): 118px > 96px 전원 즉사!!
        //     - 1층 좌측 20px 벽 돌파 → 좌측 안전 스텝(y=182, x=54..112): 60px 안전 → 2층(y=240): 58px 안전!!
        //     - 2층(y=240, x=54..686): 우측 x=686까지 행군(중간 20px 강철 단차 y=240→220 + 중간 암벽!) → 우측 끝(x=686)에서 3층(y=312, 낙차 92px 안전? y=220→304 = 84px 안전!) 착지 → 좌측으로 행군(우→좌)!
        //     - 3층(y=304, x=54..744): 좌측으로 돌아오며 **46px 극후 최종 암벽(x=340..386)**을 아껴둔 BASH로 돌파 → 좌측 하단 웜홀(x=120, y=280)!!
        { type: 'steelPlatform', x: 54, y: 182, w: 66, h: 14 }, // 좌측 안전 중간 스텝!
        { type: 'steelPlatform', x: 54, y: 240, w: 340, h: 16 }, // 2층 좌측
        { type: 'steelPlatform', x: 394, y: 220, w: 296, h: 36 }, // 2층 우측 (20px 강철 단차 상승!)
        { type: 'steelPlatform', x: 736, y: 34, w: 18, h: 288 }, // 우측 끝 3층 유도벽

        // 3층 (y=304, 우→좌 역행군!): 2층 우측(y=220)에서 낙차 84px <= 96px 안전!
        { type: 'steelPlatform', x: 54, y: 304, w: 694, h: 18 },
        // 3층 최종 46px 극후 암벽 (x=320..366) — BASH 전용!
        { type: 'rockWall', x: 320, y: 256, w: 46, h: 48 },
        { type: 'steelPlatform', x: 316, y: 240, w: 54, h: 16 },
        withExtraWall ? { type: 'rockWall', x: 520, y: 170, w: 24, h: 50 } : null,
        withExtraWall ? { type: 'steelPlatform', x: 516, y: 34, w: 32, h: 136 } : null
      ];

      const plan = [
        { skill: 'build', unit: 1, at: { x: 368, y: l1, tol: 4 }, dir: 1, label: '1층 낮은 천장 입구 BUILD 헤드봉크 반전+댐 봉인 (BLOCK=0)' },
        { skill: 'bomb', unit: 1, at: { x: 324, y: l1, tol: 4 }, dir: 1, wait: 160, label: '1층 공명실 240틱 BOMB 점화 → 좌측 20px 뒷문 폭파' },
        { skill: 'build', unit: 'any', at: { x: 350, y: 240, tol: 5 }, dir: 1, wait: 240, label: '2층 20px 수직 강철 단차 BUILD 계단 건설' }
      ];
      if (withExtraWall) {
        plan.push({ skill: 'bash', unit: 'any', at: { x: 514, y: 220, tol: 8 }, dir: 1, label: '2층 중단 수문 암벽 BASH' });
      }
      plan.push({ skill: 'bash', unit: 'any', at: { x: 372, y: 304, tol: 8 }, dir: -1, label: '3층 역행군 46px 극후 최종 암벽 좌향 BASH 돌파!' });

      return finalizeStage({
        family: 'serpentine_3tier',
        skipMirrorBounce: true,
        spawnX: 256, spawnY: l1 - 18, gateX: 120, gateY: 280,
        needPercent: 88, // 15/16 (BOMB 1명 희생)
        skills: { build: 2, bomb: 1, bash: withExtraWall ? 2 : 1 },
        mechanics: ['3-Tier S-Curve Marathon (~1,700px)', 'Zero-BLOCK Ceiling Head-Bonk Turnaround', '240-Tick Timed BOMB', '20px Steel Step BUILD', '46px Thick Wall BASH Conservation'],
        desc: '3층 S자 장편 대장정(약 1,700px)! 1층 우측 끝에서 떨어지면 118px 낙사! 방어막(BLOCK) 없이 1층 천장 헤드봉크 반전 → 좌측 20px 뒷문 240틱 BOMB → 2층 우측 행군 & 20px 단차 등반 → 3층 좌측 역행군 & 46px 극후 암벽 BASH까지 3개 층을 완주하세요.',
        shortcutHint: '1층 천장(x=368) BUILD 반전 → x=324 BOMB(좌측 20px 벽 폭파) → 2층 x=350 BUILD → 3층 좌향 행군 46px 벽 BASH',
        elements,
        plan,
        trapTests: [
          { name: '직관 오답 A: 1층 천장 반전 생략 (우측 118px 전원 낙사)', plan: [] },
          { name: '직관 오답 B: 유일한 BASH를 1층 20px 뒷문에 낭비', plan: [
            { skill: 'build', unit: 1, at: { x: 368, y: l1, tol: 4 }, dir: 1 },
            { skill: 'bash', unit: 1, at: { x: 138, y: l1, tol: 8 }, dir: -1 }
          ] }
        ]
      }, spec);
    }

    // 3층 S자 변형 B (100% 무희생: 1층 Blocker-Freeing DRILL + 2층 함정 점프패드 과교 + 3층 역행군 출구 BASH!)
    const elements = [
      sculptedMass(0, 0, 44, 449, s + 55),
      sculptedMass(756, 0, 44, 449, s + 56),
      sculptedMass(44, 0, 712, 36, s + 57),
      sculptedMass(44, 330, 712, 119, s + 58),

      // 1층 (y=124): 혼합 바닥(강철 + 암석 포켓 x=162..206 + 강철) — u2 BLOCK 홀드, u1 선행!
      { type: 'steelPlatform', x: 50, y: 124, w: 112, h: 16 },
      { type: 'platform', x: 162, y: 124, w: 44, h: 16 },
      { type: 'steelPlatform', x: 206, y: 124, w: 58, h: 16 },
      { type: 'steelPlatform', x: 44, y: 36, w: 16, h: 296 },
      // 중간 안전 스텝 (y=194)
      { type: 'steelPlatform', x: 142, y: 194, w: 160, h: 14 },

      // 2층 (y=252, 좌→우): 중앙 함정 점프패드(x=344..390) → 우측 y=232 밀착 → 우측 끝(x=682)에서 3층 안전 하강!
      { type: 'steelPlatform', x: 50, y: 252, w: 294, h: 18 },
      { type: 'steelPlatform', x: 344, y: 268, w: 46, h: 14 },
      { type: 'jumpPad', x: 352, y: 258, w: 28, h: 10, dir: 'up-left', power: 12.2 },
      { type: 'steelPlatform', x: 390, y: 232, w: 296, h: 38 },
      { type: 'steelPlatform', x: 738, y: 36, w: 16, h: 296 },

      // 3층 (y=314, 우→좌 역행군 — y=232→314 낙차 82px 안전!): 최종 암벽(x=350..380) 좌향 BASH → 좌측 하단 웜홀!
      { type: 'steelPlatform', x: 50, y: 314, w: 696, h: 18 },
      { type: 'rockWall', x: 350, y: 268, w: 30, h: 46 },
      { type: 'steelPlatform', x: 346, y: 252, w: 38, h: 16 },
      withExtraWall ? { type: 'rockWall', x: 540, y: 182, w: 24, h: 50 } : null,
      withExtraWall ? { type: 'steelPlatform', x: 536, y: 36, w: 32, h: 146 } : null
    ];

    const plan = [
      { skill: 'block', unit: 2, at: { x: 184, y: 124, tol: 8 }, dir: 1, label: '1층 u2 혼합 암석 포켓 BLOCK 홀드 (u1 선행!)' },
      { skill: 'build', unit: 1, at: { x: 342, y: 252, tol: 4 }, dir: 1, label: '2층 u1 함정 점프패드 BUILD 과교 봉인' }
    ];
    if (withExtraWall) {
      plan.push({ skill: 'bash', unit: 1, at: { x: 534, y: 232, tol: 8 }, dir: 1, label: '2층 중단 수문 암벽 BASH' });
    }
    plan.push({ skill: 'bash', unit: 1, at: { x: 386, y: 314, tol: 8 }, dir: -1, label: '3층 u1 역행군 최종 암벽 좌향 BASH' });
    plan.push({ skill: 'drill', unit: 'blocker', at: { x: 184, y: 124, tol: 14 }, wait: 120, label: '전 3개 층 완공 후 u2(BLOCK) 직접 DRILL 해제 → 100% 구출!' });

    return finalizeStage({
      family: 'serpentine_3tier',
      spawnX: 92, spawnY: 106, gateX: 124, gateY: 290,
      skills: { block: 1, build: 1, bash: withExtraWall ? 2 : 1, drill: 1 },
      mechanics: ['3-Tier S-Curve Marathon (~1,800px)', '100% Blocker-Freeing DRILL', 'Cursed JumpPad Overpass', 'Reverse Lower-Tier March'],
      desc: '100% 무희생 3층 S자 장편 대장정! u2가 1층 암석 포켓 위에서 본대를 묶어두는 동안, 선발대 u1이 2층의 저주받은 점프패드를 덮고 3층으로 내려와 반대 방향 최종 관문까지 모두 개통한 뒤 u2에게 직접 DRILL을 걸어 전원을 해방하세요!',
      shortcutHint: '1층 u2(x=184) BLOCK → 2층 u1 함정패드(x=342) BUILD → 3층 역행군 출구 BASH → u2(BLOCK) 직접 DRILL 해제!',
      elements,
      plan,
      trapTests: [
        { name: '직관 오답 A: BLOCK 홀드 없이 1층 암석 포켓 즉시 DRILL', plan: [{ skill: 'drill', unit: 1, at: { x: 184, y: 124, tol: 8 }, dir: 1 }] },
        { name: '직관 오답 B: u1이 3층까지 다 열었지만 u2 BLOCK을 해제하지 않음', plan: plan.slice(0, plan.length - 1) }
      ]
    }, spec);
  }

  /* ==========================================================================
   * 7) TWIN PIONEER CUSHION EVOLUTION (2인 선발대 낙하 완충 + 하류 복합 함정!)
   * ========================================================================*/
  function buildTwinCushionEvo(spec) {
    const s = spec.seed;
    const withCursedPad = (spec.variant % 2) === 1;
    const withStep = spec.variant >= 2;
    const yTop = 148, yBot = 260;

    const elements = [
      sculptedMass(0, 0, 50, 449, s + 61),
      sculptedMass(748, 0, 52, 449, s + 62),
      sculptedMass(292, 0, 456, 80, s + 63),
      sculptedMass(50, 282, 698, 167, s + 64),
      sculptedMass(50, 0, 242, 48, s + 65),

      { type: 'steelPlatform', x: 52, y: yTop, w: 56, h: 16 },
      { type: 'platform', x: 108, y: yTop, w: 40, h: 16 },
      { type: 'steelPlatform', x: 148, y: yTop, w: 54, h: 16 },
      { type: 'steelPlatform', x: 52, y: 48, w: 16, h: 104 },
      { type: 'steelPlatform', x: 196, y: 94, w: 16, h: 70 },
      { type: 'steelPlatform', x: 274, y: 80, w: 18, h: 124 },
      { type: 'steelPlatform', x: 52, y: 164, w: 16, h: 100 },

      // 하단 대강당 (y=260)
      withCursedPad
        ? { type: 'steelPlatform', x: 52, y: yBot, w: 418, h: 22 }
        : { type: 'steelPlatform', x: 52, y: yBot, w: withStep ? 430 : 696, h: 22 },
      // 1차 암벽 (x=376..406) — u1 BLOCK 반사판 후 직접 BASH 해제!
      { type: 'rockWall', x: 376, y: 188, w: 30, h: 72 },
      { type: 'steelPlatform', x: 372, y: 80, w: 38, h: 108 },

      // 하류 변주: 함정 점프패드 OR 20px 강철 단차
      withCursedPad ? { type: 'steelPlatform', x: 470, y: 276, w: 46, h: 16 } : null,
      withCursedPad ? { type: 'jumpPad', x: 478, y: 266, w: 28, h: 10, dir: 'up-left', power: 12.2 } : null,
      withCursedPad ? { type: 'steelPlatform', x: 516, y: 240, w: 232, h: 42 } : null,
      (!withCursedPad && withStep) ? { type: 'steelPlatform', x: 482, y: 240, w: 266, h: 42 } : null,

      // 2차 암벽
      { type: 'rockWall', x: 586, y: (withCursedPad || withStep ? 240 : 260) - 62, w: 30, h: 62 },
      { type: 'steelPlatform', x: 582, y: 80, w: 38, h: (withCursedPad || withStep ? 240 : 260) - 142 },
      { type: 'steelPlatform', x: 732, y: 80, w: 16, h: 200 }
    ];

    const exitY = (withCursedPad || withStep) ? 240 : 260;
    const needExtraBuild = withCursedPad || withStep;
    const plan = [
      { skill: 'climb', unit: 1, at: { x: 165, y: yTop, tol: 12 }, dir: 1, label: 'u1 등반' },
      { skill: 'float', unit: 1, at: { x: 192, y: 116, tol: 24, ytol: 36 }, state: 'any', label: 'u1 역추진' },
      { skill: 'climb', unit: 2, at: { x: 165, y: yTop, tol: 12 }, dir: 1, label: 'u2 등반' },
      { skill: 'float', unit: 2, at: { x: 192, y: 116, tol: 24, ytol: 36 }, state: 'any', label: 'u2 역추진' },
      { skill: 'block', unit: 1, at: { x: 370, y: yBot, tol: 5 }, dir: 1, label: 'u1 1차 암벽 앞 인간 반사판 BLOCK' },
      { skill: 'build', unit: 2, at: { x: 162, y: yBot, tol: 5 }, dir: -1, label: 'u2 반사 후 스폰 아래 역방향 BUILD 완충' },
      { skill: 'bash', unit: 'blocker', at: { x: 370, y: yBot, tol: 14 }, wait: 20, label: 'u1(BLOCK) 직접 BASH 해제+1차 암벽 돌파' }
    ];
    if (withCursedPad) {
      plan.push({ skill: 'build', unit: 1, at: { x: 468, y: yBot, tol: 4 }, dir: 1, label: 'u1 하류 함정 점프패드 BUILD 과교' });
    } else if (withStep) {
      plan.push({ skill: 'build', unit: 1, at: { x: 438, y: yBot, tol: 5 }, dir: 1, label: 'u1 하류 20px 강철 단차 BUILD 계단' });
    }
    plan.push({ skill: 'bash', unit: 1, at: { x: 580, y: exitY, tol: 8 }, dir: 1, label: 'u1 2차 암벽 BASH 개통' });
    plan.push({ skill: 'drill', unit: 'crowd_lead', at: { x: 126, y: yTop, tol: 5 }, wait: 40, label: '하류 완공 후 본대 스폰 DRILL 안전 하강 → 100% 구출!' });

    return finalizeStage({
      family: 'twin_cushion_evolution',
      spawnX: 96, spawnY: 130, gateX: 682, gateY: exitY - 24,
      skills: { climb: 2, float: 2, block: 1, build: needExtraBuild ? 2 : 1, drill: 1, bash: 2 },
      mechanics: ['Twin Pioneer Cushion', 'Blocker-Freeing BASH', withCursedPad ? 'Downstream Cursed Pad Overpass' : (withStep ? '20px Steel Step BUILD' : 'Double Rock Vault')],
      desc: '스폰 아래 112px 치사 낙차! 2인 선발대(CLIMB+FLOAT+BLOCK 반사 → 역방향 BUILD 완충)로 완충 발판을 만든 뒤, BLOCK 대원을 직접 BASH로 해제해 하류 함정까지 전부 정리하고 본대를 하강시키세요.',
      shortcutHint: 'u1/u2 CLIMB+FLOAT → u1 BLOCK → u2 역방향 BUILD → u1 직접 BASH 해제+하류 개척 → 본대 DRILL 하강',
      elements,
      plan,
      trapTests: [
        { name: '직관 오답 A: 스폰 바닥 즉시 DRILL', plan: [{ skill: 'drill', unit: 1, at: { x: 126, y: yTop, tol: 8 } }] },
        { name: '직관 오답 B: 완충 없이 2명만 탈출', plan: plan.slice(0, 4) }
      ]
    }, spec);
  }

  /* ==========================================================================
   * 8) CURSED PAD + MINE RAMP EVOLUTION (함정 패드 과교 + 양방향 MINE 진화형)
   * ========================================================================*/
  function buildCursedPadMineEvo(spec) {
    const s = spec.seed;
    const withDoubleWall = (spec.variant % 2) === 1;
    const withStep = spec.variant >= 2;

    const elements = [
      sculptedMass(0, 0, 48, 449, s + 71),
      sculptedMass(752, 0, 48, 449, s + 72),
      sculptedMass(48, 0, 704, 62, s + 73),
      sculptedMass(48, 290, 704, 159, s + 74),

      { type: 'steelPlatform', x: 52, y: 264, w: 224, h: 24 },
      { type: 'steelPlatform', x: 48, y: 62, w: 16, h: 204 },
      { type: 'rockWall', x: 176, y: 202, w: 22, h: 62 },

      { type: 'steelPlatform', x: 276, y: 278, w: 46, h: 16 },
      { type: 'steelPlatform', x: 322, y: 244, w: 144, h: 48 },
      { type: 'jumpPad', x: 284, y: 268, w: 28, h: 10, dir: 'up-left', power: 12.2 },

      // 거대 암반 성채 (x=466..568, y=164..244)
      { type: 'rockWall', x: 466, y: 164, w: 102, h: 80 },
      { type: 'steelPlatform', x: 466, y: 244, w: 286, h: 48 },
      withStep
        ? { type: 'steelPlatform', x: 568, y: 164, w: 72, h: 16 }
        : { type: 'steelPlatform', x: 568, y: 164, w: 180, h: 16 },
      withStep ? { type: 'steelPlatform', x: 640, y: 144, w: 108, h: 36 } : null,
      withDoubleWall ? { type: 'rockWall', x: 590, y: 106, w: 22, h: 58 } : null,
      withDoubleWall ? { type: 'steelPlatform', x: 586, y: 62, w: 30, h: 44 } : null,
      { type: 'rockWall', x: withStep ? 662 : 636, y: (withStep ? 144 : 164) - 58, w: 26, h: 58 },
      { type: 'steelPlatform', x: (withStep ? 662 : 636) - 4, y: 62, w: 34, h: (withStep ? 144 : 164) - 120 },
      { type: 'steelPlatform', x: 736, y: 62, w: 16, h: 130 }
    ];

    const exitY = withStep ? 144 : 164;
    const plan = [
      { skill: 'climb', unit: 1, at: { x: 158, y: 264, tol: 12 }, dir: 1, label: 'u1 격리벽 CLIMB' },
      { skill: 'build', unit: 1, at: { x: 274, y: 264, tol: 4 }, dir: 1, label: 'u1 함정 점프패드 BUILD 과교 봉인' },
      { skill: 'climb', unit: 1, at: { x: 430, y: 244, tol: 18 }, dir: 1, label: 'u1 거대 성채 CLIMB' },
      { skill: 'mine', unit: 1, at: { x: 554, y: 164, tol: 6 }, dir: -1, label: '반사 후 거대 성채 양방향 MINE 경사로 굴착' },
      { skill: 'bash', unit: 'crowd_lead', at: { x: 170, y: 264, tol: 8 }, dir: 1, wait: 180, label: '본대 격리벽 BASH 해방' }
    ];
    if (withDoubleWall) {
      plan.push({ skill: 'bash', unit: 'any', at: { x: 584, y: 164, tol: 8 }, dir: 1, label: '성채 1차 관문 BASH' });
    }
    if (withStep) {
      plan.push({ skill: 'build', unit: 'any', at: { x: 598, y: 164, tol: 5 }, dir: 1, label: '성채 상단 20px 강철 단차 BUILD' });
    }
    plan.push({ skill: 'bash', unit: 'any', at: { x: (withStep ? 656 : 630), y: exitY, tol: 8 }, dir: 1, label: '성채 최종 출구 BASH' });

    return finalizeStage({
      family: 'cursed_pad_mine_evolution',
      spawnX: 98, spawnY: 246, gateX: 710, gateY: exitY - 24,
      skills: { climb: 2, build: withStep ? 2 : 1, mine: 1, bash: withDoubleWall ? 3 : 2 },
      mechanics: ['Cursed JumpPad BUILD Overpass', 'Two-Way Diagonal MINE Ramp', withStep ? 'Upper Citadel 20px Step BUILD' : 'Double Gate Citadel'],
      desc: '함정 점프패드 봉인과 거대 암반 역경사로(MINE)의 복합 진화형! 선발대 1명이 함정 패드를 계단으로 봉인하고 거대 성채 상단에서 좌하향 MINE 경사로를 파내려와 본대가 걸어 올라올 길을 연 뒤, 성채 상단 관문을 돌파하세요.',
      shortcutHint: 'u1 CLIMB → 패드 BUILD 과교 → 성채 CLIMB → 상단 좌향 MINE → 본대 격리벽 BASH → 성채 상단 개통',
      elements,
      plan,
      trapTests: [
        { name: '직관 오답 A: 격리벽 즉시 BASH (함정 패드 전원 낙사)', plan: [{ skill: 'bash', unit: 1, at: { x: 170, y: 264, tol: 8 }, dir: 1 }] },
        { name: '직관 오답 B: MINE 경사로 없이 선발대만 등반', plan: plan.slice(0, 3) }
      ]
    }, spec);
  }

  /* ==========================================================================
   * 9) PINBALL SANCTUM EVOLUTION (공중 스포일러 제거 + 강철벽 핀볼 리바운드 진화형)
   * ========================================================================*/
  function buildPinballEvo(spec) {
    const s = spec.seed;
    const withDoubleGate = (spec.variant % 2) === 1;
    const withUpperStep = spec.variant >= 2;

    const elements = [
      sculptedMass(0, 0, 44, 449, s + 81),
      sculptedMass(754, 0, 46, 449, s + 82),
      sculptedMass(44, 0, 710, 36, s + 83),
      sculptedMass(44, 338, 360, 111, s + 84),
      sculptedMass(452, 338, 302, 111, s + 85),

      { type: 'steelPlatform', x: 488, y: 104, w: 198, h: 16 },
      { type: 'platform', x: 686, y: 104, w: 40, h: 16 },
      { type: 'steelPlatform', x: 726, y: 104, w: 16, h: 16 },
      { type: 'steelPlatform', x: 736, y: 36, w: 16, h: 302 },

      { type: 'steelPlatform', x: 488, y: 60, w: 16, h: 44 },
      { type: 'steelPlatform', x: 468, y: 96, w: 20, h: 174 },
      { type: 'rockWall', x: 444, y: 104, w: 24, h: 82 },

      { type: 'steelPlatform', x: 560, y: 176, w: 180, h: 16 },
      { type: 'steelPlatform', x: 488, y: 248, w: 150, h: 16 },

      { type: 'steelPlatform', x: 450, y: 318, w: 290, h: 18 },
      { type: 'steelPlatform', x: 256, y: 318, w: 154, h: 18 },
      { type: 'steelPlatform', x: 256, y: 224, w: 16, h: 112 },
      { type: 'jumpPad', x: 374, y: 308, w: 32, h: 10, dir: 'up-right', power: 11.2 },

      // 상단 좌측 Goal 성소 (y=160)
      { type: 'steelPlatform', x: 318, y: 160, w: 112, h: 16 },
      withUpperStep
        ? { type: 'steelPlatform', x: 56, y: 142, w: 226, h: 34 }
        : { type: 'steelPlatform', x: 56, y: 160, w: 226, h: 16 },
      { type: 'steelPlatform', x: 44, y: 36, w: 16, h: 140 },
      withDoubleGate ? { type: 'rockWall', x: 242, y: (withUpperStep ? 142 : 160) - 56, w: 22, h: 56 } : null,
      withDoubleGate ? { type: 'steelPlatform', x: 238, y: 36, w: 30, h: (withUpperStep ? 142 : 160) - 92 } : null,
      { type: 'rockWall', x: 168, y: (withUpperStep ? 142 : 160) - 56, w: 26, h: 56 },
      { type: 'steelPlatform', x: 164, y: 36, w: 34, h: (withUpperStep ? 142 : 160) - 92 }
    ];

    const uY = withUpperStep ? 142 : 160;
    const plan = [
      { skill: 'climb', unit: 1, at: { x: 520, y: 104, tol: 14 }, dir: -1, label: 'u1 좌측 분리벽 등반' },
      { skill: 'drill', unit: 1, at: { x: 458, y: 104, tol: 5 }, dir: -1, label: 'u1 공중 핀볼 스포일러 DRILL 제거' },
      { skill: 'float', unit: 1, at: { x: 458, y: 210, tol: 16, ytol: 40 }, state: 'FALLING', label: 'u1 하강 중 FLOAT 안전 착지' },
      { skill: 'build', unit: 1, at: { x: 454, y: 318, tol: 5 }, dir: -1, label: 'u1 하단 발사대 틈새 좌향 BUILD' },
      { skill: 'build', unit: 1, at: { x: 320, y: 160, tol: 5 }, dir: -1, label: 'u1 핀볼 착지 후 상단 하늘 틈새 좌향 BUILD' }
    ];
    if (withDoubleGate) {
      plan.push({ skill: 'bash', unit: 1, at: { x: 268, y: uY, tol: 8 }, dir: -1, label: 'u1 상단 1차 수문 암벽 좌향 BASH' });
    }
    plan.push({ skill: 'bash', unit: 1, at: { x: 200, y: uY, tol: 8 }, dir: -1, label: 'u1 상단 최종 수문 암벽 좌향 BASH' });
    plan.push({ skill: 'drill', unit: 'crowd_lead', at: { x: 706, y: 104, tol: 6 }, dir: 1, wait: 60, label: '전 구간 완공 후 본대 우측 포켓 DRILL → 전원 핀볼 구출!' });

    return finalizeStage({
      family: 'pinball_sanctum_evolution',
      skipMirrorBounce: true,
      spawnX: 560, spawnY: 86, gateX: 106, gateY: uY - 24,
      skills: { climb: 1, float: 1, drill: 2, build: 2, bash: withDoubleGate ? 2 : 1 },
      mechanics: ['Aerial Spoiler DRILL Clearing', 'Pinball Steel-Wall Rebound', 'Solo Pioneer Full Prep', withUpperStep ? 'Elevated Sanctum Sky-Bridge' : 'Double-Gate Sanctum'],
      desc: '상단 고지대 핀볼 성소의 심화 버전! 공중 암석 스포일러가 점프패드 상승 궤도를 가로막고 있습니다. 선발대 1명이 위에서 스포일러를 파내고 하단·상단 하늘 다리와 관문을 모두 완공한 뒤 본대를 핀볼 도약시키세요.',
      shortcutHint: 'u1 CLIMB → 스포일러 DRILL+FLOAT → 하단 BUILD → 핀볼 도약 → 상단 BUILD & BASH → 본대 우측 포켓 DRILL',
      elements,
      plan,
      trapTests: [
        { name: '직관 오답 A: 스포일러 제거 없이 본대 바로 하강', plan: [{ skill: 'drill', unit: 1, at: { x: 706, y: 104, tol: 8 }, dir: 1 }] },
        { name: '직관 오답 B: 하단 틈새만 연결하고 스포일러 방치', plan: [
          { skill: 'drill', unit: 1, at: { x: 706, y: 104, tol: 8 }, dir: 1 },
          { skill: 'build', unit: 'any', at: { x: 454, y: 318, tol: 5 }, dir: -1 }
        ] }
      ]
    }, spec);
  }

  /* ==========================================================================
   * 10) CEILING-TURN + BOMB RESONANCE EVOLUTION (BLOCK=0 천장반전 + 240틱 BOMB 진화형)
   * ========================================================================*/
  function buildCeilingBombEvo(spec) {
    const s = spec.seed;
    const withDoubleStep = (spec.variant % 2) === 1;
    const withExtraWall = spec.variant >= 2;

    const elements = [
      sculptedMass(0, 0, 44, 449, s + 91),
      sculptedMass(754, 0, 46, 449, s + 92),
      sculptedMass(44, 0, 710, 44, s + 93),
      sculptedMass(44, 336, 710, 113, s + 94),

      { type: 'steelPlatform', x: 110, y: 164, w: 338, h: 16 },
      { type: 'steelPlatform', x: 384, y: 112, w: 68, h: 28 },
      { type: 'rockWall', x: 112, y: 116, w: 20, h: 48 },
      { type: 'steelPlatform', x: 108, y: 44, w: 28, h: 72 },
      { type: 'steelPlatform', x: 48, y: 44, w: 18, h: 292 },
      { type: 'steelPlatform', x: 54, y: 240, w: 120, h: 16 },

      // 하단 복도 (y=316 → 20px 단차 y=296 → 선택적 2차 20px 단차 y=276!)
      { type: 'steelPlatform', x: 54, y: 316, w: 240, h: 20 },
      { type: 'steelPlatform', x: 294, y: 296, w: withDoubleStep ? 160 : 454, h: 40 },
      withDoubleStep ? { type: 'steelPlatform', x: 454, y: 276, w: 294, h: 60 } : null,

      withExtraWall ? { type: 'rockWall', x: 472, y: (withDoubleStep ? 276 : 296) - 58, w: 24, h: 58 } : null,
      withExtraWall ? { type: 'steelPlatform', x: 468, y: 44, w: 32, h: (withDoubleStep ? 276 : 296) - 102 } : null,

      { type: 'rockWall', x: 576, y: (withDoubleStep ? 276 : 296) - 58, w: 46, h: 58 },
      { type: 'steelPlatform', x: 572, y: 44, w: 54, h: (withDoubleStep ? 276 : 296) - 102 },
      { type: 'steelPlatform', x: 736, y: 44, w: 16, h: 292 }
    ];

    const endY = withDoubleStep ? 276 : 296;
    const plan = [
      { skill: 'build', unit: 1, at: { x: 368, y: 164, tol: 4 }, dir: 1, label: '낮은 천장 입구 BUILD 헤드봉크 반전+댐 봉인' },
      { skill: 'bomb', unit: 1, at: { x: 324, y: 164, tol: 4 }, dir: 1, wait: 160, label: '공명실 240틱 BOMB 점화 → 좌측 20px 뒷문 폭파' },
      { skill: 'build', unit: 'any', at: { x: 250, y: 316, tol: 5 }, dir: 1, wait: 260, label: '하단 1차 20px 강철 단차 BUILD' }
    ];
    if (withDoubleStep) {
      plan.push({ skill: 'build', unit: 'any', at: { x: 410, y: 296, tol: 5 }, dir: 1, label: '하단 2차 20px 강철 단차 BUILD' });
    }
    if (withExtraWall) {
      plan.push({ skill: 'bash', unit: 'any', at: { x: 466, y: endY, tol: 8 }, dir: 1, label: '하단 1차 암벽 BASH' });
    }
    plan.push({ skill: 'bash', unit: 'any', at: { x: 570, y: endY, tol: 8 }, dir: 1, label: '아껴둔 BASH로 최종 46px 극후 암벽 돌파' });

    return finalizeStage({
      family: 'ceiling_bomb_resonance',
      skipMirrorBounce: true,
      spawnX: 256, spawnY: 146, gateX: 688, gateY: endY - 24,
      needPercent: 88,
      skills: { build: withDoubleStep ? 3 : 2, bomb: 1, bash: withExtraWall ? 2 : 1 },
      mechanics: ['Zero-BLOCK Ceiling Head-Bonk BUILD', '240-Tick Timed BOMB Wall Breach', '46px Thick Wall BASH Conservation', withDoubleStep ? 'Double 20px Steel Step' : 'Multi-Gate Lower Hall'],
      desc: 'BLOCK=0 천장 헤드봉크 반전과 240틱 시한폭탄 공명실의 심화 변주! 우측 끝은 132px 치사 절벽, 하단 최종 암벽은 폭탄으로 뚫리지 않는 46px 극후 암벽입니다. 좌측 20px 뒷문은 반드시 240틱 BOMB으로 열고 BASH를 아껴두세요.',
      shortcutHint: '천장(x=368) BUILD 반전 → x=324 BOMB(20px 벽 폭파) → 하단 단차 BUILD → 최종 46px 벽 BASH',
      elements,
      plan,
      trapTests: [
        { name: '직관 오답 A: 천장 반전 생략 (우측 132px 전원 낙사)', plan: [] },
        { name: '직관 오답 B: BASH를 좌측 20px 뒷문에 낭비', plan: [
          { skill: 'build', unit: 1, at: { x: 368, y: 164, tol: 4 }, dir: 1 },
          { skill: 'bash', unit: 1, at: { x: 138, y: 164, tol: 8 }, dir: -1 }
        ] }
      ]
    }, spec);
  }

  /* ==========================================================================
   * 11) BLOCKER-FREEING DIAGONAL RELAY EVOLUTION (100% 무희생 Blocker-DRILL + 활강)
   * ========================================================================*/
  function buildBlockerFreeSlideEvo(spec) {
    const s = spec.seed;
    const withCursedPad = (spec.variant % 2) === 1;
    const withExtraGate = spec.variant >= 2;

    const elements = [
      sculptedMass(0, 0, 48, 449, s + 101),
      sculptedMass(752, 0, 48, 449, s + 102),
      sculptedMass(48, 0, 704, 54, s + 103),
      sculptedMass(48, 278, withCursedPad ? 704 : 418, 171, s + 104),
      !withCursedPad ? sculptedMass(514, 278, 238, 171, s + 105) : null,

      { type: 'steelPlatform', x: 52, y: 160, w: 68, h: 16 },
      { type: 'platform', x: 120, y: 160, w: 106, h: 16 },
      { type: 'steelPlatform', x: 48, y: 54, w: 16, h: 224 },
      { type: 'steelPlatform', x: 268, y: 160, w: 88, h: 16 },
      { type: 'diagonalBeam', x: 356, y: 160, w: 58, h: 58, dir: 'downRight', slope: 1, isSteel: true },

      // 하단 메인 고속도로 (y=248 — 상단 기준 88px 안전!)
      withCursedPad
        ? { type: 'steelPlatform', x: 52, y: 248, w: 416, h: 24 }
        : { type: 'steelPlatform', x: 52, y: 248, w: 416, h: 20 },
      withCursedPad ? { type: 'steelPlatform', x: 468, y: 264, w: 46, h: 16 } : null,
      withCursedPad ? { type: 'jumpPad', x: 476, y: 254, w: 28, h: 10, dir: 'up-left', power: 12.2 } : null,
      withCursedPad
        ? { type: 'steelPlatform', x: 514, y: 228, w: 238, h: 44 }
        : { type: 'steelPlatform', x: 512, y: 248, w: 240, h: 20 },

      withExtraGate ? { type: 'rockWall', x: 544, y: (withCursedPad ? 228 : 248) - 58, w: 24, h: 58 } : null,
      withExtraGate ? { type: 'steelPlatform', x: 540, y: 54, w: 32, h: (withCursedPad ? 228 : 248) - 112 } : null,

      { type: 'rockWall', x: 616, y: (withCursedPad ? 228 : 248) - 62, w: 32, h: 62 },
      { type: 'steelPlatform', x: 612, y: 54, w: 40, h: (withCursedPad ? 228 : 248) - 116 },
      { type: 'steelPlatform', x: 736, y: 54, w: 16, h: 214 }
    ];

    const endY = withCursedPad ? 228 : 248;
    const plan = [
      { skill: 'build', unit: 1, at: { x: 222, y: 160, tol: 5 }, dir: 1, label: 'u1 상단 틈새 BUILD 선행 → 강철 활강 빔' },
      { skill: 'block', unit: 2, at: { x: 184, y: 160, tol: 8 }, dir: 1, label: 'u2 암석 바닥 위 BLOCK 홀드' },
      { skill: 'build', unit: 1, at: { x: withCursedPad ? 466 : 464, y: 248, tol: 4 }, dir: 1, label: withCursedPad ? 'u1 하단 함정 점프패드 BUILD 과교' : 'u1 하단 44px 심연 틈새 BUILD 가교' }
    ];
    if (withExtraGate) {
      plan.push({ skill: 'bash', unit: 1, at: { x: 538, y: endY, tol: 8 }, dir: 1, label: 'u1 하단 1차 수문 암벽 BASH' });
    }
    plan.push({ skill: 'bash', unit: 1, at: { x: 610, y: endY, tol: 8 }, dir: 1, label: 'u1 하단 최종 암벽 BASH 돌파' });
    plan.push({ skill: 'drill', unit: 'blocker', at: { x: 184, y: 160, tol: 14 }, wait: 160, label: '완공 후 u2(BLOCK) 직접 DRILL 해제 → 16/16 100% 구출!' });

    return finalizeStage({
      family: 'blocker_free_slide',
      spawnX: 92, spawnY: 142, gateX: 696, gateY: endY - 24,
      skills: { block: 1, build: 2, bash: withExtraGate ? 2 : 1, drill: 1 },
      mechanics: ['100% No-Sacrifice Blocker-Freeing DRILL', '45° Steel Diagonal Slide', withCursedPad ? 'Downstream Cursed Pad Overpass' : 'Lower Chasm BUILD'],
      desc: '목표 구출률 100%(희생 불가)! u1을 선발대로 먼저 보내고 u2가 암석 바닥 위에서 BLOCK으로 본대를 묶으세요. u1이 45° 강철 활강 빔을 타고 내려가 하단 함정과 출구를 모두 완공한 뒤, u2에게 직접 DRILL을 걸어 전원이 함께 안전 하강합니다.',
      shortcutHint: 'u1 상단 BUILD 선행 → u2 암석바닥 BLOCK → u1 하단 가교/과교 & 출구 BASH → u2(BLOCK) 직접 DRILL 해제!',
      elements,
      plan,
      trapTests: [
        { name: '직관 오답 A: 시작하자마자 상단 암석 바닥 DRILL', plan: [{ skill: 'drill', unit: 1, at: { x: 184, y: 160, tol: 8 }, dir: 1 }] },
        { name: '직관 오답 B: u1이 길을 다 열었지만 u2 BLOCK을 해제하지 않음', plan: plan.slice(0, plan.length - 1) }
      ]
    }, spec);
  }

  /* ==========================================================================
   * 12) DOUBLE-AGENT FIGURE-8 EVOLUTION (단일 선발대 8자 루프: FLOAT=0, BLOCK=0)
   * ========================================================================*/
  function buildFigure8Evo(spec) {
    const s = spec.seed;
    const withDoubleWall = (spec.variant % 2) === 1;
    const withUpperStep = spec.variant >= 2;

    const elements = [
      sculptedMass(0, 0, 46, 449, s + 111),
      sculptedMass(754, 0, 46, 449, s + 112),
      sculptedMass(46, 0, 708, 48, s + 113),
      sculptedMass(46, 282, 708, 167, s + 114),

      { type: 'steelPlatform', x: 50, y: 148, w: 54, h: 16 },
      { type: 'platform', x: 104, y: 148, w: 40, h: 16 },
      { type: 'steelPlatform', x: 144, y: 148, w: 50, h: 16 },
      { type: 'steelPlatform', x: 46, y: 48, w: 16, h: 236 },
      { type: 'steelPlatform', x: 194, y: 104, w: 16, h: 60 },

      { type: 'steelPlatform', x: 210, y: 148, w: 110, h: 16 },
      { type: 'jumpPad', x: 280, y: 138, w: 30, h: 10, dir: 'up-right', power: 4.5 },

      { type: 'rockWall', x: 396, y: 172, w: 108, h: 88 },
      withUpperStep
        ? { type: 'steelPlatform', x: 504, y: 172, w: 106, h: 16 }
        : { type: 'steelPlatform', x: 504, y: 172, w: 244, h: 16 },
      withUpperStep ? { type: 'steelPlatform', x: 610, y: 152, w: 138, h: 36 } : null,
      withDoubleWall ? { type: 'rockWall', x: 536, y: 114, w: 24, h: 58 } : null,
      withDoubleWall ? { type: 'steelPlatform', x: 532, y: 48, w: 32, h: 66 } : null,

      { type: 'rockWall', x: withUpperStep ? 644 : 616, y: (withUpperStep ? 152 : 172) - 58, w: 28, h: 58 },
      { type: 'steelPlatform', x: (withUpperStep ? 644 : 616) - 4, y: 48, w: 36, h: (withUpperStep ? 152 : 172) - 106 },
      { type: 'steelPlatform', x: 738, y: 48, w: 16, h: 236 },
      { type: 'steelPlatform', x: 50, y: 260, w: 698, h: 22 }
    ];

    const endY = withUpperStep ? 152 : 172;
    const plan = [
      { skill: 'climb', unit: 1, at: { x: 176, y: 148, tol: 12 }, dir: 1, label: 'u1 격리벽 등반 → 점프패드 성채 도약' },
      { skill: 'mine', unit: 1, at: { x: 496, y: 172, tol: 6 }, dir: -1, label: 'u1 출구벽 반사 후 성채 좌하향 MINE 경사로 굴착' },
      { skill: 'build', unit: 1, at: { x: 158, y: 260, tol: 5 }, dir: -1, label: 'u1 하단 스폰 아래 역방향 BUILD 완충 발판' },
      { skill: 'drill', unit: 'crowd_lead', at: { x: 122, y: 148, tol: 5 }, wait: 190, label: '본대 스폰 바닥 DRILL 안전 하강 → MINE 역등반!' }
    ];
    if (withDoubleWall) {
      plan.push({ skill: 'bash', unit: 'any', at: { x: 530, y: 172, tol: 8 }, dir: 1, label: '성채 1차 수문 BASH' });
    }
    if (withUpperStep) {
      plan.push({ skill: 'build', unit: 'any', at: { x: 566, y: 172, tol: 5 }, dir: 1, label: '성채 20px 강철 단차 BUILD' });
    }
    plan.push({ skill: 'bash', unit: 'any', at: { x: (withUpperStep ? 638 : 610), y: endY, tol: 8 }, dir: 1, label: '성채 최종 출구 BASH' });

    return finalizeStage({
      family: 'figure8_relay_variants',
      spawnX: 90, spawnY: 130, gateX: 704, gateY: endY - 24,
      skills: { climb: 1, mine: 1, build: withUpperStep ? 2 : 1, drill: 1, bash: withDoubleWall ? 2 : 1 },
      mechanics: ['Single-Pioneer Figure-8 Loop', 'FLOAT=0 & BLOCK=0', 'Two-Way Diagonal MINE', 'Reverse BUILD Landing Cushion'],
      desc: 'FLOAT=0, BLOCK=0 단일 선발대 8자 대장정! 선발대 1명이 벽을 넘어 점프패드로 성채에 올라간 뒤, 양방향 MINE으로 내려와 스폰 아래 역방향 BUILD 완충 발판을 깔고 본대를 역등반시켜 성채를 정복하세요.',
      shortcutHint: 'u1 CLIMB → 점프패드 → 성채 좌향 MINE 하강 → 스폰 아래 역방향 BUILD → 본대 DRILL → MINE 역등반 & BASH',
      elements,
      plan,
      trapTests: [
        { name: '직관 오답 A: 스폰 바닥 즉시 DRILL (112px 전원 낙사)', plan: [{ skill: 'drill', unit: 1, at: { x: 122, y: 148, tol: 6 } }] },
        { name: '직관 오답 B: u1이 MINE 없이 성채 출구만 바로 BASH', plan: [
          { skill: 'climb', unit: 1, at: { x: 176, y: 148, tol: 12 }, dir: 1 },
          { skill: 'bash', unit: 1, at: { x: (withUpperStep ? 638 : 610), y: endY, tol: 8 }, dir: 1 }
        ] }
      ]
    }, spec);
  }

  /* ==========================================================================
   * 13) ELEVATOR TRIAD EVOLUTION (수직 엘리베이터 + 거대 기둥 중층 관통 진화형)
   * ========================================================================*/
  function buildElevatorTriadEvo(spec) {
    const s = spec.seed;
    const withSecondGate = (spec.variant % 2) === 1;
    const useSelfDam = spec.variant >= 2; // 변형 2/3: BLOCK=0 자가 댐 + 엘리베이터 복합!

    const elements = [
      sculptedMass(0, 0, 44, 449, s + 121),
      sculptedMass(754, 0, 46, 449, s + 122),
      sculptedMass(44, 0, 710, 42, s + 123),
      sculptedMass(44, 294, 710, 155, s + 124),
      sculptedMass(646, 42, 108, 56, s + 125),

      // 상단 좌측 혼합 데크 (y=124)
      { type: 'steelPlatform', x: 50, y: 124, w: 112, h: 16 },
      { type: 'platform', x: 162, y: 124, w: 44, h: 16 },
      { type: 'steelPlatform', x: 206, y: 124, w: 58, h: 16 },
      { type: 'steelPlatform', x: 44, y: 42, w: 16, h: 256 },
      // useSelfDam 변형: 암석 천장 오버행(x=196..224, y=72..100 -> 24px 여유고!)으로 BLOCK=0 자가 댐!
      useSelfDam ? { type: 'rockWall', x: 196, y: 72, w: 28, h: 28 } : null,

      // 시각적 3중 진입 미끼 상단 발판
      { type: 'steelPlatform', x: 356, y: 110, w: 210, h: 14 },
      // 중간 안전 계단 발판 (y=196)
      { type: 'steelPlatform', x: 142, y: 196, w: 160, h: 16 },

      // 중단 메인 복도 + Recessed Cursed JumpPad
      { type: 'steelPlatform', x: 50, y: 260, w: 276, h: 34 },
      { type: 'steelPlatform', x: 326, y: 278, w: 46, h: 16 },
      { type: 'jumpPad', x: 334, y: 268, w: 28, h: 10, dir: 'up-left', power: 12.2 },
      { type: 'steelPlatform', x: 372, y: 240, w: 78, h: 54 },

      // 무압사 고속 수직 엘리베이터 (폭 88px > 승강거리 44px!)
      { type: 'movingPlatform', x: 450, y: 196, w: 88, h: 14, axis: 'vertical', range: 44, speed: 1.0, pauseTicks: 48, phase: 1.0, palette: 'purple' },
      { type: 'steelPlatform', x: 448, y: 242, w: 92, h: 52 },
      { type: 'steelPlatform', x: 538, y: 196, w: 30, h: 16 },

      // 거대 복합 기둥 (중층 46px 암벽)
      { type: 'steelPlatform', x: 568, y: 42, w: 46, h: 102 },
      { type: 'rockWall', x: 568, y: 144, w: 46, h: 68 },
      { type: 'steelPlatform', x: 538, y: 212, w: 76, h: 82 },

      withSecondGate ? { type: 'rockWall', x: 644, y: 144, w: 22, h: 52 } : null,
      withSecondGate ? { type: 'steelPlatform', x: 640, y: 42, w: 30, h: 102 } : null,

      { type: 'steelPlatform', x: 614, y: 196, w: 134, h: 16 },
      { type: 'steelPlatform', x: 738, y: 42, w: 16, h: 256 }
    ];

    const plan = useSelfDam
      ? [
        { skill: 'build', unit: 2, at: { x: 182, y: 124, tol: 4 }, dir: 1, label: 'u2 상단 암석 천장 아래 BUILD 자가 댐 봉인 (BLOCK=0!)' },
        { skill: 'build', unit: 1, at: { x: 324, y: 260, tol: 4 }, dir: 1, label: 'u1 중단 함정 점프패드 BUILD 과교' },
        { skill: 'bash', unit: 1, at: { x: 562, y: 196, tol: 8 }, dir: 1, label: 'u1 엘리베이터 탑승 → 거대 기둥 중층 BASH' },
        ...(withSecondGate ? [{ skill: 'bash', unit: 1, at: { x: 638, y: 196, tol: 8 }, dir: 1, label: 'u1 2차 관문 BASH' }] : []),
        { skill: 'bash', unit: 'crowd_lead', at: { x: 184, y: 116, tol: 16, ytol: 16 }, dir: 1, wait: 160, label: '완공 후 본대가 자가 BUILD 댐을 BASH로 철거 → 100% 구출!' }
      ]
      : [
        { skill: 'block', unit: 2, at: { x: 184, y: 124, tol: 8 }, dir: 1, label: 'u2 암석 포켓 BLOCK 홀드 (u1 선행!)' },
        { skill: 'build', unit: 1, at: { x: 324, y: 260, tol: 4 }, dir: 1, label: 'u1 중단 함정 점프패드 BUILD 과교' },
        { skill: 'bash', unit: 1, at: { x: 562, y: 196, tol: 8 }, dir: 1, label: 'u1 엘리베이터 탑승 → 거대 기둥 중층 BASH' },
        ...(withSecondGate ? [{ skill: 'bash', unit: 1, at: { x: 638, y: 196, tol: 8 }, dir: 1, label: 'u1 2차 관문 BASH' }] : []),
        { skill: 'drill', unit: 'blocker', at: { x: 184, y: 124, tol: 14 }, wait: 180, label: 'u2(BLOCK) 직접 DRILL 해제 → 100% 구출!' }
      ];

    return finalizeStage({
      family: 'elevator_switch_vault',
      spawnX: 92, spawnY: 106, gateX: 704, gateY: 172,
      skills: useSelfDam
        ? { build: 2, bash: withSecondGate ? 3 : 2 }
        : { block: 1, build: 1, bash: withSecondGate ? 2 : 1, drill: 1 },
      mechanics: [useSelfDam ? 'Zero-BLOCK Self-Breaking Dam' : '100% Blocker-Freeing DRILL', 'Cursed JumpPad Overpass', 'Vertical Elevator Shaft', 'Giant Pillar Mid-Height BASH'],
      desc: useSelfDam
        ? 'BLOCK=0 자가 댐 + 함정 패드 + 수직 엘리베이터 + 거대 기둥 관통의 마스터 미로! u2가 상단 암석 천장 아래 BUILD 자가 댐으로 본대를 가두고, u1이 함정 패드 과교와 엘리베이터 중층 기둥 관통을 끝낸 뒤 댐을 BASH로 부숴 전원을 해방하세요.'
        : '혼합 스폰 데크 + 함정 패드 과교 + 수직 엘리베이터 + 거대 기둥 중층 관통이 맞물린 100% 무희생 미로! u2가 포켓 위에서 홀드하는 동안 u1이 전 구간을 개척하고, 마지막에 u2에게 직접 DRILL을 걸어 전원을 해방하세요.',
      shortcutHint: useSelfDam
        ? 'u2 천장 BUILD 자가댐 → u1 함정패드 BUILD → 엘리베이터+기둥 BASH → 본대 자가댐 BASH 철거'
        : 'u2 포켓 BLOCK → u1 함정패드 BUILD → 엘리베이터+기둥 BASH → u2 직접 DRILL 해제',
      elements,
      plan,
      trapTests: [
        { name: '직관 오답 A: 홀드 없이 본대 바로 하강', plan: useSelfDam ? [] : [{ skill: 'drill', unit: 1, at: { x: 184, y: 124, tol: 8 }, dir: 1 }] },
        { name: '직관 오답 B: u1이 길을 다 열었지만 본대 홀드를 해제하지 않음', plan: plan.slice(0, plan.length - 1) }
      ]
    }, spec);
  }

  /* ==========================================================================
   * 14) 4-TIER SERPENTINE MARATHON (신규 기믹: 4층 S자 초대형 마라톤 ~2,200px!)
   *   - 1층(y=96, 좌→우): u2 BLOCK 홀드(암석 포켓) or 자가 댐 → u1 선행
   *   - 2층(y=172, 우→좌): 역행군 + 1차 암벽 BASH (낙차 76px 안전!)
   *   - 3층(y=252, 좌→우): 함정 점프패드 BUILD 과교 봉인 (낙차 80px 안전!)
   *   - 4층(y=328, 우→좌): 20px 강철 단차 상승(또는 46px 극후 암벽 BASH) → 하단 좌측 웜홀!
   * ========================================================================*/
  function buildSerpentine4Tier(spec) {
    const s = spec.seed;
    const withStep = (spec.variant % 2) === 1;
    const useSelfDam = spec.variant >= 2;
    const y1 = 96, y2 = 172, y3 = 252, y4 = 330;

    const elements = [
      sculptedMass(0, 0, 40, 449, s + 131),
      sculptedMass(760, 0, 40, 449, s + 132),
      sculptedMass(40, 0, 720, 26, s + 133),
      sculptedMass(40, 354, 720, 95, s + 134),

      // 좌우 외곽 강철 샤프트 벽
      { type: 'steelPlatform', x: 40, y: 26, w: 16, h: 328 },
      { type: 'steelPlatform', x: 744, y: 26, w: 16, h: 328 },

      // 1층 (y=96, 좌→우, x=56..684): 스폰 포켓(x=160..204) + 우측 끝 x=684에서 2층(y=172, 낙차 76px 안전!)
      { type: 'steelPlatform', x: 56, y: y1, w: 104, h: 14 },
      { type: 'platform', x: 160, y: y1, w: 44, h: 14 },
      { type: 'steelPlatform', x: 204, y: y1, w: 480, h: 14 },
      useSelfDam ? { type: 'rockWall', x: 204, y: y1 - 52, w: 28, h: 28 } : null,

      // 2층 (y=172, 우→좌, x=116..744): 중앙 암벽(x=400..426) 좌향 BASH → 좌측 끝 x=116에서 3층(y=252, 낙차 80px 안전!)
      { type: 'steelPlatform', x: 116, y: y2, w: 628, h: 14 },
      { type: 'rockWall', x: 400, y: y2 - 48, w: 26, h: 48 },
      { type: 'steelPlatform', x: 396, y: y1 + 14, w: 34, h: 14 },

      // 3층 (y=252, 좌→우, x=56..684): 함정 점프패드(x=340..386) → 우측 y=236 밀착 → 우측 끝 x=684에서 4층(y=330, 낙차 94px? y=236→322 = 86px 안전!)
      { type: 'steelPlatform', x: 56, y: y3, w: 284, h: 16 },
      { type: 'steelPlatform', x: 340, y: y3 + 14, w: 46, h: 14 },
      { type: 'jumpPad', x: 348, y: y3 + 4, w: 28, h: 10, dir: 'up-left', power: 11.4 },
      { type: 'steelPlatform', x: 386, y: y3 - 16, w: 298, h: 32 },

      // 4층 (y=322, 우→좌, x=56..744): 최종 암벽(x=280..314) 좌향 BASH (+선택적 20px 단차!) → 좌측 하단 웜홀(x=108, y=298)!
      withStep
        ? { type: 'steelPlatform', x: 430, y: 322, w: 314, h: 18 }
        : { type: 'steelPlatform', x: 56, y: 322, w: 688, h: 18 },
      withStep ? { type: 'steelPlatform', x: 56, y: 304, w: 374, h: 36 } : null,
      { type: 'rockWall', x: 256, y: (withStep ? 304 : 322) - 48, w: 34, h: 48 },
      { type: 'steelPlatform', x: 252, y: y3 + 16, w: 42, h: (withStep ? 304 : 322) - 48 - (y3 + 16) }
    ];

    const y4End = withStep ? 304 : 322;
    const plan = useSelfDam
      ? [
        { skill: 'build', unit: 2, at: { x: 190, y: y1, tol: 4 }, dir: 1, label: '1층 u2 천장 BUILD 자가 댐 홀드 (BLOCK=0!)' },
        { skill: 'bash', unit: 1, at: { x: 432, y: y2, tol: 8 }, dir: -1, label: '2층 u1 역행군 암벽 좌향 BASH' },
        { skill: 'build', unit: 1, at: { x: 338, y: y3, tol: 4 }, dir: 1, label: '3층 u1 함정 점프패드 BUILD 과교 봉인' },
        ...(withStep ? [{ skill: 'build', unit: 1, at: { x: 472, y: 322, tol: 5 }, dir: -1, label: '4층 u1 18px 단차 좌향 BUILD' }] : []),
        { skill: 'bash', unit: 1, at: { x: 296, y: y4End, tol: 8 }, dir: -1, label: '4층 u1 최종 관문 암벽 좌향 BASH' },
        { skill: 'bash', unit: 'crowd_lead', at: { x: 192, y: y1 - 8, tol: 16, ytol: 16 }, dir: 1, wait: 160, label: '전 4개 층 완공 후 본대 자가 댐 BASH 철거 → 100% 구출!' }
      ]
      : [
        { skill: 'block', unit: 2, at: { x: 182, y: y1, tol: 8 }, dir: 1, label: '1층 u2 암석 포켓 BLOCK 홀드 (u1 선행!)' },
        { skill: 'bash', unit: 1, at: { x: 432, y: y2, tol: 8 }, dir: -1, label: '2층 u1 역행군 암벽 좌향 BASH' },
        { skill: 'build', unit: 1, at: { x: 338, y: y3, tol: 4 }, dir: 1, label: '3층 u1 함정 점프패드 BUILD 과교 봉인' },
        ...(withStep ? [{ skill: 'build', unit: 1, at: { x: 472, y: 322, tol: 5 }, dir: -1, label: '4층 u1 18px 단차 좌향 BUILD' }] : []),
        { skill: 'bash', unit: 1, at: { x: 296, y: y4End, tol: 8 }, dir: -1, label: '4층 u1 최종 관문 암벽 좌향 BASH' },
        { skill: 'drill', unit: 'blocker', at: { x: 182, y: y1, tol: 14 }, wait: 140, label: '전 4개 층 완공 후 u2(BLOCK) 직접 DRILL 해제 → 2층 안전 착지 후 전원 완주!' }
      ];

    return finalizeStage({
      family: 'serpentine_4tier_marathon',
      spawnX: 90, spawnY: y1 - 18, gateX: 112, gateY: y4End - 24,
      timeLimit: 360,
      skills: useSelfDam
        ? { build: withStep ? 3 : 2, bash: 3 }
        : { block: 1, build: withStep ? 2 : 1, bash: 2, drill: 1 },
      mechanics: ['4-Tier S-Curve Grand Marathon (~2,200px)', useSelfDam ? 'Zero-BLOCK Self-Breaking Dam' : '100% Blocker-Freeing DRILL', 'Cursed JumpPad Overpass', '4-Level Alternating Direction'],
      desc: '4층 S자 초대형 마라톤(이동 거리 약 2,200px)! 1층(좌→우) → 2층(우→좌) → 3층(좌→우 함정패드) → 4층(우→좌 최종관문)까지 4개 층을 100% 무희생으로 관통해야 합니다. 선발대 u1이 4층 끝까지 모든 함정과 관문을 먼저 완공한 뒤, 1층 본대 홀드를 해제하세요!',
      shortcutHint: useSelfDam
        ? '1층 u2 천장 BUILD 자가댐 → 2층 u1 좌향 BASH → 3층 u1 함정패드 BUILD → 4층 u1 좌향 BASH → 1층 본대 자가댐 BASH 철거'
        : '1층 u2 포켓 BLOCK → 2층 u1 좌향 BASH → 3층 u1 함정패드 BUILD → 4층 u1 좌향 BASH → 1층 u2(BLOCK) 직접 DRILL 해제',
      elements,
      plan,
      trapTests: [
        { name: '직관 오답 A: 1층 홀드 없이 본대 전부 출발 (3층 함정패드 참사)', plan: [{ skill: 'bash', unit: 1, at: { x: 432, y: y2, tol: 8 }, dir: -1 }] },
        { name: '직관 오답 B: u1이 4층까지 개척했으나 1층 본대 홀드를 해제하지 않음', plan: plan.slice(0, plan.length - 1) }
      ]
    }, spec);
  }

  /* ==========================================================================
   * 15) SPIRAL INWARD SANCTUM (신규 기믹: 외곽→중앙 나선형 360° 성소!)
   *   - 상단 좌측 스폰 → 지붕 행군 → 우측 2단 안전 하강 → 하단 역행군(우→좌, 함정패드/가교) →
   *     좌측 핀볼 리바운드 도약(up-right, power 11.2, 강철벽 x=368 반사? 아니면 좌측 엘리베이터!) →
   *     화면 정중앙(x=396, y=184)에 봉인된 중앙 웜홀 성소 돌파!
   * ========================================================================*/
  function buildSpiralInward(spec) {
    const s = spec.seed;
    const withDoubleWall = (spec.variant % 2) === 1;
    const withCursedPad = spec.variant >= 2;

    // 360° 시계방향 나선형:
    //   상단 외곽(y=96, 좌→우, x=56..680) — u2가 포켓(x=176) BLOCK 홀드, u1 선행!
    //   우측 2단 하강(y=176 → y=256 → y=322)
    //   하단 외곽(y=322, 우→좌, x=144..744) — 좌측으로 돌아오며 심연 42px 가교(또는 함정패드 과교)!
    //   좌측 수직 엘리베이터(x=56..144, w=88, y=200 ↔ y=320? range 44씩 2단 OR 점프패드 핀볼!)
    //   → 좌측 점프패드(x=136, y=312, up-right, power: 11.2) → 중앙 강철벽(x=224? 아니 380→468은 +88px!)
    //     시프트(-240px X): pad(140, 312), steel wall(228, y=126..270), upper ledge(y=164, x=60..190? 아니 우측으로 가야 중앙 웜홀!)
    //     → 좌우 반전 핀볼! pad(220, 312, up-left, power: 11.2) → 좌측 강철벽(x=132, y=110..320)에 공중 핀볼 반사!!
    //     → 우측 방향(dir=+1)으로 중앙 성소(y=164, x=170..560) 착지 → 중앙 암벽(x=304..334) BASH → 화면 정중앙 웜홀(x=412, y=140)!!
    //   WHOA!! CHECK THAT MIRRORED PINBALL GEOMETRY:
    //     Original verified: pad(380, 308, w=32, up-right, 11.2), wall(468, w=20), ledge(y=160, x=200..430)
    //     Mirror around x=300 (x' = 600 - x):
    //       pad: x' = 600 - 412 = 188, y=308, w=32, dir='up-left', power=11.2!
    //       wall: x' = 600 - 488 = 112, w=20, y=40..320!
    //       central sanctum ledge: x' = 600 - 430 = 170 .. 580, y=160!! (lands at x'=170..180 heading RIGHT dir=+1 straight into center Wormhole x=420, y=136!!)
    //   OH MY GOODNESS — A TRUE 360° CLOCKWISE SPIRAL INTO THE DEAD-CENTER WORMHOLE VIA LEFT-WALL PINBALL REBOUND!!
    const elements = [
      sculptedMass(0, 0, 44, 449, s + 141),
      sculptedMass(756, 0, 44, 449, s + 142),
      sculptedMass(44, 0, 712, 26, s + 143),
      sculptedMass(44, 340, 712, 109, s + 144),

      // 상단 외곽 지붕 (y=88, 좌→우, x=56..684)
      { type: 'steelPlatform', x: 56, y: 88, w: 100, h: 14 },
      { type: 'platform', x: 156, y: 88, w: 44, h: 14 },
      { type: 'steelPlatform', x: 200, y: 88, w: 484, h: 14 },
      { type: 'steelPlatform', x: 44, y: 26, w: 16, h: 316 },
      { type: 'steelPlatform', x: 740, y: 26, w: 16, h: 316 },

      // 우측 3단 안전 하강 스텝 (y=88 → 166 → 244 → 318, x=594 / x=556 여유 폭으로 u1 및 포켓 DRILL 모두 78px 안전 착지!)
      { type: 'steelPlatform', x: 594, y: 166, w: 146, h: 14 },
      { type: 'steelPlatform', x: 556, y: 244, w: 122, h: 14 },
      // 1층 포켓 아래 안전 착지 스텝(u2 DRILL 시 중앙 성소 지붕 y=160으로 72px 안전 착지? 아니 u2가 중앙 성소에 바로 떨어지면 치즈!!)
      // 치즈 방지! 스폰 포켓(x=156..200)을 우측(x=540..584)에 두면 u2가 DRILL 시 우측 하강로(y=166)로 안전 합류, 중앙 성소 진입 절대 불가!!
      // 천재적 치즈 차단!! 포켓을 x=580..624로 옮기자!

      // 하단 외곽 복도 (우측 y=318 → 42px 심연 또는 함정 패드 → 좌측 발사대 y=318 통일!)
      withCursedPad
        ? { type: 'steelPlatform', x: 468, y: 318, w: 272, h: 20 }
        : { type: 'steelPlatform', x: 454, y: 318, w: 286, h: 20 },
      withCursedPad ? { type: 'steelPlatform', x: 422, y: 332, w: 46, h: 14 } : null,
      withCursedPad ? { type: 'jumpPad', x: 430, y: 322, w: 28, h: 10, dir: 'up-right', power: 11.8 } : null,
      withCursedPad
        ? { type: 'steelPlatform', x: 340, y: 300, w: 82, h: 38 }
        : null,
      { type: 'steelPlatform', x: 132, y: 318, w: withCursedPad ? 210 : 280, h: 20 },

      // 좌측 핀볼 리바운드 발사대 (100% 검증: wall x=124..144, pad x=188 y=308 power=10.6 → 중앙 성소 x=174 y=160 착지!)
      { type: 'jumpPad', x: 188, y: 308, w: 32, h: 10, dir: 'up-left', power: 10.6 },
      { type: 'steelPlatform', x: 124, y: 102, w: 20, h: 236 },

      // 중앙 웜홀 성소 (y=160, x=174..560 — 강철 천장 y=88 아래로 완벽한 무충돌 핀볼 착지!)
      { type: 'steelPlatform', x: 174, y: 160, w: 386, h: 16 },
      { type: 'steelPlatform', x: 546, y: 102, w: 16, h: 74 },
      { type: 'rockWall', x: 312, y: 102, w: 30, h: 58 },
      withDoubleWall ? { type: 'rockWall', x: 240, y: 102, w: 24, h: 58 } : null
    ];

    // 상단 스폰 데크 포켓을 우측(x=600..644)으로 교체해 치즈 원천 차단!
    const cleanEls = elements.filter(Boolean).filter(e => !(e.y === 88 && (e.x === 56 || e.x === 156 || e.x === 200)));
    cleanEls.push({ type: 'steelPlatform', x: 56, y: 88, w: 544, h: 14 });
    cleanEls.push({ type: 'platform', x: 600, y: 88, w: 44, h: 14 });
    cleanEls.push({ type: 'steelPlatform', x: 644, y: 88, w: 40, h: 14 });
    // 하단 틈새(x=412..454) 바로 아래 암반을 비워 치사 심연으로!
    if (!withCursedPad) {
      const botPolyIdx = cleanEls.findIndex(e => e.type === 'polygonRock' && e.y >= 338);
      if (botPolyIdx >= 0) cleanEls.splice(botPolyIdx, 1);
      cleanEls.unshift(sculptedMass(44, 340, 364, 109, s + 145));
      cleanEls.unshift(sculptedMass(458, 340, 298, 109, s + 146));
    }

    const cY = 160;
    const bY = 318;
    const plan = [
      { skill: 'block', unit: 2, at: { x: 622, y: 88, tol: 8 }, dir: 1, label: '상단 우측 암석 포켓 u2 BLOCK 홀드 (u1 선행 하강!)' },
      { skill: 'build', unit: 1, at: { x: withCursedPad ? 470 : 458, y: bY, tol: 4 }, dir: -1, label: withCursedPad ? '하단 역행군 u1 함정 점프패드 좌향 BUILD 과교' : '하단 역행군 u1 42px 심연 좌향 BUILD 가교' }
    ];
    if (withDoubleWall) {
      plan.push({ skill: 'bash', unit: 1, at: { x: 234, y: cY, tol: 8 }, dir: 1, label: '좌측 핀볼 도약 착지 후 중앙 성소 1차 암벽 BASH' });
    }
    plan.push({ skill: 'bash', unit: 1, at: { x: 306, y: cY, tol: 8 }, dir: 1, label: '중앙 성소 최종 수문 암벽 BASH → 정중앙 웜홀 개방!' });
    plan.push({ skill: 'drill', unit: 'blocker', at: { x: 622, y: 88, tol: 14 }, wait: 160, label: '360° 나선 완공 후 u2(BLOCK) 직접 DRILL 해제 → 전원 중앙 웜홀 구출!' });

    return finalizeStage({
      family: 'spiral_inward_sanctum',
      spawnX: 110, spawnY: 70, gateX: 432, gateY: cY - 24,
      timeLimit: 360,
      skills: { block: 1, build: 1, bash: withDoubleWall ? 2 : 1, drill: 1 },
      mechanics: ['360° Clockwise Inward Spiral (~2,100px)', '100% Blocker-Freeing DRILL', withCursedPad ? 'Reverse Cursed JumpPad Overpass' : 'Reverse Lower Chasm BUILD', 'Left-Wall Pinball Rebound into Center Wormhole'],
      desc: '화면 정중앙에 봉인된 웜홀을 향해 360° 시계방향으로 감아 들어가는 나선형 대장정! u2가 상단 우측 암석 포켓에서 본대를 홀드하는 동안, 선발대 u1이 우측 하강 → 하단 역행군(가교/함정과교) → 좌측 강철벽 핀볼 리바운드 도약 → 중앙 성소 개통까지 완공한 뒤 u2를 직접 DRILL로 해방하세요!',
      shortcutHint: '상단 우측 포켓(x=622) u2 BLOCK → u1 하단 역행군 BUILD → 좌측 점프패드 핀볼 리바운드 → 중앙 성소 BASH → u2(BLOCK) 직접 DRILL 해제!',
      elements: cleanEls,
      plan,
      trapTests: [
        { name: '직관 오답 A: 홀드 없이 본대 바로 하강 (하단 틈새/함정패드 참사)', plan: [{ skill: 'drill', unit: 1, at: { x: 622, y: 88, tol: 8 }, dir: 1 }] },
        { name: '직관 오답 B: u1이 중앙 성소를 열었지만 u2 BLOCK을 해제하지 않음', plan: plan.slice(0, plan.length - 1) }
      ]
    }, spec);
  }

  /* ==========================================================================
   * 16) APEX GRAND SYNTHESIS (최종 APEX 4중 복합 그랜드 신세시스!)
   *   - Twin Pioneer Cushion(CLIMB+FLOAT+BLOCK → 역방향 BUILD) + Blocker-BASH 동시 해제 +
   *     하단 심연/함정패드/이중계단 + 강철 타워 핀볼 리바운드 + 100% 무희생!
   * ========================================================================*/
  function buildApexGrandSynthesis(spec) {
    const s = spec.seed;
    const withDoubleUpperWall = (spec.variant % 2) === 1;
    const withCursedPad = spec.variant >= 2;

    const elements = [
      sculptedMass(0, 0, 44, 449, s + 151),
      sculptedMass(608, 0, 192, 449, s + 152),
      sculptedMass(44, 0, 564, 34, s + 153),
      sculptedMass(44, 280, withCursedPad ? 380 : 330, 169, s + 154),
      sculptedMass(438, 338, 172, 111, s + 155),

      // 상단 좌측 스폰 금고 (y=148 → y=260, 112px 치사 낙차!)
      { type: 'steelPlatform', x: 48, y: 148, w: 56, h: 16 },
      { type: 'platform', x: 104, y: 148, w: 40, h: 16 },
      { type: 'steelPlatform', x: 144, y: 148, w: 50, h: 16 },
      { type: 'steelPlatform', x: 44, y: 34, w: 16, h: 248 },
      { type: 'steelPlatform', x: 194, y: 94, w: 16, h: 70 },
      { type: 'steelPlatform', x: 256, y: 94, w: 16, h: 122 },

      // 하단 메인 복도 (y=260)
      { type: 'steelPlatform', x: 48, y: 260, w: 328, h: 20 },
      { type: 'rockWall', x: 326, y: 200, w: 26, h: 60 },
      { type: 'steelPlatform', x: 322, y: 184, w: 34, h: 16 },

      // 하단 42px 심연 OR Recessed Cursed Pad → 우측 계단 하강(y=318) → 핀볼 발사대!
      withCursedPad ? { type: 'steelPlatform', x: 376, y: 276, w: 44, h: 16 } : null,
      withCursedPad ? { type: 'jumpPad', x: 382, y: 266, w: 28, h: 10, dir: 'up-left', power: 12.2 } : null,
      { type: 'steelPlatform', x: 418, y: withCursedPad ? 244 : 260, w: 38, h: withCursedPad ? 36 : 18 },
      { type: 'steelPlatform', x: 438, y: 318, w: 152, h: 18 },
      { type: 'jumpPad', x: 500, y: 308, w: 32, h: 10, dir: 'up-right', power: 11.2 },
      { type: 'steelPlatform', x: 588, y: 34, w: 20, h: 302 },

      // 상단 중앙 고지대 Goal 성소 (y=160, x=280..550)
      { type: 'steelPlatform', x: 280, y: 160, w: 270, h: 16 },
      { type: 'steelPlatform', x: 274, y: 34, w: 16, h: 142 },
      withDoubleUpperWall ? { type: 'rockWall', x: 446, y: 104, w: 24, h: 56 } : null,
      withDoubleUpperWall ? { type: 'steelPlatform', x: 442, y: 34, w: 32, h: 70 } : null,
      { type: 'rockWall', x: 374, y: 104, w: 30, h: 56 },
      { type: 'steelPlatform', x: 370, y: 34, w: 38, h: 70 }
    ];

    const plan = [
      { skill: 'climb', unit: 1, at: { x: 170, y: 148, tol: 12 }, dir: 1, label: 'u1 등반' },
      { skill: 'float', unit: 1, at: { x: 192, y: 116, tol: 24, ytol: 36 }, state: 'any', label: 'u1 역추진' },
      { skill: 'climb', unit: 2, at: { x: 170, y: 148, tol: 12 }, dir: 1, label: 'u2 등반' },
      { skill: 'float', unit: 2, at: { x: 192, y: 116, tol: 24, ytol: 36 }, state: 'any', label: 'u2 역추진' },
      { skill: 'block', unit: 1, at: { x: 320, y: 260, tol: 5 }, dir: 1, label: 'u1 1차 암벽 직전 BLOCK 반사판' },
      { skill: 'build', unit: 2, at: { x: 162, y: 260, tol: 5 }, dir: -1, label: 'u2 반사 후 스폰 아래 역방향 BUILD 완충' },
      { skill: 'bash', unit: 'blocker', at: { x: 320, y: 260, tol: 14 }, wait: 20, label: 'u1(BLOCK) 직접 BASH 해제+1차 암벽 돌파' },
      { skill: 'build', unit: 1, at: { x: 372, y: 260, tol: 4 }, dir: 1, label: withCursedPad ? 'u1 함정 점프패드 BUILD 과교 봉인' : 'u1 42px 심연 BUILD 가교' }
    ];
    if (withDoubleUpperWall) {
      plan.push({ skill: 'bash', unit: 1, at: { x: 476, y: 160, tol: 8 }, dir: -1, label: '핀볼 착지 후 상단 1차 암벽 좌향 BASH' });
    }
    plan.push({ skill: 'bash', unit: 1, at: { x: 410, y: 160, tol: 8 }, dir: -1, label: '상단 최종 암벽 좌향 BASH' });
    plan.push({ skill: 'drill', unit: 'crowd_lead', at: { x: 128, y: 148, tol: 4 }, wait: 40, label: '전 구간 완공 후 본대 스폰 DRILL 안전 하강 → 100% 핀볼 구출!' });

    return finalizeStage({
      family: 'apex_grand_synthesis',
      spawnX: 90, spawnY: 130, gateX: 322, gateY: 136,
      timeLimit: 360,
      skills: { climb: 2, float: 2, block: 1, build: 2, drill: 1, bash: withDoubleUpperWall ? 3 : 2 },
      mechanics: ['Twin Pioneer Cushion', 'Blocker-Freeing BASH', withCursedPad ? 'Cursed JumpPad Overpass' : 'Chasm BUILD', 'Pinball Mid-Air Steel Rebound', '100% No-Sacrifice APEX'],
      desc: '4중 복합 인과 체인 APEX 최종 관문! 112px 치사 낙차를 2인 선발대(CLIMB+FLOAT+BLOCK 반사→역방향 BUILD 완충)로 해체하고, BLOCK 대원을 직접 BASH 해제해 하단 함정 과교 및 강철 타워 핀볼 리바운드 성소까지 완공한 뒤 본대 100%를 무희생으로 구출하세요.',
      shortcutHint: 'u1/u2 CLIMB+FLOAT → u1 BLOCK → u2 역방향 BUILD → u1 직접 BASH 해제 → 하단 BUILD → 핀볼 착지+상단 BASH → 본대 DRILL 하강',
      elements,
      plan,
      trapTests: [
        { name: '직관 오답 A: 스폰 바닥 즉시 DRILL', plan: [{ skill: 'drill', unit: 1, at: { x: 122, y: 148, tol: 6 } }] },
        { name: '직관 오답 B: 완충 없이 선발대 2명만 탈출', plan: plan.slice(0, 4) }
      ]
    }, spec);
  }

  /* ==========================================================================
   * 레지스트리 및 92개 스테이지(S033~S124) 비대칭 스케줄러
   * ========================================================================*/
  const BUILDERS = {
    switchable_pad:            buildSwitchablePad,
    self_breaking_dam:         buildSelfBreakingDam,
    monolith_l_carve:          buildMonolithCarve,
    double_stair_interlock:    buildDoubleStairInterlock,
    split_converge_coop:       buildSplitConverge,
    serpentine_3tier:          buildSerpentine3Tier,
    twin_cushion_evolution:    buildTwinCushionEvo,
    cursed_pad_mine_evolution: buildCursedPadMineEvo,
    pinball_sanctum_evolution: buildPinballEvo,
    ceiling_bomb_resonance:    buildCeilingBombEvo,
    blocker_free_slide:        buildBlockerFreeSlideEvo,
    figure8_relay_variants:    buildFigure8Evo,
    elevator_switch_vault:     buildElevatorTriadEvo,
    serpentine_4tier_marathon: buildSerpentine4Tier,
    spiral_inward_sanctum:     buildSpiralInward,
    apex_grand_synthesis:      buildApexGrandSynthesis
  };

  const TITLE_WORDS_A = [
    'QUANTUM', 'OBSIDIAN', 'SOLAR', 'ECLIPSE', 'CHRONO', 'ABYSSAL', 'PRISM', 'VORTEX',
    'IRONCLAD', 'PHANTOM', 'CITADEL', 'AETHER', 'COBALT', 'NEBULA', 'PARADOX', 'TITAN',
    'MIRAGE', 'VECTOR', 'ZENITH', 'HELIX', 'APEX', 'CIPHER', 'GRAVITY', 'REACTOR'
  ];
  const TITLE_WORDS_B = [
    'SWITCH', 'DAMBREAK', 'MONOLITH', 'INTERLOCK', 'CONVERGE', 'SERPENT', 'CUSHION', 'OVERPASS',
    'RICOCHET', 'ECHO', 'VAULT', 'RELAY', 'SHAFT', 'MARATHON', 'SPIRAL', 'SYNTHESIS'
  ];
  const FAMILY_ORDER = Object.keys(BUILDERS);

  /**
   * Stage 33 ~ 124 (총 92개) 비대칭 조합 스펙 생성:
   *   - Arc 1 (33~56, 24개 · HARD 14 + NIGHTMARE 10): 신규 6종 기믹 우선 배치 + 1단계 진화형
   *   - Arc 2 (57~90, 34개 · NIGHTMARE 18 + MASTER 16): 2~3기믹 교차 + 미끼 스킬(Decoy) + 3층 S자/나선형
   *   - Arc 3 (91~124, 34개 · MASTER 14 + APEX 20): 3~4기믹 복합 + 4층 마라톤 + 미끼 패러독스 + APEX 최종 보스
   *   - 동일 패밀리 연속 배치 절대 금지, (family, variant, mirrorX, decoy) 92개 100% 고유!
   */
  function buildSchedule92() {
    const specs = [];
    const usedFingerprints = new Set();

    // 풀 정의: 각 아크별로 사용할 (family, variant, mirrorX, decoy) 후보 풀
    const arc1Families = [
      'switchable_pad', 'self_breaking_dam', 'monolith_l_carve', 'double_stair_interlock',
      'split_converge_coop', 'serpentine_3tier', 'twin_cushion_evolution', 'cursed_pad_mine_evolution'
    ];
    const arc2Families = [
      'pinball_sanctum_evolution', 'ceiling_bomb_resonance', 'blocker_free_slide', 'figure8_relay_variants',
      'elevator_switch_vault', 'serpentine_3tier', 'switchable_pad', 'self_breaking_dam',
      'monolith_l_carve', 'double_stair_interlock', 'split_converge_coop', 'spiral_inward_sanctum'
    ];
    const arc3Families = [
      'serpentine_4tier_marathon', 'spiral_inward_sanctum', 'apex_grand_synthesis', 'elevator_switch_vault',
      'figure8_relay_variants', 'pinball_sanctum_evolution', 'ceiling_bomb_resonance', 'split_converge_coop',
      'monolith_l_carve', 'self_breaking_dam', 'double_stair_interlock', 'twin_cushion_evolution',
      'cursed_pad_mine_evolution', 'blocker_free_slide', 'switchable_pad', 'serpentine_3tier'
    ];

    const DECOY_POOL = [null, 'float', 'bomb', 'climb', 'mine', 'block'];

    function pickCandidate(pool, slotIdx, diffKey, diffLabel, diffScore, allowDecoy, preferredMirror) {
      const prevFam1 = specs.length >= 1 ? specs[specs.length - 1].family : null;
      const prevFam2 = specs.length >= 2 ? specs[specs.length - 2].family : null;
      const prevFam3 = specs.length >= 3 ? specs[specs.length - 3].family : null;

      // 결정적 회전 오프셋으로 모든 패밀리가 고르게 분산되도록
      for (let attempt = 0; attempt < 400; attempt++) {
        const fam = pool[(slotIdx * 3 + attempt) % pool.length];
        if (fam === prevFam1 || fam === prevFam2 || (pool.length >= 6 && fam === prevFam3)) continue;

        const maxVar = (fam === 'switchable_pad') ? 3 : (fam === 'split_converge_coop' ? 2 : 4);
        const variant = (Math.floor((slotIdx + attempt) / 2) + (attempt % maxVar)) % maxVar;
        // mirrorX는 스폰 반사벽이 깔끔하게 작동하는 모든 패밀리에 고르게 적용 (약 45%)
        const mirrorX = attempt < 40 ? ((slotIdx + variant) % 2 === preferredMirror) : ((attempt % 2) === 1);

        // Decoy는 해당 스킬이 정석에 0개인 경우에만 finalizeStage에서 추가됨
        // (Arc 2 후반 & Arc 3에서 약 40%에 미끼 스킬 부여 — 단 100% 무희생에 bomb 미끼나 drop맵에 float:1 미끼!)
        let decoy = null;
        if (allowDecoy && ((slotIdx + attempt) % 3 === 0 || attempt >= 60)) {
          decoy = DECOY_POOL[1 + ((slotIdx + attempt) % (DECOY_POOL.length - 1))];
          // bomb을 쓰거나 climb/float 등 치즈 가능한 조합 회피: 안전한 미끼만 허용
          // (예: float는 100% 무희생 맵에서 1개만 주면 본대 15명이 못 건너므로 완벽한 미끼! bomb도 100% 무희생 맵에서 완벽한 미끼!)
          if (decoy === 'climb' || decoy === 'block' || decoy === 'mine') {
            decoy = ((slotIdx + attempt) % 2 === 0) ? 'bomb' : 'float';
          }
          // 15/16 허용 맵(ceiling_bomb_resonance, serpentine_3tier bomb형, switchable_pad)엔 bomb 미끼 금지
          if ((fam === 'ceiling_bomb_resonance' || fam === 'switchable_pad' || (fam === 'serpentine_3tier' && variant % 2 === 0)) && decoy === 'bomb') {
            decoy = 'float';
          }
          // float가 이미 쓰이는 맵엔 bomb 미끼로 교체
          if ((fam === 'twin_cushion_evolution' || fam === 'pinball_sanctum_evolution' || fam === 'apex_grand_synthesis' || fam === 'split_converge_coop') && decoy === 'float') {
            decoy = 'bomb';
          }
        }

        const variantKey = `v${variant}`;
        const fp = `${fam}|${variantKey}|${mirrorX ? 'M' : 'N'}|${decoy || 'none'}`;
        if (usedFingerprints.has(fp)) continue;

        usedFingerprints.add(fp);
        const famIdx = FAMILY_ORDER.indexOf(fam);
        const wordA = TITLE_WORDS_A[(slotIdx * 5 + variant * 3 + (mirrorX ? 7 : 0)) % TITLE_WORDS_A.length];
        const wordB = TITLE_WORDS_B[famIdx % TITLE_WORDS_B.length];
        const suffix = mirrorX ? ' II' : '';
        const theme = THEMES[(slotIdx + variant) % THEMES.length];

        return {
          id: 33 + slotIdx,
          seed: 9000 + slotIdx * 37 + variant * 13,
          family: fam,
          variant,
          variantKey,
          mirrorX,
          decoy,
          theme,
          diffKey,
          diffLabel,
          diffScore,
          name: `${wordA} ${wordB}${suffix}`,
          totalUnits: (diffKey === 'apex') ? 18 : 16,
          spawnRate: (diffKey === 'apex') ? 22 : 24
        };
      }
      throw new Error(`Could not find unique candidate for slot ${33 + slotIdx}`);
    }

    for (let i = 0; i < 92; i++) {
      const stageNum = 33 + i;
      let pool, diffKey, diffLabel, diffScore, allowDecoy, prefMirror;
      if (stageNum <= 46) {
        // 33~46 (14개): HARD (76~83)
        pool = arc1Families;
        diffKey = 'hard'; diffLabel = 'HARD';
        diffScore = 76 + Math.floor((stageNum - 33) * 0.55);
        allowDecoy = false; prefMirror = 0;
      } else if (stageNum <= 56) {
        // 47~56 (10개): NIGHTMARE (84~87)
        pool = arc1Families;
        diffKey = 'nightmare'; diffLabel = 'NIGHTMARE';
        diffScore = 84 + Math.floor((stageNum - 47) * 0.35);
        allowDecoy = true; prefMirror = 1;
      } else if (stageNum <= 74) {
        // 57~74 (18개): NIGHTMARE (86~90)
        pool = arc2Families;
        diffKey = 'nightmare'; diffLabel = 'NIGHTMARE';
        diffScore = 86 + Math.floor((stageNum - 57) * 0.25);
        allowDecoy = true; prefMirror = 0;
      } else if (stageNum <= 90) {
        // 75~90 (16개): MASTER (91~94)
        pool = arc2Families;
        diffKey = 'master'; diffLabel = 'MASTER';
        diffScore = 91 + Math.floor((stageNum - 75) * 0.25);
        allowDecoy = true; prefMirror = 1;
      } else if (stageNum <= 104) {
        // 91~104 (14개): MASTER (93~96)
        pool = arc3Families;
        diffKey = 'master'; diffLabel = 'MASTER';
        diffScore = 93 + Math.floor((stageNum - 91) * 0.25);
        allowDecoy = true; prefMirror = 0;
      } else {
        // 105~124 (20개): APEX (96~100) — 마지막 120~124는 최고난도 APEX 집중!
        pool = (stageNum >= 120)
          ? ['apex_grand_synthesis', 'serpentine_4tier_marathon', 'spiral_inward_sanctum', 'elevator_switch_vault', 'figure8_relay_variants']
          : arc3Families;
        diffKey = 'apex'; diffLabel = 'APEX';
        diffScore = Math.min(100, 96 + Math.floor((stageNum - 105) * 0.25));
        allowDecoy = true; prefMirror = 1;
      }

      specs.push(pickCandidate(pool, i, diffKey, diffLabel, diffScore, allowDecoy, prefMirror));
    }

    return specs;
  }

  function buildStageFromSpec(spec) {
    const fn = BUILDERS[spec.family];
    if (!fn) throw new Error(`Unknown family: ${spec.family}`);
    return fn(spec);
  }

  function buildAll92() {
    const specs = buildSchedule92();
    return specs.map(buildStageFromSpec);
  }

  const CausalGrammarEngine = {
    version: 'v9-phase2',
    FAMILIES: FAMILY_ORDER,
    buildSchedule92,
    buildStageFromSpec,
    buildAll92,
    mirrorStageX
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { CausalGrammarEngine };
  }
  if (root) {
    root.CausalGrammarEngine = CausalGrammarEngine;
  }
})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
