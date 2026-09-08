/* ============================================================================
 * 01_walker.js — 헤드리스 유닛 물리 + 스킬 실행기 (VirtualMapValidator 코어)
 *  - Walker: 800x450 그리드 위 단일 유닛 시뮬레이션
 *  - Sim   : 다중 유닛 + 스킬 트리거 스크립트 + 반응형 정책 + 리포트
 * ==========================================================================*/
(function (root, factory) {
  const C = (typeof require === 'function') ? require('./00_core.js') : root;
  const api = factory(C);
  if (typeof module === 'object' && module.exports) module.exports = api;
  Object.assign(root, api);
})(typeof self !== 'undefined' ? self : this, function (C) {
  'use strict';
  const { PHYS, EMPTY, DESTRUCTIBLE, STEEL, BUILT } = C;

  /* ------------------------------------------------------------ Walker -- */
  class Walker {
    constructor(sim, x, y, dir = 1, id = 0) {
      this.sim = sim; this.g = sim.grid;
      this.id = id;
      this.x = x; this.y = y;          // y = 발바닥(하단) y, 정수 그리드 행 = 첫 solid
      this.dir = dir;
      this.vy = 0;
      this.fallStart = y;
      this.maxFall = 0;
      this.state = 'FALL';
      this.skill = null;               // 지속 스킬: climb/bash/mine/drill/build/float/blocker
      this.skillT = 0;
      this.buildCount = 0;
      this.bombT = -1;
      this.alive = true;
      this.saved = false;
      this.age = 0;
      this.stuckT = 0; this.lastX = x;
      this.usedSkills = [];
      this.log = [];                 // 디버그용 이벤트
      this.portalLock = 0;
      this.flippedByBlocker = -1;
      this.active = true;            // 스폰 지연 중이면 false
      this.spawnFrame = 0;
      this.triggers = null;          // 유닛 전용 트리거 사본(스크립티드 모드)
      this.trace = [];               // 상태 변화 추적(진단용)
      this.climbTop = null;
      this.climbCol = null;
    }
    /* 스킬 굴착: "보호 행(슬랩 상단 = 보행면)"은 절대 지우지 않는다.
     * → 시뮬레이션이 설계를 파괴하는 클래스의 버그를 원천 차단.          */
    carve(x, y, w, h, force) {
      const prot = force ? null : this.sim.protect;
      const x0 = Math.floor(x), y0 = Math.floor(y), x1 = Math.ceil(x + w), y1 = Math.ceil(y + h);
      for (let j = y0; j < y1; j++) {
        if (prot && prot.has(j)) continue;
        for (let i = x0; i < x1; i++) {
          if (this.g.get(i, j) === DESTRUCTIBLE) this.g.set(i, j, EMPTY);
        }
      }
    }
    pushTrace(s) {
      const last = this.trace[this.trace.length - 1];
      if (last && last.s === s) return;
      this.trace.push({ s, x: Math.round(this.x), y: Math.round(this.y), f: this.sim.frame, skill: this.skill });
      if (this.trace.length > 60) this.trace.shift();
    }
    /* 발 위치 기준 점유 박스 */
    left() { return Math.floor(this.x - PHYS.UNIT_W / 2); }
    right() { return Math.floor(this.x + PHYS.UNIT_W / 2 - 0.001); }
    top() { return Math.floor(this.y - PHYS.UNIT_H); }

    solid(x, y) { return this.g.solid(x, y); }
    blockedBox(x, y) {
      const l = Math.floor(x - PHYS.UNIT_W / 2), r = Math.floor(x + PHYS.UNIT_W / 2 - 0.001);
      const t = Math.floor(y - PHYS.UNIT_H);
      for (let j = t; j < Math.floor(y); j++)
        for (let i = l; i <= r; i++)
          if (this.solid(i, j)) return true;
      return false;
    }
    /* 발밑 지지 확인 */
    supported(x = this.x, y = this.y) {
      const l = Math.floor(x - PHYS.UNIT_W / 2), r = Math.floor(x + PHYS.UNIT_W / 2 - 0.001);
      const row = Math.floor(y);
      for (let i = l; i <= r; i++) if (this.solid(i, row)) return true;
      return false;
    }
    /* 전방 스캔: {dist, depth, steel}
     *  dist  = 유닛 앞면~벽까지 거리 (벽 없으면 Infinity)
     *  depth = 파괴가능 벽 두께 (강철 포함 시 -1)                             */
    scanAhead(lookY, maxDist = 18) {
      const y0 = Math.floor(lookY - PHYS.UNIT_H), y1 = Math.floor(lookY - 1);
      const front = this.x + this.dir * (PHYS.UNIT_W / 2);
      for (let k = 0; k <= maxDist; k++) {
        const x = Math.floor(front + this.dir * k);
        let any = false, steel = false;
        for (let j = y0; j <= y1; j++) {
          const v = this.g.get(x, j);
          if (v !== EMPTY) { any = true; if (v !== DESTRUCTIBLE) steel = true; }
        }
        if (any) {
          let depth = 0, st = false;
          for (let m = 0; m < 120; m++) {
            const xx = x + this.dir * m;
            let a2 = false;
            for (let j = y0; j <= y1; j++) {
              const v = this.g.get(xx, j);
              if (v !== EMPTY) { a2 = true; if (v !== DESTRUCTIBLE) st = true; }
            }
            if (!a2) break;
            depth++;
          }
          return { dist: k, depth: st ? -1 : depth, steel: st };
        }
      }
      return { dist: Infinity, depth: 0, steel: false };
    }
    /* 하위호환: 0=벽없음, -1=강철, n=두께 */
    wallAhead(lookY) {
      const s = this.scanAhead(lookY, 2);
      if (s.dist === Infinity) return 0;
      return s.steel ? -1 : s.depth;
    }
    wallHeightAhead(lookY) {
      // 전방 벽의 상단까지 높이(px). 벽 없으면 0
      const wx = Math.floor(this.x + this.dir * (PHYS.UNIT_W / 2 + 1));
      const footY = Math.floor(lookY);
      let up = 0;
      for (let j = footY - 1; j >= 0; j--) {
        if (this.solid(wx, j)) up++; else break;
      }
      return up;
    }
    /* (x,y)에서 아래쪽 첫 지지면 y. 없으면 -1 */
    groundBelow(x, y, maxDepth = 600) { return this.g.firstSolidBelow(x, y, maxDepth); }

    /* 스킬 발동 (스크립트/정책/AI 공용) */
    use(skill) {
      if (!this.alive || this.saved) return false;
      if (this.skill && ['climb', 'bash', 'mine', 'drill', 'build'].includes(this.skill)) return false;
      const s = skill.toLowerCase();
      const budget = this.sim.budget;
      if (s === 'portal' && this.sim.prelinked) { this.sim.markPortalUsed(this); this.usedSkills.push('PORTAL'); return true; }
      if (budget && budget[s] <= 0) return false;
      switch (s) {
        case 'float':
          // 낙하 중에도 발동 가능(단, 이미 치사 낙하에 접어들었으면 실패)
          if (this.state === 'FALL' && (this.y - this.fallStart) > PHYS.LETHAL_FALL - 8) return false;
          if (this.state !== 'WALK' && this.state !== 'FALL') return false;
          this.skill = 'float'; break;
        case 'climb': {
          if (this.state !== 'WALK') return false;
          const sc = this.scanAhead(this.y, 12);
          const h = this.wallHeightAhead(this.y);
          if (sc.dist === Infinity || sc.steel) return false;
          if (h < PHYS.CLIMB_MIN || h > PHYS.CLIMB_MAX) return false;
          this.skill = 'climb'; this.skillT = 0; this.state = 'CLIMB'; this.climbTop = null; this.climbCol = null; break;
        }
        case 'bash': {
          if (this.state !== 'WALK') return false;
          const sc = this.scanAhead(this.y, 12);
          if (sc.dist === Infinity) return false;    // 벽이 없으면 실패
          if (sc.steel) return false;                // 강철은 절삭 불가
          this.skill = 'bash'; this.skillT = 0; this.state = 'BASH'; break;
        }
        case 'mine': {
          if (this.state !== 'WALK') return false;
          if (!this.ceilingAhead()) return false;
          this.skill = 'mine'; this.skillT = 0; this.state = 'MINE'; break;
        }
        case 'drill': {
          if (this.state !== 'WALK') return false;
          if (!this.floorBelowDrillable()) return false;
          this.skill = 'drill'; this.skillT = 0; this.drillStart = this.y; this.state = 'DRILL'; break;
        }
        case 'build':
          if (this.state !== 'WALK') return false;
          this.skill = 'build'; this.skillT = 0; this.buildCount = 0; this.state = 'BUILD'; break;
        case 'block':
          if (this.state !== 'WALK') return false;
          this.sim.blockers.push({ x: Math.round(this.x), y: Math.round(this.y) });
          this.g.fillRect(Math.round(this.x) - 7, Math.round(this.y) - 14, 14, 14, C.BUILT);
          this.state = 'BLOCKER'; this.skill = 'blocker';
          break;
        case 'bomb':
          this.bombT = PHYS.BOMB_FUSE; this.state = 'BOMBING'; this.skill = 'bomb'; break;
        case 'portal':
          return this.sim.tryPlacePortal(this);
        default: return false;
      }
      if (budget) budget[s]--;
      this.usedSkills.push(s.toUpperCase());
      this.log.push({ f: this.sim.frame, skill: s, x: Math.round(this.x), y: Math.round(this.y) });
      return true;
    }
    ceilingAhead() {
      // 진행 방향 전방 12px, 유닛 박스(발~머리) 높이에 파괴가능 지형이 있는가
      for (let k = 1; k <= 12; k++) {
        const x = Math.floor(this.x + this.dir * (PHYS.UNIT_W / 2 + k));
        for (let j = Math.floor(this.y) - 1; j >= Math.floor(this.y - PHYS.UNIT_H); j--) {
          const v = this.g.get(x, j);
          if (v === DESTRUCTIBLE) return true;
          if (v === STEEL || v === BUILT) return false;   // 강철 천장이면 mine 불가
        }
      }
      return false;
    }
    floorBelowDrillable() {
      const gx = Math.floor(this.x), gy = this.g.firstSolidBelow(gx, Math.floor(this.y));
      if (gy < 0) return false;
      let th = 0, steel = false;
      for (let j = gy; j < Math.min(C.H, gy + 96); j++) {
        const v = this.g.get(gx, j);
        if (v === DESTRUCTIBLE) th++;
        else if (v === EMPTY) break;                // 공동 도달 = 관통
        else { steel = true; break; }               // 강철/건설물 = 불가
      }
      if (steel || th < 4) return false;            // 강철 바닥 or 너무 얇음 → 불가
      if (th > PHYS.DRILL_MAX) return false;        // 관통 불가
      const below = this.g.firstSolidBelow(gx, gy + th);
      return below > 0 && (below - gy) <= PHYS.LETHAL_FALL;   // 출구 낙하가 치사 이내여야 함
    }

    step() {
      if (!this.alive || this.saved) return;
      if (!this.active) { if (this.sim.frame >= this.spawnFrame) { this.active = true; } else return; }
      this.age++;
      this.pushTrace(this.state);
      this.sim.onWalkerStep(this);

      // 폭탄 카운트다운
      if (this.bombT >= 0) {
        this.bombT--;
        if (this.bombT < 0) { this.explode(); return; }
      }
      if (this.state === 'BLOCKER') return;
      if (this.state === 'BOMBING') {           // 카운트다운 중 이동 정지(레밍스 'bomber')
        if (this.portalLock > 0) this.portalLock--;
        return;
      }
      if (this.portalLock > 0) this.portalLock--;

      const floating = this.skill === 'float';
      const grav = floating ? PHYS.FLOAT_GRAVITY : PHYS.GRAVITY;
      const maxFall = floating ? PHYS.FLOAT_MAX_FALL : PHYS.MAX_FALL;

      switch (this.state) {
        case 'FALL': {
          this.vy = Math.min(maxFall, this.vy + grav);
          const ny = this.y + this.vy;
          const gy = this.groundBelow(this.x, Math.ceil(this.y));
          if (gy >= 0 && ny >= gy) {
            const drop = gy - this.fallStart;
            this.maxFall = Math.max(this.maxFall, drop);
            if (!floating && drop > PHYS.LETHAL_FALL) { this.die('FALL', drop); return; }
            this.y = gy; this.vy = 0; this.state = 'WALK';
            this.fallStart = gy;
            this.stuckT = 0;
          } else {
            this.y = ny;
            if (this.y > C.H + 40) { this.die('PIT'); return; }
          }
          break;
        }
        case 'WALK': {
          if (!this.supported()) { this.state = 'FALL'; this.fallStart = this.y; this.vy = 0; break; }
          const nx = this.x + this.dir * PHYS.WALK_SPEED;
          if (this.blockedBox(nx, this.y)) {
            // 1) 스텝업 시도
            let up = 0;
            for (let k = 1; k <= PHYS.STEP_UP; k++) {
              if (!this.blockedBox(nx, this.y - k) && this.supported(nx, this.y - k)) { up = k; break; }
            }
            if (up > 0) { this.y -= up; this.x = nx; }
            else {
              // 2) 클라이밍 가능 벽이면 자동 등반(정책상 climb 스킬 필요)
              const h = this.wallHeightAhead(this.y);
              const d = this.wallAhead(this.y);
              if (this.autoClimb && h >= PHYS.CLIMB_MIN && h <= PHYS.CLIMB_MAX && d > 0) {
                this.skill = 'climb'; this.skillT = 0; this.state = 'CLIMB'; this.climbTop = null; this.climbCol = null;
              } else {
                this.dir = -this.dir; this.stuckT += 6;
                this.sim.onBump(this);
              }
            }
          } else {
            this.x = nx;
          }
          if (this.x < 2) { this.x = 2; this.dir = 1; }
          if (this.x > C.W - 2) { this.x = C.W - 2; this.dir = -1; }
          break;
        }
        case 'CLIMB': {
          this.skillT++;
          // 1) 벽면 열(front face) 탐색 → 2) 그 열의 "꼭대기 y" 실측 → 3) 상승 후 전진
          if (this.climbCol == null) {
            const front = this.x + this.dir * (PHYS.UNIT_W / 2);
            for (let k = 0; k <= 12; k++) {
              const cx = Math.floor(front + this.dir * k);
              if (this.solid(cx, Math.floor(this.y - 2)) || this.solid(cx, Math.floor(this.y - PHYS.UNIT_H + 2))) { this.climbCol = cx; break; }
            }
            if (this.climbCol == null) { this.state = 'WALK'; this.skill = null; break; }   // 벽 소멸 → 걷기 복귀
          }
          if (this.climbTop == null) {
            let j = Math.floor(this.y) - 1, top = -1;
            for (; j >= 0; j--) { if (this.solid(this.climbCol, j)) top = j; else if (top >= 0) break; }
            this.climbTop = top >= 0 ? top : Math.floor(this.y) - 20;
          }
          if (this.y - PHYS.CLIMB_SPEED <= this.climbTop + 1) {
            this.y = this.climbTop;                    // 꼭대기 도달
            this.x = this.climbCol + this.dir * (PHYS.UNIT_W / 2 + 1);   // 벽 너머로 몸체 이동
            this.state = 'WALK'; this.skill = null; this.climbTop = null; this.climbCol = null;
            this.fallStart = this.y;
            if (!this.supported()) { this.state = 'FALL'; this.vy = 0; }
          } else {
            // 헤드룸 검사(천장 끼임 방지)
            // 머리 위(전방 x 포함)가 막혔을 때만 끼임 사망 — 벽 자체는 등반 대상이므로 제외
          const headY = Math.floor(this.y - PHYS.CLIMB_SPEED - PHYS.UNIT_H);
          const backX = Math.floor(this.x - this.dir * 3);
          if (this.solid(backX, headY) && this.solid(Math.floor(this.x), headY)) { this.die('CLIMB_BLOCKED'); break; }
            this.y -= PHYS.CLIMB_SPEED;
          }
          if (this.skillT > 400) this.die('CLIMB_TIMEOUT');
          break;
        }
        case 'BASH': {
          this.skillT++;
          const fx = this.x + this.dir * (PHYS.UNIT_W / 2);
          // 전방 밴드 절삭: 발면(this.y) 위쪽만 → 자기 발판(보행면 행)은 절대 깎지 않는다
          const cx0 = this.dir > 0 ? Math.floor(fx) : Math.floor(fx) - PHYS.BASH_REACH;
          this.carve(cx0, Math.floor(this.y - PHYS.UNIT_H), PHYS.BASH_REACH + 1, PHYS.UNIT_H);
          // 지속 판정: 벽 두께 전체(BASH_MAX_WALL)를 본다 — 12px 노치 너머 남은 벽도 감지
          const sc = this.scanAhead(this.y, PHYS.BASH_MAX_WALL);
          if (sc.steel) { this.skill = null; this.state = 'WALK'; break; }   // 강철 = 관통 불가
          this.x += this.dir * PHYS.BASH_SPEED;
          if (sc.dist === Infinity && this.skillT > 4) { this.skill = null; this.state = 'WALK'; }  // 다 뚫음
          if (this.skillT > 600) { this.skill = null; this.state = 'WALK'; }
          if (!this.supported()) { this.skill = null; this.state = 'FALL'; this.fallStart = this.y; this.vy = 0; }
          break;
        }
        case 'MINE': {
          this.skillT++;
          // 대각선 아래 굴착: 전방 10px, 발 아래 0~12px
          const fx = this.x + this.dir * 6;
          this.carve(fx - 5, this.y - PHYS.UNIT_H, 12, PHYS.UNIT_H);
          this.x += this.dir * PHYS.MINE_SPEED;
          // 굴착된 방향으로 내려감
          const gy = this.groundBelow(this.x, Math.floor(this.y));
          if (gy > 0 && gy - this.y > 0 && gy - this.y < 16) this.y = gy;
          const stillCeil = this.ceilingAhead() || this.blockedBox(this.x + this.dir * 3, this.y);
          if (!stillCeil || this.skillT > 360) { this.skill = null; this.state = this.supported() ? 'WALK' : 'FALL'; if (this.state === 'FALL') { this.fallStart = this.y; this.vy = 0; } }
          break;
        }
        case 'DRILL': {
          this.skillT++;
          const gx = Math.floor(this.x);
          if (this.drillStart == null) this.drillStart = this.y;
          // 발 아래 1행을 굴착 → 지지 상실 → 중력 하강 (실제 레밍스 드리러와 동일)
          this.carve(gx - 3, Math.floor(this.y), 7, 3, true);
          if (!this.supported()) { this.vy = Math.min(this.vy + PHYS.GRAVITY, 2.2); this.y += this.vy; }
          else this.vy = 0;
          // 관통 판정: 발 아래 6px 이내에 지형이 없으면(=텅 빈 공간으로 빠짐) 낙하 전환
          const below = this.g.firstSolidBelow(gx, Math.floor(this.y), 8);
          const through = below < 0;
          if (through || this.skillT > 420 || this.y - this.drillStart > PHYS.DRILL_MAX + 8) {
            this.skill = null; this.state = 'FALL'; this.fallStart = this.y; this.vy = 0; this.drillStart = null;
          }
          break;
        }
        case 'BUILD': {
          this.skillT++;
          if (this.skillT % PHYS.BUILD_TICK === 0 && this.buildCount < PHYS.BUILD_STEPS) {
            const bx = Math.round(this.x + this.dir * 8);
            const by = Math.round(this.y) - 1 - this.buildCount * PHYS.BUILD_RISE_PER_STEP;
            // 공중에 계단 블록 설치(보호행=보행면 제외)
            for (let j = by; j < Math.min(C.H, by + 40); j++) {
              if (this.sim.protect && this.sim.protect.has(j)) continue;
              if (this.g.get(bx, j) === EMPTY) { this.g.set(bx, j, C.BUILT); }
              else break;
            }
            for (let i = bx - 3; i <= bx + 3; i++) if (this.g.get(i, by) === EMPTY) this.g.set(i, by, C.BUILT);
            this.buildCount++;
          }
          const nx = this.x + this.dir * PHYS.WALK_SPEED;
          if (!this.blockedBox(nx, this.y)) this.x = nx;
          else {
            let up = 0;
            for (let k = 1; k <= PHYS.BUILD_RISE_PER_STEP + 2; k++)
              if (!this.blockedBox(nx, this.y - k) && this.supported(nx, this.y - k)) { up = k; break; }
            if (up > 0) { this.y -= up; this.x = nx; }
          }
          if (!this.supported()) { this.skill = null; this.state = 'FALL'; this.fallStart = this.y; this.vy = 0; }
          if (this.buildCount >= PHYS.BUILD_STEPS) { this.skill = null; this.state = this.supported() ? 'WALK' : 'FALL'; }
          break;
        }
      }

      // 포탈
      if (this.portalLock <= 0) this.sim.checkPortal(this);
      // 웜홀
      this.sim.checkGate(this);
      // 끼임 감지
      if (this.state === 'WALK') {
        if (Math.abs(this.x - this.lastX) < 0.05) this.stuckT++; else this.stuckT = Math.max(0, this.stuckT - 1);
        if (this.stuckT > 240) this.sim.onStuck(this);
      }
      if (this.age % 8 === 0) this.lastX = this.x;
      if (this.age > this.sim.maxAge) this.die('TIMEOUT');
    }
    explode() {
      const prot = this.sim.protect;
      if (prot) {
        // 보호행 제외 원형 굴착
        const cx = this.x, cy = this.y - 4, r = PHYS.BOMB_RADIUS;
        for (let j = Math.max(0, Math.floor(cy - r)); j <= Math.min(C.H - 1, Math.ceil(cy + r)); j++) {
          if (prot.has(j)) continue;
          for (let i = Math.max(0, Math.floor(cx - r)); i <= Math.min(C.W - 1, Math.ceil(cx + r)); i++) {
            const dx = i - cx, dy = j - cy;
            if (dx * dx + dy * dy <= r * r && this.g.get(i, j) === DESTRUCTIBLE) this.g.set(i, j, EMPTY);
          }
        }
      } else this.g.carveCircle(this.x, this.y - 4, PHYS.BOMB_RADIUS);
      this.sim.onExplosion(this.x, this.y - 4, PHYS.BOMB_RADIUS, this);
      this.alive = false; this.state = 'DEAD'; this.deathReason = 'BOMB';
      this.sim.report.deaths.push({ id: this.id, reason: 'BOMB', x: Math.round(this.x), y: Math.round(this.y) });
    }
    die(reason, extra) {
      if (!this.alive) return;
      this.alive = false; this.state = 'DEAD'; this.deathReason = reason;
      this.sim.report.deaths.push({ id: this.id, reason, x: Math.round(this.x), y: Math.round(this.y), drop: extra });
    }
    save() {
      if (!this.alive || this.saved) return;
      this.saved = true; this.state = 'SAVED';
      this.sim.report.saved++;
    }
  }

  /* --------------------------------------------------------------- Sim -- */
  class Sim {
    constructor(grid, opts = {}) {
      this.grid = grid;
      this.baseGrid = grid;                 // 복제본으로 돌릴지는 호출자 결정
      this.frame = 0;
      this.maxAge = opts.maxAge || 2600;
      this.gate = opts.gate || { x: 700, y: 300 };
      this.gateR = opts.gateR || 14;
      this.budget = opts.budget || null;    // 스킬 잔여 횟수 (null = 무한)
      this.triggers = opts.triggers || [];  // [{skill,x,y,dir,unit:'first'|'all',used:false}]
      this.policy = opts.policy || null;    // 반응형 정책 함수(walker, sim)->void
      this.portals = opts.portals ? [{ a: opts.portals.a, b: opts.portals.b }] : [];
      this.prelinked = !!opts.portals;
      this.blockers = [];
      this.walkers = [];
      this.earlyExit = opts.earlyExit || 0;
      this.spawnRate = opts.spawnRate || 25;
      this.protect = opts.protect || null;   // 보호 행(보행면) 집합
      this.report = { saved: 0, deaths: [], stuck: [], bumps: [], spawns: 0, skillUses: {}, firedTriggers: 0 };
    }
    spawn(x, y, dir, id, delayFrames = 0, ownTriggers = null) {
      const w = new Walker(this, x, y, dir, id);
      w.fallStart = y;
      w.spawnFrame = delayFrames;
      w.active = delayFrames <= 0;
      if (ownTriggers) w.triggers = ownTriggers;
      this.walkers.push(w); this.report.spawns++;
      return w;
    }
    onWalkerStep(w) {
      // 스크립트 트리거 — 유닛별 독립 사본(실제 게임의 "개별 유닛 스킬 부여"와 동일 semantics)
      const list = w.triggers || this.triggers;
      if (list && list.length) {
        for (const t of list) {
          if (t.used) continue;
          // "도달 또는 통과" 판정: 프레임 스텝(1.25px)이 트리거를 건너뛰어도 발동한다
          const crossed = (w.dir > 0) ? (w.x >= t.x - 4 && w.x <= t.x + 9) : (w.x <= t.x + 4 && w.x >= t.x - 9);
          if (crossed && Math.abs(w.y - t.y) <= 24 && (t.dir == null || w.dir === t.dir)) {
            const cands = [t.skill].concat(t.alts || []);
            let fired = null;
            for (const sk of cands) { if (w.use(sk)) { fired = sk; break; } }
            if (fired) {
              t.used = true;
              this.report.firedTriggers++;
              this.report.skillUses[fired] = (this.report.skillUses[fired] || 0) + 1;
            } else {
              this.report.missedTriggers = (this.report.missedTriggers || []);
              if (this.report.missedTriggers.length < 8) this.report.missedTriggers.push({ skill: t.skill, x: t.x, y: t.y, state: w.state, wx: Math.round(w.x), wy: Math.round(w.y) });
            }
          }
        }
      }
      if (this.policy) this.policy(w, this);
    }
    onBump(w) { this.report.bumps.push({ id: w.id, x: Math.round(w.x), y: Math.round(w.y), f: this.frame }); }
    onStuck(w) {
      this.report.stuck.push({ id: w.id, x: Math.round(w.x), y: Math.round(w.y), dir: w.dir, f: this.frame });
      w.stuckT = 0;
      if (!w.stuckPenalty) { w.stuckPenalty = (w.stuckPenalty || 0) + 1; if (w.stuckPenalty > 3) w.die('STUCK'); }
    }
    onExplosion(x, y, r, src) {
      for (const w of this.walkers) {
        if (w === src || !w.alive) continue;
        const dx = w.x - x, dy = (w.y - 6) - y;
        if (dx * dx + dy * dy <= r * r) w.die('BOMB_CHAIN');
      }
    }
    tryPlacePortal(w) {
      const A = { x: Math.round(w.x), y: Math.round(w.y) };
      const pending = this.portals.find(p => !p.b);
      if (!pending) { this.portals.push({ a: A }); return true; }
      const d = Math.hypot(A.x - pending.a.x, A.y - pending.a.y);
      if (d > PHYS.PORTAL_RANGE) return false;
      pending.b = A;
      return true;
    }
    markPortalUsed(w) {
      this.report.skillUses['portal'] = (this.report.skillUses['portal'] || 0) + 1;
    }
    checkPortal(w) {
      for (const p of this.portals) {
        if (!p.b) continue;
        for (const [from, to] of [[p.a, p.b], [p.b, p.a]]) {
          if (Math.abs(w.x - from.x) <= 4 && Math.abs(w.y - from.y) <= 14) {
            w.x = to.x + w.dir * 3; w.y = to.y; w.portalLock = 20;
            w.fallStart = w.y; w.vy = 0;
            if (!w.supported()) w.state = 'FALL';
            return;
          }
        }
      }
    }
    checkGate(w) {
      if (!w.alive || w.saved) return;
      const dx = w.x - this.gate.x, dy = (w.y - 6) - this.gate.y;
      if (dx * dx + dy * dy <= this.gateR * this.gateR) w.save();
    }
    run(maxFrames = 3000) {
      for (this.frame = 0; this.frame < maxFrames; this.frame++) {
        let live = 0;
        for (const w of this.walkers) { if (w.alive && !w.saved) { w.step(); live++; } }
        if (live === 0 && this.walkers.length) break;
        if (this.earlyExit && this.report.saved >= this.earlyExit) break;
      }
      return this.report;
    }
  }

  /* ---------------------------------------------------- 반응형 정책 샘플 -- */
  // "AI 솔버 ≠ 플레이어" 격차 측정을 위한 기본 정책. 룰 기반, 그리드 샘플만 사용.
  function reactivePolicy(lookahead = 26) {
    return function (w, sim) {
      if (!w.alive || w.saved || w.state !== 'WALK') return;
      if (w.skill) return;
      // 1) 전방 나락/치사낙하 → FLOAT
      let gy = -1, gap = 0;
      for (let k = 1; k <= lookahead; k++) {
        const x = Math.floor(w.x + w.dir * k);
        const g = sim.grid.firstSolidBelow(x, Math.floor(w.y));
        if (g >= 0) { gy = g; gap = k; break; }
      }
      if (gy < 0) { w.use('float'); return; }                 // 바닥 없음 → 나락
      if (gy - w.y > PHYS.LETHAL_FALL - 6 && gap <= lookahead) { w.use('float'); return; }
      // 2) 전방 벽 → 두께/강철 판별
      const d = w.wallAhead(w.y);
      if (d > 0) {
        if (d <= PHYS.BASH_MAX_WALL) { w.use('bash'); return; }
        const h = w.wallHeightAhead(w.y);
        if (h >= PHYS.CLIMB_MIN && h <= PHYS.CLIMB_MAX) { w.use('climb'); return; }
        if (w.floorBelowDrillable()) { w.use('drill'); return; }
        return;
      }
      if (d === -1) { // 강철
        const h = w.wallHeightAhead(w.y);
        if (h >= PHYS.CLIMB_MIN && h <= PHYS.CLIMB_MAX) { w.use('climb'); return; }
        if (w.floorBelowDrillable()) { w.use('drill'); return; }
        if (w.ceilingAhead()) { w.use('mine'); return; }
        return;
      }
      // 3) 앞이 gap이고 건너편이 높음 → BUILD
      if (gap > 10 && gy < w.y - PHYS.STEP_UP) {
        if (gy - w.y <= PHYS.LETHAL_FALL) { w.use('build'); return; }
        w.use('float'); return;
      }
      // 4) 천장 → MINE
      if (w.ceilingAhead() && w.wallAhead(w.y) <= 0) {
        // 헤드룸이 낮으면 mine
        const ceil = sim.grid.firstSolidAbove(Math.floor(w.x + w.dir * 8), Math.floor(w.y) - PHYS.UNIT_H - 1);
        if (ceil >= 0 && (Math.floor(w.y) - ceil) < PHYS.CORRIDOR_H) { w.use('mine'); return; }
      }
    };
  }

  return { Walker, Sim, reactivePolicy };
});
