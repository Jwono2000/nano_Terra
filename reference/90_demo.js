/* ============================================================================
 * 90_demo.js — 참조 구현 검증/벤치마크 (Node 실행)
 *   node 90_demo.js bench   : 생성 파이프라인 성능/성공률 측정
 *   node 90_demo.js map N   : N번 시드로 맵 생성 + ASCII 렌더 + 검증 리포트
 *   node 90_demo.js sweep   : 난이도 밴드 스윕(목표 vs 실측)
 *   node 90_demo.js batch   : 연속 스테이지 배치 생성 + 감사 메트릭
 * ==========================================================================*/
const C = require('./00_core.js');
const WK = require('./01_walker.js');
const PL = require('./02_planner.js');
const PR = require('./03_probe.js');
const EN = require('./04_engine.js');

const hr = () => process.hrtime.bigint();
const ms = (a, b) => Number(b - a) / 1e6;

function ascii(grid, plan, map) {
  const cols = 100, rows = 38;
  const sx = C.W / cols, sy = C.H / rows;
  const buf = [];
  for (let j = 0; j < rows; j++) {
    let line = '';
    for (let i = 0; i < cols; i++) {
      let ch = '.';
      let solid = 0, steel = 0, built = 0;
      for (let y = Math.floor(j * sy); y < Math.floor((j + 1) * sy); y++) {
        for (let x = Math.floor(i * sx); x < Math.floor((i + 1) * sx); x++) {
          const v = grid.get(x, y);
          if (v === C.STEEL) steel++; else if (v === C.BUILT) built++; else if (v === C.DESTRUCTIBLE) solid++;
        }
      }
      if (steel) ch = 'S';
      else if (built) ch = 'B';
      else if (solid > (sx * sy) * 0.55) ch = '#';
      else if (solid > 2) ch = '+';
      else if (solid > 0) ch = ':';
      line += ch;
    }
    buf.push(line);
  }
  // 오버레이: 스폰/게이트/트리거
  const put = (x, y, ch) => {
    const i = Math.floor(x / sx), j = Math.floor(y / sy);
    if (i >= 0 && i < cols && j >= 0 && j < rows) buf[j] = buf[j].slice(0, i) + ch + buf[j].slice(i + 1);
  };
  for (const t of plan.triggers) put(t.x, t.y - 6, t.skill[0]);
  put(map.spawnX, map.spawnY, '@');
  put(map.gateX, map.gateY, 'G');
  if (plan.portals) { put(plan.portals.a.x, plan.portals.a.y - 6, 'o'); put(plan.portals.b.x, plan.portals.b.y - 6, 'o'); }
  return buf.join('\n');
}

function cmdMap(seed, opts = {}) {
  const gen = new EN.NanoTerraGenerator({ timeBudgetMs: 400, validator: { units: 5, trials: { scripted: 1, reactive: 2, passive: 1 } } });
  const t0 = hr();
  const map = gen.generate({ seed, score: opts.score != null ? opts.score : 72, biome: opts.biome, dna: opts.dna, stageNo: opts.stageNo || 11 });
  const t = ms(t0, hr());

  const ctx = map._ctx || {};
  const plan = ctx.plan, grid = ctx.grid;

  console.log('='.repeat(104));
  console.log(`TITLE      : ${map.title}`);
  console.log(`BIOME/LAY  : ${map.biome} / ${map.layoutType}`);
  console.log(`DIFF       : ${map.difficultyScore} (factors: ${JSON.stringify(map.difficultyFactors)})`);
  console.log(`DNA        : ${map.solutionDna.join(' → ')}`);
  console.log(`UNITS/NEED : ${map.totalUnits} / ${map.needPercent}%   TIME ${map.timeLimit}s   SPAWN_RATE ${map.spawnRate}`);
  console.log(`SKILLS     : ${JSON.stringify(map.skills)}`);
  console.log(`SPAWN/GATE : (${map.spawnX},${map.spawnY}) → (${map.gateX},${map.gateY})`);
  console.log(`ELEMENTS   : ${map.elements.length}   genTime ${t.toFixed(1)}ms   validation ${JSON.stringify(map._meta.validation)}`);
  console.log('-'.repeat(104));
  console.log(ascii(grid, plan, map));
  console.log('-'.repeat(104));
  console.log('patch log:', JSON.stringify((ctx.patcher && ctx.patcher.log.slice(0,10)) || []));
  console.log('legend: #지형 +지형 :얕은지형 S강철 B건설물 @스폰 G게이트 o포탈 / 트리거=F(float) B(bash) D(drill) C(climb) M(mine) B(build)');
  console.log('sample element JSON:');
  console.log(JSON.stringify(map.elements.slice(0, 3), null, 1));
  return map;
}

function cmdBench(n = 120, score = null) {
  const gen = new EN.NanoTerraGenerator({ timeBudgetMs: 90, validator: { units: 5, trials: { scripted: 1, reactive: 2, passive: 1 } } });
  const times = [], scores = [], oks = [], fb = [];
  let okCount = 0, patched = 0, attempts = 0;
  for (let i = 0; i < n; i++) {
    const s = score != null ? score : 15 + (i % 12) * 11;
    const t0 = hr();
    const map = gen.generate({ seed: 1000 + i * 37, score: s, stageNo: 11 + i });
    const t = ms(t0, hr());
    times.push(t); scores.push(map.difficultyScore);
    const isFb = !!(map._meta && map._meta.fallback);
    fb.push(isFb ? map._meta.fallback : null);
    if (!isFb) okCount++;
    if (map._meta && map._meta.validation) oks.push(map._meta.validation.scripted);
    attempts += (map._meta && map._meta.validation && map._meta.validation.attempts) || 1;
  }
  times.sort((a, b) => a - b);
  const pct = p => times[Math.min(times.length - 1, Math.floor(times.length * p))].toFixed(1);
  console.log(`\n[BENCH] n=${n}  timeBudget=90ms`);
  console.log(`  gen time  min ${times[0].toFixed(1)}ms / p50 ${pct(0.5)}ms / p95 ${pct(0.95)}ms / max ${times[times.length - 1].toFixed(1)}ms`);
  console.log(`  success(first-class validated): ${okCount}/${n} = ${(100 * okCount / n).toFixed(1)}%`);
  console.log(`  fallback kinds: ${JSON.stringify(fb.filter(Boolean).reduce((a, k) => (a[k] = (a[k] || 0) + 1, a), {}))}`);
  console.log(`  avg attempts per map: ${(attempts / n).toFixed(2)}   total probe patches: ${gen.stats.patches}`);
  console.log(`  score error(target vs measured): mean ${mean(scores.map((s, i) => Math.abs(s - (score != null ? score : 15 + (i % 12) * 11)))).toFixed(1)}`);
  console.log(`  scripted clear rate mean: ${mean(oks).toFixed(2)}`);
}
function mean(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0; }

function cmdSweep() {
  console.log('\n[SWEEP] target → measured (n=14 each)');
  console.log('  target | measured mean | min | max | σ | success');
  for (let t = 15; t <= 135; t += 20) {
    const gen = new EN.NanoTerraGenerator({ timeBudgetMs: 90 });
    const vals = []; let ok = 0;
    for (let i = 0; i < 14; i++) {
      const m = gen.generate({ seed: 7000 + t * 31 + i, score: t });
      vals.push(m.difficultyScore);
      if (!(m._meta && m._meta.fallback)) ok++;
    }
    const mu = mean(vals), sd = Math.sqrt(mean(vals.map(v => (v - mu) ** 2)));
    console.log(`  ${String(t).padStart(6)} | ${mu.toFixed(1).padStart(13)} | ${Math.min(...vals).toString().padStart(3)} | ${Math.max(...vals).toString().padStart(3)} | ${sd.toFixed(1).padStart(4)} | ${(100 * ok / 14).toFixed(0)}%`);
  }
}

function cmdBatch() {
  const gen = new EN.NanoTerraGenerator({ timeBudgetMs: 90 });
  const meta = new EN.MetaGenerator(gen, { window: 5 });
  const t0 = hr();
  const res = meta.batch({
    seed: 20260908, startStage: 11, stages: 16, from: 22, to: 128, curve: 'ease',
    skillPool: ['CLIMB', 'FLOAT', 'BASH', 'MINE', 'DRILL', 'BOMB', 'BUILD', 'BLOCK', 'PORTAL']
  });
  console.log(`\n[BATCH] 16 stages in ${ms(t0, hr()).toFixed(0)}ms`);
  console.log('  stage | diff | biome            | layout   | DNA');
  res.stages.forEach((s, i) => {
    console.log(`  ${String(11 + i).padStart(5)} | ${String(s.difficultyScore).padStart(4)} | ${s.biome.padEnd(16)} | ${s.layoutType.padEnd(8)} | ${s.solutionDna.join('+')}`);
  });
  console.log('  audit:', JSON.stringify(res.metrics, null, 1));
}

const [, , cmd, a, b] = process.argv;
if (cmd === 'map') cmdMap(parseInt(a || '42', 10), { score: b ? parseInt(b, 10) : null });
else if (cmd === 'bench') cmdBench(parseInt(a || '120', 10), b ? parseInt(b, 10) : null);
else if (cmd === 'sweep') cmdSweep();
else if (cmd === 'batch') cmdBatch();
else { cmdMap(42, { score: 72 }); cmdBench(60); }
