// --- Dynamic Indestructible Moving Platform Entity for nano_Terra ---
// Independent from the rasterized destructible terrain bitmap.
class MovingPlatform {
  /**
   * @param {Object} cfg
   * @param {number} cfg.x         - Initial origin X
   * @param {number} cfg.y         - Initial origin Y
   * @param {number} [cfg.w=100]   - Width (default 100px)
   * @param {number} [cfg.h=18]    - Thickness / Height (default 18px)
   * @param {string} [cfg.axis='horizontal'] - 'horizontal' | 'vertical'
   * @param {number} [cfg.range=120]         - Travel distance in pixels
   * @param {number} [cfg.speed=1.0]         - Speed in px/frame
   * @param {number} [cfg.pauseTicks=30]     - Pause ticks at turnaround ends (~0.5s at 60fps)
   * @param {number} [cfg.phase=0]           - Initial phase offset (0.0 ~ 1.0)
   * @param {string} [cfg.palette='cyan']    - Accent neon palette ('cyan' | 'red' | 'purple' | 'gold')
   */
  constructor(cfg = {}) {
    this.startX = typeof cfg.x === 'number' ? cfg.x : 200;
    this.startY = typeof cfg.y === 'number' ? cfg.y : 250;
    this.w = Math.max(30, cfg.w || 100);
    this.h = Math.max(12, cfg.h || 18);
    this.axis = (cfg.axis === 'vertical') ? 'vertical' : 'horizontal';
    this.range = Math.max(20, typeof cfg.range === 'number' ? cfg.range : 120);
    // Speed calibrated to 0.75px/frame (below NanoUnit walkSpeed 1.25px/frame) so actors can always make forward progress
    this.speed = Math.max(0.2, Math.min(1.0, typeof cfg.speed === 'number' ? cfg.speed : 0.75));
    this.pauseTicks = Math.max(0, typeof cfg.pauseTicks === 'number' ? cfg.pauseTicks : 30);
    this.palette = cfg.palette || 'cyan';

    // Kinematic runtime state
    this.offset = 0;
    this.dir = 1;
    this.pauseTimer = 0;
    this.x = this.startX;
    this.y = this.startY;
    this.dx = 0; // Per-frame displacement to carry riding actors
    this.dy = 0;

    // Apply initial phase if specified
    const initialPhase = Math.max(0, Math.min(1, typeof cfg.phase === 'number' ? cfg.phase : 0));
    if (initialPhase > 0) {
      this.offset = this.range * initialPhase;
      if (this.axis === 'horizontal') {
        this.x = this.startX + this.offset;
      } else {
        this.y = this.startY + this.offset;
      }
    }

    // Visual animation timers
    this.animTimer = Math.random() * 100;
    this.shimmerX = 0; // Specular highlight sweep position
  }

  /** Reset platform to starting origin */
  reset() {
    this.offset = 0;
    this.dir = 1;
    this.pauseTimer = 0;
    this.x = this.startX;
    this.y = this.startY;
    this.dx = 0;
    this.dy = 0;
    this.animTimer = 0;
  }

  /**
   * Update kinematic position and calculate carrier velocity (dx, dy).
   * @param {number} [speedScale=1.0]
   */
  update(speedScale = 1.0) {
    this.animTimer += 0.05 * speedScale;
    this.dx = 0;
    this.dy = 0;

    // End-point turnaround pause
    if (this.pauseTimer > 0) {
      this.pauseTimer -= speedScale;
      return;
    }

    const prevX = this.x;
    const prevY = this.y;
    const step = this.speed * this.dir * speedScale;
    this.offset += step;

    if (this.offset >= this.range) {
      this.offset = this.range;
      this.dir = -1;
      this.pauseTimer = this.pauseTicks;
    } else if (this.offset <= 0) {
      this.offset = 0;
      this.dir = 1;
      this.pauseTimer = this.pauseTicks;
    }

    if (this.axis === 'horizontal') {
      this.x = this.startX + this.offset;
      this.y = this.startY;
    } else {
      this.x = this.startX;
      this.y = this.startY + this.offset;
    }

    this.dx = this.x - prevX;
    this.dy = this.y - prevY;
  }

  /**
   * Fast AABB point collision check
   */
  containsPoint(px, py) {
    return px >= this.x && px <= this.x + this.w &&
           py >= this.y && py <= this.y + this.h;
  }

  /**
   * Check if an actor foot position (footX, footY) lands on the platform's top surface.
   * @param {number} footX
   * @param {number} footY
   * @param {number} [tolerance=6]
   * @returns {boolean}
   */
  checkFooting(footX, footY, tolerance = 6) {
    const onX = footX >= this.x && footX <= this.x + this.w;
    const onY = footY >= this.y - 2 && footY <= this.y + tolerance;
    return onX && onY;
  }

  /**
   * Render indestructible metallic titanium/steel platform with shimmering specular shine
   * and glowing maglev/plasma thrusters.
   * @param {CanvasRenderingContext2D} ctx
   * @param {boolean} [isEditor=false]
   * @param {boolean} [isSelected=false]
   */
  render(ctx, isEditor = false, isSelected = false) {
    ctx.save();

    const x = Math.round(this.x);
    const y = Math.round(this.y);
    const w = Math.round(this.w);
    const h = Math.round(this.h);

    // Accent color determination
    let neonColor = '#00f3ff';      // cyan
    let neonGlow = 'rgba(0, 243, 255, 0.45)';
    if (this.palette === 'red') {
      neonColor = '#ff2255';
      neonGlow = 'rgba(255, 34, 85, 0.45)';
    } else if (this.palette === 'purple') {
      neonColor = '#bf00ff';
      neonGlow = 'rgba(191, 0, 255, 0.45)';
    } else if (this.palette === 'gold') {
      neonColor = '#ffb700';
      neonGlow = 'rgba(255, 183, 0, 0.45)';
    }

    // 1. Maglev / Plasma Thruster Under-Glow
    const thrusterPulse = Math.sin(this.animTimer * 2.5) * 0.2 + 0.8;
    if (this.axis === 'horizontal') {
      // Glow under the carriage
      const glowGrad = ctx.createLinearGradient(x, y + h, x, y + h + 8);
      glowGrad.addColorStop(0, neonGlow);
      glowGrad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = glowGrad;
      ctx.fillRect(x + 8, y + h, w - 16, 7);
    } else {
      // Glow on both sides and underneath for vertical elevators
      const glowGrad = ctx.createLinearGradient(x, y + h, x, y + h + 10);
      glowGrad.addColorStop(0, neonGlow);
      glowGrad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = glowGrad;
      ctx.fillRect(x + 4, y + h, w - 8, 9);
    }

    // 2. Heavy Titanium/Tungsten Base Body
    const bodyGrad = ctx.createLinearGradient(x, y, x, y + h);
    bodyGrad.addColorStop(0, '#536278');   // Top beveled steel highlight
    bodyGrad.addColorStop(0.18, '#323c4a'); // Upper armor plate
    bodyGrad.addColorStop(0.70, '#1c222b'); // Core heavy alloy
    bodyGrad.addColorStop(1, '#0e1217');   // Undercarriage shadow

    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, [3, 3, 2, 2]);
    ctx.fill();

    // 3. Reinforced Outer Steel Chamfer Border
    ctx.strokeStyle = '#6c7f99';
    ctx.lineWidth = 1;
    ctx.stroke();

    // 4. Non-Slip Diamond / Tread Surface Pattern on Top Walkway
    ctx.save();
    ctx.beginPath();
    ctx.rect(x + 2, y + 1, w - 4, Math.min(5, h - 2));
    ctx.clip();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 1;
    const treadSpacing = 8;
    for (let tx = x - h; tx < x + w + h; tx += treadSpacing) {
      ctx.beginPath();
      ctx.moveTo(tx, y + 1);
      ctx.lineTo(tx + 6, y + 5);
      ctx.stroke();
    }
    ctx.restore();

    // 5. High-Tech Indestructible Status LEDs & Rivets
    // Corner reinforced tungsten rivets
    ctx.fillStyle = '#9cb1cc';
    const rivetRadius = 1.3;
    const inset = 4;
    const drawRivet = (rx, ry) => {
      ctx.beginPath();
      ctx.arc(rx, ry, rivetRadius, 0, Math.PI * 2);
      ctx.fill();
    };
    drawRivet(x + inset, y + inset);
    drawRivet(x + w - inset, y + inset);
    drawRivet(x + inset, y + h - inset);
    drawRivet(x + w - inset, y + h - inset);

    // Glowing Neon Energy Channel (Center strip indicator - 정확한 중앙 높이로 정렬)
    const stripH = 2.5;
    const stripY = y + (h - stripH) / 2;
    ctx.fillStyle = 'rgba(10, 15, 22, 0.9)';
    ctx.fillRect(x + 12, stripY, w - 24, stripH);

    ctx.fillStyle = neonColor;
    ctx.shadowColor = neonColor;
    ctx.shadowBlur = 6 * thrusterPulse;
    ctx.fillRect(x + 14, stripY + 0.5, w - 28, stripH - 1);
    ctx.shadowBlur = 0; // Reset shadow blur

    // Directional Arrow Indicators on Center Strip
    ctx.fillStyle = '#ffffff';
    const numArrows = Math.max(1, Math.floor((w - 40) / 30));
    const arrowSpacing = (w - 40) / (numArrows + 1);
    for (let i = 1; i <= numArrows; i++) {
      const ax = x + 20 + i * arrowSpacing;
      const ay = stripY + stripH / 2;
      ctx.beginPath();
      if (this.axis === 'horizontal') {
        const adir = this.dir;
        ctx.moveTo(ax - adir * 2.5, ay - 2);
        ctx.lineTo(ax + adir * 2.5, ay);
        ctx.lineTo(ax - adir * 2.5, ay + 2);
      } else {
        const adir = this.dir;
        ctx.moveTo(ax - 2, ay - adir * 2.5);
        ctx.lineTo(ax, ay + adir * 2.5);
        ctx.lineTo(ax + 2, ay - adir * 2.5);
      }
      ctx.fill();
    }

    // 6. Specular Shimmer Sweep (은은하게 반짝이는 금속성 반사광 빔)
    // Runs across the platform every 2.4 seconds
    const cycle = (this.animTimer * 0.6) % 3.0; // 0.0 ~ 3.0
    if (cycle < 1.0) {
      const sweepProgress = cycle; // 0.0 ~ 1.0
      const sweepX = x - 30 + (w + 60) * sweepProgress;
      const shimmerGrad = ctx.createLinearGradient(sweepX - 20, y, sweepX + 20, y);
      shimmerGrad.addColorStop(0, 'rgba(255, 255, 255, 0)');
      shimmerGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.45)');
      shimmerGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');

      ctx.save();
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, 3);
      ctx.clip();
      ctx.fillStyle = shimmerGrad;
      ctx.fillRect(sweepX - 25, y, 50, h);
      ctx.restore();
    }

    // 7. Top Surface Micro-Highlight Line
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.65)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + 2, y + 0.5);
    ctx.lineTo(x + w - 2, y + 0.5);
    ctx.stroke();

    // 8. Editor Visualization (Trajectory Guide & Endpoints)
    if (isEditor) {
      ctx.save();
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = isSelected ? '#00f3ff' : 'rgba(0, 243, 255, 0.45)';

      const endX = this.axis === 'horizontal' ? this.startX + this.range : this.startX;
      const endY = this.axis === 'vertical' ? this.startY + this.range : this.startY;

      // Trajectory center line
      ctx.beginPath();
      ctx.moveTo(this.startX + w / 2, this.startY + h / 2);
      ctx.lineTo(endX + w / 2, endY + h / 2);
      ctx.stroke();

      // Ghost outline at start and end
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.strokeRect(this.startX, this.startY, w, h);
      ctx.strokeStyle = isSelected ? 'rgba(0, 243, 255, 0.8)' : 'rgba(0, 243, 255, 0.35)';
      ctx.strokeRect(endX, endY, w, h);

      // Endpoint text label
      ctx.setLineDash([]);
      ctx.font = 'bold 9px Orbitron, sans-serif';
      ctx.fillStyle = isSelected ? '#00f3ff' : 'rgba(0, 243, 255, 0.7)';
      ctx.textAlign = 'center';
      const midX = (this.startX + endX) / 2 + w / 2;
      const midY = (this.startY + endY) / 2 + h / 2 - 8;
      const axisName = this.axis === 'horizontal' ? '↔ X' : '↕ Y';
      ctx.fillText(`⚡ MOVING [${axisName}] R:${this.range}px`, midX, midY);

      if (isSelected) {
        // Selection glowing halo
        ctx.strokeStyle = '#00f3ff';
        ctx.lineWidth = 2;
        ctx.strokeRect(x - 2, y - 2, w + 4, h + 4);
      }
      ctx.restore();
    }

    ctx.restore();
  }
}

// Export for Node/CommonJS environments if needed
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { MovingPlatform };
}
