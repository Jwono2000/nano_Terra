const MAX_PORTAL_RANGE = 160;

const GAME_STATE = {
  MENU: 'MENU',
  COUNTDOWN: 'COUNTDOWN',
  PLAYING: 'PLAYING',
  ENDED: 'ENDED',
  EDITOR: 'EDITOR'
};

function setSafeText(id, text) {
  const el = document.getElementById(id);
  if (el) el.innerText = text;
}

function setSafeHTML(id, html) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = html;
}

// --- Main Game Controller ---
class GameEngine {
  constructor() {
    this.canvas = document.getElementById('game-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.terrain = new TerrainEngine(800, 450);
    this.particles = new ParticleSystem();

    this.bgImg = new Image();
    this.hatchImg = new Image();
    this.hatchImg.src = 'assets/dropship_hatch.png';
    
    this.wallTextureImg = new Image();
    this.wallTextureImg.src = 'assets/wall_texture.jpg';
    this.wallTextureImg.onload = () => {
      this.terrain.setPattern(this.wallTextureImg);
      if (this.gameState === GAME_STATE.EDITOR && this.editor) {
        this.editor.syncTerrain();
      } else if (this.isCustomPlay && this.activeCustomData) {
        StageDataEngine.buildTerrainFromData(this.terrain, this.activeCustomData);
      } else if (LEVELS[this.currentLevelIdx]) {
        StageDataEngine.buildTerrainFromData(this.terrain, LEVELS[this.currentLevelIdx]);
      }
    };

    // Crimson Red High-Visibility Action Sprite Sheet
    this.actionSheetImg = new Image();
    this.actionSheetImg.src = 'assets/nanobot_actions_red.png';

    this.currentLevelIdx = 0;
    this.gameState = GAME_STATE.MENU;
    this.units = [];
    this.spawnTimer = 0;
    this.spawnedCount = 0;
    this.rescuedCount = 0;
    this.deadCount = 0;
    this.selectedSkill = 'climb';
    this.gameSpeed = 1;
    this.timeRemaining = 240;
    this.secondCounter = 0;
    this.portalPair = { entry: null, exit: null };
    this.hoveredUnit = null;
    this.mousePos = { x: 0, y: 0 };
    this.isNuking = false;
    this.currentLiveScore = 0;

    this.activeCustomData = null;
    this.isCustomPlay = false;

    this.countdownStart = 0;
    this.countdownTotalMs = 3000;
    this.lastPlayedBeepSec = 4;

    this.editor = new LevelEditor();
    this.stageMgr = new StageManager(this);
    this.autoSolver = new AutoSolver(this);

    this.initUI();
    this.initTouchControls();
  }

  enterEditor(initialData = null) {
    this.gameState = GAME_STATE.EDITOR;
    this.isCustomPlay = false;
    this.autoSolver.stop();
    this.setSpeed(0);

    const overlay = document.getElementById('editor-overlay');
    if (overlay) overlay.style.display = 'flex';
    const hudBottom = document.getElementById('hud-bottom');
    if (hudBottom) hudBottom.style.display = 'none';
    const modalStart = document.getElementById('modal-start');
    if (modalStart) modalStart.style.display = 'none';
    const modalEnd = document.getElementById('modal-end');
    if (modalEnd) modalEnd.style.display = 'none';
    const modalStageMgr = document.getElementById('modal-stage-manager');
    if (modalStageMgr) modalStageMgr.style.display = 'none';

    const dataToEdit = initialData || (this.activeCustomData || LEVELS[this.currentLevelIdx]);
    this.editor.init(this, dataToEdit);

    if (this.wallTextureImg.complete) {
      this.terrain.setPattern(this.wallTextureImg);
    }
    this.bgImg.src = this.editor.levelData.bgImg || 'assets/bg_level_1.jpg';
    this.editor.syncTerrain();

    SFX.playClick();
  }

  enterBlankEditor() {
    const blank = StageDataEngine.createBlankStage();
    this.enterEditor(blank);
  }

  exitEditor() {
    const overlay = document.getElementById('editor-overlay');
    if (overlay) overlay.style.display = 'none';
    const hudBottom = document.getElementById('hud-bottom');
    if (hudBottom) hudBottom.style.display = 'flex';

    this.isCustomPlay = false;
    this.loadLevel(this.currentLevelIdx, true);
    SFX.playClick();
  }

  exitEditorToPlay(levelData) {
    this.loadLevelFromData(levelData, true);
  }

  loadCustomLevel(data, startImmediately = true) {
    this.loadLevelFromData(data, startImmediately);
  }

  loadLevelFromData(data, startImmediately = true) {
    this.activeCustomData = JSON.parse(JSON.stringify(data));
    this.isCustomPlay = true;

    const overlay = document.getElementById('editor-overlay');
    if (overlay) overlay.style.display = 'none';
    const hudBottom = document.getElementById('hud-bottom');
    if (hudBottom) hudBottom.style.display = 'flex';

    this.bgImg.src = this.activeCustomData.bgImg || 'assets/bg_level_1.jpg';
    if (this.wallTextureImg.complete) {
      this.terrain.setPattern(this.wallTextureImg);
    }
    StageDataEngine.buildTerrainFromData(this.terrain, this.activeCustomData);

    this.units = [];
    this.spawnTimer = 180;
    this.spawnedCount = 0;
    this.rescuedCount = 0;
    this.deadCount = 0;
    this.timeRemaining = this.activeCustomData.timeLimit || 240;
    this.secondCounter = 0;
    this.isNuking = false;
    this.currentLiveScore = 0;
    this.setSpeed(1);
    this.portalPair = { entry: null, exit: null };
    this.hoveredUnit = null;

    this.skillCounts = { ...(this.activeCustomData.skills || {}) };
    this.updateSkillUI();

    setSafeText('hud-stage-num', 'CUSTOM');
    setSafeText('hud-level-title', this.activeCustomData.title || "CUSTOM SECTOR");
    this.updateHUD();

    setSafeText('start-title', `[CUSTOM] ${this.activeCustomData.title || "CUSTOM SECTOR"}`);
    setSafeHTML('start-desc', this.activeCustomData.desc || "커스텀 설계 작전 구역입니다.");
    setSafeText('start-total-units', `${this.activeCustomData.totalUnits || 15} UNIT`);
    setSafeText('start-time-limit', `${Math.floor(this.timeRemaining / 60).toString().padStart(2, '0')}:${(this.timeRemaining % 60).toString().padStart(2, '0')}`);
    setSafeText('start-best-score', "커스텀 미션");

    const modalStart = document.getElementById('modal-start');
    const modalEnd = document.getElementById('modal-end');
    if (modalEnd) modalEnd.style.display = 'none';

    if (startImmediately) {
      if (modalStart) modalStart.style.display = 'none';
      this.startMissionWithCountdown();
    } else {
      this.gameState = GAME_STATE.MENU;
      if (modalStart) modalStart.style.display = 'flex';
    }
  }

  loadLevel(idx, showStartModal = false) {
    if (!LEVELS || LEVELS.length === 0) return;
    this.currentLevelIdx = Math.max(0, Math.min(LEVELS.length - 1, idx));
    this.isCustomPlay = false;
    this.activeCustomData = null;
    SFX.stopAllContinuousBeams();
    const lvl = LEVELS[this.currentLevelIdx];
    
    this.bgImg.src = lvl.bgImg || 'assets/bg_level_1.jpg';
    if (this.wallTextureImg.complete) {
      this.terrain.setPattern(this.wallTextureImg);
    }
    StageDataEngine.buildTerrainFromData(this.terrain, lvl);

    this.units = [];
    this.spawnTimer = 180;
    this.spawnedCount = 0;
    this.rescuedCount = 0;
    this.deadCount = 0;
    const timeLimit = (typeof lvl.timeLimit === 'number' && !isNaN(lvl.timeLimit)) ? lvl.timeLimit : 240;
    this.timeRemaining = timeLimit;
    this.secondCounter = 0;
    this.isNuking = false;
    this.currentLiveScore = 0;
    this.setSpeed(1);
    this.portalPair = { entry: null, exit: null };
    this.hoveredUnit = null;

    const defaultSkills = { climb: 4, float: 4, bash: 4, mine: 4, drill: 4, bomb: 2, build: 6, block: 3, portal: 1 };
    this.skillCounts = Object.assign({}, defaultSkills, lvl.skills || {});
    this.updateSkillUI();

    const stageTotal = LEVELS.length || 10;
    const stageNumStr = `STAGE ${(this.currentLevelIdx + 1).toString().padStart(2, '0')}/${stageTotal}`;
    setSafeText('hud-stage-num', stageNumStr);
    setSafeText('hud-level-title', `${this.currentLevelIdx + 1}구역: ${lvl.title || 'GENESIS DROP'}`);
    this.updateHUD();

    setSafeText('start-title', `${lvl.id || (this.currentLevelIdx + 1)}구역: ${lvl.title || 'GENESIS DROP'}`);
    setSafeHTML('start-desc', lvl.desc || "나노봇 군단을 무사히 웜홀까지 유도하십시오.");
    setSafeText('start-total-units', `${lvl.totalUnits || 15} UNIT`);
    setSafeText('start-time-limit', `${Math.floor(timeLimit / 60).toString().padStart(2, '0')}:${(timeLimit % 60).toString().padStart(2, '0')}`);
    
    const savedBest = localStorage.getItem(`nano_terra_level_${lvl.id || (this.currentLevelIdx + 1)}_best`) || 0;
    const savedRank = localStorage.getItem(`nano_terra_level_${lvl.id || (this.currentLevelIdx + 1)}_rank`) || '-';
    setSafeText('start-best-score', `최고 기록: ${parseInt(savedBest).toLocaleString()} pt (Rank: ${savedRank})`);

    const modalStart = document.getElementById('modal-start');
    const modalEnd = document.getElementById('modal-end');
    if (modalEnd) modalEnd.style.display = 'none';

    if (showStartModal) {
      this.gameState = GAME_STATE.MENU;
      if (modalStart) modalStart.style.display = 'flex';
    } else {
      if (modalStart) modalStart.style.display = 'none';
    }
  }

  startMissionWithCountdown() {
    const modalStart = document.getElementById('modal-start');
    if (modalStart) modalStart.style.display = 'none';
    const modalEnd = document.getElementById('modal-end');
    if (modalEnd) modalEnd.style.display = 'none';

    this.units = [];
    this.spawnedCount = 0;
    this.spawnTimer = 180;
    this.isNuking = false;

    this.gameState = GAME_STATE.COUNTDOWN;
    this.countdownStart = performance.now();
    this.lastPlayedBeepSec = 4;
    SFX.init();
    SFX.playTone(400, 'sine', 0.15, 0.1);
  }

  restartLevelDirectly() {
    const modals = [
      'modal-start', 'modal-end', 'modal-stage-manager', 'modal-save-slot', 
      'modal-solution-guide', 'modal-editor-props', 'modal-editor-generate'
    ];
    modals.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });

    const overlay = document.getElementById('editor-overlay');
    if (overlay) overlay.style.display = 'none';
    const hudBottom = document.getElementById('hud-bottom');
    if (hudBottom) hudBottom.style.display = 'flex';

    this.autoSolver.stop();

    if (this.isCustomPlay && this.activeCustomData) {
      this.loadLevelFromData(this.activeCustomData, false);
    } else {
      this.loadLevel(this.currentLevelIdx, false);
    }

    this.startMissionWithCountdown();
    SFX.init();
    SFX.playClick();
  }

  initUI() {
    const cards = document.querySelectorAll('.skill-card');
    cards.forEach(c => {
      const selectThis = (e) => {
        if (e) { e.preventDefault(); e.stopPropagation(); }
        SFX.init();
        SFX.playClick();
        if (navigator.vibrate) navigator.vibrate(10);
        cards.forEach(x => x.classList.remove('selected'));
        c.classList.add('selected');
        this.selectedSkill = c.dataset.skill;
      };
      c.addEventListener('pointerdown', selectThis);
      c.addEventListener('click', selectThis);
    });

    const bindBtn = (id, fn) => {
      const btn = document.getElementById(id);
      if (!btn) return;
      let lastTrigger = 0;
      const handler = (e) => {
        if (e) { e.preventDefault(); e.stopPropagation(); }
        const now = performance.now();
        if (now - lastTrigger < 200) return;
        lastTrigger = now;
        SFX.init();
        fn();
      };
      btn.addEventListener('pointerdown', handler);
      btn.addEventListener('click', handler);
    };

    bindBtn('btn-pause', () => {
      SFX.playClick();
      this.setSpeed(this.gameSpeed === 0 ? 1 : 0);
    });
    bindBtn('btn-speed-1', () => { SFX.playClick(); this.setSpeed(1); });
    bindBtn('btn-speed-2', () => { SFX.playClick(); this.setSpeed(2); });
    bindBtn('btn-speed-4', () => { SFX.playClick(); this.setSpeed(4); });

    bindBtn('btn-quick-restart', () => {
      this.restartLevelDirectly();
    });

    bindBtn('btn-hud-solve', () => {
      const curLvl = this.isCustomPlay ? this.activeCustomData : LEVELS[this.currentLevelIdx];
      this.autoSolver.start(this, curLvl);
    });

    bindBtn('btn-open-editor', () => {
      this.enterEditor();
    });

    bindBtn('btn-hud-creator', () => {
      this.enterBlankEditor();
    });

    bindBtn('btn-open-stage-manager', () => {
      this.stageMgr.openModal();
    });

    bindBtn('btn-start-open-editor', () => {
      this.enterEditor();
    });

    bindBtn('btn-start-open-creator', () => {
      this.enterBlankEditor();
    });

    bindBtn('btn-start-stage-select', () => {
      this.stageMgr.openModal();
    });

    bindBtn('btn-nuke', () => {
      SFX.playExplosion();
      if (navigator.vibrate) navigator.vibrate(50);
      this.isNuking = true;
      const currentLvl = this.isCustomPlay ? this.activeCustomData : LEVELS[this.currentLevelIdx];
      this.spawnedCount = currentLvl.totalUnits;

      let activeCount = 0;
      this.units.forEach((u, i) => {
        if (u.state !== STATE.DEAD && u.state !== STATE.EXITING) {
          activeCount++;
          u.bombTimer = Math.min(u.bombTimer || 999, (i + 1) * 8);
        }
      });

      if (activeCount === 0) {
        this.gameState = GAME_STATE.ENDED;
        this.evaluateLevelEnd();
      }
    });

    bindBtn('btn-audio', () => {
      SFX.toggle();
    });

    bindBtn('btn-start-mission', () => {
      this.startMissionWithCountdown();
    });

    bindBtn('btn-retry-mission', () => {
      this.restartLevelDirectly();
    });

    bindBtn('btn-next-mission', () => {
      if (this.isCustomPlay && this.stageMgr && this.stageMgr.customStages.length > 0) {
        const curId = this.activeCustomData ? this.activeCustomData.id : null;
        const curIdx = this.stageMgr.customStages.findIndex(s => s.id === curId);
        if (curIdx >= 0 && curIdx + 1 < this.stageMgr.customStages.length) {
          this.loadLevelFromData(this.stageMgr.customStages[curIdx + 1], true);
          return;
        }
      }
      const nextIdx = (this.currentLevelIdx + 1) % (LEVELS.length || 1);
      this.loadLevel(nextIdx, false);
      this.startMissionWithCountdown();
    });

    window.addEventListener('keydown', (e) => {
      const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
      const idx = keys.indexOf(e.key);
      if (idx !== -1 && cards[idx]) {
        cards[idx].dispatchEvent(new Event('pointerdown'));
      } else if (e.code === 'Space') {
        const p = document.getElementById('btn-pause');
        if (p) p.dispatchEvent(new Event('pointerdown'));
      } else if (e.key === 'r' || e.key === 'R') {
        this.restartLevelDirectly();
      } else if (e.key === 'z' && (e.ctrlKey || e.metaKey)) {
        if (this.gameState === GAME_STATE.EDITOR && this.editor) {
          this.editor.undo();
        }
      } else if (this.gameState === GAME_STATE.EDITOR && this.editor) {
        if (e.key === 'ArrowUp' || e.key === ']') {
          e.preventDefault();
          this.editor.adjustSelectedThickness(e.shiftKey ? 5 : 2);
        } else if (e.key === 'ArrowDown' || e.key === '[') {
          e.preventDefault();
          this.editor.adjustSelectedThickness(e.shiftKey ? -5 : -2);
        } else if (e.key === 'ArrowRight' || e.key === '.' || e.key === '>') {
          e.preventDefault();
          this.editor.adjustSelectedWidth(e.shiftKey ? 20 : 10);
        } else if (e.key === 'ArrowLeft' || e.key === ',' || e.key === '<') {
          e.preventDefault();
          this.editor.adjustSelectedWidth(e.shiftKey ? -20 : -10);
        }
      }
    });
  }

  setSpeed(spd) {
    this.gameSpeed = spd;
    ['btn-pause', 'btn-speed-1', 'btn-speed-2', 'btn-speed-4'].forEach(id => {
      const btn = document.getElementById(id);
      if (btn) btn.classList.remove('active');
    });
    if (spd === 0) {
      const p = document.getElementById('btn-pause');
      if (p) p.classList.add('active');
    } else if (spd === 1) {
      const s1 = document.getElementById('btn-speed-1');
      if (s1) s1.classList.add('active');
    } else if (spd === 2) {
      const s2 = document.getElementById('btn-speed-2');
      if (s2) s2.classList.add('active');
    } else if (spd === 4) {
      const s4 = document.getElementById('btn-speed-4');
      if (s4) s4.classList.add('active');
    }
  }

  updateSkillUI() {
    const keys = ['climb', 'float', 'bash', 'mine', 'drill', 'bomb', 'build', 'block', 'portal'];
    keys.forEach(k => {
      const count = this.skillCounts[k] || 0;
      setSafeText(`count-${k}`, count);
      const card = document.getElementById(`card-${k}`);
      if (card) {
        if (count <= 0) card.classList.add('empty');
        else card.classList.remove('empty');
      }
    });
  }

  initTouchControls() {
    const getCanvasCoords = (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const scaleX = this.canvas.width / rect.width;
      const scaleY = this.canvas.height / rect.height;
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      return {
        x: (clientX - rect.left) * scaleX,
        y: (clientY - rect.top) * scaleY
      };
    };

    const updateHover = (coords) => {
      this.mousePos = coords;
      let closestUnit = null;
      let minDist = 55;

      for (const u of this.units) {
        if (u.state === STATE.DEAD || u.state === STATE.EXITING) continue;
        const dist = Math.hypot(u.x - coords.x, (u.y - 12) - coords.y);
        if (dist < minDist) {
          minDist = dist;
          closestUnit = u;
        }
      }
      this.hoveredUnit = closestUnit;
      return closestUnit;
    };

    this.canvas.addEventListener('pointermove', (e) => {
      const coords = getCanvasCoords(e);
      if (this.gameState === GAME_STATE.EDITOR && this.editor) {
        this.editor.handlePointerMove(coords.x, coords.y);
      } else {
        updateHover(coords);
      }
    });

    this.canvas.addEventListener('pointerdown', (e) => {
      const coords = getCanvasCoords(e);
      if (this.gameState === GAME_STATE.EDITOR && this.editor) {
        e.preventDefault();
        this.editor.handlePointerDown(coords.x, coords.y);
        return;
      }

      if (this.gameState !== GAME_STATE.PLAYING) return;
      e.preventDefault();
      SFX.init();

      if (this.selectedSkill === 'portal') {
        this.placePortal(coords.x, coords.y);
        return;
      }

      const targetUnit = updateHover(coords);
      if (targetUnit) {
        this.applySkill(targetUnit);
      }
    });

    this.canvas.addEventListener('pointerup', (e) => {
      if (this.gameState === GAME_STATE.EDITOR && this.editor) {
        const coords = getCanvasCoords(e);
        this.editor.handlePointerUp(coords.x, coords.y);
      }
    });
  }

  applySkill(unit) {
    if (!this.selectedSkill || this.skillCounts[this.selectedSkill] <= 0) return;
    this.applySkillToUnit(unit, this.selectedSkill);
  }

  applySkillToUnit(unit, skillKey) {
    if (unit.state === STATE.DEAD || unit.state === STATE.EXITING) return;

    const isFalling = (unit.state === STATE.FALLING || unit.state === STATE.FLOATING);
    let applied = false;
    let skillLabel = "";
    let skillColor = "#00f3ff";

    switch (skillKey) {
      case 'climb':
        if (!unit.hasMagnetizer) {
          unit.hasMagnetizer = true;
          applied = true;
          skillLabel = "+전자기 흡착 (등반 모드)";
          skillColor = "#ffb700";
        }
        break;

      case 'float':
        if (!unit.hasAntiGrav) {
          unit.hasAntiGrav = true;
          if (unit.state === STATE.FALLING) {
            unit.state = STATE.FLOATING;
            skillLabel = "+역추진 감쇄 가동";
          } else {
            skillLabel = "+역추진 감쇄 (낙하 시 자동 점화)";
          }
          applied = true;
          skillColor = "#00ff88";
        }
        break;

      case 'bash':
        if (isFalling) {
          this.particles.spawnFloatingText(unit.x, unit.y - 20, "공중 사용 불가", "#ff2255");
          return;
        }

        // Check if there is a wall directly in front right now (within 12px)
        let hasWallRightNow = false;
        let isSteelRightNow = false;
        for (let dist = 1; dist <= 12; dist += 2) {
          const checkX = unit.x + unit.dir * dist;
          for (let cy = -22; cy <= -2; cy += 4) {
            const checkY = unit.y + cy;
            if (this.terrain.isSolid(checkX, checkY)) {
              hasWallRightNow = true;
              if (this.terrain.isSteel(checkX, checkY)) {
                isSteelRightNow = true;
              }
              break;
            }
          }
          if (hasWallRightNow) break;
        }

        if (hasWallRightNow && isSteelRightNow) {
          this.particles.spawnFloatingText(unit.x, unit.y - 20, "강철 격벽 (절삭 불가)", "#ffaa00");
          return;
        }

        if (hasWallRightNow) {
          // Immediately start continuous piercing
          unit.state = STATE.PLASMA_CUTTING;
          unit.hasPlasmaCutter = false;
          unit.cutSteps = 0;
          unit.cutStartY = Math.round(unit.y);
          applied = true;
          skillLabel = "⚡ 플라즈마 레이저 즉시 절삭!";
          skillColor = "#00f3ff";
        } else {
          // Pre-reservation: unit equips laser, displays badge, keeps walking, and fires automatically upon touching any wall!
          unit.hasPlasmaCutter = true;
          applied = true;
          skillLabel = "⚡ 레이저 가공 예약 (벽 도달 시 자동 절삭)";
          skillColor = "#00f3ff";
        }
        break;

      case 'mine':
        if (isFalling) {
          this.particles.spawnFloatingText(unit.x, unit.y - 20, "공중 사용 불가", "#ff2255");
          return;
        }
        unit.state = STATE.DIAGONAL_MINING;
        unit.cutSteps = 0;
        applied = true;
        skillLabel = "⛏️ 대각선 연속 굴착 개시!";
        skillColor = "#f0a028";
        break;

      case 'drill':
        if (isFalling) {
          this.particles.spawnFloatingText(unit.x, unit.y - 20, "공중 사용 불가", "#ff2255");
          return;
        }
        unit.state = STATE.THERMAL_DRILLING;
        unit.cutSteps = 0;
        applied = true;
        skillLabel = "🔥 융해 드릴 가동 (바닥 수직 관통)";
        skillColor = "#ff6600";
        break;

      case 'bomb':
        if (unit.bombTimer <= 0) {
          unit.bombTimer = 300;
          applied = true;
          skillLabel = "+코어 오버로드";
          skillColor = "#ff2255";
        }
        break;

      case 'build':
        if (isFalling) {
          this.particles.spawnFloatingText(unit.x, unit.y - 20, "공중 사용 불가", "#ff2255");
          return;
        }
        unit.state = STATE.BUILDING_3D_PRINT;
        unit.stepCount = 0;
        unit.timer = 0;
        applied = true;
        skillLabel = "+3D 계단";
        skillColor = "#00f3ff";
        break;

      case 'block':
        if (isFalling) {
          this.particles.spawnFloatingText(unit.x, unit.y - 20, "공중 사용 불가", "#ff2255");
          return;
        }
        if (unit.state === STATE.BLOCKING_SHIELD) {
          unit.state = STATE.WALKING;
          applied = true;
          skillLabel = "방어막 해제";
          skillColor = "#00f3ff";
        } else {
          unit.state = STATE.BLOCKING_SHIELD;
          applied = true;
          skillLabel = "+위상 방어막 돔 (양방향 차단)";
          skillColor = "#00ff88";
        }
        break;
    }

    if (applied) {
      if (this.skillCounts[skillKey] > 0) {
        this.skillCounts[skillKey]--;
      }
      this.updateSkillUI();
      SFX.playClick();
      if (navigator.vibrate) navigator.vibrate(20);
      this.particles.spawnBurst(unit.x, unit.y - 10, skillColor, 16, 2.5);
      this.particles.spawnFloatingText(unit.x, unit.y - 22, skillLabel, skillColor);
    }
  }

  placePortal(x, y) {
    if (this.skillCounts.portal <= 0) return;
    
    if (!this.portalPair.entry) {
      let checkY = y;
      while (this.terrain.isSolid(x, checkY) && checkY > 20) {
        checkY--;
      }
      
      this.portalPair.entry = { x, y: checkY };
      SFX.playTeleport();
      this.particles.spawnBurst(x, checkY, '#00f3ff', 24, 3.5);
      this.particles.spawnFloatingText(x, checkY - 24, "포탈 A (진입구)", '#00f3ff');
    } else if (!this.portalPair.exit) {
      const dx = x - this.portalPair.entry.x;
      const dy = y - this.portalPair.entry.y;
      const dist = Math.hypot(dx, dy);

      let finalX = x;
      let finalY = y;
      if (dist > MAX_PORTAL_RANGE) {
        const angle = Math.atan2(dy, dx);
        finalX = this.portalPair.entry.x + Math.cos(angle) * MAX_PORTAL_RANGE;
        finalY = this.portalPair.entry.y + Math.sin(angle) * MAX_PORTAL_RANGE;
      }

      let adjustedY = finalY;
      while (this.terrain.isSolid(finalX, adjustedY) && adjustedY > 20) {
        adjustedY--;
      }

      if (this.terrain.isSolid(finalX, adjustedY)) {
        this.particles.spawnFloatingText(finalX, finalY - 24, "벽 내부 설치 불가!", '#ff2255');
        return;
      }

      this.portalPair.exit = { x: finalX, y: adjustedY };
      this.skillCounts.portal--;
      this.updateSkillUI();
      SFX.playTeleport();
      this.particles.spawnBurst(finalX, adjustedY, '#bf00ff', 24, 3.5);
      this.particles.spawnFloatingText(finalX, adjustedY - 24, "포탈 B (출구)", '#bf00ff');
    }
  }

  updateSimulation() {
    if (this.gameState !== GAME_STATE.PLAYING || this.gameSpeed === 0) return;
    const currentLvl = this.isCustomPlay ? this.activeCustomData : LEVELS[this.currentLevelIdx];
    if (!currentLvl) return;

    // AI Auto Solver Update (autonomous skill application)
    if (this.autoSolver.isActive) {
      this.autoSolver.update();
    }

    const spX = (typeof currentLvl.spawnX === 'number' && !isNaN(currentLvl.spawnX)) ? currentLvl.spawnX : 90;
    const spY = (typeof currentLvl.spawnY === 'number' && !isNaN(currentLvl.spawnY)) ? currentLvl.spawnY : 60;
    const gtX = (typeof currentLvl.gateX === 'number' && !isNaN(currentLvl.gateX)) ? currentLvl.gateX : 710;
    const gtY = (typeof currentLvl.gateY === 'number' && !isNaN(currentLvl.gateY)) ? currentLvl.gateY : 254;

    if (this.spawnedCount < currentLvl.totalUnits && !this.isNuking) {
      this.spawnTimer += 1;
      const spawnInterval = currentLvl.spawnRate || 20;
      if (this.spawnTimer >= spawnInterval * 6) {
        this.spawnTimer = 0;
        this.spawnedCount++;
        const unit = new NanoUnit(this.spawnedCount, spX, spY, 1);
        this.units.push(unit);
        this.particles.spawnBurst(spX, spY, '#00f3ff', 8, 1.5);
      }
    }

    const exitGate = { x: gtX, y: gtY };
    let activeUnits = 0;
    let newlyRescued = 0;

    for (const u of this.units) {
      const prevState = u.state;
      u.update(this.terrain, this.particles, exitGate, this.portalPair, this.units, 1.0);

      if (u.state === STATE.EXITING && prevState !== STATE.EXITING) {
        newlyRescued++;
      }
      if (u.state !== STATE.DEAD && u.state !== STATE.EXITING) {
        activeUnits++;
      }
    }

    if (newlyRescued > 0) {
      this.rescuedCount += newlyRescued;
      this.particles.spawnFloatingText(currentLvl.gateX, currentLvl.gateY - 28, `+1,000 pt (구출 ${this.rescuedCount})`, '#00ff88');
    }

    this.particles.update();

    this.secondCounter += 1;
    if (this.secondCounter >= 60) {
      this.secondCounter = 0;
      if (this.timeRemaining > 0) this.timeRemaining--;
    }

    const liveRescueScore = this.rescuedCount * 1000;
    const liveTimeBonus = Math.max(0, this.timeRemaining * 10);
    this.currentLiveScore = liveRescueScore + liveTimeBonus;

    this.updateHUD();

    const needUnits = Math.ceil(currentLvl.totalUnits * currentLvl.needPercent / 100);
    if (this.gameState === GAME_STATE.PLAYING) {
      if (this.rescuedCount >= needUnits && activeUnits === 0 && this.spawnedCount >= currentLvl.totalUnits) {
        this.gameState = GAME_STATE.ENDED;
        this.evaluateLevelEnd();
      } else if (this.spawnedCount >= currentLvl.totalUnits && activeUnits === 0) {
        this.gameState = GAME_STATE.ENDED;
        this.evaluateLevelEnd();
      } else if (this.timeRemaining <= 0) {
        this.gameState = GAME_STATE.ENDED;
        this.evaluateLevelEnd();
      }
    }
  }

  evaluateLevelEnd() {
    this.autoSolver.stop();
    const currentLvl = this.isCustomPlay ? this.activeCustomData : LEVELS[this.currentLevelIdx];
    const rescuedPct = Math.round((this.rescuedCount / currentLvl.totalUnits) * 100);
    const modal = document.getElementById('modal-end');
    if (modal) modal.style.display = 'flex';

    const rescueScore = this.rescuedCount * 1000;
    const isPerfect = (this.rescuedCount === currentLvl.totalUnits && this.rescuedCount > 0);
    const perfectBonus = isPerfect ? 5000 : 0;
    const timeBonus = Math.max(0, this.timeRemaining * 50);
    const remainingSkills = Object.values(this.skillCounts).reduce((a, b) => a + b, 0);
    const skillBonus = remainingSkills * 200;

    const totalScore = rescueScore + perfectBonus + timeBonus + skillBonus;

    setSafeText('score-rescue-val', `+${rescueScore.toLocaleString()} pt (${this.rescuedCount}/${currentLvl.totalUnits})`);
    setSafeText('score-time-val', `+${timeBonus.toLocaleString()} pt (${this.timeRemaining}s)`);
    setSafeText('score-skill-val', `+${skillBonus.toLocaleString()} pt (${remainingSkills}개 잔여)`);
    setSafeText('score-perfect-val', isPerfect ? `+${perfectBonus.toLocaleString()} pt (PERFECT!)` : `0 pt`);
    setSafeText('end-total-score-num', `${totalScore.toLocaleString()} pt`);

    const prevBest = parseInt(localStorage.getItem(`nano_terra_level_${currentLvl.id}_best`) || '0', 10);
    const isNewRecord = totalScore > prevBest;
    if (isNewRecord) {
      localStorage.setItem(`nano_terra_level_${currentLvl.id}_best`, totalScore.toString());
    }
    const noticeEl = document.getElementById('end-high-score-notice');
    if (noticeEl) {
      noticeEl.innerText = isNewRecord ? "🎉 최고 기록 갱신 (NEW RECORD!)" : `최고 점수: ${prevBest.toLocaleString()} pt`;
      noticeEl.style.color = isNewRecord ? "var(--neon-gold)" : "var(--text-dim)";
    }

    const isCleared = (rescuedPct >= currentLvl.needPercent);
    let starCount = 0;
    let rank = 'C';
    let rankTitle = 'MISSION FAILED';
    let rankClass = 'rank-C';

    if (isCleared) {
      if (rescuedPct === 100 || (rescuedPct >= 90 && timeBonus >= 2000)) {
        starCount = 3;
        rank = 'S';
        rankTitle = 'MASTER OPERATOR (완벽 통제)';
        rankClass = 'rank-S';
      } else if (rescuedPct >= 85 || totalScore >= 16000) {
        starCount = 2;
        rank = 'A';
        rankTitle = 'ELITE COMMANDER (우수 지휘)';
        rankClass = 'rank-A';
      } else {
        starCount = 1;
        rank = 'B';
        rankTitle = 'TACTICAL SURVIVOR (기본 임무 완수)';
        rankClass = 'rank-B';
      }
      localStorage.setItem(`nano_terra_level_${currentLvl.id}_rank`, rank);
      SFX.playVictory();
    } else {
      starCount = 0;
      rank = 'F';
      rankTitle = 'CRITICAL FAILURE (탈출 실패)';
      SFX.playDefeat();
    }

    for (let s = 1; s <= 3; s++) {
      const starEl = document.getElementById(`star-${s}`);
      if (starEl) {
        if (s <= starCount) {
          setTimeout(() => {
            starEl.classList.add('active');
            SFX.playClick();
          }, s * 250);
        } else {
          starEl.classList.remove('active');
        }
      }
    }

    const rankBadge = document.getElementById('end-rank-badge');
    if (rankBadge) {
      rankBadge.innerText = `RANK ${rank}`;
      rankBadge.className = `rank-badge ${rankClass}`;
    }
    setSafeText('end-rank-title', rankTitle);

    const title = document.getElementById('end-title');
    const desc = document.getElementById('end-desc');
    const nextBtn = document.getElementById('btn-next-mission');
    const banner = document.getElementById('end-score-banner');

    if (isCleared) {
      if (title) {
        title.innerText = this.isCustomPlay 
          ? `작전 성공: [CUSTOM] ${currentLvl.title}`
          : `작전 성공: ${this.currentLevelIdx + 1}구역 (${currentLvl.title})`;
        title.style.color = "var(--neon-cyan)";
      }
      if (desc) desc.innerText = `목표치(${currentLvl.needPercent}%)를 초과하여 나노봇 군단을 성공적으로 구출했습니다!`;
      if (banner) banner.style.display = 'flex';
      if (nextBtn) {
        nextBtn.style.display = 'block';
        if (this.isCustomPlay) {
          nextBtn.innerText = "다음 커스텀 맵 (NEXT)";
        } else if (this.currentLevelIdx >= LEVELS.length - 1) {
          nextBtn.innerText = "🎉 1구역으로 재도전 (LOOP)";
        } else {
          nextBtn.innerText = `다음 구역 (${this.currentLevelIdx + 2}구역)`;
        }
      }
    } else {
      if (title) {
        title.innerText = this.isCustomPlay
          ? `작전 실패: [CUSTOM] ${currentLvl.title}`
          : `작전 실패: ${this.currentLevelIdx + 1}구역 (${currentLvl.title})`;
        title.style.color = "var(--neon-red)";
      }
      if (desc) desc.innerText = `구출률 부족 (${rescuedPct}% / 목표 ${currentLvl.needPercent}%). 전략을 재정비하십시오!`;
      if (nextBtn) nextBtn.style.display = 'none';
    }
  }

  updateHUD() {
    const currentLvl = this.isCustomPlay ? this.activeCustomData : LEVELS[this.currentLevelIdx];
    if (!currentLvl) return;
    const pct = Math.round((this.rescuedCount / currentLvl.totalUnits) * 100);
    setSafeText('hud-rescued-num', this.rescuedCount);
    setSafeHTML('hud-rescued-count', `<span class="highlight">${this.rescuedCount}</span> / ${Math.ceil(currentLvl.totalUnits * currentLvl.needPercent / 100)} (${pct}%)`);
    setSafeText('hud-active-count', `${this.units.filter(u => u.state !== STATE.DEAD && u.state !== STATE.EXITING).length} / ${currentLvl.totalUnits}`);
    
    const m = Math.floor(this.timeRemaining / 60).toString().padStart(2, '0');
    const s = (this.timeRemaining % 60).toString().padStart(2, '0');
    setSafeText('hud-time-left', `${m}:${s}`);
    setSafeText('hud-score', `${this.currentLiveScore.toLocaleString()}`);
  }

  render() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    if (this.bgImg.complete && this.bgImg.naturalWidth > 0) {
      this.ctx.drawImage(this.bgImg, 0, 0, this.canvas.width, this.canvas.height);
      this.ctx.fillStyle = 'rgba(5, 8, 20, 0.22)';
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    } else {
      this.ctx.fillStyle = '#060913';
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }

    this.ctx.drawImage(this.terrain.canvas, 0, 0);

    if (this.gameState === GAME_STATE.EDITOR && this.editor) {
      this.editor.render(this.ctx);
      return;
    }

    const currentLvl = this.isCustomPlay ? this.activeCustomData : LEVELS[this.currentLevelIdx];
    if (!currentLvl) return;

    const spX = (typeof currentLvl.spawnX === 'number' && !isNaN(currentLvl.spawnX)) ? currentLvl.spawnX : 90;
    const spY = (typeof currentLvl.spawnY === 'number' && !isNaN(currentLvl.spawnY)) ? currentLvl.spawnY : 60;
    const gtX = (typeof currentLvl.gateX === 'number' && !isNaN(currentLvl.gateX)) ? currentLvl.gateX : 710;
    const gtY = (typeof currentLvl.gateY === 'number' && !isNaN(currentLvl.gateY)) ? currentLvl.gateY : 254;

    // Spawn Hatch
    if (this.hatchImg.complete && this.hatchImg.naturalWidth > 0) {
      this.ctx.drawImage(this.hatchImg, spX - 24, spY - 34, 48, 48);
    } else {
      this.ctx.fillStyle = '#ffaa00';
      this.ctx.fillRect(spX - 16, spY - 20, 32, 20);
    }

    // High-Definition Animated Rotating Wormhole Extraction Gate
    const time = performance.now() * 0.003;
    this.ctx.save();
    this.ctx.translate(gtX, gtY);

    this.ctx.save();
    this.ctx.rotate(time * 0.8);
    this.ctx.strokeStyle = 'rgba(191, 0, 255, 0.4)';
    this.ctx.lineWidth = 3;
    this.ctx.setLineDash([8, 6]);
    this.ctx.beginPath();
    this.ctx.arc(0, 0, 26, 0, Math.PI * 2);
    this.ctx.stroke();
    this.ctx.restore();

    this.ctx.save();
    this.ctx.rotate(-time * 1.5);
    for (let i = 0; i < 4; i++) {
      this.ctx.strokeStyle = (i % 2 === 0) ? '#bf00ff' : '#00f3ff';
      this.ctx.lineWidth = 2.5;
      this.ctx.shadowColor = (i % 2 === 0) ? '#bf00ff' : '#00f3ff';
      this.ctx.shadowBlur = 12;
      this.ctx.beginPath();
      this.ctx.ellipse(0, 0, 20 - i * 3, 12 - i * 2, (i * Math.PI) / 4, 0, Math.PI * 2);
      this.ctx.stroke();
    }
    this.ctx.restore();

    const coreScale = 1.0 + Math.sin(time * 3) * 0.2;
    this.ctx.fillStyle = '#ffffff';
    this.ctx.shadowColor = '#00f3ff';
    this.ctx.shadowBlur = 14;
    this.ctx.beginPath();
    this.ctx.arc(0, 0, 6 * coreScale, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.restore();

    if (this.portalPair.entry) {
      const px = this.portalPair.entry.x;
      const py = this.portalPair.entry.y;
      
      if (!this.portalPair.exit) {
        this.ctx.save();
        this.ctx.strokeStyle = 'rgba(0, 243, 255, 0.5)';
        this.ctx.lineWidth = 1.5;
        this.ctx.setLineDash([8, 6]);
        this.ctx.beginPath();
        this.ctx.arc(px, py, MAX_PORTAL_RANGE, 0, Math.PI * 2);
        this.ctx.stroke();

        this.ctx.font = 'bold 10px Orbitron, sans-serif';
        this.ctx.fillStyle = '#00f3ff';
        this.ctx.textAlign = 'center';
        this.ctx.fillText("최대 연결 사거리 (160px)", px, py - MAX_PORTAL_RANGE - 6);
        this.ctx.restore();

        if (this.selectedSkill === 'portal' && this.mousePos) {
          const dx = this.mousePos.x - px;
          const dy = this.mousePos.y - py;
          const curDist = Math.hypot(dx, dy);
          const isOverRange = curDist > MAX_PORTAL_RANGE;

          let aimX = this.mousePos.x;
          let aimY = this.mousePos.y;
          if (isOverRange) {
            const angle = Math.atan2(dy, dx);
            aimX = px + Math.cos(angle) * MAX_PORTAL_RANGE;
            aimY = py + Math.sin(angle) * MAX_PORTAL_RANGE;
          }

          this.ctx.save();
          this.ctx.strokeStyle = isOverRange ? '#ffaa00' : '#00ff88';
          this.ctx.lineWidth = 1.2;
          this.ctx.setLineDash([4, 4]);
          this.ctx.beginPath();
          this.ctx.moveTo(px, py);
          this.ctx.lineTo(aimX, aimY);
          this.ctx.stroke();

          this.ctx.beginPath();
          this.ctx.arc(aimX, aimY, 14, 0, Math.PI * 2);
          this.ctx.stroke();
          this.ctx.restore();
        }
      }

      this.ctx.save();
      this.ctx.translate(px, py);
      this.ctx.rotate(time);
      this.ctx.strokeStyle = '#00f3ff';
      this.ctx.lineWidth = 3;
      this.ctx.shadowColor = '#00f3ff';
      this.ctx.shadowBlur = 14;
      this.ctx.beginPath();
      this.ctx.ellipse(0, 0, 18, 11, 0, 0, Math.PI * 2);
      this.ctx.stroke();
      this.ctx.restore();

      this.ctx.fillStyle = '#00f3ff';
      this.ctx.font = 'bold 10px Orbitron, sans-serif';
      this.ctx.textAlign = 'center';
      this.ctx.fillText("PORTAL A", px, py - 20);
    }

    if (this.portalPair.exit) {
      const px = this.portalPair.exit.x;
      const py = this.portalPair.exit.y;
      this.ctx.save();
      this.ctx.translate(px, py);
      this.ctx.rotate(-time);
      this.ctx.strokeStyle = '#bf00ff';
      this.ctx.lineWidth = 3;
      this.ctx.shadowColor = '#bf00ff';
      this.ctx.shadowBlur = 14;
      this.ctx.beginPath();
      this.ctx.ellipse(0, 0, 18, 11, 0, 0, Math.PI * 2);
      this.ctx.stroke();
      this.ctx.restore();

      this.ctx.fillStyle = '#bf00ff';
      this.ctx.font = 'bold 10px Orbitron, sans-serif';
      this.ctx.textAlign = 'center';
      this.ctx.fillText("PORTAL B", px, py - 20);
    }

    if (this.portalPair.entry && this.portalPair.exit) {
      this.ctx.save();
      this.ctx.strokeStyle = 'rgba(0, 243, 255, 0.45)';
      this.ctx.lineWidth = 1.5;
      this.ctx.setLineDash([4, 4]);
      this.ctx.beginPath();
      this.ctx.moveTo(this.portalPair.entry.x, this.portalPair.entry.y);
      this.ctx.lineTo(this.portalPair.exit.x, this.portalPair.exit.y);
      this.ctx.stroke();
      this.ctx.restore();
    }

    for (const u of this.units) {
      const isHovered = (this.hoveredUnit && this.hoveredUnit.id === u.id);
      u.render(this.ctx, this.actionSheetImg, isHovered);
    }

    this.particles.render(this.ctx);

    if (this.gameState === GAME_STATE.COUNTDOWN) {
      const elapsed = performance.now() - this.countdownStart;
      const remainingMs = Math.max(0, this.countdownTotalMs - elapsed);
      const currentSec = Math.ceil(remainingMs / 1000);
      const phaseInSec = (remainingMs % 1000) / 1000;
      const scale = 1.0 + phaseInSec * 0.35;
      const alpha = Math.min(1.0, phaseInSec * 1.8);

      this.ctx.save();
      this.ctx.translate(this.canvas.width / 2, this.canvas.height / 2 - 10);
      this.ctx.scale(scale, scale);
      this.ctx.font = '900 76px Orbitron, sans-serif';
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      this.ctx.fillStyle = '#00f3ff';
      this.ctx.shadowColor = '#00f3ff';
      this.ctx.shadowBlur = 28;
      this.ctx.globalAlpha = alpha;
      this.ctx.fillText(currentSec > 0 ? currentSec.toString() : "GO!", 0, 0);
      
      this.ctx.font = '700 16px Orbitron, sans-serif';
      this.ctx.fillStyle = '#ffffff';
      this.ctx.shadowBlur = 10;
      const subtitle = currentSec === 3 ? "GET READY..." : (currentSec === 2 ? "PLAN YOUR ROUTE" : "MISSION START!");
      this.ctx.fillText(subtitle, 0, 56);
      this.ctx.restore();
    }
  }

  gameLoop(timestamp) {
    if (this.gameState === GAME_STATE.COUNTDOWN) {
      const elapsed = performance.now() - this.countdownStart;
      const remainingMs = Math.max(0, this.countdownTotalMs - elapsed);
      const currentSec = Math.ceil(remainingMs / 1000);

      if (currentSec > 0 && currentSec !== this.lastPlayedBeepSec) {
        this.lastPlayedBeepSec = currentSec;
        SFX.playTone(520, 'sine', 0.08, 0.12);
      }

      if (remainingMs <= 0) {
        this.gameState = GAME_STATE.PLAYING;
        SFX.playTone(880, 'sine', 0.25, 0.2);
      }
      this.particles.update();
    } else if (this.gameState === GAME_STATE.PLAYING) {
      const ticks = this.gameSpeed;
      for (let i = 0; i < ticks; i++) {
        this.updateSimulation();
      }
    }

    this.render();
    requestAnimationFrame((t) => this.gameLoop(t));
  }
}
