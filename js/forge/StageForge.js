/* ============================================================================
 * StageForge.js — Top-Down Whole-Canvas Macro-Blueprint & Physical Verifier (v3)
 *
 * - 8대 합성 블루프린트 패밀리(ForgeModules.FORGE_BLUEPRINTS) × 좌우 대칭(LTR/RTL) ×
 *   서브 기믹/지형 변형을 조합해 800×450 캔버스 전체를 다층 퍼즐로 설계
 * - auditLayout()으로 지형 겹침 0%, 층간 헤드룸 >= 58px, 스폰-웜홀 이격 강제
 * - 모든 생성 스테이지에서 차원포탈(portal)은 0으로 고정(보너스 전용)
 * - ForgeSim 실물리 5단계 검증: 0-스킬 차단, 정석 해법 클리어, 단일 스킬 스팸 및
 *   웜홀 직상단 숏컷 차단, 직관 봇(Greedy Bot) 클리어 차단(Hard+)
 * ==========================================================================*/
(function (root) {
  'use strict';

  const W = 800;
  const H = 450;

  const TIER_SPECS = {
    casual: {
      key: 'casual', name: 'CASUAL', tierIdx: 0,
      modules: [1, 2], units: 10, needPercent: 50, spawnRate: 34, timeLimit: 240,
      spareCore: 2, extraSkillTypes: 2, allowCheeseCheck: false, requireZeroZero: false
    },
    easy: {
      key: 'easy', name: 'EASY', tierIdx: 1,
      modules: [2, 2], units: 12, needPercent: 60, spawnRate: 30, timeLimit: 220,
      spareCore: 2, extraSkillTypes: 2, allowCheeseCheck: false, requireZeroZero: true
    },
    normal: {
      key: 'normal', name: 'NORMAL', tierIdx: 2,
      modules: [2, 3], units: 15, needPercent: 70, spawnRate: 26, timeLimit: 200,
      spareCore: 1, extraSkillTypes: 2, allowCheeseCheck: true, requireZeroZero: true
    },
    hard: {
      key: 'hard', name: 'HARD', tierIdx: 3,
      modules: [3, 4], units: 18, needPercent: 75, spawnRate: 21, timeLimit: 185,
      spareCore: 1, extraSkillTypes: 1, allowCheeseCheck: true, requireZeroZero: true
    },
    nightmare: {
      key: 'nightmare', name: 'NIGHTMARE', tierIdx: 4,
      modules: [3, 4], units: 20, needPercent: 78, spawnRate: 19, timeLimit: 170,
      spareCore: 0, extraSkillTypes: 1, allowCheeseCheck: true, requireZeroZero: true
    },
    master: {
      key: 'master', name: 'MASTER', tierIdx: 5,
      modules: [4, 4], units: 22, needPercent: 80, spawnRate: 17, timeLimit: 155,
      spareCore: 0, extraSkillTypes: 0, allowCheeseCheck: true, requireZeroZero: true
    },
    apex: {
      key: 'apex', name: 'APEX', tierIdx: 6,
      modules: [4, 5], units: 24, needPercent: 82, spawnRate: 16, timeLimit: 145,
      spareCore: 0, extraSkillTypes: 0, allowCheeseCheck: true, requireZeroZero: true
    }
  };

  const BIOMES = {
    cyan:   { palette: 'cyan',   biome: 'cryoCavern',      bg: 'assets/bg_level_1.jpg', altBg: 'assets/bg_level_6.jpg' },
    red:    { palette: 'red',    biome: 'volcanicRift',    bg: 'assets/bg_level_2.jpg', altBg: 'assets/bg_level_7.jpg' },
    purple: { palette: 'purple', biome: 'voidLattice',     bg: 'assets/bg_level_3.jpg', altBg: 'assets/bg_level_8.jpg' },
    brown:  { palette: 'brown',  biome: 'derelictStation', bg: 'assets/bg_level_4.jpg', altBg: 'assets/bg_level_9.jpg' },
    green:  { palette: 'green',  biome: 'verdantStrata',   bg: 'assets/bg_level_5.jpg', altBg: 'assets/bg_level_1.jpg' }
  };

  const SECTOR_NAMES = [
    'GENESIS', 'VALKYRIE', 'HYPERION', 'NEBULA', 'ECLIPSE', 'QUANTUM',
    'SOLARIS', 'CYBERDYNE', 'KRONOS', 'ABYSS', 'PROMETHEUS', 'TITAN',
    'NEXUS', 'VORTEX', 'OLYMPUS', 'ANDROMEDA', 'AURORA', 'ZENITH',
    'POLARIS', 'MERIDIAN', 'HELIOS', 'ENIGMA', 'HORIZON', 'TERMINUS'
  ];

  const LAYOUT_ALIASES = {
    cascade:  'reverse_bridge_citadel',
    chamber:  'bunker_underpass',
    zigzag:   'criss_cross_reactor',
    split:    'holding_chamber_liberation',
    traverse: 'beam_skate_labyrinth',
    ascent:   'twin_citadel_crossing',
    elevator: 'elevator_skybridge',
    terraces: 'cascading_terraces_highway'
  };

  const ALL_SKILLS = ['climb', 'float', 'bash', 'mine', 'drill', 'build', 'block', 'bomb', 'portal'];

  function makeRNG(seed) {
    let s = (seed >>> 0) || 123456789;
    const fn = function () {
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    fn.irange = (a, b) => Math.floor(a + fn() * (b - a + 1));
    fn.range = (a, b) => a + fn() * (b - a);
    fn.pick = (arr) => arr[Math.floor(fn() * arr.length)];
    fn.chance = (p) => fn() < p;
    fn.shuffle = (arr) => {
      const a = arr.slice();
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(fn() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    };
    return fn;
  }

  function getForgeLib() {
    const bps = (typeof FORGE_BLUEPRINTS !== 'undefined' && FORGE_BLUEPRINTS)
      || (root && root.FORGE_BLUEPRINTS);
    const auditor = (typeof auditForgeLayout === 'function' && auditForgeLayout)
      || (root && root.auditForgeLayout);
    if (bps && auditor) return { FORGE_BLUEPRINTS: bps, auditLayout: auditor };
    if (typeof require === 'function') {
      const fm = require('./ForgeModules.js');
      if (fm && fm.FORGE_BLUEPRINTS) return fm;
    }
    throw new Error('StageForge: ForgeModules.js (FORGE_BLUEPRINTS) is not loaded');
  }

  function getSim() {
    if (typeof ForgeSim !== 'undefined') return ForgeSim;
    if (root && root.ForgeSim) return root.ForgeSim;
    if (typeof require === 'function') return require('./ForgeSim.js').ForgeSim;
    throw new Error('StageForge: ForgeSim.js is not loaded');
  }

  function getBackwardLib() {
    if (typeof ForgeBackward !== 'undefined' && ForgeBackward) return ForgeBackward;
    if (root && root.ForgeBackward) return root.ForgeBackward;
    if (typeof require === 'function') {
      try { return require('./ForgeBackward.js'); } catch (e) { return null; }
    }
    return null;
  }

  function resolveTier(diff) {
    if (!diff || diff === 'random') return TIER_SPECS.normal;
    if (typeof diff === 'number') {
      if (diff < 35) return TIER_SPECS.casual;
      if (diff < 60) return TIER_SPECS.easy;
      if (diff < 90) return TIER_SPECS.normal;
      if (diff < 120) return TIER_SPECS.hard;
      if (diff < 150) return TIER_SPECS.nightmare;
      if (diff < 175) return TIER_SPECS.master;
      return TIER_SPECS.apex;
    }
    const k = String(diff).toLowerCase();
    return TIER_SPECS[k] || TIER_SPECS.normal;
  }

  function resolveBlueprint(blueprints, tier, R, opts) {
    const reqLayout = opts.layout ? String(opts.layout) : '';
    const mappedId = LAYOUT_ALIASES[reqLayout] || reqLayout;
    if (mappedId && mappedId !== 'random' && mappedId !== 'forge' && blueprints[mappedId]) {
      return blueprints[mappedId];
    }

    const poolIds = Array.isArray(opts.blueprintPool) && opts.blueprintPool.length > 0
      ? opts.blueprintPool
      : null;
    const allBps = Object.values(blueprints).filter(bp => !poolIds || poolIds.includes(bp.id));

    const maxEligibleTier = Math.max(1, tier.tierIdx);
    let eligible = allBps.filter(bp => (bp.minTier || 0) <= maxEligibleTier);
    if (eligible.length === 0) eligible = allBps;
    return R.pick(eligible);
  }

  function buildSkillBudget(built, tier, R) {
    const skills = {};
    for (const sk of ALL_SKILLS) skills[sk] = 0;

    const req = built.req || {};
    for (const [k, v] of Object.entries(req)) {
      if (k in skills && v > 0) skills[k] = v;
    }

    const forbid = new Set(built.forbidSkills || []);
    forbid.add('portal'); // 생성기에서 차원포탈 필수/스킬 지급 금지

    const altEntries = Object.entries(built.altBonus || {}).filter(
      ([k, v]) => (k in skills) && v > 0 && !forbid.has(k)
    );

    if (tier.tierIdx <= 1) {
      // 입문/초급: 대체 해법 여유 + 기본 보조 스킬
      for (const [k, v] of altEntries) skills[k] += v;
      const safePool = ['build', 'bash', 'mine', 'drill'].filter(k => !forbid.has(k));
      for (let i = 0; i < tier.spareCore && safePool.length > 0; i++) {
        const pick = R.pick(safePool);
        skills[pick] = (skills[pick] || 0) + 1;
      }
    } else if (tier.tierIdx === 2) {
      // 중급: 대체 루트 보너스 1~2개 + 안전 여유 1개
      for (const [k, v] of altEntries) skills[k] += v;
      const safePool = ['build', 'mine', 'bash'].filter(k => !forbid.has(k) && !(k === 'build' && skills.build >= 4));
      if (safePool.length > 0) {
        const pick = R.pick(safePool);
        skills[pick] += 1;
      }
    } else if (tier.tierIdx === 3) {
      // 고급(HARD): 창의적 우회용 altBonus 반영 (단 maxFloat/금지 스킬 엄수)
      for (const [k, v] of altEntries) skills[k] += v;
    } else if (tier.tierIdx === 4) {
      // 극한(NIGHTMARE): 대체 힌트 최대 1종만 허용
      if (altEntries.length > 0) {
        const [k] = R.pick(altEntries);
        skills[k] += 1;
      }
    } else if (tier.tierIdx === 5) {
      // MASTER: 아주 드물게 비우회성 소형 보조 1개 (35%)
      const minorAlt = altEntries.filter(([k]) => k === 'mine' || k === 'bash');
      if (minorAlt.length > 0 && R() < 0.35) {
        const [k] = R.pick(minorAlt);
        skills[k] += 1;
      }
    }
    // APEX(tierIdx === 6): 정확히 req 스킬 수만 지급

    for (const fk of forbid) skills[fk] = 0;
    skills.portal = 0;
    if (built.maxFloat != null) {
      skills.float = Math.min(skills.float, built.maxFloat);
    }
    return skills;
  }

  /**
   * Backward-Chaining 우선 조립 (GoalVault <- MidHub/Spawn <- DecoyInjector),
   * 명시적 engine:'blueprints' 지정 시에만 기존 FORGE_BLUEPRINTS 사용
   */
  function assembleCandidate(tier, R, opts = {}) {
    const pal = (opts.theme && BIOMES[opts.theme]) ? opts.theme : R.pick(Object.keys(BIOMES));
    const dir = (opts.dir === 1 || opts.dir === -1) ? opts.dir : (R() < 0.5 ? 1 : -1);

    const buildOpts = {
      layout: opts.layout,
      goalPool: opts.goalPool,
      frontPool: opts.frontPool,
      includeMovingPlatform: opts.includeMovingPlatform !== false,
      includeOptionA: opts.includeOptionA !== false,
      includeOptionB: opts.includeOptionB !== false
    };

    const Backward = (opts.engine !== 'blueprints') ? getBackwardLib() : null;
    if (Backward && typeof Backward.composeBackwardCandidate === 'function') {
      const built = Backward.composeBackwardCandidate({
        tierIdx: tier.tierIdx, R, pal, dir, opts: buildOpts
      });
      if (built && Array.isArray(built.elements) && Array.isArray(built.plan)) {
        const skills = buildSkillBudget(built, tier, R);
        return {
          blueprintId: built.blueprintId,
          layoutType: built.layoutType || 'backward',
          variantName: built.variantName,
          gimmickLabel: built.gimmickLabel,
          goalVault: built.goalVault,
          frontChain: built.frontChain,
          decoyCount: built.decoyCount || 0,
          usedIds: [built.frontChain, built.goalVault].filter(Boolean),
          allTags: built.tags || [],
          startDir: dir,
          pal,
          biome: BIOMES[pal],
          elements: built.elements,
          spawnX: built.spawnX,
          spawnY: built.spawnY,
          gateX: built.gateX,
          gateY: built.gateY,
          skills,
          plan: built.plan,
          solutionDna: built.solutionDna,
          hint: built.hint || ''
        };
      }
    }

    const { FORGE_BLUEPRINTS } = getForgeLib();
    const bp = resolveBlueprint(FORGE_BLUEPRINTS, tier, R, opts);
    if (!bp) return null;

    const built = bp.build({ R, pal, dir, tierIdx: tier.tierIdx, opts: buildOpts });
    if (!built || !Array.isArray(built.elements) || !Array.isArray(built.plan)) return null;

    const skills = buildSkillBudget(built, tier, R);
    const tags = Array.from(new Set([...(bp.tags || []), ...(built.tags || [])]));
    const solutionDna = Array.isArray(built.solutionDna) && built.solutionDna.length > 0
      ? built.solutionDna
      : built.plan.map(s => String(s.skill || '').toUpperCase());

    return {
      blueprintId: built.blueprintId || bp.id,
      layoutType: built.layoutType || bp.layoutAlias || bp.id,
      variantName: built.variantName || bp.label || bp.id,
      gimmickLabel: built.gimmickLabel || bp.label || bp.id,
      goalVault: built.blueprintId || bp.id,
      frontChain: 'macro',
      decoyCount: 0,
      usedIds: [built.blueprintId || bp.id],
      allTags: tags,
      startDir: dir,
      pal,
      biome: BIOMES[pal],
      elements: built.elements,
      spawnX: built.spawnX,
      spawnY: built.spawnY,
      gateX: built.gateX,
      gateY: built.gateY,
      skills,
      plan: built.plan,
      solutionDna,
      hint: built.hint || ''
    };
  }

  function scoreDifficulty(cand, tier, simMetrics = null) {
    const sol = cand.solutionDna;
    const uniqueSkills = new Set(sol).size;
    let transitions = 0;
    for (let i = 1; i < sol.length; i++) {
      if (sol[i] !== sol[i - 1]) transitions++;
    }
    const tags = new Set(cand.allTags);
    const totalSkillCount = Object.values(cand.skills).reduce((a, b) => a + b, 0);
    const spareRatio = Math.max(0, totalSkillCount - cand.plan.length);
    const greedyRescued = simMetrics && simMetrics.rgreedy ? simMetrics.rgreedy.rescued : 0;
    const totalUnits = simMetrics && simMetrics.totalUnits ? simMetrics.totalUnits : Math.max(1, tier.units);
    const greedyFailBonus = simMetrics && simMetrics.rgreedy
      ? Math.round((1 - (greedyRescued / Math.max(1, totalUnits))) * 30)
      : 0;

    const score = Math.max(20, Math.min(200, Math.round(
      sol.length * 10 +
      uniqueSkills * 9 +
      transitions * 6 +
      (tags.has('fatal_drop') ? 12 : 0) +
      (tags.has('pioneer_split') ? 14 : 0) +
      (tags.has('reverse_bridge') ? 12 : 0) +
      (tags.has('reverse_entry') ? 12 : 0) +
      (tags.has('double_reversal') ? 14 : 0) +
      (tags.has('jumppad_puzzle') ? 12 : 0) +
      (tags.has('double_pad') ? 12 : 0) +
      (tags.has('drop_chute') ? 10 : 0) +
      (tags.has('timing') ? 12 : 0) +
      (tags.has('half_steel') ? 12 : 0) +
      (tags.has('no_block_pit') ? 16 : 0) +
      (tags.has('beam_skate') ? 10 : 0) +
      (tags.has('moving_platform') ? 10 : 0) +
      (tags.has('decoy_branch') ? 6 : 0) +
      (tags.has('decoy_jumppad') ? 6 : 0) +
      (tags.has('backdoor') ? 12 : 0) +
      greedyFailBonus +
      (tier.needPercent - 50) * 0.6 -
      Math.min(12, spareRatio * 1.2)
    )));

    return {
      score,
      factors: {
        steps: sol.length,
        uniqueSkills,
        transitions,
        spareSkills: spareRatio,
        needPercent: tier.needPercent,
        greedyRescued,
        blueprint: cand.blueprintId,
        tags: cand.allTags
      }
    };
  }

  function buildBriefingDesc(cand, tier) {
    const tags = new Set(cand.allTags);
    const clues = [];
    if (tags.has('jumppad_puzzle')) clues.push('점프패드 진입 잠금을 풀기 위해 우회·역진입 경로를 찾으십시오.');
    if (tags.has('double_reversal') || tags.has('uturn')) clues.push('일방향 직진이 막혀 있습니다. 강철 벽 반사를 이용한 방향 전환이 필수입니다.');
    if (tags.has('no_block_pit')) clues.push('방어막 없이 지형 가두리와 타이밍 개척으로 본대를 해방하십시오.');
    if (tags.has('reverse_bridge')) clues.push('외부 장벽 반사 후 역방향 층간 계단을 연결하십시오.');
    if (tags.has('pioneer_split')) clues.push('선발대와 본대의 역할을 분리해 미끼 함정을 피하십시오.');
    if (tags.has('half_steel')) clues.push('하프-스틸 장벽은 레이저가 통하지 않으니 코어 폭파 타이밍이 필요합니다.');
    if (clues.length === 0) clues.push('출구 진입 방향을 먼저 거꾸로 추적해 진짜 루트를 개척하십시오.');
    return `[${tier.name}] ${clues.slice(0, 2).join(' ')}`;
  }

  const StageForge = {
    TIER_SPECS,

    generate(options = {}) {
      const ForgeSim = getSim();
      const { auditLayout } = getForgeLib();
      const tier = resolveTier(options.difficulty);
      const maxAttempts = options.maxAttempts || 24;
      const baseSeed = options.seed != null
        ? (options.seed >>> 0)
        : ((((Math.random() * 1e9) | 0) ^ (Date.now() & 0x7fffffff)) >>> 0);

      let lastFail = '';

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const seed = (baseSeed + attempt * 7919) >>> 0;
        const R = makeRNG(seed);
        const cand = assembleCandidate(tier, R, options);
        if (!cand) { lastFail = 'assemble_null'; continue; }

        const level = {
          id: options.id || 'FORGE',
          difficulty: tier.key,
          title: `[${tier.name}] ${R.pick(SECTOR_NAMES)}`,
          desc: buildBriefingDesc(cand, tier),
          bgImg: R() < 0.7 ? cand.biome.bg : cand.biome.altBg,
          terrainTheme: cand.pal,
          biome: cand.biome.biome,
          totalUnits: tier.units,
          needPercent: tier.needPercent,
          spawnRate: tier.spawnRate,
          timeLimit: Math.min(280, Math.max(130, 80 + cand.solutionDna.length * 22 + (tier.tierIdx <= 1 ? 40 : 0))),
          spawnX: cand.spawnX,
          spawnY: cand.spawnY,
          gateX: cand.gateX,
          gateY: cand.gateY,
          skills: cand.skills,
          elements: cand.elements,
          solutionDna: cand.solutionDna,
          seed
        };

        // 1) 공간·헤드룸·클리어런스·포탈0 구조 감사
        const audit = auditLayout(level);
        if (!audit.ok) {
          lastFail = `audit(${cand.blueprintId}:${audit.reasons.join(',')})`;
          continue;
        }

        // 2) ForgeSim 준비 및 0-스킬(방치 클리어) 차단 검증
        const prep = ForgeSim.prepare(level);
        const r0 = ForgeSim.run(prep, []);
        if (tier.requireZeroZero ? (r0.rescued > 0) : r0.cleared) {
          lastFail = `zero_skill(${cand.blueprintId}:rescued=${r0.rescued})`;
          continue;
        }

        // 3) 정석 해법 실물리 검증 (fullRun 으로 최대 구출 수 측정)
        const rg = ForgeSim.run(prep, cand.plan, { skills: level.skills, fullRun: true });
        if (!rg.cleared || rg.stepsApplied < cand.plan.length || (rg.applied && rg.applied.length < cand.plan.length)) {
          lastFail = `golden_fail(${cand.blueprintId}:dir=${cand.startDir},rescued=${rg.rescued}/${rg.need},steps=${rg.stepsApplied}/${cand.plan.length})`;
          continue;
        }

        if (tier.tierIdx >= 3) {
          const slack = tier.tierIdx === 3 ? 2 : (tier.tierIdx === 4 ? 1 : 0);
          const exactNeed = Math.max(rg.need, rg.rescued - slack);
          level.needPercent = Math.min(95, Math.max(tier.needPercent, Math.floor((exactNeed * 100) / level.totalUnits)));
          rg.need = Math.ceil(level.totalUnits * level.needPercent / 100);
        }

        // 4) 단일 스킬 스팸 및 웜홀 직상단 숏컷 날먹 차단 (Normal+)
        if (tier.allowCheeseCheck) {
          let cheesed = false;
          const gateProbes = [
            { x: level.gateX,      y: level.gateY - 80, r: 30, yTol: 120 },
            { x: level.gateX - 20, y: level.gateY - 80, r: 30, yTol: 120 },
            { x: level.gateX + 20, y: level.gateY - 80, r: 30, yTol: 120 }
          ];

          for (const sk of ['drill', 'mine', 'bomb', 'bash', 'build']) {
            if (!(level.skills[sk] > 0)) continue;
            const spam = Array.from({ length: Math.min(3, level.skills[sk]) }, () => ({ skill: sk, unit: 'lead', wait: 35 }));
            const rc = ForgeSim.run(prep, spam, { skills: level.skills, stallTicks: 480 });
            if (rc.cleared) { cheesed = `spam_${sk}`; break; }

            if ((sk === 'drill' || sk === 'mine' || sk === 'bomb') && cand.solutionDna.length >= 2) {
              for (const gp of gateProbes) {
                const rp = ForgeSim.run(prep, [{ skill: sk, unit: 'lead', at: gp }], { skills: level.skills, stallTicks: 700 });
                if (rp.cleared) { cheesed = `probe_${sk}`; break; }
              }
              if (cheesed) break;
            }
          }
          if (cheesed) {
            lastFail = `cheese(${cand.blueprintId}:${cheesed})`;
            continue;
          }
        }

        // 5) 직관 봇(Greedy Bot) 검증: Hard+ 는 직관 봇이 클리어 불가해야 통과
        const rgreedy = ForgeSim.runGreedy(prep, { skills: level.skills, stallTicks: 600 });
        if (tier.tierIdx >= 3 && rgreedy.cleared) {
          lastFail = `greedy_cleared(${cand.blueprintId}:${rgreedy.rescued})`;
          continue;
        }
        if (tier.tierIdx >= 5 && rgreedy.rescued > Math.floor(level.totalUnits * 0.45)) {
          lastFail = `greedy_high(${cand.blueprintId}:${rgreedy.rescued}/${level.totalUnits})`;
          continue;
        }

        const diffInfo = scoreDifficulty(cand, tier, { r0, rg, rgreedy, totalUnits: level.totalUnits });
        level.difficultyScore = diffInfo.score;
        level.difficultyFactors = diffInfo.factors;

        level._meta = {
          generator: 'StageForge-v4',
          architecture: 'backward-chaining',
          architecturalFeaturesIntegrated: true,
          seed,
          tier: tier.key,
          blueprint: cand.blueprintId,
          goalVault: cand.goalVault || cand.blueprintId,
          frontChain: cand.frontChain || 'macro',
          decoyCount: cand.decoyCount || 0,
          layoutType: cand.layoutType,
          variantName: cand.variantName,
          gimmickLabel: cand.gimmickLabel,
          modules: cand.usedIds,
          tags: cand.allTags,
          dir: cand.startDir === 1 ? 'LTR' : 'RTL',
          attempt: attempt + 1,
          simVerified: true,
          forgeSim: {
            rescued: rg.rescued,
            total: rg.total,
            need: rg.need,
            ticks: rg.ticks,
            zeroRescued: r0.rescued,
            greedyRescued: rgreedy.rescued,
            stepsApplied: rg.stepsApplied,
            stepsTotal: cand.plan.length
          },
          hint: cand.hint || `${cand.variantName} (${cand.gimmickLabel}) | 흐름: ${cand.solutionDna.join(' → ')}`,
          goldenPlan: cand.plan
        };

        return level;
      }

      throw new Error(`StageForge: ${maxAttempts}회 시도 후 검증 통과 맵 생성 실패 (tier=${tier.key}, last=${lastFail})`);
    }
  };

  root.StageForge = StageForge;
  if (typeof module !== 'undefined' && module.exports) module.exports = { StageForge, TIER_SPECS };
})(typeof self !== 'undefined' ? self : (typeof globalThis !== 'undefined' ? globalThis : this));
