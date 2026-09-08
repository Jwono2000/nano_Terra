/* ============================================================================
 * 04_engine.js — 오케스트레이터(생성→검증→보정 루프) + 난이도 스코어러
 *                + 메타 생성기(연속 스테이지 배치)     ★Q2, Q5, Q6
 * ==========================================================================*/
(function (root, factory) {
  const C = (typeof require === 'function') ? require('./00_core.js') : root;
  const WK = (typeof require === 'function') ? require('./01_walker.js') : root;
  const PL = (typeof require === 'function') ? require('./02_planner.js') : root;
  const PR = (typeof require === 'function') ? require('./03_probe.js') : root;
  const api = factory(C, WK, PL, PR);
  if (typeof module === 'object' && module.exports) module.exports = api;
  Object.assign(root, api);
})(typeof self !== 'undefined' ? self : this, function (C, WK, PL, PR) {
  'use strict';
  const { W, H, PHYS, clamp, makeRNG } = C;

  /* =====================================================================
   * Q2. 난이도 스코어러 — 0~150 연속 스케일
   * ===================================================================*/
  const WEIGHTS = {
    skillDemand: 26,   // 필수 스킬 종류 수 & 총 사용 횟수
    comboDepth: 22,    // 단일 장애물 극복에 필요한 연속 스킬 체인
    hazard: 20,        // 치사 낙하/나락/폭탄 등 즉사 요소
    steel: 12,         // 강철 격벽(우회 강제)
    precision: 12,     // 타이밍/정밀도(좁은 통로, 짧은 슬랩, 좁은 착지)
    timePressure: 8,   // 제한시간 대비 경로 길이
    scarcity: 8,       // 스킬 여유분 부족도
    trap: 12           // 함정 경로(가짜 진출로) 수
  };
  const SUBLINEAR = { skillDemand: 0.72, comboDepth: 0.80, hazard: 0.75, steel: 0.7, precision: 0.8, trap: 0.8 };

  class DifficultyScorer {
    /* factor 계산은 "계획(plan) + 그리드 실측" 양쪽에서 이뤄진다. */
    static factors(plan, grid, meta = {}) {
      const prober = new PR.Prober(grid);
      const f = {};

      // --- skillDemand ---
      const uses = plan.triggers.filter(t => t.skill).length;
      const kinds = new Set(plan.dna).size;
      f.skillDemand = clamp(Math.pow(uses, SUBLINEAR.skillDemand) * 2.2 + kinds * 3.2, 0, 100);

      // --- comboDepth: 인접 트리거 간격이 짧아 "연속 투입"이 필요한 체인 ---
      const trig = plan.triggers.filter(t => t.skill).sort((a, b) => a.x - b.x);
      let chain = 1, best = 1;
      for (let i = 1; i < trig.length; i++) {
        const d = Math.abs(trig[i].x - trig[i - 1].x);
        if (d < 90 && trig[i].skill !== trig[i - 1].skill) { chain++; best = Math.max(best, chain); }
        else chain = 1;
      }
      const needsTwo = plan.transitions.filter(t => t.kind === 'STEEL_PLUG').length * 2;
      f.comboDepth = clamp(Math.pow(Math.max(best, needsTwo), SUBLINEAR.comboDepth) * 22, 0, 100);

      // --- hazard: 치사낙하 구간 + 바닥없는(나락) 구간 + 폭파 필수 ---
      let lethal = 0, pits = 0;
      for (const s of plan.slabs) if (!s.hasFloor) pits++;
      for (const t of plan.transitions) {
        if (t.kind === 'LETHAL_DROP') lethal++;
        if (t.kind === 'STEEL_PLUG' || t.kind === 'PORTAL_LINK') lethal += 0.5;
      }
      // 그리드 실측: 경로 x 샘플에서 "바닥 없음" 컬럼 수
      for (let x = 30; x < W - 30; x += 20) {
        const y = prober.floorAt(x, 0);
        if (y < 0 || y > H - 4) pits += 0.15;
      }
      f.hazard = clamp(Math.pow(lethal * 2 + pits * 0.8, SUBLINEAR.hazard) * 14, 0, 100);

      // --- steel ---
      const steelCells = grid.count(C.STEEL);
      const steelBlocks = plan.walls.filter(w => w.kind === 'steel').length + (meta.steelDeco || 0);
      f.steel = clamp(Math.pow(steelBlocks, SUBLINEAR.steel) * 22 + steelCells / 900, 0, 100);

      // --- precision: 좁은 슬랩/짧은 착지면/낮은 헤드룸 비율 ---
      let narrow = 0, short = 0;
      for (const s of plan.slabs) {
        const w = s.x1 - s.x0;
        if (w < 70) narrow++;
        if (w < 46) short++;
      }
      const avgW = plan.slabs.reduce((a, s) => a + (s.x1 - s.x0), 0) / Math.max(1, plan.slabs.length);
      f.precision = clamp((narrow * 9 + short * 14 + clamp(150 - avgW, 0, 90) * 0.22) * Math.pow(1, SUBLINEAR.precision), 0, 100);

      // --- trap: 잘못된 방향으로 유도되는 분기(데코 슬랩/대체 경로) ---
      const traps = plan.deco.filter(d => d.type !== 'steelBarrier').length * 0.55
        + plan.transitions.filter(t => t.kind === 'REDIRECT').length * 3;
      f.trap = clamp(Math.pow(traps, SUBLINEAR.trap) * 13, 0, 100);

      // --- timePressure / scarcity 는 맵 메타(스킬 예산, 제한시간)에서 ---
      f.timePressure = clamp(meta.timePressure != null ? meta.timePressure : 40, 0, 100);
      f.scarcity = clamp(meta.scarcity != null ? meta.scarcity : 40, 0, 100);

      return f;
    }

    static score(plan, grid, meta = {}) {
      const f = DifficultyScorer.factors(plan, grid, meta);
      let s = 0;
      for (const k of Object.keys(WEIGHTS)) s += WEIGHTS[k] * (f[k] / 100);
      return { total: Math.round(clamp(s, 0, 150) * 10) / 10, factors: f };
    }

    /* --- 점수 밴드 목표 → 피처 예산 역산(생성 전 가이드) --- */
    static budgetFor(targetScore, rng) {
      const n = clamp(targetScore / 150, 0.05, 1);
      return {
        dnaLen: clamp(Math.round(1 + n * 4.2), 1, 6),
        segs: clamp(Math.round(3 + n * 5), 3, 10),
        norm: n,
        skillSlack: clamp(1.9 - n * 1.15, 0.45, 2.0),
        timePerSegment: clamp(34 - n * 17, 11, 34)
      };
    }

    /* --- 생성 후 밴드 안으로 "넛지": plan(중간표현)만 수정 → rebuild로 반영 --- */
    static nudge(plan, target, current, rng) {
      const diff = target - current;
      if (Math.abs(diff) < 5) return null;
      const cands = plan.slabs.filter(s => s.role === 'mid');
      if (!cands.length) return null;
      const s = rng.pick(cands);
      if (diff > 0) {
        const w0 = s.x1 - s.x0;
        s.x1 = clamp(s.x1 - rng.irange(10, 24), s.x0 + 34, W - 10);   // 좁히기 = 정밀도↑
        if (s.x1 - s.x0 >= w0) return null;
        return 'NARROW_SLAB';
      }
      s.x1 = clamp(s.x1 + rng.irange(12, 28), s.x0 + 50, W - 10);      // 넓히기 = 난이도↓
      return 'WIDEN_SLAB';
    }
  }

  /* =====================================================================
   * Q5. 검증기 (Sim 래퍼) — 스크립티드 + 반응형 + 무스킬 3종 트라이얼
   * ===================================================================*/
  class Validator {
    constructor(opts = {}) {
      this.units = opts.units || 5;
      this.maxFrames = opts.maxFrames || 2000;
      this.robustFloor = opts.robustFloor != null ? opts.robustFloor : 0.34;
    }

    /* grid는 복사본 사용(스킬이 지형을 변형) */
    runTrial(grid, plan, map, mode, units, protect) {
      const g = grid.clone();
      const budget = {};
      for (const k of Object.keys(map.skills)) budget[k] = map.skills[k];
      const sim = new WK.Sim(g, {
        gate: plan.gate, gateR: 15, budget,
        triggers: mode === 'scripted' ? plan.triggers.map(t => ({ ...t, used: false })) : [],
        portals: plan.portals || null,
        policy: mode === 'reactive' ? WK.reactivePolicy(28) : null,
        maxAge: this.maxFrames,
        spawnRate: map.spawnRate || 25,
        earlyExit: mode === 'scripted' ? units : 0
      });
      const hasSacrifice = plan.triggers.some(t => t.sacrifice);
      for (let i = 0; i < units; i++) {
        let own = null;
        if (mode === 'scripted') {
          // 희생 스킬(BOMB/BLOCK)은 "전담 유닛"에게만 부여. 나머지는 생존 경로 스크립트만.
          const isSacrificeUnit = hasSacrifice ? (i === 0) : false;
          own = plan.triggers.filter(t => !t.sacrifice || isSacrificeUnit).map(t => ({ ...t, used: false }));
        }
        const w = sim.spawn(plan.spawn.x, plan.spawn.y, 1, i, i * (map.spawnRate || 25), own);
        // scripted = "설계 의도대로 스킬만 사용"(자동 등반 off) → 스크립트가 진짜 해법인지 검증
        // reactive = 룰 기반 AI(자동 등반 on), passive = 아무 조작 없음
        w.autoClimb = mode === 'reactive';
      }
      const report = sim.run(this.maxFrames + units * (map.spawnRate || 25));
      return {
        mode, units, saved: report.saved, rate: report.saved / units,
        deaths: report.deaths, stuck: report.stuck, skillUses: report.skillUses,
        missedTriggers: report.missedTriggers || [],
        traces: sim.walkers.slice(0, 2).map(w => w.trace),
        firstFail: report.deaths[0] || report.stuck[0] || null
      };
    }

    /* 단계적 검증: Tier3a(스크립티드 1유닛, 저비용) → Tier3b(풀 스위트) */
    validate(grid, plan, map, deep = true, protect = null) {
      const out = { trials: [], ok: false, tier: 'a' };
      const probe = this.runTrial(grid, plan, map, 'scripted', 1, protect);
      out.trials.push(probe);
      out.scriptedRate = probe.saved > 0 ? 1 : 0;
      out.probeFail = probe.saved > 0 ? null : (probe.firstFail || { reason: 'NO_SAVE' });
      if (probe.saved === 0) {
        out.ok = false; out.reactiveRate = 0; out.passiveRate = 0; out.robustness = 0;
        out.diag = { missed: probe.missedTriggers, deaths: probe.deaths.slice(0, 4), trace: probe.traces[0] || [] };
        return out;
      }
      if (!deep) { out.ok = true; out.tier = 'a'; out.reactiveRate = 0; out.robustness = 1; return out; }

      const full = this.runTrial(grid, plan, map, 'scripted', this.units, protect);
      const react = this.runTrial(grid, plan, map, 'reactive', this.units, protect);
      const pass = this.runTrial(grid, plan, map, 'passive', 2, protect);
      out.trials.push(full, react, pass);
      out.tier = 'b';
      out.scriptedRate = full.rate;
      out.reactiveRate = react.rate;
      out.passiveRate = pass.rate;
      out.robustness = full.rate > 0 ? clamp(react.rate / full.rate, 0, 1) : 0;
      out.forgiveness = 1 - pass.rate;
      out.ok = (full.rate * 100 >= map.needPercent) && (react.rate >= this.robustFloor * full.rate || react.saved >= 1);
      out.diag = { missed: full.missedTriggers, deaths: full.deaths.slice(0, 6), reactDeaths: react.deaths.slice(0, 6) };
      return out;
    }
  }

  /* =====================================================================
   * Q5-2. 패처 — 검증 실패 지점 → 지역 수정
   * ===================================================================*/
  class Patcher {
    constructor() { this.log = []; }

    /* Tier-2: probe → plan 패치 → grid 재구축 (최대 rounds회) */
    patchProbes(plan, build, rounds = 3) {
      let applied = 0;
      for (let r = 0; r < rounds; r++) {
        const { grid } = build(plan);
        const issues = PR.probeAll(grid, plan);
        if (!issues.length) break;
        const res = PR.patchPlan(plan, issues, 18);
        applied += res.applied;
        for (const l of res.log) this.log.push({ round: r, ...l });
        if (res.applied === 0) break;
      }
      return { applied, log: this.log };
    }

    /* Tier-4: 시뮬레이션 실패 지점(낙사/끼임/타임아웃) → plan 지역 수정 */
    patchFromSim(plan, validation, maxSites = 5) {
      const sites = [];
      for (const t of validation.trials) {
        for (const d of (t.deaths || [])) sites.push({ ...d, mode: t.mode });
        for (const s of (t.stuck || [])) sites.push({ ...s, reason: 'STUCK', mode: t.mode });
      }
      const clusters = [];
      for (const s of sites) {
        const c = clusters.find(k => Math.abs(k.x - s.x) < 28 && Math.abs(k.y - s.y) < 28);
        if (c) { c.n++; c.reasons.add(s.reason); } else clusters.push({ x: s.x, y: s.y, n: 1, reasons: new Set([s.reason]) });
      }
      clusters.sort((a, b) => b.n - a.n);
      let applied = 0;

      for (const cl of clusters.slice(0, maxSites)) {
        const slab = plan.slabAt(cl.x) || nearestSlab(plan, cl.x, cl.y);
        if (cl.reasons.has('FALL') || cl.reasons.has('PIT')) {
          // 낙사 지점에 "안전 턱" 슬랩 추가(설계된 치사낙하 구간은 건드리지 않음)
          const designed = plan.transitions.some(t => (t.kind === 'LETHAL_DROP' || t.kind === 'GAP_FLOAT') && Math.abs(t.x - cl.x) < 40);
          if (designed) continue;
          const y = clamp(cl.y + Math.min(64, PHYS.LETHAL_FALL - 30), 80, H - 40);
          const x0 = clamp(cl.x - 34, 10, W - 90);
          const s = { id: plan.slabs.length, x0, x1: clamp(x0 + 74, x0 + 50, W - 10), y, th: 16, role: 'patch', elType: 'platform', palette: plan.biome.terrainTheme, hasFloor: true, placed: true };
          if (!plan.conflict(s.x0, s.x1, s.y, s.th, true)) {
            plan.slabs.push(s); plan.claim(s);
            plan.transitions.push({ kind: 'DROP', skill: null, toSlab: s.id, fromSlab: slab ? slab.id : null, x: s.x0, y: s.y, dir: 1, params: { synthetic: true } });
            this.log.push({ type: 'sim', code: 'ADD_SAFETY_LEDGE', x: cl.x, y: cl.y });
            applied++;
          }
          continue;
        }
        if (cl.reasons.has('STUCK') || cl.reasons.has('CLIMB_BLOCKED') || cl.reasons.has('CLIMB_TIMEOUT')) {
          // 끼임: 주변 데코 제거 + 천장(장식용) 제거로 헤드룸 확보
          for (const d of plan.deco) if (!d.removed && d.x < cl.x + 16 && d.x + d.w > cl.x - 16 && d.y < cl.y && d.y + d.h > cl.y - PHYS.CORRIDOR_H - 6) d.removed = true;
          for (const r of plan.roofs) if (r.role !== 'ceiling' && r.x < cl.x + 14 && r.x + r.w > cl.x - 14 && r.y + r.h > cl.y - PHYS.CORRIDOR_H) r.removed = true;
          if (slab) slab.x1 = clamp(slab.x1 + 10, slab.x0 + 50, W - 10);
          this.log.push({ type: 'sim', code: 'WIDEN_CORRIDOR', x: cl.x, y: cl.y });
          applied++;
          continue;
        }
        if (cl.reasons.has('TIMEOUT')) {
          if (slab) { slab.x1 = clamp(slab.x1 + 26, slab.x0 + 50, W - 10); }
          this.log.push({ type: 'sim', code: 'SHORTEN_ROUTE', x: cl.x, y: cl.y });
          applied++;
        }
      }
      if (plan.deco.some(d => d.removed) || plan.roofs.some(r => r.removed)) {
        plan.deco = plan.deco.filter(d => !d.removed);
        plan.roofs = plan.roofs.filter(r => !r.removed);
      }
      return applied;
    }
  }
  function nearestSlab(plan, x, y) {
    let best = null, bd = 1e9;
    for (const s of plan.slabs) { const cx = clamp(x, s.x0, s.x1); const d = Math.hypot(cx - x, s.y - y); if (d < bd) { bd = d; best = s; } }
    return best;
  }

  /* =====================================================================
   * MapAssembler — plan → 최종 맵 JSON (기존 포맷 호환)
   * ===================================================================*/
  class MapAssembler {
    static assemble(plan, elements, scoreResult, opts = {}) {
      const rng = opts.rng || makeRNG(1);
      const biome = plan.biome;
      const totalUnits = opts.totalUnits != null ? opts.totalUnits : clamp(Math.round(10 + scoreResult.total * 0.09), 8, 22);
      const needPercent = opts.needPercent != null ? opts.needPercent : clamp(50 + Math.round(scoreResult.total * 0.22), 50, 90);
      // 스킬 예산: 계획 사용량 + 여유분(난이도 ↓ → 여유 ↑)
      const planned = {};
      for (const t of plan.triggers) if (t.skill) planned[t.skill.toLowerCase()] = (planned[t.skill.toLowerCase()] || 0) + 1;
      const slack = clamp(1.95 - (scoreResult.total / 150) * 1.35, 0.4, 2.0);
      const skills = {};
      for (const k of ['climb', 'float', 'bash', 'mine', 'drill', 'bomb', 'build', 'block', 'portal']) {
        const base = planned[k] || 0;
        skills[k] = clamp(Math.round(base * slack + (base ? 1 : 0) + (k === 'build' ? 1 : 0)), base, k === 'bomb' ? 4 : 8);
        if (opts.skillPool && !opts.skillPool.includes(k.toUpperCase()) && base === 0) skills[k] = 0;
      }
      const pathLen = plan.slabs.reduce((a, s) => a + (s.x1 - s.x0), 0) + plan.transitions.length * 30;
      const segTime = clamp(34 - (scoreResult.total / 150) * 17, 11, 34);
      const timeLimit = clamp(Math.round((pathLen / PHYS.WALK_SPEED / 60) * 2.4 + plan.transitions.length * segTime * 0.55 + 34), 60, 420);
      const spawnRate = clamp(Math.round(46 - scoreResult.total * 0.14), 14, 52);

      const titleWord = rng.pick(biome.titleWords);
      const diffName = scoreResult.total < 40 ? 'EASY' : scoreResult.total < 70 ? 'NORMAL' : scoreResult.total < 100 ? 'HARD' : scoreResult.total < 125 ? 'NIGHTMARE' : 'IMPOSSIBLE';

      return {
        id: opts.id || 'CUSTOM',
        title: `${titleWord} ${opts.stageNo ? 'S' + opts.stageNo : ''} (${diffName})`.replace(/\s+/g, ' ').trim(),
        bgImg: `assets/bg_level_${biome.bgImg}.jpg`,
        terrainTheme: biome.terrainTheme,
        biome: biome.key,
        totalUnits,
        needPercent,
        spawnRate,
        timeLimit,
        skills,
        spawnX: Math.round(plan.spawn.x), spawnY: Math.round(plan.spawn.y),
        gateX: Math.round(plan.gate.x), gateY: Math.round(plan.gate.y),
        elements: elements.map(e => {
          const o = { type: e.type, x: Math.round(e.x), y: Math.round(e.y), w: Math.round(e.w), h: Math.round(e.h) };
          if (e.palette) o.palette = e.palette;
          if (e.profile) o.profile = e.profile;
          return o;
        }),
        solutionDna: plan.dna.slice(),
        difficultyScore: Math.round(scoreResult.total),
        difficultyFactors: Object.fromEntries(Object.entries(scoreResult.factors).map(([k, v]) => [k, Math.round(v)])),
        layoutType: plan.archetype,
        // 검증 메타(디버그/티lemetry)
        _meta: opts.meta || null
      };
    }
  }

  /* =====================================================================
   * NanoTerraGenerator — 파이프라인 오케스트레이터
   * ===================================================================*/
  class NanoTerraGenerator {
    constructor(opts = {}) {
      this.planner = new PL.PathPlanner();
      this.validator = new Validator(opts.validator || {});
      this.timeBudgetMs = opts.timeBudgetMs || 90;
      this.maxAttempts = opts.maxAttempts || 26;
      this.maxSimRepairs = opts.maxSimRepairs || 2;
      this.fallbackCache = new Map();   // bandKey → validated map (폴백 라이브러리)
      this.stats = { attempts: 0, patches: 0, simMs: 0, genMs: 0, fallbacks: 0 };
      this.handAuthored = opts.handAuthored || []; // 수제 베이스라인 맵
    }

    /* intent = { score, biome, dna, skillPool, avoidArch, forceArch, stageNo, seed, timeBudgetMs } */
    generate(intent = {}) {
      const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
      const t0 = now();
      const seed0 = intent.seed != null ? intent.seed : (Math.random() * 1e9) | 0;
      const targetScore = intent.score != null ? intent.score : 65;
      const band = bandKey(targetScore);
      const tb = intent.timeBudgetMs || this.timeBudgetMs;
      let last = null, deepChecks = 0;

      for (let attempt = 0; attempt < this.maxAttempts; attempt++) {
        if (attempt >= 3 && now() - t0 > tb) break;
        this.stats.attempts++;
        const seed = (seed0 + attempt * 7919) >>> 0;
        const rng = makeRNG(seed ^ 0x9e3779b9);

        /* (A) 난이도 예산 역산 */
        const budget = DifficultyScorer.budgetFor(targetScore, rng);
        const it = { ...intent, norm: budget.norm, dnaLen: intent.dna ? intent.dna.length : budget.dnaLen, repeatChance: 0.1 + budget.norm * 0.25 };

        /* (B) 제약 기반 경로 계획 */
        const plan = this.planner.plan(seed, it);
        if (plan.unplaced > 0 || plan.slabs.length < 3) continue;

        /* (C) emit + rasterize 빌더(재사용 클로저) */
        const emitter = new PL.Emitter(rng, plan.biome);
        const build = (pl) => {
          const els = emitter.elements(pl);
          const r = PL.Assembler.build(pl, els);
          return { grid: r.grid, elements: els, corridor: r.corridor, protect: r.protect };
        };
        let built = build(plan);

        /* (D) Tier-2: probe → plan 패치 → 재구축 (시뮬레이션 前, 저비용) */
        const patcher = new Patcher();
        patcher.patchProbes(plan, build, 3);
        built = build(plan);
        this.stats.patches += patcher.log.length;

        /* (E) 점수 측정 + 밴드 넛지 */
        const meta = {
          timePressure: clamp(100 - budget.timePerSegment * 2.2, 0, 100),
          scarcity: clamp((2.0 - budget.skillSlack) * 62, 0, 100),
          steelDeco: plan.deco.filter(d => d.type === 'steelBarrier').length
        };
        let sc = DifficultyScorer.score(plan, built.grid, meta);
        for (let n = 0; n < 5 && Math.abs(sc.total - targetScore) > 8; n++) {
          if (!DifficultyScorer.nudge(plan, targetScore, sc.total, rng)) break;
          built = build(plan);
          sc = DifficultyScorer.score(plan, built.grid, meta);
        }

        /* (F) 맵 JSON 조립 */
        const assemble = () => MapAssembler.assemble(plan, built.elements, sc, {
          rng, stageNo: intent.stageNo, id: intent.id, skillPool: intent.skillPool,
          totalUnits: intent.totalUnits, needPercent: intent.needPercent,
          meta: { seed, attempt, patchLog: patcher.log.slice(0, 16) }
        });
        let map = assemble();

        /* (G) Tier-3a: 저비용 스크립티드 검증(1유닛) */
        let v = this.validator.validate(built.grid, plan, map, false, built.protect);
        last = { map, plan, grid: built.grid, validation: v, score: sc, seed, attempt, patcher };

        if (!v.ok) {
          /* (H) Tier-4a: 실패 지점 기반 plan 패치 → 재구축 → 재검증 */
          let fixed = false;
          for (let k = 0; k < 2 && !fixed; k++) {
            const n1 = patcher.patchFromSim(plan, v, 4);
            const before = patcher.log.length;
            patcher.patchProbes(plan, build, 1);
            if (n1 === 0 && patcher.log.length === before) break;
            built = build(plan);
            map = assemble();
            v = this.validator.validate(built.grid, plan, map, false, built.protect);
            last = { map, plan, grid: built.grid, validation: v, score: sc, seed, attempt, patcher };
            if (v.ok) fixed = true;
          }
          if (!v.ok) continue;
        }

        /* (I) Tier-3b: 풀 검증(다중 유닛 + 반응형 + 무스킬) */
        deepChecks++;
        if (deepChecks > 1 && now() - t0 > tb * 0.8) {
          // 예산 초과 → Tier-3a 통과분을 "잠정 승인"(백그라운드 재검증 권장)
          map._meta = { ...(map._meta || {}), validation: { scripted: 1, reactive: -1, tier: 'a', provisional: true, attempts: attempt + 1 }, genMs: +(now() - t0).toFixed(1) };
          map._ctx = last;
          return map;
        }
        v = this.validator.validate(built.grid, plan, map, true, built.protect);
        let simRepairs = 0;
        while (!v.ok && simRepairs < this.maxSimRepairs && now() - t0 < tb) {
          simRepairs++;
          const n = patcher.patchFromSim(plan, v, 5);
          patcher.patchProbes(plan, build, 1);
          if (n === 0) break;
          built = build(plan);
          map = assemble();
          v = this.validator.validate(built.grid, plan, map, true, built.protect);
        }
        last = { map, plan, grid: built.grid, validation: v, score: sc, seed, attempt, patcher, simRepairs };
        if (v.ok) {
          map._meta = {
            ...(map._meta || {}),
            validation: {
              scripted: +v.scriptedRate.toFixed(2), reactive: +v.reactiveRate.toFixed(2),
              robustness: +v.robustness.toFixed(2), passive: +v.passiveRate.toFixed(2),
              attempts: attempt + 1, simRepairs, tier: v.tier
            },
            genMs: +(now() - t0).toFixed(1)
          };
          this.cacheFallback(band, map);
          map._ctx = last;
          return map;
        }
      }

      /* (J) 폴백 체인 */
      this.stats.fallbacks++;
      const cached = this.fallbackCache.get(band) || this.fallbackCache.get(nearestBand(this.fallbackCache, targetScore));
      if (cached) return withFallbackMark(structuredCloneLite(cached), 'CACHE', last);
      if (this.handAuthored.length) {
        const base = this.handAuthored[clamp(Math.floor(targetScore / 150 * this.handAuthored.length), 0, this.handAuthored.length - 1)];
        return withFallbackMark(structuredCloneLite(base), 'HAND_AUTHORED', last);
      }
      if (last) return withFallbackMark(last.map, 'BEST_EFFORT', last);
      throw new Error('generation failed: no fallback available');
    }

    cacheFallback(band, map) {
      if (!this.fallbackCache.has(band)) this.fallbackCache.set(band, structuredCloneLite(map));
    }
  }

  function withFallbackMark(map, kind, last) {
    map._meta = { ...(map._meta || {}), fallback: kind, validation: last ? { scripted: last.validation.scriptedRate, reactive: +last.validation.reactiveRate.toFixed(2) } : null };
    if (kind === 'BEST_EFFORT') { map.needPercent = Math.max(30, map.needPercent - 20); map.timeLimit += 45; }
    return map;
  }
  function bandKey(score) { return Math.floor(clamp(score, 0, 149) / 15) * 15; }
  function nearestBand(cacheMap, score) {
    let best = null, bd = 1e9;
    for (const k of cacheMap.keys()) { const d = Math.abs(k - score); if (d < bd) { bd = d; best = k; } }
    return best;
  }
  function structuredCloneLite(o) { return JSON.parse(JSON.stringify(o)); }

  /* plan(패치 반영된 중간표현) → elements[] 재구성 */
  function resyncElements(plan, emitter) {
    const els = emitter.elements(plan);
    // cutRegion(PORTAL 대체경로 차단)은 Assembler에서 처리하도록 plan에 유지
    return els;
  }

  class MetaGenerator {
    constructor(gen, opts = {}) {
      this.gen = gen;
      this.window = opts.window || 5;
      this.fullCoverWindow = opts.fullCoverWindow || 12;
    }
    /* arc = { from, to, curve:'ease'|'linear'|'wave'|'spike', stages, biomePlan } */
    batch(arc) {
      const rng = makeRNG(arc.seed || 12345);
      const N = arc.stages;
      const out = [];
      const recentArch = [], recentBiomeFam = [], recentSkills = [], recentSets = [];
      const usedCombos = new Set();
      const skillCover = [];

      for (let i = 0; i < N; i++) {
        const t = N === 1 ? 1 : i / (N - 1);
        const curve = { ease: t * t * (3 - 2 * t), linear: t, wave: 0.5 - 0.5 * Math.cos(Math.PI * 2 * t * 1.15) * (1 - t) + t * 0.85, spike: (i === N - 1 ? 1 : t * 0.8) }[arc.curve || 'ease'];
        const target = clamp(arc.from + (arc.to - arc.from) * clamp(curve, 0, 1) + rng.range(-4, 4), 5, 148);

        // --- 바이옴: 저불일치 시퀀스(골든Ratio) + 인접 제약 ---
        const biome = pickSpread(rng, C.BIOME_KEYS, recentBiomeFam, (k) => C.BIOMES[k].family, 0.15);
        // --- 레이아웃: 인접 중복 회피 ---
        const avoidArch = recentArch[recentArch.length - 1];
        // --- 스킬 세트: 페널티 기반 선택 + 윈도우 커버리지 ---
        const pool = arc.skillPool || ['CLIMB', 'FLOAT', 'BASH', 'MINE', 'DRILL', 'BOMB', 'BUILD', 'BLOCK', 'PORTAL'];
        const unlocked = pool.filter(s => !arc.locked || !arc.locked.includes(s));
        const dnaLen = clamp(Math.round(1 + (target / 150) * 4.2), 1, Math.min(6, unlocked.length));
        const dna = this.pickSkillSet(rng, unlocked, dnaLen, recentSkills, skillCover, usedCombos);

        const map = this.gen.generate({
          score: target, biome, dna, avoidArch,
          skillPool: unlocked, stageNo: arc.startStage + i,
          seed: (arc.seed || 1) + i * 104729
        });

        // --- 메트릭 기록 ---
        recentArch.push(map.layoutType); if (recentArch.length > this.window) recentArch.shift();
        recentBiomeFam.push(C.BIOMES[map.biome] ? C.BIOMES[map.biome].family : 'x'); if (recentBiomeFam.length > 3) recentBiomeFam.shift();
        recentSkills.push(...map.solutionDna); while (recentSkills.length > this.window * 2) recentSkills.shift();
        recentSets.push(map.solutionDna.slice().sort().join('+')); if (recentSets.length > this.window) recentSets.shift();
        usedCombos.add(map.solutionDna.slice().sort().join('+'));
        for (const s of map.solutionDna) skillCover.push({ s, i });

        out.push(map);
      }
      return { stages: out, metrics: this.audit(out, arc) };
    }

    pickSkillSet(rng, pool, len, recentSkills, skillCover, usedCombos) {
      let best = null, bestScore = -1e9;
      for (let c = 0; c < 26; c++) {
        const cand = [];
        const bag = pool.slice();
        while (cand.length < len && bag.length) {
          const w = bag.map(s => {
            let wt = 1;
            const rec = recentSkills.filter(x => x === s).length;
            wt *= Math.pow(0.42, rec);                       // 최근 중복 페널티
            const lastUse = skillCover.filter(k => k.s === s).pop();
            wt *= lastUse ? clamp((skillCover.length ? 1 : 1) * (1 + (cand.length, 0) + 0), 1, 1) : 1;
            if (lastUse) wt *= 0.7; else wt *= 1.5;          // 미사용 스킬 우선(커버리지)
            return { s, w: wt };
          });
          const pick = rng.weighted(w).s;
          cand.push(pick); bag.splice(bag.indexOf(pick), 1);
        }
        const key = cand.slice().sort().join('+');
        let sc = 0;
        for (const s of cand) sc -= recentSkills.filter(x => x === s).length * 3;
        sc -= usedCombos.has(key) ? 14 : 0;
        sc += cand.filter(s => !skillCover.some(k => k.s === s)).length * 5;
        sc += rng() * 1.5;
        if (sc > bestScore) { bestScore = sc; best = cand; }
      }
      return best;
    }

    /* 배치 품질 감사: 단조성, 인접 중복, 커버리지 */
    audit(stages, arc) {
      const m = { monoViolations: 0, adjacentDupLayout: 0, adjacentDupCombo: 0, skillCoverage: {}, scoreRange: [], biomeSeq: [] };
      let prev = null;
      for (const s of stages) {
        m.scoreRange.push(s.difficultyScore);
        m.biomeSeq.push(s.biome);
        for (const k of s.solutionDna) m.skillCoverage[k] = (m.skillCoverage[k] || 0) + 1;
        if (prev) {
          if (s.difficultyScore < prev.difficultyScore - 14) m.monoViolations++;
          if (s.layoutType === prev.layoutType) m.adjacentDupLayout++;
          const a = s.solutionDna.slice().sort().join('+'), b = prev.solutionDna.slice().sort().join('+');
          if (a === b) m.adjacentDupCombo++;
        }
        prev = s;
      }
      m.uncovered = (arc.skillPool || []).filter(k => !m.skillCoverage[k]);
      return m;
    }
  }

  function pickSpread(rng, keys, recent, famFn, penalty) {
    const items = keys.map(k => {
      let w = 1;
      const fam = famFn(k);
      if (recent.includes(fam)) w *= penalty;
      if (recent[recent.length - 1] === fam) w *= penalty;
      return { k, w };
    });
    return rng.weighted(items).k;
  }

  return { WEIGHTS, DifficultyScorer, Validator, Patcher, MapAssembler, NanoTerraGenerator, MetaGenerator, resyncElements };
});
