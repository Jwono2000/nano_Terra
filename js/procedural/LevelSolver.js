/**
 * LevelSolver.js — 픽셀 기반 레밍즈 스타일 맵을 위한 "독립 솔버 + 난이도 평가기" 킷 (JavaScript)
 *
 *  구성 (PDF 8장의 구조를 JS/픽셀 기반 levelData 에 맞춰 분리)
 *    ┌ PixelTerrain        : 800×450 픽셀 지형 (copy-on-write → 탐색 중 분기 복제가 저렴)
 *    ├ ReferencePhysics    : ★참조용★ 헤드리스 물리 어댑터. 게임 엔진의 Lemming/Terrain 로직으로 반드시 교체할 것
 *    ├ LevelSolver         : 매크로 액션(=스킬 사용 시점) 최적 우선 탐색 + 리플레이 + 타이밍 허용오차 + 대체해답 수
 *    ├ DifficultyEvaluator : PDF 14p 공식을 확장한 점수/밴드 분류
 *    └ createDefault()     : 참조 물리로 묶은 기본 인스턴스 (브라우저에서는 window.LevelSolver)
 *
 *  핵심 아이디어
 *    - "대표 레밍 1마리" 근사: 첫 레밍의 경로만 탐색하고, 나머지는 같은 길을 따라온다고 가정한다.
 *      (bomb/block 처럼 레밍을 희생하는 스킬은 '대표 교체 + lost 카운트'로 모델링 → 구출 쿼터 압박이 자연스럽게 반영)
 *    - 매 프레임이 아니라 "결정 지점(착지/방향전환/벽/스킬종료/32px 보행)" 에서만 분기한다.
 *    - 지형 수정은 액션 목록으로 결정되므로, (양자화 위치, 상태, 남은 스킬, 액션 서명) 으로 중복 상태를 제거한다.
 *
 *  ⚠ ReferencePhysics 의 규칙은 실제 게임과 다르다. PDF 4p: "생성기/솔버의 물리와 게임의 물리는 같아야 한다".
 *    → GameAdapter.template.js 를 참고해 게임 엔진을 감싼 어댑터를 만들고 new LevelSolver(adapter) 로 교체하라.
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else {
    const kit = factory();
    root.LevelSolverKit = kit;
    root.LevelSolver = kit.createDefault();   // 편의용 기본 인스턴스 (참조 물리)
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const SKILLS = ['climb', 'float', 'bash', 'mine', 'drill', 'bomb', 'build', 'block', 'portal'];
  const now = () => (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();

  // ------------------------------------------------------------------------------------------
  // 1. PixelTerrain — copy-on-write 픽셀 지형
  // ------------------------------------------------------------------------------------------
  const AIR = 0, DIRT = 1, STEEL = 2;

  class PixelTerrain {
    constructor(w, h, base, over) {
      this.w = w; this.h = h;
      this.base = base || new Uint8Array(w * h);
      this.over = over || new Map();       // index → value (base 와 다른 픽셀만)
    }
    get(x, y) {
      if (x < 0 || x >= this.w) return STEEL;   // 좌우 화면 끝 = 벽
      if (y < 0 || y >= this.h) return AIR;     // 위/아래 = 허공 (아래로 나가면 사망)
      const i = y * this.w + x;
      const o = this.over.get(i);
      return o === undefined ? this.base[i] : o;
    }
    set(x, y, v) {
      if (x < 0 || x >= this.w || y < 0 || y >= this.h) return;
      const i = y * this.w + x;
      if (this.base[i] === v) this.over.delete(i);
      else this.over.set(i, v);
    }
    isSolid(x, y) { return this.get(x, y) !== AIR; }
    clone() { return new PixelTerrain(this.w, this.h, this.base, new Map(this.over)); }
    modifiedCount() { return this.over.size; }
    /** 원(circle) 안의 흙 제거 (강철 제외) */
    clearCircle(cx, cy, r) {
      let n = 0;
      for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
        if (x * x + y * y > r * r) continue;
        if (this.get(cx + x, cy + y) === DIRT) { this.set(cx + x, cy + y, AIR); n++; }
      }
      return n;
    }
  }

  /** 에디터 levelData.elements → 픽셀 지형. (게임의 StageDataEngine.buildTerrainFromData 와 동일해야 함!) */
  function rasterize(level, phys) {
    const t = new PixelTerrain(phys.width, phys.height);
    const els = level.elements || [];
    for (const el of els) {
      if (![ 'platform', 'steelBarrier', 'rockWall', 'craggyRock', 'volcanicBasalt', 'quantumCrystal' ].includes(el.type)) continue;
      const v = el.type === 'steelBarrier' ? STEEL : DIRT;
      const x0 = Math.max(0, Math.round(el.x)), x1 = Math.min(phys.width, Math.round(el.x + el.w));
      const hasProfile = Array.isArray(el.profile) && el.profile.length > 0 &&
        (el.type === 'craggyRock' || el.type === 'volcanicBasalt' || el.type === 'quantumCrystal');
      for (let x = x0; x < x1; x++) {
        let top = el.y;
        if (hasProfile) {
          const segW = el.w / el.profile.length;
          const idx = Math.min(el.profile.length - 1, Math.floor((x - el.x) / segW));
          const colH = Math.min(el.h, Math.max(0, el.profile[idx] || 0));
          top = el.y + el.h - colH;
        }
        const y0 = Math.max(0, Math.round(top)), y1 = Math.min(phys.height, Math.round(el.y + el.h));
        for (let y = y0; y < y1; y++) {
          const i = y * phys.width + x;
          if (v === STEEL || t.base[i] === AIR) t.base[i] = v;   // 강철이 흙을 덮어씀
        }
      }
    }
    return t;
  }

  // ------------------------------------------------------------------------------------------
  // 2. ReferencePhysics — ★참조용★ 헤드리스 물리 어댑터
  // ------------------------------------------------------------------------------------------
  const DEFAULT_PHYSICS = {
    width: 800, height: 450, fps: 60,
    initialDir: 1,
    walkSpeed: 1.25, stepUp: 8, stepDown: 6,
    fallSpeed: 3.2, floatSpeed: 1.2, floatOpenDist: 20, lethalFall: 96,
    lemH: 18,
    climbSpeed: 1.35,
    buildBricks: 12, brickW: 6, brickRun: 4, brickRise: 2, brickFrames: 4,   // 12장 → 24px 상승 / 48px 전진
    bashReach: 6, bashFrames: 2, bashStopLook: 14, bashGraceFrames: 40,
    mineStepX: 2, mineStepY: 2, mineFrames: 2, mineHalfW: 6,
    drillHalfW: 8, drillStep: 2, drillFrames: 2,
    bombDelay: 60, bombRadius: 24,          // 발 위치 중심 반경 24px → 20px 바닥을 뚫는다
    blockHalfW: 6,
    spawnInterval: 50,
    gateHalfW: 24, gateHalfH: 26,
    walkTickPx: 32,
    lookAhead: 6,            // 벽/낭떠러지 사전 감지 거리(px) → 'wallNear' / 'edgeNear' 결정 지점
    allowBlock: false,       // 대표 레밍 모델에서는 블로커의 군중 제어 효과를 표현할 수 없어 기본 OFF (다중 레밍 시뮬에서 ON)
    // 스킬별로 "분기해 볼 가치가 있는 결정 지점" — 탐색 폭발을 막는 핵심 가지치기
    skillContexts: {
      climb: ['wallNear', 'turned', 'spawned', 'edge', 'landed'],
      float: ['spawned', 'edgeNear', 'edge', 'landed'],
      build: ['edgeNear', 'wallNear', 'turned', 'landed', 'actionEnd', 'buildBlocked', 'climbTop', 'steelHit'],
      bash:  ['wallNear', 'turned', 'landed', 'actionEnd', 'walkTick', 'steelHit', 'buildBlocked'],
      mine:  ['walkTick', 'landed', 'wallNear', 'turned', 'actionEnd', 'edgeNear', 'steelHit'],
      drill: ['walkTick', 'landed', 'wallNear', 'turned', 'actionEnd', 'edgeNear', 'steelHit'],
      bomb:  ['wallNear', 'turned', 'walkTick', 'landed', 'steelHit'],
      block: ['walkTick', 'landed']
    }
  };

  class ReferencePhysics {
    constructor(cfg) {
      this.name = 'reference';
      this.cfg = Object.assign({}, DEFAULT_PHYSICS, cfg || {});
    }

    createSim(level, opts) {
      const P = this.cfg;
      const skills = {};
      SKILLS.forEach(k => { skills[k] = (level.skills && level.skills[k]) | 0; });
      if (opts && opts.zeroSkills) SKILLS.forEach(k => { skills[k] = 0; });
      const sim = {
        level, P,
        terrain: rasterize(level, P),
        frame: 0,
        skills,
        lem: null,
        spawned: 0, lost: 0,
        blockers: [],
        actions: [],
        done: null, reason: null,
        pendingSpawnAt: 0,
        timeLimitFrames: Math.max(60, (level.timeLimit || 240) * P.fps),
        totalUnits: Math.max(1, level.totalUnits | 0 || 1),
        needPercent: level.needPercent || 0,
        record: !!(opts && opts.record),
        trail: [], deaths: []
      };
      return sim;
    }

    clone(sim) {
      return Object.assign({}, sim, {
        terrain: sim.terrain.clone(),
        skills: Object.assign({}, sim.skills),
        lem: sim.lem ? Object.assign({}, sim.lem) : null,
        blockers: sim.blockers.slice(),
        actions: sim.actions.slice(),
        trail: sim.record ? sim.trail.slice() : sim.trail,
        deaths: sim.deaths.slice()
      });
    }

    getState(sim) {
      const L = sim.lem;
      return {
        frame: sim.frame, done: sim.done, reason: sim.reason,
        x: L ? L.x : sim.level.spawnX, y: L ? L.y : sim.level.spawnY,
        dir: L ? L.dir : this.cfg.initialDir, state: L ? L.state : 'none',
        climber: !!(L && L.climber), floater: !!(L && L.floater),
        skillsLeft: sim.skills, spawned: sim.spawned, lost: sim.lost,
        actions: sim.actions
      };
    }

    /**
     * 중복 상태 키. 지형을 바꾸는 액션(bash/mine/drill/bomb/build)과 블로커 위치만 서명에 넣는다.
     * climb/float 는 레밍 플래그에 이미 반영되고, lost(희생 수)는 키에서 제외 → "같은 상황에 더 늦게/더 많이 잃고 도달"한
     * 상태는 자동으로 지배(dominated)되어 가지치기된다 (best-first 는 더 이른 프레임을 먼저 꺼내므로).
     */
    key(sim) {
      const L = sim.lem;
      const sk = SKILLS.map(k => sim.skills[k]).join('');
      const acts = sim.actions.filter(a => a.skill !== 'climb' && a.skill !== 'float' && a.skill !== 'block')
        .map(a => a.skill[0] + (a.x >> 3) + ':' + (a.y >> 3)).join('.');
      const blk = sim.blockers.map(b => (b.x >> 2) + ':' + (b.y >> 2)).join('.');
      const lem = L ? `${L.x >> 2},${L.y >> 2},${L.dir},${L.state},${L.climber ? 1 : 0}${L.floater ? 1 : 0}${L.bombTimer > 0 ? 1 : 0}` : 'none';
      return `${lem}|${sk}|${acts}|${blk}`;
    }

    // ---- 스킬 ----
    /**
     * 지금 이 순간 "물리적으로 의미 있는" 스킬 목록.
     * events(직전 결정 지점의 이벤트)를 주면 skillContexts 로 추가 가지치기 (탐색용). null 이면 규칙만 검사 (리플레이용).
     */
    applicableSkills(sim, events) {
      const L = sim.lem, S = sim.skills, P = this.cfg;
      if (!L || sim.done) return [];
      const ctxOk = (skill) => {
        if (!events || !P.skillContexts || !P.skillContexts[skill]) return true;
        return events.some(e => P.skillContexts[skill].indexOf(e) >= 0);
      };
      const out = [];
      const walking = L.state === 'walk';
      const airborne = L.state === 'fall';
      if (S.climb > 0 && !L.climber && (walking || airborne) && ctxOk('climb')) out.push('climb');
      if (S.float > 0 && !L.floater && (walking || airborne) && ctxOk('float')) out.push('float');
      if (walking) {
        if (S.build > 0 && ctxOk('build')) out.push('build');
        if (S.bash > 0 && ctxOk('bash') && this._dirtAhead(sim, L, P.bashStopLook + Math.ceil(P.bashGraceFrames / P.bashFrames))) out.push('bash');
        if (S.mine > 0 && ctxOk('mine') && (this._dirtAhead(sim, L, 12) || this._dirtBelow(sim, L, 12))) out.push('mine');
        if (S.drill > 0 && ctxOk('drill') && this._dirtBelow(sim, L, 12)) out.push('drill');
        if (S.bomb > 0 && L.bombTimer < 0 && ctxOk('bomb') && (this._dirtAhead(sim, L, 30) || this._dirtBelow(sim, L, 8))) out.push('bomb');
        if (S.block > 0 && P.allowBlock && ctxOk('block')) out.push('block');
      }
      return out;
    }

    applySkill(sim, skill) {
      const L = sim.lem;
      if (!L || sim.done || !(sim.skills[skill] > 0)) return false;
      if (this.applicableSkills(sim, null).indexOf(skill) < 0) return false;
      sim.skills[skill]--;
      sim.actions.push({ frame: sim.frame, skill, x: L.x, y: L.y, dir: L.dir });
      switch (skill) {
        case 'climb': L.climber = true; break;
        case 'float': L.floater = true; break;
        case 'build': L.state = 'build'; L.bricks = 0; L.actionTimer = 0; break;
        case 'bash': L.state = 'bash'; L.actionTimer = 0; L.graceLeft = this.cfg.bashGraceFrames; break;
        case 'mine': L.state = 'mine'; L.actionTimer = 0; break;
        case 'drill': L.state = 'drill'; L.actionTimer = 0; break;
        case 'bomb': L.bombTimer = this.cfg.bombDelay; break;
        case 'block':
          sim.blockers.push({ x: L.x, y: L.y });
          this._loseLemming(sim, 'blocker');   // 블로커는 구출되지 않음 (대표 교체)
          break;
        default: return false;
      }
      return true;
    }

    // ---- 1프레임 진행. 반환: 결정 지점 이벤트 배열 ----
    step(sim) {
      const ev = [];
      if (sim.done) return ev;
      const P = this.cfg;
      sim.frame++;
      if (sim.frame > sim.timeLimitFrames) { this._fail(sim, 'time'); return ev; }

      if (!sim.lem) {
        if (sim.frame >= sim.pendingSpawnAt) { this._spawn(sim); ev.push('spawned'); }
        return ev;
      }
      const L = sim.lem;

      if (L.bombTimer > 0) {
        L.bombTimer--;
        if (L.bombTimer === 0) {
          sim.terrain.clearCircle(L.x, L.y, P.bombRadius);
          if (sim.record) sim.deaths.push({ x: L.x, y: L.y, reason: 'bomb', frame: sim.frame });
          this._loseLemming(sim, 'bomb');
          ev.push('exploded');
          return ev;
        }
      }

      switch (L.state) {
        case 'walk': this._stepWalk(sim, L, ev); break;
        case 'fall': this._stepFall(sim, L, ev); break;
        case 'climb': this._stepClimb(sim, L, ev); break;
        case 'build': this._stepBuild(sim, L, ev); break;
        case 'bash': this._stepBash(sim, L, ev); break;
        case 'mine': this._stepMine(sim, L, ev); break;
        case 'drill': this._stepDrill(sim, L, ev); break;
      }

      if (sim.lem && !sim.done) {
        if (sim.record && (sim.frame % 4 === 0)) sim.trail.push({ x: L.x, y: L.y, f: sim.frame });
        if (this._inGate(sim, L)) this._save(sim);
      }
      return ev;
    }

    // ---- 내부 ----
    _spawn(sim) {
      const lv = sim.level;
      sim.spawned++;
      sim.lem = {
        x: Math.round(lv.spawnX), y: Math.round(lv.spawnY), dir: this.cfg.initialDir,
        state: 'fall', fallStart: Math.round(lv.spawnY), fallDist: 0,
        climber: false, floater: false, bombTimer: -1, bricks: 0, actionTimer: 0, walked: 0,
        nearWall: false, nearEdge: false
      };
    }
    _fail(sim, reason) { sim.done = 'failed'; sim.reason = reason; }
    _save(sim) {
      const survivors = sim.totalUnits - sim.lost;
      if (survivors / sim.totalUnits * 100 < sim.needPercent) { this._fail(sim, 'quota'); return; }
      sim.done = 'saved'; sim.reason = 'saved';
    }
    _loseLemming(sim, reason) {
      sim.lost++;
      sim.lem = null;
      const survivors = sim.totalUnits - sim.lost;
      if (survivors / sim.totalUnits * 100 < sim.needPercent) { this._fail(sim, 'quota'); return; }
      if (sim.spawned >= sim.totalUnits) { this._fail(sim, 'noLemmings'); return; }
      sim.pendingSpawnAt = sim.frame + this.cfg.spawnInterval;
    }
    _die(sim, L, reason, ev) {
      if (sim.record) sim.deaths.push({ x: L.x, y: L.y, reason, frame: sim.frame });
      this._loseLemming(sim, reason);
      ev.push('died');
    }
    _inGate(sim, L) {
      if (L.state === 'fall' || L.state === 'climb') return false;
      const lv = sim.level, P = this.cfg;
      return Math.abs(L.x - lv.gateX) <= P.gateHalfW && Math.abs(L.y - lv.gateY) <= P.gateHalfH;
    }
    _dirtAhead(sim, L, dist) {
      const t = sim.terrain, P = this.cfg;
      for (let c = 1; c <= dist; c++) {
        const cx = L.x + L.dir * c;
        for (let r = 0; r <= P.lemH - 2; r++) if (t.get(cx, L.y - r) === DIRT) return true;
      }
      return false;
    }
    _dirtBelow(sim, L, dist) {
      const t = sim.terrain;
      for (let r = 1; r <= dist; r++) if (t.get(L.x, L.y + r) === DIRT) return true;
      return false;
    }

    _stepWalk(sim, L, ev) {
      const P = this.cfg, t = sim.terrain;
      for (const b of sim.blockers) {
        if (Math.abs(L.x - b.x) <= P.blockHalfW && Math.abs(L.y - b.y) <= P.lemH) {
          L.dir = -L.dir; L.x += L.dir * 2; ev.push('turned'); return;
        }
      }
      if (!t.isSolid(L.x, L.y + 1)) {
        let found = false;
        for (let k = 2; k <= P.stepDown + 1; k++) {
          if (t.isSolid(L.x, L.y + k)) { L.y += k - 1; found = true; break; }
        }
        if (!found) { L.state = 'fall'; L.fallStart = L.y; L.fallDist = 0; ev.push('edge'); return; }
      }
      const nx = L.x + L.dir * P.walkSpeed;
      if (nx < 0 || nx >= P.width) { L.dir = -L.dir; ev.push('turned'); return; }
      if (t.isSolid(nx, L.y)) {
        let k = 1;
        while (k <= P.stepUp && t.isSolid(nx, L.y - k)) k++;
        if (k <= P.stepUp && !t.isSolid(nx, L.y - k - P.lemH + 1)) {
          L.x = nx; L.y = L.y - k;
        } else {
          if (L.climber && !t.isSolid(L.x, L.y - P.lemH - 1)) { L.state = 'climb'; ev.push('wallClimb'); return; }
          L.dir = -L.dir; ev.push('turned'); return;
        }
      } else {
        L.x = nx;
      }
      L.walked += P.walkSpeed;
      if (L.walked >= P.walkTickPx) { L.walked = 0; ev.push('walkTick'); }
      // 사전 감지: 벽/낭떠러지가 lookAhead px 안에 있으면 1회 결정 지점 발생 (정밀한 스킬 타이밍용)
      const wallAhead = this._wallAhead(sim, L, P.lookAhead);
      if (wallAhead && !L.nearWall) { L.nearWall = true; ev.push('wallNear'); } else if (!wallAhead) L.nearWall = false;
      const edgeAhead = this._edgeAhead(sim, L, P.lookAhead);
      if (edgeAhead && !L.nearEdge) { L.nearEdge = true; ev.push('edgeNear'); } else if (!edgeAhead) L.nearEdge = false;
    }
    _wallAhead(sim, L, dist) {
      const t = sim.terrain, P = this.cfg;
      for (let c = 1; c <= dist; c++) {
        const cx = L.x + L.dir * c;
        if (cx < 0 || cx >= P.width) return true;
        if (t.isSolid(cx, L.y) && t.isSolid(cx, L.y - P.stepUp - 1)) return true;
      }
      return false;
    }
    _edgeAhead(sim, L, dist) {
      const t = sim.terrain, P = this.cfg;
      for (let c = 1; c <= dist; c++) {
        const cx = L.x + L.dir * c;
        if (t.isSolid(cx, L.y)) return false;             // 오르막이면 낭떠러지 아님
        let ground = false;
        for (let k = 1; k <= P.stepDown + 1; k++) if (t.isSolid(cx, L.y + k)) { ground = true; break; }
        if (!ground) return true;
      }
      return false;
    }

    _stepFall(sim, L, ev) {
      const P = this.cfg, t = sim.terrain;
      const speed = (L.floater && L.fallDist > P.floatOpenDist) ? P.floatSpeed : P.fallSpeed;
      for (let i = 0; i < speed; i++) {
        L.y += 1; L.fallDist = L.y - L.fallStart;
        if (L.y >= P.height) { this._die(sim, L, 'fellOut', ev); return; }
        if (t.isSolid(L.x, L.y + 1)) {
          if (L.fallDist > P.lethalFall && !L.floater) { this._die(sim, L, 'splat', ev); return; }
          L.state = 'walk'; L.fallDist = 0; ev.push('landed'); return;
        }
      }
    }

    _stepClimb(sim, L, ev) {
      const P = this.cfg, t = sim.terrain;
      const wx = L.x + L.dir;
      for (let i = 0; i < P.climbSpeed; i++) {
        if (t.isSolid(L.x, L.y - P.lemH)) {            // 머리 위 천장 → 떨어짐
          L.dir = -L.dir; L.x += L.dir; L.state = 'fall'; L.fallStart = L.y; L.fallDist = 0;
          ev.push('climbFail'); return;
        }
        L.y -= 1;
        if (L.y < 0) { L.dir = -L.dir; L.state = 'fall'; L.fallStart = 0; ev.push('climbFail'); return; }
        if (!t.isSolid(wx, L.y)) {                      // 벽 꼭대기 도달
          L.x = wx; L.state = 'walk'; ev.push('climbTop'); return;
        }
      }
    }

    _stepBuild(sim, L, ev) {
      const P = this.cfg, t = sim.terrain;
      L.actionTimer++;
      if (L.actionTimer % P.brickFrames !== 0) return;
      if (L.bricks >= P.buildBricks) { L.state = 'walk'; ev.push('actionEnd'); return; }
      const nx = L.x + L.dir * P.brickRun, ny = L.y - P.brickRise;
      if (nx < 0 || nx >= P.width || t.isSolid(nx, ny) || t.isSolid(nx, ny - P.lemH + 1) || t.isSolid(L.x, L.y - P.lemH - P.brickRise)) {
        L.dir = -L.dir; L.state = 'walk'; ev.push('buildBlocked'); return;
      }
      for (let i = 1; i <= P.brickW; i++) {
        const bx = L.x + L.dir * i;
        for (let r = 1; r <= P.brickRise; r++) {
          const by = ny + r;
          if (t.get(bx, by) === AIR) t.set(bx, by, DIRT);
        }
      }
      L.x = nx; L.y = ny; L.bricks++;
    }

    _stepBash(sim, L, ev) {
      const P = this.cfg, t = sim.terrain;
      L.actionTimer++;
      let steel = false;
      for (let c = 1; c <= P.bashReach; c++) {
        const cx = L.x + L.dir * c;
        for (let r = 0; r <= P.lemH; r++) {
          const v = t.get(cx, L.y - r);
          if (v === STEEL && r >= 2 && r <= P.lemH - 2) steel = true;
          else if (v === DIRT) t.set(cx, L.y - r, AIR);
        }
      }
      if (steel) { L.dir = -L.dir; L.state = 'walk'; ev.push('steelHit'); return; }
      let dirtAhead = false;
      for (let c = 1; c <= P.bashStopLook && !dirtAhead; c++) {
        const cx = L.x + L.dir * c;
        for (let r = 2; r <= P.lemH - 2; r++) if (t.get(cx, L.y - r) === DIRT) { dirtAhead = true; break; }
      }
      if (!dirtAhead) {
        L.graceLeft = (L.graceLeft | 0) - 1;
        if (L.graceLeft <= 0) { L.state = 'walk'; ev.push('actionEnd'); return; }
      } else L.graceLeft = P.bashGraceFrames;
      if (L.actionTimer % P.bashFrames === 0) {
        L.x += L.dir;
        if (!t.isSolid(L.x, L.y + 1)) { L.state = 'fall'; L.fallStart = L.y; L.fallDist = 0; ev.push('edge'); }
      }
    }

    _stepMine(sim, L, ev) {
      const P = this.cfg, t = sim.terrain;
      L.actionTimer++;
      if (L.actionTimer % P.mineFrames !== 0) return;
      const nx = L.x + L.dir * P.mineStepX, ny = L.y + P.mineStepY;
      if (t.get(nx, ny) === STEEL || t.get(nx, ny + 1) === STEEL) { L.dir = -L.dir; L.state = 'walk'; ev.push('steelHit'); return; }
      for (let c = 0; c <= P.mineHalfW * 2; c++) {
        const cx = L.x + L.dir * c;
        for (let r = 0; r <= P.lemH + 1; r++) {          // 새 발 위치(ny) 위쪽만 판다 → 발 밑은 남겨 둔다
          if (t.get(cx, ny - r) === DIRT) t.set(cx, ny - r, AIR);
        }
      }
      L.x = nx; L.y = ny;
      if (L.x < 0 || L.x >= P.width) { L.dir = -L.dir; L.state = 'walk'; ev.push('turned'); return; }
      if (L.y >= P.height - 1) { this._die(sim, L, 'fellOut', ev); return; }
      if (!t.isSolid(L.x, L.y + 1)) { L.state = 'fall'; L.fallStart = L.y; L.fallDist = 0; ev.push('actionEnd'); return; }
      if (!this._dirtAhead(sim, L, 6) && !this._dirtBelow(sim, L, 3)) { L.state = 'walk'; ev.push('actionEnd'); }
    }

    _stepDrill(sim, L, ev) {
      const P = this.cfg, t = sim.terrain;
      L.actionTimer++;
      if (L.actionTimer % P.drillFrames !== 0) return;
      for (let r = 1; r <= P.drillStep; r++) {
        if (t.get(L.x, L.y + r) === STEEL) { L.state = 'walk'; ev.push('steelHit'); return; }
      }
      for (let dx = -P.drillHalfW; dx <= P.drillHalfW; dx++) {
        for (let r = 1; r <= P.drillStep; r++) {
          if (t.get(L.x + dx, L.y + r) === DIRT) t.set(L.x + dx, L.y + r, AIR);
        }
      }
      L.y += P.drillStep;
      if (L.y >= P.height - 1) { this._die(sim, L, 'fellOut', ev); return; }
      if (!t.isSolid(L.x, L.y + 1)) { L.state = 'fall'; L.fallStart = L.y; L.fallDist = 0; ev.push('actionEnd'); }
    }
  }

  // ------------------------------------------------------------------------------------------
  // 3. MinHeap
  // ------------------------------------------------------------------------------------------
  class MinHeap {
    constructor() { this.a = []; }
    get size() { return this.a.length; }
    push(n) { const a = this.a; a.push(n); let i = a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (a[p].f <= a[i].f) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } }
    pop() {
      const a = this.a; if (!a.length) return null;
      const top = a[0], last = a.pop();
      if (a.length) { a[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < a.length && a[l].f < a[m].f) m = l; if (r < a.length && a[r].f < a[m].f) m = r; if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; } }
      return top;
    }
  }

  // ------------------------------------------------------------------------------------------
  // 4. LevelSolver — 매크로 액션 탐색
  // ------------------------------------------------------------------------------------------
  const DEFAULT_SOLVER = {
    maxNodes: 4000,          // 확장(pop) 상한
    maxMillis: 1500,         // 시간 상한 (ms)
    maxDepth: 10,            // 최대 스킬 사용 수
    maxFramesPerStep: 600,   // 결정 지점 사이 최대 프레임
    skillCost: 3.0,          // 스킬 1개 = 3초 페널티 (적은 스킬 선호)
    solutionLimit: 1,
    verticalWeight: 0.6,
    criticalFrames: 10,      // 허용오차(early+late, px≈frame)가 이 값 미만이면 critical action
    timingLadder: [1, 2, 3, 5, 8, 12, 20, 30, 45, 60, 90, 120]
  };

  class LevelSolver {
    constructor(adapter, opts) {
      this.adapter = adapter || new ReferencePhysics();
      this.opts = Object.assign({}, DEFAULT_SOLVER, opts || {});
      this.adapterName = this.adapter.name || 'custom';
    }

    heuristic(st, level, o) {
      const fps = (this.adapter.cfg && this.adapter.cfg.fps) || 60;
      const ws = (this.adapter.cfg && this.adapter.cfg.walkSpeed) || 1;
      return (Math.abs(level.gateX - st.x) / ws + Math.abs(level.gateY - st.y) * o.verticalWeight) / fps;
    }

    /** 결정 지점까지 진행 */
    advance(sim, maxFrames) {
      const ad = this.adapter;
      for (let i = 0; i < maxFrames; i++) {
        const ev = ad.step(sim);
        if (sim.done) return ev.length ? ev : ['done'];
        if (ev.length) return ev;
      }
      return ['timeout'];
    }

    /**
     * 반복 심화(iterative deepening) 래퍼: 스킬 0개, 1개, 2개 … 순으로 탐색 → 처음 찾은 해답이 "최소 스킬 수" 해답이다.
     * (requiredSkills 가 과대평가되면 난이도 점수가 부풀므로 중요). iterative:false 면 단일 최적우선 탐색.
     */
    solve(level, opts) {
      const o = Object.assign({}, this.opts, { iterative: true }, opts || {});
      if (!o.iterative) return this._search(level, o);
      const t0 = now();
      let totalNodes = 0, totalGenerated = 0, totalDead = 0, last = null;
      for (let d = 0; d <= o.maxDepth; d++) {
        const remaining = o.maxMillis - (now() - t0);
        if (remaining <= 0) break;
        const r = this._search(level, Object.assign({}, o, { maxDepth: d, maxMillis: remaining, maxNodes: o.maxNodes - totalNodes }));
        totalNodes += r.nodes; totalGenerated += r.generated; totalDead += r.deadEnds;
        last = r;
        if (r.solvable || r.reason.startsWith('budget')) break;
        if (totalNodes >= o.maxNodes) break;
      }
      if (!last) return { solvable: false, plan: null, reason: 'budget:time', nodes: 0, generated: 0, deadEnds: 0, solutions: [], elapsedMs: Math.round(now() - t0) };
      return Object.assign({}, last, { nodes: totalNodes, generated: totalGenerated, deadEnds: totalDead, elapsedMs: Math.round(now() - t0) });
    }

    _search(level, opts) {
      const o = Object.assign({}, this.opts, opts || {});
      const ad = this.adapter;
      const fps = (ad.cfg && ad.cfg.fps) || 60;
      const t0 = now(), deadline = t0 + o.maxMillis;
      const heap = new MinHeap();
      const visited = new Set();
      let expanded = 0, generated = 1, deadEnds = 0, pruned = 0, longSteps = 0;
      const solutions = [];
      const failReasons = {};

      const pushNode = (sim, plan, depth) => {
        const st = ad.getState(sim);
        const g = st.frame / fps + plan.length * o.skillCost;
        const h = this.heuristic(st, level, o);
        heap.push({ sim, plan, depth, g, h, f: g + h });
      };
      pushNode(ad.createSim(level, o.simOpts), [], 0);

      while (heap.size && expanded < o.maxNodes && now() < deadline) {
        const node = heap.pop();
        const k = ad.key(node.sim);
        if (visited.has(k)) { pruned++; continue; }
        visited.add(k);
        expanded++;

        const events = this.advance(node.sim, o.maxFramesPerStep);
        const st = ad.getState(node.sim);
        if (st.done === 'saved') {
          solutions.push({ plan: node.plan, frames: st.frame, lost: st.lost, foundAtNode: expanded });
          if (solutions.length >= o.solutionLimit) break;
          continue;
        }
        if (st.done === 'failed') { deadEnds++; failReasons[st.reason] = (failReasons[st.reason] || 0) + 1; continue; }
        if (events[0] === 'timeout') {           // 긴 액션(터널 등) 진행 중 — 분기 없이 계속
          longSteps++;
          pushNode(node.sim, node.plan, node.depth);
          continue;
        }

        // 1) 스킬 없이 계속
        pushNode(node.sim, node.plan, node.depth);
        // 2) 이 시점에 스킬 사용
        if (node.depth < o.maxDepth) {
          for (const sk of ad.applicableSkills(node.sim, events)) {
            if (o.forbid && o.forbid(node.plan, sk, st)) continue;
            const c = ad.clone(node.sim);
            if (!ad.applySkill(c, sk)) continue;
            const cst = ad.getState(c);
            pushNode(c, node.plan.concat([{ frame: cst.frame, skill: sk, x: cst.x, y: cst.y, dir: cst.dir, state: cst.state }]), node.depth + 1);
            generated++;
          }
        }
      }

      solutions.sort((a, b) => (a.plan.length - b.plan.length) || (a.frames - b.frames));
      const best = solutions[0] || null;
      const budgetHit = expanded >= o.maxNodes ? 'nodes' : (now() >= deadline ? 'time' : (heap.size === 0 ? 'exhausted' : null));
      return {
        solvable: !!best,
        plan: best ? best.plan : null,
        frames: best ? best.frames : null,
        lost: best ? best.lost : null,
        requiredSkills: best ? best.plan.length : null,
        solutions,
        nodes: expanded, generated, pruned, deadEnds, longSteps, failReasons,
        reason: best ? 'ok' : (budgetHit === 'exhausted' ? 'no-solution-in-space' : `budget:${budgetHit}`),
        elapsedMs: Math.round(now() - t0)
      };
    }

    /**
     * 계획 재생.
     *   mode:'frame'   — 기록된 절대 프레임에 스킬 적용 (솔버 결과의 정확한 재현)
     *   mode:'trigger' — 레밍이 기록된 (x, y, dir, state) 에 "도달했을 때" 적용 (사람이 플레이하는 방식; 타이밍 허용오차 측정용)
     * record=true 면 trail/deaths 기록 (에디터 오버레이용)
     */
    replay(level, plan, opts) {
      const ad = this.adapter;
      const o = Object.assign({ record: false, mode: 'frame', maxFrames: 60 * 60 * 10, tolX: 2, tolY: 4 }, opts || {});
      const sim = ad.createSim(level, { record: o.record, zeroSkills: o.zeroSkills });
      const acts = (plan || []).slice();
      if (o.mode === 'frame') acts.sort((a, b) => a.frame - b.frame);
      let i = 0, ok = true, failReason = null;
      const triggered = [];
      const matches = (a, st) => {
        if (a.state === 'fall') return st.state === 'fall' && Math.abs(st.y - a.y) <= o.tolY && Math.abs(st.x - a.x) <= o.tolX;
        return st.state !== 'fall' && st.state !== 'climb' && st.dir === a.dir && Math.abs(st.x - a.x) <= o.tolX && Math.abs(st.y - a.y) <= 8;
      };
      while (!sim.done && sim.frame < o.maxFrames) {
        if (o.mode === 'frame') {
          while (i < acts.length && acts[i].frame <= sim.frame) {
            if (!ad.applySkill(sim, acts[i].skill)) { ok = false; failReason = 'action-not-applicable'; }
            i++;
          }
        } else if (i < acts.length) {
          const st = ad.getState(sim);
          if (matches(acts[i], st)) {
            if (!ad.applySkill(sim, acts[i].skill)) { ok = false; failReason = 'action-not-applicable'; }
            triggered.push(sim.frame);
            i++;
          }
        }
        if (!ok) break;
        ad.step(sim);
      }
      const st = ad.getState(sim);
      if (ok && o.mode === 'trigger' && i < acts.length && st.done !== 'saved') failReason = 'trigger-missed';
      return {
        success: ok && st.done === 'saved',
        reason: failReason || st.reason,
        frames: st.frame, lost: st.lost, triggeredFrames: triggered,
        trail: sim.trail, deaths: sim.deaths, actions: sim.actions,
        modifiedPixels: sim.terrain.modifiedCount ? sim.terrain.modifiedCount() : undefined
      };
    }

    /** 스킬 0개로 대표 레밍이 웜홀에 도달하면 "우연한 지름길" */
    zeroSkillTest(level, opts) {
      const r = this.replay(level, [], Object.assign({ zeroSkills: true, record: true }, opts || {}));
      return { shortcut: r.success, reason: r.reason, frames: r.frames, trail: r.trail, deaths: r.deaths };
    }

    /**
     * 각 액션의 타이밍 허용오차 측정 → critical action 판정.
     * 액션을 "위치 트리거" 로 재생하면서 한 액션의 트리거 위치만 ±k px 옮긴다 (보행 1px/frame 이면 px ≈ frame).
     * early = 얼마나 일찍 눌러도 되는가, late = 얼마나 늦게 눌러도 되는가, window = early + late.
     */
    measureTimingWindows(level, plan, opts) {
      const o = Object.assign({}, this.opts, opts || {});
      const shiftAct = (a, d) => a.state === 'fall' ? Object.assign({}, a, { y: a.y + d }) : Object.assign({}, a, { x: a.x + a.dir * d });
      const shifted = (idx, d) => plan.map((a, j) => j === idx ? shiftAct(a, d) : a);
      const windows = (plan || []).map((act, idx) => {
        let early = 0, late = 0;
        for (const k of o.timingLadder) { if (this.replay(level, shifted(idx, -k), { mode: 'trigger' }).success) early = k; else break; }
        for (const k of o.timingLadder) { if (this.replay(level, shifted(idx, +k), { mode: 'trigger' }).success) late = k; else break; }
        const win = early + late;
        return { index: idx, skill: act.skill, frame: act.frame, x: act.x, y: act.y, early, late, window: win, critical: win < o.criticalFrames };
      });
      return {
        windows,
        criticalActions: windows.filter(w => w.critical).length,
        minWindow: windows.length ? Math.min.apply(null, windows.map(w => w.window)) : null,
        baselineTriggerReplay: this.replay(level, plan, { mode: 'trigger' }).success   // false 면 위치 트리거로 재현 불가(솔버 계획이 '2번째 통과' 등에 의존)
      };
    }

    /** 서로 다른 해답 수 (스킬 순서 + 40px 위치 버킷 기준) */
    countSolutions(level, opts) {
      const o = Object.assign({ limit: 10, maxNodes: this.opts.maxNodes * 2, maxMillis: this.opts.maxMillis }, opts || {});
      const r = this._search(level, { solutionLimit: o.limit * 2, maxNodes: o.maxNodes, maxMillis: o.maxMillis });
      // 서명: 스킬@x버킷(40px). "이미 찾은 더 짧은 해답 + 낭비된 스킬" 은 별개의 해답으로 세지 않는다 (부분수열 검사)
      const isSubseq = (short, long) => { let i = 0; for (const t of long) if (t === short[i]) i++; return i === short.length; };
      const sigs = [];
      r.solutions.map(s => s.plan.map(a => `${a.skill}@${Math.round(a.x / 40)}`))
        .sort((a, b) => a.length - b.length)
        .forEach(sig => { if (!sigs.some(acc => isSubseq(acc, sig))) sigs.push(sig); });
      const distinct = sigs.slice(0, o.limit).map(s => s.join('>'));
      return { count: distinct.length, signatures: distinct, searched: r.nodes, exhausted: r.reason === 'no-solution-in-space' || r.solutions.length < o.limit * 2 };
    }

    /** 스킬 종류 하나만으로 풀리는지 (너무 쉬운 맵 탐지) */
    singleSkillProbe(level, opts) {
      const out = [];
      SKILLS.forEach(k => {
        if (!(level.skills && level.skills[k] > 0)) return;
        const only = {}; SKILLS.forEach(s => { only[s] = 0; }); only[k] = level.skills[k];
        const lv = Object.assign({}, level, { skills: only });
        const r = this.solve(lv, Object.assign({ maxNodes: 1500, maxMillis: 400 }, opts || {}));
        if (r.solvable) out.push({ skill: k, used: r.requiredSkills });
      });
      return out;
    }

    /** 전체 파이프라인: 린트 → 0-스킬 → 솔버 → 타이밍 → 대체해답 → 점수 → 수용 여부 */
    evaluate(level, opts) {
      const o = Object.assign({ targetBand: null, bands: null, probeSingleSkills: false, altLimit: 8, lint: null, minRequiredSkills: 0 }, opts || {});
      const t0 = now();
      const Lint = o.lint || (typeof LevelLint !== 'undefined' ? LevelLint : null);
      const lint = Lint ? Lint.run(level) : null;
      const zero = this.zeroSkillTest(level);
      const solve = this.solve(level, o.solve);
      let timing = null, alternatives = null, score = null, single = null;
      if (solve.solvable) {
        timing = this.measureTimingWindows(level, solve.plan);
        alternatives = this.countSolutions(level, { limit: o.altLimit });
        if (o.probeSingleSkills) single = this.singleSkillProbe(level);
        const fps = (this.adapter.cfg && this.adapter.cfg.fps) || 60;
        const skillsGiven = SKILLS.reduce((s, k) => s + ((level.skills && level.skills[k]) | 0), 0);
        score = DifficultyEvaluator.score({
          nodes: solve.nodes, requiredSkills: solve.requiredSkills, criticalActions: timing.criticalActions,
          deadEnds: solve.deadEnds, expanded: solve.nodes, solutionCount: alternatives.count,
          solutionFrames: solve.frames, timeLimitFrames: (level.timeLimit || 240) * fps,
          skillsGiven, skillsUsed: solve.requiredSkills, needPercent: level.needPercent || 0,
          lost: solve.lost, totalUnits: level.totalUnits || 1
        }, o.bands);
      }
      const reasons = [];
      if (lint && !lint.ok) reasons.push('lint:' + lint.errors.map(e => e.code).join(','));
      if (zero.shortcut) reasons.push('zero-skill-shortcut');
      if (!solve.solvable) reasons.push('unsolvable:' + solve.reason);
      if (single && single.length) reasons.push('single-skill:' + single.map(s => s.skill).join('/'));
      if (solve.solvable && o.minRequiredSkills > 0 && solve.requiredSkills < o.minRequiredSkills) reasons.push(`too-easy:${solve.requiredSkills}<${o.minRequiredSkills}`);
      if (score && o.targetBand && o.targetBand !== 'random' && score.band !== o.targetBand) reasons.push(`band:${score.band}≠${o.targetBand}`);
      return {
        accepted: reasons.length === 0, reasons,
        lint, zeroSkill: zero, solve, timing, alternatives, singleSkill: single,
        score, band: score ? score.band : null,
        adapter: this.adapterName, elapsedMs: Math.round(now() - t0)
      };
    }
  }

  // ------------------------------------------------------------------------------------------
  // 5. DifficultyEvaluator — PDF 14p 공식 확장
  // ------------------------------------------------------------------------------------------
  const DifficultyEvaluator = {
    // PDF 기준 (25/55/100). 에디터는 자체 밴드(45/80/130)를 넘겨 쓸 수 있다 → 반드시 실측으로 캘리브레이션할 것
    BANDS_PDF: [{ key: 'easy', max: 25 }, { key: 'normal', max: 55 }, { key: 'hard', max: 100 }, { key: 'nightmare', max: Infinity }],
    BANDS_EDITOR: [{ key: 'easy', max: 45 }, { key: 'normal', max: 80 }, { key: 'hard', max: 130 }, { key: 'nightmare', max: Infinity }],
    weights: { nodesPerPoint: 50, nodesCap: 40, perSkill: 3, perCritical: 10, deadEndCap: 10, uniquenessBase: 10 },

    score(input, bands) {
      const w = this.weights;
      const deadRatio = input.expanded ? input.deadEnds / input.expanded : 0;
      const timeRatio = input.timeLimitFrames ? input.solutionFrames / input.timeLimitFrames : 0;
      const slack = (input.skillsGiven | 0) - (input.skillsUsed | 0);
      const parts = {
        search: Math.min(input.nodes / w.nodesPerPoint, w.nodesCap),                    // 탐색 비용
        skills: (input.requiredSkills | 0) * w.perSkill,                                 // 필수 스킬 수
        timing: (input.criticalActions | 0) * w.perCritical,                             // 타이밍 정밀도
        deadEnds: Math.min(deadRatio * 20, w.deadEndCap),                                // 오답 위험도
        uniqueness: Math.max(0, w.uniquenessBase - (input.solutionCount | 0)),           // 대체 해답 부족
        time: timeRatio > 0.75 ? 8 : (timeRatio > 0.5 ? 4 : 0),                          // 시간 압박
        slack: slack <= 0 ? 6 : (slack <= 2 ? 3 : 0),                                    // 스킬 여유 없음
        quota: input.needPercent >= 90 ? 5 : (input.needPercent >= 80 ? 2 : 0)           // 구출 쿼터 압박
      };
      const total = Math.round(Object.values(parts).reduce((a, b) => a + b, 0) * 10) / 10;
      return { total, parts, band: this.classify(total, bands) };
    },
    classify(total, bands) {
      const b = bands || this.BANDS_PDF;
      for (const band of b) if (total <= band.max) return band.key;
      return b[b.length - 1].key;
    }
  };

  function createDefault(physicsCfg, solverOpts) {
    return new LevelSolver(new ReferencePhysics(physicsCfg), solverOpts);
  }

  const evaluate = function (level, opts) {
    return createDefault().evaluate(level, opts);
  };
  LevelSolver.evaluate = evaluate;

  return { LevelSolver, ReferencePhysics, PixelTerrain, DifficultyEvaluator, MinHeap, rasterize, createDefault, evaluate, SKILLS, DEFAULT_PHYSICS, DEFAULT_SOLVER, AIR, DIRT, STEEL };
});
