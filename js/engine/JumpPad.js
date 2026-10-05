// --- High-Tech Cybernetic Repulsor Jump Pad Entity for nano_Terra ---
class JumpPad {
  /**
   * @param {Object} cfg
   * @param {number} cfg.x
   * @param {number} cfg.y
   * @param {number} [cfg.w=48]
   * @param {number} [cfg.h=14]
   * @param {number} [cfg.power=7.2] - Launch vertical impulse velocity
   * @param {string} [cfg.angle='up'] - 'up' | 'forward' | 'left' | 'right'
   */
  constructor(cfg = {}) {
    this.x = typeof cfg.x === 'number' ? cfg.x : 200;
    this.y = typeof cfg.y === 'number' ? cfg.y : 300;
    this.w = Math.max(28, typeof cfg.w === 'number' ? cfg.w : 48);
    // Height reduced by 30% (14px -> 10px) for ultra-sleek kinetic pad profile
    this.h = Math.max(7, typeof cfg.h === 'number' ? cfg.h : 10);
    this.power = Math.max(4.0, Math.min(18.0, typeof cfg.power === 'number' ? cfg.power : 9.5));
    // Normalize angle / dir
    const rawAngle = cfg.angle || cfg.dir || 'up';
    if (rawAngle === 'up-right' || rawAngle === 'right') this.angle = 'up-right';
    else if (rawAngle === 'up-left' || rawAngle === 'left') this.angle = 'up-left';
    else if (rawAngle === 'forward') this.angle = 'forward';
    else this.angle = 'up';

    this.cooldown = 0;
    this.compression = 0; // 0.0 ~ 1.0 (spring recoil compression)
    this.animTimer = Math.random() * 100;
  }

  update(speedScale = 1.0) {
    this.animTimer += 0.05 * speedScale;
    if (this.cooldown > 0) {
      this.cooldown -= speedScale;
    }
    if (this.compression > 0) {
      this.compression -= 0.16 * speedScale;
      if (this.compression < 0) this.compression = 0;
    }
  }

  /**
   * Check if a NanoUnit stepped onto the jump pad trigger surface.
   */
  checkFooting(ux, uy) {
    // Foot position must be near the pad's top surface
    return (ux >= this.x - 4 && ux <= this.x + this.w + 4 && uy >= this.y - 8 && uy <= this.y + this.h + 4);
  }

  /**
   * Launch a NanoUnit into the air with kinetic impulse!
   */
  trigger(unit, particles) {
    // NOTE: Only unit's own jumpPadCooldown prevents re-triggering!
    // Multiple characters landing on the pad in close succession can all launch without being locked out!
    if (unit.jumpPadCooldown > 0) return false;

    this.cooldown = 4; // Brief animation recoil timer
    this.compression = 1.0;

    // Force unit into valid falling state with upward launch velocity
    const fallingState = (typeof STATE !== 'undefined' && STATE.FALLING) ? STATE.FALLING : 'FALLING';
    unit.state = fallingState;
    unit.ridingPlatform = null;
    unit.lastDismountedPlatform = null;
    unit.fallDistance = 0;
    unit.jumpPadCooldown = 18; // Prevent immediate re-trigger by this unit while in launch corridor

    // Lift unit cleanly above pad surface so physics immediately takes over
    unit.y = this.y - 8;

    if (this.angle === 'up-right') {
      unit.vy = -this.power * 0.88;
      unit.dir = 1;
      unit.vx = 3.6;
      unit.x += 6;
    } else if (this.angle === 'up-left') {
      unit.vy = -this.power * 0.88;
      unit.dir = -1;
      unit.vx = -3.6;
      unit.x -= 6;
    } else if (this.angle === 'forward') {
      unit.vy = -this.power * 0.88;
      unit.vx = unit.dir * 3.6;
      unit.x += unit.dir * 6;
    } else {
      // 'up' - purely vertical boost, maintain slight forward momentum if walking
      unit.vy = -this.power;
      unit.vx = (unit.dir || 1) * 0.8;
    }

    if (particles) {
      particles.spawnBurst(this.x + this.w / 2, this.y + 2, '#ffaa00', 16, 3.8);
      particles.spawnBurst(this.x + this.w / 2, this.y + 2, '#00f3ff', 8, 2.0);
      particles.spawnFloatingText(this.x + this.w / 2, this.y - 16, '⚡ JUMP!', '#ffaa00');
    }
    if (typeof SFX !== 'undefined' && SFX.playTeleport) {
      SFX.playTeleport();
    }
    return true;
  }

  render(ctx, isEditor = false, isSelected = false) {
    const x = this.x;
    const y = this.y;
    const w = this.w;
    const h = this.h;

    ctx.save();

    // 1. Neon Mag-coil Underglow
    const glowPulse = Math.sin(this.animTimer * 3) * 0.25 + 0.75;
    const glow = ctx.createRadialGradient(x + w / 2, y + h / 2, 4, x + w / 2, y + h / 2, w / 2 + 8);
    glow.addColorStop(0, 'rgba(255, 170, 0, 0.45)');
    glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(x - 8, y - 4, w + 16, h + 12);

    // 2. Heavy Alloy Base Tray (Sleek low profile)
    ctx.fillStyle = '#1c2430';
    ctx.strokeStyle = '#ffaa00';
    ctx.lineWidth = 1.2;
    if (ctx.roundRect) {
      ctx.beginPath();
      ctx.roundRect(x, y + 3, w, h - 3, 2);
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.fillRect(x, y + 3, w, h - 3);
      ctx.strokeRect(x, y + 3, w, h - 3);
    }

    // 3. Kinetic Compression Springs (Twin piston coils)
    const compOffsetY = this.compression * 2.5; // Moves down when stepped on
    const padTopY = y + compOffsetY;

    ctx.strokeStyle = '#8a9bb0';
    ctx.lineWidth = 2.0;
    const spring1X = x + w * 0.28;
    const spring2X = x + w * 0.72;
    ctx.beginPath();
    ctx.moveTo(spring1X, padTopY + 2);
    ctx.lineTo(spring1X, y + h - 1);
    ctx.moveTo(spring2X, padTopY + 2);
    ctx.lineTo(spring2X, y + h - 1);
    ctx.stroke();

    // 4. Kinetic Launcher Plate (Top pad)
    const plateGrad = ctx.createLinearGradient(x, padTopY, x, padTopY + 3.5);
    plateGrad.addColorStop(0, '#ffcc00');
    plateGrad.addColorStop(0.5, '#ff8800');
    plateGrad.addColorStop(1, '#994400');
    ctx.fillStyle = plateGrad;
    if (ctx.roundRect) {
      ctx.beginPath();
      ctx.roundRect(x + 2, padTopY, w - 4, 3.5, 2);
      ctx.fill();
    } else {
      ctx.fillRect(x + 2, padTopY, w - 4, 3.5);
    }

    // 5. Directional Arrow on Top Plate
    ctx.fillStyle = '#ffffff';
    const arrowX = x + w / 2;
    const arrowY = padTopY + 1.8;
    ctx.beginPath();
    if (this.angle === 'forward' || this.angle === 'right') {
      ctx.moveTo(arrowX - 4, arrowY + 1.5);
      ctx.lineTo(arrowX + 4, arrowY - 1.5);
      ctx.lineTo(arrowX + 2, arrowY - 3.5);
    } else if (this.angle === 'left') {
      ctx.moveTo(arrowX + 4, arrowY + 1.5);
      ctx.lineTo(arrowX - 4, arrowY - 1.5);
      ctx.lineTo(arrowX - 2, arrowY - 3.5);
    } else {
      // 'up'
      ctx.moveTo(arrowX, arrowY - 2.5);
      ctx.lineTo(arrowX - 3.5, arrowY + 1.5);
      ctx.lineTo(arrowX + 3.5, arrowY + 1.5);
    }
    ctx.fill();

    // 6. Editor Bounding & Trajectory Guide
    if (isEditor) {
      ctx.save();
      ctx.strokeStyle = isSelected ? '#ffaa00' : 'rgba(255, 170, 0, 0.4)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);

      // Jump trajectory arc preview
      const peakY = Math.max(10, y - (this.power * this.power * 2.2));
      ctx.beginPath();
      ctx.moveTo(arrowX, y);
      if (this.angle === 'right' || this.angle === 'forward') {
        ctx.quadraticCurveTo(arrowX + 40, peakY, arrowX + 80, y);
      } else if (this.angle === 'left') {
        ctx.quadraticCurveTo(arrowX - 40, peakY, arrowX - 80, y);
      } else {
        ctx.lineTo(arrowX, peakY);
      }
      ctx.stroke();

      ctx.setLineDash([]);
      ctx.font = 'bold 9px Orbitron, sans-serif';
      ctx.fillStyle = isSelected ? '#ffaa00' : 'rgba(255, 170, 0, 0.7)';
      ctx.textAlign = 'center';
      ctx.fillText(`▲ JUMP (${this.angle.toUpperCase()}) P:${this.power}`, arrowX, y - 8);

      if (isSelected) {
        ctx.strokeStyle = '#ffaa00';
        ctx.lineWidth = 1.8;
        ctx.strokeRect(x - 2, y - 2, w + 4, h + 4);
      }
      ctx.restore();
    }

    ctx.restore();
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = JumpPad;
  module.exports.JumpPad = JumpPad;
}
