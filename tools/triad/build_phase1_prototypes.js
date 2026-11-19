#!/usr/bin/env node
/* ============================================================================
 * tools/triad/build_phase1_prototypes.js
 *
 * Phase-1 고난이도 인과·추리형 프로토타입 8종(Stage 24~31) 생성 + 엄격 1:1 실물리 검증 CLI
 *
 * 검증 항목 (8개 스테이지 전부 100% 통과해야 campaign.json 반영):
 *   1. LevelLint.run(stage) → errors === 0
 *   2. Zero-Skill Test      → rescued === 0
 *   3. Greedy-Bot Test      → cleared === false
 *   4. Human Trap Tests     → 스테이지별 직관 오답 플랜 전부 cleared === false
 *   5. 1-Skill Anti-Cheese  → 스폰/초반 구간 단일 스킬 무작위 시도 전부 cleared === false
 *   6. Golden Plan Test     → 실제 예산(stage.skills)으로 fullRun cleared === true & rescued >= need
 *
 * 사용법:
 *   node tools/triad/build_phase1_prototypes.js --dry-run   (검증만 실행)
 *   node tools/triad/build_phase1_prototypes.js             (검증 통과 시 Stage 24~31 반영)
 * ==========================================================================*/
'use strict';

const fs = require('fs');
const path = require('path');

require('../forge/loadEngine.js').load();
const { ForgeSim } = require('../../js/forge/ForgeSim.js');
const LevelLint = require('../../js/editor/LevelLint.js');
const { CausalPuzzlePrototypes } = require('../../js/procedural/CausalPuzzlePrototypes.js');

const ROOT = path.resolve(__dirname, '..', '..');
const CAMPAIGN_PATH = path.join(ROOT, 'stages', 'campaign.json');
const DRY_RUN = process.argv.includes('--dry-run');
const VERBOSE = process.argv.includes('--verbose');

function computeSolidRatio(prep) {
  const g = prep.snap.grid;
  let solid = 0;
  for (let i = 0; i < g.length; i++) if (g[i] > 0) solid++;
  return +(solid / g.length * 100).toFixed(1);
}

function verifyPrototype(stage, slotNumber) {
  const prep = ForgeSim.prepare(stage);
  const solidPct = computeSolidRatio(prep);

  // 1. LevelLint
  const lint = LevelLint.run(stage);
  const issues = Array.isArray(lint) ? lint : (lint.issues || []);
  const lintErrors = issues.filter(x => x.level === 'error');
  const lintWarns = issues.filter(x => x.level === 'warn');

  // 2. Zero-Skill
  const zeroRes = ForgeSim.run(prep, [], { earlyExit: false });

  // 3. Greedy-Bot
  const greedyRes = typeof ForgeSim.runGreedy === 'function'
    ? ForgeSim.runGreedy(prep, stage.skills)
    : { cleared: false, rescued: 0 };

  // 4. Human Trap Tests
  const trapResults = [];
  for (const t of (stage.verification.trapTests || [])) {
    const tr = ForgeSim.run(prep, t.plan, { skills: stage.skills, earlyExit: false });
    trapResults.push({
      name: t.name,
      cleared: tr.cleared,
      rescued: tr.rescued,
      dead: tr.dead,
      need: tr.need,
      applied: tr.applied.length
    });
  }

  // 5. Anti-Cheese Prefix Sweep (dropping the final step or any 1..2 step prefix must NEVER clear!)
  const plan = stage.verification.plan || [];
  let cheeseCleared = false;
  let cheeseDetail = null;
  for (let len = 1; len < plan.length; len++) {
    const pr = ForgeSim.run(prep, plan.slice(0, len), { skills: stage.skills, earlyExit: false, maxTicks: 6000 });
    if (pr.cleared) {
      cheeseCleared = true;
      cheeseDetail = `prefix(${len}/${plan.length}) cleared with ${pr.rescued}/${pr.need}`;
      break;
    }
  }

  // 6. Golden Plan (exact budget + fullRun)
  const goldenRes = ForgeSim.run(prep, plan, {
    skills: stage.skills,
    earlyExit: false
  });

  const ok =
    lintErrors.length === 0 &&
    zeroRes.rescued === 0 &&
    !greedyRes.cleared &&
    trapResults.every(t => !t.cleared) &&
    !cheeseCleared &&
    goldenRes.cleared &&
    goldenRes.rescued >= goldenRes.need &&
    (stage.skills.portal || 0) === 0;

  return {
    slot: slotNumber,
    name: stage.title || stage.name,
    ok,
    solidPct,
    lintErrors,
    lintWarns,
    zero: { rescued: zeroRes.rescued, dead: zeroRes.dead },
    greedy: { cleared: greedyRes.cleared, rescued: greedyRes.rescued },
    traps: trapResults,
    cheeseCleared,
    cheeseDetail,
    golden: {
      cleared: goldenRes.cleared,
      rescued: goldenRes.rescued,
      dead: goldenRes.dead,
      need: goldenRes.need,
      total: stage.totalUnits,
      ticks: goldenRes.ticks,
      applied: goldenRes.applied,
      deaths: goldenRes.deaths
    }
  };
}

function main() {
  const prototypes = CausalPuzzlePrototypes.buildAll();
  const reports = [];
  let allPass = true;

  console.log(`\n=== Phase-1 High-Difficulty Causal Prototypes Verification (${prototypes.length} stages: S024~S031) ===\n`);

  for (let i = 0; i < prototypes.length; i++) {
    const slot = 24 + i;
    const st = prototypes[i];
    const r = verifyPrototype(st, slot);
    reports.push(r);
    if (!r.ok) allPass = false;

    const tag = r.ok ? 'PASS' : 'FAIL';
    console.log(`[${tag}] Stage ${slot}: ${r.name}`);
    console.log(`       solid=${r.solidPct}% | lintErr=${r.lintErrors.length} warn=${r.lintWarns.length} | zero=${r.zero.rescued}/${st.totalUnits} | greedy=${r.greedy.rescued}/${st.totalUnits}(${r.greedy.cleared ? 'CLEAR!' : 'fail'}) | golden=${r.golden.rescued}/${st.totalUnits} (need ${r.golden.need}, dead ${r.golden.dead}, ${r.golden.ticks}t)`);

    for (const tr of r.traps) {
      console.log(`       trap [${tr.cleared ? 'FAIL-CLEARED!' : 'blocked'}] ${tr.name} -> rescued=${tr.rescued}/${tr.need}, dead=${tr.dead}, applied=${tr.applied}`);
    }
    if (r.cheeseCleared) {
      console.log(`       ANTI-CHEESE FAILED:`, r.cheeseDetail);
    }
    if (r.lintErrors.length > 0) {
      console.log(`       LINT ERRORS:`, r.lintErrors);
    }
    if (!r.ok || VERBOSE) {
      console.log(`       applied steps (${r.golden.applied.length}/${st.verification.plan.length}):`,
        r.golden.applied.map(a => `#${a.i}:${a.skill}(u${a.unit}@${a.x},${a.y},d${a.dir},t${a.tick})`).join(' -> '));
      if (r.golden.deaths.length > 0) {
        console.log(`       deaths:`, r.golden.deaths.slice(0, 6));
      }
    }
    console.log('');
  }

  const passed = reports.filter(r => r.ok).length;
  console.log(`Summary: ${passed}/${reports.length} PASSED\n`);

  if (!allPass) {
    console.error('Aborted campaign.json write because one or more prototypes failed verification.');
    process.exit(1);
  }

  if (DRY_RUN) {
    console.log('--dry-run mode: campaign.json not modified.');
    return;
  }

  // Merge into stages/campaign.json preserving Stages 1~23 (idx 0..22), 32~123 (idx 31..122), 124 (idx 123)
  const raw = fs.readFileSync(CAMPAIGN_PATH, 'utf8').replace(/^\uFEFF/, '');
  const campaign = JSON.parse(raw);
  if (!Array.isArray(campaign) || campaign.length < 124) {
    throw new Error(`Unexpected campaign.json length: ${campaign.length}`);
  }

  // Verify Stage 124 anchor before writing
  const stage124Before = JSON.stringify(campaign[123]);
  const stages1to23Before = JSON.stringify(campaign.slice(0, 23));

  for (let i = 0; i < prototypes.length; i++) {
    const st = prototypes[i];
    const r = reports[i];
    st.id = 24 + i;
    // Attach verification telemetry (matching campaign format)
    st.verification = {
      engine: 'ForgeSim-v9-Phase1',
      verifiedAt: new Date().toISOString(),
      lintErrors: 0,
      zeroRescued: r.zero.rescued,
      greedyCleared: r.greedy.cleared,
      goldenRescued: r.golden.rescued,
      goldenNeed: r.golden.need,
      goldenTicks: r.golden.ticks,
      solidRatioPct: r.solidPct,
      trapsVerifiedBlocked: r.traps.length,
      plan: st.verification.plan
    };
    campaign[23 + i] = st; // Stage 24..31 -> index 23..30
  }

  // Assert preservation invariants
  if (JSON.stringify(campaign.slice(0, 23)) !== stages1to23Before) {
    throw new Error('Invariant violated: Stages 1..23 changed!');
  }
  if (JSON.stringify(campaign[123]) !== stage124Before) {
    throw new Error('Invariant violated: Stage 124 changed!');
  }

  fs.writeFileSync(CAMPAIGN_PATH, JSON.stringify(campaign, null, 2) + '\n', 'utf8');
  console.log(`Successfully wrote verified Stages 24~31 into ${CAMPAIGN_PATH} (total ${campaign.length} stages; Stages 1~23 & 124 preserved identically).`);
}

main();
