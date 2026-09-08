/* ============================================================================
 * 02_planner.js — Q1 핵심: "스킬 시퀀스(solutionDna) → 지형" 역방향 제약 생성
 *
 *   Intent(dna, score, biome)
 *     → Archetype(골격 선택)                     … Q3 shape-grammar 시작 심볼
 *     → Segment expansion(transition + slab)     … 각 transition이 스킬 1개를 "강제"
 *     → Emission(elements + skill triggers)      … 플레이어 스크립트 = solutionDna 증명
 *     → Rasterize(단계별) + Corridor guarantee   … 최소 통로 20x16 보장
 *     → Probe(그리드 실측)                       … 03_probe.js
 * ==========================================================================*/
(function (root, factory) {
  const C = (typeof require === 'function') ? require('./MapCore.js') : root;
  const api = factory(C);
  if (typeof module === 'object' && module.exports) module.exports = api;
  Object.assign(root, api);
})(typeof self !== 'undefined' ? self : this, function (C) {
  'use strict';
  const { W, H, PHYS, clamp, makeRNG, makeProfile, inAnyRange, EMPTY, DESTRUCTIBLE, STEEL } = C;

  /* =====================================================================
   * (1) 스킬 → 필요 지형 시그니처 매핑 테이블            ★Q1-a 핵심 산출물
   *   signature : 이 스킬이 "의미 있게" 요구되려면 지형이 만족해야 할 조건
   *   transition: PathPlanner의 구간 생성기(문법 규칙) 키
   *   probe     : 래스터라이즈 후 그리드에서 "실측" 검증하는 함수
   *   fix       : probe 실패 코드 → 지역 패치 전략
   * ===================================================================*/
  const SKILL_SPEC = {
    CLIMB: {
      transition: 'WALL_CLIMB', cost: 1,
      signature: { wallH: [PHYS.CLIMB_MIN + 6, PHYS.CLIMB_MAX - 10], destructible: true, topWalkable: 20, noOverhang: true },
      probe: 'probeClimb', fix: { WALL_TOO_SHORT: 'growWall', WALL_TOO_TALL: 'shrinkWall', NO_WALKABLE_TOP: 'alignTopSlab', CLIMB_PATH_OVERHANG: 'shaveOverhang', NO_FLOOR_AT_BASE: 'restoreSlab' }
    },
    FLOAT: {
      transition: 'LETHAL_DROP', cost: 1,
      signature: { drop: [PHYS.LETHAL_FALL + 10, PHYS.LETHAL_FALL + 150], landingW: 30, fallPathClear: true },
      probe: 'probeFloat', fix: { DROP_TOO_SHALLOW: 'deepenDrop', DROP_TOO_DEEP: 'raiseLanding', LANDING_TOO_NARROW: 'widenLanding', FALL_PATH_BLOCKED: 'clearFallPath', NO_FLOOR: 'restoreSlab' }
    },
    BASH: {
      transition: 'WALL_TUNNEL', cost: 1,
      signature: { wallThickness: [10, PHYS.BASH_MAX_WALL], fullCorridorBlock: true, headroom: PHYS.CORRIDOR_H, noSteel: true },
      probe: 'probeBash', fix: { WALL_TOO_THIN: 'thickenWall', WALL_TOO_THICK: 'thinWall', STEEL_IN_TUNNEL: 'replaceSteel', LOW_HEADROOM_BEFORE: 'clearHeadroom', LOW_HEADROOM_AFTER: 'clearHeadroom', NO_FLOOR_AFTER_WALL: 'restoreSlab' }
    },
    MINE: {
      transition: 'LOW_CEILING', cost: 1,
      signature: { ceilingThickness: [8, PHYS.MINE_MAX], ceilingBottom: PHYS.UNIT_H - 1, blocksCorridor: true, noSteel: true },
      probe: 'probeMine', fix: { CEILING_TOO_THIN: 'thickenCeiling', CEILING_TOO_THICK: 'thinCeiling', CEILING_NOT_BLOCKING: 'lowerCeiling', STEEL_CEILING: 'replaceSteel', NO_FLOOR: 'restoreSlab' }
    },
    DRILL: {
      transition: 'FLOOR_HOLE', cost: 1,
      signature: { floorThickness: [8, PHYS.DRILL_MAX], lowerLevelExists: true, lowerDropSafe: PHYS.LETHAL_FALL, noSteel: true },
      probe: 'probeDrill', fix: { FLOOR_TOO_THIN: 'thickenFloor', FLOOR_TOO_THICK: 'thinFloor', STEEL_FLOOR: 'replaceSteel', NO_LOWER_LEVEL: 'restoreSlab', EXIT_DROP_LETHAL: 'raiseLanding', LOWER_LANDING_NARROW: 'widenLanding' }
    },
    BOMB: {
      transition: 'BOMB_CRATER', cost: 1, sacrifice: true,
      // 반경 32px 폭파가 "바닥 두께 + 상부 지형"을 관통해 하부 레벨을 열어야 함
      signature: { floorThickness: [16, PHYS.BOMB_RADIUS - 10], lowerLevelBelow: true, lowerDropSafe: PHYS.LETHAL_FALL, sacrificialUnit: 1 },
      probe: 'probeBomb', fix: { FLOOR_TOO_THIN: 'thickenFloor', CRATER_WONT_BREACH: 'thinFloor', NO_LANDING: 'restoreSlab', BLAST_DROP_LETHAL: 'raiseLanding', BLAST_DROP_TOO_SMALL: 'lowerLanding', LANDING_NARROW: 'widenLanding' }
    },
    BUILD: {
      transition: 'STEP_UP', cost: 1,
      signature: { stepRise: [8, PHYS.BUILD_RISE_PER_STEP * PHYS.BUILD_STEPS - 4], runwayAfter: 100, approachW: 26, destructible: true },
      probe: 'probeBuild', fix: { RISE_TOO_SMALL: 'growStep', RISE_TOO_BIG: 'shrinkStep', RUNWAY_TOO_SHORT: 'extendSlab', STEP_NOT_BLOCKING: 'growStep', NO_FLOOR: 'restoreSlab' }
    },
    BLOCK: {
      transition: 'REDIRECT', cost: 1, sacrifice: true,
      signature: { openRun: 60, flatAnchor: 20, hazardPast: true },
      probe: 'probeBlock', fix: { ANCHOR_NOT_FLAT: 'flattenAnchor', NO_FLOOR: 'restoreSlab' }
    },
    PORTAL: {
      transition: 'PORTAL_LINK', cost: 2,
      signature: { anchorDist: [40, PHYS.PORTAL_RANGE - 12], anchorFlat: 18, otherwiseImpassable: true },
      probe: 'probePortal', fix: { OUT_OF_RANGE: 'moveAnchorB', ANCHOR_NO_FLOOR: 'restoreSlab', ANCHOR_MISALIGNED: 'alignAnchors', ALTERNATE_ROUTE_EXISTS: 'cutAlternate' }
    }
  };
  /* 강철 격벽 + BASH/DRILL 콤보(스킬 2개 동시 소비) — 난이도 기여가 가장 큰 패턴 */
  const COMBO_SPEC = {
    STEEL_BYPASS: { skills: ['BASH', 'DRILL'], transition: 'STEEL_PLUG', probe: 'probeSteelPlug' }
  };

  /* =====================================================================
   * (2) 레이아웃 아키타입 — shape grammar의 시작 심볼      ★Q3
   * ===================================================================*/
  const ARCHETYPES = {
    descent: { segs: [4, 8], yBias: +1, note: '좌→우 하강 캐스케이드(낙하/float 중심)' },
    ascent: { segs: [4, 8], yBias: -1, note: '좌→우 상승(build/climb 중심)' },
    traverse: { segs: [3, 6], yBias: 0, note: '단일 고도 장기 횡단(bash/mine/drill)' },
    split: { segs: [5, 9], yBias: 0, note: '상/하 2단 분리 레벨(drill+build 왕복)' },
    chamber: { segs: [5, 9], yBias: 0, note: '스틸 챔버 + 중앙 아일랜드(bomb/portal)' },
    zigzag: { segs: [5, 9], yBias: 0, note: '짧은 슬랩 왕복 지그재그(정밀도)' }
  };

  /* 구간(transition) 문법 규칙. skills = 이 구간이 "강제"하는 스킬 */
  const TRANSITIONS = {
    WALK: { skills: [], w: 3.0 },
    STEP_UP: { skills: ['BUILD'], w: 1.1 },
    WALL_CLIMB: { skills: ['CLIMB'], w: 1.0 },
    LETHAL_DROP: { skills: ['FLOAT'], w: 1.2 },
    DROP: { skills: [], w: 2.0 },
    GAP_FLOAT: { skills: ['FLOAT'], w: 0.7 },
    WALL_TUNNEL: { skills: ['BASH'], w: 1.2 },
    LOW_CEILING: { skills: ['MINE'], w: 1.0 },
    FLOOR_HOLE: { skills: ['DRILL'], w: 1.1 },
    STEEL_PLUG: { skills: ['BASH', 'DRILL'], w: 1.0 },
    BOMB_CRATER: { skills: ['BOMB'], w: 0.6 },
    PORTAL_LINK: { skills: ['PORTAL'], w: 0.5 }
  };

  const drillX0 = (cur, plugX) => clamp(plugX + 22, cur.x0 + 20, W - 20);

  /* =====================================================================
   * Plan — 레이아웃 계획(=중간 표현). Patcher가 이 객체를 변형한다.
   * ===================================================================*/
  class Plan {
    constructor() {
      this.slabs = [];        // {id,x0,x1,y,th,elType,palette,role,hasFloor,voidBelow}
      this.walls = [];        // {x,y,w,h,kind:'rock'|'steel',role:'tunnel'|'climb'|'steel'|'plug'}
      this.roofs = [];        // {x,y,w,h}
      this.steps = [];        // {x,y,w,h}  — 같은 슬랩 위 단차(BUILD 대상)
      this.plugs = [];        // {x,y,w,h}  — 파괴가능 기둥(BASH/BOMB 대상)
      this.transitions = [];  // {kind,skill(s),fromSlab,toSlab,x,y,params}
      this.triggers = [];     // {skill,x,y,dir,sacrifice?}
      this.portals = null;
      this.deco = [];
      this.occ = [];
      this.spawn = { x: 90, y: 60 };
      this.gate = { x: 700, y: 300 };
    }
    slabAt(x) { for (const s of this.slabs) if (x >= s.x0 && x <= s.x1) return s; return null; }
    claim(s) { this.occ.push({ x0: s.x0, x1: s.x1, y: s.y, th: s.th, id: s.id }); }
    /* x-겹침 허용 조건: 수직 이격이 충분히 크면(=다른 티어) 물리적으로 간섭 없음 */
    conflict(x0, x1, y, th, allowXOverlap = false) {
      for (const o of this.occ) {
        const sep = Math.abs(o.y - y);
        const xOverlap = !(o.x1 < x0 - 1 || o.x0 > x1 + 1);
        if (sep >= 30) continue;                       // 다른 티어 → 간섭 없음
        if (allowXOverlap && xOverlap && sep >= 26) continue;
        if (xOverlap) return o;
      }
      return null;
    }
    unclaim(id) { const i = this.occ.findIndex(o => o.id === id); if (i >= 0) this.occ.splice(i, 1); }
  }

  /* =====================================================================
   * PathPlanner
   * ===================================================================*/
  class PathPlanner {
    plan(seed, intent = {}) {
      const rng = makeRNG(seed);
      const biome = C.BIOMES[intent.biome] || C.BIOMES[rng.pick(C.BIOME_KEYS)];
      const p = new Plan();
      p.seed = seed;
      p.biome = biome;
      p.intent = intent;

      /* --- 아키타입 선택(바이옴 편향 + 직전 스테이지 회피) --- */
      const archKey = (intent.forceArch && ARCHETYPES[intent.forceArch]) ? intent.forceArch : rng.weighted(Object.keys(ARCHETYPES).map(k => {
        let w = biome.archBias[k] || 1;
        if (intent.avoidArch === k) w *= 0.12;
        return { k, w };
      })).k;
      p.archetype = archKey;
      const arch = ARCHETYPES[archKey];

      /* --- DNA: 없으면 난이도 기반으로 롤 --- */
      const dna = (intent.dna && intent.dna.length) ? intent.dna.slice() : this.rollDna(rng, intent);
      const need = {}; for (const s of dna) need[s] = (need[s] || 0) + 1;

      const norm = clamp(intent.norm != null ? intent.norm : (intent.score || 65) / 150, 0, 1);
      const segCount = clamp(Math.round(arch.segs[0] + norm * (arch.segs[1] - arch.segs[0])), 3, 9);

      /* --- 스폰 데크 --- */
      const deckY = clamp(intent.spawnY || rng.irange(64, 104), 56, 130);
      const deckX1 = clamp((intent.spawnX || 90) + rng.irange(34, 70), 90, 200);
      let cur = this.newSlab(p, rng, biome, 20, deckX1, deckY, 'spawn', { minW: 80 });
      p.spawn = { x: clamp(intent.spawnX || 90, cur.x0 + 16, cur.x1 - 30), y: cur.y - 14 };

      let tipX = cur.x1, tipY = cur.y;

      for (let s = 0; s < segCount; s++) {
        const room = (W - 140) - tipX;
        if (room < 76) break;
        const last = (s === segCount - 1) || room < 120;
        // 구간 발행은 "실패 가능" → 실패 시 다른 규칙으로 재시도(문법 백트래킹)
        let res = null;
        for (let tries = 0; tries < 8 && !res; tries++) {
          const t = this.chooseTransition(rng, need, p, tipX, tipY, last, room, norm);
          res = this.emitSegment(p, rng, biome, t, cur, tipX, tipY, room, norm);
        }
        if (!res) break;
        cur = res.cur; tipX = res.tipX; tipY = res.tipY;
        for (const sk of (res.usedSkills || [])) if (need[sk] > 0) need[sk]--;
        if (tipX > W - 150) break;
      }

      /* --- 게이트 슬랩 --- */
      this.emitGate(p, rng, biome, cur, tipX, tipY);

      /* --- BLOCK(위상 방어막)은 경로와 독립적으로 "개방 구간 + 함정"에 배치 --- */
      if (need.BLOCK > 0) this.placeBlocker(p, rng);

      this.normalizeTriggers(p);
      p.dna = this.orderDna(p);
      p.needUnmet = Object.keys(need).filter(k => need[k] > 0);
      p.unplaced = p.slabs.filter(s => !s.placed).length;
      return p;
    }

    /* ---------------- DNA 롤(난이도 스펙 → 스킬 시퀀스) ---------------- */
    rollDna(rng, intent) {
      const pool = (intent.skillPool && intent.skillPool.length) ? intent.skillPool
        : ['CLIMB', 'FLOAT', 'BASH', 'MINE', 'DRILL', 'BOMB', 'BUILD', 'BLOCK', 'PORTAL'];
      const len = clamp(Math.round(intent.dnaLen || 3), 1, Math.min(6, pool.length));
      const w = { BASH: 1.35, BUILD: 1.2, FLOAT: 1.15, DRILL: 1.1, CLIMB: 1.0, MINE: 0.95, BOMB: 0.55, BLOCK: 0.45, PORTAL: 0.3 };
      const out = [], bag = pool.slice();
      for (let i = 0; i < len && bag.length; i++) {
        const pick = rng.weighted(bag.map(s => ({ s, w: (w[s] || 1) * (intent.avoidSkill === s ? 0.2 : 1) }))).s;
        out.push(pick);
        bag.splice(bag.indexOf(pick), 1);
        if (rng.chance(intent.repeatChance || 0.18)) bag.push(pick);   // 콤보 반복 허용
      }
      return out;
    }

    /* ---------------- transition 선택(제약 만족 + 공간 + 난이도) ---------------- */
    chooseTransition(rng, need, p, tipX, tipY, last, room, norm) {
      const neededNow = Object.keys(need).filter(k => need[k] > 0);
      const cands = [];
      for (const [kind, def] of Object.entries(TRANSITIONS)) {
        let w = def.w;
        const hit = def.skills.filter(s => need[s] > 0).length;
        if (hit > 0) w *= 6 + hit * 5;                       // DNA 요구 스킬 강력 우대
        if (neededNow.length && hit === 0) w *= 0.32;        // 남은 요구가 있는데 무관한 구간이면 감점
        if (room < 150 && ['PORTAL_LINK', 'LETHAL_DROP', 'STEEL_PLUG', 'BOMB_CRATER'].includes(kind)) w *= 0.04;
        if (tipY < 150 && ['STEP_UP', 'WALL_CLIMB'].includes(kind)) w *= 0.12;   // 위로 올릴 공간 부족
        if (tipY > H - 150 && ['LETHAL_DROP', 'FLOOR_HOLE', 'DROP', 'BOMB_CRATER'].includes(kind)) w *= 0.1;
        if (norm < 0.25 && ['PORTAL_LINK', 'STEEL_PLUG', 'BOMB_CRATER'].includes(kind)) w *= 0.1;
        if (last) w *= ['WALK', 'DROP', 'STEP_UP'].includes(kind) ? 4 : 0.25;
        if (w > 1e-4) cands.push({ kind, w });
      }
      const kind = rng.weighted(cands).kind;
      return { kind, skills: TRANSITIONS[kind].skills.slice() };
    }

    /* ---------------- 슬랩 생성 + 배치 협상 ---------------- */
    newSlab(p, rng, biome, x0, x1, y, role = 'mid', opts = {}) {
      const th = opts.th != null ? opts.th : rng.irange(14, 24);
      const w = Math.max(opts.minW || 50, Math.round(x1 - x0));
      const wantX = clamp(Math.round(x0), 10, W - w - 10);
      const wantY = clamp(Math.round(y), 64, H - 44);
      let px = wantX, py = wantY, placed = false;
      for (const dy of [0, 26, -26, 52, -52, 78]) {
        const cy = clamp(wantY + dy, 64, H - 44);
        for (let slide = 0; slide <= 3; slide++) {
          const cx = clamp(wantX + slide * 12, 10, W - w - 10);
          if (!p.conflict(cx, cx + w, cy, th, opts.allowXOverlap)) { px = cx; py = cy; placed = true; break; }
        }
        if (placed) break;
      }
      const slab = {
        id: p.slabs.length, x0: px, x1: px + w, y: py, th, role, placed,
        elType: opts.elType || rng.weighted(biome.slabTypes.map(([k, w2]) => ({ k, w: w2 }))).k,
        palette: opts.palette || rng.weighted(biome.palettes.map(([k, w2]) => ({ k, w: w2 }))).k,
        hasFloor: (role === 'gate' || role === 'spawn') ? true : (rng() > biome.hazardFloor)
      };
      p.slabs.push(slab);
      if (placed) p.claim(slab);
      return slab;
    }
    endSlab(p, s, x1) {
      const min = s.role === 'spawn' ? Math.max(s.x0 + 60, p.spawn.x + 30) : s.x0 + 44;
      s.x1 = clamp(Math.round(x1), min, W - 10);
      p.unclaim(s.id); p.claim(s);
      return s.x1;
    }
    extendSlab(p, s, x1) {
      s.x1 = clamp(Math.round(x1), s.x0 + 44, W - 10);
      p.unclaim(s.id); p.claim(s);
      return s.x1;
    }

    /* ---------------- 구간 발행(문법 규칙 실행) ---------------- */
    emitSegment(p, rng, biome, t, cur, tipX, tipY, room, norm) {
      const dir = 1;
      const kind = t.kind;
      const trig = (skill, x, y, extra) => p.triggers.push(Object.assign({ skill, x: Math.round(x), y: Math.round(y), dir }, extra || {}));
      const trans = (o) => { p.transitions.push(Object.assign({ kind, dir }, o)); };
      const spanW = clamp(room, 76, 190);

      switch (kind) {
        /* --- 단순 이동: 현재 슬랩 연장(지형 다양성만 추가) --- */
        case 'WALK': {
          const add = rng.irange(60, Math.max(70, spanW));
          this.extendSlab(p, cur, cur.x1 + add);
          trans({ skill: null, fromSlab: cur.id, toSlab: cur.id, x: cur.x1, y: cur.y, params: {} });
          return { cur, tipX: cur.x1, tipY: cur.y };
        }
        /* --- 안전 낙하(스킬 불필요) --- */
        case 'DROP': {
          const ledge = this.endSlab(p, cur, cur.x1);
          const drop = rng.irange(30, 82);
          const s = this.newSlab(p, rng, biome, ledge - 8, ledge + rng.irange(80, spanW), cur.y + drop, 'mid', { minW: 76, allowXOverlap: true });
          s.hasFloor = true;
          this.catchUnder(p, s, ledge);                       // 낙하선이 착지면 위에 있도록 보장
          trans({ skill: null, fromSlab: cur.id, toSlab: s.id, x: ledge, y: s.y, params: { drop: s.y - cur.y, takeoffX: ledge - 2 } });
          return { cur: s, tipX: s.x1, tipY: s.y };
        }
        /* --- 치사 낙하 → FLOAT 강제 --- */
        case 'LETHAL_DROP': {
          const target = clamp(cur.y + rng.irange(PHYS.LETHAL_FALL + 14, PHYS.LETHAL_FALL + 80), 150, H - 50);
          if (target - cur.y < PHYS.LETHAL_FALL + 8) return null;         // 공간 부족 → 다른 구간 재선택
          this.endSlab(p, cur, cur.x1);
          const ledge = cur.x1;
          const s = this.newSlab(p, rng, biome, ledge - 10, ledge + rng.irange(96, spanW), target, 'mid', { minW: 82, allowXOverlap: true });
          s.hasFloor = true;
          this.catchUnder(p, s, ledge);            // ★ 착지면이 낙하선을 "반드시" 덮어야 함
          const drop = s.y - cur.y;
          if (drop < PHYS.LETHAL_FALL + 8) return null;
          trans({ skill: 'FLOAT', fromSlab: cur.id, toSlab: s.id, x: ledge, y: cur.y, params: { drop, takeoffX: ledge - 2 } });
          trig('FLOAT', ledge - 6, cur.y);
          return { cur: s, tipX: s.x1, tipY: s.y };
        }
        /* --- 수평 갭 + 하강 착지 → FLOAT(원거리 점프) --- */
        case 'GAP_FLOAT': {
          this.endSlab(p, cur, cur.x1);
          const s = this.newSlab(p, rng, biome, cur.x1 + rng.irange(74, 116), cur.x1 + rng.irange(150, 210), cur.y + rng.irange(24, 64), 'mid', { minW: 76 });
          trans({ skill: 'FLOAT', fromSlab: cur.id, toSlab: s.id, x: cur.x1, y: cur.y, params: { gap: s.x0 - cur.x1, drop: s.y - cur.y } });
          trig('FLOAT', cur.x1 - 6, cur.y);
          return { cur: s, tipX: s.x1, tipY: s.y };
        }
        /* --- 단차(BUILD 계단으로 극복) — 같은 슬랩 위 step --- */
        case 'STEP_UP': {
          const rise = rng.irange(10, 20);
          if (cur.y - rise < 84) return null;
          const stepW = rng.irange(12, 20);
          const stepX = clamp(cur.x1 - rng.irange(96, 130), cur.x0 + 40, W - 140);
          if (!this.structFree(p, stepX - 24, stepX + stepW + 24)) return null;
          if (cur.x1 - (stepX + stepW) < 96) this.extendSlab(p, cur, stepX + stepW + rng.irange(100, 140));
          p.steps.push({ x: stepX, y: cur.y - rise, w: stepW, h: rise + 3, slabId: cur.id });
          trans({ skill: 'BUILD', fromSlab: cur.id, toSlab: cur.id, x: stepX, y: cur.y, params: { rise, stepX, stepW, runway: cur.x1 - (stepX + stepW) } });
          trig('BUILD', stepX - 20, cur.y);
          return { cur, tipX: cur.x1, tipY: cur.y };
        }
        /* --- 수직 벽(꼭대기가 다음 슬랩) → CLIMB --- */
        case 'WALL_CLIMB': {
          const wallH = rng.irange(28, Math.min(62, PHYS.CLIMB_MAX - 16));
          const wallT = rng.irange(12, 20);
          if (cur.y - wallH < 84) return null;
          this.endSlab(p, cur, cur.x1);
          const wallX = cur.x1 + rng.irange(0, 4);
          const s = this.newSlab(p, rng, biome, wallX, wallX + rng.irange(86, spanW), cur.y - wallH, 'mid', { minW: 82, allowXOverlap: true });
          s.hasFloor = true;
          const realH = cur.y - s.y;
          if (realH < PHYS.CLIMB_MIN + 4) return null;
          p.walls.push({ x: wallX, y: s.y, w: wallT, h: realH + 3, kind: 'rock', role: 'climb', slabId: s.id });
          trans({ skill: 'CLIMB', fromSlab: cur.id, toSlab: s.id, x: wallX, y: cur.y, params: { wallX, wallT, wallH: realH, topY: s.y } });
          trig('CLIMB', wallX - 7, cur.y);
          return { cur: s, tipX: s.x1, tipY: s.y };
        }
        /* --- 수평 터널(파괴가능 벽) → BASH --- */
        case 'WALL_TUNNEL': {
          const wallT = rng.irange(16, 40);
          const wallH = rng.irange(24, 44);
          const add = wallT + rng.irange(76, spanW);
          this.extendSlab(p, cur, cur.x1 + add);
          const wallX = cur.x1 - add + rng.irange(2, 8);
          if (!this.structFree(p, wallX - 24, wallX + wallT + 24)) { this.endSlab(p, cur, cur.x1); return null; }
          p.walls.push({ x: wallX, y: cur.y - wallH, w: wallT, h: wallH + 1, kind: 'rock', role: 'tunnel', slabId: cur.id });
          p.roofs.push({ x: wallX - 2, y: cur.y - wallH - rng.irange(8, 14), w: wallT + rng.irange(8, 20), h: rng.irange(8, 14), slabId: cur.id });
          trans({ skill: 'BASH', fromSlab: cur.id, toSlab: cur.id, x: wallX + wallT, y: cur.y, params: { wallX, wallT, wallH, tunnelTop: cur.y - wallH } });
          trig('BASH', wallX - 8, cur.y);
          return { cur, tipX: cur.x1, tipY: cur.y };
        }
        /* --- 낮은 천장 → MINE(대각선 굴착) --- */
        case 'LOW_CEILING': {
          const ceilT = rng.irange(10, 28);
          const ceilW = rng.irange(34, 70);
          const add = ceilW + rng.irange(70, spanW);
          this.extendSlab(p, cur, cur.x1 + add);
          const ceilX = cur.x1 - add + rng.irange(14, 30);
          if (!this.structFree(p, ceilX - 24, ceilX + ceilW + 24)) { this.endSlab(p, cur, cur.x1); return null; }
          const ceilBottom = cur.y - PHYS.UNIT_H + 1;       // 유닛 박스 행[y-12, y-1]과 반드시 겹쳐야 함
          p.roofs.push({ x: ceilX, y: ceilBottom - ceilT, w: ceilW, h: ceilT, role: 'ceiling', slabId: cur.id });
          trans({ skill: 'MINE', fromSlab: cur.id, toSlab: cur.id, x: ceilX + ceilW, y: cur.y, params: { ceilX, ceilW, ceilT, ceilBottom } });
          trig('MINE', ceilX - 9, cur.y);
          return { cur, tipX: cur.x1, tipY: cur.y };
        }
        /* --- 바닥 천공 → DRILL(하부 레벨로 하강) --- */
        case 'FLOOR_HOLE': {
          const add = rng.irange(90, spanW);
          this.extendSlab(p, cur, cur.x1 + add);
          cur.th = clamp(rng.irange(18, 26), 14, PHYS.DRILL_MAX - 8);
          const holeX = clamp(cur.x1 - rng.irange(24, 46), cur.x0 + 40, W - 60);
          const lowY = clamp(cur.y + cur.th + rng.irange(40, 76), 140, H - 46);
          const s = this.newSlab(p, rng, biome, holeX - rng.irange(16, 40), holeX + rng.irange(66, 120), lowY, 'mid', { minW: 80, allowXOverlap: true });
          s.hasFloor = true;
          this.catchUnder(p, s, holeX, 26);        // 샤프트 출구 아래 착지 보장
          cur.voidBelow = { x: holeX + 4, w: 18, y0: cur.y + cur.th, y1: s.y - 3 };
          trans({ skill: 'DRILL', fromSlab: cur.id, toSlab: s.id, x: holeX, y: cur.y, params: { holeX, floorT: cur.th, lowY: s.y } });
          trig('DRILL', holeX, cur.y);
          return { cur: s, tipX: s.x1, tipY: s.y };
        }
        /* --- 강철 격벽 + 파괴가능 플러그 → BASH+DRILL 콤보 --- */
        case 'STEEL_PLUG': {
          const add = rng.irange(110, 160);
          this.extendSlab(p, cur, cur.x1 + add);
          cur.th = clamp(cur.th, 16, PHYS.DRILL_MAX - 8);
          const plugW = rng.irange(14, 22);
          const plugX = clamp(cur.x1 - rng.irange(30, 46), cur.x0 + 46, W - 70);
          const steelX = plugX + plugW + rng.irange(2, 6);
          const steelTop = clamp(cur.y - rng.irange(40, 68), 34, cur.y - PHYS.CORRIDOR_H - 4);
          // ★ 벽은 보행면(cur.y)까지만 — 아래로는 뻗지 않아 드릴 강하 후 하부 슬랩에서 우측 진행 가능
          p.walls.push({ x: steelX, y: steelTop, w: rng.irange(14, 22), h: cur.y - steelTop + 1, kind: 'steel', role: 'steel', slabId: cur.id });
          const plugTop = clamp(cur.y - rng.irange(24, 40), 34, cur.y - 16);
          p.plugs.push({ x: plugX, y: plugTop, w: plugW, h: cur.y - plugTop + 3, slabId: cur.id });
          const lowY = clamp(cur.y + cur.th + rng.irange(38, 70), 150, H - 46);
          const s = this.newSlab(p, rng, biome, plugX - rng.irange(26, 48), plugX + rng.irange(64, 116), lowY, 'mid', { minW: 82, allowXOverlap: true });
          s.hasFloor = true;
          const drillX = clamp(plugX + plugW + 8, cur.x0 + 60, Math.min(steelX - 8, cur.x1 - 8));
          this.catchUnder(p, s, drillX, 26);
          cur.voidBelow = { x: drillX - 6, w: 22, y0: cur.y + cur.th, y1: s.y - 3 };
          trans({ skills: ['BASH', 'DRILL'], skill: 'BASH', fromSlab: cur.id, toSlab: s.id, x: plugX, y: cur.y, params: { plugX, plugW, steelX, drillX, floorT: cur.th, lowY: s.y } });
          trig('BASH', plugX - 8, cur.y);
          trig('DRILL', drillX, cur.y);
          return { cur: s, tipX: s.x1, tipY: s.y, usedSkills: ['BASH', 'DRILL'] };
        }
        /* --- 희생 폭파 → 크레이터로 하부 레벨 개방(BOMB) --- */
        case 'BOMB_CRATER': {
          const add = rng.irange(110, 160);
          this.extendSlab(p, cur, cur.x1 + add);
          cur.th = clamp(rng.irange(18, 22), 16, PHYS.BOMB_RADIUS - 12);
          const bombX = clamp(cur.x1 - rng.irange(28, 46), cur.x0 + 44, W - 60);
          const lowY = clamp(cur.y + cur.th + rng.irange(26, 58), 140, H - 46);
          const s = this.newSlab(p, rng, biome, bombX - rng.irange(30, 54), bombX + rng.irange(60, 112), lowY, 'mid', { minW: 84, allowXOverlap: true });
          s.hasFloor = true;
          this.catchUnder(p, s, bombX, 30);        // 크레이터 낙하 착지 보장
          cur.voidBelow = { x: bombX - (PHYS.BOMB_RADIUS - 8), w: (PHYS.BOMB_RADIUS - 8) * 2, y0: cur.y + cur.th, y1: s.y - 3 };
          p.plugs.push({ x: bombX - 7, y: cur.y - rng.irange(8, 16), w: 14, h: rng.irange(8, 16) + 2, slabId: cur.id });
          trans({ skill: 'BOMB', fromSlab: cur.id, toSlab: s.id, x: bombX, y: cur.y, params: { bombX, floorT: cur.th, lowY: s.y, craterR: PHYS.BOMB_RADIUS, sacrifice: true } });
          trig('BOMB', bombX, cur.y, { sacrifice: true });
          return { cur: s, tipX: s.x1, tipY: s.y };
        }
        /* --- 차원 관문(160px 제한) → PORTAL --- */
        case 'PORTAL_LINK': {
          const add = rng.irange(56, 84);
          this.extendSlab(p, cur, cur.x1 + add);
          const A = { x: clamp(cur.x1 - 18, cur.x0 + 14, W - 24), y: cur.y };
          const dist = rng.irange(104, PHYS.PORTAL_RANGE - 30);
          const bY = clamp(cur.y + rng.irange(-64, 64), 110, H - 60);
          const s = this.newSlab(p, rng, biome, A.x + dist - 22, A.x + dist + rng.irange(60, 110), bY, 'mid', { minW: 82, allowXOverlap: true });
          s.hasFloor = true;
          const B = { x: clamp(s.x0 + 18, s.x0 + 8, s.x1 - 14), y: s.y };
          p.portals = { a: A, b: B };
          trans({ skill: 'PORTAL', fromSlab: cur.id, toSlab: s.id, x: A.x, y: A.y, params: { dist: Math.hypot(B.x - A.x, B.y - A.y), ax: A.x, bx: B.x } });
          trig('PORTAL', A.x, A.y, { portalPair: true });
          return { cur: s, tipX: s.x1, tipY: s.y };
        }
        default: return null;
      }
    }

    /* ---------------- 게이트 ---------------- */
    emitGate(p, rng, biome, cur, tipX, tipY) {
      const gw = rng.irange(92, 120);
      const gx0 = clamp(W - 18 - gw, Math.max(16, tipX - 20), W - 110);
      let ok = (gx0 <= tipX + 6);
      let g = this.newSlab(p, rng, biome, gx0, gx0 + gw, clamp(tipY + rng.irange(-4, 4), 100, H - 50), 'gate', { minW: gw, th: 20, allowXOverlap: true });
      if (!ok || Math.abs(g.y - tipY) > PHYS.STEP_UP + 2) {
        // 수평 연결 불가 → 한 티어 아래로 "낙하 연결"
        p.slabs.pop(); p.unclaim(g.id);
        g = this.newSlab(p, rng, biome, clamp(W - 18 - gw, 16, W - 110), clamp(W - 18, 0, 0) + gx0 + gw, clamp(tipY + rng.irange(30, 62), 130, H - 46), 'gate', { minW: gw, th: 20, allowXOverlap: true });
        p.transitions.push({ kind: 'DROP', skill: null, fromSlab: cur.id, toSlab: g.id, x: cur.x1, y: g.y, dir: 1, params: { drop: g.y - cur.y } });
      } else {
        // WALK 연결: 게이트 슬랩 좌변을 이전 슬랩 끝까지 연장 → 간극(나락) 제거
        if (g.x0 > cur.x1) { g.x0 = cur.x1; p.unclaim(g.id); p.claim(g); }
        p.transitions.push({ kind: 'WALK', skill: null, fromSlab: cur.id, toSlab: g.id, x: g.x0, y: g.y, dir: 1, params: {} });
      }
      g.hasFloor = true;
      p.gate = { x: Math.round(clamp(g.x1 - 26, 26, W - 28)), y: g.y - 10 };
      return g;
    }

    /* ---------------- BLOCK(방어막) 배치 ---------------- */
    placeBlocker(p, rng) {
      for (let i = 1; i < p.slabs.length - 1; i++) {
        const s = p.slabs[i];
        if (s.x1 - s.x0 < 90) continue;
        const x = Math.round(s.x0 + (s.x1 - s.x0) * rng.range(0.3, 0.55));
        p.triggers.push({ skill: 'BLOCK', x, y: s.y, dir: 1, sacrifice: true });
        p.transitions.push({ kind: 'REDIRECT', skill: 'BLOCK', fromSlab: s.id, toSlab: s.id, x, y: s.y, dir: 1, params: { anchorX: x } });
        return;
      }
    }

    /* 슬랩 위 구조물(벽/지붕/단차/플러그) 배치 가능 여부 — 기존 구조물과 26px 이격 필수 */
    structFree(p, x0, x1, pad = 26) {
      const all = []
        .concat(p.walls.map(w => [w.x, w.x + w.w]))
        .concat(p.roofs.map(r => [r.x, r.x + r.w]))
        .concat(p.steps.map(t => [t.x, t.x + t.w]))
        .concat(p.plugs.map(q => [q.x, q.x + q.w]));
      for (const r of all) if (!(r[1] + pad < x0 || r[0] - pad > x1)) return false;
      return (x1 - x0) >= 12 && x0 > 12 && x1 < W - 12;
    }

    /* 낙하/샤프트/크레이터 "출구 x"가 착지 슬랩 위에 있도록 강제(치명적 PIT 사망 방지) */
    catchUnder(p, s, x, margin = 14) {
      if (s.x0 > x - margin) s.x0 = clamp(Math.round(x - margin), 8, W - 60);
      if (s.x1 < x + margin) s.x1 = clamp(Math.round(x + margin + 44), s.x0 + 50, W - 8);
      p.unclaim(s.id); p.claim(s);
      return s;
    }

    /* 트리거 정규화:
     *  - 동일 지점 대체 트리거(예: BOMB/DRILL)는 "대체 그룹"으로 유지
     *  - 서로 다른 스킬 트리거는 최소 20px 이격(오발동 = 스킬 낭비/경로 붕괴 방지)  */
    normalizeTriggers(p) {
      const list = p.triggers.slice().sort((a, b) => a.x - b.x);
      const out = [];
      for (const t of list) {
        const prev = out[out.length - 1];
        if (prev && Math.abs(prev.x - t.x) <= 3 && prev.skill !== t.skill) {
          // 같은 지점 대체 솔루션 → 그룹화(시뮬레이션에서는 먼저 성공하는 것만 소비)
          (prev.altGroup || (prev.altGroup = [prev.skill])).push(t.skill);
          t.grouped = true;
          out.push(t);
          continue;
        }
        const conflict = out.filter(o => !o.grouped && o.skill !== t.skill && Math.abs(o.x - t.x) < 20);
        if (conflict.length) {
          const c = conflict[conflict.length - 1];
          t.x = clamp(Math.round(c.x + (t.x >= c.x ? 22 : -22)), 12, W - 12);
        }
        out.push(t);
      }
      p.triggers = out.filter(t => !t.grouped);
      for (const t of p.triggers) if (t.altGroup) t.alts = t.altGroup;
      return p.triggers;
    }

    orderDna(p) {
      const seq = p.triggers.filter(t => t.skill).sort((a, b) => a.x - b.x).map(t => t.skill.toUpperCase());
      const out = [];
      for (const s of seq) if (!out.length || out[out.length - 1] !== s) out.push(s);
      return out;
    }
  }

  /* =====================================================================
   * Emitter — Plan → elements[] (기존 맵 JSON 포맷)
   * ===================================================================*/
  class Emitter {
    constructor(rng, biome) { this.rng = rng; this.biome = biome; this.vrng = null; }
    /* 시각(타입/팔레트/프로파일) 전용 결정적 스트림 — 재빌드 시 동일 결과 보장 */
    vseed(plan) { if (!this.vrng) this.vrng = makeRNG((plan.seed || 1) ^ 0x2f6e2b1); return this.vrng; }
    pick(table) { return this.rng.weighted(table.map(([k, w]) => ({ k, w }))).k; }

    /* Q4: 존 기반 팔레트/타입 혼합 — slab은 주 팔레트, wall/roof/deco는 보조 팔레트 혼합 */
    paletteFor(role, base) {
      const rng = this.rng, b = this.biome;
      const mixP = role === 'slab' ? 0.12 : role === 'wall' ? 0.35 : 0.55;
      return rng.chance(mixP) ? this.pick(b.palettes) : base;
    }

    elements(plan) {
      const els = [], biome = plan.biome;
      const rng = this.vseed(plan);   // ★ 시각 스트림: 재빌드에도 동일한 타입/팔레트/프로파일
      const prof = (type, w, h, cells) => makeProfile(rng, type, w, h, biome.roughness, clamp(cells, 3, 9));

      for (const s of plan.slabs) {
        if (s.removed) continue;
        const deckL = (s.role === 'spawn') ? 0 : s.x0;   // ★ 스폰 덱은 지도 좌변까지(좌측 나락 PIT 방지)
        const w = Math.max(8, s.x1 - deckL), h = s.th;
        const el = { type: s.elType, x: deckL, y: s.y, w, h, palette: this.paletteFor('slab', s.palette), _role: 'slab', _id: s.id };
        if (s.elType !== 'platform' && s.elType !== 'rockWall') {
          el.profile = prof(s.elType, w, h, Math.round(w / 34));
          el.flushTop = true;      // ★ 보행 슬랩은 두께 전체가 차 있어야 함(표면 = plan.y 보장)
        }
        els.push(el); s.el = el;
      }
      for (const wl of plan.walls) {
        if (wl.removed) continue;
        let el;
        if (wl.kind === 'steel') el = { type: 'steelBarrier', x: wl.x, y: wl.y, w: wl.w, h: wl.h, _role: 'wall' };
        else {
          const t = this.pick(biome.wallTypes);
          el = { type: t === 'platform' ? 'rockWall' : t, x: wl.x, y: wl.y, w: wl.w, h: wl.h, palette: this.paletteFor('wall', 'brown'), _role: 'wall' };
          if (el.type !== 'rockWall') el.profile = prof(el.type, wl.w, wl.h, Math.max(2, Math.round(wl.w / 12)));
        }
        els.push(el); wl.el = el;
      }
      for (const r of plan.roofs) {
        if (r.removed) continue;
        const t = this.pick(biome.slabTypes);
        const el = { type: t, x: r.x, y: r.y, w: r.w, h: r.h, palette: this.paletteFor('wall', 'purple'), _role: 'roof', flushTop: false };
        if (t !== 'platform' && t !== 'rockWall') el.profile = prof(t, r.w, r.h, Math.max(2, Math.round(r.w / 18)));
        els.push(el); r.el = el;
      }
      for (const st of plan.steps) {
        if (st.removed) continue;
        const t = this.pick(biome.wallTypes);
        const el = { type: t === 'platform' ? 'rockWall' : t, x: st.x, y: st.y, w: st.w, h: st.h, palette: this.paletteFor('wall', 'brown'), _role: 'step', flushTop: true };
        if (el.type !== 'rockWall') el.profile = prof(el.type, st.w, st.h, 2);
        els.push(el); st.el = el;
      }
      for (const pl of plan.plugs) {
        if (pl.removed) continue;
        const el = { type: 'craggyRock', x: pl.x, y: pl.y, w: pl.w, h: pl.h, palette: this.paletteFor('wall', 'red'), profile: prof('craggyRock', pl.w, pl.h, 3), _role: 'plug', flushTop: true };
        els.push(el); pl.el = el;
      }
      // 데코: "1회 생성 후 plan에 고정" — 재빌드마다 바뀌면 검증이 요동친다(결정성 보장)
      if (!plan._decoMade) {
        plan._decoMade = true;
        plan.deco = [];
        const drng = makeRNG((plan.seed || 1) ^ 0x5bf03635);   // 데코 전용 스트림
        const dpick = (table) => drng.weighted(table.map(([k, w]) => ({ k, w }))).k;
        const dn = drng.irange(biome.deco.count[0], biome.deco.count[1]);
        for (let i = 0; i < dn; i++) {
          const t = dpick(biome.deco.types);
          const w = drng.irange(24, 110), h = drng.irange(14, 58);
          const el = {
            type: t, x: drng.irange(6, W - w - 6), y: drng.irange(56, H - h - 16), w, h,
            palette: drng.weighted(biome.palettes.map(([k, w2]) => ({ k, w: w2 }))).k, deco: true, flushTop: false
          };
          if (t !== 'platform' && t !== 'rockWall') el.profile = makeProfile(drng, t, w, h, biome.roughness * 1.2, clamp(Math.round(w / 22), 3, 8));
          plan.deco.push(el);
        }
        const steelN = drng() < biome.steelRate ? drng.irange(1, 2) : 0;
        for (let i = 0; i < steelN; i++) {
          const w = drng.irange(10, 20), h = drng.irange(30, 88);
          plan.deco.push({ type: 'steelBarrier', x: drng.irange(40, W - w - 40), y: drng.irange(66, H - h - 40), w, h, deco: true });
        }
      }
      for (const d of plan.deco) if (!d.removed) els.push(d);
      return els;
    }
  }

  /* =====================================================================
   * Assembler — elements → Uint8Array 그리드 (+ 통로/대좌 보장)
   *   단계 순서가 핵심: 슬랩 → 평탄화 → 벽/지붕/단차/플러그 → 데코 → 정리
   * ===================================================================*/
  class Assembler {
    /* =====================================================================
     * 단계별 래스터라이즈 (순서가 곧 정확성)
     *  A. 경로 지형(slab/wall/roof/step/plug) → pathMask(멤버십) 기록
     *  B. 보행면 평탄화 + voidBelow(드릴/폭파 공동) + 스폰/게이트 대좌
     *  C. 데코를 "별도 오버레이 그리드"에 굽기
     *  D. 통로(헤드룸) 정리: pathMask에 없는 셀만 제거 → 본 지형은 절대 손상 안 됨
     *  E. 오버레이를 본 그리드에 합성(통로 침범분은 이미 제거됨)
     * ===================================================================*/
    static build(plan, elements) {
      const grid = new C.Grid(W, H);
      const mask = new Uint8Array(W * H);        // 경로 지형 멤버십
      const raz = new C.Rasterizer(grid);

      const pathEls = elements.filter(e => !e.deco);
      const decoEls = elements.filter(e => e.deco);
      const activeSlabs = plan.slabs.filter(s => !s.removed);

      /* --- A. 경로 지형 --- */
      raz.rasterizeAll(pathEls);
      for (const el of pathEls) {
        const x0 = clamp(Math.floor(el.x), 0, W - 1), x1 = clamp(Math.ceil(el.x + el.w), 0, W);
        const y0 = clamp(Math.floor(el.y), 0, H - 1), y1 = clamp(Math.ceil(el.y + el.h), 0, H);
        for (let j = y0; j < y1; j++) for (let i = x0; i < x1; i++) mask[j * W + i] = 1;
      }

      /* --- B1. 보행면 평탄화(벽/단차/플러그 열은 제외) --- */
      const protect = new Set();
      for (const s of activeSlabs) { protect.add(s.y); protect.add(s.y + 1); protect.add(s.y + 2); }
      const excl = [];
      for (const wl of plan.walls) if (!wl.removed) excl.push([wl.x - 1, wl.x + wl.w]);
      for (const st of plan.steps) if (!st.removed) excl.push([st.x - 1, st.x + st.w]);
      for (const pl of plan.plugs) if (!pl.removed) excl.push([pl.x - 1, pl.x + pl.w]);
      for (const s of activeSlabs) {
        const localExcl = excl.filter(r => !(r[1] < s.x0 || r[0] > s.x1));
        raz.flattenWalkway(s.x0, s.x1, s.y, PHYS.CORRIDOR_H, 5, protect, localExcl);
      }
      const markSlab = (s) => { for (let j = s.y; j < Math.min(H, s.y + s.th); j++) for (let i = s.x0; i < s.x1; i++) if (i >= 0 && i < W) mask[j * W + i] = 1; };
      for (const s of activeSlabs) markSlab(s);

      /* --- B2. voidBelow(드릴 샤프트/폭파 크레이터용 공동) --- */
      for (const s of activeSlabs) {
        if (!s.voidBelow) continue;
        const v = s.voidBelow;
        grid.carveRectProtected(v.x, v.y0, v.w, Math.max(2, v.y1 - v.y0), protect);
        for (let j = Math.floor(v.y0); j < Math.ceil(v.y1); j++) for (let i = Math.floor(v.x); i < Math.ceil(v.x + v.w); i++) if (i >= 0 && i < W && j >= 0 && j < H) mask[j * W + i] = 0;
      }

      /* --- B3. 스폰/게이트 대좌 보장 --- */
      const pedestal = (px, py, slab, maxDrop) => {
        const gy = grid.firstSolidBelow(Math.round(px), Math.round(py) - 2, H);
        if (gy < 0 || gy - py > maxDrop || Math.abs(gy - slab.y) > 24) {
          slab.y = clamp(slab.y, 60, H - 30);
          grid.fillRect(slab.x0, slab.y, Math.max(60, slab.x1 - slab.x0), Math.max(14, slab.th), DESTRUCTIBLE);
          protect.add(slab.y); protect.add(slab.y + 1); protect.add(slab.y + 2);
          raz.flattenWalkway(slab.x0, slab.x1, slab.y, PHYS.CORRIDOR_H, 5, protect, excl);
          markSlab(slab);
          return slab.y;
        }
        return gy;
      };
      const deck = plan.slabs[0];
      const deckY = pedestal(plan.spawn.x, plan.spawn.y, deck, PHYS.LETHAL_FALL - 24);
      plan.spawn = { x: clamp(plan.spawn.x, deck.x0 + 14, deck.x1 - 22), y: deckY - 14 };
      const gslab = plan.slabs[plan.slabs.length - 1];
      const gateY = pedestal(plan.gate.x, plan.gate.y + 10, gslab, 30);
      plan.gate = { x: clamp(Math.round(gslab.x1 - 26), gslab.x0 + 14, W - 26), y: gateY - 10 };
      grid.carveRectProtected(plan.spawn.x - 13, plan.spawn.y - 8, 26, 38, protect);
      grid.carveRectProtected(plan.gate.x - 15, plan.gate.y - 22, 30, 22, protect);

      /* --- C. 데코를 오버레이에 굽기 --- */
      const decoGrid = new C.Grid(W, H);
      new C.Rasterizer(decoGrid).rasterizeAll(decoEls);

      /* --- D. 통로(헤드룸) 마스크: pathMask가 아닌 셀만 제거 --- */
      const corridor = new Uint8Array(W * H);
      for (const s of activeSlabs) {
        const x0 = clamp(s.x0 - 3, 0, W - 1), x1 = clamp(s.x1 + 3, 0, W);
        const y0 = clamp(s.y - PHYS.CORRIDOR_H, 0, H - 1), y1 = clamp(s.y - 1, 0, H);
        for (let j = y0; j <= y1; j++) { if (protect.has(j)) continue; for (let i = x0; i < x1; i++) corridor[j * W + i] = 1; }
      }
      const unmark = (x, y, w, h) => {
        const x0 = clamp(Math.floor(x), 0, W - 1), x1 = clamp(Math.ceil(x + w), 0, W);
        const y0 = clamp(Math.floor(y), 0, H - 1), y1 = clamp(Math.ceil(y + h), 0, H);
        for (let j = y0; j < y1; j++) for (let i = x0; i < x1; i++) corridor[j * W + i] = 0;
      };
      // 낙하 샤프트(낙하형 transition의 출구 x ±8)는 데코 침입 금지 구역
      for (const tr of plan.transitions) {
        if (!['LETHAL_DROP', 'DROP', 'FLOOR_HOLE', 'STEEL_PLUG', 'BOMB_CRATER', 'GAP_FLOAT'].includes(tr.kind)) continue;
        const pr2 = tr.params || {};
        const exitX = pr2.takeoffX != null ? pr2.takeoffX + 3 : pr2.holeX != null ? pr2.holeX
          : pr2.drillX != null ? pr2.drillX : pr2.bombX != null ? pr2.bombX
          : pr2.plugX != null ? pr2.plugX + (pr2.plugW || 16) + 4 : tr.x;
        const land = plan.slabs[tr.toSlab], from = plan.slabs[tr.fromSlab];
        if (!land) continue;
        const y0 = Math.max(0, (from ? from.y : land.y - 120) - 18);
        const y1 = Math.min(H - 1, land.y + 2);
        for (let j = Math.floor(y0); j <= Math.floor(y1); j++)
          for (let i = clamp(Math.floor(exitX) - 9, 0, W - 1); i <= clamp(Math.ceil(exitX) + 9, 0, W - 1); i++) corridor[j * W + i] = 1;
      }
      // 스폰 낙하 구간도 보호
      {
        const deck = plan.slabs[0];
        for (let j = clamp(deck.y - 40, 0, H - 1); j <= clamp(deck.y - 1, 0, H - 1); j++)
          for (let i = clamp(plan.spawn.x - 10, 0, W - 1); i <= clamp(plan.spawn.x + 10, 0, W - 1); i++) corridor[j * W + i] = 1;
      }
      for (const wl of plan.walls) if (!wl.removed) unmark(wl.x - 3, wl.y - 3, wl.w + 6, wl.h + 6);
      for (const r of plan.roofs) if (!r.removed) unmark(r.x - 3, r.y - 3, r.w + 6, r.h + 6);
      for (const st of plan.steps) if (!st.removed) unmark(st.x - 3, st.y - 3, st.w + 6, st.h + 6);
      for (const pl of plan.plugs) if (!pl.removed) unmark(pl.x - 3, pl.y - 3, pl.w + 6, pl.h + 6);
      if (plan.cutRegion) { const r = plan.cutRegion; unmark(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0); }

      let removed = 0;
      for (let i = 0; i < corridor.length; i++) {
        if (!corridor[i]) continue;
        if (mask[i]) continue;                                  // ★ 경로 지형은 절대 제거하지 않음
        if (decoGrid.cells[i] !== EMPTY) { decoGrid.cells[i] = EMPTY; removed++; }
        if (grid.cells[i] === DESTRUCTIBLE) grid.cells[i] = EMPTY;   // (이전 패치 잔여물 정리)
      }

      /* --- E. 오버레이 합성 --- */
      for (let i = 0; i < grid.cells.length; i++) {
        if (grid.cells[i] === EMPTY && decoGrid.cells[i] !== EMPTY) grid.cells[i] = decoGrid.cells[i];
      }

      /* --- E2. 낙하 포착 보장: 모든 낙하/샤프트/크레이터 출구 아래에 착지면이 있어야 함 --- */
      for (const tr of plan.transitions) {
        if (!['LETHAL_DROP', 'DROP', 'FLOOR_HOLE', 'STEEL_PLUG', 'BOMB_CRATER', 'GAP_FLOAT'].includes(tr.kind)) continue;
        const land = plan.slabs[tr.toSlab];
        if (!land) continue;
        let exitX = null;
        if (tr.params) exitX = tr.params.takeoffX != null ? tr.params.takeoffX + 3
          : tr.params.holeX != null ? tr.params.holeX
          : tr.params.drillX != null ? tr.params.drillX
          : tr.params.bombX != null ? tr.params.bombX
          : tr.params.plugX != null ? tr.params.plugX + (tr.params.plugW || 16) + 4
          : tr.x;
        if (exitX == null) continue;
        exitX = clamp(Math.round(exitX), 6, W - 6);
        if (exitX < land.x0 || exitX > land.x1) {
          const nx0 = Math.min(land.x0, exitX - 12), nx1 = Math.max(land.x1, exitX + 12);
          grid.fillRect(nx0, land.y, nx1 - nx0, land.th, DESTRUCTIBLE);
          land.x0 = clamp(nx0, 6, W - 40); land.x1 = clamp(nx1, land.x0 + 40, W - 6);
          raz.flattenWalkway(land.x0, land.x1, land.y, PHYS.CORRIDOR_H, 5, protect, excl);
          markSlab(land);
        }
        // 낙하 경로(출구 → 착지면)에 데코/지형이 있으면 제거
        const from = plan.slabs[tr.fromSlab];
        const y0 = (from ? from.y : land.y - 100) + 4;
        for (let j = y0; j < land.y - 2; j++) {
          for (let i = exitX - 6; i <= exitX + 6; i++) {
            if (i < 0 || i >= W || j < 0 || j >= H) continue;
            const k = j * W + i;
            if (grid.cells[k] === DESTRUCTIBLE && !mask[k]) grid.cells[k] = EMPTY;
          }
        }
      }

      /* --- F. 터널 진출입구 헤드룸(벽 앞뒤로 유닛이 설 공간) --- */
      for (const tr of plan.transitions) {
        if (tr.kind !== 'WALL_TUNNEL' || !tr.params) continue;
        const s = plan.slabs[tr.toSlab] || plan.slabs[tr.fromSlab];
        if (!s) continue;
        const { wallX, wallT } = tr.params;
        grid.carveRectProtected(wallX - 11, s.y - PHYS.CORRIDOR_H + 1, 10, PHYS.CORRIDOR_H - 3, protect);
        grid.carveRectProtected(wallX + wallT + 1, s.y - PHYS.CORRIDOR_H + 1, 10, PHYS.CORRIDOR_H - 3, protect);
      }
      if (plan.cutRegion) {
        const r = plan.cutRegion;
        grid.carveRectProtected(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0, protect);
      }

      Assembler.syncPlan(plan);
      return { grid, corridor, protect, mask, removedDeco: removed };
    }

    /* 빌드 후 plan 동기화: trigger/transition y를 "실제 보행면"에 맞춤 */
    static syncPlan(plan) {
      for (const t of plan.transitions) {
        const s = plan.slabs[t.fromSlab != null ? t.fromSlab : t.toSlab];
        if (s) t.y = s.y;
      }
      for (const tr of plan.triggers) {
        const s = plan.slabAt(tr.x);
        if (s && Math.abs(s.y - tr.y) > 1) tr.y = s.y;
      }
      const deck = plan.slabs[0];
      plan.spawn = { x: clamp(plan.spawn.x, deck.x0 + 14, deck.x1 - 22), y: deck.y - 14 };
      const gs = plan.slabs[plan.slabs.length - 1];
      plan.gate = { x: clamp(plan.gate.x, gs.x0 + 14, gs.x1 - 16), y: gs.y - 10 };
    }
  }

  return { SKILL_SPEC, COMBO_SPEC, ARCHETYPES, TRANSITIONS, Plan, PathPlanner, Emitter, Assembler };
});
