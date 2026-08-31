// --- Fully Autonomous Real-Time AI Solver Engine ---
class AutoSolver {
  constructor(game = null) {
    this.game = game;
    this.isActive = false;
    this.steps = [];
    this.currentStepIdx = 0;
    this.actionCooldown = 0;
    this.appliedSkillLog = [];
    this.lastActionUnitId = -1;
  }

  static inferSolution(levelData) {
    if (levelData && levelData.solutionDna && levelData.solutionDna.length > 0) {
      return levelData.solutionDna;
    }

    const elements = (levelData && levelData.elements) || [];
    const inferred = [];

    const hasFatalDrop = elements.some(el => el.y >= 220);
    const hasRockWall = elements.some(el => el.type === 'rockWall');
    const hasSteel = elements.some(el => el.type === 'steelBarrier');

    if (hasFatalDrop) inferred.push('FLOAT');
    if (hasRockWall) inferred.push('BASH');
    if (hasSteel) inferred.push('DRILL');
    if (inferred.length === 0) inferred.push('BASH', 'DRILL', 'BUILD');

    return inferred;
  }

  static generateSteps(levelData) {
    if (!levelData) return [];
    const solution = this.inferSolution(levelData);
    const elements = levelData.elements || [];
    const steps = [];

    const spawnX = levelData.spawnX || 90;
    const gateX = levelData.gateX || 720;
    const gateY = levelData.gateY || 260;

    let stepNum = 1;
    for (let i = 0; i < solution.length; i++) {
      const act = solution[i];
      const info = PUZZLE_ACTIONS[act] || { name: act, icon: '⚡', skill: act.toLowerCase() };
      let desc = "";
      let trigger = { x: spawnX + 60, y: 120, skill: info.skill, action: act };

      switch (act) {
        case 'FLOAT':
          trigger.triggerType = 'falling';
          desc = `고도 낙하 도중 [${info.icon} ${info.name}]을 발동하여 착지 충격을 안전하게 감쇄하십시오.`;
          break;
        case 'BASH':
          trigger.triggerType = 'nearWall';
          const wall = elements.find(el => el.type === 'rockWall');
          trigger.x = wall ? wall.x - 20 : spawnX + 160;
          desc = `전방 암벽 도달 시 [${info.icon} ${info.name}]로 수평 절삭하여 통로를 개척하십시오.`;
          break;
        case 'MINE':
          trigger.triggerType = 'nearWall';
          const wallMine = elements.find(el => el.type === 'rockWall' || el.type === 'craggyRock');
          trigger.x = wallMine ? wallMine.x - 15 : spawnX + 200;
          desc = `단차 또는 지형 앞에서 [${info.icon} ${info.name}]을 발동하여 대각선 아래로 관통 통로를 개척하십시오.`;
          break;
        case 'DRILL':
          trigger.triggerType = 'nearBarrier';
          const steel = elements.find(el => el.type === 'steelBarrier');
          trigger.x = steel ? steel.x - 45 : spawnX + 260;
          desc = `강철 격벽 앞 바닥을 [${info.icon} ${info.name}]로 천공하여 하층으로 하강하십시오.`;
          break;
        case 'BLOCK':
          trigger.triggerType = 'nearEdge';
          trigger.x = gateX - 80;
          desc = `낭떠러지 앞에서 [${info.icon} ${info.name}]을 세워 나노봇 군단의 방향을 안전하게 전환하십시오.`;
          break;
        case 'BUILD':
          trigger.triggerType = 'chasm';
          trigger.x = gateX - 110;
          desc = `탈출구 앞 단차에서 [${info.icon} ${info.name}]으로 3D 계단을 증축하여 웜홀로 진입하십시오.`;
          break;
        case 'CLIMB':
          trigger.triggerType = 'highWall';
          trigger.x = spawnX + 120;
          desc = `수직 암벽 표면에서 [${info.icon} ${info.name}]으로 전자기 흡착 등반을 수행하십시오.`;
          break;
        default:
          desc = `적절한 위치에서 [${info.icon} ${info.name}] 스킬을 전략적으로 활용하십시오.`;
          break;
      }

      steps.push({
        step: stepNum++,
        action: act,
        name: info.name,
        icon: info.icon,
        skill: info.skill,
        desc,
        trigger
      });
    }

    steps.push({
      step: stepNum,
      action: 'GATE',
      name: '웜홀 탈출',
      icon: '🌀',
      skill: null,
      desc: `최종 관문(X: ${Math.round(gateX)}, Y: ${Math.round(gateY)})으로 나노봇 전원을 손실 없이 유도하여 작전을 완수하십시오.`
    });

    return steps;
  }

  start(game, levelData) {
    this.game = game;
    this.isActive = true;
    this.currentStepIdx = 0;
    this.actionCooldown = 0;
    this.appliedSkillLog = [];
    this.lastActionUnitId = -1;
    this.steps = AutoSolver.generateSteps(levelData);

    const overlay = document.getElementById('ai-solve-overlay');
    if (overlay) {
      overlay.style.display = 'flex';
      overlay.innerHTML = `<span>🤖 AI AUTO-SOLVE: [1/${this.steps.length}] ${this.steps[0].name} 대기 중...</span>`;
    }

    if (this.game && this.game.particles) {
      this.game.particles.spawnFloatingText(400, 180, "🤖 AI AUTO-SOLVE 자율 풀이 가동!", "#00ff88");
    }
  }

  stop() {
    this.isActive = false;
    const overlay = document.getElementById('ai-solve-overlay');
    if (overlay) overlay.style.display = 'none';
  }

  update() {
    if (!this.isActive || !this.game || this.game.gameState !== GAME_STATE.PLAYING) return;

    if (this.actionCooldown > 0) {
      this.actionCooldown--;
    }

    const units = this.game.units.filter(u => u.state !== STATE.DEAD && u.state !== STATE.EXITING);
    if (units.length === 0) return;

    const terrain = this.game.terrain;
    const skills = this.game.skillCounts;

    // 1. CRITICAL SAFETY: Save ANY falling unit that is about to suffer fatal drop damage!
    for (const u of units) {
      if (u.state === STATE.FALLING && !u.hasAntiGrav && u.fallDistance >= 70) {
        if (skills.float > 0 || skills.float === undefined) {
          this.game.applySkillToUnit(u, 'float');
          this.game.particles.spawnFloatingText(u.x, u.y - 20, "🤖 AI: [역추진] 자동 점화!", "#00ff88");
          this.recordAction('FLOAT');
          return;
        }
      }
    }

    if (this.actionCooldown > 0) return;

    // 2. Scan active walking units (prioritize leading scouts)
    const walkers = units.filter(u => u.state === STATE.WALKING);
    if (walkers.length === 0) return;

    // Sort leading units foremost along mission path
    walkers.sort((a, b) => (b.x * b.dir) - (a.x * a.dir));
    const leadingBot = walkers[0];

    // Proactive Terrain Raycast in walking direction
    const lookDist = 16;
    const aheadX = leadingBot.x + leadingBot.dir * lookDist;
    const isSolidAhead = terrain.isSolid(aheadX, leadingBot.y) || terrain.isSolid(aheadX, leadingBot.y - 12);
    const isSteelAhead = terrain.isSteel(aheadX, leadingBot.y) || terrain.isSteel(aheadX, leadingBot.y - 12);

    // Check depth of wall / height of obstacle
    let wallHeight = 0;
    if (isSolidAhead) {
      for (let h = 1; h <= 40; h++) {
        if (terrain.isSolid(aheadX, leadingBot.y - h)) wallHeight = h;
      }
    }

    // Check if floor exists ahead (abyss / chasm detection)
    let floorAhead = false;
    for (let dy = 1; dy <= 12; dy++) {
      if (terrain.isSolid(aheadX, leadingBot.y + dy)) {
        floorAhead = true;
        break;
      }
    }

    // --- Autonomous Strategic Decision Matrix ---

    // A. Solid destructible rock wall ahead -> Cast BASH (Laser Beam)
    if (isSolidAhead && !isSteelAhead && leadingBot.state === STATE.WALKING && !leadingBot.hasPlasmaCutter) {
      if (skills.bash > 0 || skills.bash === undefined) {
        this.game.applySkillToUnit(leadingBot, 'bash');
        this.game.particles.spawnFloatingText(leadingBot.x, leadingBot.y - 26, "🤖 AI: [레이저] 수평 절삭 개시!", "#00f3ff");
        this.actionCooldown = 40;
        this.recordAction('BASH');
        return;
      }
    }

    // B. Steel Barrier ahead -> Check landing floor below and DRILL downward
    let hasLandingFloorBelow = false;
    for (let checkY = leadingBot.y + 15; checkY < 420; checkY += 8) {
      if (terrain.isSolid(leadingBot.x, checkY)) {
        hasLandingFloorBelow = true;
        break;
      }
    }

    if (isSteelAhead && leadingBot.state === STATE.WALKING && hasLandingFloorBelow) {
      if (skills.drill > 0 || skills.drill === undefined) {
        this.game.applySkillToUnit(leadingBot, 'drill');
        this.game.particles.spawnFloatingText(leadingBot.x, leadingBot.y - 26, "🤖 AI: [드릴] 바닥 수직 천공!", "#ff6600");
        this.actionCooldown = 40;
        this.recordAction('DRILL');
        return;
      }
    }

    // C. Reached cliff edge before exit gate -> Cast BUILD (3D Stairs) or BLOCK (Turn around)
    const currentLvl = this.game.isCustomPlay ? this.game.activeCustomData : LEVELS[this.game.currentLevelIdx];
    const gateDistX = currentLvl ? Math.abs(leadingBot.x - currentLvl.gateX) : 999;

    if (!floorAhead && gateDistX < 140 && leadingBot.state === STATE.WALKING) {
      if (skills.build > 0 || skills.build === undefined) {
        this.game.applySkillToUnit(leadingBot, 'build');
        this.game.particles.spawnFloatingText(leadingBot.x, leadingBot.y - 26, "🤖 AI: [3D 계단] 증축!", "#00f3ff");
        this.actionCooldown = 50;
        this.recordAction('BUILD');
        return;
      }
    }

    // D. Tall obstacle ahead -> Cast CLIMB (Magnetizer)
    if (isSolidAhead && wallHeight >= 18 && !leadingBot.hasMagnetizer && leadingBot.state === STATE.WALKING) {
      if (skills.climb > 0 || skills.climb === undefined) {
        this.game.applySkillToUnit(leadingBot, 'climb');
        this.game.particles.spawnFloatingText(leadingBot.x, leadingBot.y - 26, "🤖 AI: [흡착 등반] 가동!", "#ffb700");
        this.actionCooldown = 40;
        this.recordAction('CLIMB');
        return;
      }
    }
  }

  recordAction(actionName) {
    this.appliedSkillLog.push(actionName);
    this.currentStepIdx++;

    const overlay = document.getElementById('ai-solve-overlay');
    if (overlay) {
      if (this.currentStepIdx < this.steps.length) {
        const next = this.steps[this.currentStepIdx];
        overlay.innerHTML = `<span>🤖 AI AUTO-SOLVE: [${this.currentStepIdx + 1}/${this.steps.length}] ${next.name} 진행 중...</span>`;
      } else {
        overlay.innerHTML = `<span>🤖 AI AUTO-SOLVE: 웜홀 탈출 완료 유도 중...</span>`;
      }
    }
  }
}
