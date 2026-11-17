/* ============================================================================
 * ForgeSim.js — 실제 게임 엔진 기반 헤드리스 시뮬레이터 (StageForge 검증용)
 *
 * GameEngine.updateSimulation 과 동일한 순서/상수로, 실제 TerrainEngine ·
 * NanoUnit · MovingPlatform · JumpPad · StageDataEngine · SkillRules 를 그대로
 * 돌립니다. (렌더/사운드/UI 만 제거) → "검증 통과 = 실제 게임에서 클리어 가능"
 *
 * 브라우저: index.html 에서 엔진 스크립트 뒤에 로드하면 window.ForgeSim
 * Node   : tools/forge/loadEngine.js 로 엔진을 먼저 로드한 뒤 require
 *
 * 플랜(=플레이어 조작) 형식 — 순서대로 실행:
 *   { skill:'bash', at:{x:320, tol:4, y?:200, ytol?:12}, dir?:1|-1,
 *     unit?:'lead'|'any'|'crowd'|'blocker'|<id>, state?:'WALKING'|'FALLING'|'any',
 *     wait?: <이전 조작 후 최소 대기 tick>, label?: '설명' }
 * ==========================================================================*/
(function (root) {
  'use strict';

  const NOOP_PARTICLES = { spawnBurst() {}, spawnFloatingText() {}, update() {}, clear() {} };

  function G(name) {
    // 브라우저/Node(vm) 모두에서 전역 클래스 조회
    try { return (0, eval)(name); } catch (e) { return root[name]; }
  }

  const ForgeSim = {
    /** 레벨 데이터 → 지형 스냅샷을 만들어 반복 실행을 빠르게 */
    prepare(level) {
      const TerrainEngine = G('TerrainEngine');
      const StageDataEngine = G('StageDataEngine');
      const terrain = new TerrainEngine(800, 450);
      StageDataEngine.buildTerrainFromData(terrain, level);
      const snap = {
        grid: new Uint8Array(terrain.grid),
        steelBarriers: JSON.stringify(terrain.steelBarriers || []),
        steelPlatforms: JSON.stringify(terrain.steelPlatforms || []),
        steelSlopes: JSON.stringify(terrain.steelSlopes || []),
        steelBeams: JSON.stringify(terrain.steelBeams || [])
      };
      return { level, terrain, snap };
    },

    _resetTerrain(prep) {
      const t = prep.terrain, s = prep.snap;
      t.grid.set(s.grid);
      t.steelBarriers = JSON.parse(s.steelBarriers);
      t.steelPlatforms = JSON.parse(s.steelPlatforms);
      t.steelSlopes = JSON.parse(s.steelSlopes);
      t.steelBeams = JSON.parse(s.steelBeams);
      t.constructedStructures = [];
      return t;
    },

    /**
     * 시뮬레이션 1회 실행
     * opts: { skills (예산, 생략 시 무제한), maxTicks, trace:boolean, earlyExit:true,
     *         unitsOverride, stallTicks }
     */
    run(prepOrLevel, plan = [], opts = {}) {
      const prep = prepOrLevel && prepOrLevel.snap ? prepOrLevel : this.prepare(prepOrLevel);
      const level = prep.level;
      const NanoUnit = G('NanoUnit');
      const STATE = G('STATE');
      const MovingPlatform = G('MovingPlatform');
      const JumpPad = G('JumpPad');
      const SkillRules = G('SkillRules');
      const terrain = this._resetTerrain(prep);

      const total = opts.unitsOverride || level.totalUnits || 15;
      const need = Math.ceil(total * (level.needPercent || 70) / 100);
      const spX = typeof level.spawnX === 'number' ? level.spawnX : 90;
      const spY = typeof level.spawnY === 'number' ? level.spawnY : 60;
      const gate = { x: typeof level.gateX === 'number' ? level.gateX : 710, y: typeof level.gateY === 'number' ? level.gateY : 254 };
      const spawnInterval = (level.spawnRate || 20) * 2.5;
      const timeLimit = level.timeLimit || 240;
      const maxTicks = Math.min(opts.maxTicks || Infinity, timeLimit * 60);
      const stallTicks = opts.stallTicks || 900;
      const earlyExit = opts.earlyExit !== false;

      const budget = opts.skills ? Object.assign({}, opts.skills) : null;
      const movingPlatforms = [], jumpPads = [];
      for (const el of (level.elements || [])) {
        if (el.type === 'movingPlatform' && MovingPlatform) movingPlatforms.push(new MovingPlatform(el));
        else if (el.type === 'jumpPad' && JumpPad) jumpPads.push(new JumpPad(el));
      }
      const portalPair = { entry: null, exit: null };

      const units = [];
      let spawnTimer = 180, spawned = 0, rescued = 0, dead = 0;
      let stepIdx = 0, lastActTick = 0, lastEventTick = 0, repeatDone = 0, prevUnitId = null;
      const applied = [];
      const deaths = [];
      const trace = opts.trace ? [] : null;
      const P = NOOP_PARTICLES;
      const goal = opts.goal || null; // { x, y, xtol, ytol } — 유닛이 도달하면 즉시 종료(reached)
      let reached = false, reachedTick = -1;

      const isGround = (k) => k === 'bash' || k === 'mine' || k === 'drill' || k === 'build' || k === 'block';

      const pickUnit = (act) => {
        const sel = act.unit == null ? 'any' : act.unit;
        const wantState = act.state || (isGround(act.skill) ? 'WALKING' : 'any');
        const at = act.at || null;
        const rg = act.region || null;
        const ok = (u) => {
          if (u.state === STATE.DEAD || u.state === STATE.EXITING) return false;
          if (sel === 'blocker') {
            if (u.state !== STATE.BLOCKING_SHIELD) return false;
          } else {
            if (u.state === STATE.BLOCKING_SHIELD) return false;
          }
          if (sel === 'prev' && u.id !== prevUnitId) return false;
          if (sel === 'crowd' && u.id === prevUnitId) return false;
          if (sel === 'pioneer1' && u.id !== 1) return false;
          if (sel === 'pioneer2' && u.id !== 2) return false;
          if (sel === 'crowd_lead' && u.id < 3) return false;
          if (sel !== 'blocker' && wantState !== 'any') {
            if (wantState === 'FALLING') { if (u.state !== STATE.FALLING && u.state !== STATE.FLOATING) return false; }
            else if (u.state !== STATE[wantState] && u.state !== wantState) return false;
          }
          if (act.dir && u.dir !== act.dir) return false;
          if (at) {
            if (Math.abs(u.x - at.x) > (at.tol != null ? at.tol : 4)) return false;
            if (at.y != null && Math.abs(u.y - at.y) > (at.ytol != null ? at.ytol : 14)) return false;
          }
          if (rg) {
            if (u.x < rg.x0 || u.x > rg.x1) return false;
            if (rg.y0 != null && (u.y < rg.y0 || u.y > rg.y1)) return false;
          }
          if (act.skill === 'climb' && u.hasMagnetizer) return false;
          if (act.skill === 'float' && u.hasAntiGrav) return false;
          if (act.skill === 'bomb' && u.bombTimer > 0) return false;
          return true;
        };
        if (typeof sel === 'number') { const u = units.find(x => x.id === sel); return u && ok(u) ? u : null; }
        const cands = units.filter(ok);
        if (!cands.length) return null;
        if (act.nth && act.nth >= 1) {
          cands.sort((a, b) => a.id - b.id);
          return cands[act.nth - 1] || null;
        }
        if (sel === 'lead' || sel === 'crowd_lead') return cands.reduce((a, b) => (a.id < b.id ? a : b));
        if (act.near) {
          const n = act.near;
          return cands.reduce((a, b) => (Math.hypot(a.x - n.x, (a.y - (n.y != null ? n.y : a.y))) <= Math.hypot(b.x - n.x, (b.y - (n.y != null ? n.y : b.y))) ? a : b));
        }
        return cands[0];
      };

      let tick = 0;
      for (; tick < maxTicks; tick++) {
        // --- 플레이어 조작 (프레임 사이 클릭과 동일하게 업데이트 전에 적용) ---
        while (stepIdx < plan.length) {
          const act = plan[stepIdx];
          if (act.wait && tick - lastActTick < act.wait) break;
          if (act.minTick && tick < act.minTick) break;
          if (act.minSpawned && spawned < act.minSpawned) break;
          if (act.skill === 'portal' && act.entry && act.exit) {
            if (budget && !(budget.portal > 0)) { stepIdx = plan.length; break; }
            if (act.at && !units.some(u => u.state !== STATE.DEAD && u.state !== STATE.EXITING && Math.abs(u.x - act.at.x) <= (act.at.tol || 8))) break;
            let ey = act.entry.y; while (terrain.isSolid(act.entry.x, ey) && ey > 20) ey--;
            let xy = act.exit.y; while (terrain.isSolid(act.exit.x, xy) && xy > 20) xy--;
            portalPair.entry = { x: act.entry.x, y: ey };
            portalPair.exit = { x: act.exit.x, y: xy };
            if (budget) budget.portal--;
            applied.push({ i: stepIdx, tick, unit: 0, x: act.entry.x, y: ey, dir: 1, skill: 'portal' });
            lastActTick = tick; lastEventTick = tick;
            stepIdx++; repeatDone = 0;
            if (!act.chain) break;
            continue;
          }
          if (budget && !(budget[act.skill] > 0)) { stepIdx = plan.length; break; }
          const u = pickUnit(act);
          if (!u) break;
          const res = SkillRules.apply(terrain, u, act.skill, P);
          if (!res.applied) break;
          if (budget) budget[act.skill]--;
          applied.push({ i: stepIdx, tick, unit: u.id, x: Math.round(u.x), y: Math.round(u.y), dir: u.dir, skill: act.skill });
          lastActTick = tick; lastEventTick = tick;
          if (act.skill !== 'block' || act.unit !== 'blocker') prevUnitId = u.id;
          repeatDone++;
          if (repeatDone >= (act.repeat || 1)) { stepIdx++; repeatDone = 0; }
          if (!act.chain) break; // 한 tick 에 한 조작 (chain:true 면 연속 허용)
        }

        // --- GameEngine.updateSimulation 과 동일 순서 ---
        if (spawned < total) {
          spawnTimer += 1;
          if (spawnTimer >= spawnInterval) {
            spawnTimer = 0; spawned++;
            units.push(new NanoUnit(spawned, spX, spY, 1));
            lastEventTick = tick;
          }
        }
        for (const p of movingPlatforms) p.update(1.0);
        for (const pad of jumpPads) pad.update(1.0);

        let active = 0;
        for (const u of units) {
          const prev = u.state;
          u.update(terrain, P, gate, portalPair, units, 1.0, movingPlatforms, jumpPads);
          if (u.state === STATE.EXITING && prev !== STATE.EXITING) { rescued++; lastEventTick = tick; }
          if (u.state === STATE.DEAD && prev !== STATE.DEAD) {
            dead++;
            deaths.push({ id: u.id, x: Math.round(u.x), y: Math.round(u.y), tick });
            lastEventTick = tick;
          }
          if (u.state !== STATE.DEAD && u.state !== STATE.EXITING) active++;
          if (prev !== u.state) lastEventTick = tick;
          if (goal && !reached && u.state !== STATE.DEAD && u.state !== STATE.EXITING) {
            if (Math.abs(u.x - goal.x) <= (goal.xtol || 16) && Math.abs(u.y - goal.y) <= (goal.ytol || 24)) {
              reached = true; reachedTick = tick;
            }
          }
        }
        if (trace && units[0] && tick % 4 === 0) {
          const u = units[0];
          trace.push({ t: tick, x: Math.round(u.x), y: Math.round(u.y), s: u.state, d: u.dir });
        }

        if (goal && reached) break;
        if (spawned >= total && active === 0) break;
        if (earlyExit) {
          if (rescued >= need && !opts.fullRun) break;
          if (rescued + active + (total - spawned) < need) break;
          if (spawned >= total && tick - lastEventTick > stallTicks) break; // 정체(서로 왕복만 반복)
        }
      }

      return {
        cleared: rescued >= need,
        reached, reachedTick,
        rescued, dead, deaths, total, need, ticks: tick,
        stepsApplied: stepIdx, stepsTotal: plan.length,
        applied, trace,
        budgetLeft: budget
      };
    },

    /**
     * 직관 봇(Greedy Reactive Bot) 시뮬레이션
     * - 눈앞의 벽 → bash / climb / bomb
     * - 눈앞의 낭떠러지 → build
     * - 웜홀 바로 위나 정체 → drill / mine
     * 이 봇이 클리어하는 맵은 퍼즐/미끼가 약한 "쉬운 맵"으로 판정!
     */
    runGreedy(prepOrLevel, opts = {}) {
      const prep = prepOrLevel && prepOrLevel.snap ? prepOrLevel : this.prepare(prepOrLevel);
      const level = prep.level;
      const NanoUnit = G('NanoUnit');
      const STATE = G('STATE');
      const MovingPlatform = G('MovingPlatform');
      const JumpPad = G('JumpPad');
      const SkillRules = G('SkillRules');
      const terrain = this._resetTerrain(prep);

      const total = opts.unitsOverride || level.totalUnits || 15;
      const need = Math.ceil(total * (level.needPercent || 70) / 100);
      const spX = typeof level.spawnX === 'number' ? level.spawnX : 90;
      const spY = typeof level.spawnY === 'number' ? level.spawnY : 60;
      const gate = { x: typeof level.gateX === 'number' ? level.gateX : 710, y: typeof level.gateY === 'number' ? level.gateY : 254 };
      const spawnInterval = (level.spawnRate || 20) * 2.5;
      const timeLimit = level.timeLimit || 240;
      const maxTicks = Math.min(opts.maxTicks || Infinity, timeLimit * 60);
      const stallTicks = opts.stallTicks || 600;

      const budget = Object.assign({}, opts.skills || level.skills || {});
      const movingPlatforms = [], jumpPads = [];
      for (const el of (level.elements || [])) {
        if (el.type === 'movingPlatform' && MovingPlatform) movingPlatforms.push(new MovingPlatform(el));
        else if (el.type === 'jumpPad' && JumpPad) jumpPads.push(new JumpPad(el));
      }
      const portalPair = { entry: null, exit: null };

      const units = [];
      let spawnTimer = 180, spawned = 0, rescued = 0, dead = 0;
      let lastGreedyTick = -60, lastEventTick = 0;
      const P = NOOP_PARTICLES;

      let tick = 0;
      for (; tick < maxTicks; tick++) {
        if (tick - lastGreedyTick >= 42) {
          let lead = null;
          for (const u of units) {
            if (u.state === STATE.WALKING && (!lead || u.id < lead.id)) lead = u;
          }
          if (lead) {
            const wx = Math.round(lead.x + lead.dir * 7);
            const wy = Math.round(lead.y - 8);
            const gx = Math.round(lead.x + lead.dir * 9);
            const gy1 = Math.round(lead.y + 4);
            const gy2 = Math.round(lead.y + 26);
            const ux = Math.round(lead.x);
            const uy = Math.round(lead.y + 6);

            let chosen = null;
            if (terrain.isSolid(wx, wy)) {
              if (budget.bash > 0 && !terrain.isSteel(wx, wy)) chosen = 'bash';
              else if (budget.climb > 0 && !lead.hasMagnetizer) chosen = 'climb';
              else if (budget.bomb > 0 && !(lead.bombTimer > 0)) chosen = 'bomb';
            } else if (!terrain.isSolid(gx, gy1) && !terrain.isSolid(gx, gy2)) {
              if (budget.build > 0) chosen = 'build';
            } else if (Math.abs(lead.x - gate.x) <= 24 && gate.y > lead.y + 24 && terrain.isSolid(ux, uy) && !terrain.isSteel(ux, uy)) {
              if (budget.drill > 0) chosen = 'drill';
              else if (budget.mine > 0) chosen = 'mine';
            }

            if (chosen) {
              const res = SkillRules.apply(terrain, lead, chosen, P);
              if (res.applied) {
                budget[chosen]--;
                lastGreedyTick = tick;
                lastEventTick = tick;
              }
            }
          }
          if (budget.float > 0) {
            const falling = units.find(u => u.state === STATE.FALLING && !u.hasAntiGrav && u.fallDistance > 45);
            if (falling) {
              const res = SkillRules.apply(terrain, falling, 'float', P);
              if (res.applied) {
                budget.float--;
                lastEventTick = tick;
              }
            }
          }
        }

        if (spawned < total) {
          spawnTimer += 1;
          if (spawnTimer >= spawnInterval) {
            spawnTimer = 0; spawned++;
            units.push(new NanoUnit(spawned, spX, spY, 1));
            lastEventTick = tick;
          }
        }
        for (const p of movingPlatforms) p.update(1.0);
        for (const pad of jumpPads) pad.update(1.0);

        let active = 0;
        for (const u of units) {
          const prev = u.state;
          u.update(terrain, P, gate, portalPair, units, 1.0, movingPlatforms, jumpPads);
          if (u.state === STATE.EXITING && prev !== STATE.EXITING) { rescued++; lastEventTick = tick; }
          if (u.state === STATE.DEAD && prev !== STATE.DEAD) { dead++; lastEventTick = tick; }
          if (u.state !== STATE.DEAD && u.state !== STATE.EXITING) active++;
          if (prev !== u.state) lastEventTick = tick;
        }

        if (spawned >= total && active === 0) break;
        if (rescued >= need) break;
        if (rescued + active + (total - spawned) < need) break;
        if (spawned >= total && tick - lastEventTick > stallTicks) break;
      }

      return { cleared: rescued >= need, rescued, dead, total, need, ticks: tick };
    }
  };

  root.ForgeSim = ForgeSim;
  if (typeof module !== 'undefined' && module.exports) module.exports = { ForgeSim };
})(typeof self !== 'undefined' ? self : (typeof globalThis !== 'undefined' ? globalThis : this));
