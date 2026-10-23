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
    if (rawAngle === 'up-right') this.angle = 'up-right';
    else if (rawAngle === 'up-left') this.angle = 'up-left';
    else if (rawAngle === 'right' || rawAngle === 'forward') this.angle = 'right';
    else if (rawAngle === 'left') this.angle = 'left';
    else this.angle = 'up';
    this.dir = this.angle;

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
    const launchCenterX = this.x + this.w / 2;

    if (this.angle === 'up-right') {
      unit.vy = -this.power * 0.88;
      unit.dir = 1;
      unit.vx = 3.6;
      unit.x = launchCenterX + 4;
    } else if (this.angle === 'up-left') {
      unit.vy = -this.power * 0.88;
      unit.dir = -1;
      unit.vx = -3.6;
      unit.x = launchCenterX - 4;
    } else if (this.angle === 'right' || this.angle === 'forward') {
      unit.vy = -this.power * 0.65;
      unit.dir = 1;
      unit.vx = 4.8;
      unit.x = launchCenterX + 4;
    } else if (this.angle === 'left') {
      unit.vy = -this.power * 0.65;
      unit.dir = -1;
      unit.vx = -4.8;
      unit.x = launchCenterX - 4;
    } else {
      // 'up' - purely vertical 90 degree boost
      unit.vy = -this.power;
      unit.vx = 0;
      unit.x = launchCenterX;
    }
    unit.vxDrag = 0.985; // 점프패드 공기저항 계수 (예측 궤적 calculateTrajectory와 100% 일치)

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

  /**
   * Calculate precise frame-by-frame trajectory coordinates matching NanoUnit physics simulation.
   * @param {Object} [terrain=null] - Level terrain with isSolid(x, y) check
   * @param {number} [maxSteps=160] - Maximum simulation frames
   * @returns {Array<{x: number, y: number, isApex: boolean, isLanding: boolean, hitGround?: boolean, hitAbyss?: boolean}>}
   */
  calculateTrajectory(terrain = null, maxSteps = 160) {
    const points = [];
    const launchCenterX = this.x + this.w / 2;
    let x = launchCenterX;
    let y = this.y - 8;
    let vx = 0;
    let vy = 0;
    const power = typeof this.power === 'number' ? this.power : 9.5;
    const angle = this.angle || this.dir || 'up';

    if (angle === 'up-right') {
      vy = -power * 0.88;
      vx = 3.6;
      x = launchCenterX + 4;
    } else if (angle === 'up-left') {
      vy = -power * 0.88;
      vx = -3.6;
      x = launchCenterX - 4;
    } else if (angle === 'right' || angle === 'forward') {
      vy = -power * 0.65;
      vx = 4.8;
      x = launchCenterX + 4;
    } else if (angle === 'left') {
      vy = -power * 0.65;
      vx = -4.8;
      x = launchCenterX - 4;
    } else {
      // 'up' - 90-degree vertical launch
      vy = -power;
      vx = 0;
      x = launchCenterX;
    }

    points.push({ x, y, isApex: false, isLanding: false });
    let apexFound = false;

    for (let f = 0; f < maxSteps; f++) {
      const prevVy = vy;
      if (vy < 0) {
        vy += 0.22;
        if (terrain && (terrain.isSolid(x, y - 18) || terrain.isSolid(x, y - 14))) {
          vy = 0; // Bonk head on ceiling
        }
      } else {
        vy = Math.min(3.6, vy + 0.15);
      }

      if (!apexFound && prevVy < 0 && vy >= 0) {
        apexFound = true;
        if (points.length > 0) points[points.length - 1].isApex = true;
      }

      if (Math.abs(vx) > 0.05) {
        const nextX = x + vx;
        if (terrain && terrain.isSolid(nextX, y - 10)) {
          vx = -vx * 0.4; // Lateral wall bounce
        } else {
          x = nextX;
        }
        vx *= 0.985;
      }

      const prevY = y;
      y += vy;

      // Bottom Screen Void / Abyss Kill Zone
      if (y >= 425) {
        points.push({ x, y: 425, isApex: false, isLanding: true, hitAbyss: true });
        break;
      }

      // Jump Pad Re-landing Check (e.g. vertical jump falling back onto launcher)
      if (vy >= 0 && Math.abs(x - launchCenterX) <= this.w / 2 + 4 && prevY <= this.y + 6 && y >= this.y - 4) {
        points.push({ x: launchCenterX, y: this.y, isApex: false, isLanding: true, hitGround: true, hitPad: true });
        break;
      }

      // Static Terrain Landing (only when falling downwards)
      if (vy >= 0 && terrain && terrain.isSolid(x, y + 1)) {
        while (terrain.isSolid(x, y) && y > 0) {
          y--;
        }
        points.push({ x, y, isApex: false, isLanding: true, hitGround: true });
        break;
      }

      // Fallback if no terrain: stop when crossing pad's y level while falling
      if (!terrain && vy >= 0 && y >= this.y) {
        points.push({ x, y: this.y, isApex: false, isLanding: true, hitGround: true });
        break;
      }

      points.push({ x, y, isApex: false, isLanding: false });
    }

    return points;
  }

  render(ctx, isEditor = false, isSelected = false, terrain = null) {
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

    // 5. Directional Arrow on Top Plate (matching user-configured direction)
    ctx.fillStyle = '#ffffff';
    const arrowX = x + w / 2;
    const arrowY = padTopY + 1.8;
    ctx.beginPath();
    if (this.angle === 'right' || this.angle === 'forward') {
      // ➔ Right
      ctx.moveTo(arrowX - 4, arrowY - 2);
      ctx.lineTo(arrowX + 2, arrowY - 2);
      ctx.lineTo(arrowX + 2, arrowY - 3.5);
      ctx.lineTo(arrowX + 5, arrowY);
      ctx.lineTo(arrowX + 2, arrowY + 3.5);
      ctx.lineTo(arrowX + 2, arrowY + 2);
      ctx.lineTo(arrowX - 4, arrowY + 2);
      ctx.closePath();
    } else if (this.angle === 'left') {
      // ⬅ Left
      ctx.moveTo(arrowX + 4, arrowY - 2);
      ctx.lineTo(arrowX - 2, arrowY - 2);
      ctx.lineTo(arrowX - 2, arrowY - 3.5);
      ctx.lineTo(arrowX - 5, arrowY);
      ctx.lineTo(arrowX - 2, arrowY + 3.5);
      ctx.lineTo(arrowX - 2, arrowY + 2);
      ctx.lineTo(arrowX + 4, arrowY + 2);
      ctx.closePath();
    } else if (this.angle === 'up-right') {
      // ↗ Up-Right
      ctx.moveTo(arrowX - 3.5, arrowY + 2.5);
      ctx.lineTo(arrowX + 1.5, arrowY - 2.5);
      ctx.lineTo(arrowX - 1.0, arrowY - 3.5);
      ctx.lineTo(arrowX + 4.5, arrowY - 3.5);
      ctx.lineTo(arrowX + 4.5, arrowY + 2.0);
      ctx.lineTo(arrowX + 3.5, arrowY + 0.0);
      ctx.lineTo(arrowX - 1.5, arrowY + 4.0);
      ctx.closePath();
    } else if (this.angle === 'up-left') {
      // ↖ Up-Left
      ctx.moveTo(arrowX + 3.5, arrowY + 2.5);
      ctx.lineTo(arrowX - 1.5, arrowY - 2.5);
      ctx.lineTo(arrowX + 1.0, arrowY - 3.5);
      ctx.lineTo(arrowX - 4.5, arrowY - 3.5);
      ctx.lineTo(arrowX - 4.5, arrowY + 2.0);
      ctx.lineTo(arrowX - 3.5, arrowY + 0.0);
      ctx.lineTo(arrowX + 1.5, arrowY + 4.0);
      ctx.closePath();
    } else {
      // ▲ Straight Up
      ctx.moveTo(arrowX, arrowY - 3.5);
      ctx.lineTo(arrowX - 4.0, arrowY + 1.8);
      ctx.lineTo(arrowX - 1.5, arrowY + 1.8);
      ctx.lineTo(arrowX - 1.5, arrowY + 3.5);
      ctx.lineTo(arrowX + 1.5, arrowY + 3.5);
      ctx.lineTo(arrowX + 1.5, arrowY + 1.8);
      ctx.lineTo(arrowX + 4.0, arrowY + 1.8);
      ctx.closePath();
    }
    ctx.fill();

    // 5.5 Holographic Cipher Readout: Arrow & Jump Power (암호처럼 숫자표기)
    const arrowMap = {
      'up': '▲',
      'up-right': '↗',
      'up-left': '↖',
      'right': '➔',
      'forward': '➔',
      'left': '⬅'
    };
    const arrowGlyph = arrowMap[this.angle] || '▲';
    const pStr = (typeof this.power === 'number') ? (this.power % 1 === 0 ? this.power.toFixed(1) : this.power.toString()) : '9.5';
    const cipherText = `${arrowGlyph} ${pStr}`;

    ctx.save();
    ctx.font = 'bold 8.5px Orbitron, monospace, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const textMetrics = ctx.measureText(cipherText);
    const badgeW = Math.max(26, textMetrics.width + 6);
    const badgeH = 11;
    const badgeX = arrowX - badgeW / 2;
    const badgeY = y - 7 - badgeH / 2;

    // Semi-transparent tactical dark backing
    ctx.fillStyle = 'rgba(10, 16, 26, 0.82)';
    if (ctx.roundRect) {
      ctx.beginPath();
      ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 2);
      ctx.fill();
    } else {
      ctx.fillRect(badgeX, badgeY, badgeW, badgeH);
    }

    // High-tech neon border
    ctx.strokeStyle = isSelected ? '#ffaa00' : 'rgba(0, 243, 255, 0.55)';
    ctx.lineWidth = 1;
    if (ctx.roundRect) {
      ctx.beginPath();
      ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 2);
      ctx.stroke();
    } else {
      ctx.strokeRect(badgeX, badgeY, badgeW, badgeH);
    }

    // Glowing cipher text: Neon cyan in-game / Cyber amber when selected
    ctx.shadowColor = isSelected ? '#ffaa00' : '#00f3ff';
    ctx.shadowBlur = 4;
    ctx.fillStyle = isSelected ? '#ffcc00' : '#00f3ff';
    ctx.fillText(cipherText, arrowX, y - 7);
    ctx.restore();

    // 6. Editor Bounding & Accurate Physics Trajectory Guide
    if (isEditor) {
      ctx.save();

      const points = this.calculateTrajectory(terrain);
      if (points && points.length > 1) {
        // Draw glow aura when selected
        if (isSelected) {
          ctx.strokeStyle = 'rgba(255, 170, 0, 0.22)';
          ctx.lineWidth = 4.0;
          ctx.beginPath();
          points.forEach((pt, i) => {
            if (i === 0) ctx.moveTo(pt.x, pt.y);
            else ctx.lineTo(pt.x, pt.y);
          });
          ctx.stroke();
        }

        // Main dotted/dashed trajectory line
        ctx.strokeStyle = isSelected ? '#ffaa00' : 'rgba(255, 170, 0, 0.55)';
        ctx.lineWidth = isSelected ? 2.0 : 1.4;
        ctx.setLineDash([5, 3]);
        ctx.beginPath();
        points.forEach((pt, i) => {
          if (i === 0) ctx.moveTo(pt.x, pt.y);
          else ctx.lineTo(pt.x, pt.y);
        });
        ctx.stroke();
        ctx.setLineDash([]);

        // Flight direction chevrons along path
        const chevronIndices = [Math.floor(points.length * 0.33), Math.floor(points.length * 0.66)];
        chevronIndices.forEach(idx => {
          if (idx > 0 && idx < points.length) {
            const p1 = points[idx - 1];
            const p2 = points[idx];
            const ang = Math.atan2(p2.y - p1.y, p2.x - p1.x);
            ctx.save();
            ctx.translate(p2.x, p2.y);
            ctx.rotate(ang);
            ctx.fillStyle = isSelected ? '#ffcc00' : 'rgba(255, 170, 0, 0.75)';
            ctx.beginPath();
            ctx.moveTo(3.5, 0);
            ctx.lineTo(-2.5, -2.5);
            ctx.lineTo(-1.2, 0);
            ctx.lineTo(-2.5, 2.5);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
          }
        });

        // Apex Beacon (Highest Clearance Point)
        const apexPt = points.find(p => p.isApex);
        if (apexPt) {
          ctx.fillStyle = '#00f3ff';
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(apexPt.x, apexPt.y, 2.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          if (isSelected) {
            const deltaH = Math.round(this.y - apexPt.y);
            ctx.font = 'bold 8px Orbitron, monospace, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillStyle = '#00f3ff';
            ctx.shadowColor = '#00f3ff';
            ctx.shadowBlur = 4;
            ctx.fillText(`▲ ${deltaH}px`, apexPt.x, apexPt.y - 6);
            ctx.shadowBlur = 0;
          }
        }

        // Landing / Impact Target Reticle
        const lastPt = points[points.length - 1];
        if (lastPt && lastPt.isLanding) {
          if (lastPt.hitAbyss) {
            // Fall into void warning
            ctx.fillStyle = '#ff3344';
            ctx.font = 'bold 8.5px Orbitron, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(`⚠ 추락 위험 (${Math.round(lastPt.x)}px)`, lastPt.x, 420);
          } else {
            // Landing target on terrain or baseline
            ctx.strokeStyle = '#00ff88';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(lastPt.x, lastPt.y, 5, 0, Math.PI * 2);
            ctx.stroke();

            ctx.fillStyle = '#00ff88';
            ctx.beginPath();
            ctx.arc(lastPt.x, lastPt.y, 1.8, 0, Math.PI * 2);
            ctx.fill();

            // Downward landing pointer
            ctx.beginPath();
            ctx.moveTo(lastPt.x, lastPt.y - 10);
            ctx.lineTo(lastPt.x - 3, lastPt.y - 5);
            ctx.lineTo(lastPt.x + 3, lastPt.y - 5);
            ctx.closePath();
            ctx.fill();

            if (isSelected) {
              ctx.font = 'bold 8px Orbitron, monospace, sans-serif';
              ctx.textAlign = 'center';
              ctx.fillStyle = '#00ff88';
              ctx.shadowColor = '#00ff88';
              ctx.shadowBlur = 4;
              ctx.fillText(`🎯 착지 (${Math.round(lastPt.x)}, ${Math.round(lastPt.y)})`, lastPt.x, lastPt.y + 13);
              ctx.shadowBlur = 0;
            }
          }
        }
      }

      if (isSelected) {
        ctx.setLineDash([]);
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
