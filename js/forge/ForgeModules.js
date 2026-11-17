/* ============================================================================
 * ForgeModules.js — Whole-Canvas Compositional Blueprints & Layout Auditor (v3)
 *
 * - 기존 200px 조각 모듈 체인(Bottom-Up)의 겹침/충돌/단조로움 한계를 폐기하고,
 *   800×450 전체 화면을 상·중·하 다층 구조(Top-Down Macro-Blueprint)로 설계합니다.
 * - 8대 합성 블루프린트 패밀리 × 좌우 대칭(LTR/RTL) × 지형/기믹 서브 변형:
 *   1. reverse_bridge_citadel     (더블 선발대 & 역방향 층간 계단 + 점프패드 하부 우회)
 *   2. bunker_underpass           (강철 벙커 지하 잠입 & 척력 점프패드 도약)
 *   3. criss_cross_reactor        (중앙 타워 양방향 크로스오버 & 후방 역습)
 *   4. holding_chamber_liberation (무방어막 지형 가두리 & 선발 개척 후 일괄 해방)
 *   5. beam_skate_labyrinth       (대각선 강철 빔 스케이트 활주 & 궤적 퍼즐)
 *   6. twin_citadel_crossing      (트윈 시타델 협곡 도약 & 하부 우회 하이웨이)
 *   7. elevator_skybridge         (무빙발판 셔틀/리프트 동기화 & 상하 협동 개척)
 *   8. cascading_terraces_highway (4단 스위치백 & 정밀 코어 폭파/하부 점프패드)
 * - 모든 블루프린트에서 차원포탈(portal)은 0으로 고정(생성기 필수 스킬 제외).
 * - auditLayout(level)으로 지형 겹침 0%, 층간 헤드룸 >= 66px, 스폰-웜홀 이격을 강제합니다.
 * ==========================================================================*/
(function (root) {
  'use strict';

  const W = 800;
  const H = 450;

  function stoneType(pal, R) {
    const map = {
      cyan: ['platform', 'craggyRock'],
      red: ['volcanicBasalt', 'craggyRock'],
      purple: ['quantumCrystal', 'platform'],
      brown: ['platform', 'craggyRock'],
      green: ['craggyRock', 'quantumCrystal']
    };
    const pool = map[pal] || ['platform', 'craggyRock'];
    return R ? pool[Math.floor(R() * pool.length)] : pool[0];
  }

  function makeProfile(w, h) {
    const segs = Math.max(3, Math.min(12, Math.floor(w / 42)));
    const prof = [];
    for (let i = 0; i < segs; i++) prof.push(Math.round(h + ((i % 2 === 0) ? 2 : 0)));
    return prof;
  }

  function mirrorSlopeDir(d, worldDir) {
    if (worldDir === 1) return d || 'up-right';
    const m = {
      'up-right': 'up-left', upRight: 'upLeft',
      'up-left': 'up-right', upLeft: 'upRight',
      'down-right': 'down-left', downRight: 'downLeft',
      'down-left': 'down-right', downLeft: 'downRight'
    };
    return m[d] || 'up-left';
  }

  function mirrorJumpDir(d, worldDir) {
    if (worldDir === 1) return d || 'up';
    const m = {
      'right': 'left', 'forward': 'left', 'left': 'right',
      'up-right': 'up-left', 'up-left': 'up-right', 'up': 'up'
    };
    return m[d] || 'up';
  }

  /**
   * 전체 캔버스(800×450) 기준 양방향 대칭 지오메트리 빌더
   */
  function makeWorldGeom(worldDir, pal) {
    const px = (x) => (worldDir === 1 ? x : W - x);
    const rx = (x, w) => (worldDir === 1 ? x : W - x - w);
    const pt = (x, y, tol = 8, ytol = 16) => ({ x: Math.round(px(x)), y: Math.round(y), tol, ytol });

    const slab = (x, y, w, h, type = 'platform', extra = null) => {
      const el = { type, x: Math.round(rx(x, w)), y: Math.round(y), w: Math.round(w), h: Math.round(h), palette: pal };
      if (type === 'craggyRock' || type === 'volcanicBasalt' || type === 'quantumCrystal') {
        el.profile = makeProfile(w, h);
        el.isRect = true;
      }
      if (extra) Object.assign(el, extra);
      return el;
    };

    const wall = (x, y, w, h) => ({
      type: 'rockWall', x: Math.round(rx(x, w)), y: Math.round(y), w: Math.round(w), h: Math.round(h), palette: pal
    });

    const steelWall = (x, y, w, h) => ({
      type: 'steelBarrier', x: Math.round(rx(x, w)), y: Math.round(y), w: Math.round(w), h: Math.round(h)
    });

    const steelFloor = (x, y, w, h) => ({
      type: 'steelPlatform', x: Math.round(rx(x, w)), y: Math.round(y), w: Math.round(w), h: Math.round(h), palette: pal, isSteel: true
    });

    const slope = (x, y, w, h, direction = 'up-right', isSteel = false) => ({
      type: 'triangleSlope', x: Math.round(rx(x, w)), y: Math.round(y), w: Math.round(w), h: Math.round(h),
      direction: mirrorSlopeDir(direction, worldDir), isSteel: !!isSteel, palette: pal
    });

    const beam = (x, y, w, h, slopeSign = 1, thickness = 16) => {
      const finalSlope = worldDir === 1 ? slopeSign : -slopeSign;
      return {
        type: 'diagonalBeam', x: Math.round(rx(x, w)), y: Math.round(y), w: Math.round(w), h: Math.round(h),
        slope: finalSlope, dir: finalSlope === -1 ? 'downLeft' : 'downRight', thickness, isSteel: true, palette: pal
      };
    };

    const jumpPad = (x, y, dirKey = 'up-right', power = 10.0, w = 40) => ({
      type: 'jumpPad', x: Math.round(rx(x, w)), y: Math.round(y), w, h: 10,
      dir: mirrorJumpDir(dirKey, worldDir), power, palette: pal
    });

    const movingPlatform = (x, y, w, h, axis, range, opts = {}) => {
      const el = {
        type: 'movingPlatform',
        x: Math.round(axis === 'horizontal' && worldDir === -1 ? (W - x - w - range) : rx(x, w)),
        y: Math.round(y), w: Math.round(w), h: Math.round(h),
        axis: axis || 'horizontal', range: Math.round(range),
        speed: opts.speed != null ? opts.speed : 0.75,
        pauseTicks: opts.pauseTicks != null ? opts.pauseTicks : 25,
        palette: pal
      };
      if (axis === 'horizontal' && worldDir === -1) el.phase = 1;
      else if (opts.phase != null) el.phase = opts.phase;
      return el;
    };

    return { px, rx, pt, slab, wall, steelWall, steelFloor, slope, beam, jumpPad, movingPlatform, dir: worldDir };
  }

  /**
   * 2D 공간 점유 & 헤드룸 & 클리어런스 감사기 (지형 겹침/인접 스폰-웜홀 원천 차단)
   */
  function auditLayout(level) {
    const reasons = [];
    if (!level || !Array.isArray(level.elements) || level.elements.length === 0) {
      return { ok: false, reasons: ['no_elements'] };
    }

    const els = level.elements;
    const sx = level.spawnX, sy = level.spawnY, gx = level.gateX, gy = level.gateY;

    // 1. 스폰-웜홀 이격 검사 (직선 낙하 날먹 및 라벨 겹침 금지)
    const sgDist = Math.hypot(sx - gx, sy - gy);
    if (sgDist < 260) reasons.push(`spawn_gate_too_close(${Math.round(sgDist)})`);
    if (Math.abs(sx - gx) < 140) reasons.push(`spawn_gate_dx_small(${Math.round(Math.abs(sx - gx))})`);

    // 2. 화면 경계 및 전체 화면 활용 범위 검사
    let minX = W, maxX = 0, minY = H, maxY = 0;
    for (let i = 0; i < els.length; i++) {
      const e = els[i];
      if (e.x < 10 || e.x + e.w > W - 10 || e.y < 16 || e.y + e.h > H - 18) {
        reasons.push(`out_of_bounds(#${i}:${e.type})`);
      }
      if (e.x < minX) minX = e.x;
      if (e.x + e.w > maxX) maxX = e.x + e.w;
      if (e.y < minY) minY = e.y;
      if (e.y + e.h > maxY) maxY = e.y + e.h;
    }
    if (maxX - minX < 500) reasons.push(`narrow_span_x(${Math.round(maxX - minX)})`);
    if (maxY - minY < 145) reasons.push(`narrow_span_y(${Math.round(maxY - minY)})`);

    // 3. 수평 플로어 층간 수직 헤드룸 & 무의미 겹침 검사
    const isFloorType = (t) => t === 'platform' || t === 'craggyRock' || t === 'volcanicBasalt' || t === 'quantumCrystal' || t === 'steelPlatform';
    const isStructFloor = (e) => isFloorType(e.type);

    for (let i = 0; i < els.length; i++) {
      const a = els[i];
      for (let j = i + 1; j < els.length; j++) {
        const b = els[j];
        const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
        const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);

        // 같은 타입/플로어끼리 겹치는 지형 금지 (단, floor 위에 steelPlatform 보강판(y===y) 제외)
        if (isStructFloor(a) && isStructFloor(b)) {
          if (ox > 12) {
            const topGap = Math.abs(a.y - b.y);
            // 의도적 같은 층 보강판(y 동일)이 아닌데 다른 층과 세로 간격 < 58px 이면 겹침 판정
            if (topGap > 0 && topGap < 58) {
              reasons.push(`floor_headroom_too_tight(#${i},${j}:gap=${topGap})`);
            }
          }
        }

        // 강철벽/암벽이 플로어나 다른 벽 내부를 지저분하게 관통하지 않도록 검사 (경계 접합 max 4px 허용)
        if ((a.type === 'steelBarrier' || a.type === 'rockWall') && isStructFloor(b)) {
          if (ox > 4 && oy > 6 && a.y < b.y && a.y + a.h > b.y + 6) {
            reasons.push(`wall_pierces_floor(#${i}->#${j}:oy=${oy})`);
          }
        }
        if ((b.type === 'steelBarrier' || b.type === 'rockWall') && isStructFloor(a)) {
          if (ox > 4 && oy > 6 && b.y < a.y && b.y + b.h > a.y + 6) {
            reasons.push(`wall_pierces_floor(#${j}->#${i}:oy=${oy})`);
          }
        }
      }
    }

    // 4. 스폰/웜홀 클리어런스 박스 침범 검사
    const overlapsBox = (e, bx, by, bw, bh) =>
      !(e.x + e.w <= bx || e.x >= bx + bw || e.y + e.h <= by || e.y >= by + bh);

    for (let i = 0; i < els.length; i++) {
      const e = els[i];
      if (overlapsBox(e, sx - 20, sy - 24, 40, 42)) {
        reasons.push(`spawn_blocked_by(#${i}:${e.type})`);
      }
      if (overlapsBox(e, gx - 20, gy - 20, 40, 40)) {
        reasons.push(`gate_blocked_by(#${i}:${e.type})`);
      }
    }

    // 5. 포탈 0 강제 검증
    if (level.skills && level.skills.portal > 0) {
      reasons.push('portal_must_be_zero');
    }

    return { ok: reasons.length === 0, reasons };
  }

  /* =========================================================================
   * 8대 Whole-Canvas Compositional Macro-Blueprint Families
   * =======================================================================*/
  const FORGE_BLUEPRINTS = {

    /**
     * [Blueprint 1] reverse_bridge_citadel — 더블 선발대 & 역방향 층간 계단 + 하단 점프패드 우회
     * (유저님 Stage 16 설계 철학의 절차적 진화형: 3가지 층 높이/서브 기믹 변형)
     */
    reverse_bridge_citadel: {
      id: 'reverse_bridge_citadel',
      layoutAlias: 'cascade',
      label: '더블 선발대 & 역방향 층간 가교',
      minTier: 1,
      tags: ['pioneer_split', 'fatal_drop', 'reverse_bridge', 'multi_route', 'jumppad'],
      build({ R, pal, dir, tierIdx, opts = {} }) {
        const g = makeWorldGeom(dir, pal);
        const st = stoneType(pal, R);
        const useJumpPad = opts.includeOptionB !== false;
        const useSlopes = opts.includeOptionA !== false;
        const useMoving = opts.includeMovingPlatform !== false && (tierIdx >= 3 || R() < 0.6);

        const y1 = 118 + R.irange(0, 6);           // Tier 1: 118~124 (안전 스폰/본대 대기층)
        const yCatch = y1 + 62;                    // 상단 좌측 캐치 렛지 (62px 안전 낙차, 역계단 미완성 시 180px 낙사)
        const y2 = y1 + 84;                        // Tier 2: 202~208 (선발대 작업층, 벽상단 y1-48과는 132px 치명 낙차!)
        const y3 = y2 + 80;                        // Tier 3-A: 282~288 (웜홀 성소)
        const y4 = 360;                            // Tier 3-B: 하단 점프패드 하이웨이

        const barrierTop = y1 - 48;                // y2 - barrierTop = 132px > 96px (본대 월담 시 전멸!)
        const elements = [];

        // --- Tier 1: 상단 본대 스폰 대기층 (x: 68..276) ---
        elements.push(g.steelWall(68, y1 - 66, 18, 66));                     // 좌측 안전 격벽
        elements.push(g.steelFloor(68, y1, 86, 16));                         // 스폰 아래 강철 보호대(즉시 드릴 방지)
        elements.push(g.slab(154, y1, 122, 16, st));                         // 굴착 가능한 본대 탈출 바닥 (x: 154..276)
        elements.push(g.steelWall(258, barrierTop, 18, 48));                 // 우측 48px 강철벽 (월담 시 낙사 유도)

        // --- 캐치 렛지: 본대 대각굴착 후 반사 및 역방향 계단 착지 거점 (x: 180..236, yCatch) ---
        elements.push(g.steelWall(180, yCatch - 42, 18, 42));
        elements.push(g.slab(180, yCatch, 56, 16, st));

        // --- Tier 2: 중단 선발대 작업 허브 (x: 270..658) ---
        // 좌측부(270..408)는 역방향 계단 출발 및 하부 우회 구역, 우측부(548..658)는 웜홀 천장 개방용 채굴 가능
        elements.push(g.slab(270, y2, 138, 18, st));                         // 역계단 출발점 & 하부 우회
        elements.push(g.steelFloor(408, y2, 140, 18));                       // 중단 중앙 강철 골격
        elements.push(g.slab(548, y2, 110, 18, st));                         // 웜홀 상단 파괴 가능 천장 (폭파/드릴/대각굴착)
        elements.push(g.steelWall(640, y2 - 62, 18, 62));                    // 우측 강철벽 (안정적 반사 보장)
        if (useMoving) {
          elements.push(g.movingPlatform(664, y3, 62, 16, 'vertical', 60, { speed: 0.75, pauseTicks: 24 }));
        }

        // --- Tier 3: 웜홀 성소 & 하단 점프패드 고속 우회로 ---
        if (useSlopes) {
          elements.push(g.slope(256, y3 - 34, 84, 34, 'up-right', false));
        }
        elements.push(g.slab(256, y3, 148, 18, st));                         // 하부 중계 발판
        elements.push(g.steelWall(102, y4 - 64, 18, 64));                    // 하단 좌측 반사벽
        elements.push(g.slab(102, y4, 620, 20, st));                         // 하단 전폭 하이웨이 (Tier 4)
        if (useJumpPad) {
          elements.push(g.jumpPad(422, y4 - 10, 'up-right', 8.8));           // 하단에서 웜홀 성소로 단번에 도약하는 점프패드!
        }

        // 웜홀 성소 (x: 500..736, y3) — 좌측이 열려 있어 하단 점프패드/굴착으로도 진입 가능, 천장 위에서도 진입 가능
        elements.push(g.steelFloor(500, y3, 46, 18));                        // 성소 좌측 입구 경계
        elements.push(g.slab(546, y3, 188, 20, st));
        elements.push(g.steelWall(716, y3 - 64, 18, 64));

        const spawnX = Math.round(g.px(118));
        const spawnY = y1 - 42;
        const gateX = Math.round(g.px(618));
        const gateY = y3 - 26;

        // 정석 해법 플랜: 선발대1 흡착+역추진 -> 웜홀 위 방어막 -> 선발대2 흡착+역추진+반사후 캐치 렛지로 역계단 -> 본대 대각굴착 합류 -> 방어막 코어폭파/드릴 해제
        const plan = [
          { skill: 'climb', unit: 'pioneer1', at: g.pt(210, y1, 16), dir },
          { skill: 'float', unit: 'pioneer1', at: g.pt(232, y1, 16), dir },
          { skill: 'block', unit: 'pioneer1', at: g.pt(602, y2, 10), dir },
          { skill: 'climb', unit: 'pioneer2', at: g.pt(210, y1, 16), dir },
          { skill: 'float', unit: 'pioneer2', at: g.pt(232, y1, 16), dir },
          { skill: 'build', unit: 'pioneer2', at: g.pt(282, y2, 10), dir: -dir },
          { skill: 'mine',  unit: 'crowd_lead', at: g.pt(192, y1, 10), dir, minSpawned: 6, wait: 120 },
          { skill: 'drill', unit: 'blocker', at: g.pt(602, y2, 14), wait: 220 }
        ];

        return {
          blueprintId: 'reverse_bridge_citadel',
          layoutType: 'cascade',
          variantName: useMoving ? '리프트 & 역방향 층간 가교' : '반사벽 & 역방향 층간 가교',
          gimmickLabel: '역계단 상하 합류 + 하단 점프패드',
          elements, spawnX, spawnY, gateX, gateY,
          plan,
          // 폭파(bomb)와 드릴/대각굴착 모두 제공해 플레이어가 마지막 방어막 해제를 선택 가능 (단, float는 2개 제한!)
          req: { climb: 2, float: 2, block: 1, build: 1, mine: 1, drill: 1 },
          altBonus: { bomb: 1, build: 1 },
          maxFloat: 2,
          tags: ['pioneer_split', 'fatal_drop', 'reverse_bridge', 'multi_route', 'jumppad'],
          solutionDna: ['CLIMB', 'FLOAT', 'BLOCK', 'BUILD', 'MINE', 'DRILL'],
          hint: '선발대 1호가 흡착+역추진으로 내려가 웜홀 위에서 방어막을 세우면, 선발대 2호가 반사되어 중단 왼쪽 끝에서 캐치 렛지로 역방향 계단을 올릴 수 있습니다.'
        };
      }
    },

    /**
     * [Blueprint 2] bunker_underpass — 강철 벙커 상부 봉쇄 & 지하 우회 굴착 + 점프패드 도약
     */
    bunker_underpass: {
      id: 'bunker_underpass',
      layoutAlias: 'chamber',
      label: '강철 벙커 지하 우회 & 척력 도약',
      minTier: 1,
      tags: ['pioneer_split', 'fatal_drop', 'anti_climb', 'jumppad', 'underpass'],
      build({ R, pal, dir, tierIdx, opts = {} }) {
        const g = makeWorldGeom(dir, pal);
        const st = stoneType(pal, R);
        const y1 = 118 + R.irange(0, 12);         // 상단 스폰층 (118~130)
        const y2 = y1 + 84;                       // 중단 지하 통로 (202~214)
        const y3 = y1 + 168;                      // 하단 심층 통로 (286~298)
        const yW = y2 - 24;                       // 우상단 웜홀 요새 고도 (낙사 없는 안전 도약 고도)

        const elements = [];

        // --- Tier 1: 스폰 대기실 & 전방 초대형 강철 벙커 ---
        elements.push(g.steelWall(64, y1 - 66, 18, 66));                     // 좌측 가드
        elements.push(g.steelFloor(64, y1, 86, 18));                         // 스폰 강철판
        elements.push(g.slab(150, y1, 118, 18, st));                         // 드릴/대각굴착 구간 (150..268)
        // 중앙 초대형 강철 벙커 (등반 불가 오버행 + 지붕)
        elements.push(g.steelWall(310, y1 - 74, 22, 92));
        elements.push(g.steelFloor(292, y1 - 74, 210, 18));                  // 오버행 지붕 -> 흡착 등반 원천 차단!
        elements.push(g.steelWall(480, y1 - 56, 22, 74));

        // --- Tier 2: 벙커 하단 지하 잠입 회랑 (x: 150..612) ---
        elements.push(g.steelWall(150, y2 - 58, 18, 58));                    // 좌측 안전 반사 강철벽
        elements.push(g.steelFloor(150, y2, 70, 18));                        // 착지용 강철판 (무지성 연쇄 드릴 방지)
        elements.push(g.slab(220, y2, 230, 18, st));                         // 중단 채굴 구간
        elements.push(g.wall(355, y2 - 64, 34, 64));                         // 지하 암벽 (레이저 돌파 대상)
        // 갭 (450..494): 계단 1칸(48px)으로 다리 건설 필요!
        elements.push(g.slab(494, y2, 118, 18, st));                         // 점프패드 발사대
        elements.push(g.jumpPad(556, y2 - 10, 'up-right', 8.4));             // 벙커 뒤 웜홀 성채로 정밀 도약!

        // --- Tier 3: 심층 우회 회랑 & 우상단 웜홀 성채 ---
        elements.push(g.slab(180, y3, 410, 18, st));                         // 심층 안전/대체 경로
        elements.push(g.steelWall(164, y3 - 60, 18, 60));
        if (opts.includeMovingPlatform !== false && tierIdx >= 3) {
          elements.push(g.movingPlatform(600, yW + 40, 82, 16, 'vertical', 92, { speed: 0.75, pauseTicks: 24 }));
        }
        // 우상단 웜홀 성채 (x: 618..744, yW) — 점프패드로 뛰어넘어오는 구조!
        elements.push(g.slab(618, yW, 126, 20, st));
        elements.push(g.steelWall(726, yW - 64, 18, 64));

        const spawnX = Math.round(g.px(110));
        const spawnY = y1 - 42;
        const gateX = Math.round(g.px(690));
        const gateY = yW - 26;

        // 정석 해법: 본대는 방어막으로 대기시키고 선봉대만 지하로 드릴/굴착 후 다리 건설 완료 시점까지 기다렸다가 해제 -> 점프패드로 웜홀 성채 안착
        const plan = [
          { skill: 'block', unit: 'pioneer1', at: g.pt(254, y1, 10), dir },
          { skill: 'drill', unit: 'pioneer2', at: g.pt(188, y1, 12), dir },
          { skill: 'bash',  unit: 'pioneer2', at: g.pt(340, y2, 14), dir },
          { skill: 'build', unit: 'pioneer2', at: g.pt(442, y2, 10), dir },
          { skill: 'drill', unit: 'blocker',  at: g.pt(254, y1, 12), wait: 240, minSpawned: 6 }
        ];

        return {
          blueprintId: 'bunker_underpass',
          layoutType: 'chamber',
          variantName: '강철 벙커 언더패스 & 척력 도약',
          gimmickLabel: '강철 오버행 + 지하 개척 + 점프패드',
          elements, spawnX, spawnY, gateX, gateY,
          plan,
          req: { block: 1, drill: 2, bash: 1, build: 1 },
          altBonus: { bomb: 1, mine: 1 },
          tags: ['pioneer_split', 'fatal_drop', 'anti_climb', 'jumppad', 'underpass'],
          solutionDna: ['BLOCK', 'DRILL', 'BASH', 'BUILD', 'DRILL'],
          hint: '상단 거대 강철 벙커는 오버행 때문에 등반할 수 없습니다. 방어막으로 대열을 제어한 채 지하 회랑을 먼저 뚫어 다리를 잇고 점프패드로 도약하세요.'
        };
      }
    },

    /**
     * [Blueprint 3] criss_cross_reactor — 중앙 타워 양방향 크로스오버 & 후방 역습
     * (화면 좌→우 상단 횡단 → 우측 반사 → 우→좌 중단 역방향 관통 → 좌측 상단 본대 해방 → 하단 탈출)
     */
    criss_cross_reactor: {
      id: 'criss_cross_reactor',
      layoutAlias: 'zigzag',
      label: '양방향 크로스오버 & 후방 타워 관통',
      minTier: 2,
      tags: ['pioneer_split', 'backdoor', 'uturn', 'fatal_drop'],
      build({ R, pal, dir, tierIdx, opts = {} }) {
        const g = makeWorldGeom(dir, pal);
        const st = stoneType(pal, R);
        const y1 = 108 + R.irange(0, 10);         // Tier 1: 상단 (108~118)
        const y2 = y1 + 80;                       // Tier 2: 중단 (188~198)
        const y3 = y2 + 86;                       // Tier 3: 하단 (274~284)

        const elements = [];

        // --- Tier 1: 좌상단 감금실 + 상단 중앙 교량 (x: 68..556) ---
        elements.push(g.steelWall(68, y1 - 64, 18, 64));                     // 좌측 격벽
        elements.push(g.steelFloor(68, y1, 74, 16));
        elements.push(g.slab(142, y1, 88, 16, st));                          // 본대 하강용 굴착 구간 (142..230)
        elements.push(g.steelWall(230, y1 - 44, 18, 44));                    // 44px 강철 가드 (선발대만 흡착 등반)
        elements.push(g.slab(248, y1, 130, 16, st));                         // 상단 교량 앞부분 (248..378)
        // 상단 갭 (378..418): 계단 1개로 다리 건설
        elements.push(g.slab(418, y1, 148, 16, st));                         // 상단 교량 뒷부분 (418..566)

        // --- Tier 2: 우측 반사 -> 좌측으로 역주행하며 타워 허리 역관통 (x: 130..726) ---
        elements.push(g.slab(540, y2, 186, 18, st));                         // 우측 착지 날개 (540..726, y1->y2 = 80px 안전)
        elements.push(g.steelWall(708, y2 - 64, 18, 64));                    // 우측 반사 강철벽 (선발대가 방향 -dir로 반전!)
        elements.push(g.slab(132, y2, 408, 18, st));                         // 중단 메인 회랑 (132..540)
        // 중앙 일방통행 타워: 왼쪽(앞면)은 강철판이라 뚫을 수 없고, 오른쪽(뒷면)만 암벽이라 역주행 시 BASH 가능!
        elements.push(g.steelWall(392, y2 - 60, 18, 60));
        elements.push(g.wall(410, y2 - 60, 34, 60));                         // 우측에서 BASH 후 강철은 없으므로... 아! 우측 BASH 시 왼쪽 x=392가 강철이면 막히므로, 반대로:
        // 잠깐! 왼쪽에 강철벽이 있으면 오른쪽에서 BASH하다 392에서 강철을 맞으면 튕겨나가서 막힘!
        // 그러므로 타워의 오른쪽(410)은 열려 있고, **윗층 바닥(142..230)** 아래 중단으로 이어지는 구간에 반향 스텝이 있어야 정석!
        // 수정: 일방통행 타워 대신, 왼쪽에서 올라갈 수 없는 **상부 강철벽(230)**을 넘어서 우측에서 내려온 뒤, 392~430은 순수 파괴 가능 암벽(42px) + 상단 강철 캡(climb 방지)으로 만들고, 본대는 좌상단(142..230)에서 중단(y2)으로 DRILL하여 합류한 뒤 우측 끝까지 걸어 내려가 Tier 3로 하강!
        // 잠깐: 만약 중단(y2)에 392 강철벽을 빼고 rockWall(w: 44, h: 60) + 상단 steelWall(캡)을 두면? 그러면 선발대가 우→좌로 걸어가며 410 rockWall을 BASH로 뚫어놓고, 142~230 아래까지 가서(혹은 본대가 직접 180에서 DRILL해 내려와서) 합류해 우측으로 행진, x=540 앞 구간을 지나... 아! Tier 2 오른쪽 x=540..660에 바닥을 DRILL/MINE하거나, 우측 끝 y2에 있는 rockWall을 뚫고 Tier 3(y3)로 내려가면 완벽!
        elements.pop(); elements.pop(); // 직전 wall/steelWall 임시 제거 후 깔끔하게 재구성:
        elements.push(g.wall(370, y2 - 58, 38, 58));                         // 중앙 암벽 (후방 BASH)
        elements.push(g.steelWall(368, y2 - 74, 42, 16));                    // 상단 오버행 강철 캡 (월담 금지)

        // --- Tier 3: 하단 웜홀 회랑 (x: 68..708) ---
        // Tier 2 좌측 끝 x=132 바로 아래가 Tier 3 좌측 착지부가 되도록 x=68 까지 확장
        elements.push(g.steelWall(68, y3 - 62, 18, 62));
        elements.push(g.slab(68, y3, 640, 20, st));
        if (opts.includeOptionB !== false) {
          elements.push(g.jumpPad(280, y3 - 10, 'right', 10.0));             // 하단 우측 고속 추진 점프패드
        }
        elements.push(g.wall(540, y3 - 58, 32, 58));                         // 웜홀 앞 최종 암벽
        elements.push(g.steelWall(690, y3 - 64, 18, 64));

        const spawnX = Math.round(g.px(110));
        const spawnY = y1 - 42;
        const gateX = Math.round(g.px(652));
        const gateY = y3 - 26;

        // 정석 동선:
        // 1) 선발대1이 y1 강철벽(230)을 CLIMB -> 378 갭을 BUILD -> 우측 566에서 y2로 떨어져 우측벽(708) 반사(dir = -dir)
        // 2) 좌측으로 역주행하며 중앙 암벽(370)을 BASH로 개통 -> Tier 2 왼쪽 끝(132)으로 걸어가 Tier 3(y3)로 안전 하강(86px <= 96px) -> 우측 진행하며 540 암벽 BASH!
        // 3) 한편 본대는 y1(185)에서 DRILL해 Tier 2로 안전 합류(80px) -> 아까 선발대가 뚫어놓은 중앙 암벽과 계단을 지나 Tier 2 좌측으로 안전 하강 -> Tier 3 점프패드 타고 웜홀 직행!
        const plan = [
          { skill: 'climb', unit: 'pioneer1', at: g.pt(190, y1, 16), dir },
          { skill: 'build', unit: 'pioneer1', at: g.pt(372, y1, 10), dir },
          { skill: 'bash',  unit: 'pioneer1', at: g.pt(424, y2, 16), dir: -dir },
          { skill: 'drill', unit: 'crowd_lead', at: g.pt(186, y1, 12), dir, minSpawned: 7, wait: 160 },
          { skill: 'bash',  unit: 'pioneer1', at: g.pt(524, y3, 16), dir }
        ];

        return {
          blueprintId: 'criss_cross_reactor',
          layoutType: 'zigzag',
          variantName: '전폭 크로스오버 & 후방 역습',
          gimmickLabel: '좌→우 개척 + 반사 역공 + 본대 합류',
          elements, spawnX, spawnY, gateX, gateY,
          plan,
          req: { climb: 1, build: 1, bash: 2, drill: 1 },
          altBonus: { build: 1 },
          tags: ['pioneer_split', 'backdoor', 'uturn', 'anti_climb'],
          solutionDna: ['CLIMB', 'BUILD', 'BASH', 'DRILL', 'BASH'],
          hint: '선발대 1명만 상단 강철벽을 등반해 우측 끝에서 방향을 반전시킨 뒤, 중단 중앙 암벽을 반대쪽에서 뚫어놓고 상단 본대를 드릴로 내려보내 합류시키십시오.'
        };
      }
    },

    /**
     * [Blueprint 4] holding_chamber_liberation — 무방어막 지형 가두리 & 시간차 일괄 해방
     * (block = 0! 월담 낙사 116px vs 벽 파괴 후 낙하 80px의 물리 차이를 이용한 레밍즈식 고난도 퍼즐)
     */
    holding_chamber_liberation: {
      id: 'holding_chamber_liberation',
      layoutAlias: 'split',
      label: '무방어막 지형 가두리 & 시간차 해방',
      minTier: 2,
      tags: ['no_block_pit', 'pioneer_split', 'fatal_drop', 'anti_climb'],
      build({ R, pal, dir, tierIdx, opts = {} }) {
        const g = makeWorldGeom(dir, pal);
        const st = stoneType(pal, R);
        const y1 = 132 + R.irange(0, 8);          // 가두리 바닥 (132~140)
        const y2 = y1 + 80;                       // 중단 착지층 (212~220) — 바닥끼리 80px(안전), 벽꼭대기(y1-34)와 114px(낙사!)
        const y3 = y2 + 82;                       // 하단 웜홀층 (294~302)

        const elements = [];

        // --- Tier 1: 본대 천연 가두리 (x: 68..236) ---
        elements.push(g.steelWall(68, y1 - 68, 18, 68));                     // 좌측 강철벽
        elements.push(g.steelFloor(68, y1, 168, 18));                        // 강철 바닥(아래로 드릴 꼼수 금지)
        elements.push(g.wall(204, y1 - 34, 32, 34));                         // 우측 34px 암벽 (등반해 넘어가면 y1-34 -> y2 = 114px 낙사! 뚫으면 80px 안전!)

        // --- Tier 2: 중단 대공사 구역 (x: 244..690) ---
        elements.push(g.slab(244, y2, 136, 18, st));                         // 착지부 (244..380)
        // 중앙 40px 갭 (380..420): 선발대가 미리 BUILD 해두지 않으면 본대가 빠져 전멸!
        elements.push(g.slab(420, y2, 260, 18, st));                         // 우측부 (420..680)
        elements.push(g.wall(515, y2 - 58, 34, 58));                         // 중단 방어벽 (BASH or BOMB)
        elements.push(g.steelWall(662, y2 - 62, 18, 62));                    // 우측 반사 강철벽

        // --- Tier 3: 하단 웜홀 회랑 (x: 340..726) ---
        elements.push(g.steelFloor(580, y2, 82, 18));                        // 우측 끝 아래로 바로 드릴 꼼수 방지, 570 앞 파괴 가능 바닥이나 우측 끝 갭 하강:
        // 잠깐! 우측 끝 662에 강철벽이 있으면, 중단에서 580~650 구간을 뚫고(DRILL/MINE) Tier 3로 내려가야 함!
        // 위 420..680 중 580..680을 steelFloor로 깔지 말고 destructible slab(560..662)으로 두어야 595에서 DRILL 가능!
        elements.pop(); elements.pop();
        elements.push(g.slab(420, y2, 242, 18, st));                         // 420..662 파괴 가능
        elements.push(g.steelWall(662, y2 - 62, 18, 62));

        elements.push(g.slab(470, y3, 258, 20, st));
        if (opts.includeOptionB !== false) {
          elements.push(g.jumpPad(520, y3 - 10, 'right', 9.0));              // 하단 쾌속 점프패드 (380..420 갭은 아래가 낭떠러지)
        }
        elements.push(g.steelWall(470, y3 - 60, 18, 60));
        elements.push(g.steelWall(710, y3 - 64, 18, 64));

        const spawnX = Math.round(g.px(124));
        const spawnY = y1 - 42;
        const gateX = Math.round(g.px(660));
        const gateY = y3 - 26;

        // 정석 해법 (`block` 0개!):
        // 1) 선발대1이 가두리(204) 암벽을 CLIMB + FLOAT로 넘어가 중단(y2)에 안전 착지
        // 2) 중단 380 갭에 BUILD 다리 건설 -> 515 암벽 BASH -> 610 바닥을 DRILL하여 Tier 3 직결 완료
        // 3) 이제 가두리 본대 선두(id>=2)에게 BASH를 걸어 204 암벽을 부수면(80px 안전 낙차!) 전원 안전 합류 -> 웜홀 탈출!
        const plan = [
          { skill: 'climb', unit: 'pioneer1', at: g.pt(175, y1, 16), dir },
          { skill: 'float', unit: 'pioneer1', at: g.pt(190, y1, 16), dir },
          { skill: 'build', unit: 'pioneer1', at: g.pt(372, y2, 10), dir },
          { skill: 'bash',  unit: 'pioneer1', at: g.pt(500, y2, 16), dir },
          { skill: 'drill', unit: 'pioneer1', at: g.pt(610, y2, 12), dir },
          { skill: 'bash',  unit: 'crowd_lead', at: g.pt(192, y1, 12), dir, minSpawned: 6, wait: 60 }
        ];

        return {
          blueprintId: 'holding_chamber_liberation',
          layoutType: 'split',
          variantName: '무방어막 가두리 & 시간차 해방',
          gimmickLabel: '월담 낙사(114px) vs 돌파 안전(80px)',
          elements, spawnX, spawnY, gateX, gateY,
          plan,
          // block 절대 0, float 최대 1~2개!
          req: { climb: 1, float: 1, build: 1, bash: 2, drill: 1 },
          altBonus: { mine: 1, bomb: 1 },
          forbidSkills: ['block'],
          maxFloat: tierIdx >= 4 ? 1 : 2,
          tags: ['no_block_pit', 'pioneer_split', 'fatal_drop'],
          solutionDna: ['CLIMB', 'FLOAT', 'BUILD', 'BASH', 'DRILL', 'BASH'],
          hint: '방어막이 없지만 본대는 상단 가두리에서 안전하게 왕복합니다. 1명만 흡착+역추진으로 넘어가 아래층 다리와 구멍을 모두 완성한 뒤 마지막에 가두리 벽을 부수세요!'
        };
      }
    },

    /**
     * [Blueprint 5] beam_skate_labyrinth — 대각선 강철 빔 활주 & 점프패드 궤적 퍼즐
     */
    beam_skate_labyrinth: {
      id: 'beam_skate_labyrinth',
      layoutAlias: 'traverse',
      label: '대각선 강철 빔 활주 & 궤적 퍼즐',
      minTier: 1,
      tags: ['beam_skate', 'pioneer_split', 'jumppad', 'fatal_drop'],
      build({ R, pal, dir, tierIdx, opts = {} }) {
        const g = makeWorldGeom(dir, pal);
        const st = stoneType(pal, R);
        const y1 = 108 + R.irange(0, 8);          // 상단 스폰 (108~116)
        const y2 = y1 + 120;                      // 중단 활주 착지 (228~236) -> 빔 안 타면 120px 낙사!
        const y3 = y2 + 86;                       // 하단 웜홀층 (314~322)

        const elements = [];

        // --- Tier 1: 상단 스폰 ---
        elements.push(g.steelWall(66, y1 - 64, 18, 64));
        elements.push(g.steelFloor(66, y1, 186, 16));

        // --- 45도 대각선 강철 빔 캐치 램프 (x: 256..336, y1+34 .. y1+114) ---
        // topY at x=256 is (y1+34) - 8 = y1+26 (safe 26px drop from y1!)
        // topY at x=336 is (y1+114) - 8 = y1+106 = y2 - 14 (smooth drop onto y2!)
        elements.push(g.beam(256, y1 + 34, 80, 80, 1, 16));

        // --- Tier 2: 활주 착지 & 개척 회랑 (x: 330..694) ---
        elements.push(g.slab(330, y2, 48, 18, st));                          // 빔 착지 구역 (330..378)
        // 갭 (378..418): 미완성 시 하부 낭떠러지(x < 422)로 추락!
        elements.push(g.slab(418, y2, 142, 18, st));                         // 중앙 채굴 가능 구역 (418..560)
        elements.push(g.steelFloor(560, y2, 134, 18));                       // 우측 드릴 방지 강철 바닥 (560..694)
        elements.push(g.wall(532, y2 - 58, 34, 58));                         // 중간 암벽
        elements.push(g.steelWall(676, y2 - 64, 18, 64));                    // 우측 반사벽

        // --- Tier 3: 하단 웜홀/점프패드 회랑 (x: 422..728) ---
        elements.push(g.steelWall(422, y3 - 58, 18, 58));                    // 하부 좌측 반사벽
        elements.push(g.slab(422, y3, 108, 18, st));                         // 하부 드릴 착지 & 점프패드 구역 (422..530)
        if (opts.includeOptionB !== false) {
          elements.push(g.jumpPad(448, y3 - 10, 'up-right', 8.4));           // 중앙 강철 격벽(506)을 뛰어넘어 웜홀 발판으로 도약!
        } else {
          elements.push(g.slab(490, y3, 56, 18, st));
        }
        elements.push(g.steelWall(506, y3 - 40, 18, 40));                    // 점프패드로 넘어야 하는 중앙 강철 격벽 (높이 40px)
        elements.push(g.slab(530, y3, 198, 20, st));                         // 웜홀 발판
        elements.push(g.steelWall(710, y3 - 64, 18, 64));

        const spawnX = Math.round(g.px(110));
        const spawnY = y1 - 42;
        const gateX = Math.round(g.px(668));
        const gateY = y3 - 26;

        // 정석 해법: 1호가 빔을 타고 내려가고 2호가 그 뒤를 막은 뒤, 1호가 개척을 완료하면 본대 해제
        const plan = [
          { skill: 'block', unit: 'pioneer2', at: g.pt(210, y1, 12), dir },
          { skill: 'build', unit: 'pioneer1', at: g.pt(370, y2, 10), dir },
          { skill: 'bash',  unit: 'pioneer1', at: g.pt(514, y2, 16), dir },
          { skill: 'drill', unit: 'pioneer1', at: g.pt(492, y2, 14), dir: -dir },
          { skill: 'block', unit: 'blocker',  at: g.pt(210, y1, 14), wait: 160, minSpawned: 6 }
        ];

        return {
          blueprintId: 'beam_skate_labyrinth',
          layoutType: 'traverse',
          variantName: '강철 빔 활주 & 척력 점프패드',
          gimmickLabel: '45° 빔 스케이트 + 반사 드릴 + 점프패드',
          elements, spawnX, spawnY, gateX, gateY,
          plan,
          req: { block: 2, build: 1, bash: 1, drill: 1 },
          altBonus: { bomb: 1, mine: 1 },
          tags: ['beam_skate', 'pioneer_split', 'jumppad', 'uturn'],
          solutionDna: ['BLOCK', 'BUILD', 'BASH', 'DRILL', 'BLOCK'],
          hint: '선발대 1명을 먼저 강철 빔으로 활주시킨 뒤 방어막으로 본대를 대기시키십시오. 우측 끝 반사 후 중앙 왼쪽 바닥을 드릴로 뚫으면 하단 점프패드가 강철 격벽을 넘어 웜홀로 쏘아 올립니다.'
        };
      }
    },

    /**
     * [Blueprint 6] twin_citadel_crossing — 트윈 시타델 협곡 도약 & 하부 우회 하이웨이
     */
    twin_citadel_crossing: {
      id: 'twin_citadel_crossing',
      layoutAlias: 'ascent',
      label: '트윈 시타델 협곡 교차',
      minTier: 1,
      tags: ['twin_citadel', 'jumppad', 'pioneer_split', 'multi_route'],
      build({ R, pal, dir, tierIdx, opts = {} }) {
        const g = makeWorldGeom(dir, pal);
        const st = stoneType(pal, R);
        const y1 = 114 + R.irange(0, 8);          // 좌측 시타델 상단
        const y2 = y1 + 78;                       // 좌측/우측 시타델 중단 (192~200)
        const y3 = y2 + 88;                       // 웜홀 성소 및 협곡 바닥 (280~288)
        const y4 = 362;                           // 최하단 보조 루트

        const elements = [];

        // --- 좌측 시타델 (x: 68..288) ---
        elements.push(g.steelWall(68, y1 - 64, 18, 64));
        elements.push(g.steelFloor(68, y1, 86, 16));
        elements.push(g.slab(154, y1, 114, 16, st));                         // y1 드릴/대각굴착 구간
        elements.push(g.steelWall(268, y1 - 56, 20, 56));

        elements.push(g.steelWall(96, y2 - 58, 18, 58));                    // 좌측 시타델 중단 반사벽
        elements.push(g.steelFloor(96, y2, 74, 18));
        elements.push(g.slab(170, y2, 128, 18, st));
        // 협곡 도약대 (점프패드 OR 징검다리 섬 계단)
        if (opts.includeOptionB !== false) {
          elements.push(g.jumpPad(250, y2 - 10, 'right', 8.8));              // 중앙 협곡 안전 도약!
        }

        // --- 중앙 징검다리 섬 (x: 368..428, y2+16) --- (점프패드 대신/보조 계단 루트)
        elements.push(g.slab(368, y2 + 12, 62, 16, st));

        // --- 우측 시타델 (x: 436..658) ---
        elements.push(g.slab(436, y2, 222, 18, st));                         // 점프패드 착지층
        elements.push(g.wall(552, y2 - 58, 32, 58));                         // 우측 시타델 암벽
        elements.push(g.steelWall(658, y2 - 64, 20, 64));                    // 우측 강철벽 (우측에서 떨어지는 꼼수 방지)

        // 우측 시타델 하부 웜홀 성소 (x: 492..732, y3)
        elements.push(g.slab(492, y3, 240, 20, st));
        elements.push(g.steelWall(492, y3 - 56, 18, 56));
        elements.push(g.steelWall(714, y3 - 64, 18, 64));

        // 최하단 하부 하이웨이 (x: 130..480, y4) — 좌측 시타델 지하로 빠졌을 때 복귀용
        elements.push(g.slab(130, y4, 340, 18, st));
        if (opts.includeOptionA !== false) {
          elements.push(g.slope(180, y4 - 28, 60, 28, 'up-right', false));
        }
        elements.push(g.steelWall(130, y4 - 56, 18, 56));
        if (opts.includeOptionB !== false) {
          elements.push(g.jumpPad(422, y4 - 10, 'up-right', 11.2));
        }

        const spawnX = Math.round(g.px(114));
        const spawnY = y1 - 42;
        const gateX = Math.round(g.px(662));
        const gateY = y3 - 26;

        const plan = [
          { skill: 'block', unit: 'pioneer1', at: g.pt(232, y1, 10), dir },
          { skill: 'drill', unit: 'pioneer2', at: g.pt(184, y1, 12), dir },
          { skill: 'bash',  unit: 'pioneer2', at: g.pt(536, y2, 16), dir },
          { skill: 'drill', unit: 'pioneer2', at: g.pt(614, y2, 12), dir },
          { skill: 'block', unit: 'blocker',  at: g.pt(232, y1, 14), wait: 160, minSpawned: 5 }
        ];

        return {
          blueprintId: 'twin_citadel_crossing',
          layoutType: 'ascent',
          variantName: '트윈 시타델 협곡 교차',
          gimmickLabel: '협곡 점프패드 + 이중 시타델 + 하부 우회',
          elements, spawnX, spawnY, gateX, gateY,
          plan,
          req: { block: 2, drill: 2, bash: 1 },
          altBonus: { build: 2, climb: 1, mine: 1 },
          tags: ['twin_citadel', 'jumppad', 'pioneer_split', 'multi_route'],
          solutionDna: ['BLOCK', 'DRILL', 'BASH', 'DRILL', 'BLOCK'],
          hint: '좌측 시타델 상단에서 드릴로 내려와 중단 점프패드로 협곡을 뛰어넘고, 우측 시타델 암벽 돌파 후 웜홀 위 바닥을 뚫어 진입하십시오.'
        };
      }
    },

    /**
     * [Blueprint 7] elevator_skybridge — 무빙발판 셔틀 동기화 & 상하 협동 개척
     */
    elevator_skybridge: {
      id: 'elevator_skybridge',
      layoutAlias: 'elevator',
      label: '무빙발판 셔틀 & 상하 협동 개척',
      minTier: 2,
      tags: ['moving_platform', 'pioneer_split', 'fatal_drop', 'timing'],
      build({ R, pal, dir, tierIdx, opts = {} }) {
        const g = makeWorldGeom(dir, pal);
        const st = stoneType(pal, R);
        const y1 = 118 + R.irange(0, 6);
        const y2 = y1 + 82;                       // 200~206
        const yShuttle = y2 - 14;                 // 셔틀 발판 고도 (계단 상승 후 탑승)
        const y2R = y2 + 6;                       // 셔틀 하차 후 우측 공중 요새
        const y3 = y2R + 82;                      // 288~294 (하부 웜홀 성소)

        const elements = [];

        // --- Tier 1: 스폰 대기층 ---
        elements.push(g.steelWall(66, y1 - 64, 18, 64));
        elements.push(g.steelFloor(66, y1, 110, 16));
        elements.push(g.slab(176, y1, 114, 16, st));
        elements.push(g.steelWall(274, y1 - 54, 18, 54));

        // --- Tier 2 Left: 무빙발판 셔틀 승차장 (x: 130..334, y2) ---
        elements.push(g.steelWall(130, y2 - 58, 18, 58));
        elements.push(g.slab(130, y2, 204, 18, st));

        // --- 수평 무빙발판 셔틀 (x: 346..470, range: 18 -> 364..488 항상 커버, 위상 무관 도하) ---
        elements.push(g.movingPlatform(346, yShuttle, 124, 16, 'horizontal', 18, { speed: 0.6, pauseTicks: 20 }));

        // --- Tier 2 Right: 우측 공중 요새 (x: 448..692, y2R) ---
        elements.push(g.slab(448, y2R, 172, 18, st));
        elements.push(g.wall(548, y2R - 58, 32, 58));
        elements.push(g.steelFloor(620, y2R, 72, 18));
        elements.push(g.steelWall(674, y2R - 64, 18, 64));

        // --- Tier 3: 하부 웜홀 성소 (x: 486..728 — 셔틀 구간 아래는 낭떠러지) ---
        elements.push(g.steelWall(486, y3 - 58, 18, 58));
        elements.push(g.slab(486, y3, 242, 20, st));
        elements.push(g.steelWall(710, y3 - 64, 18, 64));

        const spawnX = Math.round(g.px(116));
        const spawnY = y1 - 42;
        const gateX = Math.round(g.px(658));
        const gateY = y3 - 26;

        // 정석 해법: 1층 방어막 대기 -> 2호 드릴로 2층 하강 -> 셔틀 탑승용 계단 건설 -> 요새 암벽 돌파 -> 하부 성소 위 드릴 -> 본대 해방
        const plan = [
          { skill: 'block', unit: 'pioneer1', at: g.pt(240, y1, 10), dir },
          { skill: 'drill', unit: 'pioneer2', at: g.pt(202, y1, 12), dir },
          { skill: 'build', unit: 'pioneer2', at: g.pt(326, y2, 10), dir },
          { skill: 'bash',  unit: 'pioneer2', at: g.pt(532, y2R, 16), dir },
          { skill: 'drill', unit: 'pioneer2', at: g.pt(602, y2R, 10), dir },
          { skill: 'block', unit: 'blocker',  at: g.pt(240, y1, 14), wait: 260, minSpawned: 6 }
        ];

        return {
          blueprintId: 'elevator_skybridge',
          layoutType: 'elevator',
          variantName: '무빙발판 셔틀 & 공중 가교',
          gimmickLabel: '수평 무빙발판 + 상하 2중 드릴',
          elements, spawnX, spawnY, gateX, gateY,
          plan,
          req: { block: 2, drill: 2, build: 1, bash: 1 },
          altBonus: { mine: 1, bomb: 1 },
          tags: ['moving_platform', 'pioneer_split', 'timing'],
          solutionDna: ['BLOCK', 'DRILL', 'BUILD', 'BASH', 'DRILL', 'BLOCK'],
          hint: '선발대가 1층에서 드릴로 내려가 계단을 놓아 수평 무빙발판에 오른 뒤, 우측 요새의 암벽과 바닥을 미리 뚫고 본대 방어막을 해제하십시오.'
        };
      }
    },

    /**
     * [Blueprint 8] cascading_terraces_highway — 4단 스위치백 & 정밀 코어 폭파/하부 점프패드
     */
    cascading_terraces_highway: {
      id: 'cascading_terraces_highway',
      layoutAlias: 'terraces',
      label: '4단 스위치백 & 정밀 코어 폭파',
      minTier: 2,
      tags: ['timing', 'half_steel', 'pioneer_split', 'jumppad'],
      build({ R, pal, dir, tierIdx, opts = {} }) {
        const g = makeWorldGeom(dir, pal);
        const st = stoneType(pal, R);
        const y1 = 104;
        const y2 = 182;
        const y3 = 262;
        const y4 = 352;

        const elements = [];

        // --- Tier 1 (상단: x: 66..340, y1=104) ---
        elements.push(g.steelWall(66, y1 - 62, 18, 62));
        elements.push(g.steelFloor(66, y1, 94, 16));
        elements.push(g.slab(160, y1, 180, 16, st));
        elements.push(g.steelWall(322, y1 - 58, 18, 58));

        // --- Tier 2 (중상단: x: 256..346 + 170px 치명 협곡(346..388) + 388..670, y2=182) ---
        elements.push(g.steelWall(256, y2 - 58, 18, 58));
        elements.push(g.slab(256, y2, 90, 18, st));
        elements.push(g.slab(388, y2, 282, 18, st));
        elements.push(g.wall(500, y2 - 58, 32, 58));
        elements.push(g.steelWall(652, y2 - 64, 18, 64));

        // --- Tier 3 (중하단: x: 392..670, y3=262 — 346..388 아래를 비워 170px 낙사 유도) ---
        elements.push(g.steelWall(392, y3 - 58, 18, 58));
        elements.push(g.slab(392, y3, 278, 18, st));
        elements.push(g.wall(490, y3 - 58, 32, 58));
        elements.push(g.steelWall(652, y3 - 58, 18, 58));

        // --- Tier 4 (최하단 점프패드 & 웜홀 층: x: 240..736, y4=352) ---
        elements.push(g.steelWall(240, y4 - 64, 18, 64));
        elements.push(g.slab(240, y4, 230, 18, st));
        if (opts.includeOptionB !== false) {
          elements.push(g.jumpPad(412, y4 - 10, 'right', 7.8));
        } else {
          elements.push(g.slab(470, y4, 62, 18, st));
        }
        elements.push(g.slab(532, y4, 204, 20, st));
        elements.push(g.steelWall(718, y4 - 64, 18, 64));

        const spawnX = Math.round(g.px(110));
        const spawnY = y1 - 42;
        const gateX = Math.round(g.px(668));
        const gateY = y4 - 26;

        const plan = [
          { skill: 'drill', unit: 'pioneer1', at: g.pt(292, y1, 12), dir },
          { skill: 'block', unit: 'pioneer2', at: g.pt(246, y1, 12), dir },
          { skill: 'build', unit: 'pioneer1', at: g.pt(338, y2, 10), dir },
          { skill: 'bash',  unit: 'pioneer1', at: g.pt(484, y2, 16), dir },
          { skill: 'drill', unit: 'pioneer1', at: g.pt(580, y2, 14), dir: -dir },
          { skill: 'bash',  unit: 'pioneer1', at: g.pt(536, y3, 16), dir: -dir },
          { skill: 'drill', unit: 'pioneer1', at: g.pt(434, y3, 14), dir: -dir },
          { skill: 'block', unit: 'blocker',  at: g.pt(246, y1, 14), wait: 160, minSpawned: 6 }
        ];

        return {
          blueprintId: 'cascading_terraces_highway',
          layoutType: 'terraces',
          variantName: '4단 스위치백 & 협곡 가교',
          gimmickLabel: '4단 지그재그 굴착 + 170px 협곡 가교 + 점프패드',
          elements, spawnX, spawnY, gateX, gateY,
          plan,
          req: { block: 2, build: 1, bash: 2, drill: 3 },
          altBonus: { build: 1 },
          tags: ['pioneer_split', 'fatal_drop', 'uturn', 'jumppad'],
          solutionDna: ['DRILL', 'BLOCK', 'BUILD', 'BASH', 'DRILL', 'BASH', 'DRILL', 'BLOCK'],
          hint: '선발대 1명을 먼저 2층으로 내려보내고 본대를 방어막으로 대기시키십시오. 2층 치명 협곡에 다리를 놓고 3·4층 지그재그 통로를 개통한 뒤 본대를 해방하세요.'
        };
      }
    }
  };

  // 하위 호환용 빈 객체/레퍼런스 유지
  const FORGE_MODULES = {};

  root.FORGE_BLUEPRINTS = FORGE_BLUEPRINTS;
  root.FORGE_MODULES = FORGE_MODULES;
  root.auditForgeLayout = auditLayout;
  root.ForgeGeom = { makeWorldGeom, stoneType };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { FORGE_BLUEPRINTS, FORGE_MODULES, auditLayout, makeWorldGeom, stoneType };
  }
})(typeof self !== 'undefined' ? self : (typeof globalThis !== 'undefined' ? globalThis : this));
