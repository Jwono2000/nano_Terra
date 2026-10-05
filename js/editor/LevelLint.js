/**
 * LevelLint.js — levelData(JSON)만으로 동작하는 정적 검증기 (LevelValidator.validate_geometry)
 *
 *  - 물리 시뮬레이터 없이 "지오메트리 + 밸런스 수치" 수준의 문제를 즉시 잡아냅니다.
 *  - 에디터에서 요소를 옮길 때마다 실시간으로 실행해도 가볍습니다 (O(n²) 정도, n = 요소 수).
 *  - nano_Terra의 실제 물리 규격(낙사 높이 96px, 유닛 크기 등)을 기본값으로 반영했습니다.
 *
 *  사용:
 *    const report = LevelLint.run(levelData);
 *    report.ok            // error 가 하나도 없으면 true
 *    report.issues        // [{ code, level:'error'|'warn'|'info', msg, x, y, w, h, elementIndex }]
 *    report.summary       // "에러 0 · 경고 1 · 정보 0"
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.LevelLint = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DEFAULTS = {
    width: 800,
    height: 450,
    snap: 10,
    lemmingHeight: 18,      // nano_Terra 유닛 높이 (px)
    lemmingWidth: 10,       // nano_Terra 유닛 폭 (px)
    lethalFall: 96,         // nano_Terra 치사 낙하 판정 높이 (px, NanoUnit.js maxSafeFall)
    minPassage: 18,         // 나노봇이 통과할 수 있는 최소 세로 틈
    gateFootSearch: 28,     // 웜홀 기준점 아래로 바닥을 찾는 거리
    spawnGateMinDx: 120,    // 이보다 가까우면 "너무 쉬움" 경고
    maxElements: 150,
    initialDir: 1,          // 스폰 직후 레밍 진행 방향 (+1 오른쪽)
    skillKeys: ['climb', 'float', 'bash', 'mine', 'drill', 'bomb', 'build', 'block', 'portal'],
    dnaAliases: {
      CLIMB: 'climb', CLIMBER: 'climb',
      FLOAT: 'float', FLOATER: 'float',
      BASH: 'bash', BASHER: 'bash',
      MINE: 'mine', MINER: 'mine',
      DRILL: 'drill', DIG: 'drill', DIGGER: 'drill',
      BOMB: 'bomb', BOMBER: 'bomb', EXPLODE: 'bomb',
      BUILD: 'build', BUILDER: 'build',
      BLOCK: 'block', BLOCKER: 'block',
      PORTAL: 'portal'
    },
    solidTypes: ['platform', 'steelBarrier', 'rockWall', 'craggyRock', 'volcanicBasalt', 'quantumCrystal', 'movingPlatform', 'steelPlatform', 'triangleSlope', 'diagonalBeam', 'jumpPad'],
    profileTypes: ['craggyRock', 'volcanicBasalt', 'quantumCrystal']
  };

  let CFG = Object.assign({}, DEFAULTS);

  function configure(partial) {
    CFG = Object.assign({}, CFG, partial || {});
    return CFG;
  }

  function isNum(v) { return typeof v === 'number' && !isNaN(v); }

  /** 요소의 x=px 열에서 "가장 높은 고체 픽셀의 y" (profile 타입은 세그먼트 높이 반영, 경사로는 빗면 반영) */
  function topAt(el, px) {
    if (px < el.x || px > el.x + el.w) return null;
    if (CFG.profileTypes.indexOf(el.type) >= 0 && Array.isArray(el.profile) && el.profile.length > 0) {
      const segW = el.w / el.profile.length;
      const idx = Math.min(el.profile.length - 1, Math.max(0, Math.floor((px - el.x) / segW)));
      const colH = Math.min(el.h, Math.max(0, el.profile[idx] || 0));
      return el.y + el.h - colH;
    }
    if (el.type === 'triangleSlope') {
      const relX = Math.max(0, Math.min(el.w, px - el.x));
      const t = el.w > 0 ? relX / el.w : 0;
      const dir = el.direction || 'up-right';
      if (dir === 'up-right') {
        // ◣: x=0일 때 y+h (바닥), x=w일 때 y (꼭대기)
        return el.y + el.h - t * el.h;
      } else if (dir === 'up-left') {
        // ◢: x=0일 때 y (꼭대기), x=w일 때 y+h (바닥)
        return el.y + t * el.h;
      }
      return el.y;
    }
    if (el.type === 'diagonalBeam') {
      const relX = Math.max(0, Math.min(el.w, px - el.x));
      const t = el.w > 0 ? relX / el.w : 0;
      if (el.slope === -1) {
        return el.y + (1 - t) * el.h;
      }
      return el.y + t * el.h;
    }
    return el.y;
  }

  function isSolidType(el) { return CFG.solidTypes.indexOf(el.type) >= 0; }

  function pointInside(el, px, py) {
    if (px < el.x || px > el.x + el.w || py < el.y || py > el.y + el.h) return false;
    const t = topAt(el, px);
    return t !== null && py >= t;
  }

  /** (px, fromY)에서 아래로 레이캐스트 → 첫 지형 윗면 y (없으면 null) */
  function raycastDown(elements, px, fromY) {
    let best = null;
    let bestIdx = -1;
    elements.forEach((el, i) => {
      if (!isSolidType(el)) return;
      const t = topAt(el, px);
      if (t === null) return;
      if (t >= fromY && (best === null || t < best)) { best = t; bestIdx = i; }
    });
    return best === null ? null : { y: best, index: bestIdx };
  }

  function normalizeDna(dna) {
    if (!Array.isArray(dna)) return [];
    return dna.map(token => {
      if (!token || typeof token !== 'string') return null;
      const key = token.toUpperCase();
      return CFG.dnaAliases[key] || (CFG.skillKeys.indexOf(key.toLowerCase()) >= 0 ? key.toLowerCase() : null);
    });
  }

  function run(level, opts) {
    const cfg = opts ? Object.assign({}, CFG, opts) : CFG;
    const issues = [];
    const push = (levelName, code, msg, extra) => {
      issues.push(Object.assign({ code, level: levelName, msg }, extra || {}));
    };

    if (!level || typeof level !== 'object') {
      push('error', 'E000', 'levelData가 객체가 아닙니다.');
      return finish(issues);
    }

    const elements = Array.isArray(level.elements) ? level.elements : [];
    const skills = level.skills || {};
    const W = cfg.width, H = cfg.height;

    // ---------- 1. 스키마 / 수치 ----------
    if (!Array.isArray(level.elements)) push('error', 'E001', 'elements 배열이 없습니다.');
    ['spawnX', 'spawnY', 'gateX', 'gateY'].forEach(k => {
      if (!isNum(level[k])) push('error', 'E002', `${k} 가 숫자가 아닙니다.`);
    });
    if (!(level.totalUnits > 0)) push('error', 'E003', 'totalUnits 는 1 이상이어야 합니다.');
    if (!(level.needPercent >= 1 && level.needPercent <= 100)) push('error', 'E004', 'needPercent 는 1~100 이어야 합니다.');
    if (!(level.timeLimit > 0)) push('error', 'E005', 'timeLimit 는 0보다 커야 합니다.');
    if (level.needPercent >= 95) push('info', 'I001', `구출 조건 ${level.needPercent}% — 사실상 전원 구출. 희생(bomb/block) 전략이 봉쇄됩니다.`);

    // ---------- 2. 요소 지오메트리 ----------
    elements.forEach((el, i) => {
      const box = { x: el.x, y: el.y, w: el.w, h: el.h, elementIndex: i };
      if (!isNum(el.x) || !isNum(el.y) || !isNum(el.w) || !isNum(el.h)) {
        push('error', 'E010', `#${i} ${el.type}: 좌표/크기가 숫자가 아닙니다.`, box);
        return;
      }
      if (el.x < 0 || el.y < 0 || el.x + el.w > W || el.y + el.h > H) {
        push('error', 'E011', `#${i} ${el.type}: 화면(${W}×${H}) 밖으로 벗어남.`, box);
      }
      if (el.w < cfg.snap || el.h < cfg.snap) {
        push('warn', 'W012', `#${i} ${el.type}: 너무 작음 (${el.w}×${el.h}). 선택/충돌 판정이 불안정할 수 있음.`, box);
      }
      if (!isSolidType(el)) {
        push('info', 'I013', `#${i} 알 수 없는 타입 '${el.type}' — 린트/솔버가 무시합니다.`, box);
      }
      if (cfg.profileTypes.indexOf(el.type) >= 0 && (!Array.isArray(el.profile) || el.profile.length === 0)) {
        push('warn', 'W014', `#${i} ${el.type}: profile 배열이 없음 → 사각형으로 렌더/판정될 수 있음.`, box);
      }
    });

    // 중복 요소 (완전히 같은 사각형)
    const seen = new Map();
    elements.forEach((el, i) => {
      const k = `${el.type}|${el.x}|${el.y}|${el.w}|${el.h}`;
      if (seen.has(k)) {
        push('warn', 'W015', `#${i} ${el.type}: #${seen.get(k)} 와 완전히 동일한 요소 (중복).`, { x: el.x, y: el.y, w: el.w, h: el.h, elementIndex: i });
      } else seen.set(k, i);
    });

    if (elements.length > cfg.maxElements) {
      push('warn', 'W016', `요소 ${elements.length}개 — ${cfg.maxElements}개 초과. 지형 래스터화/렌더 비용 주의.`);
    }

    // ---------- 3. 스폰 / 웜홀 ----------
    const sx = level.spawnX, sy = level.spawnY, gx = level.gateX, gy = level.gateY;
    if (isNum(sx) && isNum(sy)) {
      const inside = elements.findIndex(el => isSolidType(el) && pointInside(el, sx, sy));
      if (inside >= 0) {
        push('error', 'E020', `스폰 해치가 지형(#${inside}) 안에 묻혀 있음.`, { x: sx - 16, y: sy - 16, w: 32, h: 32 });
      } else {
        const hit = raycastDown(elements, sx, sy);
        if (!hit) {
          push('error', 'E021', '스폰 아래에 지형이 없음 → 레밍이 화면 밖으로 떨어져 전멸.', { x: sx - 16, y: sy, w: 32, h: H - sy });
        } else {
          const drop = hit.y - sy;
          if (drop > cfg.lethalFall) {
            if ((skills.float || 0) > 0) {
              push('info', 'I022', `스폰 낙하 ${drop}px > 낙사 ${cfg.lethalFall}px — 첫 레밍부터 FLOAT 필수 (의도된 오프닝인지 확인).`, { x: sx - 16, y: sy, w: 32, h: drop });
            } else {
              push('error', 'E022', `스폰 낙하 ${drop}px > 낙사 ${cfg.lethalFall}px 인데 float 스킬이 0개 → 전멸.`, { x: sx - 16, y: sy, w: 32, h: drop });
            }
          }
        }
      }
    }
    if (isNum(gx) && isNum(gy)) {
      const inside = elements.findIndex(el => isSolidType(el) && pointInside(el, gx, gy - 4));
      if (inside >= 0) {
        push('error', 'E023', `웜홀이 지형(#${inside}) 안에 묻혀 있음.`, { x: gx - 18, y: gy - 18, w: 36, h: 36 });
      } else {
        const hit = raycastDown(elements, gx, gy - 2);
        if (!hit || hit.y - gy > cfg.gateFootSearch) {
          push('warn', 'W024', `웜홀 아래 ${cfg.gateFootSearch}px 이내에 바닥이 없음 — 레밍이 서서 도달할 수 없는 공중 웜홀일 수 있음.`, { x: gx - 18, y: gy - 18, w: 36, h: 36 + cfg.gateFootSearch });
        }
      }
    }
    if (isNum(sx) && isNum(gx)) {
      const dx = gx - sx;
      if (Math.abs(dx) < cfg.spawnGateMinDx) {
        push('warn', 'W025', `스폰-웜홀 수평 거리 ${Math.abs(dx)}px — 너무 가까움 (지름길/즉시 클리어 위험).`);
      }
      if (Math.sign(dx) !== Math.sign(cfg.initialDir) && dx !== 0) {
        push('info', 'I026', '웜홀이 스폰의 진행 방향 반대편에 있음 — 레밍이 벽에 부딪혀 되돌아와야 함 (의도 확인).');
      }
    }

    // ---------- 4. 통과 불가 틈 (위/아래 겹침) ----------
    for (let i = 0; i < elements.length; i++) {
      const a = elements[i];
      if (!isSolidType(a)) continue;
      for (let j = 0; j < elements.length; j++) {
        if (i === j) continue;
        const b = elements[j];
        if (!isSolidType(b)) continue;
        const overlapX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
        if (overlapX < cfg.lemmingWidth) continue;
        const gap = b.y - (a.y + a.h);      // a 아래 b
        if (gap > 0 && gap < cfg.minPassage) {
          push('warn', 'W030', `#${i}↔#${j} 세로 틈 ${gap}px < ${cfg.minPassage}px — 레밍이 지나갈 수 없는 좁은 틈 (의도된 벽이면 무시).`,
            { x: Math.max(a.x, b.x), y: a.y + a.h, w: overlapX, h: gap });
        }
      }
    }

    // ---------- 5. DNA ↔ 스킬 예산 ----------
    const dna = normalizeDna(level.solutionDna);
    if (dna.length) {
      const need = {};
      dna.forEach(k => { if (k) need[k] = (need[k] || 0) + 1; });
      Object.keys(need).forEach(k => {
        const have = skills[k] || 0;
        if (have < need[k]) {
          push(have === 0 ? 'error' : 'warn', have === 0 ? 'E040' : 'W040',
            `솔루션 DNA가 ${k.toUpperCase()} ×${need[k]} 를 요구하지만 지급된 스킬은 ${have}개.`);
        }
      });
      const totalSkills = cfg.skillKeys.reduce((s, k) => s + (skills[k] || 0), 0);
      const slack = totalSkills - dna.length;
      if (slack >= 8) push('info', 'I041', `스킬 여유분 ${slack}개 — 넉넉함 (EASY 성향). HARD 이상이면 줄이는 것을 고려.`);
      if (slack <= 0 && dna.length >= 4) push('info', 'I042', '스킬 여유분 0 — 실수 복구 불가 (NIGHTMARE 성향).');
      if (level.solutionDna.some((g, i) => dna[i] === null)) {
        push('info', 'I043', `DNA에 알 수 없는 토큰 포함: ${level.solutionDna.filter((g, i) => dna[i] === null).join(', ')} — dnaAliases 에 추가하세요.`);
      }
    }

    return finish(issues);
  }

  function finish(issues) {
    const errors = issues.filter(i => i.level === 'error');
    const warnings = issues.filter(i => i.level === 'warn');
    const infos = issues.filter(i => i.level === 'info');
    return {
      ok: errors.length === 0,
      issues, errors, warnings, infos,
      summary: `에러 ${errors.length} · 경고 ${warnings.length} · 정보 ${infos.length}`
    };
  }

  return { run, configure, DEFAULTS, topAt, raycastDown, normalizeDna, get config() { return CFG; } };
});
