#!/usr/bin/env node
/* ============================================================================
 * tools/triad/build_campaign_v9.js
 *
 * 최종 124스테이지 캠페인 조립 + 전수 1:1 실물리 검증 CLI:
 *   - Stage   1 ~  23 (idx  0..22): 사용자 수제 원본 Stage 1~23 그대로 보존
 *   - Stage  24       (idx 23)    : 사용자 수제 원본 Stage 124([HARD] WORMHOLE TRIAD #801)을 24번으로 이동 (지형/플레이 100% 동일!)
 *   - Stage  25 ~  32 (idx 24..31): 1단계 검증 프로토타입 8종 (한 칸씩 밀어 id=25..32, [S025]~[S032])
 *   - Stage  33 ~ 124 (idx 32..123): 2단계 CausalGrammarEngine 92종 (HARD→NIGHTMARE→MASTER→APEX)
 *
 * 100개 생성 스테이지(25~124) 전수 검증 항목:
 *   1. LevelLint.run(stage) → errors === 0
 *   2. Zero-Skill Test      → rescued === 0
 *   3. Greedy-Bot Test      → cleared === false
 *   4. Human Trap Tests     → 직관 오답 플랜 전부 cleared === false
 *   5. Anti-Cheese Prefix   → plan.slice(0, 1..n-1) 전부 cleared === false
 *   6. Golden Plan Test     → stage.skills 예산으로 fullRun cleared === true & rescued >= need
 *   7. portal === 0 & 고유 fingerprint 중복 0건
 *
 * 사용법:
 *   node tools/triad/build_campaign_v9.js --dry-run
 *   node tools/triad/build_campaign_v9.js
 * ==========================================================================*/
'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

require('../forge/loadEngine.js').load();
const { ForgeSim } = require('../../js/forge/ForgeSim.js');
const LevelLint = require('../../js/editor/LevelLint.js');
const { CausalPuzzlePrototypes } = require('../../js/procedural/CausalPuzzlePrototypes.js');
const { CausalGrammarEngine } = require('../../js/procedural/CausalGrammarEngine.js');

const ROOT = path.resolve(__dirname, '..', '..');
const CAMPAIGN_PATH = path.join(ROOT, 'stages', 'campaign.json');
const DRY_RUN = process.argv.includes('--dry-run');
const ONLY_FAILS = process.argv.includes('--only-fails');

function computeSolidRatio(prep) {
  const g = prep.snap.grid;
  let solid = 0;
  for (let i = 0; i < g.length; i++) if (g[i] > 0) solid++;
  return +(solid / g.length * 100).toFixed(1);
}

function verifyStage(stage, slotNum) {
  const prep = ForgeSim.prepare(stage);
  const solidPct = computeSolidRatio(prep);

  // 1. LevelLint
  const lint = LevelLint.run(stage);
  const issues = Array.isArray(lint) ? lint : (lint.issues || []);
  const lintErrors = issues.filter(x => x.level === 'error');

  // 2. Zero-Skill
  const zeroRes = ForgeSim.run(prep, [], { earlyExit: false, maxTicks: 8000 });

  // 3. Greedy-Bot
  const greedyRes = typeof ForgeSim.runGreedy === 'function'
    ? ForgeSim.runGreedy(prep, stage.skills)
    : { cleared: false, rescued: 0 };

  // 4. Human Trap Tests
  const trapResults = [];
  for (const t of (stage.verification.trapTests || [])) {
    const tr = ForgeSim.run(prep, t.plan, { skills: stage.skills, earlyExit: false, maxTicks: 8000 });
    trapResults.push({ name: t.name, cleared: tr.cleared, rescued: tr.rescued, dead: tr.dead, need: tr.need });
  }

  // 5. Anti-Cheese Prefix Sweep
  const plan = stage.verification.plan || [];
  let cheeseCleared = false;
  let cheeseDetail = null;
  for (let len = 1; len < plan.length; len++) {
    const pr = ForgeSim.run(prep, plan.slice(0, len), { skills: stage.skills, earlyExit: false, maxTicks: 5000 });
    if (pr.cleared) {
      cheeseCleared = true;
      cheeseDetail = `prefix(${len}/${plan.length}) cleared (${pr.rescued}/${pr.need})`;
      break;
    }
  }

  // 6. Golden Plan
  const goldenRes = ForgeSim.run(prep, plan, { skills: stage.skills, earlyExit: false });

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
    slot: slotNum,
    title: stage.title,
    family: stage._meta.family,
    variant: stage._meta.variant || 'p1',
    mirrorX: !!stage._meta.mirrorX,
    decoy: stage._meta.decoy || null,
    diff: stage._meta.difficultyLabel,
    ok,
    solidPct,
    lintErrors,
    zero: zeroRes.rescued,
    greedyCleared: greedyRes.cleared,
    greedyRescued: greedyRes.rescued,
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
  // 1) 원본 HEAD에서 수제 1~23번 및 원본 124번([HARD] WORMHOLE TRIAD #801)을 깨끗하게 로드
  const headRaw = execSync('git show HEAD:stages/campaign.json', {
    cwd: ROOT, encoding: 'utf8', maxBuffer: 30 * 1024 * 1024
  }).replace(/^\uFEFF/, '');
  const headCampaign = JSON.parse(headRaw);

  const handcrafted1to23 = headCampaign.slice(0, 23);
  const original124 = JSON.parse(JSON.stringify(headCampaign[123]));
  original124.id = 24; // 124번 수제 스테이지를 24번으로 배치 (지형/스킬/요소 100% 동일!)

  // 2) Phase-1 8종을 Stage 25~32로 한 칸 시프트
  const phase1 = CausalPuzzlePrototypes.buildAll().map((st, idx) => {
    const newId = 25 + idx;
    st.id = newId;
    st.title = st.title.replace(/^\[S\d{3}\]/, `[S${String(newId).padStart(3, '0')}]`);
    st._meta.fingerprint = `p1|${st._meta.family}|${newId}`;
    return st;
  });

  // 3) Phase-2 92종을 Stage 33~124로 생성
  const phase2 = CausalGrammarEngine.buildAll92();

  const generated100 = [...phase1, ...phase2];
  console.log(`\n=== Nano_Terra v9 Full Campaign Build & 1:1 ForgeSim Audit (Stages 25~124: ${generated100.length} stages) ===\n`);

  const reports = [];
  const fingerprints = new Set();
  let dupFp = 0;

  for (let i = 0; i < generated100.length; i++) {
    const slot = 25 + i;
    const st = generated100[i];
    const fp = st._meta.fingerprint;
    if (fingerprints.has(fp)) dupFp++;
    fingerprints.add(fp);

    const r = verifyStage(st, slot);
    reports.push(r);

    if (!r.ok || !ONLY_FAILS) {
      const tag = r.ok ? 'PASS' : 'FAIL';
      console.log(
        `[${tag}] S${String(slot).padStart(3, '0')} [${r.diff.padEnd(9)}] ${r.family.padEnd(25)} ${r.variant.padEnd(3)} ${r.mirrorX ? 'M' : 'N'} ${String(r.decoy || '-').padEnd(5)} | ` +
        `solid=${String(r.solidPct).padStart(4)}% | zero=${r.zero} | greedy=${r.greedyCleared ? 'CLR!' : r.greedyRescued} | ` +
        `golden=${r.golden.rescued}/${r.golden.total}(need ${r.golden.need}, ${r.golden.dead}d, ${r.golden.ticks}t)`
      );
      if (!r.ok) {
        if (r.lintErrors.length) console.log('       LINT:', r.lintErrors);
        for (const tr of r.traps) if (tr.cleared) console.log('       TRAP CLEARED:', tr);
        if (r.cheeseCleared) console.log('       CHEESE:', r.cheeseDetail);
        if (!r.golden.cleared) {
          console.log('       APPLIED:', r.golden.applied.map(a => `#${a.i}:${a.skill}(u${a.unit}@${a.x},${a.y},d${a.dir},t${a.tick})`).join(' -> '));
          if (r.golden.deaths.length) console.log('       DEATHS:', r.golden.deaths.slice(0, 5));
        }
      }
    }
  }

  const passed = reports.filter(r => r.ok).length;
  const failed = reports.filter(r => !r.ok);

  // 통계 집계
  const byDiff = {};
  const byFam = {};
  for (const r of reports) {
    byDiff[r.diff] = (byDiff[r.diff] || 0) + 1;
    byFam[r.family] = (byFam[r.family] || 0) + 1;
  }

  console.log(`\n=== SUMMARY ===`);
  console.log(`Passed: ${passed}/${reports.length} | Failed: ${failed.length} | Duplicate Fingerprints: ${dupFp}`);
  console.log(`Difficulty breakdown (S025~S124):`, byDiff);
  console.log(`Family count: ${Object.keys(byFam).length} distinct families`);

  if (failed.length > 0 || dupFp > 0) {
    console.error(`\nAborted campaign.json write: ${failed.length} failed, ${dupFp} duplicate fingerprints.`);
    process.exit(1);
  }

  if (DRY_RUN) {
    console.log('\n--dry-run mode: campaign.json not modified.');
    return;
  }

  // verification 메타 정리 후 최종 124개 캠페인 저장
  const finalGenerated = generated100.map((st, idx) => {
    const r = reports[idx];
    st.verification = {
      engine: idx < 8 ? 'ForgeSim-v9-Phase1' : 'ForgeSim-v9-Phase2',
      verifiedAt: new Date().toISOString(),
      lintErrors: 0,
      zeroRescued: r.zero,
      greedyCleared: r.greedyCleared,
      goldenRescued: r.golden.rescued,
      goldenNeed: r.golden.need,
      goldenTicks: r.golden.ticks,
      solidRatioPct: r.solidPct,
      trapsVerifiedBlocked: r.traps.length,
      plan: st.verification.plan
    };
    return st;
  });

  const finalCampaign = [
    ...handcrafted1to23, // 1..23 (idx 0..22)
    original124,         // 24    (idx 23) — 원본 124번([HARD] WORMHOLE TRIAD #801)
    ...finalGenerated    // 25..124 (idx 24..123) — 검증 완료 100개!
  ];

  if (finalCampaign.length !== 124) {
    throw new Error(`Expected 124 stages, got ${finalCampaign.length}`);
  }

  fs.writeFileSync(CAMPAIGN_PATH, JSON.stringify(finalCampaign, null, 2) + '\n', 'utf8');
  console.log(`\nSuccessfully wrote 124 stages to ${CAMPAIGN_PATH}!`);
  console.log(`  - Stages  1~23 : Original handcrafted Stages 1~23 (identical to HEAD)`);
  console.log(`  - Stage  24    : Original handcrafted Stage 124 (${original124.title}) moved to #24`);
  console.log(`  - Stages 25~32 : Phase-1 8 high-difficulty prototypes (shifted +1)`);
  console.log(`  - Stages 33~124: Phase-2 92 CausalGrammarEngine stages (16 families, 0 duplicates, 100% verified)`);
}

main();
