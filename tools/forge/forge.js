#!/usr/bin/env node
/* ============================================================================
 * tools/forge/forge.js — 대량 스테이지 배치 생성기 (100 / 300 / 1000+ 스테이지용)
 *
 * 사용법:
 *   node tools/forge/forge.js --count 100 --out stages/forge_100.json
 *   node tools/forge/forge.js --count 300 --seed 77777 --out stages/forge_300.json
 *
 * 특징:
 * - 캐주얼(casual) → 쉬움(easy) → 보통(normal) → 어려움(hard) → 악몽(nightmare) → 마스터(master)
 *   순서로 난이도 곡선을 자동 배분하고, 실제 ForgeSim 물리 검증을 통과한 맵만 채택
 * - difficultyScore 기준 오름차순 정렬 후 Stage ID(1..N) 부여
 * ==========================================================================*/
'use strict';
const fs = require('fs');
const path = require('path');

require('./loadEngine.js').load();
const { ForgeSim } = require('../../js/forge/ForgeSim.js');
const { FORGE_MODULES, FORGE_BLUEPRINTS, auditLayout } = require('../../js/forge/ForgeModules.js');
const ForgeBackward = require('../../js/forge/ForgeBackward.js');
const { StageForge, TIER_SPECS } = require('../../js/forge/StageForge.js');

global.ForgeSim = ForgeSim;
global.FORGE_MODULES = FORGE_MODULES;
global.FORGE_BLUEPRINTS = FORGE_BLUEPRINTS;
global.auditForgeLayout = auditLayout;
global.ForgeBackward = ForgeBackward;

function parseArgs(argv) {
  const args = { count: 100, out: 'stages/forge_100.json', seed: 10000, compact: false, preset: 'standard', merge: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--count' && argv[i + 1]) args.count = Math.max(1, parseInt(argv[++i], 10));
    else if (a === '--out' && argv[i + 1]) args.out = argv[++i];
    else if (a === '--seed' && argv[i + 1]) args.seed = parseInt(argv[++i], 10);
    else if (a === '--preset' && argv[i + 1]) args.preset = argv[++i];
    else if (a === '--merge' && argv[i + 1]) args.merge = argv[++i];
    else if (a === '--compact') args.compact = true;
  }
  return args;
}

// 100 -> 300 -> 1000 스테이지 확장용 표준 난이도 분포 (캐주얼 입문 ~ 하드코어 마스터)
const PRESETS = {
  standard: [
    { key: 'casual',    weight: 0.14 },
    { key: 'easy',      weight: 0.20 },
    { key: 'normal',    weight: 0.26 },
    { key: 'hard',      weight: 0.20 },
    { key: 'nightmare', weight: 0.12 },
    { key: 'master',    weight: 0.08 }
  ],
  hardplus: [
    { key: 'hard',      weight: 0.25 },
    { key: 'nightmare', weight: 0.30 },
    { key: 'master',    weight: 0.25 },
    { key: 'apex',      weight: 0.20 }
  ]
};

function buildTierPlan(count, presetName) {
  const curve = PRESETS[presetName] || PRESETS.standard;
  const plan = [];
  let assigned = 0;
  for (let i = 0; i < curve.length; i++) {
    const n = (i === curve.length - 1)
      ? Math.max(0, count - assigned)
      : Math.round(count * curve[i].weight);
    for (let k = 0; k < n; k++) plan.push(curve[i].key);
    assigned += n;
  }
  return plan.slice(0, count);
}

function main() {
  const args = parseArgs(process.argv);
  const tierPlan = buildTierPlan(args.count, args.preset);
  const stages = [];
  const t0 = Date.now();
  let failures = 0;

  const goalList = Object.keys(ForgeBackward.GOAL_VAULTS || {});
  const frontList = Object.keys(ForgeBackward.FRONTEND_CHAINS || {});
  console.log(`[StageForge CLI] 목표 ${args.count}개 스테이지 생성 시작 (preset=${args.preset}, seed=${args.seed}, goals=${goalList.length}, fronts=${frontList.length})`);

  for (let i = 0; i < tierPlan.length; i++) {
    const tierKey = tierPlan[i];
    const targetGoal = goalList.length ? goalList[i % goalList.length] : undefined;
    const targetFront = frontList.length ? frontList[Math.floor(i / Math.max(1, goalList.length)) % frontList.length] : undefined;
    let stage = null;
    for (let retry = 0; retry < 5 && !stage; retry++) {
      const seed = (args.seed + i * 1009 + retry * 9973) >>> 0;
      const genOpts = (retry === 0 && targetGoal && targetFront)
        ? { difficulty: tierKey, goalPool: [targetGoal], frontPool: [targetFront], seed }
        : (retry === 1 && targetGoal ? { difficulty: tierKey, goalPool: [targetGoal], seed } : { difficulty: tierKey, seed });
      try {
        stage = StageForge.generate(genOpts);
      } catch (e) {
        // retry with next seed / wider pool
      }
    }
    if (!stage) {
      failures++;
      continue;
    }
    if (args.compact && stage._meta) {
      delete stage._meta.goldenPlan;
    }
    stages.push(stage);
    if ((i + 1) % 25 === 0 || i + 1 === tierPlan.length) {
      console.log(`  진행: ${i + 1}/${tierPlan.length} (${stages.length}개 성공, ${failures}개 실패, ${((Date.now() - t0) / 1000).toFixed(1)}s)`);
    }
  }

  // 티어 순서 → 난이도 점수 오름차순 정렬
  stages.sort((a, b) => {
    const ta = (TIER_SPECS[a.difficulty] || TIER_SPECS.normal).tierIdx;
    const tb = (TIER_SPECS[b.difficulty] || TIER_SPECS.normal).tierIdx;
    if (ta !== tb) return ta - tb;
    return (a.difficultyScore || 0) - (b.difficultyScore || 0);
  });

  let prefix = [];
  if (args.merge) {
    const mergePath = path.resolve(process.cwd(), args.merge);
    prefix = JSON.parse(fs.readFileSync(mergePath, 'utf8').replace(/^\uFEFF/, ''));
    if (!Array.isArray(prefix)) throw new Error(`--merge file must be a JSON array: ${mergePath}`);
    console.log(`[StageForge CLI] 기존 ${prefix.length}개 스테이지 선두 유지 후 ${stages.length}개 병합`);
  }

  // 순차 ID 및 스테이지 번호 부여
  stages.forEach((s, idx) => {
    const seq = prefix.length + idx + 1;
    s.id = seq;
    const num = String(seq).padStart(3, '0');
    const cleanTitle = String(s.title || 'SECTOR').replace(/^\[[^\]]+\]\s*/, '');
    s.title = `[S${num}] ${cleanTitle}`;
  });

  const finalStages = [...prefix, ...stages];

  const outPath = path.resolve(process.cwd(), args.out);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(finalStages, null, 2), 'utf8');

  const byTier = {};
  for (const s of stages) byTier[s.difficulty] = (byTier[s.difficulty] || 0) + 1;
  console.log(`[StageForge CLI] 완료! 저장: ${outPath}`);
  console.log(`  총 ${finalStages.length}개 (기존 ${prefix.length} + 신규 ${stages.length}, 소요 ${((Date.now() - t0) / 1000).toFixed(1)}s), 신규 티어 분포:`, byTier);
}

main();
