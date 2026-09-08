/* ============================================================================
 * 03_probe.js — Tier-2 검증/보정 (★Q1-d, Q5-2)
 *
 *  설계 원칙: Probe/Fixer는 "그리드"가 아니라 "plan(중간 표현)"을 읽고 고친다.
 *            → 수정 후 Assembler.build()로 재래스터라이즈하므로 plan과 grid가
 *              절대 어긋나지 않는다(동기화 버그 원천 차단). 비용은 rebuild 1회 ≈ 10ms.
 * ==========================================================================*/
(function (root, factory) {
  const C = (typeof require === 'function') ? require('./00_core.js') : root;
  const P = (typeof require === 'function') ? require('./02_planner.js') : root;
  const api = factory(C, P);
  if (typeof module === 'object' && module.exports) module.exports = api;
  Object.assign(root, api);
})(typeof self !== 'undefined' ? self : this, function (C, P) {
  'use strict';
  const { W, H, PHYS, clamp, EMPTY, DESTRUCTIBLE, STEEL, BUILT } = C;

  /* 슬랩 위에서 "구조물(벽/단차/플러그/지붕)이 아닌" 측정 지점 찾기 */
  function clearSpot(plan, s, nearX, span = 26) {
    const blocked = [];
    for (const w of plan.walls) blocked.push([w.x - 2, w.x + w.w + 2]);
    for (const st of plan.steps) blocked.push([st.x - 2, st.x + st.w + 2]);
    for (const pl of plan.plugs) blocked.push([pl.x - 2, pl.x + pl.w + 2]);
    for (const r of plan.roofs) blocked.push([r.x - 1, r.x + r.w + 1]);
    for (let d = 0; d <= span; d += 2) {
      for (const cand of [nearX - d, nearX + d]) {
        if (cand < s.x0 + 3 || cand > s.x1 - 3) continue;
        let ok = true;
        for (const b of blocked) if (cand >= b[0] && cand <= b[1]) { ok = false; break; }
        if (ok) return cand;
      }
    }
    return clamp(nearX, s.x0 + 3, s.x1 - 3);
  }

  const refSlab = (plan, i, fallbackX) => {
    if (i != null && plan.slabs[i]) return plan.slabs[i];
    if (fallbackX != null) { const s = plan.slabAt(fallbackX); if (s) return s; }
    return plan.slabs[plan.slabs.length - 1];
  };
  const findWall = (plan, role, nearX) => {
    const c = plan.walls.filter(w => w.role === role && (nearX == null || Math.abs(w.x - nearX) < 40));
    return c[0] || plan.walls.find(w => w.role === role) || null;
  };
  const findRoof = (plan, nearX) => plan.roofs.find(r => nearX == null || (r.x - 6 <= nearX && nearX <= r.x + r.w + 6)) || plan.roofs[0] || null;
  const findStep = (plan, nearX) => plan.steps.find(s => nearX == null || Math.abs(s.x - nearX) < 40) || plan.steps[0] || null;
  const findPlug = (plan, nearX) => plan.plugs.find(s => nearX == null || (s.x - 8 <= nearX && nearX <= s.x + s.w + 8)) || plan.plugs[0] || null;

  /* =====================================================================
   * Prober — 래스터라이즈된 그리드에서 "스킬 요구 조건"을 실측
   * ===================================================================*/
  class Prober {
    constructor(grid) { this.g = grid; }
    floorAt(x, fromY = 0) { return this.g.firstSolidBelow(Math.round(x), Math.round(fromY), H); }
    flatness(x0, x1) {
      let mn = 1e9, mx = -1e9;
      for (let i = Math.floor(x0); i <= Math.floor(x1); i += 2) {
        const y = this.floorAt(i, 0); if (y < 0) continue;
        mn = Math.min(mn, y); mx = Math.max(mx, y);
      }
      return mx === -1e9 ? 999 : mx - mn;
    }
    /* ★ 슬랩 기준 표면 측정: "공중 데코"를 바닥으로 오인하지 않도록
     *    slab.y-3 부터 아래로 측정(설계된 낙하 구간 위에 뜬 지형 무시)          */
    floorOfSlab(s, x) { return this.g.firstSolidBelow(Math.round(x), Math.round(s.y) - 3, H); }
    spanFloorOfSlab(s, samples = 5) {
      const xs = [];
      for (let i = 0; i <= samples; i++) xs.push(s.x0 + 6 + (s.x1 - s.x0 - 12) * (i / samples));
      const ys = xs.map(x => this.floorOfSlab(s, x)).filter(y => y >= 0);
      if (!ys.length) return -1;
      ys.sort((a, b) => a - b);
      return ys[ys.length >> 1];
    }
    /* 전방 벽: {dist, depth, steel} */
    scanAhead(x, footY, dir, maxDist = 14) {
      const y0 = Math.floor(footY - PHYS.UNIT_H), y1 = Math.floor(footY - 1);
      for (let k = 0; k <= maxDist; k++) {
        const xx = Math.floor(x + dir * (PHYS.UNIT_W / 2 + k));
        let any = false, steel = false;
        for (let j = y0; j <= y1; j++) { const v = this.g.get(xx, j); if (v !== EMPTY) { any = true; if (v !== DESTRUCTIBLE) steel = true; } }
        if (any) {
          let depth = 0, st = false;
          for (let m = 0; m < 140; m++) {
            const xxx = xx + dir * m; let a2 = false;
            for (let j = y0; j <= y1; j++) { const v = this.g.get(xxx, j); if (v !== EMPTY) { a2 = true; if (v !== DESTRUCTIBLE) st = true; } }
            if (!a2) break; depth++;
          }
          return { dist: k, depth: st ? -1 : depth, steel: st };
        }
      }
      return { dist: Infinity, depth: 0, steel: false };
    }
    wallHeight(x, footY) {
      let up = 0;
      for (let j = Math.floor(footY) - 1; j >= 0; j--) { if (this.g.solid(Math.round(x), j)) up++; else break; }
      return up;
    }
    headroom(x, footY) {
      const c = this.g.firstSolidAbove(Math.round(x), Math.floor(footY) - PHYS.UNIT_H - 1, 200);
      return c < 0 ? 999 : (Math.floor(footY) - c);
    }
    floorThickness(x, footY) {
      const gy = this.g.firstSolidBelow(Math.round(x), Math.round(footY), 90);
      if (gy < 0) return { gy: -1, th: 0, steel: false, below: -1 };
      let th = 0, steel = false;
      for (let j = gy; j < Math.min(H, gy + 96); j++) {
        const v = this.g.get(Math.round(x), j);
        if (v === EMPTY) break;                     // 공동 = 바닥 끝
        th++;
        if (v === STEEL || v === BUILT) { steel = true; break; }
      }
      const below = this.g.firstSolidBelow(Math.round(x), gy + th, 220);
      return { gy, th, steel, below };
    }
    columnRun(x, y0, y1, want) {
      let n = 0, steel = 0;
      for (let j = Math.round(y0); j < Math.round(y1); j++) {
        const v = this.g.get(Math.round(x), j);
        if (v === want) n++; else if (v === STEEL) steel++;
      }
      return { n, steel };
    }
  }

  /* =====================================================================
   * 스킬별 probe — SKILL_SPEC.probe 와 1:1 대응
   * ===================================================================*/
  const PROBES = {
    probeFloat(pr, plan, tr) {
      const launch = refSlab(plan, tr.fromSlab, tr.x - 10);
      const land = refSlab(plan, tr.toSlab, tr.x + 40);
      const takeX = clamp(tr.params.takeoffX != null ? tr.params.takeoffX : launch.x1 - 2, 2, W - 2);
      const takeY = pr.floorOfSlab(launch, clamp(takeX, launch.x0 + 2, launch.x1 - 2));
      const landY = pr.floorOfSlab(land, clamp((land.x0 + land.x1) / 2, land.x0 + 2, land.x1 - 2));
      if (takeY < 0) return { ok: false, code: 'NO_FLOOR', where: 'takeoff' };
      if (landY < 0) return { ok: false, code: 'NO_FLOOR', where: 'landing' };
      const drop = landY - takeY;
      if (drop < PHYS.LETHAL_FALL + 6) return { ok: false, code: 'DROP_TOO_SHALLOW', drop };
      if (drop > PHYS.LETHAL_FALL + 200) return { ok: false, code: 'DROP_TOO_DEEP', drop };
      if (land.x1 - land.x0 < 34) return { ok: false, code: 'LANDING_TOO_NARROW', w: land.x1 - land.x0 };
      for (let j = takeY + 2; j < landY - 2; j += 3) {
        if (pr.g.solid(takeX + 2, j)) return { ok: false, code: 'FALL_PATH_BLOCKED', y: j };
      }
      return { ok: true, drop };
    },

    probeBash(pr, plan, tr) {
      const s = refSlab(plan, tr.fromSlab, tr.x);
      const { wallX, wallT } = tr.params;
      const mx = clearSpot(plan, s, wallX - 10);
      const y = pr.floorOfSlab(s, mx);
      if (y < 0 || Math.abs(y - s.y) > 6) return { ok: false, code: 'NO_FLOOR_AFTER_WALL', y, want: s.y };
      if (s.x1 < wallX + wallT + 30) return { ok: false, code: 'NO_FLOOR_AFTER_WALL', short: true };
      const sc = pr.scanAhead(wallX - 8, y, 1, 14);
      if (sc.dist === Infinity) return { ok: false, code: 'WALL_MISSING' };
      if (sc.steel) return { ok: false, code: 'STEEL_IN_TUNNEL' };
      if (sc.depth < 10) return { ok: false, code: 'WALL_TOO_THIN', depth: sc.depth };
      if (sc.depth > PHYS.BASH_MAX_WALL) return { ok: false, code: 'WALL_TOO_THICK', depth: sc.depth };
      const hrB = pr.headroom(wallX - 10, y);
      if (hrB < PHYS.UNIT_H + 4) return { ok: false, code: 'LOW_HEADROOM_BEFORE', hr: hrB };
      const hrA = pr.headroom(wallX + wallT + 6, y);
      if (hrA < PHYS.UNIT_H + 4) return { ok: false, code: 'LOW_HEADROOM_AFTER', hr: hrA };
      if (pr.floorAt(wallX + wallT + 8, 0) < 0) return { ok: false, code: 'NO_FLOOR_AFTER_WALL' };
      return { ok: true, depth: sc.depth };
    },

    probeClimb(pr, plan, tr) {
      const { wallX, wallT } = tr.params;
      const launch = refSlab(plan, tr.fromSlab, wallX - 6);
      const footY = pr.floorOfSlab(launch, clearSpot(plan, launch, wallX - 8));
      if (footY < 0 || Math.abs(footY - launch.y) > 6) return { ok: false, code: 'NO_FLOOR_AT_BASE', footY, want: launch.y };
      const h = pr.wallHeight(wallX + 1, footY);
      if (h < PHYS.CLIMB_MIN) return { ok: false, code: 'WALL_TOO_SHORT', h };
      if (h > PHYS.CLIMB_MAX) return { ok: false, code: 'WALL_TOO_TALL', h };
      const topY = footY - h;
      const topSlab = refSlab(plan, tr.toSlab, wallX + wallT + 5);
      const topFloor = pr.floorOfSlab(topSlab, clamp(wallX + wallT + 5, topSlab.x0 + 2, topSlab.x1 - 2));
      if (topFloor < 0) return { ok: false, code: 'NO_WALKABLE_TOP', topY };
      if (Math.abs(topFloor - topY) > 10) return { ok: false, code: 'NO_WALKABLE_TOP', topY, topFloor };
      // 등반 경로(벽 앞 3px 열)에 돌출이 없어야 함 — 벽 자체는 제외
      for (let j = footY - 3; j > topY + 2; j -= 3) {
        if (pr.g.solid(wallX - 3, j)) return { ok: false, code: 'CLIMB_PATH_OVERHANG', y: j };
      }
      // 꼭대기 위 헤드룸(유닛 키)
      if (pr.headroom(wallX + wallT + 3, topY) < PHYS.UNIT_H + 3) return { ok: false, code: 'CLIMB_TOP_BLOCKED' };
      return { ok: true, h };
    },

    probeMine(pr, plan, tr) {
      const { ceilX, ceilW } = tr.params;
      const s = refSlab(plan, tr.fromSlab, ceilX);
      const s0 = refSlab(plan, tr.fromSlab, ceilX);
      const y = pr.floorOfSlab(s0, clearSpot(plan, s0, ceilX - 12));
      if (y < 0 || Math.abs(y - s0.y) > 6) return { ok: false, code: 'NO_FLOOR', y, want: s0.y };
      // 천장이 실제로 유닛 박스를 막는가
      const sc = pr.scanAhead(ceilX - 10, y, 1, 16);
      if (sc.dist === Infinity) return { ok: false, code: 'CEILING_NOT_BLOCKING' };
      if (sc.steel) return { ok: false, code: 'STEEL_CEILING' };
      let th = 0;
      for (let j = y - PHYS.UNIT_H; j >= 0; j--) {
        const v = pr.g.get(Math.round(ceilX + ceilW / 2), j);
        if (v === DESTRUCTIBLE) th++; else if (v === STEEL) return { ok: false, code: 'STEEL_CEILING' }; else if (th) break;
      }
      if (th < 6) return { ok: false, code: 'CEILING_TOO_THIN', th };
      if (th > PHYS.MINE_MAX) return { ok: false, code: 'CEILING_TOO_THICK', th };
      if (pr.floorOfSlab(s0, clamp(ceilX + ceilW + 8, s0.x0 + 2, s0.x1 - 2)) < 0) return { ok: false, code: 'NO_FLOOR' };
      return { ok: true, th };
    },

    probeDrill(pr, plan, tr) {
      const { holeX } = tr.params;
      const land = refSlab(plan, tr.toSlab, holeX);
      const s0 = refSlab(plan, tr.fromSlab, holeX);
      const ft = pr.floorThickness(holeX, s0.y - 2);
      if (ft.gy < 0) return { ok: false, code: 'NO_FLOOR' };
      if (Math.abs(ft.gy - s0.y) > 6) return { ok: false, code: 'NO_FLOOR', gy: ft.gy, want: s0.y };
      if (ft.steel) return { ok: false, code: 'STEEL_FLOOR' };
      if (ft.th < 6) return { ok: false, code: 'FLOOR_TOO_THIN', th: ft.th };
      if (ft.th > PHYS.DRILL_MAX) return { ok: false, code: 'FLOOR_TOO_THICK', th: ft.th };
      const landY = pr.floorOfSlab(land, clamp((land.x0 + land.x1) / 2, land.x0 + 2, land.x1 - 2));
      if (landY < 0) return { ok: false, code: 'NO_LOWER_LEVEL' };
      const drop = landY - ft.gy;
      if (drop > PHYS.LETHAL_FALL) return { ok: false, code: 'EXIT_DROP_LETHAL', drop };
      if (land.x1 - land.x0 < 40) return { ok: false, code: 'LOWER_LANDING_NARROW', w: land.x1 - land.x0 };
      // 드릴 착지 지점 수평 오프셋 확인(샤프트가 하부 슬랩 위에 뚫리는가)
      if (holeX < land.x0 - 4 || holeX > land.x1 + 4) return { ok: false, code: 'SHAFT_MISALIGNED', holeX, land: [land.x0, land.x1] };
      return { ok: true, th: ft.th, drop };
    },

    probeBuild(pr, plan, tr) {
      const s = refSlab(plan, tr.fromSlab, tr.x);
      const st = findStep(plan, tr.params.stepX);
      if (!st) return { ok: false, code: 'STEP_MISSING' };
      const y = pr.floorOfSlab(s, clearSpot(plan, s, st.x - 12));
      if (y < 0 || Math.abs(y - s.y) > 6) return { ok: false, code: 'NO_FLOOR', y, want: s.y };
      const rise = pr.wallHeight(st.x + 1, y);
      if (rise < 6) return { ok: false, code: 'RISE_TOO_SMALL', rise };
      if (rise > PHYS.BUILD_RISE_PER_STEP * PHYS.BUILD_STEPS - 2) return { ok: false, code: 'RISE_TOO_BIG', rise };
      const runway = s.x1 - (st.x + st.w);
      if (runway < 60) return { ok: false, code: 'RUNWAY_TOO_SHORT', runway };
      // 계단 건설 접근로(단차 앞 6~40px)와 착지 후 전방(단차 뒤) 헤드룸
      for (let k = -34; k <= -8; k += 6) {
        const hr = pr.headroom(st.x + k, y);
        if (hr < PHYS.UNIT_H + 4) return { ok: false, code: 'RUNWAY_BLOCKED', k, hr };
      }
      const y2 = pr.floorOfSlab(s, clearSpot(plan, s, st.x + st.w + 14));
      if (y2 > 0 && pr.headroom(st.x + st.w + 12, y2) < PHYS.UNIT_H + 4) return { ok: false, code: 'RUNWAY_BLOCKED', k: st.w + 12 };
      return { ok: true, rise, runway };
    },

    probeBomb(pr, plan, tr) {
      const { bombX, craterR } = tr.params;
      const s = refSlab(plan, tr.fromSlab, bombX);
      const land = refSlab(plan, tr.toSlab, bombX);
      const y = pr.floorOfSlab(s, clamp(bombX, s.x0 + 2, s.x1 - 2));
      if (y < 0 || Math.abs(y - s.y) > 6) return { ok: false, code: 'NO_FLOOR', y, want: s.y };
      const ft = pr.floorThickness(bombX, y - 2);
      if (ft.steel) return { ok: false, code: 'STEEL_FLOOR' };
      if (ft.th < 12) return { ok: false, code: 'FLOOR_TOO_THIN', th: ft.th };
      // 크레이터 관통 조건: 바닥 두께 + 상부 지형(폭발 중심은 y-4) < 반경
      let above = 0;
      for (let j = y - 5; j > y - 5 - 24; j--) if (pr.g.solid(bombX, j)) above++;
      if (ft.th * 0.5 + above > craterR - 4) return { ok: false, code: 'CRATER_WONT_BREACH', th: ft.th, above, r: craterR };
      const landY = pr.floorOfSlab(land, clamp((land.x0 + land.x1) / 2, land.x0 + 2, land.x1 - 2));
      if (landY < 0) return { ok: false, code: 'NO_LANDING' };
      const drop = landY - y;
      if (drop > PHYS.LETHAL_FALL) return { ok: false, code: 'BLAST_DROP_LETHAL', drop };
      if (drop < 8) return { ok: false, code: 'BLAST_DROP_TOO_SMALL', drop };
      if (land.x1 - land.x0 < 44) return { ok: false, code: 'LANDING_NARROW', w: land.x1 - land.x0 };
      return { ok: true, drop, th: ft.th };
    },

    probeSteelPlug(pr, plan, tr) {
      const { plugX, plugW, drillX } = tr.params;
      const land = refSlab(plan, tr.toSlab, plugX);
      const s0 = refSlab(plan, tr.fromSlab, plugX);
      const y = pr.floorOfSlab(s0, clearSpot(plan, s0, plugX - 12));
      if (y < 0 || Math.abs(y - s0.y) > 6) return { ok: false, code: 'NO_FLOOR', y, want: s0.y };
      const run = pr.columnRun(plugX + plugW / 2, y - 44, y, DESTRUCTIBLE);
      if (run.steel > 4) return { ok: false, code: 'STEEL_IN_PLUG' };
      if (run.n < 8) return { ok: false, code: 'PLUG_MISSING', n: run.n };
      const sc = pr.scanAhead(plugX - 10, y, 1, 14);
      if (sc.dist === Infinity) return { ok: false, code: 'PLUG_MISSING' };
      if (sc.steel) return { ok: false, code: 'STEEL_IN_PLUG' };
      if (sc.depth > PHYS.BASH_MAX_WALL) return { ok: false, code: 'WALL_TOO_THICK', depth: sc.depth };
      const ft = pr.floorThickness(drillX, y - 2);
      if (ft.steel) return { ok: false, code: 'STEEL_FLOOR' };
      if (ft.th < 6) return { ok: false, code: 'FLOOR_TOO_THIN', th: ft.th };
      if (ft.th > PHYS.DRILL_MAX) return { ok: false, code: 'FLOOR_TOO_THICK', th: ft.th };
      const landY = pr.floorOfSlab(land, clamp((land.x0 + land.x1) / 2, land.x0 + 2, land.x1 - 2));
      if (landY < 0) return { ok: false, code: 'NO_LOWER_LEVEL' };
      const drop = landY - y;
      if (drop > PHYS.LETHAL_FALL) return { ok: false, code: 'EXIT_DROP_LETHAL', drop };
      if (land.x1 - land.x0 < 40) return { ok: false, code: 'LOWER_LANDING_NARROW' };
      return { ok: true, drop, th: ft.th };
    },

    probeBlock(pr, plan, tr) {
      const s = refSlab(plan, tr.toSlab, tr.x);
      const y = pr.floorOfSlab(s, clamp(tr.x, s.x0 + 2, s.x1 - 2));
      if (y < 0) return { ok: false, code: 'NO_FLOOR' };
      const flat = pr.flatness(tr.x - 24, tr.x + 24);
      if (flat > 5) return { ok: false, code: 'ANCHOR_NOT_FLAT', flat };
      if (pr.headroom(tr.x, y) < PHYS.CORRIDOR_H) return { ok: false, code: 'ANCHOR_LOW_HEADROOM' };
      return { ok: true };
    },

    probePortal(pr, plan, tr) {
      if (!plan.portals) return { ok: false, code: 'NO_PORTAL' };
      const { a, b } = plan.portals;
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d > PHYS.PORTAL_RANGE - 2) return { ok: false, code: 'OUT_OF_RANGE', d };
      const sa = refSlab(plan, tr.fromSlab, a.x), sb = refSlab(plan, tr.toSlab, b.x);
      const ya = pr.floorOfSlab(sa, a.x), yb = pr.floorOfSlab(sb, b.x);
      if (ya < 0 || yb < 0) return { ok: false, code: 'ANCHOR_NO_FLOOR' };
      if (Math.abs(ya - a.y) > 6) return { ok: false, code: 'ANCHOR_MISALIGNED', a: a.y, floor: ya };
      if (Math.abs(yb - b.y) > 6) return { ok: false, code: 'ANCHOR_MISALIGNED', b: b.y, floor: yb };
      // 대체 경로가 없어야 스킬이 "강제"됨: 중간 지점이 나락이거나 치사낙하
      const midX = Math.round((a.x + b.x) / 2);
      const midFloor = pr.floorAt(midX, Math.min(a.y, b.y));
      if (midFloor > 0 && midFloor - Math.max(a.y, b.y) < PHYS.LETHAL_FALL) return { ok: false, code: 'ALTERNATE_ROUTE_EXISTS', midFloor };
      return { ok: true, d };
    }
  };

  /* =====================================================================
   * 전역 무결성 probe — 스폰/게이트/연결성/통로
   * ===================================================================*/
  function probeGlobal(pr, plan) {
    const issues = [];
    // 스폰
    const sg = pr.floorAt(plan.spawn.x, plan.spawn.y);
    if (sg < 0 || sg - plan.spawn.y > PHYS.LETHAL_FALL - 20) issues.push({ code: 'SPAWN_UNSAFE', floor: sg });
    if (pr.headroom(plan.spawn.x, sg > 0 ? sg : plan.spawn.y + 40) < PHYS.UNIT_H + 4) issues.push({ code: 'SPAWN_BLOCKED' });
    // 게이트
    const gg = pr.floorAt(plan.gate.x, plan.gate.y);
    if (gg < 0) issues.push({ code: 'GATE_FLOATING' });
    else if (Math.abs(gg - (plan.gate.y + 10)) > 20) issues.push({ code: 'GATE_MISALIGNED', gg });
    if (pr.headroom(plan.gate.x, gg > 0 ? gg : plan.gate.y + 10) < PHYS.CORRIDOR_H - 2) issues.push({ code: 'GATE_BLOCKED' });

    // 연결성: transition 그래프 + 인접 워크 연결 → BFS(스폰 슬랩 → 게이트 슬랩)
    const n = plan.slabs.length;
    const adj = Array.from({ length: n }, () => new Set());
    const link = (a, b) => { if (a != null && b != null && a !== b && plan.slabs[a] && plan.slabs[b]) { adj[a].add(b); adj[b].add(a); } };
    for (const t of plan.transitions) link(t.fromSlab, t.toSlab);
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const a = plan.slabs[i], b = plan.slabs[j];
      const xo = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
      const dy = b.y - a.y;
      if (xo >= -4 && dy >= -PHYS.STEP_UP && dy <= 130) link(i, j);      // 걸어서/떨어져서 도달
      if (xo >= -4 && dy < 0 && dy >= -130) link(i, j);
    }
    const seen = new Set([0]); const q = [0];
    while (q.length) { const u = q.shift(); for (const v of adj[u]) if (!seen.has(v)) { seen.add(v); q.push(v); } }
    for (let i = 1; i < n; i++) if (!seen.has(i)) issues.push({ code: 'SLAB_UNREACHABLE', id: i });
    if (!seen.has(n - 1)) issues.push({ code: 'GATE_UNREACHABLE' });

    // 통로 치수
    for (const s of plan.slabs) {
      if (s.x1 - s.x0 < PHYS.CORRIDOR_W) issues.push({ code: 'SLAB_TOO_NARROW', id: s.id, w: s.x1 - s.x0 });
      const mid = Math.round((s.x0 + s.x1) / 2);
      const y = pr.floorAt(mid, 0);
      if (y > 0 && pr.headroom(mid, y) < PHYS.UNIT_H + 4) issues.push({ code: 'SLAB_LOW_HEADROOM', id: s.id, x: mid });
    }
    return issues;
  }

  /* =====================================================================
   * Fixer — plan(중간 표현)만 변형. 그리드는 Assembler가 재구축.
   * ===================================================================*/
  class Fixer {
    constructor(plan) { this.p = plan; this.log = []; }
    slabOf(tr, which = 'from') { return refSlab(this.p, which === 'from' ? tr.fromSlab : tr.toSlab, tr.x); }

    apply(code, tr, info) {
      const p = this.p;
      const land = () => this.slabOf(tr, 'to');
      const launch = () => this.slabOf(tr, 'from');
      switch (code) {
        /* --- FLOAT --- */
        case 'DROP_TOO_SHALLOW': {
          const l = land(), need = PHYS.LETHAL_FALL + 26 - info.drop;
          if (l.y + need <= H - 46) { l.y += need; }
          else { const s = launch(); if (s.y - need >= 70) s.y -= need; else return false; }
          return true;
        }
        case 'DROP_TOO_DEEP': { const l = land(); l.y = clamp(l.y - (info.drop - (PHYS.LETHAL_FALL + 150)), 90, H - 46); return true; }
        case 'LANDING_TOO_NARROW':
        case 'LOWER_LANDING_NARROW':
        case 'LANDING_NARROW': { const l = land(); l.x1 = clamp(l.x1 + 34, l.x0 + 60, W - 10); l.x0 = clamp(l.x0 - 12, 10, l.x1 - 60); return true; }
        case 'FALL_PATH_BLOCKED': {
          const x = tr.params.takeoffX != null ? tr.params.takeoffX : launch().x1;
          for (const d of p.deco) if (!d.removed && d.x < x + 12 && d.x + d.w > x - 8 && d.y < info.y + 10 && d.y + d.h > info.y - 30) d.removed = true;
          return true;
        }
        /* --- BASH --- */
        case 'WALL_TOO_THIN': { const w = findWall(p, 'tunnel', tr.params.wallX); if (!w) return false; w.w = clamp(w.w + 10, 10, PHYS.BASH_MAX_WALL - 6); return true; }
        case 'WALL_TOO_THICK': { const w = findWall(p, 'tunnel', tr.params.wallX); if (!w) return false; w.w = clamp(w.w - 14, 10, PHYS.BASH_MAX_WALL - 6); return true; }
        case 'WALL_MISSING': {
          const s = this.slabOf(tr, 'from');
          let w = findWall(p, 'tunnel', tr.params.wallX);
          if (!w) { w = { x: tr.params.wallX, y: s.y - 32, w: tr.params.wallT || 18, h: 33, kind: 'rock', role: 'tunnel', slabId: s.id }; p.walls.push(w); }
          w.h = clamp(s.y - w.y + 1, 24, 60); w.y = s.y - w.h + 1;
          s.x1 = clamp(Math.max(s.x1, w.x + w.w + 46), s.x0 + 60, W - 10);
          return true;
        }
        case 'CLIMB_TOP_BLOCKED': {
          const w = findWall(p, 'climb', tr.params.wallX); if (!w) return false;
          for (const d of p.deco) if (!d.removed && d.x < w.x + w.w + 20 && d.x + d.w > w.x - 4 && d.y + d.h > w.y - PHYS.UNIT_H - 4 && d.y < w.y + 6) d.removed = true;
          const r = findRoof(p, w.x + w.w); if (r && r.role !== 'ceiling') r.removed = true;
          return true;
        }
        case 'PLUG_MISSING':
        case 'STEEL_IN_PLUG': {
          const s = this.slabOf(tr, 'from');
          let pl = findPlug(p, tr.params.plugX);
          if (!pl) { pl = { x: tr.params.plugX, y: s.y - 30, w: tr.params.plugW || 16, h: 33, slabId: s.id }; p.plugs.push(pl); }
          pl.h = clamp(s.y - pl.y + 3, 20, 60); pl.w = clamp(pl.w, 12, 24);
          for (const d of p.deco) if (d.type === 'steelBarrier' && d.x < pl.x + pl.w + 6 && d.x + d.w > pl.x - 6 && d.y + d.h > pl.y && d.y < s.y) d.removed = true;
          return true;
        }
        case 'STEEL_IN_TUNNEL': {
          const w = findWall(p, 'tunnel', tr.params.wallX); if (w) w.kind = 'rock';
          for (const d of p.deco) if (d.type === 'steelBarrier' && d.x > tr.params.wallX - 16 && d.x < tr.params.wallX + tr.params.wallT + 16) d.removed = true;
          return true;
        }
        case 'LOW_HEADROOM_BEFORE':
        case 'LOW_HEADROOM_AFTER': {
          const x = code.endsWith('BEFORE') ? tr.params.wallX - 12 : tr.params.wallX + tr.params.wallT + 6;
          const s = this.slabOf(tr, 'from');
          for (const d of p.deco) if (!d.removed && d.x < x + 12 && d.x + d.w > x - 12 && d.y + d.h > s.y - PHYS.CORRIDOR_H && d.y < s.y) d.removed = true;
          return true;
        }
        case 'NO_FLOOR_AFTER_WALL': {
          const s = this.slabOf(tr, 'from');
          s.x1 = clamp(Math.max(s.x1, (tr.params.wallX || s.x0) + (tr.params.wallT || 16) + 46), s.x0 + 60, W - 10);
          s.y = (tr.params.want != null && Math.abs(s.y - tr.params.want) > 6) ? s.y : s.y;
          return true;
        }
        /* --- CLIMB --- */
        case 'WALL_TOO_SHORT': {
          const w = findWall(p, 'climb', tr.params.wallX); if (!w) return false;
          const add = PHYS.CLIMB_MIN + 12 - info.h;
          w.y -= add; w.h += add;
          const s = this.slabOf(tr, 'to'); s.y = w.y; tr.params.topY = s.y;
          return true;
        }
        case 'WALL_TOO_TALL': {
          const w = findWall(p, 'climb', tr.params.wallX); if (!w) return false;
          const cut = info.h - (PHYS.CLIMB_MAX - 14);
          w.y += cut; w.h = Math.max(20, w.h - cut);
          const s = this.slabOf(tr, 'to'); s.y = w.y; tr.params.topY = s.y;
          return true;
        }
        case 'NO_WALKABLE_TOP': {
          const w = findWall(p, 'climb', tr.params.wallX); if (!w) return false;
          const s = this.slabOf(tr, 'to');
          s.y = w.y; s.x0 = Math.min(s.x0, w.x);
          return true;
        }
        case 'CLIMB_PATH_OVERHANG': {
          for (const d of p.deco) if (!d.removed && d.x < tr.params.wallX && d.x + d.w > tr.params.wallX - 8 && d.y < info.y + 8 && d.y + d.h > info.y - 8) d.removed = true;
          const r = findRoof(p, tr.params.wallX - 4); if (r && r.x < tr.params.wallX) r.x = tr.params.wallX + 2;
          return true;
        }
        case 'NO_FLOOR_AT_BASE': { const s = this.slabOf(tr, 'from'); s.x1 = clamp(Math.max(s.x1, tr.params.wallX + 2), s.x0 + 50, W - 10); return true; }
        /* --- MINE --- */
        case 'CEILING_TOO_THIN': { const r = findRoof(p, tr.params.ceilX); if (!r) return false; r.h += 8; r.y -= 8; return true; }
        case 'CEILING_TOO_THICK': { const r = findRoof(p, tr.params.ceilX); if (!r) return false; r.h = Math.max(8, r.h - 12); r.y += 6; return true; }
        case 'CEILING_NOT_BLOCKING': {
          const r = findRoof(p, tr.params.ceilX); if (!r) return false;
          const s = this.slabOf(tr, 'from');
          r.h = Math.max(12, r.h); r.y = s.y - (PHYS.UNIT_H - 1) - r.h;
          return true;
        }
        case 'STEEL_CEILING': {
          const r = findRoof(p, tr.params.ceilX); if (r) r.steelFree = true;
          for (const d of p.deco) if (d.type === 'steelBarrier' && d.x < tr.params.ceilX + tr.params.ceilW && d.x + d.w > tr.params.ceilX) d.removed = true;
          return true;
        }
        /* --- DRILL / BOMB 바닥 --- */
        case 'FLOOR_TOO_THIN': { const s = this.slabOf(tr, 'from'); s.th = clamp(Math.max(s.th + 8, 20), 14, PHYS.DRILL_MAX - 8); if (s.voidBelow) s.voidBelow.y0 = s.y + s.th; return true; }
        case 'FLOOR_TOO_THICK': { const s = this.slabOf(tr, 'from'); s.th = clamp(PHYS.DRILL_MAX - 10, 12, s.th); if (s.voidBelow) s.voidBelow.y0 = s.y + s.th; return true; }
        case 'STEEL_FLOOR': {
          for (const d of p.deco) if (d.type === 'steelBarrier' && d.x < tr.x + 20 && d.x + d.w > tr.x - 20) d.removed = true;
          return true;
        }
        case 'NO_LOWER_LEVEL':
        case 'NO_LANDING': { const l = land(); l.x1 = clamp(l.x1 + 40, l.x0 + 70, W - 10); return true; }
        case 'EXIT_DROP_LETHAL': { const l = land(); l.y = clamp(l.y - (info.drop - PHYS.LETHAL_FALL + 20), 90, H - 46); if (refSlab(p, tr.fromSlab, tr.x).voidBelow) refSlab(p, tr.fromSlab, tr.x).voidBelow.y1 = l.y - 3; return true; }
        case 'SHAFT_MISALIGNED': { const l = land(); const hx = tr.params.holeX; if (hx < l.x0) l.x0 = clamp(hx - 20, 10, l.x1 - 50); else l.x1 = clamp(hx + 24, l.x0 + 50, W - 10); return true; }
        /* --- BOMB 크레이터 --- */
        case 'CRATER_WONT_BREACH': { const s = this.slabOf(tr, 'from'); s.th = clamp(s.th - 6, 12, PHYS.BOMB_RADIUS - 12); if (s.voidBelow) { s.voidBelow.y0 = s.y + s.th; } for (const pl of p.plugs) if (Math.abs(pl.x + pl.w / 2 - tr.params.bombX) < 20) pl.removed = true; return true; }
        case 'BLAST_DROP_LETHAL': { const l = land(); l.y = clamp(l.y - (info.drop - PHYS.LETHAL_FALL + 22), 90, H - 46); return true; }
        case 'BLAST_DROP_TOO_SMALL': { const l = land(); l.y = clamp(l.y + 26, 90, H - 46); return true; }
        /* --- BUILD --- */
        case 'RISE_TOO_SMALL': { const st = findStep(p, tr.params.stepX); if (!st) return false; const s = this.slabOf(tr, 'from'); st.h = clamp(16, 10, 22); st.y = s.y - st.h + 3; return true; }
        case 'RISE_TOO_BIG': { const st = findStep(p, tr.params.stepX); if (!st) return false; const s = this.slabOf(tr, 'from'); st.h = 14; st.y = s.y - st.h + 3; return true; }
        case 'RUNWAY_TOO_SHORT': { const s = this.slabOf(tr, 'from'); s.x1 = clamp(s.x1 + 44, s.x0 + 60, W - 10); return true; }
        case 'RUNWAY_BLOCKED': {
          const s = this.slabOf(tr, 'from');
          const x = tr.params.stepX + info.k;
          for (const d of p.deco) if (!d.removed && d.x < x + 10 && d.x + d.w > x - 10 && d.y + d.h > s.y - PHYS.CORRIDOR_H && d.y < s.y) d.removed = true;
          const r = findRoof(p, x); if (r) r.removed = true;
          return true;
        }
        case 'STEP_MISSING': { const s = this.slabOf(tr, 'from'); p.steps.push({ x: clamp(tr.x, s.x0 + 30, s.x1 - 60), y: s.y - 14, w: 16, h: 17, slabId: s.id }); return true; }
        /* --- BLOCK --- */
        case 'ANCHOR_NOT_FLAT': { const s = this.slabOf(tr, 'to'); s.flatForce = true; return true; }
        case 'ANCHOR_LOW_HEADROOM': {
          const s = this.slabOf(tr, 'to');
          for (const d of p.deco) if (!d.removed && d.x < tr.x + 12 && d.x + d.w > tr.x - 12 && d.y + d.h > s.y - PHYS.CORRIDOR_H && d.y < s.y) d.removed = true;
          return true;
        }
        /* --- PORTAL --- */
        case 'OUT_OF_RANGE': {
          const { a, b } = p.portals;
          const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1, k = (PHYS.PORTAL_RANGE - 24) / d;
          b.x = clamp(Math.round(a.x + dx * k), 20, W - 20); b.y = clamp(Math.round(a.y + dy * k), 90, H - 46);
          const s = this.slabOf(tr, 'to'); s.x0 = clamp(b.x - 24, 10, W - 90); s.x1 = clamp(s.x0 + 96, s.x0 + 70, W - 10); s.y = b.y;
          return true;
        }
        case 'ANCHOR_NO_FLOOR':
        case 'ANCHOR_MISALIGNED': {
          const s = this.slabOf(tr, 'to');
          const a = p.portals.a, b = p.portals.b;
          const ls = refSlab(p, tr.fromSlab, a.x);
          a.y = ls.y; b.y = s.y;
          a.x = clamp(a.x, ls.x0 + 10, ls.x1 - 10); b.x = clamp(b.x, s.x0 + 10, s.x1 - 10);
          return true;
        }
        case 'ALTERNATE_ROUTE_EXISTS': {
          const a = p.portals.a, b = p.portals.b;
          const x0 = Math.min(a.x, b.x) + 12, x1 = Math.max(a.x, b.x) - 12;
          for (const d of p.deco) if (!d.removed && d.x + d.w > x0 && d.x < x1) d.removed = true;
          for (const s of p.slabs) if (s.role !== 'gate' && s.role !== 'spawn' && s.x1 > x0 && s.x0 < x1 && s.y > Math.min(a.y, b.y)) s.removed = true;
          p.cutRegion = { x0, x1, y0: Math.min(a.y, b.y) + 6, y1: Math.max(a.y, b.y) + 120 };
          return true;
        }
        /* --- 공통 --- */
        case 'NO_FLOOR': {
          const s = launch();
          s.x1 = clamp(Math.max(s.x1 + 30, (tr.x || s.x0) + 30), s.x0 + 60, W - 10);
          return true;
        }
        default: return false;
      }
    }

    /* 전역 이슈 수정(plan 레벨) */
    applyGlobal(code, issue) {
      const p = this.p;
      switch (code) {
        case 'SPAWN_UNSAFE':
        case 'SPAWN_BLOCKED': {
          const s = p.slabs[0];
          s.x0 = clamp(Math.min(s.x0, p.spawn.x - 30), 8, W - 100);
          s.x1 = clamp(Math.max(s.x1, p.spawn.x + 34), s.x0 + 70, W - 10);
          s.y = clamp(p.spawn.y + 56, 70, H - 40);
          p.spawn = { x: clamp(p.spawn.x, s.x0 + 14, s.x1 - 20), y: s.y - 14 };
          for (const d of p.deco) if (!d.removed && d.x < p.spawn.x + 16 && d.x + d.w > p.spawn.x - 16 && d.y < s.y && d.y + d.h > s.y - 60) d.removed = true;
          return true;
        }
        case 'GATE_FLOATING':
        case 'GATE_MISALIGNED':
        case 'GATE_BLOCKED': {
          const s = p.slabs[p.slabs.length - 1];
          s.x0 = clamp(Math.min(s.x0, p.gate.x - 40), 8, W - 90);
          s.x1 = clamp(Math.max(s.x1, p.gate.x + 28), s.x0 + 76, W - 10);
          p.gate = { x: clamp(p.gate.x, s.x0 + 16, s.x1 - 18), y: s.y - 10 };
          for (const d of p.deco) if (!d.removed && d.x < p.gate.x + 18 && d.x + d.w > p.gate.x - 18 && d.y + d.h > s.y - 40 && d.y < s.y) d.removed = true;
          return true;
        }
        case 'SLAB_UNREACHABLE': {
          const s = p.slabs[issue.id], prev = p.slabs[Math.max(0, issue.id - 1)];
          if (!s || !prev) return false;
          const gap = s.x0 - prev.x1, dy = s.y - prev.y;
          if (gap < 46 && Math.abs(dy) <= 8) { prev.x1 = clamp(s.x0 + 6, prev.x0 + 50, W - 10); prev.y = Math.max(prev.y, s.y); }
          else { p.transitions.push({ kind: 'DROP', skill: null, fromSlab: prev.id, toSlab: s.id, x: prev.x1, y: s.y, dir: 1, params: { drop: dy, synthetic: true } }); }
          return true;
        }
        case 'GATE_UNREACHABLE': {
          const g = p.slabs[p.slabs.length - 1];
          const nearest = p.slabs.slice(0, -1).sort((a, b) => Math.abs(b.x1 - g.x0) - Math.abs(a.x1 - g.x0))[0];
          if (!nearest) return false;
          if (g.x0 - nearest.x1 < 60 && g.y >= nearest.y - PHYS.STEP_UP) { nearest.x1 = clamp(g.x0 + 6, nearest.x0 + 50, W - 10); }
          else { g.x0 = clamp(nearest.x1 - 8, 10, W - 90); g.x1 = clamp(g.x0 + 100, g.x0 + 76, W - 10); g.y = clamp(nearest.y + 40, 100, H - 46); }
          p.transitions.push({ kind: 'DROP', skill: null, fromSlab: nearest.id, toSlab: g.id, x: nearest.x1, y: g.y, dir: 1, params: { drop: g.y - nearest.y, synthetic: true } });
          p.gate = { x: clamp(Math.round(g.x1 - 26), 26, W - 28), y: g.y - 10 };
          return true;
        }
        case 'SLAB_TOO_NARROW': {
          const s = p.slabs[issue.id];
          s.x1 = clamp(s.x0 + PHYS.CORRIDOR_W + 22, s.x1, W - 10);
          return true;
        }
        case 'SLAB_LOW_HEADROOM': {
          const s = p.slabs[issue.id];
          for (const d of p.deco) if (!d.removed && d.x < issue.x + 12 && d.x + d.w > issue.x - 12 && d.y + d.h > s.y - PHYS.CORRIDOR_H && d.y < s.y) d.removed = true;
          for (const r of p.roofs) if (r.role !== 'ceiling' && r.x < issue.x + 10 && r.x + r.w > issue.x - 10 && r.y + r.h > s.y - PHYS.CORRIDOR_H && r.y < s.y) r.removed = true;
          return true;
        }
        default: return false;
      }
    }
  }

  /* =====================================================================
   * probeAll → patch loop (Tier-2). 그리드 재구축은 호출자(Generator)가 수행.
   * ===================================================================*/
  function probeAll(grid, plan) {
    const pr = new Prober(grid);
    const issues = [];
    for (const iss of probeGlobal(pr, plan)) issues.push({ scope: 'global', code: iss.code, info: iss, tr: null });
    // 콤보 transition은 "전용 프로브 1개"만 — 개별 스킬 프로브는 파라미터 스킴이 달라 오탐
    const COMBO_PROBE = { STEEL_PLUG: ['BASH+DRILL', PROBES.probeSteelPlug] };
    for (const tr of plan.transitions) {
      if (!tr.skill && !tr.skills) continue;
      const combo = COMBO_PROBE[tr.kind];
      if (combo) {
        const r = combo[1](pr, plan, tr);
        if (!r.ok) issues.push({ scope: 'combo', skill: combo[0], code: r.code, info: r, tr });
        continue;
      }
      const specs = tr.skills && tr.skills.length > 1 ? tr.skills : (tr.skill ? [tr.skill] : []);
      const done = new Set();
      for (const sk of specs) {
        const spec = P.SKILL_SPEC[sk];
        if (!spec || done.has(spec.probe)) continue;
        done.add(spec.probe);
        const fn = PROBES[spec.probe];
        if (!fn) continue;
        const r = fn(pr, plan, tr);
        if (!r.ok) issues.push({ scope: 'skill', skill: sk, code: r.code, info: r, tr });
      }
    }
    return issues;
  }

  function patchPlan(plan, issues, maxFix = 18) {
    const fixer = new Fixer(plan);
    let applied = 0;
    const seen = new Set();
    for (const iss of issues) {
      if (applied >= maxFix) break;
      const key = iss.scope + ':' + iss.code + ':' + (iss.tr ? iss.tr.x : '');
      if (seen.has(key)) continue;
      seen.add(key);
      let ok = false;
      if (iss.scope === 'global') ok = fixer.applyGlobal(iss.code, iss.info);
      else {
        const spec = iss.skill && P.SKILL_SPEC[String(iss.skill).split('+')[0]];
        const strategy = spec && spec.fix ? spec.fix[iss.code] : null;
        ok = fixer.apply(iss.code, iss.tr, iss.info);
        if (ok && strategy) fixer.log.push({ scope: iss.scope, skill: iss.skill, code: iss.code, strategy });
      }
      if (ok) { applied++; fixer.log.push(iss); }
    }
    // removed 플래그 반영(요소 목록에서 제거)
    if (plan.deco.some(d => d.removed) || plan.roofs.some(r => r.removed) || plan.plugs.some(p => p.removed)) {
      plan.deco = plan.deco.filter(d => !d.removed);
      plan.roofs = plan.roofs.filter(r => !r.removed);
      plan.plugs = plan.plugs.filter(p => !p.removed);
    }
    return { applied, log: fixer.log };
  }

  return { Prober, PROBES, Fixer, probeGlobal, probeAll, patchPlan, refSlab };
});
