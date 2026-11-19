#!/usr/bin/env node
/* ============================================================================
 * tools/triad/generate_triad_stages.js
 *
 * v8 "Mystery Triad & Emergent Maze" 대량 스테이지 생성 & 1:1 실물리 검증 CLI
 *
 * 기본 동작:
 *   stages/campaign.json 의 1~23번 및 124번 스테이지는 그대로 유지하고,
 *   24번~123번 (100개) 스테이지를 HARD 이상(hard/nightmare/master/apex)으로
 *   FullCanvasLevelArchitect(v8 TriadMazeBuilder) + ForgeSim 1:1 실물리 검증을 거쳐 생성·교체합니다.
 *
 * 사용법:
 *   node tools/triad/generate_triad_stages.js
 *   node tools/triad/generate_triad_stages.js --seed 88001 --start 24 --count 100
 * ==========================================================================*/
'use strict';

const fs = require('fs');
const path = require('path');

require('../forge/loadEngine.js').load();
const { ForgeSim } = require('../../js/forge/ForgeSim.js');
const LevelLint = require('../../js/editor/LevelLint.js');
global.ForgeSim = ForgeSim;
global.LevelLint = LevelLint;

const {
  FullCanvasLevelArchitect,
  TriadMazeBuilder,
  DIFF_SPECS,
  TRIAD_FAMILIES
} = require('../../js/procedural/FullCanvasLevelArchitect.js');
global.FullCanvasLevelArchitect = FullCanvasLevelArchitect;
global.TriadMazeBuilder = TriadMazeBuilder;

const { ProceduralMapEngine } = require('../../js/procedural/ProceduralMapEngine.js');

const PALETTES = ['cyan', 'red', 'purple', 'brown', 'green'];
const BG_BY_PALETTE = {
  cyan:   ['assets/bg_level_1.jpg', 'assets/bg_level_6.jpg'],
  red:    ['assets/bg_level_2.jpg', 'assets/bg_level_7.jpg'],
  purple: ['assets/bg_level_3.jpg', 'assets/bg_level_8.jpg'],
  brown:  ['assets/bg_level_4.jpg', 'assets/bg_level_9.jpg'],
  green:  ['assets/bg_level_5.jpg', 'assets/bg_level_1.jpg']
};

const HARDPLUS_CURVE = [
  { key: 'hard',      count: 25 },
  { key: 'nightmare', count: 30 },
  { key: 'master',    count: 25 },
  { key: 'apex',      count: 20 }
];

function parseArgs(argv) {
  const args = {
    seed: 88001,
    start: 24,
    count: 100,
    campaign: 'stages/campaign.json',
    dryRun: false
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--seed' && argv[i + 1]) args.seed = parseInt(argv[++i], 10);
    else if (a === '--start' && argv[i + 1]) args.start = parseInt(argv[++i], 10);
    else if (a === '--count' && argv[i + 1]) args.count = parseInt(argv[++i], 10);
    else if (a === '--campaign' && argv[i + 1]) args.campaign = argv[++i];
    else if (a === '--dry-run') args.dryRun = true;
  }
  return args;
}

function buildTierPlan(count) {
  const plan = [];
  if (count === 100) {
    for (const seg of HARDPLUS_CURVE) {
      for (let i = 0; i < seg.count; i++) plan.push(seg.key);
    }
    return plan;
  }
  const weights = [
    { key: 'hard', w: 0.25 },
    { key: 'nightmare', w: 0.30 },
    { key: 'master', w: 0.25 },
    { key: 'apex', w: 0.20 }
  ];
  let assigned = 0;
  for (let i = 0; i < weights.length; i++) {
    const n = (i === weights.length - 1) ? Math.max(0, count - assigned) : Math.round(count * weights[i].w);
    for (let k = 0; k < n; k++) plan.push(weights[i].key);
    assigned += n;
  }
  return plan.slice(0, count);
}

function fingerprint(stage) {
  return [
    stage._meta.family,
    stage._meta.variant,
    stage._meta.mirrorX ? 'L' : 'R',
    stage.spawnX,
    stage.spawnY,
    stage.gateX,
    stage.gateY,
    stage.terrainTheme,
    stage.difficulty
  ].join('|');
}

function main() {
  const args = parseArgs(process.argv);
  const t0 = Date.now();
  const tierPlan = buildTierPlan(args.count);

  console.log(`[TriadMaze v8 CLI] 시작: ${args.start}..${args.start + args.count - 1} (${args.count}개 HARD+ 스테이지, seed=${args.seed})`);
  console.log(`  패밀리 수: ${TRIAD_FAMILIES.length}종 | 검증: ForgeSim 1:1 실물리 + Zero-Skill + Greedy-Bot + Alternative + LevelLint`);

  const generated = [];
  const seenFingerprints = new Set();
  let retriesTotal = 0;

  for (let i = 0; i < args.count; i++) {
    const tierKey = tierPlan[i];
    const diffSpec = DIFF_SPECS[tierKey];
    // 인접 스테이지 간 패밀리/팔레트/좌우반전 중복 방지 패턴
    const family = TRIAD_FAMILIES[(i * 3 + Math.floor(i / 10)) % TRIAD_FAMILIES.length];
    const subVariant = (i + Math.floor(i / 10)) % 3;
    const mirrorX = ((i + Math.floor(i / 5)) % 2) === 1;
    const palette = PALETTES[(i + Math.floor(i / 5) * 2) % PALETTES.length];
    const bgChoices = BG_BY_PALETTE[palette];
    const theme = bgChoices[Math.floor(i / 5) % bgChoices.length];

    let picked = null;
    for (let retry = 0; retry < 12; retry++) {
      const seed = (args.seed + i * 1009 + retry * 9973) >>> 0;
      const stage = ProceduralMapEngine.generate({
        difficulty: tierKey,
        family,
        subVariant: (subVariant + retry) % 3,
        mirrorX: retry < 6 ? mirrorX : !mirrorX,
        palette,
        theme,
        seed,
        stageNo: args.start + i,
        id: args.start + i,
        includeMovingPlatform: true,
        includeOptionA: true,
        includeOptionB: true
      });

      const v = stage && stage.verification;
      const cov = stage && stage._meta && stage._meta.solidCoveragePct;
      const needUnits = Math.ceil((stage.totalUnits * stage.needPercent) / 100);
      const ok = !!(
        stage &&
        v &&
        v.solvable === true &&
        v.zeroSkillShortcut === false &&
        v.naiveBotCleared === false &&
        v.lintOk === true &&
        v.alternativeCount >= 1 &&
        stage._meta &&
        stage._meta.family === family &&
        stage.skills.portal === 0 &&
        stage.skills.float < needUnits &&
        cov >= 30.0
      );

      if (ok) {
        const fp = fingerprint(stage);
        if (!seenFingerprints.has(fp) || retry >= 6) {
          seenFingerprints.add(fp);
          picked = stage;
          break;
        }
      }
      retriesTotal++;
    }

    if (!picked) {
      throw new Error(`Stage #${args.start + i} (${tierKey}, ${family}) 생성 실패!`);
    }

    generated.push(picked);
    if ((i + 1) % 20 === 0 || i + 1 === args.count) {
      console.log(`  진행: ${i + 1}/${args.count} 완료 (${((Date.now() - t0) / 1000).toFixed(1)}s, 재시도 ${retriesTotal}회)`);
    }
  }

  // 티어 순서 → 난이도 점수 오름차순 정렬 (인접 패밀리 중복 최소화)
  generated.sort((a, b) => {
    const ta = (DIFF_SPECS[a.difficulty] || DIFF_SPECS.hard).tierIdx;
    const tb = (DIFF_SPECS[b.difficulty] || DIFF_SPECS.hard).tierIdx;
    if (ta !== tb) return ta - tb;
    if ((a.difficultyScore || 0) !== (b.difficultyScore || 0)) {
      return (a.difficultyScore || 0) - (b.difficultyScore || 0);
    }
    return (a.seed || 0) - (b.seed || 0);
  });

  // 인접 스테이지 동일 패밀리 스왑 해소 (같은 티어 내에서)
  for (let i = 1; i < generated.length; i++) {
    if (generated[i]._meta.family === generated[i - 1]._meta.family) {
      for (let j = i + 1; j < generated.length; j++) {
        if (generated[j].difficulty !== generated[i].difficulty) break;
        if (generated[j]._meta.family !== generated[i - 1]._meta.family &&
            (j + 1 >= generated.length || generated[j + 1]._meta.family !== generated[i]._meta.family)) {
          [generated[i], generated[j]] = [generated[j], generated[i]];
          break;
        }
      }
    }
  }

  // 순차 ID(24..123) 및 타이틀 부여
  generated.forEach((s, idx) => {
    const seq = args.start + idx;
    s.id = seq;
    const num = String(seq).padStart(3, '0');
    const diffTag = String(s.difficulty || 'hard').toUpperCase();
    const cleanName = String(s.title || 'SECTOR').replace(/^\[[^\]]+\]\s*/g, '').trim();
    s.title = `[S${num}] [${diffTag}] ${cleanName}`;
  });

  // 기존 campaign.json 병합 (1..23 유지 + 24..123 교체 + 124+ 유지)
  const campaignPath = path.resolve(process.cwd(), args.campaign);
  const existing = JSON.parse(fs.readFileSync(campaignPath, 'utf8').replace(/^\uFEFF/, ''));
  if (!Array.isArray(existing)) {
    throw new Error(`campaign.json must be a JSON array: ${campaignPath}`);
  }

  const prefix = existing.slice(0, args.start - 1);          // stages 1..23 (index 0..22)
  const suffix = existing.slice(args.start - 1 + args.count); // stage 124+ (index 123..)
  const finalCampaign = [...prefix, ...generated, ...suffix];

  // 최종 ID 정합성 확인
  if (prefix.length !== args.start - 1) {
    throw new Error(`Expected ${args.start - 1} prefix stages, found ${prefix.length}`);
  }

  if (!args.dryRun) {
    fs.writeFileSync(campaignPath, JSON.stringify(finalCampaign, null, 2), 'utf8');
  }

  // 상세 통계 리포트 출력
  const byTier = {};
  const byFamily = {};
  let minScore = Infinity, maxScore = -Infinity;
  let minCov = Infinity, maxCov = -Infinity;
  let totalAlts = 0, adjFamDup = 0;

  generated.forEach((s, idx) => {
    byTier[s.difficulty] = (byTier[s.difficulty] || 0) + 1;
    byFamily[s._meta.family] = (byFamily[s._meta.family] || 0) + 1;
    minScore = Math.min(minScore, s.difficultyScore);
    maxScore = Math.max(maxScore, s.difficultyScore);
    minCov = Math.min(minCov, s._meta.solidCoveragePct);
    maxCov = Math.max(maxCov, s._meta.solidCoveragePct);
    totalAlts += s.verification.alternativeCount;
    if (idx > 0 && generated[idx - 1]._meta.family === s._meta.family) adjFamDup++;
  });

  console.log('\n================================================================');
  console.log(`[TriadMaze v8 CLI] 완료! 소요 ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log(`  저장 경로: ${campaignPath}${args.dryRun ? ' (DRY-RUN)' : ''}`);
  console.log(`  전체 캠페인 구성: 총 ${finalCampaign.length}개 (기존 1~${prefix.length} + 신규 ${args.start}~${args.start + generated.length - 1} + 기존 후미 ${suffix.length}개)`);
  console.log(`  티어 분포:`, byTier);
  console.log(`  패밀리 분포:`, byFamily);
  console.log(`  난이도 점수 범위: ${minScore}pt ~ ${maxScore}pt`);
  console.log(`  암반 면적 밀도 범위: ${minCov}% ~ ${maxCov}%`);
  console.log(`  검증된 대체 해법 총합: ${totalAlts}개 (평균 ${(totalAlts / generated.length).toFixed(2)}개/맵)`);
  console.log(`  인접 동일 패밀리 중복: ${adjFamDup}건`);
  console.log('================================================================');
}

main();
