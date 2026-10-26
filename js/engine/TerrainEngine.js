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
    this.steelPlatforms = [];
    this.steelSlopes = [];
    this.steelBeams = [];
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
    this.steelPlatforms = [];
    this.steelSlopes = [];
    this.steelBeams = [];
    this.constructedStructures = [];
  }

  isSolid(x, y) {
    x = Math.floor(x);
    y = Math.floor(y);
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return false;
    return this.grid[y * this.width + x] !== 0;
  }

  isNaturalSolid(x, y) {
    x = Math.floor(x);
    y = Math.floor(y);
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return false;
    const val = this.grid[y * this.width + x];
    return val === 1 || val === 2;
  }

  isStructure(x, y) {
    x = Math.floor(x);
    y = Math.floor(y);
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return false;
    return this.grid[y * this.width + x] === 3;
  }

  getStructureAt(x, y) {
    x = Math.floor(x);
    y = Math.floor(y);
    if (!this.constructedStructures) return null;
    for (let i = this.constructedStructures.length - 1; i >= 0; i--) {
      const s = this.constructedStructures[i];
      if (x >= s.x && x < s.x + s.w && y >= s.y && y <= s.y + s.h) {
        return s;
      }
    }
    return null;
  }

  hasClimbableStair(x, y, dir, searchRange = 6) {
    x = Math.floor(x);
    y = Math.floor(y);
    if (!this.constructedStructures) return false;
    for (let i = 0; i < this.constructedStructures.length; i++) {
      const s = this.constructedStructures[i];
      if (s.type === 'step' && s.dir === dir) {
        if (x >= s.x - 2 && x < s.x + s.w + 2 && y >= s.y - searchRange && y <= s.y + s.h + searchRange) {
          return true;
        }
      }
    }
    return false;
  }

  hasOnlyReverseStair(x, y, dir) {
    x = Math.floor(x);
    y = Math.floor(y);
    if (!this.constructedStructures) return false;
    let foundAnyStair = false;
    let foundMatchingStair = false;
    for (let i = 0; i < this.constructedStructures.length; i++) {
      const s = this.constructedStructures[i];
      if (s.type === 'step' && x >= s.x - 2 && x < s.x + s.w + 2 && y >= s.y - 2 && y <= s.y + s.h + 2) {
        foundAnyStair = true;
        if (s.dir === dir) {
          foundMatchingStair = true;
        }
      }
    }
    return foundAnyStair && !foundMatchingStair;
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
    this.ctx.shadowBlur = 4;
    this.ctx.shadowOffsetY = 2;
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
    this.ctx.lineWidth = 0.6;
    this.ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

    this.ctx.fillStyle = pal.top;
    this.ctx.fillRect(x, y, w, 1.2);

    // Modular Grid Texturing: Repeat both horizontally (every 32px) and vertically (every 20px) without distortion
    this.ctx.save();
    this.ctx.beginPath();
    this.ctx.rect(x, y, w, h);
    this.ctx.clip();

    // Horizontal strata lines every 20px down the height
    for (let sy = y + 20; sy < y + h; sy += 20) {
      this.ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)';
      this.ctx.lineWidth = 1.2;
      this.ctx.beginPath();
      this.ctx.moveTo(x, sy);
      this.ctx.lineTo(x + w, sy);
      this.ctx.stroke();

      this.ctx.strokeStyle = pal.vein;
      this.ctx.lineWidth = 0.8;
      this.ctx.beginPath();
      this.ctx.moveTo(x, sy + 1);
      this.ctx.lineTo(x + w, sy + 1);
      this.ctx.stroke();
    }

    // Vertical seam joints (staggered bricks every 32px)
    let rowIdx = 0;
    for (let sy = y; sy < y + h; sy += 20) {
      const offsetX = (rowIdx % 2 === 1) ? 16 : 0;
      for (let sx = x + 32 + offsetX; sx < x + w; sx += 32) {
        this.ctx.strokeStyle = pal.vein;
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        this.ctx.moveTo(sx, sy + 1);
        this.ctx.lineTo(sx, Math.min(y + h - 1, sy + 20));
        this.ctx.stroke();
      }
      rowIdx++;
    }
    this.ctx.restore();
  }

  // --- 1.5 Custom Polygon Rock (Click points to close loop & form solid natural rock) ---
  // --- 1.5 Custom Polygon Rock (Supports Natural Rock, Volcanic Basalt, Quantum Crystal, and Chrome Steel) ---
  drawPolygonRock(points, paletteKey = 'cyan', material = 'rock', isSteel = false) {
    if (!points || points.length < 3) return;

    const isChrome = isSteel || material === 'steel' || material === 'steelBarrier' || material === 'steelPlatform';
    const isVolcano = material === 'volcanicBasalt' || (!isChrome && paletteKey === 'red');
    const isQuantum = material === 'quantumCrystal' || (!isChrome && paletteKey === 'purple');

    let effectivePalKey = paletteKey;
    if (isVolcano && paletteKey === 'cyan') effectivePalKey = 'red';
    if (isQuantum && paletteKey === 'cyan') effectivePalKey = 'purple';
    const pal = this.getPalette(effectivePalKey, 'cyan');

    // 1. Calculate bounding box
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of points) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    minX = Math.max(0, Math.floor(minX));
    maxX = Math.min(this.width - 1, Math.ceil(maxX));
    minY = Math.max(0, Math.floor(minY));
    maxY = Math.min(this.height - 1, Math.ceil(maxY));
    const w = maxX - minX;
    const h = maxY - minY;
    if (w <= 0 || h <= 0) return;

    // 2. Scanline Polygon Rasterization into this.grid (1 = natural destructible rock, 2 = indestructible steel)
    const gridVal = isChrome ? 2 : 1;
    const n = points.length;
    for (let py = minY; py <= maxY; py++) {
      const nodeX = [];
      const scanY = py + 0.5;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const p1 = points[i];
        const p2 = points[j];
        if ((p1.y < scanY && p2.y >= scanY) || (p2.y < scanY && p1.y >= scanY)) {
          const interX = p1.x + (scanY - p1.y) / (p2.y - p1.y) * (p2.x - p1.x);
          nodeX.push(interX);
        }
      }
      nodeX.sort((a, b) => a - b);
      for (let i = 0; i < nodeX.length; i += 2) {
        if (i + 1 < nodeX.length) {
          const startX = Math.max(0, Math.ceil(nodeX[i]));
          const endX = Math.min(this.width - 1, Math.floor(nodeX[i + 1]));
          for (let px = startX; px <= endX; px++) {
            this.grid[py * this.width + px] = gridVal;
          }
        }
      }
    }

    // 3. Render Polygon Graphics onto Canvas
    // 3.1 Drop Shadow (Subtle & soft blur)
    this.ctx.save();
    this.ctx.beginPath();
    this.ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < n; i++) {
      this.ctx.lineTo(points[i].x, points[i].y);
    }
    this.ctx.closePath();

    if (isVolcano) {
      this.ctx.shadowColor = 'rgba(255, 50, 0, 0.5)';
      this.ctx.shadowBlur = 4;
      this.ctx.shadowOffsetY = 2;
      this.ctx.fillStyle = '#180e12';
    } else if (isQuantum) {
      this.ctx.shadowColor = 'rgba(191, 0, 255, 0.5)';
      this.ctx.shadowBlur = 4;
      this.ctx.shadowOffsetY = 2;
      this.ctx.fillStyle = '#160824';
    } else if (isChrome) {
      this.ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
      this.ctx.shadowBlur = 4;
      this.ctx.shadowOffsetY = 2;
      this.ctx.fillStyle = '#141c26';
    } else {
      this.ctx.shadowColor = pal.shadow || 'rgba(0, 0, 0, 0.7)';
      this.ctx.shadowBlur = 4;
      this.ctx.shadowOffsetY = 2;
      this.ctx.fillStyle = pal.base;
    }
    this.ctx.fill();
    this.ctx.restore();

    // 3.2 Fill interior with layered rich material graphics
    this.ctx.save();
    this.ctx.beginPath();
    this.ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < n; i++) {
      this.ctx.lineTo(points[i].x, points[i].y);
    }
    this.ctx.closePath();
    this.ctx.clip();

    if (isVolcano) {
      // --- Volcanic Basalt Interior ---
      const grad = this.ctx.createLinearGradient(minX, minY, minX, maxY);
      grad.addColorStop(0, '#221016');
      grad.addColorStop(0.5, '#15090d');
      grad.addColorStop(1, '#0e0508');
      this.ctx.fillStyle = grad;
      this.ctx.fillRect(minX, minY, w, h);

      // Columnar joint fissure lines
      for (let colX = minX + 20; colX < maxX; colX += 20) {
        this.ctx.strokeStyle = '#0a0305';
        this.ctx.lineWidth = 1.4;
        this.ctx.beginPath();
        this.ctx.moveTo(colX, minY);
        this.ctx.lineTo(colX, maxY);
        this.ctx.stroke();

        this.ctx.strokeStyle = 'rgba(255, 80, 50, 0.18)';
        this.ctx.lineWidth = 0.6;
        this.ctx.beginPath();
        this.ctx.moveTo(colX + 1, minY);
        this.ctx.lineTo(colX + 1, maxY);
        this.ctx.stroke();
      }

      // Glowing Magma Veins
      for (let vx = minX + 16; vx < maxX; vx += 28) {
        const midY = minY + h * 0.5;
        this.ctx.save();
        this.ctx.strokeStyle = '#ff3700';
        this.ctx.lineWidth = 2.5;
        this.ctx.shadowColor = '#ff4400';
        this.ctx.shadowBlur = 6;
        this.ctx.beginPath();
        this.ctx.moveTo(vx, minY);
        this.ctx.lineTo(vx + 6, midY);
        this.ctx.lineTo(vx - 2, maxY);
        this.ctx.stroke();

        // Hot molten core
        this.ctx.strokeStyle = '#ffdd44';
        this.ctx.lineWidth = 1.0;
        this.ctx.shadowBlur = 0;
        this.ctx.beginPath();
        this.ctx.moveTo(vx, minY);
        this.ctx.lineTo(vx + 6, midY);
        this.ctx.lineTo(vx - 2, maxY);
        this.ctx.stroke();
        this.ctx.restore();
      }
    } else if (isQuantum) {
      // --- Quantum Crystal Interior ---
      const grad = this.ctx.createLinearGradient(minX, minY, maxX, maxY);
      grad.addColorStop(0, '#260c3e');
      grad.addColorStop(0.5, '#160726');
      grad.addColorStop(1, '#0c0316');
      this.ctx.fillStyle = grad;
      this.ctx.fillRect(minX, minY, w, h);

      // Crystal facet planes
      for (let fx = minX; fx < maxX; fx += 24) {
        this.ctx.fillStyle = 'rgba(191, 0, 255, 0.14)';
        this.ctx.beginPath();
        this.ctx.moveTo(fx, minY);
        this.ctx.lineTo(fx + 12, minY + h * 0.5);
        this.ctx.lineTo(fx, maxY);
        this.ctx.closePath();
        this.ctx.fill();

        this.ctx.fillStyle = 'rgba(0, 243, 255, 0.10)';
        this.ctx.beginPath();
        this.ctx.moveTo(fx + 12, minY + h * 0.5);
        this.ctx.lineTo(fx + 24, minY);
        this.ctx.lineTo(fx + 24, maxY);
        this.ctx.closePath();
        this.ctx.fill();

        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.20)';
        this.ctx.lineWidth = 0.6;
        this.ctx.beginPath();
        this.ctx.moveTo(fx, minY);
        this.ctx.lineTo(fx + 12, minY + h * 0.5);
        this.ctx.lineTo(fx, maxY);
        this.ctx.stroke();
      }

      // Quantum conduits
      this.ctx.save();
      this.ctx.strokeStyle = 'rgba(0, 243, 255, 0.55)';
      this.ctx.lineWidth = 1.0;
      this.ctx.shadowColor = '#00f3ff';
      this.ctx.shadowBlur = 4;
      for (let qx = minX + 12; qx < maxX; qx += 32) {
        const midY = minY + h * 0.5;
        this.ctx.beginPath();
        this.ctx.moveTo(qx, minY);
        this.ctx.lineTo(qx + 8, midY);
        this.ctx.lineTo(qx + 20, maxY);
        this.ctx.stroke();

        this.ctx.fillStyle = '#ffffff';
        this.ctx.beginPath();
        this.ctx.arc(qx + 8, midY, 1.4, 0, Math.PI * 2);
        this.ctx.fill();
      }
      this.ctx.restore();
    } else if (isChrome) {
      // --- Brushed Chrome Indestructible Steel Interior ---
      const chromeGrad = this.ctx.createLinearGradient(minX, minY, minX, maxY);
      chromeGrad.addColorStop(0.00, '#ffffff');
      chromeGrad.addColorStop(0.20, '#d8ecff');
      chromeGrad.addColorStop(0.40, '#85a7c4');
      chromeGrad.addColorStop(0.55, '#ffffff');
      chromeGrad.addColorStop(0.70, '#314457');
      chromeGrad.addColorStop(1.00, '#16212d');
      this.ctx.fillStyle = chromeGrad;
      this.ctx.fillRect(minX, minY, w, h);

      // Specular sheen sweep & hazard rivets
      for (let sx = -h; sx < w + h; sx += 40) {
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
        this.ctx.beginPath();
        this.ctx.moveTo(minX + sx, minY);
        this.ctx.lineTo(minX + sx + 14, minY);
        this.ctx.lineTo(minX + sx + 14 + h, maxY);
        this.ctx.lineTo(minX + sx + h, maxY);
        this.ctx.closePath();
        this.ctx.fill();
      }
    } else {
      // --- Default Natural Rock Interior ---
      this.ctx.fillStyle = pal.base;
      this.ctx.fillRect(minX, minY, w, h);

      if (this.pattern) {
        this.ctx.fillStyle = this.pattern;
        this.ctx.fillRect(minX, minY, w, h);
        this.ctx.fillStyle = pal.overlay;
        this.ctx.fillRect(minX, minY, w, h);
      }

      // Sedimentary rock strata
      for (let sy = minY; sy <= maxY; sy += 22) {
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
        this.ctx.fillRect(minX, sy, w, 2);
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
        this.ctx.fillRect(minX, sy + 2, w, 0.8);
      }

      // Vertical mineral fissures
      for (let fx = minX + 15; fx <= maxX; fx += 30) {
        this.ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)';
        this.ctx.lineWidth = 1.0;
        this.ctx.beginPath();
        this.ctx.moveTo(fx, minY);
        for (let cy = minY; cy <= maxY; cy += 16) {
          const offset = Math.sin(cy * 0.12 + fx * 0.05) * 3;
          this.ctx.lineTo(fx + offset, cy + 16);
        }
        this.ctx.stroke();

        this.ctx.strokeStyle = pal.vein || 'rgba(0, 243, 255, 0.2)';
        this.ctx.lineWidth = 0.6;
        this.ctx.stroke();
      }
    }
    this.ctx.restore();

    // 3.3 Outer Thin Boundary Outline Border (0.6px thin line so seams blend seamlessly)
    this.ctx.save();
    this.ctx.beginPath();
    this.ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < n; i++) {
      this.ctx.lineTo(points[i].x, points[i].y);
    }
    this.ctx.closePath();

    if (isVolcano) {
      this.ctx.strokeStyle = '#ff4400';
      this.ctx.lineWidth = 0.6;
    } else if (isQuantum) {
      this.ctx.strokeStyle = 'rgba(191, 0, 255, 0.85)';
      this.ctx.lineWidth = 0.6;
    } else if (isChrome) {
      this.ctx.strokeStyle = '#ffffff';
      this.ctx.lineWidth = 0.8;
    } else {
      this.ctx.strokeStyle = pal.border || 'rgba(0, 243, 255, 0.35)';
      this.ctx.lineWidth = 0.6;
    }
    this.ctx.stroke();

    // 3.4 Upper lighted surface highlights (Thin 0.7px highlight)
    for (let i = 0; i < n; i++) {
      const p1 = points[i];
      const p2 = points[(i + 1) % n];
      const dx = p2.x - p1.x;
      if (Math.abs(dx) > 3) {
        this.ctx.strokeStyle = isVolcano ? '#ffea66' : (isQuantum ? '#00f3ff' : (isChrome ? '#ffffff' : (pal.top || '#ffffff')));
        this.ctx.lineWidth = 0.7;
        this.ctx.beginPath();
        this.ctx.moveTo(p1.x, p1.y);
        this.ctx.lineTo(p2.x, p2.y);
        this.ctx.stroke();
      }
    }
    this.ctx.restore();
  }

  drawCraggyRockFloor(x, y, w, baseH, thicknessProfile = [], paletteKey = 'cyan', isRect = false) {
    x = Math.floor(x); y = Math.floor(y); w = Math.floor(w);
    const pal = this.getPalette(paletteKey, 'cyan');
    
    // Scale profile proportionally if baseH is significantly different from profile average
    let profileScale = 1.0;
    if (thicknessProfile && thicknessProfile.length > 0 && baseH > 0) {
      const avgProfile = thicknessProfile.reduce((sum, v) => sum + v, 0) / thicknessProfile.length;
      if (avgProfile > 0 && Math.abs(avgProfile - baseH) > 4) {
        profileScale = baseH / avgProfile;
      }
    }

    // Natural stratified rock heights: undulating geological crags
    const heights = new Array(w);
    for (let i = 0; i < w; i++) {
      let customH = baseH;
      if (thicknessProfile && thicknessProfile.length > 0) {
        const seg = (i / w) * (thicknessProfile.length - 1);
        const idx = Math.floor(seg);
        const frac = seg - idx;
        const h0 = thicknessProfile[idx];
        const h1 = thicknessProfile[Math.min(thicknessProfile.length - 1, idx + 1)];
        customH = (h0 + (h1 - h0) * frac) * profileScale;
      }
      if (isRect) {
        heights[i] = Math.max(12, Math.floor(customH));
      } else {
        // Natural rolling sediment wave with rocky steps
        const crags = Math.sin(i * 0.18) * 4 + Math.sin(i * 0.05) * 5 + (Math.floor(i / 16) % 2) * 2;
        heights[i] = Math.max(12, Math.floor(customH + crags));
      }
    }

    // Set bitmask grid (1 = destructible natural rock)
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

    // Define the craggy rock boundary path
    this.ctx.save();
    this.ctx.beginPath();
    this.ctx.moveTo(x, y);
    this.ctx.lineTo(x + w, y);
    for (let dx = w - 1; dx >= 0; dx -= 2) {
      this.ctx.lineTo(x + dx, y + heights[dx]);
    }
    this.ctx.closePath();

    // Drop shadow
    this.ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
    this.ctx.shadowBlur = 4;
    this.ctx.shadowOffsetY = 2;
    this.ctx.fillStyle = pal.base;
    this.ctx.fill();
    this.ctx.restore();

    // Now render rich sedimentary strata & rock texture inside boundary
    this.ctx.save();
    this.ctx.beginPath();
    this.ctx.moveTo(x, y);
    this.ctx.lineTo(x + w, y);
    for (let dx = w - 1; dx >= 0; dx -= 2) {
      this.ctx.lineTo(x + dx, y + heights[dx]);
    }
    this.ctx.closePath();
    this.ctx.clip();

    // Base rock gradient
    const maxColH = Math.max(...heights);
    const grad = this.ctx.createLinearGradient(x, y, x, y + maxColH);
    grad.addColorStop(0, pal.base);
    grad.addColorStop(1, '#101721');
    this.ctx.fillStyle = grad;
    this.ctx.fillRect(x, y, w, maxColH);

    // 1. Sedimentary strata bands (3~4 wavy geological layers)
    const bandCount = Math.max(2, Math.floor(baseH / 10));
    for (let b = 1; b <= bandCount; b++) {
      const bandY = y + (b / (bandCount + 1)) * baseH;
      this.ctx.fillStyle = (b % 2 === 0) ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.28)';
      this.ctx.beginPath();
      this.ctx.moveTo(x, bandY);
      for (let dx = 0; dx <= w; dx += 10) {
        const wave = Math.sin((x + dx) * 0.08 + b) * 2.5;
        this.ctx.lineTo(x + dx, bandY + wave);
      }
      this.ctx.lineTo(x + w, bandY + 8);
      this.ctx.lineTo(x, bandY + 8);
      this.ctx.closePath();
      this.ctx.fill();
    }

    // 2. Angled rock cleavage cracks & fissures
    this.ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
    this.ctx.lineWidth = 1.4;
    for (let cx = x + 16; cx < x + w - 10; cx += 28) {
      const idx = cx - x;
      const hLocal = heights[Math.min(w - 1, idx)] || baseH;
      this.ctx.beginPath();
      this.ctx.moveTo(cx, y + 2);
      this.ctx.lineTo(cx - 8, y + hLocal * 0.45);
      this.ctx.lineTo(cx + 4, y + hLocal - 3);
      this.ctx.stroke();

      // Rock bevel highlight adjacent to crack
      this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
      this.ctx.lineWidth = 0.8;
      this.ctx.beginPath();
      this.ctx.moveTo(cx + 1, y + 2);
      this.ctx.lineTo(cx - 7, y + hLocal * 0.45);
      this.ctx.lineTo(cx + 5, y + hLocal - 3);
      this.ctx.stroke();
      this.ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
      this.ctx.lineWidth = 1.4;
    }

    // 3. Embedded mineral grains / rock flecks
    this.ctx.fillStyle = pal.vein;
    for (let fx = x + 8; fx < x + w - 8; fx += 14) {
      const seed = Math.sin(fx * 3.7);
      const fy = y + 4 + Math.abs(seed) * (baseH - 8);
      this.ctx.fillRect(fx, fy, 2, 1.5);
    }

    this.ctx.restore();

    // Rock top surface line with stony highlights
    this.ctx.save();
    this.ctx.fillStyle = pal.top;
    this.ctx.fillRect(x, y, w, 1.2);
    this.ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
    this.ctx.fillRect(x, y, w, 0.5);

    // Rough craggy bottom outline (thin 0.6px line)
    this.ctx.strokeStyle = pal.border;
    this.ctx.lineWidth = 0.6;
    this.ctx.beginPath();
    this.ctx.moveTo(x + w, y + heights[w - 1]);
    for (let dx = w - 1; dx >= 0; dx -= 2) {
      this.ctx.lineTo(x + dx, y + heights[dx]);
    }
    this.ctx.stroke();
    this.ctx.restore();
  }

  drawVolcanicBasaltFloor(x, y, w, baseH, thicknessProfile = [], paletteKey = 'red', isRect = false) {
    x = Math.floor(x); y = Math.floor(y); w = Math.floor(w);
    const pal = this.getPalette(paletteKey, 'red');
    
    // Scale profile proportionally if baseH is significantly different from profile average
    let profileScale = 1.0;
    if (thicknessProfile && thicknessProfile.length > 0 && baseH > 0) {
      const avgProfile = thicknessProfile.reduce((sum, v) => sum + v, 0) / thicknessProfile.length;
      if (avgProfile > 0 && Math.abs(avgProfile - baseH) > 4) {
        profileScale = baseH / avgProfile;
      }
    }

    // Columnar basalt profile: vertical prismatic steps and sharp dips
    const heights = new Array(w);
    for (let i = 0; i < w; i++) {
      let customH = baseH;
      if (thicknessProfile && thicknessProfile.length > 0) {
        const seg = (i / w) * (thicknessProfile.length - 1);
        const idx = Math.floor(seg);
        const frac = seg - idx;
        const h0 = thicknessProfile[idx];
        const h1 = thicknessProfile[Math.min(thicknessProfile.length - 1, idx + 1)];
        customH = (h0 + (h1 - h0) * frac) * profileScale;
      }
      if (isRect) {
        heights[i] = Math.max(14, Math.floor(customH));
      } else {
        // Columnar block joints: distinct 20px stepped columns with spiky slag
        const colStep = (Math.floor(i / 20) % 2 === 0) ? 4 : -3;
        const slagDrip = ((i % 10) === 5) ? 6 : 0;
        const jagged = Math.sin(i * 0.4) * 3 + colStep + slagDrip;
        heights[i] = Math.max(14, Math.floor(customH + jagged));
      }
    }

    // Set bitmask grid (1 = destructible)
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

    // Define boundary path
    this.ctx.save();
    this.ctx.beginPath();
    this.ctx.moveTo(x, y);
    this.ctx.lineTo(x + w, y);
    for (let dx = w - 1; dx >= 0; dx -= 2) {
      this.ctx.lineTo(x + dx, y + heights[dx]);
    }
    this.ctx.closePath();

    // Hot magma underglow shadow
    this.ctx.shadowColor = 'rgba(255, 50, 0, 0.5)';
    this.ctx.shadowBlur = 4;
    this.ctx.shadowOffsetY = 2;
    this.ctx.fillStyle = '#180e12';
    this.ctx.fill();
    this.ctx.restore();

    // Clip & render dark basalt columns with glowing magma veins
    this.ctx.save();
    this.ctx.beginPath();
    this.ctx.moveTo(x, y);
    this.ctx.lineTo(x + w, y);
    for (let dx = w - 1; dx >= 0; dx -= 2) {
      this.ctx.lineTo(x + dx, y + heights[dx]);
    }
    this.ctx.closePath();
    this.ctx.clip();

    // 1. Dark charcoal/obsidian base
    const maxColH = Math.max(...heights);
    const grad = this.ctx.createLinearGradient(x, y, x, y + maxColH);
    grad.addColorStop(0, '#221016');
    grad.addColorStop(0.5, '#15090d');
    grad.addColorStop(1, '#0e0508');
    this.ctx.fillStyle = grad;
    this.ctx.fillRect(x, y, w, maxColH);

    // 2. Columnar basalt vertical joint lines (주상절리)
    for (let colX = x + 20; colX < x + w; colX += 20) {
      // Column shade alternation
      const colIdx = Math.floor((colX - x) / 20);
      if (colIdx % 2 === 0) {
        this.ctx.fillStyle = 'rgba(255, 60, 40, 0.05)';
        this.ctx.fillRect(colX - 20, y, 20, maxColH);
      }
      // Joint fissure
      this.ctx.strokeStyle = '#0a0305';
      this.ctx.lineWidth = 1.4;
      this.ctx.beginPath();
      this.ctx.moveTo(colX, y + 2);
      this.ctx.lineTo(colX, y + maxColH);
      this.ctx.stroke();

      this.ctx.strokeStyle = 'rgba(255, 80, 50, 0.2)';
      this.ctx.lineWidth = 0.6;
      this.ctx.beginPath();
      this.ctx.moveTo(colX + 1, y + 2);
      this.ctx.lineTo(colX + 1, y + maxColH);
      this.ctx.stroke();
    }

    // 3. GLOWING MAGMA VEINS (Brilliant molten lava fissures)
    for (let vx = x + 15; vx < x + w - 10; vx += 32) {
      const idx = vx - x;
      const hLocal = heights[Math.min(w - 1, idx)] || baseH;
      const midY = y + hLocal * 0.55;
      
      // Outer intense lava glow
      this.ctx.save();
      this.ctx.strokeStyle = '#ff3700';
      this.ctx.lineWidth = 2.5;
      this.ctx.shadowColor = '#ff4400';
      this.ctx.shadowBlur = 6;
      this.ctx.beginPath();
      this.ctx.moveTo(vx, y + 4);
      this.ctx.lineTo(vx + 6, midY);
      this.ctx.lineTo(vx - 2, y + hLocal - 2);
      this.ctx.stroke();

      // Branching fissure
      this.ctx.beginPath();
      this.ctx.moveTo(vx + 6, midY);
      this.ctx.lineTo(vx + 14, midY + 6);
      this.ctx.stroke();

      // Hot core (Yellow/White hot lava)
      this.ctx.strokeStyle = '#ffdd44';
      this.ctx.lineWidth = 1.0;
      this.ctx.shadowBlur = 0;
      this.ctx.beginPath();
      this.ctx.moveTo(vx, y + 4);
      this.ctx.lineTo(vx + 6, midY);
      this.ctx.lineTo(vx - 2, y + hLocal - 2);
      this.ctx.stroke();
      this.ctx.beginPath();
      this.ctx.moveTo(vx + 6, midY);
      this.ctx.lineTo(vx + 14, midY + 6);
      this.ctx.stroke();
      this.ctx.restore();
    }

    // 4. Volcanic vesicles (porous air bubble pockets)
    this.ctx.fillStyle = '#0a0305';
    for (let px = x + 6; px < x + w - 6; px += 18) {
      const seed = Math.cos(px * 4.3);
      const py = y + 5 + Math.abs(seed) * (baseH - 10);
      this.ctx.beginPath();
      this.ctx.arc(px, py, 1.8, 0, Math.PI * 2);
      this.ctx.fill();
    }

    this.ctx.restore();

    // Top surface: Scorched crust with fiery ember line
    this.ctx.save();
    this.ctx.fillStyle = '#ff3300';
    this.ctx.fillRect(x, y, w, 1.5);
    this.ctx.fillStyle = '#ffea66';
    this.ctx.fillRect(x, y, w, 0.6);

    // Bottom slag border outline (thin 0.6px line)
    this.ctx.strokeStyle = '#ff4400';
    this.ctx.lineWidth = 0.6;
    this.ctx.beginPath();
    this.ctx.moveTo(x + w, y + heights[w - 1]);
    for (let dx = w - 1; dx >= 0; dx -= 2) {
      this.ctx.lineTo(x + dx, y + heights[dx]);
    }
    this.ctx.stroke();
    this.ctx.restore();
  }

  drawQuantumCrystalFloor(x, y, w, baseH, thicknessProfile = [], paletteKey = 'purple', isRect = false) {
    x = Math.floor(x); y = Math.floor(y); w = Math.floor(w);
    const pal = this.getPalette(paletteKey, 'purple');
    
    // Scale profile proportionally if baseH is significantly different from profile average
    let profileScale = 1.0;
    if (thicknessProfile && thicknessProfile.length > 0 && baseH > 0) {
      const avgProfile = thicknessProfile.reduce((sum, v) => sum + v, 0) / thicknessProfile.length;
      if (avgProfile > 0 && Math.abs(avgProfile - baseH) > 4) {
        profileScale = baseH / avgProfile;
      }
    }

    // Prismatic crystal silhouette: sharp 45° and 60° downward facets and stepped crystal points
    const heights = new Array(w);
    for (let i = 0; i < w; i++) {
      let customH = baseH;
      if (thicknessProfile && thicknessProfile.length > 0) {
        const seg = (i / w) * (thicknessProfile.length - 1);
        const idx = Math.floor(seg);
        const frac = seg - idx;
        const h0 = thicknessProfile[idx];
        const h1 = thicknessProfile[Math.min(thicknessProfile.length - 1, idx + 1)];
        customH = (h0 + (h1 - h0) * frac) * profileScale;
      }
      if (isRect) {
        heights[i] = Math.max(14, Math.floor(customH));
      } else {
        // Sharp triangular crystal points repeating every 24px
        const crystalPhase = (i % 24);
        const crystalTip = (crystalPhase < 12) ? (crystalPhase * 0.9) : ((24 - crystalPhase) * 0.9);
        const steppedPillar = Math.floor(i / 24) % 2 === 0 ? 3 : -3;
        heights[i] = Math.max(14, Math.floor(customH + crystalTip + steppedPillar));
      }
    }

    // Set bitmask grid (1 = destructible)
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

    // Define crystal boundary
    this.ctx.save();
    this.ctx.beginPath();
    this.ctx.moveTo(x, y);
    this.ctx.lineTo(x + w, y);
    for (let dx = w - 1; dx >= 0; dx -= 3) {
      this.ctx.lineTo(x + dx, y + heights[dx]);
    }
    this.ctx.closePath();

    // Neon violet/cyan quantum shadow
    this.ctx.shadowColor = 'rgba(191, 0, 255, 0.5)';
    this.ctx.shadowBlur = 4;
    this.ctx.shadowOffsetY = 2;
    this.ctx.fillStyle = '#160824';
    this.ctx.fill();
    this.ctx.restore();

    // Clip & render alien quantum crystal facets and refractive energy conduits
    this.ctx.save();
    this.ctx.beginPath();
    this.ctx.moveTo(x, y);
    this.ctx.lineTo(x + w, y);
    for (let dx = w - 1; dx >= 0; dx -= 3) {
      this.ctx.lineTo(x + dx, y + heights[dx]);
    }
    this.ctx.closePath();
    this.ctx.clip();

    // 1. Cosmic violet/indigo crystal gradient
    const maxColH = Math.max(...heights);
    const grad = this.ctx.createLinearGradient(x, y, x + w * 0.5, y + maxColH);
    grad.addColorStop(0, '#260c3e');
    grad.addColorStop(0.5, '#160726');
    grad.addColorStop(1, '#0c0316');
    this.ctx.fillStyle = grad;
    this.ctx.fillRect(x, y, w, maxColH);

    // 2. Polygonal crystal facets (rhombus / triangular gem planes)
    for (let fx = x; fx < x + w; fx += 24) {
      const hLocal = heights[Math.min(w - 1, fx - x)] || baseH;
      // Top-left facet
      this.ctx.fillStyle = 'rgba(191, 0, 255, 0.15)';
      this.ctx.beginPath();
      this.ctx.moveTo(fx, y);
      this.ctx.lineTo(fx + 12, y + hLocal * 0.5);
      this.ctx.lineTo(fx, y + hLocal);
      this.ctx.closePath();
      this.ctx.fill();

      // Top-right specular crystal facet
      this.ctx.fillStyle = 'rgba(0, 243, 255, 0.12)';
      this.ctx.beginPath();
      this.ctx.moveTo(fx + 12, y + hLocal * 0.5);
      this.ctx.lineTo(fx + 24, y);
      this.ctx.lineTo(fx + 24, y + hLocal);
      this.ctx.closePath();
      this.ctx.fill();

      // Sharp facet ridge lines
      this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.20)';
      this.ctx.lineWidth = 0.6;
      this.ctx.beginPath();
      this.ctx.moveTo(fx, y);
      this.ctx.lineTo(fx + 12, y + hLocal * 0.5);
      this.ctx.lineTo(fx, y + hLocal);
      this.ctx.stroke();
    }

    // 3. Glowing quantum circuit lines & crystalline nodes
    this.ctx.save();
    this.ctx.strokeStyle = 'rgba(0, 243, 255, 0.55)';
    this.ctx.lineWidth = 1.0;
    this.ctx.shadowColor = '#00f3ff';
    this.ctx.shadowBlur = 4;
    for (let qx = x + 12; qx < x + w - 8; qx += 36) {
      const idx = qx - x;
      const hLocal = heights[Math.min(w - 1, idx)] || baseH;
      const midY = y + hLocal * 0.5;

      this.ctx.beginPath();
      this.ctx.moveTo(qx, y + 2);
      this.ctx.lineTo(qx + 8, midY);
      this.ctx.lineTo(qx + 16, midY);
      this.ctx.lineTo(qx + 24, y + hLocal - 3);
      this.ctx.stroke();

      // Glowing quantum node dot
      this.ctx.fillStyle = '#ffffff';
      this.ctx.beginPath();
      this.ctx.arc(qx + 12, midY, 1.6, 0, Math.PI * 2);
      this.ctx.fill();
    }
    this.ctx.restore();

    this.ctx.restore();

    // Polished crystal top edge with laser refraction
    this.ctx.save();
    this.ctx.fillStyle = '#bf00ff';
    this.ctx.fillRect(x, y, w, 1.4);
    this.ctx.fillStyle = '#00f3ff';
    this.ctx.fillRect(x, y, w, 0.6);

    // Sharp crystal facet bottom outline (thin 0.6px line)
    this.ctx.strokeStyle = 'rgba(191, 0, 255, 0.85)';
    this.ctx.lineWidth = 0.6;
    this.ctx.beginPath();
    this.ctx.moveTo(x + w, y + heights[w - 1]);
    for (let dx = w - 1; dx >= 0; dx -= 3) {
      this.ctx.lineTo(x + dx, y + heights[dx]);
    }
    this.ctx.stroke();
    this.ctx.restore();
  }

  drawRockWall(x, y, w, h, paletteKey = 'cyan') {
    x = Math.floor(x); y = Math.floor(y); w = Math.floor(w); h = Math.floor(h);
    const pal = this.getPalette(paletteKey, 'cyan');

    // Fill bitmask grid (1 = destructible)
    for (let py = y; py < y + h; py++) {
      if (py < 0 || py >= this.height) continue;
      for (let px = x; px < x + w; px++) {
        if (px < 0 || px >= this.width) continue;
        this.grid[py * this.width + px] = 1;
      }
    }

    // Shadow
    this.ctx.save();
    this.ctx.shadowColor = pal.shadow;
    this.ctx.shadowBlur = 4;
    this.ctx.shadowOffsetY = 2;
    this.ctx.fillStyle = pal.base;
    this.ctx.fillRect(x, y, w, h);
    this.ctx.restore();

    // Render rugged natural cliff face texture
    this.ctx.save();
    this.ctx.beginPath();
    this.ctx.rect(x, y, w, h);
    this.ctx.clip();

    // 1. Cliff gradient background
    const grad = this.ctx.createLinearGradient(x, y, x + w, y + h);
    grad.addColorStop(0, pal.base);
    grad.addColorStop(1, '#0e1722');
    this.ctx.fillStyle = grad;
    this.ctx.fillRect(x, y, w, h);

    // 2. Horizontal rock strata shelves
    const strataStep = 22;
    for (let sy = y + strataStep; sy < y + h; sy += strataStep) {
      this.ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
      this.ctx.fillRect(x, sy, w, 2);
      this.ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
      this.ctx.fillRect(x, sy + 2, w, 0.8);
    }

    // 3. Vertical cliff cleavage fault cracks (stone monolith pillars)
    const faultStep = Math.max(20, Math.floor(w / 3));
    for (let fx = x + faultStep; fx < x + w; fx += faultStep) {
      this.ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
      this.ctx.lineWidth = 1.4;
      this.ctx.beginPath();
      this.ctx.moveTo(fx, y);
      for (let cy = y; cy < y + h; cy += 16) {
        const offset = Math.sin(cy * 0.1) * 3;
        this.ctx.lineTo(fx + offset, cy + 16);
      }
      this.ctx.stroke();

      // Stone bevel highlight alongside crack
      this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
      this.ctx.lineWidth = 0.8;
      this.ctx.beginPath();
      this.ctx.moveTo(fx + 1.5, y);
      for (let cy = y; cy < y + h; cy += 16) {
        const offset = Math.sin(cy * 0.1) * 3;
        this.ctx.lineTo(fx + offset + 1.5, cy + 16);
      }
      this.ctx.stroke();
    }

    // 4. Embedded mineral veins / rock flecks
    this.ctx.fillStyle = pal.vein;
    for (let rx = x + 10; rx < x + w - 8; rx += 16) {
      for (let ry = y + 10; ry < y + h - 8; ry += 20) {
        if (Math.sin(rx * 3.1 + ry * 2.3) > 0.4) {
          this.ctx.fillRect(rx, ry, 2.5, 1.5);
        }
      }
    }

    this.ctx.restore();

    // Cliff outer stone bevel borders (thin 0.6px line)
    this.ctx.save();
    this.ctx.strokeStyle = pal.border;
    this.ctx.lineWidth = 0.6;
    this.ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

    // Top lighted cliff edge
    this.ctx.fillStyle = pal.top;
    this.ctx.fillRect(x, y, w, 1.5);
    this.ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    this.ctx.fillRect(x, y, w, 0.6);
    this.ctx.restore();
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
    this.ctx.fillStyle = '#141c26';
    this.ctx.fillRect(x, y, w, h);

    this.ctx.beginPath();
    this.ctx.rect(x, y, w, h);
    this.ctx.clip();

    // Uniform 45° Hazard Stripes: Exactly dx = dy (angle never distorts regardless of height)
    const stripePitch = 20;
    const stripeW = 10;
    for (let d = -w - stripePitch; d < h + stripePitch; d += stripePitch) {
      this.ctx.fillStyle = '#ffb700';
      this.ctx.beginPath();
      this.ctx.moveTo(x, y + d);
      this.ctx.lineTo(x + w, y + d + w);
      this.ctx.lineTo(x + w, y + d + w + stripeW);
      this.ctx.lineTo(x, y + d + stripeW);
      this.ctx.closePath();
      this.ctx.fill();
    }

    // Modular Horizontal Steel Girders & Rivet Seams every 32px vertically (tiles without distortion)
    const moduleH = 32;
    for (let sy = y + moduleH; sy < y + h; sy += moduleH) {
      this.ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
      this.ctx.fillRect(x, sy - 1, w, 2);
      this.ctx.fillStyle = 'rgba(255, 183, 0, 0.5)';
      this.ctx.fillRect(x, sy + 1, w, 1);

      // Rivet bolts on the beam
      for (let rx = x + 5; rx < x + w; rx += 14) {
        this.ctx.fillStyle = '#0b1118';
        this.ctx.beginPath();
        this.ctx.arc(rx, sy, 1.8, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.fillStyle = '#ffffff';
        this.ctx.fillRect(rx - 0.5, sy - 1, 1, 1);
      }
    }

    this.ctx.restore();

    this.ctx.save();
    this.ctx.globalCompositeOperation = 'source-over';
    this.ctx.strokeStyle = '#ffb700';
    this.ctx.lineWidth = 0.8;
    this.ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    this.ctx.restore();
  }

  restoreSteelBarriersInBox(rx, ry, rw, rh) {
    if (this.steelBarriers) {
      for (const b of this.steelBarriers) {
        if (rx < b.x + b.w && rx + rw > b.x && ry < b.y + b.h && ry + rh > b.y) {
          this.renderSingleSteelBarrier(b.x, b.y, b.w, b.h);
        }
      }
    }
    if (this.steelPlatforms) {
      for (const p of this.steelPlatforms) {
        if (rx < p.x + p.w && rx + rw > p.x && ry < p.y + p.h && ry + rh > p.y) {
          this.renderSingleSteelPlatform(p.x, p.y, p.w, p.h);
        }
      }
    }
    if (this.steelSlopes) {
      for (const s of this.steelSlopes) {
        if (rx < s.x + s.w && rx + rw > s.x && ry < s.y + s.h && ry + rh > s.y) {
          this.renderSingleTriangleSlope(s.x, s.y, s.w, s.h, s.slopeType, true, null);
        }
      }
    }
    if (this.steelBeams) {
      for (const bm of this.steelBeams) {
        if (rx < bm.x + bm.w && rx + rw > bm.x && ry < bm.y + bm.h && ry + rh > bm.y) {
          this.renderSingleDiagonalBeam(bm.x, bm.y, bm.w, bm.h, bm.dir, bm.thickness);
        }
      }
    }
  }

  // --- 1. Heavy Indestructible Steel Platform ---
  drawSteelPlatform(x, y, w, h) {
    x = Math.floor(x); y = Math.floor(y); w = Math.floor(w); h = Math.floor(h);
    if (!this.steelPlatforms) this.steelPlatforms = [];
    if (!this.steelPlatforms.some(b => b.x === x && b.y === y && b.w === w && b.h === h)) {
      this.steelPlatforms.push({ x, y, w, h });
    }
    this.renderSingleSteelPlatform(x, y, w, h);
  }

  renderSingleSteelPlatform(x, y, w, h) {
    for (let py = y; py < y + h; py++) {
      if (py < 0 || py >= this.height) continue;
      for (let px = x; px < x + w; px++) {
        if (px < 0 || px >= this.width) continue;
        this.grid[py * this.width + px] = 2; // Indestructible Steel
      }
    }

    this.ctx.save();
    this.ctx.globalCompositeOperation = 'source-over';

    // 1. Polished Mirror Chrome Top Cap & Lower Girder Body
    const topCapH = Math.min(h, 18);
    const chromeGrad = this.ctx.createLinearGradient(x, y, x, y + topCapH);
    chromeGrad.addColorStop(0.00, '#ffffff'); // Mirror top specular glare
    chromeGrad.addColorStop(0.15, '#e6f3ff'); // Silver sky reflection
    chromeGrad.addColorStop(0.40, '#8daec9'); // Chrome mid tone
    chromeGrad.addColorStop(0.55, '#ffffff'); // Horizon glare highlight
    chromeGrad.addColorStop(0.70, '#384d63'); // Ground shadow contrast boundary
    chromeGrad.addColorStop(1.00, '#1c2836'); // Deep metallic steel core
    this.ctx.fillStyle = chromeGrad;
    this.ctx.fillRect(x, y, w, topCapH);

    // If thicker than 18px, fill lower section with industrial steel girder plates
    if (h > topCapH) {
      this.ctx.fillStyle = '#172230';
      this.ctx.fillRect(x, y + topCapH, w, h - topCapH);

      // Repeating horizontal plate seams every 24px vertically
      for (let sy = y + topCapH + 24; sy < y + h; sy += 24) {
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        this.ctx.fillRect(x, sy - 1, w, 2);
        this.ctx.fillStyle = 'rgba(141, 174, 201, 0.4)';
        this.ctx.fillRect(x, sy + 1, w, 1);

        // Rivets on girder seams
        for (let rx = x + 8; rx < x + w; rx += 24) {
          this.ctx.fillStyle = '#0a1017';
          this.ctx.beginPath();
          this.ctx.arc(rx, sy, 1.8, 0, Math.PI * 2);
          this.ctx.fill();
          this.ctx.fillStyle = '#ffffff';
          this.ctx.fillRect(rx - 0.5, sy - 1, 1, 1);
        }
      }

      // Vertical girder ribs every 36px horizontally
      for (let sx = x + 36; sx < x + w; sx += 36) {
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        this.ctx.fillRect(sx - 1, y + topCapH, 2, h - topCapH);
        this.ctx.fillStyle = 'rgba(141, 174, 201, 0.25)';
        this.ctx.fillRect(sx + 1, y + topCapH, 1, h - topCapH);
      }
    }

    // 2. 45° Specular Glare Streaks across top cap
    this.ctx.save();
    this.ctx.beginPath();
    this.ctx.rect(x + 1, y + 1, w - 2, topCapH - 2);
    this.ctx.clip();

    for (let sx = -topCapH * 2; sx < w + topCapH * 2; sx += 55) {
      const barGrad = this.ctx.createLinearGradient(x + sx, y, x + sx + 24, y);
      barGrad.addColorStop(0.0, 'rgba(255, 255, 255, 0.0)');
      barGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.65)');
      barGrad.addColorStop(1.0, 'rgba(255, 255, 255, 0.0)');
      this.ctx.fillStyle = barGrad;
      this.ctx.beginPath();
      this.ctx.moveTo(x + sx, y);
      this.ctx.lineTo(x + sx + 22, y);
      this.ctx.lineTo(x + sx + 22 + topCapH, y + topCapH);
      this.ctx.lineTo(x + sx + topCapH, y + topCapH);
      this.ctx.closePath();
      this.ctx.fill();
    }
    this.ctx.restore();

    // Top walking surface hairline micro-grip track (1px mirror silver accent)
    this.ctx.fillStyle = '#ffffff';
    this.ctx.fillRect(x + 2, y + 1, w - 4, 1.2);
    this.ctx.fillStyle = 'rgba(0, 243, 255, 0.6)';
    this.ctx.fillRect(x + 2, y + 2.2, w - 4, 0.8);

    // 3. Beveled Chrome Perimeter Border (thin 0.8px line)
    this.ctx.strokeStyle = '#ffffff';
    this.ctx.lineWidth = 0.8;
    this.ctx.beginPath();
    this.ctx.moveTo(x + 0.5, y + h - 0.5);
    this.ctx.lineTo(x + 0.5, y + 0.5);
    this.ctx.lineTo(x + w - 0.5, y + 0.5);
    this.ctx.stroke();

    // Bottom dark rim outline
    this.ctx.strokeStyle = '#0d151e';
    this.ctx.lineWidth = 0.8;
    this.ctx.beginPath();
    this.ctx.moveTo(x, y + h - 0.5);
    this.ctx.lineTo(x + w, y + h - 0.5);
    this.ctx.stroke();

    // 4. Polished Chrome Hex Rivets with Specular Highlights
    const drawChromeRivet = (rx, ry) => {
      this.ctx.save();
      // Rivet shadow
      this.ctx.fillStyle = '#141c26';
      this.ctx.beginPath();
      this.ctx.arc(rx, ry + 0.5, 2.2, 0, Math.PI * 2);
      this.ctx.fill();
      // Chrome rivet body
      const rg = this.ctx.createRadialGradient(rx - 0.6, ry - 0.6, 0.2, rx, ry, 2);
      rg.addColorStop(0, '#ffffff');
      rg.addColorStop(0.4, '#cce6ff');
      rg.addColorStop(0.8, '#58738e');
      rg.addColorStop(1, '#253444');
      this.ctx.fillStyle = rg;
      this.ctx.beginPath();
      this.ctx.arc(rx, ry, 2.0, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.restore();
    };

    if (w >= 24) {
      const rivetY = Math.min(y + h - 4, y + 8);
      drawChromeRivet(x + 6, rivetY);
      drawChromeRivet(x + w - 6, rivetY);
      for (let rx = x + 36; rx < x + w - 24; rx += 36) {
        drawChromeRivet(rx, rivetY);
      }
    }
    this.ctx.restore();
  }

  // --- 2. Triangle Ramp / Slope ---
  drawTriangleSlope(x, y, w, h, slopeType = 'upRight', isSteel = false, paletteKey = 'cyan') {
    x = Math.floor(x); y = Math.floor(y); w = Math.floor(w); h = Math.floor(h);
    const pal = this.getPalette(paletteKey, 'cyan');
    // Normalize slopeType string
    let normType = 'upRight';
    if (slopeType === 'up-left' || slopeType === 'upLeft') normType = 'upLeft';
    else if (slopeType === 'down-right' || slopeType === 'ceilRight' || slopeType === 'downRight') normType = 'ceilRight';
    else if (slopeType === 'down-left' || slopeType === 'ceilLeft' || slopeType === 'downLeft') normType = 'ceilLeft';

    if (isSteel) {
      if (!this.steelSlopes) this.steelSlopes = [];
      if (!this.steelSlopes.some(s => s.x === x && s.y === y && s.w === w && s.h === h && s.slopeType === normType)) {
        this.steelSlopes.push({ x, y, w, h, slopeType: normType });
      }
    }
    this.renderSingleTriangleSlope(x, y, w, h, normType, isSteel, pal);
  }

  renderSingleTriangleSlope(x, y, w, h, slopeType, isSteel, pal) {
    const gridVal = isSteel ? 2 : 1;

    // Normalize slopeType string defensively
    let normType = 'upRight';
    if (slopeType === 'up-left' || slopeType === 'upLeft') normType = 'upLeft';
    else if (slopeType === 'down-right' || slopeType === 'ceilRight' || slopeType === 'downRight') normType = 'ceilRight';
    else if (slopeType === 'down-left' || slopeType === 'ceilLeft' || slopeType === 'downLeft') normType = 'ceilLeft';

    // 1. Bitmask Grid Rasterization
    for (let dx = 0; dx < w; dx++) {
      const px = x + dx;
      if (px < 0 || px >= this.width) continue;

      let colH;
      if (normType === 'upRight') {
        colH = Math.max(1, Math.floor(h * ((dx + 1) / w)));
        for (let dy = h - colH; dy < h; dy++) {
          const py = y + dy;
          if (py >= 0 && py < this.height) this.grid[py * this.width + px] = gridVal;
        }
      } else if (normType === 'upLeft') {
        colH = Math.max(1, Math.floor(h * ((w - dx) / w)));
        for (let dy = h - colH; dy < h; dy++) {
          const py = y + dy;
          if (py >= 0 && py < this.height) this.grid[py * this.width + px] = gridVal;
        }
      } else if (normType === 'ceilRight') {
        colH = Math.max(1, Math.floor(h * ((w - dx) / w)));
        for (let dy = 0; dy < colH; dy++) {
          const py = y + dy;
          if (py >= 0 && py < this.height) this.grid[py * this.width + px] = gridVal;
        }
      } else { // ceilLeft
        colH = Math.max(1, Math.floor(h * ((dx + 1) / w)));
        for (let dy = 0; dy < colH; dy++) {
          const py = y + dy;
          if (py >= 0 && py < this.height) this.grid[py * this.width + px] = gridVal;
        }
      }
    }

    // 2. Canvas Geometry Path
    this.ctx.save();
    this.ctx.globalCompositeOperation = 'source-over';
    this.ctx.beginPath();
    if (normType === 'upRight') {
      this.ctx.moveTo(x, y + h);
      this.ctx.lineTo(x + w, y);
      this.ctx.lineTo(x + w, y + h);
    } else if (normType === 'upLeft') {
      this.ctx.moveTo(x, y);
      this.ctx.lineTo(x + w, y + h);
      this.ctx.lineTo(x, y + h);
    } else if (normType === 'ceilRight') {
      this.ctx.moveTo(x, y);
      this.ctx.lineTo(x + w, y);
      this.ctx.lineTo(x, y + h);
    } else { // ceilLeft
      this.ctx.moveTo(x, y);
      this.ctx.lineTo(x + w, y);
      this.ctx.lineTo(x + w, y + h);
    }
    this.ctx.closePath();

    if (isSteel) {
      // --- Polished Mirror Chrome Slope Aesthetic ---
      const chromeGrad = this.ctx.createLinearGradient(x, y, x + w, y + h);
      chromeGrad.addColorStop(0.00, '#ffffff');
      chromeGrad.addColorStop(0.20, '#d8ecff');
      chromeGrad.addColorStop(0.40, '#85a7c4');
      chromeGrad.addColorStop(0.55, '#ffffff');
      chromeGrad.addColorStop(0.60, '#314457');
      chromeGrad.addColorStop(0.85, '#16212d');
      chromeGrad.addColorStop(1.00, '#4b6782');
      this.ctx.fillStyle = chromeGrad;
      this.ctx.fill();

      // Specular sheen sweep clip
      this.ctx.save();
      this.ctx.clip();
      const sheenGrad = this.ctx.createLinearGradient(x, y, x + w, y + h);
      sheenGrad.addColorStop(0, 'rgba(255,255,255,0)');
      sheenGrad.addColorStop(0.45, 'rgba(255,255,255,0.45)');
      sheenGrad.addColorStop(0.55, 'rgba(255,255,255,0.45)');
      sheenGrad.addColorStop(1, 'rgba(255,255,255,0)');
      this.ctx.fillStyle = sheenGrad;
      this.ctx.fillRect(x, y, w, h);
      this.ctx.restore();

      // Glowing chrome rim highlight along slope surface
      this.ctx.strokeStyle = '#ffffff';
      this.ctx.lineWidth = 1.0;
      this.ctx.beginPath();
      if (normType === 'upRight') { this.ctx.moveTo(x, y + h); this.ctx.lineTo(x + w, y); }
      else if (normType === 'upLeft') { this.ctx.moveTo(x, y); this.ctx.lineTo(x + w, y + h); }
      else if (normType === 'ceilRight') { this.ctx.moveTo(x, y + h); this.ctx.lineTo(x + w, y); }
      else { this.ctx.moveTo(x, y); this.ctx.lineTo(x + w, y + h); }
      this.ctx.stroke();

      // Outer chrome border (thin 0.6px line)
      this.ctx.strokeStyle = 'rgba(215, 235, 255, 0.9)';
      this.ctx.lineWidth = 0.6;
      this.ctx.stroke();

      // Chrome rivets
      const drawChromeRivet = (rx, ry) => {
        const rg = this.ctx.createRadialGradient(rx - 0.5, ry - 0.5, 0.2, rx, ry, 1.8);
        rg.addColorStop(0, '#ffffff');
        rg.addColorStop(0.5, '#cce6ff');
        rg.addColorStop(1, '#2c3e50');
        this.ctx.fillStyle = rg;
        this.ctx.beginPath();
        this.ctx.arc(rx, ry, 1.8, 0, Math.PI * 2);
        this.ctx.fill();
      };
      if (normType === 'upRight') {
        drawChromeRivet(x + w - 6, y + h - 5);
        drawChromeRivet(x + w - 6, y + 10);
        drawChromeRivet(x + 10, y + h - 5);
      } else {
        drawChromeRivet(x + 6, y + h - 5);
        drawChromeRivet(x + 6, y + 10);
        drawChromeRivet(x + w - 10, y + h - 5);
      }
    } else {
      // --- Natural Rock/Basalt/Crystal Slope Aesthetic ---
      const p = pal || this.getPalette('cyan');
      const grad = this.ctx.createLinearGradient(x, y, x + w, y + h);
      grad.addColorStop(0, p.base);
      grad.addColorStop(0.65, '#101d2a');
      grad.addColorStop(1, '#070d14');
      this.ctx.fillStyle = grad;
      this.ctx.fill();

      // Rugged rock crack details
      this.ctx.strokeStyle = p.shadow || 'rgba(0,0,0,0.5)';
      this.ctx.lineWidth = 0.8;
      this.ctx.beginPath();
      if (normType === 'upRight') {
        this.ctx.moveTo(x + w * 0.4, y + h * 0.7);
        this.ctx.lineTo(x + w * 0.6, y + h * 0.85);
        this.ctx.moveTo(x + w * 0.7, y + h * 0.35);
        this.ctx.lineTo(x + w * 0.82, y + h * 0.55);
      } else {
        this.ctx.moveTo(x + w * 0.6, y + h * 0.7);
        this.ctx.lineTo(x + w * 0.4, y + h * 0.85);
        this.ctx.moveTo(x + w * 0.3, y + h * 0.35);
        this.ctx.lineTo(x + w * 0.18, y + h * 0.55);
      }
      this.ctx.stroke();

      // Thin 0.6px perimeter border
      this.ctx.strokeStyle = p.border;
      this.ctx.lineWidth = 0.6;
      this.ctx.stroke();

      // Lighted slope edge line (1.0px thin highlight)
      this.ctx.strokeStyle = p.top;
      this.ctx.lineWidth = 1.0;
      this.ctx.beginPath();
      if (normType === 'upRight') {
        this.ctx.moveTo(x, y + h);
        this.ctx.lineTo(x + w, y);
      } else if (normType === 'upLeft') {
        this.ctx.moveTo(x, y);
        this.ctx.lineTo(x + w, y + h);
      } else if (normType === 'ceilRight') {
        this.ctx.moveTo(x, y + h);
        this.ctx.lineTo(x + w, y);
      } else {
        this.ctx.moveTo(x, y);
        this.ctx.lineTo(x + w, y + h);
      }
      this.ctx.stroke();
    }
    this.ctx.restore();
  }

  // --- 3. Diagonal Steel Beam ---
  drawDiagonalBeam(x, y, w, h, dir = 'downRight', thickness = 16) {
    x = Math.floor(x); y = Math.floor(y); w = Math.floor(w); h = Math.floor(h);
    let normDir = 'downRight';
    if (dir === 'downLeft' || dir === 'down-left' || dir === -1) normDir = 'downLeft';

    if (!this.steelBeams) this.steelBeams = [];
    if (!this.steelBeams.some(b => b.x === x && b.y === y && b.w === w && b.h === h && b.dir === normDir)) {
      this.steelBeams.push({ x, y, w, h, dir: normDir, thickness });
    }
    this.renderSingleDiagonalBeam(x, y, w, h, normDir, thickness);
  }

  renderSingleDiagonalBeam(x, y, w, h, dir = 'downRight', thickness = 16) {
    let normDir = 'downRight';
    if (dir === 'downLeft' || dir === 'down-left' || dir === -1) normDir = 'downLeft';

    const t = Math.max(8, thickness || 16);
    const halfT = Math.floor(t / 2);

    for (let dx = 0; dx < w; dx++) {
      const px = x + dx;
      if (px < 0 || px >= this.width) continue;
      const centerFrac = (normDir === 'downRight') ? (dx / w) : ((w - dx) / w);
      const cy = y + Math.floor(h * centerFrac);
      for (let dy = cy - halfT; dy <= cy + halfT; dy++) {
        if (dy >= 0 && dy < this.height) {
          this.grid[dy * this.width + px] = 2; // Steel
        }
      }
    }

    this.ctx.save();
    this.ctx.globalCompositeOperation = 'source-over';

    const p1 = (normDir === 'downRight') ? { x1: x, y1: y, x2: x + w, y2: y + h } : { x1: x + w, y1: y, x2: x, y2: y + h };
    
    // 1. Chrome Truss Main Beam (Silver Chrome Stroke)
    this.ctx.strokeStyle = '#2d3e50';
    this.ctx.lineWidth = t;
    this.ctx.lineCap = 'butt';
    this.ctx.beginPath();
    this.ctx.moveTo(p1.x1, p1.y1);
    this.ctx.lineTo(p1.x2, p1.y2);
    this.ctx.stroke();

    // 2. Chrome Center Mirror Sheen Line
    this.ctx.strokeStyle = '#e6f3ff';
    this.ctx.lineWidth = Math.max(3, t * 0.45);
    this.ctx.beginPath();
    this.ctx.moveTo(p1.x1, p1.y1);
    this.ctx.lineTo(p1.x2, p1.y2);
    this.ctx.stroke();

    // 3. Ultra-Bright Specular Core Stripe (Mirror Highlight)
    this.ctx.strokeStyle = '#ffffff';
    this.ctx.lineWidth = 1.2;
    this.ctx.beginPath();
    this.ctx.moveTo(p1.x1, p1.y1);
    this.ctx.lineTo(p1.x2, p1.y2);
    this.ctx.stroke();

    // 4. Endplate Chrome Reinforcements
    this.ctx.fillStyle = '#ffffff';
    this.ctx.beginPath();
    this.ctx.arc(p1.x1, p1.y1, t * 0.35, 0, Math.PI * 2);
    this.ctx.arc(p1.x2, p1.y2, t * 0.35, 0, Math.PI * 2);
    this.ctx.fill();

    this.ctx.restore();
  }

  getDiagonalBeamAt(x, y, margin = 8) {
    if (!this.steelBeams || this.steelBeams.length === 0) return null;
    for (const bm of this.steelBeams) {
      const t = Math.max(8, bm.thickness || 16);
      const halfT = Math.floor(t / 2);

      // Check horizontal span with 4px margin
      if (x >= bm.x - 4 && x <= bm.x + bm.w + 4) {
        const dx = Math.max(0, Math.min(bm.w, x - bm.x));
        const centerFrac = (bm.dir === 'downRight') ? (dx / bm.w) : ((bm.w - dx) / bm.w);
        const cy = bm.y + Math.floor(bm.h * centerFrac);
        // Top-rail surface where unit feet slide
        const topY = cy - halfT;

        // Check vertical contact within margin
        if (y >= topY - margin && y <= topY + margin + 6) {
          const slopeDir = (bm.dir === 'downRight') ? 1 : -1;
          const isBottomEnd = (slopeDir > 0) ? (x >= bm.x + bm.w - 3) : (x <= bm.x + 3);
          const isTopEnd = (slopeDir > 0) ? (x <= bm.x + 3) : (x >= bm.x + bm.w - 3);
          return {
            beam: bm,
            topY,
            slopeDir,
            isBottomEnd,
            isTopEnd
          };
        }
      }
    }
    return null;
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

    // Instantly restore and protect all steel barriers, platforms, slopes, beams and constructed structures
    this.restoreSteelBarriersInBox(x - 2, y - 2, w + 4, h + 4);
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

  carveDiagonal(mineStartX, mineStartY, mineDir, fromX, toX, tunnelH = 28, particles) {
    const minX = Math.max(0, Math.floor(Math.min(fromX, toX)));
    const maxX = Math.min(this.width - 1, Math.ceil(Math.max(fromX, toX)));
    if (minX > maxX) return false;

    const slope = 1.05 / 1.25; // 0.84

    const getFloorY = (px) => {
      const deltaX = (px - mineStartX) * mineDir;
      return deltaX <= 0 ? (mineStartY + 1) : ((mineStartY + 1) + deltaX * slope);
    };
    const getCeilingY = (px) => {
      return getFloorY(px) - tunnelH;
    };

    let modified = false;
    let hitImpenetrable = false;

    let overallMinY = this.height;
    let overallMaxY = 0;

    for (let px = minX; px <= maxX; px++) {
      const fY = getFloorY(px);
      const cY = getCeilingY(px);
      const startPy = Math.max(0, Math.floor(cY));
      const endPy = Math.min(this.height - 1, Math.floor(fY) - 1);

      if (startPy < overallMinY) overallMinY = startPy;
      if (endPy > overallMaxY) overallMaxY = endPy;

      for (let py = startPy; py <= endPy; py++) {
        const cell = this.grid[py * this.width + px];
        if (cell === 2 || cell === 3) {
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
    this.ctx.save();
    this.ctx.globalCompositeOperation = 'destination-out';
    this.ctx.fillStyle = '#000000';
    this.ctx.beginPath();

    const startXClamped = Math.max(minX, Math.min(maxX, mineStartX));
    if (mineStartX > minX && mineStartX < maxX) {
      this.ctx.moveTo(minX, getCeilingY(minX));
      this.ctx.lineTo(startXClamped, getCeilingY(startXClamped));
      this.ctx.lineTo(maxX, getCeilingY(maxX));
      this.ctx.lineTo(maxX, getFloorY(maxX));
      this.ctx.lineTo(startXClamped, getFloorY(startXClamped));
      this.ctx.lineTo(minX, getFloorY(minX));
    } else {
      this.ctx.moveTo(minX, getCeilingY(minX));
      this.ctx.lineTo(maxX, getCeilingY(maxX));
      this.ctx.lineTo(maxX, getFloorY(maxX));
      this.ctx.lineTo(minX, getFloorY(minX));
    }
    this.ctx.closePath();
    this.ctx.fill();
    this.ctx.restore();

    // Instantly restore and protect all steel barriers, platforms, slopes, beams and constructed structures
    const boxW = (maxX - minX) + 4;
    const boxH = Math.max(1, (overallMaxY - overallMinY) + 4);
    this.restoreSteelBarriersInBox(minX - 2, overallMinY - 2, boxW, boxH);
    if (this.constructedStructures && this.constructedStructures.length > 0) {
      this.restoreStructuresInBox(minX - 2, overallMinY - 2, boxW, boxH);
    }

    if (modified && particles) {
      particles.spawnBurst((minX + maxX) / 2, (overallMinY + overallMaxY) / 2, '#00f3ff', 6, 2);
    }
    if (hitImpenetrable && particles && Math.random() < 0.3) {
      particles.spawnBurst((minX + maxX) / 2, (overallMinY + overallMaxY) / 2, '#ffb700', 8, 3);
    }
    return hitImpenetrable;
  }

  buildStep(x, y, dir, particles) {
    x = Math.floor(x); y = Math.floor(y);
    const w = 14;
    const h = 4;
    const startX = dir > 0 ? x - 2 : x - w + 2;
    const startY = y - h;

    const struct = { x: startX, y: startY, w, h, type: 'step', dir: dir };
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
      // --- 계단 각 단의 또렷한 경계선 및 나노 하이테크 단차 렌더링 ---
      // 1. 베이스 본체 (선명한 네온 시안)
      this.ctx.fillStyle = '#00c8e6';
      this.ctx.fillRect(x, y, w, h);

      // 2. 상단 발판 하이라이트 (빛을 받는 윗면 1px)
      this.ctx.fillStyle = '#ffffff';
      this.ctx.fillRect(x, y, w, 1);

      // 3. 하단 경계선 (또렷한 딥 네이비 라인으로 겹쳤을 때 각 단의 구분을 명확히 함)
      this.ctx.fillStyle = '#031424';
      this.ctx.fillRect(x, y + h - 1, w, 1);

      // 4. 측면 단차 테두리선 (양 끝단 세로선)
      this.ctx.fillStyle = '#052238';
      this.ctx.fillRect(x, y, 1, h);
      this.ctx.fillRect(x + w - 1, y, 1, h);

      // 5. 발판 내부 패턴 디테일 (미세 홈으로 나노 타일 느낌 연출)
      this.ctx.fillStyle = 'rgba(0, 243, 255, 0.4)';
      this.ctx.fillRect(x + 3, y + 1, w - 6, 1);
      this.ctx.fillStyle = 'rgba(3, 20, 36, 0.4)';
      this.ctx.fillRect(x + 3, y + 2, w - 6, 1);
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

if (typeof module !== 'undefined' && module.exports) {
  module.exports = TerrainEngine;
}
