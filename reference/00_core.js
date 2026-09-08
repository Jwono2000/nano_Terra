/* ============================================================================
 * 00_core.js — 공용 유틸 / 상수 / 그리드 / 래스터라이저 / 노이즈 / 바이옴
 * 순수 Vanilla JS. Node(CommonJS) + 브라우저(전역) 동시 지원.
 * ==========================================================================*/
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  Object.assign(root, api);
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ---------------------------------------------------------------- 상수 -- */
  const W = 800, H = 450;
  const EMPTY = 0, DESTRUCTIBLE = 1, STEEL = 2, BUILT = 3;

  const PHYS = {
    WALK_SPEED: 1.25,          // px/frame
    GRAVITY: 0.42,             // px/frame^2 (튜닝 상수)
    MAX_FALL: 9.0,
    LETHAL_FALL: 96,           // 96px 이상 낙하 = 사망
    FLOAT_GRAVITY: 0.09,
    FLOAT_MAX_FALL: 1.35,
    STEP_UP: 4,                // 걸어서 오를 수 있는 단차
    CLIMB_SPEED: 1.0,
    CLIMB_MIN: 14,
    CLIMB_MAX: 92,
    BASH_SPEED: 0.55,
    BASH_REACH: 12,            // 전방 절삭 도달
    BASH_MAX_WALL: 58,         // bash로 뚫을 수 있는 최대 두께(설계 제약)
    MINE_SPEED: 0.5,
    MINE_MAX: 46,
    DRILL_SPEED: 0.8,
    DRILL_MAX: 52,
    BUILD_STEPS: 12,
    BUILD_RISE_PER_STEP: 2,    // 계단 1단당 상승 px  -> 12단 = 24px
    BUILD_TICK: 7,             // n 프레임마다 1단
    BOMB_FUSE: 300,            // 5초 @60fps
    BOMB_RADIUS: 32,
    PORTAL_RANGE: 160,
    UNIT_W: 6, UNIT_H: 12,     // 유닛 충돌 박스 (폭6 x 키12)
    CORRIDOR_W: 20,            // 설계 최소 통로 폭
    CORRIDOR_H: 16             // 설계 최소 헤드룸
  };

  /* ------------------------------------------------------------- RNG(s32) -- */
  function makeRNG(seed) {
    let a = (seed >>> 0) || 1;
    const r = function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    r.int = (n) => Math.floor(r() * n);
    r.range = (lo, hi) => lo + r() * (hi - lo);
    r.irange = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
    r.pick = (arr) => arr[Math.floor(r() * arr.length)];
    r.chance = (p) => r() < p;
    // 가중 선택: items = [{w:number, ...}]
    r.weighted = (items) => {
      let tot = 0; for (const it of items) tot += Math.max(0, it.w);
      if (tot <= 0) return items[0];
      let x = r() * tot;
      for (const it of items) { x -= Math.max(0, it.w); if (x <= 0) return it; }
      return items[items.length - 1];
    };
    r.shuffle = (arr) => {
      const a = arr.slice();
      for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; }
      return a;
    };
    r.fork = () => makeRNG((a * 2654435761) >>> 0);
    return r;
  }

  const clamp = (v, lo, hi) => v < lo ? lo : (v > hi ? hi : v);
  const lerp = (a, b, t) => a + (b - a) * t;

  /* ---------------------------------------------------------------- Grid -- */
  class Grid {
    constructor(w = W, h = H) {
      this.w = w; this.h = h;
      this.cells = new Uint8Array(w * h);
    }
    idx(x, y) { return (y | 0) * this.w + (x | 0); }
    inB(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
    get(x, y) { return this.inB(x, y) ? this.cells[this.idx(x, y)] : STEEL; } // 밖은 강철 취급
    set(x, y, v) { if (this.inB(x, y)) this.cells[this.idx(x, y)] = v; }
    solid(x, y) { return this.get(x, y) !== EMPTY; }
    indestructible(x, y) { const v = this.get(x, y); return v === STEEL || v === BUILT; }
    clear() { this.cells.fill(0); }
    clone() { const g = new Grid(this.w, this.h); g.cells.set(this.cells); return g; }

    fillRect(x, y, w, h, v) {
      const x0 = Math.max(0, Math.floor(x)), y0 = Math.max(0, Math.floor(y));
      const x1 = Math.min(this.w, Math.ceil(x + w)), y1 = Math.min(this.h, Math.ceil(y + h));
      for (let j = y0; j < y1; j++) {
        const row = j * this.w;
        for (let i = x0; i < x1; i++) this.cells[row + i] = v;
      }
    }
    /* 원형 폭파: 파괴가능(1)만 제거. 강철/건설물은 관통 불가. */
    carveCircle(cx, cy, r) {
      const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(this.w - 1, Math.ceil(cx + r));
      const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(this.h - 1, Math.ceil(cy + r));
      const r2 = r * r;
      for (let j = y0; j <= y1; j++) for (let i = x0; i <= x1; i++) {
        const dx = i - cx, dy = j - cy;
        if (dx * dx + dy * dy <= r2 && this.cells[j * this.w + i] === DESTRUCTIBLE) this.cells[j * this.w + i] = EMPTY;
      }
    }
    /* 특정 셀 값 치환(=v일 때만). 스킬 굴착용으로 indestructible 보호. */
    /* 파괴가능 셀만 제거하되 protectYs(슬랩 상단 행 등)는 보존 */
    carveRectProtected(x, y, w, h, protectYs) {
      const x0 = Math.max(0, Math.floor(x)), y0 = Math.max(0, Math.floor(y));
      const x1 = Math.min(this.w, Math.ceil(x + w)), y1 = Math.min(this.h, Math.ceil(y + h));
      for (let j = y0; j < y1; j++) {
        if (protectYs && protectYs.has(j)) continue;
        for (let i = x0; i < x1; i++) {
          const k = j * this.w + i;
          if (this.cells[k] === DESTRUCTIBLE) this.cells[k] = EMPTY;
        }
      }
    }
    carveRect(x, y, w, h) {
      const x0 = Math.max(0, Math.floor(x)), y0 = Math.max(0, Math.floor(y));
      const x1 = Math.min(this.w, Math.ceil(x + w)), y1 = Math.min(this.h, Math.ceil(y + h));
      for (let j = y0; j < y1; j++) for (let i = x0; i < x1; i++) {
        const k = j * this.w + i;
        if (this.cells[k] === DESTRUCTIBLE) this.cells[k] = EMPTY;
      }
    }
    /* y 방향 첫 solid 탐색. 없으면 -1 */
    firstSolidBelow(x, y, maxDepth = 400) {
      for (let j = Math.max(0, y | 0); j < Math.min(this.h, (y | 0) + maxDepth); j++)
        if (this.cells[j * this.w + (x | 0)]) return j;
      return -1;
    }
    firstSolidAbove(x, y, maxDepth = 400) {
      for (let j = Math.min(this.h - 1, y | 0); j >= Math.max(0, (y | 0) - maxDepth); j--)
        if (this.cells[j * this.w + (x | 0)]) return j;
      return -1;
    }
    /* (x,y)에서 바닥 표면 y (발이 서는 y = solid 셀의 윗변). 없으면 -1 */
    groundY(x, y) { const s = this.firstSolidBelow(x, y); return s < 0 ? -1 : s; }

    count(v) { let n = 0; const c = this.cells; for (let i = 0; i < c.length; i++) if (c[i] === v) n++; return n; }
  }

  function inAnyRange(x, ranges) {
    for (const r of ranges) if (x >= r[0] && x <= r[1]) return true;
    return false;
  }

  /* ------------------------------------------------------- Value Noise 2D -- */
  class Noise2D {
    constructor(seed = 1) {
      this.p = new Uint8Array(512);
      const rng = makeRNG(seed);
      const perm = new Uint8Array(256);
      for (let i = 0; i < 256; i++) perm[i] = i;
      for (let i = 255; i > 0; i--) { const j = rng.int(i + 1); const t = perm[i]; perm[i] = perm[j]; perm[j] = t; }
      for (let i = 0; i < 512; i++) this.p[i] = perm[i & 255];
    }
    static grad(h, x, y) {
      switch (h & 3) { case 0: return x + y; case 1: return -x + y; case 2: return x - y; default: return -x - y; }
    }
    noise(x, y) {
      const X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
      const xf = x - Math.floor(x), yf = y - Math.floor(y);
      const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
      const p = this.p;
      const aa = p[p[X] + Y], ab = p[p[X] + Y + 1], ba = p[p[X + 1] + Y], bb = p[p[X + 1] + Y + 1];
      const x1 = lerp(Noise2D.grad(aa, xf, yf), Noise2D.grad(ba, xf - 1, yf), u);
      const x2 = lerp(Noise2D.grad(ab, xf, yf - 1), Noise2D.grad(bb, xf - 1, yf - 1), u);
      return lerp(x1, x2, v); // 대략 [-1,1]
    }
    fbm(x, y, oct = 3, lac = 2.0, gain = 0.5) {
      let amp = 1, freq = 1, sum = 0, norm = 0;
      for (let i = 0; i < oct; i++) { sum += amp * this.noise(x * freq, y * freq); norm += amp; amp *= gain; freq *= lac; }
      return sum / norm;
    }
    ridged(x, y, oct = 3) {
      let amp = 1, freq = 1, sum = 0, norm = 0;
      for (let i = 0; i < oct; i++) { const n = 1 - Math.abs(this.noise(x * freq, y * freq)); sum += amp * n * n; norm += amp; amp *= 0.5; freq *= 2; }
      return sum / norm;
    }
    line1D(x, oct = 3, freq = 1) { // 1차원 스카이라인/바닥선용
      return this.fbm(x * freq, 17.3, oct);
    }
  }

  /* ------------------------------------------------------------ Rasterizer */
  class Rasterizer {
    constructor(grid) { this.g = grid; }
    /* 요소 하나를 그리드에 굽기. profile 은 셀 폭 개수(기본 7). */
    rasterize(el) {
      const { type, x, y, w, h } = el;
      const v = type === 'steelBarrier' ? STEEL : DESTRUCTIBLE;
      switch (type) {
        case 'platform':
        case 'rockWall':
          this.g.fillRect(x, y, w, h, v);
          break;
        case 'steelBarrier':
          this.g.fillRect(x, y, w, h, STEEL);
          break;
        case 'craggyRock':
        case 'volcanicBasalt':
        case 'quantumCrystal': {
          const prof = (el.profile && el.profile.length) ? el.profile : [h];
          const n = prof.length;
          const cellW = w / n;
          const jag = type === 'craggyRock' ? 3 : (type === 'volcanicBasalt' ? 2 : 1);
          // ★ 설계 규칙: profile은 "아래쪽 실루엣"만 변화시킨다. 상단(el.y)은 항상 플러시.
          //   이유: 상단이 요철이면 보행 표면 y가 계획(plan)과 어긋나 검증/물리가 붕괴한다.
          const flushTop = el.flushTop !== false;   // 보행면(상단)은 항상 플러시 = 두께 h 보장
          for (let c = 0; c < n; c++) {
            const cx0 = Math.floor(x + c * cellW), cx1 = Math.floor(x + (c + 1) * cellW);
            const base = flushTop ? h : clamp(prof[c], 2, h);
            for (let i = cx0; i < cx1; i++) {
              const k = ((i - cx0) % 5);
              let th = base;
              if (base < h) {                       // 꽉 찬 높이가 아닐 때만 하단 요철
                if (k === 2) th = clamp(base - jag, 2, h);
                else if (k === 4) th = clamp(base + jag, 2, h);
              }
              this.g.fillRect(i, y + (h - th), 1, th, v);
            }
          }
          break;
        }
        default:
          this.g.fillRect(x, y, w, h, v);
      }
    }
    rasterizeAll(elements) { for (const el of elements) this.rasterize(el); }

    /* 통로 보장: slab 상단을 plan.y로 평탄화 + 헤드룸 확보 */
    flattenWalkway(x0, x1, topY, headroom = PHYS.CORRIDOR_H, feather = 6, protect = null, excludeX = null) {
      for (let i = Math.floor(x0); i < Math.ceil(x1); i++) {
        if (excludeX && inAnyRange(i, excludeX)) continue;
        const edge = Math.min(i - x0, x1 - i);
        const featherOK = edge >= feather;
        // 바닥 평탄화: topY 행을 solid로, 위쪽 1px도 채워 발걸림 방지
        if (this.g.get(i, topY) !== STEEL && this.g.get(i, topY) !== BUILT) this.g.set(i, topY, DESTRUCTIBLE);
        if (featherOK) {
          // 헤드룸 확보(강철/건설물 제외)
          for (let j = topY - headroom; j < topY; j++) {
            if (j < 0) break;
            if (protect && protect.has(j)) continue;
            const c = this.g.get(i, j);
            if (c === DESTRUCTIBLE) this.g.set(i, j, EMPTY);
          }
        }
      }
    }
  }

  /* --------------------------------------------------------- Biome 프리셋 */
  const BIOMES = {
    volcanicRift: {
      key: 'volcanicRift', family: 'fire', bgImg: 3, terrainTheme: 'red',
      slabTypes: [['volcanicBasalt', 0.62], ['craggyRock', 0.28], ['platform', 0.10]],
      wallTypes: [['volcanicBasalt', 0.6], ['rockWall', 0.4]],
      palettes: [['red', 0.55], ['brown', 0.30], ['purple', 0.15]],
      deco: { count: [3, 7], types: [['volcanicBasalt', 0.5], ['craggyRock', 0.3], ['quantumCrystal', 0.2]] },
      hazardFloor: 0.55,          // 바닥 없음(나락) 확률
      steelRate: 0.20,
      roughness: 0.75,            // profile 요철 강도
      archBias: { descent: 1.3, ascent: 0.7, traverse: 1.0, split: 0.9, chamber: 0.8 },
      titleWords: ['MAGMA', 'BASALT', 'CINDER', 'PYROCLAST']
    },
    cryoCavern: {
      key: 'cryoCavern', family: 'ice', bgImg: 1, terrainTheme: 'cyan',
      slabTypes: [['quantumCrystal', 0.60], ['craggyRock', 0.30], ['platform', 0.10]],
      wallTypes: [['quantumCrystal', 0.55], ['rockWall', 0.45]],
      palettes: [['cyan', 0.60], ['green', 0.22], ['purple', 0.18]],
      deco: { count: [4, 9], types: [['quantumCrystal', 0.55], ['craggyRock', 0.45]] },
      hazardFloor: 0.45, steelRate: 0.14, roughness: 0.45,
      archBias: { descent: 0.9, ascent: 1.2, traverse: 1.0, split: 1.1, chamber: 0.9 },
      titleWords: ['CRYO', 'GLACIAL', 'RIME', 'FROST']
    },
    derelictStation: {
      key: 'derelictStation', family: 'tech', bgImg: 4, terrainTheme: 'green',
      slabTypes: [['platform', 0.70], ['craggyRock', 0.20], ['volcanicBasalt', 0.10]],
      wallTypes: [['rockWall', 0.6], ['platform', 0.4]],
      palettes: [['green', 0.45], ['cyan', 0.30], ['red', 0.25]],
      deco: { count: [2, 6], types: [['platform', 0.6], ['craggyRock', 0.4]] },
      hazardFloor: 0.65, steelRate: 0.34, roughness: 0.20,
      archBias: { descent: 0.8, ascent: 1.0, traverse: 1.2, split: 0.9, chamber: 1.4 },
      titleWords: ['DERELICT', 'HULL', 'SECTOR', 'CONDUIT']
    },
    verdantStrata: {
      key: 'verdantStrata', family: 'bio', bgImg: 2, terrainTheme: 'green',
      slabTypes: [['craggyRock', 0.66], ['platform', 0.22], ['quantumCrystal', 0.12]],
      wallTypes: [['craggyRock', 0.6], ['rockWall', 0.4]],
      palettes: [['green', 0.5], ['brown', 0.35], ['cyan', 0.15]],
      deco: { count: [4, 10], types: [['craggyRock', 0.7], ['quantumCrystal', 0.3]] },
      hazardFloor: 0.40, steelRate: 0.10, roughness: 0.9,
      archBias: { descent: 1.1, ascent: 1.0, traverse: 0.9, split: 1.0, chamber: 1.0 },
      titleWords: ['STRATA', 'LOAM', 'CANOPY', 'SPORE']
    },
    voidLattice: {
      key: 'voidLattice', family: 'void', bgImg: 4, terrainTheme: 'purple',
      slabTypes: [['quantumCrystal', 0.55], ['platform', 0.35], ['volcanicBasalt', 0.10]],
      wallTypes: [['rockWall', 0.5], ['quantumCrystal', 0.5]],
      palettes: [['purple', 0.6], ['cyan', 0.25], ['red', 0.15]],
      deco: { count: [2, 8], types: [['quantumCrystal', 0.6], ['platform', 0.4]] },
      hazardFloor: 0.80, steelRate: 0.26, roughness: 0.35,
      archBias: { descent: 1.0, ascent: 1.1, traverse: 0.8, split: 1.4, chamber: 1.1 },
      titleWords: ['LATTICE', 'VOID', 'NULL', 'PHASE']
    }
  };
  const BIOME_KEYS = Object.keys(BIOMES);

  /* profile 생성 (지형 타입/바이옴 roughness 반영) */
  function makeProfile(rng, type, w, h, roughness = 0.5, cells = 7) {
    const prof = [];
    const base = clamp(h * rng.range(0.55, 0.95), 4, h);
    for (let i = 0; i < cells; i++) {
      const amp = (type === 'craggyRock' ? 0.55 : type === 'volcanicBasalt' ? 0.32 : 0.18) * roughness;
      const t = base + h * amp * (rng() * 2 - 1);
      prof.push(Math.round(clamp(t, 3, h)));
    }
    return prof;
  }

  return {
    W, H, EMPTY, DESTRUCTIBLE, STEEL, BUILT, PHYS,
    makeRNG, clamp, lerp, inAnyRange, Grid, Noise2D, Rasterizer,
    BIOMES, BIOME_KEYS, makeProfile
  };
});
