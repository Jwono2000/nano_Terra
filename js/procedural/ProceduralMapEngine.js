/* ============================================================================
 * ProceduralMapEngine.js — 역방향 인과율 퍼즐 생성 엔진 (v4 Reverse Causal)
 * - 오브젝트 개수 기반 난이도 산정을 폐기하고,
 *   "스킬 조작 타이밍 개수(Timing Count)"와 "스킬 시퀀스 길이(Sequence Length)"로만 난이도 산출
 * - 5단계 역방향 인과율(Start/Goal 확정 → 역방향 기믹 체인 2~4개 → 필수 스킬+강철벽 병목 세트 →
 *   우회로 차단 프레임 마감 → 정답 스킬 + 여유분 1~2개 지급) 전면 적용
 * ==========================================================================*/
(function (root, factory) {
  const C = (typeof require === 'function') ? require('./MapCore.js') : root;
  const WK = (typeof require === 'function') ? require('./MapWalker.js') : root;
  const PL = (typeof require === 'function') ? require('./MapPlanner.js') : root;
  const PR = (typeof require === 'function') ? require('./MapProbe.js') : root;
  const FA = (typeof require === 'function') ? require('./FullCanvasLevelArchitect.js') : root;
  const api = factory(C, WK, PL, PR, FA);
  if (typeof module === 'object' && module.exports) module.exports = api;
  Object.assign(root, api);
})(typeof self !== 'undefined' ? self : this, function (C, WK, PL, PR, FA) {
  'use strict';

  const W = (C && C.W) || 800;
  const H = (C && C.H) || 450;
  const PHYS = (C && C.PHYS) || { WALK_SPEED: 1.25, LETHAL_FALL: 96, CORRIDOR_H: 28 };
  const clamp = (C && C.clamp) || function (v, min, max) { return Math.max(min, Math.min(max, v)); };
  const makeRNG = (C && C.makeRNG) || function (seed) {
    let s = (seed >>> 0) || 123456789;
    const rng = function () {
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    rng.irange = (min, max) => Math.floor(min + rng() * (max - min + 1));
    rng.range = (min, max) => min + rng() * (max - min);
    rng.pick = (arr) => arr[Math.floor(rng() * arr.length)];
    rng.weighted = (items) => {
      let tot = 0;
      for (const it of items) tot += Math.max(0, it.w || 1);
      if (tot <= 0) return items[0];
      let x = rng() * tot;
      for (const it of items) { x -= Math.max(0, it.w || 1); if (x <= 0) return it; }
      return items[items.length - 1];
    };
    return rng;
  };

  /* =====================================================================
   * [개편 2] DifficultyScorer — 타이밍 개수 & 스킬 시퀀스 길이 기반 스코어러
   * - 배치된 오브젝트/데코/강철 블록 개수로 점수를 뻥튀기하던 기존 방식을 완전 폐기
   * - 오직 요구되는 스킬 조작 타이밍 개수(timingCount), 스킬 시퀀스 길이(sequenceLength),
   *   연속 조작 밀도(timingDensity), 스킬 전환 연계(comboSynergy)로만 산출
   * ===================================================================*/
  const WEIGHTS = {
    timingCount: 42,     // 요구되는 스킬 조작 타이밍의 개수 (핵심 지표 1)
    sequenceLength: 38,  // 필수 스킬 시퀀스의 길이 및 고유 스킬 다양성 (핵심 지표 2)
    comboSynergy: 20     // 연속 스킬 간 전환 및 짧은 조작 간격(병목 연계 밀도)
  };

  class DifficultyScorer {
    static factors(plan, grid = null, meta = {}) {
      const f = {};

      const triggers = (plan && Array.isArray(plan.triggers))
        ? plan.triggers.filter(t => t && t.skill)
        : [];
      const dna = (plan && Array.isArray(plan.dna)) ? plan.dna : [];

      // 1) 요구되는 스킬 조작 타이밍 개수 (Timing Manipulation Count)
      const timingCount = triggers.length > 0 ? triggers.length : dna.length;
      let tightTimingPairs = 0;
      const sortedTrig = triggers.slice().sort((a, b) => a.x - b.x);
      for (let i = 1; i < sortedTrig.length; i++) {
        const dist = Math.hypot(
          (sortedTrig[i].x || 0) - (sortedTrig[i - 1].x || 0),
          (sortedTrig[i].y || 0) - (sortedTrig[i - 1].y || 0)
        );
        if (dist < 130) tightTimingPairs += 1.0;
        else if (dist < 180) tightTimingPairs += 0.5;
      }
      f.timingCount = clamp((timingCount * 18) + (tightTimingPairs * 10), 0, 100);

      // 2) 스킬 시퀀스 길이 (Skill Sequence Length)
      const seqLen = Math.max(dna.length, timingCount);
      const uniqueSkills = new Set(dna.length > 0 ? dna : triggers.map(t => t.skill)).size;
      f.sequenceLength = clamp((seqLen * 16) + (uniqueSkills * 8), 0, 100);

      // 3) 스킬 연계 전환 (Combo Synergy — 연속으로 다른 스킬을 교차 조작해야 하는 횟수)
      const activeSeq = triggers.length > 0 ? triggers.map(t => t.skill) : dna;
      let switches = 0;
      for (let i = 1; i < activeSeq.length; i++) {
        if (activeSeq[i] !== activeSeq[i - 1]) switches++;
      }
      f.comboSynergy = clamp((switches * 24) + (tightTimingPairs * 8), 0, 100);

      return f;
    }

    static score(plan, grid = null, meta = {}) {
      const f = DifficultyScorer.factors(plan, grid, meta);
      let s = 0;
      for (const k of Object.keys(WEIGHTS)) {
        s += WEIGHTS[k] * ((f[k] || 0) / 100);
      }
      // 0 ~ 150 스케일로 정규화
      const total = Math.round(clamp(s * 1.35, 15, 150) * 10) / 10;
      return { total, factors: f };
    }

    /* 목표 점수 → 역방향 기믹 체인 길이(2~4개) 및 스킬 여유분(1~2개) 역산 */
    static budgetFor(targetScore) {
      const n = clamp(targetScore / 150, 0.1, 1.0);
      const gimmickCount = clamp(Math.round(2 + n * 2), 2, 4); // 핵심 기믹 체인 2~4개 고정
      const spareSkills = n >= 0.65 ? 1 : 2;                   // 여유분 1~2개 고정
      return {
        dnaLen: gimmickCount,
        gimmickCount,
        segs: gimmickCount + 1,
        norm: n,
        spareSkills,
        skillSlack: 1.0,
        timePerSegment: clamp(32 - n * 12, 16, 32)
      };
    }

    /* 난이도 넛지: 슬랩 크기가 아니라 조작 트리거 간격을 미세 조정 */
    static nudge(plan, target, current) {
      const diff = target - current;
      if (Math.abs(diff) < 6) return null;
      return null;
    }
  }

  /* =====================================================================
   * Validator — 스크립티드(정답 시퀀스) + 무스킬(병목 누수 차단) 검증
   * ===================================================================*/
  class Validator {
    constructor(opts = {}) {
      this.units = opts.units || 5;
      this.maxFrames = opts.maxFrames || 2200;
      this.robustFloor = opts.robustFloor != null ? opts.robustFloor : 0.34;
    }

    runTrial(grid, plan, map, mode, units) {
      if (!WK || !WK.Sim) {
        return { mode, units, saved: units, rate: 1, deaths: [], stuck: [], skillUses: {}, missedTriggers: [], traces: [], firstFail: null };
      }
      const g = grid.clone();
      const budget = {};
      for (const k of Object.keys(map.skills)) budget[k] = mode === 'passive' ? 0 : map.skills[k];
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
          const isSacrificeUnit = hasSacrifice ? (i === 0) : false;
          own = plan.triggers.filter(t => !t.sacrifice || isSacrificeUnit).map(t => ({ ...t, used: false }));
        }
        const w = sim.spawn(plan.spawn.x, plan.spawn.y, 1, i, i * (map.spawnRate || 25), own);
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
      // 무조작(passive) 클리어가 불가능(pass.saved === 0)하고 스크립티드 구출률을 충족해야만 통과
      out.ok = (pass.saved === 0) && (full.rate * 100 >= map.needPercent);
      out.diag = { missed: full.missedTriggers, deaths: full.deaths.slice(0, 6), reactDeaths: react.deaths.slice(0, 6) };
      return out;
    }
  }

  /* =====================================================================
   * Patcher — 시뮬레이션/프로브 결함 보정기
   * ===================================================================*/
  class Patcher {
    constructor() { this.log = []; }

    patchProbes(plan, build, rounds = 3) {
      if (!PR || !PR.probeAll) return { applied: 0, log: this.log };
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
        const slab = (plan.slabAt && plan.slabAt(cl.x)) || nearestSlab(plan, cl.x, cl.y);
        if (cl.reasons.has('STUCK') || cl.reasons.has('CLIMB_BLOCKED') || cl.reasons.has('CLIMB_TIMEOUT')) {
          if (plan.deco) {
            for (const d of plan.deco) {
              if (!d.removed && d.x < cl.x + 16 && d.x + d.w > cl.x - 16 && d.y < cl.y && d.y + d.h > cl.y - PHYS.CORRIDOR_H - 6) {
                d.removed = true;
              }
            }
          }
          if (slab) slab.x1 = clamp(slab.x1 + 10, slab.x0 + 50, W - 10);
          this.log.push({ type: 'sim', code: 'WIDEN_CORRIDOR', x: cl.x, y: cl.y });
          applied++;
        }
      }
      if (plan.deco && plan.deco.some(d => d.removed)) {
        plan.deco = plan.deco.filter(d => !d.removed);
      }
      return applied;
    }
  }

  function nearestSlab(plan, x, y) {
    let best = null, bd = 1e9;
    for (const s of (plan.slabs || [])) {
      const cx = clamp(x, s.x0, s.x1);
      const d = Math.hypot(cx - x, s.y - y);
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }

  /* =====================================================================
   * [5단계] MapAssembler — 정답 필수 스킬 개수 + 여유분 1~2개만 정밀 지급
   * ===================================================================*/
  class MapAssembler {
    static assemble(plan, elements, scoreResult, opts = {}) {
      const rng = opts.rng || makeRNG(1);
      const biome = plan.biome || { titleWords: ['GENESIS'], bgImg: 1, terrainTheme: 'cyan', key: 'cryoCavern' };
      const totalUnits = opts.totalUnits != null ? opts.totalUnits : clamp(Math.round(14 + scoreResult.total * 0.08), 12, 25);
      const needPercent = opts.needPercent != null ? opts.needPercent : clamp(50 + Math.round(scoreResult.total * 0.22), 50, 85);

      // [5단계 핵심] 정답 트리거에 요구되는 필수 스킬 개수 집계 후 정확히 +1~2개 여유분만 지급
      const planned = {};
      for (const t of (plan.triggers || [])) {
        if (t && t.skill) {
          const k = t.skill.toLowerCase();
          planned[k] = (planned[k] || 0) + (t.count || 1);
        }
      }
      if (Object.keys(planned).length === 0 && Array.isArray(plan.dna)) {
        for (const act of plan.dna) {
          const k = act.toLowerCase();
          planned[k] = (planned[k] || 0) + 1;
        }
      }

      if (planned['float'] > 0) {
        const minSaved = Math.ceil((totalUnits * needPercent) / 100);
        planned['float'] = Math.max(minSaved, Math.min(totalUnits, minSaved + 1));
      }

      const skills = {
        climb: 0, float: 0, bash: 0, mine: 0,
        drill: 0, bomb: 0, build: 0, block: 0, portal: 0
      };
      const maxSpare = scoreResult.total >= 85 ? 1 : 2;
      for (const k of Object.keys(skills)) {
        const req = planned[k] || 0;
        if (req > 0) {
          const spare = rng.irange ? rng.irange(1, maxSpare) : 1;
          skills[k] = req + spare;
        } else {
          skills[k] = 0; // 정답에 필요 없는 스킬은 절대 지급하지 않음 (날먹 원천 차단)
        }
      }

      const trigCount = Math.max(1, (plan.triggers || []).length || (plan.dna || []).length);
      const timeLimit = clamp(Math.round(45 + trigCount * 28), 90, 300);
      const spawnRate = clamp(Math.round(38 - scoreResult.total * 0.12), 16, 40);

      const titleWord = (biome.titleWords && rng.pick) ? rng.pick(biome.titleWords) : 'SECTOR';
      const diffName = scoreResult.total < 50 ? 'EASY' : scoreResult.total < 80 ? 'NORMAL' : scoreResult.total < 105 ? 'HARD' : 'NIGHTMARE';

      return {
        id: opts.id || 'CUSTOM',
        title: `${titleWord} ${opts.stageNo ? 'S' + opts.stageNo : ''} (${diffName})`.replace(/\s+/g, ' ').trim(),
        bgImg: `assets/bg_level_${biome.bgImg || 1}.jpg`,
        terrainTheme: biome.terrainTheme || 'cyan',
        biome: biome.key || 'cryoCavern',
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
        solutionDna: (plan.dna || []).slice(),
        difficultyScore: Math.round(scoreResult.total),
        difficultyFactors: Object.fromEntries(Object.entries(scoreResult.factors).map(([k, v]) => [k, Math.round(v)])),
        layoutType: plan.archetype || 'cascade',
        _meta: opts.meta || null
      };
    }
  }

  /* =====================================================================
   * NanoTerraGenerator — 역방향 인과율 파이프라인 오케스트레이터
   * - FullCanvasLevelArchitect(5단계 역방향 인과율 아키텍트)를 기본 코어로 구동하며,
   *   레거시 Planner 호출 시에도 동일한 타이밍/시퀀스 스코어러와 스킬 지급 규칙을 강제
   * ===================================================================*/
  class NanoTerraGenerator {
    constructor(opts = {}) {
      this.planner = (PL && PL.PathPlanner) ? new PL.PathPlanner() : null;
      this.validator = new Validator(opts.validator || {});
      this.timeBudgetMs = opts.timeBudgetMs || 120;
      this.maxAttempts = opts.maxAttempts || 26;
      this.maxSimRepairs = opts.maxSimRepairs || 2;
      this.fallbackCache = new Map();
      this.stats = { attempts: 0, patches: 0, simMs: 0, genMs: 0, fallbacks: 0 };
      this.handAuthored = opts.handAuthored || [];
    }

    generate(intent = {}) {
      const Architect = (typeof FullCanvasLevelArchitect !== 'undefined')
        ? FullCanvasLevelArchitect
        : (FA && FA.FullCanvasLevelArchitect)
          ? FA.FullCanvasLevelArchitect
          : null;

      // 1순위: 5단계 역방향 인과율 아키텍트(FullCanvasLevelArchitect)로 즉시 생성
      if (Architect) {
        const targetScore = intent.score != null ? intent.score : 65;
        let diffKey = 'normal';
        if (targetScore < 50) diffKey = 'easy';
        else if (targetScore < 80) diffKey = 'normal';
        else if (targetScore < 105) diffKey = 'hard';
        else diffKey = 'nightmare';

        return Architect.generate({
          difficulty: diffKey,
          layout: intent.forceArch || intent.layout || 'random',
          stageNo: intent.stageNo,
          id: intent.id,
          seed: intent.seed
        });
      }

      // 2순위: 레거시 PathPlanner 폴백 (동일한 역방향 스킬 예산 및 타이밍 스코어러 적용)
      if (!this.planner) {
        throw new Error('Reverse Causal Architect not loaded');
      }

      const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
      const t0 = now();
      const seed0 = intent.seed != null ? intent.seed : (((Math.random() * 1e9) | 0) ^ (Date.now() & 0x7fffffff));
      const targetScore = intent.score != null ? intent.score : 65;
      const band = bandKey(targetScore);
      const tb = intent.timeBudgetMs || this.timeBudgetMs;
      let last = null;

      for (let attempt = 0; attempt < this.maxAttempts; attempt++) {
        if (attempt >= 3 && now() - t0 > tb) break;
        this.stats.attempts++;
        const seed = (seed0 + attempt * 7919) >>> 0;
        const rng = makeRNG(seed ^ 0x9e3779b9);

        const budget = DifficultyScorer.budgetFor(targetScore);
        const it = {
          ...intent,
          norm: budget.norm,
          dnaLen: intent.dna ? intent.dna.length : budget.dnaLen,
          repeatChance: 0.1
        };

        const plan = this.planner.plan(seed, it);
        if (plan.unplaced > 0 || plan.slabs.length < 3) continue;

        const emitter = new PL.Emitter(rng, plan.biome);
        const build = (pl) => {
          const els = emitter.elements(pl);
          const r = PL.Assembler.build(pl, els);
          return { grid: r.grid, elements: els, corridor: r.corridor, protect: r.protect };
        };
        let built = build(plan);

        const patcher = new Patcher();
        patcher.patchProbes(plan, build, 3);
        built = build(plan);
        this.stats.patches += patcher.log.length;

        const sc = DifficultyScorer.score(plan, built.grid);
        const map = MapAssembler.assemble(plan, built.elements, sc, {
          rng, stageNo: intent.stageNo, id: intent.id, skillPool: intent.skillPool,
          totalUnits: intent.totalUnits, needPercent: intent.needPercent,
          meta: { seed, attempt, patchLog: patcher.log.slice(0, 16) }
        });

        const v = this.validator.validate(built.grid, plan, map, true, built.protect);
        last = { map, plan, grid: built.grid, validation: v, score: sc, seed, attempt, patcher };
        if (v.ok) {
          this.cacheFallback(band, map);
          return map;
        }
      }

      this.stats.fallbacks++;
      if (last && last.map) return last.map;
      throw new Error('generation failed');
    }

    cacheFallback(band, map) {
      if (!this.fallbackCache.has(band)) {
        this.fallbackCache.set(band, JSON.parse(JSON.stringify(map)));
      }
    }
  }

  function bandKey(score) { return Math.floor(clamp(score, 0, 149) / 15) * 15; }

  function resyncElements(plan, emitter) {
    return emitter.elements(plan);
  }

  /* =====================================================================
   * MetaGenerator — 캠페인 배치 생성 및 감사
   * ===================================================================*/
  class MetaGenerator {
    constructor(gen, opts = {}) {
      this.gen = gen;
      this.window = opts.window || 5;
    }

    batch(arc) {
      const N = arc.stages || 10;
      const out = [];
      const archs = ['cascade', 'zigzag', 'traverse', 'split', 'chamber', 'ascent'];

      for (let i = 0; i < N; i++) {
        const t = N === 1 ? 1 : i / (N - 1);
        const target = clamp((arc.from || 35) + ((arc.to || 120) - (arc.from || 35)) * t, 25, 145);
        const map = this.gen.generate({
          score: target,
          forceArch: archs[i % archs.length],
          stageNo: (arc.startStage || 1) + i,
          seed: (arc.seed || 12345) + i * 104729
        });
        out.push(map);
      }
      return { stages: out, metrics: this.audit(out, arc) };
    }

    audit(stages, arc) {
      const m = { monoViolations: 0, adjacentDupLayout: 0, adjacentDupCombo: 0, skillCoverage: {}, scoreRange: [], biomeSeq: [] };
      let prev = null;
      for (const s of stages) {
        m.scoreRange.push(s.difficultyScore);
        m.biomeSeq.push(s.biome || s.terrainTheme);
        for (const k of (s.solutionDna || [])) m.skillCoverage[k] = (m.skillCoverage[k] || 0) + 1;
        if (prev) {
          if (s.difficultyScore < prev.difficultyScore - 18) m.monoViolations++;
          if (s.layoutType === prev.layoutType) m.adjacentDupLayout++;
          const a = (s.solutionDna || []).slice().sort().join('+');
          const b = (prev.solutionDna || []).slice().sort().join('+');
          if (a === b) m.adjacentDupCombo++;
        }
        prev = s;
      }
      m.uncovered = (arc.skillPool || []).filter(k => !m.skillCoverage[k]);
      return m;
    }
  }

  /* =====================================================================
   * ProceduralMapEngine — 외부 게임 인터페이스 (LevelEditor, StageManager, main.js)
   * ===================================================================*/
  class ProceduralMapEngine {
    static THEMES = [
      'assets/bg_level_1.jpg',
      'assets/bg_level_2.jpg',
      'assets/bg_level_3.jpg',
      'assets/bg_level_4.jpg',
      'assets/bg_level_5.jpg',
      'assets/bg_level_6.jpg',
      'assets/bg_level_7.jpg',
      'assets/bg_level_8.jpg',
      'assets/bg_level_9.jpg'
    ];

    static PALETTES = ['cyan', 'red', 'brown', 'green', 'purple'];
    static LAYOUTS = ['random', 'descent', 'ascent', 'traverse', 'split', 'chamber', 'zigzag'];

    static SECTOR_NAMES = [
      'GENESIS', 'VALKYRIE', 'HYPERION', 'NEBULA', 'ECLIPSE', 'QUANTUM',
      'SOLARIS', 'CYBERDYNE', 'KRONOS', 'ABYSS', 'PROMETHEUS', 'TITAN',
      'NEXUS', 'VORTEX', 'OLYMPUS', 'ANDROMEDA', 'AURORA', 'ZENITH'
    ];

    static _generator = null;
    static _metaGenerator = null;

    static get generator() {
      if (!this._generator) {
        this._generator = new NanoTerraGenerator({
          timeBudgetMs: 1000,
          maxAttempts: 25,
          validator: { units: 5 }
        });
      }
      return this._generator;
    }

    static get metaGenerator() {
      if (!this._metaGenerator) {
        this._metaGenerator = new MetaGenerator(this.generator, { window: 5 });
      }
      return this._metaGenerator;
    }

    static getRandomItem(arr) {
      return arr[Math.floor(Math.random() * arr.length)];
    }

    static generateProfile(points = 5, minH = 14, maxH = 40) {
      const res = [];
      for (let i = 0; i < points; i++) {
        res.push(Math.floor(Math.random() * (maxH - minH + 1)) + minH);
      }
      return res;
    }

    static mapDifficultyToScore(diff) {
      if (typeof diff === 'number') return clamp(diff, 20, 150);
      const d = (diff || 'normal').toLowerCase();
      switch (d) {
        case 'easy': return 40;
        case 'normal': return 68;
        case 'hard': return 95;
        case 'nightmare': return 125;
        default: return 68;
      }
    }

    static mapLayoutToArchetype(layout) {
      if (!layout || layout === 'random') return null;
      const l = layout.toLowerCase();
      const map = {
        'multi_tiered': 'cascade',
        'speedway': 'traverse',
        'twin_towers': 'ascent',
        'labyrinth': 'split',
        'floating_islands': 'chamber',
        'zigzag': 'zigzag',
        'descent': 'cascade',
        'cascade': 'cascade',
        'ascent': 'ascent',
        'traverse': 'traverse',
        'split': 'split',
        'chamber': 'chamber'
      };
      return map[l] || null;
    }

    static mapThemeAndPaletteToBiome(theme, palette) {
      if (palette && palette !== 'random') {
        if (palette === 'red') return 'volcanicRift';
        if (palette === 'cyan') return 'cryoCavern';
        if (palette === 'green') return 'verdantStrata';
        if (palette === 'purple') return 'voidLattice';
        if (palette === 'brown') return 'derelictStation';
      }
      if (theme && theme !== 'random') {
        if (theme.includes('level_2') || theme.includes('level_7')) return 'volcanicRift';
        if (theme.includes('level_1') || theme.includes('level_6')) return 'cryoCavern';
        if (theme.includes('level_5')) return 'verdantStrata';
        if (theme.includes('level_3') || theme.includes('level_8')) return 'voidLattice';
        if (theme.includes('level_4') || theme.includes('level_9')) return 'derelictStation';
      }
      return null;
    }

    static generate(options = {}) {
      const Architect = (typeof FullCanvasLevelArchitect !== 'undefined')
        ? FullCanvasLevelArchitect
        : (FA && FA.FullCanvasLevelArchitect)
          ? FA.FullCanvasLevelArchitect
          : null;

      if (Architect) {
        return Architect.generate(options);
      }

      const targetScore = this.mapDifficultyToScore(options.difficulty);
      const forceArch = this.mapLayoutToArchetype(options.layout);
      const forceBiome = this.mapThemeAndPaletteToBiome(options.theme, options.palette);
      const seed = options.seed != null ? options.seed : (((Math.random() * 1e9) | 0) ^ (Date.now() & 0x7fffffff));

      return this.generator.generate({
        score: targetScore,
        biome: forceBiome,
        forceArch,
        dna: options.dna,
        skillPool: options.skillPool,
        stageNo: options.stageNo || 11,
        id: options.id || 'CUSTOM',
        seed
      });
    }

    static generateCampaignBatch(arc = {}) {
      const Architect = (typeof FullCanvasLevelArchitect !== 'undefined')
        ? FullCanvasLevelArchitect
        : (FA && FA.FullCanvasLevelArchitect)
          ? FA.FullCanvasLevelArchitect
          : null;

      if (Architect && arc.stages) {
        const stages = [];
        const archs = ['cascade', 'zigzag', 'traverse', 'split', 'chamber', 'ascent'];
        for (let i = 0; i < arc.stages; i++) {
          const t = arc.stages === 1 ? 1 : i / (arc.stages - 1);
          let diff = 'easy';
          if (t > 0.75) diff = 'nightmare';
          else if (t > 0.45) diff = 'hard';
          else if (t > 0.2) diff = 'normal';

          const map = Architect.generate({
            difficulty: diff,
            layout: archs[i % archs.length],
            stageNo: (arc.startStage || 11) + i,
            seed: (arc.seed || Date.now()) + i * 7919
          });
          stages.push(map);
        }
        return { stages };
      }
      return this.metaGenerator.batch(arc);
    }

    static generateNextStage(currentStageNo = 11, prevMap = null, difficulty = 'normal') {
      const Architect = (typeof FullCanvasLevelArchitect !== 'undefined')
        ? FullCanvasLevelArchitect
        : (FA && FA.FullCanvasLevelArchitect)
          ? FA.FullCanvasLevelArchitect
          : null;

      if (Architect) {
        const archs = ['cascade', 'zigzag', 'traverse', 'split', 'chamber', 'ascent'];
        const prevArch = prevMap ? prevMap.layoutType : null;
        const choices = archs.filter(a => a !== prevArch);
        const layout = choices.length ? choices[Math.floor(Math.random() * choices.length)] : 'cascade';
        return Architect.generate({
          difficulty,
          layout,
          stageNo: currentStageNo,
          seed: (Date.now() ^ (currentStageNo * 7919)) >>> 0
        });
      }

      const targetScore = this.mapDifficultyToScore(difficulty);
      return this.generator.generate({
        score: targetScore,
        stageNo: currentStageNo,
        avoidArch: prevMap ? prevMap.layoutType : null,
        seed: (Date.now() ^ (currentStageNo * 7919)) >>> 0
      });
    }
  }

  return {
    WEIGHTS, DifficultyScorer, Validator, Patcher, MapAssembler,
    NanoTerraGenerator, MetaGenerator, resyncElements, ProceduralMapEngine
  };
});
