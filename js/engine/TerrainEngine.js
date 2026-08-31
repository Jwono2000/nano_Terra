// --- Particle and Floating Text VFX System ---
class ParticleSystem {
  constructor() {
    this.particles = [];
    this.popups = [];
  }

  clear() {
    this.particles = [];
    this.popups = [];
  }

  spawnBurst(x, y, color = '#00f3ff', count = 12, speed = 2.5) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const spd = (0.3 + Math.random() * 0.7) * speed;
      this.particles.push({
        x, y, color,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd,
        life: 20 + Math.random() * 20,
        maxLife: 40,
        size: 1.5 + Math.random() * 2
      });
    }
  }

  spawnFloatingText(x, y, text, color = '#00f3ff') {
    this.popups.push({
      x, y, text, color,
      vy: -0.7,
      life: 50,
      maxLife: 50
    });
  }

  update() {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.04;
      p.life--;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
      }
    }

    for (let i = this.popups.length - 1; i >= 0; i--) {
      const pop = this.popups[i];
      pop.y += pop.vy;
      pop.life--;
      if (pop.life <= 0) {
        this.popups.splice(i, 1);
      }
    }
  }

  render(ctx) {
    for (const p of this.particles) {
      const alpha = p.life / p.maxLife;
      ctx.fillStyle = p.color;
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const pop of this.popups) {
      const alpha = pop.life / pop.maxLife;
      ctx.globalAlpha = alpha;
      ctx.font = 'bold 12px Rajdhani, Orbitron, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = pop.color;
      ctx.shadowColor = pop.color;
      ctx.shadowBlur = 6;
      ctx.fillText(pop.text, pop.x, pop.y);
      ctx.shadowBlur = 0;
    }

    ctx.globalAlpha = 1.0;
  }
}

const TERRAIN_PALETTES = {
  cyan: {
    id: 'cyan',
    name: '기본 (사이버 시안)',
    top: 'rgba(0, 243, 255, 0.9)',
    overlay: 'rgba(16, 28, 45, 0.58)',
    base: '#1c2d42',
    vein: 'rgba(0, 243, 255, 0.18)',
    shadow: 'rgba(0, 0, 0, 0.85)',
    border: 'rgba(0, 243, 255, 0.35)'
  },
  red: {
    id: 'red',
    name: '붉은계열 (마그마 레드)',
    top: 'rgba(255, 68, 68, 0.95)',
    overlay: 'rgba(42, 12, 16, 0.72)',
    base: '#220b0e',
    vein: 'rgba(255, 80, 80, 0.35)',
    shadow: 'rgba(0, 0, 0, 0.9)',
    border: 'rgba(255, 80, 80, 0.45)'
  },
  brown: {
    id: 'brown',
    name: '갈색계열 (황무지 브라운)',
    top: 'rgba(240, 160, 40, 0.95)',
    overlay: 'rgba(42, 28, 14, 0.70)',
    base: '#26180c',
    vein: 'rgba(240, 160, 50, 0.28)',
    shadow: 'rgba(0, 0, 0, 0.85)',
    border: 'rgba(240, 160, 50, 0.4)'
  },
  green: {
    id: 'green',
    name: '녹색계열 (바이오 에메랄드)',
    top: 'rgba(0, 255, 136, 0.95)',
    overlay: 'rgba(10, 38, 22, 0.68)',
    base: '#0c2415',
    vein: 'rgba(0, 255, 136, 0.25)',
    shadow: 'rgba(0, 0, 0, 0.85)',
    border: 'rgba(0, 255, 136, 0.38)'
  },
  purple: {
    id: 'purple',
    name: '보라계열 (양자 바이올렛)',
    top: 'rgba(191, 0, 255, 0.95)',
    overlay: 'rgba(28, 10, 48, 0.72)',
    base: '#1a092c',
    vein: 'rgba(191, 0, 255, 0.28)',
    shadow: 'rgba(0, 0, 0, 0.85)',
    border: 'rgba(191, 0, 255, 0.4)'
  }
};

// --- High-Performance 2D Pixel Bitmask Terrain Engine ---
class TerrainEngine {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.canvas = document.createElement('canvas');
    this.canvas.width = width;
    this.canvas.height = height;
    this.ctx = this.canvas.getContext('2d');
    this.grid = new Uint8Array(width * height);
    this.pattern = null;
    this.steelBarriers = [];
    this.constructedStructures = [];
  }

  setPattern(patternImg) {
    if (patternImg && patternImg.complete && patternImg.naturalWidth > 0) {
      try {
        const tileCanvas = document.createElement('canvas');
        tileCanvas.width = 80;
        tileCanvas.height = 80;
        const tctx = tileCanvas.getContext('2d');
        tctx.drawImage(patternImg, 0, 0, 80, 80);
        this.pattern = this.ctx.createPattern(tileCanvas, 'repeat');
      } catch(e) {}
    }
  }

  clear() {
    this.ctx.clearRect(0, 0, this.width, this.height);
    this.grid.fill(0);
    this.steelBarriers = [];
    this.constructedStructures = [];
  }

  isSolid(x, y) {
    x = Math.floor(x);
    y = Math.floor(y);
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return false;
    return this.grid[y * this.width + x] !== 0;
  }

  isSteel(x, y) {
    x = Math.floor(x);
    y = Math.floor(y);
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return false;
    const val = this.grid[y * this.width + x];
    return val === 2 || val === 3; // 2 = Steel barrier, 3 = Constructed structures (immune to laser/drill/mine)
  }

  getPalette(palKey, fallback = 'cyan') {
    if (palKey && TERRAIN_PALETTES[palKey]) return TERRAIN_PALETTES[palKey];
    if (typeof palKey === 'string' && palKey.startsWith('#')) {
      return {
        top: palKey,
        overlay: 'rgba(10, 22, 40, 0.45)',
        base: '#22354f',
        border: 'rgba(0, 243, 255, 0.35)',
        vein: 'rgba(0, 243, 255, 0.15)',
        shadow: 'rgba(0, 0, 0, 0.85)'
      };
    }
    return TERRAIN_PALETTES[fallback] || TERRAIN_PALETTES.cyan;
  }

  drawPlatform(x, y, w, h, paletteKey = 'cyan') {
    x = Math.floor(x); y = Math.floor(y); w = Math.floor(w); h = Math.floor(h);
    const pal = this.getPalette(paletteKey, 'cyan');

    for (let py = y; py < y + h; py++) {
      if (py < 0 || py >= this.height) continue;
      for (let px = x; px < x + w; px++) {
        if (px < 0 || px >= this.width) continue;
        this.grid[py * this.width + px] = 1;
      }
    }

    this.ctx.save();
    this.ctx.shadowColor = pal.shadow;
    this.ctx.shadowBlur = 12;
    this.ctx.shadowOffsetY = 5;
    this.ctx.fillStyle = pal.base;
    this.ctx.fillRect(x, y, w, h);
    this.ctx.restore();

    if (this.pattern) {
      this.ctx.fillStyle = this.pattern;
      this.ctx.fillRect(x, y, w, h);
      this.ctx.fillStyle = pal.overlay;
      this.ctx.fillRect(x, y, w, h);
    } else {
      this.ctx.fillStyle = pal.base;
      this.ctx.fillRect(x, y, w, h);
    }

    this.ctx.strokeStyle = pal.border;
    this.ctx.lineWidth = 1;
    this.ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

    this.ctx.fillStyle = pal.top;
    this.ctx.fillRect(x, y, w, 1.2);

    this.ctx.strokeStyle = pal.vein;
    for (let sx = x + 32; sx < x + w; sx += 32) {
      this.ctx.beginPath();
      this.ctx.moveTo(sx, y + 1.5);
      this.ctx.lineTo(sx, y + h - 1.5);
      this.ctx.stroke();
    }
  }

  drawCraggyRockFloor(x, y, w, baseH, thicknessProfile = [], paletteKey = 'cyan') {
    x = Math.floor(x); y = Math.floor(y); w = Math.floor(w);
    const pal = this.getPalette(paletteKey, 'cyan');
    
    const heights = new Array(w);
    for (let i = 0; i < w; i++) {
      let customH = baseH;
      if (thicknessProfile.length > 0) {
        const seg = (i / w) * (thicknessProfile.length - 1);
        const idx = Math.floor(seg);
        const frac = seg - idx;
        const h0 = thicknessProfile[idx];
        const h1 = thicknessProfile[Math.min(thicknessProfile.length - 1, idx + 1)];
        customH = h0 + (h1 - h0) * frac;
      }
      const roughness = Math.sin(i * 0.25) * 3 + Math.cos(i * 0.1) * 2;
      heights[i] = Math.max(10, Math.floor(customH + roughness));
    }

    for (let dx = 0; dx < w; dx++) {
      const px = x + dx;
      if (px < 0 || px >= this.width) continue;
      const colH = heights[dx];
      for (let dy = 0; dy < colH; dy++) {
        const py = y + dy;
        if (py < 0 || py >= this.height) continue;
        this.grid[py * this.width + px] = 1;
      }
    }

    this.ctx.beginPath();
    this.ctx.moveTo(x, y);
    this.ctx.lineTo(x + w, y);
    for (let dx = w - 1; dx >= 0; dx -= 3) {
      this.ctx.lineTo(x + dx, y + heights[dx]);
    }
    this.ctx.closePath();

    this.ctx.save();
    this.ctx.shadowColor = pal.shadow;
    this.ctx.shadowBlur = 14;
    this.ctx.shadowOffsetY = 6;
    this.ctx.fillStyle = pal.base;
    this.ctx.fill();
    this.ctx.restore();

    if (this.pattern) {
      this.ctx.fillStyle = this.pattern;
      this.ctx.fill();
      this.ctx.fillStyle = pal.overlay;
      this.ctx.fill();
    } else {
      this.ctx.fillStyle = pal.base;
      this.ctx.fill();
    }

    this.ctx.fillStyle = pal.top;
    this.ctx.fillRect(x, y, w, 1.2);

    this.ctx.save();
    this.ctx.strokeStyle = pal.vein;
    this.ctx.lineWidth = 1;
    for (let dx = 20; dx < w - 20; dx += 40) {
      this.ctx.beginPath();
      this.ctx.moveTo(x + dx, y + 3);
      this.ctx.lineTo(x + dx + 10, y + heights[dx] - 4);
      this.ctx.stroke();
    }
    this.ctx.restore();
  }

  drawVolcanicBasaltFloor(x, y, w, baseH, thicknessProfile = [], paletteKey = 'red') {
    x = Math.floor(x); y = Math.floor(y); w = Math.floor(w);
    const pal = this.getPalette(paletteKey, 'red');
    
    const heights = new Array(w);
    for (let i = 0; i < w; i++) {
      let customH = baseH;
      if (thicknessProfile.length > 0) {
        const seg = (i / w) * (thicknessProfile.length - 1);
        const idx = Math.floor(seg);
        const frac = seg - idx;
        const h0 = thicknessProfile[idx];
        const h1 = thicknessProfile[Math.min(thicknessProfile.length - 1, idx + 1)];
        customH = h0 + (h1 - h0) * frac;
      }
      const jagged = Math.sin(i * 0.3) * 4 + Math.sin(i * 0.08) * 3;
      heights[i] = Math.max(12, Math.floor(customH + jagged));
    }

    for (let dx = 0; dx < w; dx++) {
      const px = x + dx;
      if (px < 0 || px >= this.width) continue;
      const colH = heights[dx];
      for (let dy = 0; dy < colH; dy++) {
        const py = y + dy;
        if (py < 0 || py >= this.height) continue;
        this.grid[py * this.width + px] = 1;
      }
    }

    this.ctx.beginPath();
    this.ctx.moveTo(x, y);
    this.ctx.lineTo(x + w, y);
    for (let dx = w - 1; dx >= 0; dx -= 3) {
      this.ctx.lineTo(x + dx, y + heights[dx]);
    }
    this.ctx.closePath();

    this.ctx.save();
    this.ctx.shadowColor = pal.shadow;
    this.ctx.shadowBlur = 14;
    this.ctx.shadowOffsetY = 6;
    this.ctx.fillStyle = pal.base;
    this.ctx.fill();
    this.ctx.restore();

    if (this.pattern) {
      this.ctx.fillStyle = this.pattern;
      this.ctx.fill();
      this.ctx.fillStyle = pal.overlay;
      this.ctx.fill();
    } else {
      this.ctx.fillStyle = pal.base;
      this.ctx.fill();
    }

    this.ctx.fillStyle = pal.top;
    this.ctx.fillRect(x, y, w, 1.2);

    this.ctx.save();
    this.ctx.strokeStyle = pal.vein;
    this.ctx.lineWidth = 1;
    for (let dx = 15; dx < w - 15; dx += 35) {
      this.ctx.beginPath();
      this.ctx.moveTo(x + dx, y + 3);
      this.ctx.lineTo(x + dx + 6, y + heights[dx] / 2);
      this.ctx.lineTo(x + dx + 12, y + heights[dx] - 2);
      this.ctx.stroke();
    }
    this.ctx.restore();
  }

  drawQuantumCrystalFloor(x, y, w, baseH, thicknessProfile = [], paletteKey = 'purple') {
    x = Math.floor(x); y = Math.floor(y); w = Math.floor(w);
    const pal = this.getPalette(paletteKey, 'purple');
    
    const heights = new Array(w);
    for (let i = 0; i < w; i++) {
      let customH = baseH;
      if (thicknessProfile.length > 0) {
        const seg = (i / w) * (thicknessProfile.length - 1);
        const idx = Math.floor(seg);
        const frac = seg - idx;
        const h0 = thicknessProfile[idx];
        const h1 = thicknessProfile[Math.min(thicknessProfile.length - 1, idx + 1)];
        customH = h0 + (h1 - h0) * frac;
      }
      const geomStep = Math.floor((i % 24) / 12) * 3;
      heights[i] = Math.max(12, Math.floor(customH + geomStep));
    }

    for (let dx = 0; dx < w; dx++) {
      const px = x + dx;
      if (px < 0 || px >= this.width) continue;
      const colH = heights[dx];
      for (let dy = 0; dy < colH; dy++) {
        const py = y + dy;
        if (py < 0 || py >= this.height) continue;
        this.grid[py * this.width + px] = 1;
      }
    }

    this.ctx.beginPath();
    this.ctx.moveTo(x, y);
    this.ctx.lineTo(x + w, y);
    for (let dx = w - 1; dx >= 0; dx -= 4) {
      this.ctx.lineTo(x + dx, y + heights[dx]);
    }
    this.ctx.closePath();

    this.ctx.save();
    this.ctx.shadowColor = pal.shadow;
    this.ctx.shadowBlur = 14;
    this.ctx.shadowOffsetY = 6;
    this.ctx.fillStyle = pal.base;
    this.ctx.fill();
    this.ctx.restore();

    if (this.pattern) {
      this.ctx.fillStyle = this.pattern;
      this.ctx.fill();
      this.ctx.fillStyle = pal.overlay;
      this.ctx.fill();
    } else {
      this.ctx.fillStyle = pal.base;
      this.ctx.fill();
    }

    this.ctx.fillStyle = pal.top;
    this.ctx.fillRect(x, y, w, 1.2);

    this.ctx.save();
    this.ctx.strokeStyle = pal.vein;
    this.ctx.lineWidth = 1;
    for (let dx = 24; dx < w - 24; dx += 48) {
      this.ctx.beginPath();
      this.ctx.moveTo(x + dx, y + 2);
      this.ctx.lineTo(x + dx + 12, y + heights[dx] - 4);
      this.ctx.stroke();
    }
    this.ctx.restore();
  }

  drawRockWall(x, y, w, h, paletteKey = 'cyan') {
    x = Math.floor(x); y = Math.floor(y); w = Math.floor(w); h = Math.floor(h);
    const pal = this.getPalette(paletteKey, 'cyan');

    for (let py = y; py < y + h; py++) {
      if (py < 0 || py >= this.height) continue;
      for (let px = x; px < x + w; px++) {
        if (px < 0 || px >= this.width) continue;
        this.grid[py * this.width + px] = 1;
      }
    }

    this.ctx.save();
    this.ctx.shadowColor = pal.shadow;
    this.ctx.shadowBlur = 10;
    this.ctx.shadowOffsetY = 4;
    this.ctx.fillStyle = pal.base;
    this.ctx.fillRect(x, y, w, h);
    this.ctx.restore();

    if (this.pattern) {
      this.ctx.fillStyle = this.pattern;
      this.ctx.fillRect(x, y, w, h);
      this.ctx.fillStyle = pal.overlay;
      this.ctx.fillRect(x, y, w, h);
    } else {
      this.ctx.fillStyle = pal.base;
      this.ctx.fillRect(x, y, w, h);
    }

    this.ctx.strokeStyle = pal.border;
    this.ctx.lineWidth = 1.2;
    this.ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    this.ctx.fillStyle = pal.top;
    this.ctx.fillRect(x, y, w, 1.2);
  }

  drawSteelBarrier(x, y, w, h) {
    x = Math.floor(x); y = Math.floor(y); w = Math.floor(w); h = Math.floor(h);
    if (!this.steelBarriers.some(b => b.x === x && b.y === y && b.w === w && b.h === h)) {
      this.steelBarriers.push({ x, y, w, h });
    }
    this.renderSingleSteelBarrier(x, y, w, h);
  }

  renderSingleSteelBarrier(x, y, w, h) {
    for (let py = y; py < y + h; py++) {
      if (py < 0 || py >= this.height) continue;
      for (let px = x; px < x + w; px++) {
        if (px < 0 || px >= this.width) continue;
        this.grid[py * this.width + px] = 2;
      }
    }

    this.ctx.save();
    this.ctx.globalCompositeOperation = 'source-over';
    this.ctx.fillStyle = '#1b2330';
    this.ctx.fillRect(x, y, w, h);

    this.ctx.beginPath();
    this.ctx.rect(x, y, w, h);
    this.ctx.clip();

    const stripeW = 8;
    for (let sx = -h; sx < w + h; sx += stripeW * 2) {
      this.ctx.fillStyle = '#ffb700';
      this.ctx.beginPath();
      this.ctx.moveTo(x + sx, y);
      this.ctx.lineTo(x + sx + stripeW, y);
      this.ctx.lineTo(x + sx + stripeW - h, y + h);
      this.ctx.lineTo(x + sx - h, y + h);
      this.ctx.closePath();
      this.ctx.fill();
    }
    this.ctx.restore();

    this.ctx.save();
    this.ctx.globalCompositeOperation = 'source-over';
    this.ctx.strokeStyle = '#ffb700';
    this.ctx.lineWidth = 1.5;
    this.ctx.strokeRect(x, y, w, h);
    this.ctx.restore();
  }

  restoreSteelBarriersInBox(rx, ry, rw, rh) {
    for (const b of this.steelBarriers) {
      if (rx < b.x + b.w && rx + rw > b.x && ry < b.y + b.h && ry + rh > b.y) {
        this.renderSingleSteelBarrier(b.x, b.y, b.w, b.h);
      }
    }
  }

  carveCircle(cx, cy, radius, particles) {
    cx = Math.floor(cx); cy = Math.floor(cy);
    const r2 = radius * radius;
    let modified = false;

    for (let dy = -radius; dy <= radius; dy++) {
      const py = cy + dy;
      if (py < 0 || py >= this.height) continue;
      for (let dx = -radius; dx <= radius; dx++) {
        const px = cx + dx;
        if (px < 0 || px >= this.width) continue;
        if (dx * dx + dy * dy <= r2) {
          // Core Overload bomb CAN blast both natural terrain (1) and player structures (3)
          if (this.grid[py * this.width + px] === 1 || this.grid[py * this.width + px] === 3) {
            this.grid[py * this.width + px] = 0;
            modified = true;
          }
        }
      }
    }

    this.ctx.save();
    this.ctx.globalCompositeOperation = 'destination-out';
    this.ctx.beginPath();
    this.ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.restore();

    // Instantly restore any indestructible steel barrier in the blast radius
    this.restoreSteelBarriersInBox(cx - radius - 2, cy - radius - 2, radius * 2 + 4, radius * 2 + 4);

    // Filter out completely destroyed structures from list
    if (this.constructedStructures && this.constructedStructures.length > 0) {
      this.constructedStructures = this.constructedStructures.filter(s => {
        const sx = s.x + s.w / 2;
        const sy = s.y + s.h / 2;
        const dist2 = (sx - cx) * (sx - cx) + (sy - cy) * (sy - cy);
        return dist2 > r2; // Keep structures outside explosion
      });
      this.restoreStructuresInBox(cx - radius - 4, cy - radius - 4, radius * 2 + 8, radius * 2 + 8);
    }

    if (modified && particles) {
      particles.spawnBurst(cx, cy, '#00f3ff', 24, 4);
      particles.spawnBurst(cx, cy, '#ff7700', 16, 3);
    }
  }

  carveRect(x, y, w, h, particles) {
    x = Math.floor(x); y = Math.floor(y); w = Math.floor(w); h = Math.floor(h);
    let modified = false;
    let hitImpenetrable = false;

    for (let py = y; py < y + h; py++) {
      if (py < 0 || py >= this.height) continue;
      for (let px = x; px < x + w; px++) {
        if (px < 0 || px >= this.width) continue;
        const cell = this.grid[py * this.width + px];
        if (cell === 2 || cell === 3) {
          // 2 = Steel Barrier, 3 = Player Structure (Both IMMUNE to laser/drill/mine)
          hitImpenetrable = true;
          continue;
        }
        if (cell === 1) {
          this.grid[py * this.width + px] = 0;
          modified = true;
        }
      }
    }

    // Always unconditionally clear canvas pixels for natural terrain cut
    this.ctx.clearRect(x, y, w, h);
    this.ctx.save();
    this.ctx.globalCompositeOperation = 'destination-out';
    this.ctx.fillStyle = '#000000';
    this.ctx.fillRect(x, y, w, h);
    this.ctx.restore();

    // Instantly restore and protect steel barriers and constructed structures
    if (this.steelBarriers && this.steelBarriers.length > 0) {
      this.restoreSteelBarriersInBox(x - 2, y - 2, w + 4, h + 4);
    }
    if (this.constructedStructures && this.constructedStructures.length > 0) {
      this.restoreStructuresInBox(x - 2, y - 2, w + 4, h + 4);
    }

    if (modified && particles) {
      particles.spawnBurst(x + w / 2, y + h / 2, '#00f3ff', 6, 2);
    }
    if (hitImpenetrable && particles && Math.random() < 0.3) {
      particles.spawnBurst(x + w / 2, y + h / 2, '#ffb700', 8, 3);
    }
    return hitImpenetrable;
  }

  buildStep(x, y, dir, particles) {
    x = Math.floor(x); y = Math.floor(y);
    const w = 14;
    const h = 4;
    const startX = dir > 0 ? x - 2 : x - w + 2;
    const startY = y - h;

    const struct = { x: startX, y: startY, w, h, type: 'step' };
    this.constructedStructures.push(struct);
    this.renderSingleStructure(struct);

    if (particles) {
      particles.spawnBurst(startX + w / 2, y - h, '#00f3ff', 6, 1.2);
    }
  }

  buildScrapPlatform(cx, cy, width = 28, height = 4) {
    cx = Math.floor(cx); cy = Math.floor(cy);
    const startX = Math.floor(cx - width / 2);
    const startY = Math.floor(cy - height / 2);

    const struct = { x: startX, y: startY, w: width, h: height, type: 'platform' };
    this.constructedStructures.push(struct);
    this.renderSingleStructure(struct);
  }

  renderSingleStructure(struct) {
    const { x, y, w, h, type } = struct;
    for (let py = y; py <= y + h; py++) {
      if (py < 0 || py >= this.height) continue;
      for (let px = x; px < x + w; px++) {
        if (px < 0 || px >= this.width) continue;
        if (this.grid[py * this.width + px] !== 2) {
          this.grid[py * this.width + px] = 3; // 3 = Player-Built Structure
        }
      }
    }

    this.ctx.save();
    this.ctx.globalCompositeOperation = 'source-over';
    if (type === 'platform') {
      this.ctx.fillStyle = '#ffaa00';
      this.ctx.fillRect(x, y, w, h);
      this.ctx.fillStyle = '#ffffff';
      this.ctx.fillRect(x + 2, y, w - 4, 1);
    } else {
      this.ctx.fillStyle = '#00f3ff';
      this.ctx.fillRect(x, y, w, h);
      this.ctx.fillStyle = '#ffffff';
      this.ctx.fillRect(x + 1, y, w - 2, 1);
    }
    this.ctx.restore();
  }

  restoreStructuresInBox(rx, ry, rw, rh) {
    for (const s of this.constructedStructures) {
      if (rx < s.x + s.w && rx + rw > s.x && ry < s.y + s.h && ry + rh > s.y) {
        this.renderSingleStructure(s);
      }
    }
  }
}
