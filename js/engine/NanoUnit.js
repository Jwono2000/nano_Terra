// --- Nano-Unit FSM & Animated High-Visibility Crimson Actor ---
const STATE = {
  FALLING: 'FALLING',
  WALKING: 'WALKING',
  CLIMBING: 'CLIMBING',
  FLOATING: 'FLOATING',
  PLASMA_CUTTING: 'PLASMA_CUTTING',
  THERMAL_DRILLING: 'THERMAL_DRILLING',
  DIAGONAL_MINING: 'DIAGONAL_MINING',
  BOMBING_COUNTDOWN: 'BOMBING_COUNTDOWN',
  BUILDING_3D_PRINT: 'BUILDING_3D_PRINT',
  BLOCKING_SHIELD: 'BLOCKING_SHIELD',
  EXITING: 'EXITING',
  DEAD: 'DEAD'
};

class NanoUnit {
  constructor(id, x, y, dir = 1) {
    this.id = id;
    this.x = x;
    this.y = y;
    this.dir = dir;
    this.vx = dir * 0.25;
    this.vy = 0;
    this.state = STATE.FALLING;
    this.fallDistance = 0;
    this.maxSafeFall = 96; // Reduced by 20% from 120px to 96px for tighter fall risk
    
    this.hasMagnetizer = false;
    this.hasAntiGrav = false;
    this.hasPlasmaCutter = false;

    this.timer = 0;
    this.portalCooldown = 0;
    this.stepCount = 0;
    this.maxSteps = 12;
    this.cutSteps = 0;
    this.cutStartY = 0;
    this.climbStep = 0;
    this.climbStartY = 0;
    this.bombTimer = 0;
    this.animFrame = Math.floor(Math.random() * 60);
  }

  update(terrain, particles, exitGate, portalPair, otherUnits, speedScale = 1) {
    if (this.state === STATE.DEAD || this.state === STATE.EXITING) return;
    this.animFrame += speedScale;

    // Mission Exit Gate Trigger
    const gateTargetX = (exitGate && typeof exitGate.x === 'number') ? exitGate.x : 710;
    const gateTargetY = (exitGate && typeof exitGate.y === 'number') ? exitGate.y : 254;
    const dx = Math.abs(this.x - gateTargetX);
    const dy = Math.abs((this.y - 12) - gateTargetY);
    const distToGate = Math.hypot(dx, dy);
    if (distToGate < 36 || (dx < 26 && dy < 34)) {
      this.state = STATE.EXITING;
      SFX.playTeleport();
      particles.spawnBurst(this.x, this.y - 10, '#bf00ff', 24, 3.5);
      return;
    }

    if (portalPair && portalPair.entry && portalPair.exit) {
      if (this.portalCooldown > 0) {
        this.portalCooldown -= speedScale;
      } else {
        const distToEntry = Math.hypot(this.x - portalPair.entry.x, (this.y - 10) - portalPair.entry.y);
        if (distToEntry < 22) {
          this.x = portalPair.exit.x + this.dir * 6;
          this.y = portalPair.exit.y;
          this.portalCooldown = 75;
          SFX.playTeleport();
          particles.spawnBurst(portalPair.entry.x, portalPair.entry.y, '#00f3ff', 22, 3);
          particles.spawnBurst(portalPair.exit.x, portalPair.exit.y, '#bf00ff', 22, 3);
          particles.spawnFloatingText(portalPair.exit.x, portalPair.exit.y - 22, "WARP!", '#00f3ff');
          return;
        }
      }
    }

    if (this.bombTimer > 0) {
      this.bombTimer -= speedScale;
      if (Math.random() < 0.35) {
        particles.spawnBurst(this.x + (Math.random() - 0.5) * 16, this.y - 12 + (Math.random() - 0.5) * 16, '#00f3ff', 2, 1.5);
      }
      if (this.bombTimer <= 0) {
        this.state = STATE.DEAD;
        terrain.carveCircle(this.x, this.y - 10, 32, particles);
        SFX.playExplosion();
        return;
      }
    }

    switch (this.state) {
      case STATE.FALLING:
      case STATE.FLOATING:
        this.updateFalling(terrain, particles, speedScale);
        break;
      case STATE.WALKING:
        this.updateWalking(terrain, particles, otherUnits, speedScale);
        break;
      case STATE.CLIMBING:
        this.updateClimbing(terrain, particles, speedScale);
        break;
      case STATE.PLASMA_CUTTING:
        this.updatePlasmaCutter(terrain, particles, speedScale);
        break;
      case STATE.THERMAL_DRILLING:
        this.updateThermalDrill(terrain, particles, speedScale);
        break;
      case STATE.DIAGONAL_MINING:
        this.updateDiagonalMining(terrain, particles, speedScale);
        break;
      case STATE.BUILDING_3D_PRINT:
        this.update3DPrinter(terrain, particles, speedScale);
        break;
      case STATE.BLOCKING_SHIELD:
        this.updateBlockingShield(particles, speedScale);
        break;
    }
  }

  updateFalling(terrain, particles, speedScale) {
    const isFloater = this.hasAntiGrav || this.state === STATE.FLOATING;
    
    if (isFloater) {
      this.vy = 0.22;
      if (Math.random() < 0.5) {
        particles.spawnBurst(this.x + (Math.random() - 0.5) * 6, this.y + 2, '#cceeff', 2, 1.2);
        particles.spawnBurst(this.x + (Math.random() - 0.5) * 4, this.y + 1, '#00f3ff', 2, 1.0);
      }
    } else {
      this.vy = Math.min(0.45, (this.vy || 0) + 0.02 * speedScale);
    }

    this.y += this.vy * speedScale;
    this.fallDistance += this.vy * speedScale;

    // Bottom Screen Abyss / Void Kill Zone
    if (this.y >= 425) {
      this.state = STATE.DEAD;
      SFX.playSplat();
      particles.spawnBurst(this.x, 425, '#ff2255', 18, 3);
      return;
    }

    if (terrain.isSolid(this.x, this.y + 1)) {
      while (terrain.isSolid(this.x, this.y) && this.y > 0) {
        this.y--;
      }

      if (this.fallDistance > this.maxSafeFall && !isFloater) {
        this.state = STATE.DEAD;
        SFX.playSplat();
        particles.spawnBurst(this.x, this.y - 8, '#ff2255', 20, 3);
        particles.spawnFloatingText(this.x, this.y - 20, "으아악~!", "#ff4466");
      } else {
        this.state = STATE.WALKING;
        this.fallDistance = 0;
        this.vy = 0;
        this.hasAntiGrav = false;
      }
    }
  }

  updateWalking(terrain, particles, otherUnits, speedScale) {
    // Abyss / Screen Edge Out-of-Bounds Check
    if (this.y >= 425 || this.x < -30 || this.x > 830) {
      this.state = STATE.DEAD;
      SFX.playSplat();
      particles.spawnBurst(Math.max(10, Math.min(790, this.x)), 425, '#ff2255', 18, 3);
      return;
    }

    let foundGround = false;
    for (let dy = 1; dy <= 6; dy++) {
      if (terrain.isSolid(this.x, this.y + dy)) {
        this.y += (dy - 1);
        foundGround = true;
        break;
      }
    }

    if (!foundGround && !terrain.isSolid(this.x, this.y + 1)) {
      this.state = (this.hasAntiGrav) ? STATE.FLOATING : STATE.FALLING;
      this.fallDistance = 0;
      this.vy = 0;
      return;
    }

    // Two-way barrier: Blocks incoming units from BOTH Left and Right!
    for (const u of otherUnits) {
      if (u.id !== this.id && u.state === STATE.BLOCKING_SHIELD) {
        if (Math.abs(this.x - u.x) < 18 && Math.abs(this.y - u.y) < 18) {
          this.dir = (this.x < u.x) ? -1 : 1;
          this.vx = this.dir * 0.25;
          this.x += this.dir * 2;
          return;
        }
      }
    }

    const nextX = this.x + this.dir * 0.25 * speedScale;

    if (Math.random() < 0.08) {
      particles.spawnBurst(this.x - this.dir * 4, this.y - 1, '#00f3ff', 1, 0.8);
    }

    let isWallAhead = false;
    if (terrain.isSolid(nextX, this.y)) {
      isWallAhead = true;
    } else {
      for (let cy = -20; cy <= -4; cy += 4) {
        if (terrain.isSolid(nextX + this.dir * 2, this.y + cy)) {
          isWallAhead = true;
          break;
        }
      }
    }

    if (isWallAhead) {
      let climbHeight = 0;
      let canClimb = false;

      // Small slope stepping (only if not equipped with laser)
      if (!this.hasPlasmaCutter) {
        for (let h = 1; h <= 8; h++) {
          if (!terrain.isSolid(nextX, this.y - h) && !terrain.isSolid(nextX, this.y - h - 10)) {
            climbHeight = h;
            canClimb = true;
            break;
          }
        }
      }

      if (canClimb) {
        this.x = nextX;
        this.y -= climbHeight;
      } else {
        if (this.hasPlasmaCutter) {
          if (terrain.isSteel(nextX + this.dir * 4, this.y - 10)) {
            this.dir = -this.dir;
            this.vx = this.dir * 0.25;
            this.hasPlasmaCutter = false;
            particles.spawnFloatingText(this.x, this.y - 20, "강철 격벽 (절삭 불가)", "#ffaa00");
            return;
          }

          this.state = STATE.PLASMA_CUTTING;
          this.hasPlasmaCutter = false;
          this.cutSteps = 0;
          this.cutStartY = Math.round(this.y);
          SFX.playLaser();
          particles.spawnBurst(this.x, this.y - 10, '#00f3ff', 16, 2.5);
          particles.spawnFloatingText(this.x, this.y - 20, "⚡ 플라즈마 절삭 가동!", '#00f3ff');
          return;
        }

        if (this.hasMagnetizer) {
          this.state = STATE.CLIMBING;
          this.climbStep = 0;
          this.climbStartY = this.y;
          while (!terrain.isSolid(this.x + this.dir * 1.5, this.y) && !terrain.isSolid(this.x + this.dir * 1.5, this.y - 10)) {
            this.x += this.dir * 1;
          }
        } else {
          this.dir = -this.dir;
          this.vx = this.dir * 0.25;
        }
      }
    } else {
      this.x = nextX;
    }
  }

  updateClimbing(terrain, particles, speedScale) {
    // Steady, realistic climbing speed matching walking pace (0.25px/frame)
    this.y -= 0.25 * speedScale;
    this.climbStep = (this.climbStep || 0) + 0.18 * speedScale;

    if (Math.random() < 0.2) {
      const armOffset = (Math.floor(this.climbStep) % 2 === 0) ? -18 : -10;
      particles.spawnBurst(this.x + (this.dir > 0 ? 5 : -5), this.y + armOffset, '#00f3ff', 2, 1.0);
    }

    if (terrain.isSolid(this.x, this.y - 22)) {
      this.dir = -this.dir;
      this.vx = this.dir * 0.25;
      this.state = STATE.FALLING;
      this.fallDistance = 0;
      this.vy = 0;
      this.hasMagnetizer = false; // 1-time usage consumed
      return;
    }

    if (this.climbStartY - this.y > 8) {
      const wallCheckX = this.x + this.dir * 4;
      const isWallAtHead = terrain.isSolid(wallCheckX, this.y - 14);
      const isWallAtWaist = terrain.isSolid(wallCheckX, this.y - 6);

      if (!isWallAtHead && !isWallAtWaist) {
        this.x += this.dir * 7;
        this.y -= 2;
        this.state = STATE.WALKING;
        this.vx = this.dir * 0.25;
        this.hasMagnetizer = false; // 1-time usage consumed upon climbing over wall!
        particles.spawnBurst(this.x, this.y - 4, '#00f3ff', 8, 1.2);
        particles.spawnFloatingText(this.x, this.y - 20, "등반 완료!", "#00ff88");
      }
    }
  }

  updatePlasmaCutter(terrain, particles, speedScale) {
    if (!this.cutStartY) this.cutStartY = Math.round(this.y);
    this.y = this.cutStartY;

    // Start sustained continuous lightsaber / plasma cutting beam sound
    SFX.startContinuousBeam('laser_' + this.id, 'laser');

    if (this.cutSteps % 2 === 0) {
      const cutW = 36;
      const cutH = 28;
      const cutX = this.dir > 0 ? this.x - 6 : this.x - (cutW - 6);
      terrain.carveRect(cutX, this.cutStartY - 26, cutW, cutH, particles);
      
      // Check if steel barrier or constructed structure is directly in front
      const isObstacleAhead = terrain.isSteel(this.x + this.dir * 6, this.cutStartY - 14) || 
                              terrain.isSteel(this.x + this.dir * 6, this.cutStartY - 22) ||
                              terrain.isSteel(this.x + this.dir * 6, this.cutStartY - 6);
      if (isObstacleAhead) {
        SFX.stopContinuousBeam('laser_' + this.id);
        this.dir = -this.dir;
        this.vx = this.dir * 0.25;
        this.state = STATE.WALKING;
        this.y = this.cutStartY;
        this.cutSteps = 0;
        this.cutStartY = 0;
        this.exitSteps = 0;
        particles.spawnFloatingText(this.x, this.y - 20, "구조물/격벽 (절삭 불가)", "#ffaa00");
        return;
      }

      // Smooth continuous forward advancement (0.25px/frame)
      this.x += this.dir * 0.5 * speedScale;
      if (Math.random() < 0.45) {
        particles.spawnBurst(this.x + this.dir * 18, this.cutStartY - 14, '#00f3ff', 2, 1.2);
      }
    }
    this.cutSteps++;

    // Screen border bounds
    if (this.x < 10 || this.x > 790) {
      SFX.stopContinuousBeam('laser_' + this.id);
      this.state = STATE.WALKING;
      this.y = this.cutStartY;
      this.cutSteps = 0;
      this.cutStartY = 0;
      this.exitSteps = 0;
      return;
    }

    // Check if there is still solid rock at the front tip of the laser beam
    let isSolidAhead = false;
    for (let dist = 28; dist <= 34; dist += 2) {
      const checkX = this.x + this.dir * dist;
      for (let cy = -24; cy <= -2; cy += 4) {
        if (terrain.isSolid(checkX, this.cutStartY + cy)) {
          isSolidAhead = true;
          break;
        }
      }
      if (isSolidAhead) break;
    }

    if (isSolidAhead) {
      this.exitSteps = 0; // Still cutting solid wall, keep streaming
    } else {
      // Breached single wall! Follow-through for 16 steps to let unit's body step cleanly outside
      this.exitSteps = (this.exitSteps || 0) + 1;
      if (this.exitSteps > 16 && this.cutSteps > 16) {
        SFX.stopContinuousBeam('laser_' + this.id);
        const cutW = 38;
        const cutH = 28;
        const cutX = this.dir > 0 ? this.x - 6 : this.x - (cutW - 6);
        terrain.carveRect(cutX, this.cutStartY - 26, cutW, cutH, particles);

        this.state = STATE.WALKING;
        this.y = this.cutStartY;
        this.cutSteps = 0;
        this.cutStartY = 0;
        this.exitSteps = 0;
        particles.spawnBurst(this.x, this.y - 12, '#00ff88', 18, 2.5);
        particles.spawnFloatingText(this.x, this.y - 20, "절삭 완료 (관통 성공)!", "#00ff88");
      }
    }
  }

  updateThermalDrill(terrain, particles, speedScale) {
    // Start continuous thermal core melting rumble
    SFX.startContinuousBeam('drill_' + this.id, 'drill');

    if (this.cutSteps % 2 === 0) {
      const cutW = 20;
      const cutH = 18;
      const cutX = this.x - 10;
      terrain.carveRect(cutX, this.y - 4, cutW, cutH, particles);
      
      // Only abort if steel barrier or constructed structure is directly beneath feet
      const isObstacleBelow = terrain.isSteel(this.x, this.y + 4) || 
                              terrain.isSteel(this.x - 4, this.y + 4) || 
                              terrain.isSteel(this.x + 4, this.y + 4);
      if (isObstacleBelow) {
        SFX.stopContinuousBeam('drill_' + this.id);
        this.state = STATE.WALKING;
        this.cutSteps = 0;
        this.exitSteps = 0;
        particles.spawnFloatingText(this.x, this.y - 20, "구조물/격벽 (천공 불가)", "#ffaa00");
        return;
      }

      // Smooth continuous downward progression
      this.y += 0.5 * speedScale;
      if (Math.random() < 0.4) {
        particles.spawnBurst(this.x, this.y, '#ff6600', 4, 1.5);
      }
    }
    this.cutSteps++;

    // Out of screen / abyss check
    if (this.y >= 425) {
      SFX.stopContinuousBeam('drill_' + this.id);
      this.state = STATE.DEAD;
      SFX.playSplat();
      particles.spawnBurst(this.x, 425, '#ff2255', 18, 3);
      return;
    }

    // Check if there is still solid rock directly at the bottom tip of the drill (y + 14)
    const isSolidBelow = terrain.isSolid(this.x - 4, this.y + 14) || 
                         terrain.isSolid(this.x, this.y + 14) || 
                         terrain.isSolid(this.x + 4, this.y + 14);

    if (isSolidBelow) {
      this.exitSteps = 0; // Still drilling through current floor, keep going
    } else {
      // Breached the underside into the air gap! Follow-through for 12 steps so body drops cleanly
      this.exitSteps = (this.exitSteps || 0) + 1;
      if (this.exitSteps > 12 && this.cutSteps > 14) {
        SFX.stopContinuousBeam('drill_' + this.id);
        const cutW = 20;
        const cutH = 18;
        terrain.carveRect(this.x - 10, this.y - 4, cutW, cutH, particles);

        this.state = (this.hasAntiGrav) ? STATE.FLOATING : STATE.FALLING;
        this.fallDistance = 0;
        this.vy = 0;
        this.cutSteps = 0;
        this.exitSteps = 0;
        particles.spawnBurst(this.x, this.y, '#ff6600', 16, 2.5);
        particles.spawnFloatingText(this.x, this.y - 20, "천공 완료 (관통 성공)!", "#00ff88");
      }
    }
  }

  updateDiagonalMining(terrain, particles, speedScale) {
    // Start continuous diagonal plasma cutter stream
    SFX.startContinuousBeam('mine_' + this.id, 'mine');

    if (this.cutSteps % 2 === 0) {
      const cutW = 20;
      const cutH = 20;
      const cutX = this.dir > 0 ? this.x - 4 : this.x - (cutW - 4);
      terrain.carveRect(cutX, this.y - 17, cutW, cutH, particles);
      
      // Only abort if steel barrier or constructed structure is directly in the diagonal progression path
      const isObstacleAhead = terrain.isSteel(this.x + this.dir * 4, this.y + 2) || 
                              terrain.isSteel(this.x + this.dir * 4, this.y - 8);
      if (isObstacleAhead) {
        SFX.stopContinuousBeam('mine_' + this.id);
        this.dir = -this.dir;
        this.vx = this.dir * 0.25;
        this.state = STATE.WALKING;
        this.cutSteps = 0;
        this.exitSteps = 0;
        particles.spawnFloatingText(this.x, this.y - 20, "구조물/격벽 (대각 굴착 불가)", "#ffaa00");
        return;
      }

      // Smooth diagonal progression
      this.x += this.dir * 0.5 * speedScale;
      this.y += 0.45 * speedScale;
      this.fallDistance = 0;
      if (Math.random() < 0.4) {
        particles.spawnBurst(this.x + this.dir * 6, this.y - 8, '#f0a028', 3, 1.2);
      }
    }
    this.cutSteps++;

    // Out of screen bounds check
    if (this.y >= 425 || this.x < 10 || this.x > 790) {
      SFX.stopContinuousBeam('mine_' + this.id);
      if (this.y >= 425) {
        this.state = STATE.DEAD;
        SFX.playSplat();
        particles.spawnBurst(this.x, 425, '#ff2255', 18, 3);
      } else {
        this.state = STATE.WALKING;
        this.cutSteps = 0;
        this.exitSteps = 0;
      }
      return;
    }

    // Check if there is still solid rock at the diagonal cutting tip (dist: 16px)
    const tipX = this.x + this.dir * 16;
    const isSolidAhead = terrain.isSolid(tipX, this.y - 10) || 
                         terrain.isSolid(tipX, this.y - 3) || 
                         terrain.isSolid(tipX, this.y + 3);

    if (isSolidAhead) {
      this.exitSteps = 0; // Still inside solid rock slope, keep mining
    } else {
      // Breached through current floor! Follow-through for 8 steps
      this.exitSteps = (this.exitSteps || 0) + 1;
      if (this.exitSteps > 8 && this.cutSteps > 12) {
        SFX.stopContinuousBeam('mine_' + this.id);
        const cutW = 20;
        const cutH = 20;
        const cutX = this.dir > 0 ? this.x - 4 : this.x - (cutW - 4);
        terrain.carveRect(cutX, this.y - 17, cutW, cutH, particles);

        const hasFloorDirectlyBelow = terrain.isSolid(this.x, this.y + 2) || terrain.isSolid(this.x, this.y + 4);
        this.state = hasFloorDirectlyBelow ? STATE.WALKING : (this.hasAntiGrav ? STATE.FLOATING : STATE.FALLING);
        this.cutSteps = 0;
        this.exitSteps = 0;
        this.fallDistance = 0;
        particles.spawnBurst(this.x, this.y, '#00ff88', 16, 2.5);
        particles.spawnFloatingText(this.x, this.y - 20, "대각 굴착 완료!", "#00ff88");
      }
    }
  }

  update3DPrinter(terrain, particles, speedScale) {
    this.timer += speedScale;
    // Build 1 step (4px x 2px) every 16 frames = exact 0.25px/frame walking pace
    if (this.timer >= 16) {
      this.timer = 0;
      SFX.playBuild();
      
      terrain.buildStep(this.x, this.y, this.dir, particles);
      
      this.x += this.dir * 4;
      this.y -= 2;
      this.stepCount++;

      const headX = this.x + this.dir * 4;
      const headY = this.y - 12;
      const waistY = this.y - 6;
      if (terrain.isSolid(headX, headY) || terrain.isSolid(headX, waistY) || terrain.isSolid(this.x, this.y - 18)) {
        this.dir = -this.dir;
        this.vx = this.dir * 0.25;
        this.state = STATE.WALKING;
        this.stepCount = 0;
        return;
      }

      if (this.stepCount >= this.maxSteps) {
        this.state = STATE.WALKING;
        this.stepCount = 0;
        if (particles) {
          particles.spawnBurst(this.x, this.y - 10, '#00f3ff', 12, 2);
        }
      }
    }
  }

  updateBlockingShield(particles, speedScale) {
    if (Math.random() < 0.25) {
      const angle = Math.random() * Math.PI * 2;
      const r = 16 + Math.random() * 4;
      particles.spawnBurst(this.x + Math.cos(angle) * r, this.y - 13 + Math.sin(angle) * r, '#00f3ff', 1, 0.6);
    }
  }

  render(ctx, actionSheetImg, isHovered = false) {
    if (this.state === STATE.DEAD || this.state === STATE.EXITING) return;

    ctx.save();
    ctx.translate(this.x, this.y);

    if (this.bombTimer > 0) {
      const secs = Math.ceil(this.bombTimer / 60);
      ctx.fillStyle = '#ff2255';
      ctx.font = 'bold 13px Orbitron, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(secs.toString(), 0, -32);
    }

    if (this.hasPlasmaCutter && this.state === STATE.WALKING) {
      ctx.fillStyle = '#00f3ff';
      ctx.font = 'bold 11px Orbitron, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText("⚡", 0, -32);
    } else if (this.hasAntiGrav && this.state === STATE.WALKING) {
      ctx.fillStyle = '#00ff88';
      ctx.font = 'bold 11px Orbitron, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText("🚀", 0, -32);
    }

    if (isHovered) {
      ctx.strokeStyle = 'rgba(0, 243, 255, 0.4)';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.arc(0, -12, 16, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = '#00f3ff';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(0, -12, 16, 0, Math.PI * 2);
      ctx.stroke();
    }

    if (this.dir < 0) {
      ctx.scale(-1, 1);
    }

    if (actionSheetImg && actionSheetImg.complete && actionSheetImg.naturalWidth > 0) {
      let sx = 0, sy = 0, sw = 100, sh = 125;
      let destX = -10, destY = -26, destW = 20, destH = 26;

      if (this.bombTimer > 0) {
        const bombPhase = Math.floor((300 - this.bombTimer) / 50) % 6;
        const singleBombFrames = [
          { sx: 512, sy: 753, sw: 124, sh: 120 },
          { sx: 640, sy: 754, sw: 127, sh: 120 },
          { sx: 768, sy: 750, sw: 127, sh: 120 },
          { sx: 896, sy: 753, sw: 110, sh: 120 },
          { sx: 640, sy: 890, sw: 127, sh: 120 },
          { sx: 768, sy: 890, sw: 127, sh: 120 }
        ];
        const f = singleBombFrames[bombPhase];
        sx = f.sx; sy = f.sy; sw = f.sw; sh = f.sh;
        destW = 22; destH = 26; destY = -26; destX = -11;

      } else if (this.state === STATE.PLASMA_CUTTING) {
        const pulseFrame = this.cutSteps % 8;
        const isFiring = pulseFrame < 4;
        const blastCycle = isFiring ? (Math.floor(this.cutSteps * 0.4) % 3) : 0;
        const laserFrames = [
          { sx: 25, sy: 347, sw: 102, sh: 138 },
          { sx: 128, sy: 347, sw: 127, sh: 138 },
          { sx: 256, sy: 354, sw: 127, sh: 131 }
        ];
        const f = laserFrames[blastCycle];
        sx = f.sx; sy = f.sy; sw = f.sw; sh = f.sh;
        destW = 24; destH = 26; destX = -10; destY = -26;

        ctx.drawImage(actionSheetImg, sx, sy, sw, sh, destX, destY, destW, destH);

        ctx.save();
        if (isFiring) {
          // Intense cutting beam during rhythmic strike pulse
          ctx.strokeStyle = 'rgba(0, 243, 255, 0.45)';
          ctx.lineWidth = 6;
          ctx.beginPath();
          ctx.moveTo(10, -14);
          ctx.lineTo(34, -14);
          ctx.stroke();

          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.moveTo(10, -14);
          ctx.lineTo(34, -14);
          ctx.stroke();

          ctx.fillStyle = '#ffb700';
          ctx.beginPath();
          ctx.arc(34, -14, 3.5, 0, Math.PI * 2);
          ctx.fill();
        } else {
          // Glowing ready nozzle during recharge interval
          ctx.fillStyle = '#00f3ff';
          ctx.beginPath();
          ctx.arc(12, -14, 2.0, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();

        ctx.restore();
        return;

      } else if (this.state === STATE.DIAGONAL_MINING) {
        const pulseFrame = this.cutSteps % 8;
        const isStriking = pulseFrame < 4;
        const blastCycle = isStriking ? (Math.floor(this.cutSteps * 0.4) % 3) : 0;
        const laserFrames = [
          { sx: 25, sy: 347, sw: 102, sh: 138 },
          { sx: 128, sy: 347, sw: 127, sh: 138 },
          { sx: 256, sy: 354, sw: 127, sh: 131 }
        ];
        const f = laserFrames[blastCycle];
        sx = f.sx; sy = f.sy; sw = f.sw; sh = f.sh;
        destW = 24; destH = 26; destX = -10; destY = -26;

        ctx.drawImage(actionSheetImg, sx, sy, sw, sh, destX, destY, destW, destH);

        ctx.save();
        if (isStriking) {
          ctx.strokeStyle = 'rgba(240, 160, 40, 0.55)';
          ctx.lineWidth = 6;
          ctx.beginPath();
          ctx.moveTo(8, -12);
          ctx.lineTo(24, 4);
          ctx.stroke();

          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.moveTo(8, -12);
          ctx.lineTo(24, 4);
          ctx.stroke();

          ctx.fillStyle = '#ffaa00';
          ctx.beginPath();
          ctx.arc(24, 4, 3.5, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillStyle = '#ffb700';
          ctx.beginPath();
          ctx.arc(10, -10, 2.0, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();

        ctx.restore();
        return;

      } else if (this.state === STATE.BLOCKING_SHIELD) {
        sx = 535; sy = 142; sw = 104; sh = 140;
        destW = 20; destH = 26; destX = -10; destY = -26;

        ctx.drawImage(actionSheetImg, sx, sy, sw, sh, destX, destY, destW, destH);

        ctx.save();
        const pulse = (Math.sin(performance.now() * 0.003) * 0.5 + 0.5);
        
        const domeGrad = ctx.createRadialGradient(0, -13, 3, 0, -13, 18);
        domeGrad.addColorStop(0, 'rgba(0, 243, 255, 0.08)');
        domeGrad.addColorStop(0.7, `rgba(0, 150, 255, ${0.2 + pulse * 0.1})`);
        domeGrad.addColorStop(1.0, `rgba(0, 243, 255, ${0.45 + pulse * 0.25})`);
        ctx.fillStyle = domeGrad;
        ctx.beginPath();
        ctx.arc(0, -13, 17.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = `rgba(0, 243, 255, ${0.85 + pulse * 0.15})`;
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.arc(0, -13, 17.5, 0, Math.PI * 2);
        ctx.stroke();

        ctx.strokeStyle = `rgba(255, 255, 255, ${0.4 + pulse * 0.4})`;
        ctx.lineWidth = 1.0;
        ctx.beginPath();
        ctx.ellipse(0, -13, 15.5, 7, 0, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(0, -30.5, 1.8, 0, Math.PI * 2);
        ctx.arc(0, 4.5, 1.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        ctx.restore();
        return;

      } else if (this.state === STATE.CLIMBING) {
        const climbCycle = Math.floor(this.climbStep * 0.6) % 3;
        const climbFrames = [
          { sx: 23, sy: 527, sw: 117, sh: 179 },
          { sx: 189, sy: 526, sw: 123, sh: 181 },
          { sx: 355, sy: 526, sw: 124, sh: 181 }
        ];
        const f = climbFrames[climbCycle];
        sx = f.sx; sy = f.sy; sw = f.sw; sh = f.sh;
        destW = 20; destH = 28; destX = -18; destY = -27;

        ctx.drawImage(actionSheetImg, sx, sy, sw, sh, destX, destY, destW, destH);

        // Animate two magnetic arms reaching and gripping alternately!
        ctx.save();
        const armPhase = (this.climbStep * 0.8);
        const topArmY = -22 + Math.sin(armPhase) * 4;
        const botArmY = -10 - Math.sin(armPhase) * 4;

        ctx.fillStyle = '#00f3ff';
        ctx.fillRect(0, topArmY, 3, 4);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(1, topArmY + 1, 2, 2);

        ctx.fillStyle = '#00f3ff';
        ctx.fillRect(0, botArmY, 3, 4);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(1, botArmY + 1, 2, 2);
        ctx.restore();

        ctx.restore();
        return;

      } else if (this.state === STATE.BUILDING_3D_PRINT) {
        const buildCycle = Math.floor(this.animFrame * 0.2) % 4;
        const buildFrames = [
          { sx: 535, sy: 531, sw: 88, sh: 175 },
          { sx: 661, sy: 531, sw: 88, sh: 178 },
          { sx: 787, sy: 531, sw: 88, sh: 178 },
          { sx: 912, sy: 531, sw: 88, sh: 178 }
        ];
        const f = buildFrames[buildCycle];
        sx = f.sx; sy = f.sy; sw = f.sw; sh = f.sh;
        destW = 20; destH = 28; destX = -10; destY = -28;

      } else if (this.state === STATE.FLOATING || (this.state === STATE.FALLING && this.hasAntiGrav)) {
        sx = 165; sy = 147; sw = 81; sh = 137;
        destW = 20; destH = 26; destX = -10; destY = -26;

        ctx.save();
        const thrusterFlicker = 8 + Math.sin(this.animFrame * 0.5) * 4;
        
        ctx.fillStyle = '#00f3ff';
        ctx.beginPath();
        ctx.moveTo(-6, -4);
        ctx.lineTo(-2, -4);
        ctx.lineTo(-4, -4 + thrusterFlicker);
        ctx.closePath();
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(2, -4);
        ctx.lineTo(6, -4);
        ctx.lineTo(4, -4 + thrusterFlicker);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(-4, -2, 1.5, 0, Math.PI * 2);
        ctx.arc(4, -2, 1.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

      } else {
        // Uniform, fixed torso/head crop to eliminate horizontal stretching/squishing bug
        sx = 535; sy = 142; sw = 104; sh = 120;
        destW = 18; destH = 21; destX = -9; destY = -25;

        // Walk cycle timing
        const isWalking = (this.state === STATE.WALKING);
        const time = this.animFrame * 0.22;
        const stride = isWalking ? Math.sin(time) : 0;
        const lift = isWalking ? Math.cos(time) : 0;
        const walkBob = isWalking ? Math.abs(stride) * 1.5 : 0;

        // 1. Draw back leg & boot first (depth layering)
        const backStrideX = -stride * 4.5;
        const backLiftY = Math.max(0, -lift) * 3.5;
        const backFootX = 1 + backStrideX;
        const backFootY = -4.5 - backLiftY;

        ctx.save();
        // Back thigh / leg
        ctx.fillStyle = '#680a18';
        ctx.fillRect(backFootX + 0.5, -9 - walkBob, 3.5, 6);
        // Back boot
        ctx.fillStyle = '#8a0d20';
        ctx.fillRect(backFootX - 1, backFootY, 5, 4.5);
        ctx.fillStyle = '#00f3ff';
        ctx.fillRect(backFootX - 1, backFootY + 3.5, 5, 1.2);
        ctx.restore();

        // 2. Draw stable upper body (torso & helmet) with gentle vertical bob
        ctx.save();
        ctx.drawImage(actionSheetImg, sx, sy, sw, sh, destX, destY - walkBob, destW, destH);
        ctx.restore();

        // 3. Draw front leg & boot (clearly visible stepping in front of torso)
        const frontStrideX = stride * 4.5;
        const frontLiftY = Math.max(0, lift) * 3.5;
        const frontFootX = -3.5 + frontStrideX;
        const frontFootY = -4.5 - frontLiftY;

        ctx.save();
        // Front thigh / leg
        ctx.fillStyle = '#9e0c25';
        ctx.fillRect(frontFootX + 0.5, -9 - walkBob, 3.5, 6);
        // Front boot
        ctx.fillStyle = '#e62244';
        ctx.fillRect(frontFootX - 1, frontFootY, 5, 4.5);
        ctx.fillStyle = '#00f3ff';
        ctx.fillRect(frontFootX - 1, frontFootY + 3.5, 5, 1.2);

        // Ground landing spark when foot touches ground
        if (isWalking && frontLiftY < 0.3 && Math.random() < 0.15) {
          ctx.fillStyle = '#00f3ff';
          ctx.beginPath();
          ctx.arc(frontFootX + 1.5, 0, 1.2, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();

        ctx.restore();
        return;
      }

      ctx.drawImage(actionSheetImg, sx, sy, sw, sh, destX, destY, destW, destH);
    } else {
      this.renderHDChibiAstronaut(ctx);
    }

    ctx.restore();
  }

  renderHDChibiAstronaut(ctx) {
    const time = this.animFrame * 0.22;
    const isWalking = (this.state === STATE.WALKING);
    const stride = isWalking ? Math.sin(time) : 0;
    const lift = isWalking ? Math.cos(time) : 0;
    const walkBob = isWalking ? Math.abs(stride) * 1.5 : 0;

    // Back leg
    const backFootX = 1 - stride * 4.5;
    const backFootY = -4.5 - Math.max(0, -lift) * 3.5;
    ctx.fillStyle = '#680a18';
    ctx.fillRect(backFootX + 0.5, -9 - walkBob, 3.5, 6);
    ctx.fillStyle = '#8a0d20';
    ctx.fillRect(backFootX - 1, backFootY, 5, 4.5);
    ctx.fillStyle = '#00f3ff';
    ctx.fillRect(backFootX - 1, backFootY + 3.5, 5, 1.2);

    // Torso suit
    ctx.fillStyle = '#e62244';
    ctx.strokeStyle = '#3a0812';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.roundRect(-5.5, -12 - walkBob, 11, 8, 2.5);
    ctx.fill();
    ctx.stroke();

    // Helmet
    ctx.beginPath();
    ctx.arc(0, -18 - walkBob, 7.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Cyan visor
    ctx.fillStyle = '#00f3ff';
    ctx.beginPath();
    ctx.roundRect(-2, -21 - walkBob, 6.5, 5.5, 2.5);
    ctx.fill();

    // Front leg
    const frontFootX = -3.5 + stride * 4.5;
    const frontFootY = -4.5 - Math.max(0, lift) * 3.5;
    ctx.fillStyle = '#9e0c25';
    ctx.fillRect(frontFootX + 0.5, -9 - walkBob, 3.5, 6);
    ctx.fillStyle = '#e62244';
    ctx.fillRect(frontFootX - 1, frontFootY, 5, 4.5);
    ctx.fillStyle = '#00f3ff';
    ctx.fillRect(frontFootX - 1, frontFootY + 3.5, 5, 1.2);
  }
}
