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

// ============================================================================
// --- Online Leaderboard Configuration (Google Apps Script Web App) ---
// 배포된 Google Apps Script 웹 앱 URL을 아래 상수에 입력하세요.
// 빈 문자열('')이면 점수 전송 및 온라인 랭킹 조회를 건너뜁니다.
// ============================================================================
const SCORE_API_URL = 'https://script.google.com/macros/s/AKfycbxKowLWjmnzYv5c-VN824EIPRO9bFntW2powWUB_DrEiFAkFQg0TRJNz-pcXhNKbxwyog/exec';
const SCORE_TOKEN = 'nano_terra_secret_token_2026';

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// --- Main Game Controller ---
class GameEngine {
  constructor() {
    this.canvas = document.getElementById('game-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.terrain = new TerrainEngine(800, 450);
    this.particles = new ParticleSystem();

    this.bgImg = new Image();
    this.bgImg.onload = () => {
      const ambientEl = document.getElementById('ambient-backdrop');
      if (ambientEl && this.bgImg.src) {
        ambientEl.style.backgroundImage = `url("${this.bgImg.src}")`;
      }
    };
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
    this.movingPlatforms = [];
    this.jumpPads = [];
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
    const ambientEl = document.getElementById('ambient-backdrop');
    if (ambientEl) ambientEl.style.backgroundImage = `url("${this.bgImg.src}")`;
    if (this.wallTextureImg.complete) {
      this.terrain.setPattern(this.wallTextureImg);
    }
    StageDataEngine.buildTerrainFromData(this.terrain, this.activeCustomData);
    this.initMovingPlatforms(this.activeCustomData);

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
    const ambientEl = document.getElementById('ambient-backdrop');
    if (ambientEl) ambientEl.style.backgroundImage = `url("${this.bgImg.src}")`;
    if (this.wallTextureImg.complete) {
      this.terrain.setPattern(this.wallTextureImg);
    }
    StageDataEngine.buildTerrainFromData(this.terrain, lvl);
    this.initMovingPlatforms(lvl);

    this.units = [];
    this.spawnTimer = 999; // Trigger first unit spawn immediately on start!
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
    this.updateNicknameDisplay(localStorage.getItem('nano_terra_nickname') || '');

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

  initMovingPlatforms(levelData) {
    this.movingPlatforms = [];
    this.jumpPads = [];
    if (!levelData || !levelData.elements) return;
    for (const el of levelData.elements) {
      if (el.type === 'movingPlatform' && typeof MovingPlatform !== 'undefined') {
        this.movingPlatforms.push(new MovingPlatform(el));
      } else if (el.type === 'jumpPad' && typeof JumpPad !== 'undefined') {
        this.jumpPads.push(new JumpPad(el));
      }
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
      'modal-solution-guide', 'modal-editor-props', 'modal-editor-generate',
      'modal-nickname', 'modal-ranking'
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
    bindBtn('btn-speed-05', () => { SFX.playClick(); this.setSpeed(0.5); });
    bindBtn('btn-speed-1', () => { SFX.playClick(); this.setSpeed(1); });
    bindBtn('btn-speed-2', () => { SFX.playClick(); this.setSpeed(2); });

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

    bindBtn('btn-hud-ai-gen', () => {
      this.enterEditor();
      if (this.editor) this.editor.openGenerateModal();
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

    bindBtn('btn-change-nickname', () => {
      this.openNicknameModal();
    });

    bindBtn('btn-nickname-save', () => {
      this.saveNicknameFromInput();
    });

    bindBtn('btn-nickname-skip', () => {
      this.closeNicknameModal();
    });

    bindBtn('btn-start-open-ranking', () => {
      this.openRankingModal();
    });

    bindBtn('btn-ranking-close', () => {
      this.closeRankingModal();
    });

    bindBtn('btn-ranking-bottom-close', () => {
      this.closeRankingModal();
    });

    bindBtn('btn-ranking-refresh', () => {
      const sel = document.getElementById('ranking-stage-select');
      this.openRankingModal(sel ? sel.value : null);
    });

    const rankStageSel = document.getElementById('ranking-stage-select');
    if (rankStageSel) {
      rankStageSel.addEventListener('change', () => {
        this.renderSelectedStageRanking();
      });
    }

    const inputNick = document.getElementById('input-nickname');
    if (inputNick) {
      inputNick.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          this.saveNicknameFromInput();
        }
      });
    }

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
          u.stopSounds();
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

    const isFullscreenActive = () => {
      return !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement);
    };

    const updateFullscreenBtnState = () => {
      const active = isFullscreenActive();
      const fsBtn = document.getElementById('btn-fullscreen');
      if (fsBtn) {
        fsBtn.innerHTML = active ? '🗗 창모드' : '⛶ 전체화면';
        if (active) fsBtn.classList.add('active');
        else fsBtn.classList.remove('active');
      }
      const floatBtn = document.getElementById('btn-floating-fs');
      if (floatBtn) {
        floatBtn.innerHTML = active ? '🗗' : '⛶';
        floatBtn.title = active ? '창모드로 복귀' : '전체화면으로 확장';
      }
    };

    const requestFullscreenMode = async () => {
      const docEl = document.documentElement;
      const rfs = docEl.requestFullscreen ||
        docEl.webkitRequestFullscreen ||
        docEl.mozRequestFullScreen ||
        docEl.msRequestFullscreen;
      if (rfs) {
        try {
          if (docEl.requestFullscreen) {
            await docEl.requestFullscreen({ navigationUI: 'hide' });
          } else {
            await rfs.call(docEl);
          }
        } catch (fsErr) {
          try {
            if (rfs) await rfs.call(docEl);
          } catch (fsErr2) { }
        }
      }
      if (screen.orientation && screen.orientation.lock) {
        try {
          await screen.orientation.lock('landscape');
        } catch (oErr) {
          try {
            await screen.orientation.lock('landscape-primary');
          } catch (oErr2) { }
        }
      }
    };

    const exitFullscreenMode = () => {
      const efs = document.exitFullscreen || document.webkitExitFullscreen || document.mozCancelFullScreen || document.msExitFullscreen;
      if (efs) {
        efs.call(document).catch(() => { });
      }
    };

    const toggleFullscreenMode = async () => {
      if (isFullscreenActive()) {
        exitFullscreenMode();
      } else {
        await requestFullscreenMode();
      }
    };

    const bindFullscreenBtn = (id, fn) => {
      const btn = document.getElementById(id);
      if (!btn) return;
      btn.addEventListener('click', async (e) => {
        SFX.init();
        SFX.playClick();
        await fn(e);
      });
    };

    bindFullscreenBtn('btn-fullscreen', () => toggleFullscreenMode());
    bindFullscreenBtn('btn-floating-fs', () => toggleFullscreenMode());
    bindFullscreenBtn('btn-rotate-fullscreen', () => requestFullscreenMode());

    const rotateOverlay = document.getElementById('rotate-overlay');
    if (rotateOverlay) {
      rotateOverlay.addEventListener('click', async () => {
        await requestFullscreenMode();
      });
    }

    ['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange', 'MSFullscreenChange'].forEach(evt => {
      document.addEventListener(evt, updateFullscreenBtnState);
    });

    bindFullscreenBtn('btn-start-fullscreen', async () => {
      await requestFullscreenMode();
      this.startMissionWithCountdown();
    });

    bindFullscreenBtn('btn-start-mission', async () => {
      // Auto-request fullscreen on mobile devices or small touch screens
      const isMobile = ('ontouchstart' in window) ||
        (navigator.maxTouchPoints > 0) ||
        /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
        (window.innerWidth < 1100);
      if (isMobile && !isFullscreenActive()) {
        await requestFullscreenMode();
      }
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

    bindBtn('btn-end-save-map', () => {
      const modalEnd = document.getElementById('modal-end');
      if (modalEnd) modalEnd.style.display = 'none';
      const curLvl = this.isCustomPlay ? this.activeCustomData : LEVELS[this.currentLevelIdx];
      if (curLvl && this.stageMgr) {
        this.stageMgr.openSaveSlotModal(curLvl, 'add_new');
      }
    });

    bindBtn('btn-end-return-editor', () => {
      const modalEnd = document.getElementById('modal-end');
      if (modalEnd) modalEnd.style.display = 'none';
      this.enterEditor();
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
        if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
        if (this.gameState === GAME_STATE.EDITOR && this.editor) {
          this.editor.executeGenerate(true);
        } else if (this.gameState === GAME_STATE.PLAYING) {
          this.restartLevelDirectly();
        }
      } else if (e.key === 'z' && (e.ctrlKey || e.metaKey)) {
        if (this.gameState === GAME_STATE.EDITOR && this.editor) {
          this.editor.undo();
        }
      } else if (this.gameState === GAME_STATE.EDITOR && this.editor) {
        if (e.key === 'Delete' || e.key === 'Backspace') {
          if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
          e.preventDefault();
          this.editor.deleteSelectedElement();
        } else if (e.key === 'ArrowUp' || e.key === ']') {
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

    this.initNicknameUI();
  }

  // ==========================================================================
  // --- Online Leaderboard & Nickname Management ---
  // ==========================================================================

  initNicknameUI() {
    const savedNick = (localStorage.getItem('nano_terra_nickname') || '').trim();
    this.updateNicknameDisplay(savedNick);

    // 첫 실행 시 닉네임 입력받는 작은 UI 표시 (미등록 상태인 경우)
    if (!savedNick) {
      setTimeout(() => {
        this.openNicknameModal();
      }, 500);
    }
  }

  updateNicknameDisplay(nick) {
    const el = document.getElementById('start-commander-name');
    if (el) {
      el.innerText = nick ? nick : '미등록 (설정 필요)';
      el.style.color = nick ? 'var(--neon-cyan)' : 'var(--text-dim)';
    }
  }

  openNicknameModal() {
    const modal = document.getElementById('modal-nickname');
    const input = document.getElementById('input-nickname');
    if (!modal) return;
    const currentNick = (localStorage.getItem('nano_terra_nickname') || '').trim();
    if (input) {
      input.value = currentNick;
    }
    modal.style.display = 'flex';
    if (input) {
      setTimeout(() => input.focus(), 100);
    }
    if (typeof SFX !== 'undefined' && SFX.playClick) SFX.playClick();
  }

  closeNicknameModal() {
    const modal = document.getElementById('modal-nickname');
    if (modal) modal.style.display = 'none';
  }

  saveNicknameFromInput() {
    const input = document.getElementById('input-nickname');
    if (!input) return;
    const nick = input.value.trim();
    if (!nick) {
      alert('사령관 닉네임을 1자 이상 입력해주세요.');
      input.focus();
      return;
    }
    localStorage.setItem('nano_terra_nickname', nick);
    this.updateNicknameDisplay(nick);
    this.closeNicknameModal();
    if (typeof SFX !== 'undefined' && SFX.playClick) SFX.playClick();
    if (this.particles) {
      this.particles.spawnFloatingText(400, 200, `사령관 호출부호 등록: ${nick}`, '#00ff88');
    }
  }

  submitOnlineScore(scoreData) {
    try {
      const apiUrl = (typeof SCORE_API_URL !== 'undefined' ? SCORE_API_URL : window.SCORE_API_URL) || '';
      if (!apiUrl || !apiUrl.trim()) {
        return; // SCORE_API_URL이 빈 문자열이면 전송 건너뜀
      }

      const nickname = (localStorage.getItem('nano_terra_nickname') || '').trim();
      if (!nickname) {
        return; // 닉네임이 없으면 전송하지 않음
      }

      const token = (typeof SCORE_TOKEN !== 'undefined' ? SCORE_TOKEN : window.SCORE_TOKEN) || 'nano_terra_secret_token_2026';
      const payload = {
        token: token,
        nickname: nickname,
        stageId: scoreData.stageId,
        stageName: scoreData.stageName,
        score: Number(scoreData.score) || 0,
        rank: scoreData.rank || '-',
        clearedAt: scoreData.clearedAt || new Date().toISOString()
      };

      fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain'
        },
        body: JSON.stringify(payload)
      }).then(res => res.json()).then(resJson => {
        console.log('[nano_Terra] Leaderboard score recorded:', resJson);
      }).catch(err => {
        // 전송 실패는 조용히 무시 (게임 흐름 절대 차단 금지)
        console.warn('[nano_Terra] Leaderboard score submission skipped/failed:', err && err.message);
      });
    } catch (err) {
      // 조용히 무시
    }
  }

  async openRankingModal(initialStageId = null) {
    const modal = document.getElementById('modal-ranking');
    if (!modal) return;
    modal.style.display = 'flex';
    if (typeof SFX !== 'undefined' && SFX.playClick) SFX.playClick();

    // 1. 구역 선택 드롭다운 채우기
    const selectEl = document.getElementById('ranking-stage-select');
    if (selectEl) {
      selectEl.innerHTML = '';
      const stages = (typeof LEVELS !== 'undefined' && LEVELS.length > 0) ? LEVELS : [];
      stages.forEach((lvl, idx) => {
        const sid = lvl.id != null ? lvl.id : (idx + 1);
        const opt = document.createElement('option');
        opt.value = String(sid);
        opt.innerText = `${idx + 1}구역: ${lvl.title || 'STAGE ' + (idx + 1)}`;
        selectEl.appendChild(opt);
      });

      if (initialStageId != null) {
        selectEl.value = String(initialStageId);
      } else if (this.currentLevelIdx != null && stages[this.currentLevelIdx]) {
        const curSid = stages[this.currentLevelIdx].id != null ? stages[this.currentLevelIdx].id : (this.currentLevelIdx + 1);
        selectEl.value = String(curSid);
      }
    }

    // 2. 랭킹 데이터 불러오기
    const contentArea = document.getElementById('ranking-content-area');
    const apiUrl = (typeof SCORE_API_URL !== 'undefined' ? SCORE_API_URL : window.SCORE_API_URL) || '';

    if (!apiUrl || !apiUrl.trim()) {
      if (contentArea) {
        contentArea.innerHTML = `
          <div style="padding: 32px 16px; text-align: center; color: var(--text-dim); line-height: 1.6;">
            <div style="font-size: 26px; margin-bottom: 8px;">⚙️</div>
            <div style="color: var(--neon-gold); font-size: 13px; font-weight: bold; margin-bottom: 6px;">온라인 랭킹 서버(SCORE_API_URL) 미설정</div>
            <div style="font-size: 11px;">Google Apps Script 웹 앱 배포 URL이 등록되면<br>전체 플레이어의 실시간 랭킹이 표시됩니다.</div>
          </div>
        `;
      }
      return;
    }

    if (contentArea) {
      contentArea.innerHTML = `
        <div style="padding: 36px 16px; text-align: center; color: var(--neon-cyan);">
          <div style="font-size: 22px; margin-bottom: 6px;">🛰️</div>
          <div style="font-size: 12px; font-family: 'Orbitron', sans-serif;">LEADERBOARD FETCHING...</div>
          <div style="font-size: 10px; color: var(--text-dim); margin-top: 4px;">구글 시트로부터 최신 랭킹 데이터를 수신하고 있습니다.</div>
        </div>
      `;
    }

    try {
      const res = await fetch(apiUrl, { method: 'GET' });
      if (!res.ok) {
        throw new Error('HTTP Status: ' + res.status);
      }
      const data = await res.json();
      if (!Array.isArray(data)) {
        throw new Error('Response is not an array');
      }

      this.cachedRankingRecords = data;
      this.renderSelectedStageRanking();

    } catch (err) {
      console.warn('[nano_Terra] Leaderboard fetch error:', err);
      if (contentArea) {
        contentArea.innerHTML = `
          <div style="padding: 32px 16px; text-align: center; color: #ff4466;">
            <div style="font-size: 24px; margin-bottom: 6px;">⚠️</div>
            <div style="font-size: 13px; font-weight: bold;">랭킹을 불러올 수 없음</div>
            <div style="font-size: 10px; color: var(--text-dim); margin-top: 4px;">네트워크 연결 상태나 웹 앱 URL을 확인해주세요.</div>
          </div>
        `;
      }
    }
  }

  closeRankingModal() {
    const modal = document.getElementById('modal-ranking');
    if (modal) modal.style.display = 'none';
  }

  renderSelectedStageRanking() {
    const selectEl = document.getElementById('ranking-stage-select');
    const contentArea = document.getElementById('ranking-content-area');
    if (!selectEl || !contentArea) return;

    const selectedStageId = String(selectEl.value);
    const records = this.cachedRankingRecords || [];

    // Filter by stageId
    const stageRecords = records.filter(r => String(r.stageId) === selectedStageId);

    // 스테이지의 모든 클리어 기록 매핑 (재도전 기록 및 닉네임별 다중 Top10 랭크인 허용)
    const cleanRecords = stageRecords.map(r => ({
      nickname: (r.nickname || '익명').trim(),
      score: Number(r.score) || 0,
      rank: r.rank || '-',
      clearedAt: r.clearedAt || r.serverTime || ''
    }));

    // 정렬 원칙:
    // 1. 점수 내림차순 (높은 점수 우선)
    // 2. 동점일 경우: "먼저 1등이 된 사람부터 위부터 보여줌" (달성 일시 오름차순)
    cleanRecords.sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      const tA = new Date(a.clearedAt).getTime() || 0;
      const tB = new Date(b.clearedAt).getTime() || 0;
      return tA - tB;
    });

    const topList = cleanRecords.slice(0, 10);

    // 공동 순위 계산 (표준 경쟁 순위: 1등이 3명이면 1위, 1위, 1위 다음은 4위)
    let prevScore = null;
    let prevRank = 1;
    topList.forEach((entry, idx) => {
      let rankNum;
      if (idx === 0) {
        rankNum = 1;
      } else if (entry.score === prevScore) {
        rankNum = prevRank; // 공동 순위 유지
      } else {
        rankNum = idx + 1;  // 동점자 수만큼 건너뛴 순위 (예: 1등 3명이면 다음은 4위)
      }
      entry.rankNum = rankNum;
      prevScore = entry.score;
      prevRank = rankNum;
    });

    const myNickname = (localStorage.getItem('nano_terra_nickname') || '').trim();

    if (topList.length === 0) {
      contentArea.innerHTML = `
        <div style="padding: 32px 16px; text-align: center; color: var(--text-dim); line-height: 1.6;">
          <div style="font-size: 20px; margin-bottom: 6px;">🛸</div>
          <div style="font-size: 12px; color: #a0c0d8;">아직 등록된 랭킹 기록이 없습니다.</div>
          <div style="font-size: 10px; margin-top: 4px;">이 구역을 클리어하고 첫 번째 명예의 전당에 올라보세요!</div>
        </div>
      `;
      return;
    }

    let rowsHtml = '';
    topList.forEach((entry, idx) => {
      const rankNum = entry.rankNum;
      let medal = `${rankNum}위`;
      let rankRowClass = '';
      if (rankNum === 1) {
        medal = '🥇 1위';
        rankRowClass = 'ranking-row-gold';
      } else if (rankNum === 2) {
        medal = '🥈 2위';
        rankRowClass = 'ranking-row-silver';
      } else if (rankNum === 3) {
        medal = '🥉 3위';
        rankRowClass = 'ranking-row-bronze';
      }

      const isMe = myNickname && (entry.nickname === myNickname);
      const isMeClass = isMe ? ' ranking-row-me' : '';
      const meBadge = isMe ? ' <span style="background:var(--neon-cyan); color:#000; font-size:9px; padding:1px 4px; border-radius:3px; font-weight:bold;">ME</span>' : '';

      let dateStr = '-';
      if (entry.clearedAt) {
        try {
          const d = new Date(entry.clearedAt);
          if (!isNaN(d.getTime())) {
            const mm = (d.getMonth() + 1).toString().padStart(2, '0');
            const dd = d.getDate().toString().padStart(2, '0');
            const hh = d.getHours().toString().padStart(2, '0');
            const min = d.getMinutes().toString().padStart(2, '0');
            dateStr = `${mm}-${dd} ${hh}:${min}`;
          } else {
            dateStr = String(entry.clearedAt).substring(5, 16);
          }
        } catch (e) {
          dateStr = String(entry.clearedAt).substring(5, 16);
        }
      }

      rowsHtml += `
        <tr class="${rankRowClass}${isMeClass}">
          <td style="text-align: center; font-weight: bold; width: 62px;">${medal}</td>
          <td style="text-align: left; font-weight: 600; color: ${isMe ? 'var(--neon-cyan)' : '#fff'};">${escapeHtml(entry.nickname)}${meBadge}</td>
          <td style="text-align: right; font-family: 'Orbitron', sans-serif; color: var(--neon-gold); font-weight: bold;">${entry.score.toLocaleString()} pt</td>
          <td style="text-align: center; width: 50px;"><span class="rank-badge rank-${entry.rank}">${entry.rank}</span></td>
          <td style="text-align: center; font-size: 10px; color: var(--text-dim); width: 85px;">${dateStr}</td>
        </tr>
      `;
    });

    contentArea.innerHTML = `
      <table class="ranking-table">
        <thead>
          <tr>
            <th style="width: 62px; text-align: center;">순위</th>
            <th style="text-align: left;">사령관 (닉네임)</th>
            <th style="text-align: right;">점수</th>
            <th style="width: 50px; text-align: center;">랭크</th>
            <th style="width: 85px; text-align: center;">일시</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>
    `;
  }

  setSpeed(spd) {
    this.gameSpeed = spd;
    if (spd === 0) {
      SFX.stopAllContinuousBeams();
    }
    ['btn-pause', 'btn-speed-05', 'btn-speed-1', 'btn-speed-2'].forEach(id => {
      const btn = document.getElementById(id);
      if (btn) btn.classList.remove('active');
    });
    if (spd === 0) {
      const p = document.getElementById('btn-pause');
      if (p) p.classList.add('active');
    } else if (spd === 0.5) {
      const s05 = document.getElementById('btn-speed-05');
      if (s05) s05.classList.add('active');
    } else if (spd === 1) {
      const s1 = document.getElementById('btn-speed-1');
      if (s1) s1.classList.add('active');
    } else if (spd === 2) {
      const s2 = document.getElementById('btn-speed-2');
      if (s2) s2.classList.add('active');
    }
  }

  updateSkillUI() {
    const keys = ['climb', 'float', 'bash', 'mine', 'drill', 'bomb', 'build', 'block', 'portal'];
    let firstAvailable = null;
    keys.forEach(k => {
      const count = this.skillCounts[k] || 0;
      setSafeText(`count-${k}`, count);
      const card = document.getElementById(`card-${k}`);
      if (card) {
        if (count <= 0) {
          card.classList.add('empty');
        } else {
          card.classList.remove('empty');
          if (!firstAvailable) firstAvailable = k;
        }
      }
    });

    // If currently selected skill is empty or invalid, switch to first available skill
    if (!this.selectedSkill || !this.skillCounts[this.selectedSkill] || this.skillCounts[this.selectedSkill] <= 0) {
      if (firstAvailable) {
        this.selectedSkill = firstAvailable;
      }
    }

    // Synchronize 'selected' class across all skill cards
    keys.forEach(k => {
      const card = document.getElementById(`card-${k}`);
      if (card) {
        if (k === this.selectedSkill && this.skillCounts[k] > 0) {
          card.classList.add('selected');
        } else {
          card.classList.remove('selected');
        }
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

    const canvasWrap = document.getElementById('canvas-wrapper');
    if (canvasWrap) {
      canvasWrap.addEventListener('pointerdown', (e) => {
        if (e.target === this.canvas) return;
        if (this.gameState !== GAME_STATE.PLAYING) return;
        const rect = this.canvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        if (clientX === undefined || clientY === undefined) return;
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;
        const clampedX = Math.max(0, Math.min(this.canvas.width, (clientX - rect.left) * scaleX));
        const clampedY = Math.max(0, Math.min(this.canvas.height, (clientY - rect.top) * scaleY));
        const coords = { x: clampedX, y: clampedY };
        const targetUnit = updateHover(coords);
        if (targetUnit) {
          SFX.init();
          this.applySkill(targetUnit);
        }
      });
    }

    this.canvas.addEventListener('pointerup', (e) => {
      if (this.gameState === GAME_STATE.EDITOR && this.editor) {
        const coords = getCanvasCoords(e);
        this.editor.handlePointerUp(coords.x, coords.y);
      }
    });

    // Window-level pointerup and pointercancel fallback so dragging/resizing never gets stuck outside canvas
    const handleGlobalPointerUp = (e) => {
      if (this.gameState === GAME_STATE.EDITOR && this.editor) {
        const coords = getCanvasCoords(e);
        this.editor.handlePointerUp(coords.x, coords.y);
      }
    };
    window.addEventListener('pointerup', handleGlobalPointerUp);
    window.addEventListener('pointercancel', handleGlobalPointerUp);
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
          skillColor = "#ffb700";
        }
        break;

      case 'float':
        if (!unit.hasAntiGrav) {
          unit.hasAntiGrav = true;
          if (unit.state === STATE.FALLING) {
            unit.state = STATE.FLOATING;
          }
          applied = true;
          skillColor = "#00ff88";
        }
        break;

      case 'bash':
        if (isFalling) {
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
          return;
        }

        if (hasWallRightNow) {
          // Immediately start continuous piercing
          unit.stopSounds();
          unit.state = STATE.PLASMA_CUTTING;
          unit.hasPlasmaCutter = false;
          unit.cutSteps = 0;
          unit.cutStartY = Math.round(unit.y);
          applied = true;
          skillColor = "#00f3ff";
        } else {
          // Pre-reservation: unit equips laser, displays badge, keeps walking, and fires automatically upon touching any wall!
          unit.hasPlasmaCutter = true;
          applied = true;
          skillColor = "#00f3ff";
        }
        break;

      case 'mine':
        if (isFalling) {
          return;
        }
        // Check if diagonal path in front is steel
        const mineAheadX = unit.x + unit.dir * 6;
        const isSteelMine = this.terrain.isSteel(mineAheadX, unit.y + 2) ||
          this.terrain.isSteel(mineAheadX, unit.y - 4) ||
          this.terrain.isSteel(unit.x + unit.dir * 4, unit.y + 1) ||
          this.terrain.isSteel(unit.x, unit.y + 1);
        if (isSteelMine) {
          this.particles.spawnBurst(unit.x + unit.dir * 4, unit.y - 4, '#ffffff', 8, 2.5);
          this.particles.spawnBurst(unit.x + unit.dir * 4, unit.y - 4, '#ffb700', 10, 3.2);
          this.particles.spawnFloatingText(unit.x, unit.y - 16, '🛡️ STEEL!', '#ffb700');
          if (typeof SFX !== 'undefined' && SFX.playHit) SFX.playHit();
          return;
        }
        unit.stopSounds();
        unit.state = STATE.DIAGONAL_MINING;
        unit.cutSteps = 0;
        applied = true;
        skillColor = "#f0a028";
        break;

      case 'drill':
        if (isFalling) {
          return;
        }
        // Check if directly standing on steel
        const isSteelFloor = this.terrain.isSteel(unit.x, unit.y + 1) ||
          this.terrain.isSteel(unit.x, unit.y + 3) ||
          this.terrain.isSteel(unit.x - 4, unit.y + 2) ||
          this.terrain.isSteel(unit.x + 4, unit.y + 2) ||
          this.terrain.isSteel(unit.x, unit.y + 5);
        if (isSteelFloor) {
          this.particles.spawnBurst(unit.x, unit.y, '#ffffff', 8, 2.5);
          this.particles.spawnBurst(unit.x, unit.y, '#ffb700', 10, 3.2);
          this.particles.spawnFloatingText(unit.x, unit.y - 16, '🛡️ STEEL!', '#ffb700');
          if (typeof SFX !== 'undefined' && SFX.playHit) SFX.playHit();
          return;
        }
        unit.stopSounds();
        unit.state = STATE.THERMAL_DRILLING;
        unit.cutSteps = 0;
        applied = true;
        skillColor = "#ff6600";
        break;

      case 'bomb':
        if (unit.bombTimer <= 0) {
          unit.bombTimer = 240;
          applied = true;
          skillColor = "#ff2255";
        }
        break;

      case 'build':
        if (isFalling) {
          return;
        }
        unit.stopSounds();
        unit.state = STATE.BUILDING_3D_PRINT;
        unit.stepCount = 0;
        unit.timer = 0;
        unit.buildFinishTimer = 0;
        applied = true;
        skillColor = "#00f3ff";
        break;

      case 'block':
        if (isFalling) {
          return;
        }
        unit.stopSounds();
        if (unit.state === STATE.BLOCKING_SHIELD) {
          unit.state = STATE.WALKING;
          applied = true;
          skillColor = "#00f3ff";
        } else {
          unit.state = STATE.BLOCKING_SHIELD;
          applied = true;
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
      const spawnInterval = (currentLvl.spawnRate || 20) * 2.5; // ~50 frames (~0.8s) per unit
      if (this.spawnTimer >= spawnInterval) {
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

    // Update dynamic moving platforms
    if (this.movingPlatforms && this.movingPlatforms.length > 0) {
      for (const p of this.movingPlatforms) {
        p.update(1.0);
      }
    }

    // Update dynamic jump pads
    if (this.jumpPads && this.jumpPads.length > 0) {
      for (const pad of this.jumpPads) {
        pad.update(1.0);
      }
    }

    for (const u of this.units) {
      const prevState = u.state;
      u.update(this.terrain, this.particles, exitGate, this.portalPair, this.units, 1.0, this.movingPlatforms, this.jumpPads);

      if (u.state === STATE.EXITING && prevState !== STATE.EXITING) {
        newlyRescued++;
      }
      if (u.state !== STATE.DEAD && u.state !== STATE.EXITING) {
        activeUnits++;
      }
    }

    if (newlyRescued > 0) {
      this.rescuedCount += newlyRescued;
      this.particles.spawnFloatingText(currentLvl.gateX, currentLvl.gateY - 28, `${this.rescuedCount}`, '#00ff88');
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

      // 온라인 랭킹 점수 전송 (스테이지 클리어 시마다 실시간 기록 전송)
      try {
        const stageKeyId = currentLvl.id != null ? currentLvl.id : (this.currentLevelIdx + 1);
        this.submitOnlineScore({
          stageId: stageKeyId,
          stageName: currentLvl.title || `STAGE ${this.currentLevelIdx + 1}`,
          score: totalScore,
          rank: rank,
          clearedAt: new Date().toISOString()
        });
      } catch (sendErr) {
        // 전송 예외는 조용히 무시 (게임 클리어 흐름 보호)
      }
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

    const saveBtn = document.getElementById('btn-end-save-map');
    const returnEditorBtn = document.getElementById('btn-end-return-editor');
    if (saveBtn) {
      saveBtn.style.display = this.isCustomPlay ? 'inline-block' : 'none';
    }
    if (returnEditorBtn) {
      returnEditorBtn.style.display = this.isCustomPlay ? 'inline-block' : 'none';
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

    // Trick A (World Background Seamless Expansion):
    // #ambient-backdrop renders the high-res world background edge-to-edge behind the canvas.
    // When ambient-backdrop is present, canvas stays transparent so the single sharp background
    // spans continuously from left bezel to right bezel.
    const ambientEl = document.getElementById('ambient-backdrop');
    const hasAmbient = ambientEl && ambientEl.style.backgroundImage && ambientEl.style.backgroundImage !== 'none';
    if (!hasAmbient) {
      if (this.bgImg.complete && this.bgImg.naturalWidth > 0) {
        this.ctx.drawImage(this.bgImg, 0, 0, this.canvas.width, this.canvas.height);
        this.ctx.fillStyle = 'rgba(5, 8, 20, 0.22)';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      } else {
        this.ctx.fillStyle = '#060913';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      }
    }

    this.ctx.drawImage(this.terrain.canvas, 0, 0);

    if (this.gameState === GAME_STATE.EDITOR && this.editor) {
      try {
        this.editor.render(this.ctx);
      } catch (err) {
        console.error('[Editor render error]', err);
      }
      return;
    }

    const currentLvl = this.isCustomPlay ? this.activeCustomData : LEVELS[this.currentLevelIdx];
    if (!currentLvl) return;

    // Render dynamic moving platforms
    if (this.movingPlatforms && this.movingPlatforms.length > 0) {
      for (const p of this.movingPlatforms) {
        p.render(this.ctx, false, false);
      }
    }

    // Render dynamic jump pads
    if (this.jumpPads && this.jumpPads.length > 0) {
      for (const pad of this.jumpPads) {
        pad.render(this.ctx, false, false);
      }
    }

    const spX = (typeof currentLvl.spawnX === 'number' && !isNaN(currentLvl.spawnX)) ? currentLvl.spawnX : 90;
    const spY = (typeof currentLvl.spawnY === 'number' && !isNaN(currentLvl.spawnY)) ? currentLvl.spawnY : 60;
    const gtX = (typeof currentLvl.gateX === 'number' && !isNaN(currentLvl.gateX)) ? currentLvl.gateX : 710;
    const gtY = (typeof currentLvl.gateY === 'number' && !isNaN(currentLvl.gateY)) ? currentLvl.gateY : 254;

    // Unified Futuristic Quantum Gateways (Spawn & Exit Gate)
    const time = performance.now() * 0.003;
    if (typeof GatewayRenderer !== 'undefined') {
      GatewayRenderer.renderSpawn(this.ctx, spX, spY, time, false);
      GatewayRenderer.renderGate(this.ctx, gtX, gtY, time, false);
    } else {
      // Fallback
      if (this.hatchImg && this.hatchImg.complete && this.hatchImg.naturalWidth > 0) {
        this.ctx.drawImage(this.hatchImg, spX - 24, spY - 34, 48, 48);
      } else {
        this.ctx.fillStyle = '#ffaa00';
        this.ctx.fillRect(spX - 16, spY - 20, 32, 20);
      }
      this.ctx.fillStyle = '#bf00ff';
      this.ctx.beginPath();
      this.ctx.arc(gtX, gtY, 20, 0, Math.PI * 2);
      this.ctx.fill();
    }

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
      this.ctx.globalAlpha = alpha;
      this.ctx.fillText(currentSec > 0 ? currentSec.toString() : "GO!", 0, 0);

      this.ctx.font = '700 16px Orbitron, sans-serif';
      this.ctx.fillStyle = '#ffffff';
      const subtitle = currentSec === 3 ? "GET READY..." : (currentSec === 2 ? "PLAN YOUR ROUTE" : "MISSION START!");
      this.ctx.fillText(subtitle, 0, 56);
      this.ctx.restore();
    }
  }

  gameLoop(timestamp) {
    const now = performance.now();
    if (!this.lastTime) this.lastTime = now;
    let delta = now - this.lastTime;
    this.lastTime = now;
    if (delta > 100) delta = 100; // Clamp large lag spikes

    if (this.gameState === GAME_STATE.COUNTDOWN) {
      const elapsed = now - this.countdownStart;
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
    } else if (this.gameState === GAME_STATE.PLAYING && this.gameSpeed > 0) {
      // Fixed 60Hz delta-time accumulator physics loop (baseline 0.8x, relative 0.5x, 1x, 2x)
      if (!this.accumulator) this.accumulator = 0;
      const BASE_SPEED_SCALE = 0.8;
      this.accumulator += delta * (this.gameSpeed * BASE_SPEED_SCALE);
      const fixedStep = 1000 / 60; // 16.666ms
      let steps = 0;
      while (this.accumulator >= fixedStep && steps < 8) {
        this.updateSimulation();
        this.accumulator -= fixedStep;
        steps++;
      }
    }

    try {
      this.render();
    } catch (e) {
      console.error('[gameLoop render error]', e);
    }
    requestAnimationFrame((t) => this.gameLoop(t));
  }
}
