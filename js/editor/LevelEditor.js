// --- Interactive Visual Level Editor Engine with DNA Solution Walkthrough ---
class LevelEditor {
  constructor() {
    this.game = null;
    this.levelData = StageDataEngine.createDefaultStage();
    this.selectedTool = 'select';
    this.selectedElementIndex = -1;
    this.selectedSpecial = null; // 'spawn' | 'gate'
    this.isMovingSpawn = false;
    this.isMovingGate = false;
    this.snap = true;
    this.snapSize = 10;
    this.history = [];
    this.maxHistory = 25;
    this.isDrawing = false;
    this.isMovingElement = false;
    this.isResizingWidth = false;
    this.isResizingThickness = false;
    this.initialResizeW = 100;
    this.initialResizeH = 20;
    this.initialResizeX = 0;
    this.initialResizeY = 0;
    this.dragStart = { x: 0, y: 0 };
    this.dragCurrent = { x: 0, y: 0 };
    this.elementMoveOffset = { x: 0, y: 0 };
  }

  init(game, initialData = null) {
    this.game = game;
    this.levelData = initialData ? JSON.parse(JSON.stringify(initialData)) : StageDataEngine.createDefaultStage();
    if (!this.levelData.elements) this.levelData.elements = [];
    if (!this.levelData.terrainTheme) this.levelData.terrainTheme = 'cyan';
    if (typeof this.levelData.spawnX !== 'number' || isNaN(this.levelData.spawnX)) this.levelData.spawnX = 90;
    if (typeof this.levelData.spawnY !== 'number' || isNaN(this.levelData.spawnY)) this.levelData.spawnY = 60;
    if (typeof this.levelData.gateX !== 'number' || isNaN(this.levelData.gateX)) this.levelData.gateX = 710;
    if (typeof this.levelData.gateY !== 'number' || isNaN(this.levelData.gateY)) this.levelData.gateY = 254;

    this.selectedTool = 'select';
    this.selectedElementIndex = -1;
    this.selectedSpecial = null;
    this.isMovingSpawn = false;
    this.isMovingGate = false;
    this.snap = true;
    this.isResizingWidth = false;
    this.isResizingThickness = false;
    this.history = [JSON.stringify(this.levelData)];
    
    this.bindEvents();
    this.updateUI();
    this.syncTerrain();
  }

  bindEvents() {
    const toolBtns = document.querySelectorAll('.btn-tool[data-tool]');
    toolBtns.forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        this.setTool(btn.dataset.tool);
      };
    });

    const btnSnap = document.getElementById('btn-editor-snap');
    if (btnSnap) {
      btnSnap.onclick = () => {
        this.snap = !this.snap;
        btnSnap.innerText = this.snap ? '🧲 스냅: ON' : '🧲 스냅: OFF';
        btnSnap.classList.toggle('active', this.snap);
        this.updateStatus();
      };
    }

    const btnUndo = document.getElementById('btn-editor-undo');
    if (btnUndo) {
      btnUndo.onclick = () => this.undo();
    }

    const btnGenerate = document.getElementById('btn-editor-generate');
    if (btnGenerate) {
      btnGenerate.onclick = () => this.openGenerateModal();
    }

    const btnReroll = document.getElementById('btn-editor-reroll');
    if (btnReroll) {
      btnReroll.onclick = () => this.executeGenerate(true);
    }

    const btnGuide = document.getElementById('btn-editor-guide');
    if (btnGuide) {
      btnGuide.onclick = () => this.openSolutionGuideModal();
    }

    const btnSaveMap = document.getElementById('btn-editor-save-map');
    if (btnSaveMap) {
      btnSaveMap.onclick = () => this.saveCurrentMap();
    }

    const btnProps = document.getElementById('btn-editor-props');
    if (btnProps) {
      btnProps.onclick = () => this.openPropsModal();
    }

    const btnExport = document.getElementById('btn-editor-export');
    if (btnExport) {
      btnExport.onclick = () => this.exportToJSON();
    }

    const btnPlay = document.getElementById('btn-editor-play');
    if (btnPlay) {
      btnPlay.onclick = () => this.startTestPlay();
    }

    const btnExit = document.getElementById('btn-editor-exit');
    if (btnExit) {
      btnExit.onclick = () => this.exitEditor();
    }

    // Width Adjustment Buttons
    const bindWidthBtn = (id, delta) => {
      const btn = document.getElementById(id);
      if (btn) btn.onclick = () => this.adjustSelectedWidth(delta);
    };
    bindWidthBtn('btn-width-sub20', -20);
    bindWidthBtn('btn-width-sub10', -10);
    bindWidthBtn('btn-width-add10', 10);
    bindWidthBtn('btn-width-add20', 20);

    // Thickness Adjustment Buttons (-20, -10, +10, +20)
    const bindThickBtn = (id, delta) => {
      const btn = document.getElementById(id);
      if (btn) btn.onclick = () => this.adjustSelectedThickness(delta);
    };
    bindThickBtn('btn-thick-sub20', -20);
    bindThickBtn('btn-thick-sub10', -10);
    bindThickBtn('btn-thick-add10', 10);
    bindThickBtn('btn-thick-add20', 20);
    // Legacy support
    bindThickBtn('btn-thick-sub5', -10);
    bindThickBtn('btn-thick-sub1', -10);
    bindThickBtn('btn-thick-add1', 10);
    bindThickBtn('btn-thick-add5', 10);

    // Color Palette Selector Buttons
    ['cyan', 'red', 'brown', 'green', 'purple'].forEach(palKey => {
      const btn = document.getElementById(`btn-pal-${palKey}`);
      if (btn) btn.onclick = () => this.setSelectedPalette(palKey);
    });

    // AI Procedural Generator Modal Buttons
    const btnGenCancel = document.getElementById('btn-gen-cancel');
    if (btnGenCancel) {
      btnGenCancel.onclick = () => this.closeGenerateModal();
    }
    const btnGenExecute = document.getElementById('btn-gen-execute');
    if (btnGenExecute) {
      btnGenExecute.onclick = () => this.executeGenerate(false);
    }
    const btnGenApply = document.getElementById('btn-gen-apply');
    if (btnGenApply) {
      btnGenApply.onclick = () => this.closeGenerateModal();
    }

    // Solution Guide Modal Close
    const btnGuideClose = document.getElementById('btn-guide-close');
    if (btnGuideClose) {
      btnGuideClose.onclick = () => {
        const modal = document.getElementById('modal-solution-guide');
        if (modal) modal.style.display = 'none';
      };
    }
    const btnGuideSolveNow = document.getElementById('btn-guide-solve-now');
    if (btnGuideSolveNow) {
      btnGuideSolveNow.onclick = () => {
        const modal = document.getElementById('modal-solution-guide');
        if (modal) modal.style.display = 'none';
        this.startAutoSolveTest();
      };
    }

    // Properties Modal Buttons
    const btnPropsCancel = document.getElementById('btn-props-cancel');
    if (btnPropsCancel) {
      btnPropsCancel.onclick = () => {
        const modal = document.getElementById('modal-editor-props');
        if (modal) modal.style.display = 'none';
      };
    }

    const btnPropsSave = document.getElementById('btn-props-save');
    if (btnPropsSave) {
      btnPropsSave.onclick = () => this.savePropsModal();
    }
  }

  openGenerateModal() {
    const modal = document.getElementById('modal-editor-generate');
    const statusBox = document.getElementById('gen-modal-status');
    if (statusBox) statusBox.style.display = 'none';
    if (modal) modal.style.display = 'flex';
    SFX.playClick();
  }

  closeGenerateModal() {
    const modal = document.getElementById('modal-editor-generate');
    if (modal) modal.style.display = 'none';
  }

  executeGenerate(closeModal = false) {
    try {
      const getVal = (id) => { const el = document.getElementById(id); return el ? el.value : ''; };
      const difficulty = getVal('gen-difficulty') || 'normal';
      const layout = getVal('gen-layout') || 'random';
      const theme = getVal('gen-theme') || 'random';
      const palette = getVal('gen-palette') || 'random';
      const seed = ((Math.random() * 1e9) | 0) ^ (Date.now() & 0x7fffffff);

      const generatedData = ProceduralMapEngine.generate({ difficulty, layout, theme, palette, seed });
      this.levelData = generatedData;
      this.selectedElementIndex = -1;
      this.selectedSpecial = null;

      if (this.game && this.game.bgImg) {
        this.game.bgImg.src = this.levelData.bgImg;
      }

      this.saveHistory();
      this.syncTerrain();
      this.updateStatus();

      const statusBox = document.getElementById('gen-modal-status');
      if (statusBox) {
        const dnaStr = (this.levelData.solutionDna || []).join(' → ') || 'CUSTOM';
        const archStr = this.levelData.layoutType || 'random';
        statusBox.style.display = 'block';
        statusBox.innerHTML = `
          <div style="color:#00ff88; font-weight:bold; font-size:12px; margin-bottom:4px;">
            ✨ [${difficulty.toUpperCase()}] 새 맵 생성 완료! (${(this.levelData.elements || []).length}개 지형)
          </div>
          <div style="color:#a0e8ff; font-size:11px; line-height:1.4;">
            • 레이아웃: <b style="color:#fff;">${archStr}</b> | 솔루션 DNA: <b style="color:#ffcc00;">${dnaStr}</b><br>
            • 마음에 들 때까지 <b>'🎲 즉시 생성'</b>을 계속 눌러 새로운 맵을 뽑아볼 수 있습니다!
          </div>
        `;
      }

      if (typeof SFX !== 'undefined' && SFX.playTeleport) {
        SFX.playTeleport();
      }
    } catch (err) {
      console.error('[LevelEditor] executeGenerate error:', err);
    } finally {
      if (closeModal) {
        this.closeGenerateModal();
      }
    }
  }

  openSolutionGuideModal() {
    const modal = document.getElementById('modal-solution-guide');
    const container = document.getElementById('solution-guide-steps');
    const dnaBadge = document.getElementById('solution-dna-badge');
    const scoreBadge = document.getElementById('solution-score-badge');
    if (!modal) return;

    const steps = AutoSolver.generateSteps(this.levelData);
    if (dnaBadge) dnaBadge.innerText = (this.levelData.solutionDna || ['CUSTOM']).join(' → ');
    if (scoreBadge) scoreBadge.innerText = `${this.levelData.difficultyScore || 0}pt`;

    if (container) {
      container.innerHTML = '';
      steps.forEach(s => {
        const item = document.createElement('div');
        item.className = 'solution-step-item';
        item.innerHTML = `
          <div class="solution-step-badge">${s.step}. ${s.icon} ${s.name}</div>
          <div class="solution-step-desc">${s.desc}</div>
        `;
        container.appendChild(item);
      });
    }

    modal.style.display = 'flex';
    SFX.playClick();
  }

  openPropsModal() {
    const modal = document.getElementById('modal-editor-props');
    if (!modal) return;

    const setVal = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.value = val;
    };

    setVal('prop-title', this.levelData.title || "CUSTOM SECTOR");
    setVal('prop-theme', this.levelData.bgImg || "assets/bg_level_1.jpg");
    setVal('prop-terrain-palette', this.levelData.terrainTheme || "cyan");
    setVal('prop-units', this.levelData.totalUnits || 15);
    setVal('prop-quota', this.levelData.needPercent || 70);
    setVal('prop-time', this.levelData.timeLimit || 240);
    setVal('prop-spawn-rate', this.levelData.spawnRate || 20);

    const skills = this.levelData.skills || {};
    setVal('prop-sk-climb', skills.climb !== undefined ? skills.climb : 4);
    setVal('prop-sk-float', skills.float !== undefined ? skills.float : 4);
    setVal('prop-sk-bash', skills.bash !== undefined ? skills.bash : 4);
    setVal('prop-sk-mine', skills.mine !== undefined ? skills.mine : 4);
    setVal('prop-sk-drill', skills.drill !== undefined ? skills.drill : 4);
    setVal('prop-sk-bomb', skills.bomb !== undefined ? skills.bomb : 2);
    setVal('prop-sk-build', skills.build !== undefined ? skills.build : 6);
    setVal('prop-sk-block', skills.block !== undefined ? skills.block : 3);
    setVal('prop-sk-portal', skills.portal !== undefined ? skills.portal : 0);

    modal.style.display = 'flex';
    SFX.playClick();
  }

  savePropsModal() {
    const getVal = (id) => {
      const el = document.getElementById(id);
      return el ? el.value : '';
    };
    const getNum = (id) => {
      const el = document.getElementById(id);
      return el ? parseInt(el.value) || 0 : 0;
    };

    this.levelData.title = getVal('prop-title') || "CUSTOM SECTOR";
    this.levelData.bgImg = getVal('prop-theme') || "assets/bg_level_1.jpg";
    this.levelData.terrainTheme = getVal('prop-terrain-palette') || "cyan";
    this.levelData.totalUnits = getNum('prop-units') || 15;
    this.levelData.needPercent = getNum('prop-quota') || 70;
    this.levelData.timeLimit = getNum('prop-time') || 240;
    this.levelData.spawnRate = getNum('prop-spawn-rate') || 20;

    this.levelData.skills = {
      climb: getNum('prop-sk-climb'),
      float: getNum('prop-sk-float'),
      bash: getNum('prop-sk-bash'),
      mine: getNum('prop-sk-mine'),
      drill: getNum('prop-sk-drill'),
      bomb: getNum('prop-sk-bomb'),
      build: getNum('prop-sk-build'),
      block: getNum('prop-sk-block'),
      portal: getNum('prop-sk-portal')
    };

    if (this.game && this.game.bgImg) {
      this.game.bgImg.src = this.levelData.bgImg;
    }

    this.saveHistory();
    this.syncTerrain();
    this.updateStatus();

    const modal = document.getElementById('modal-editor-props');
    if (modal) modal.style.display = 'none';
    SFX.playClick();

    if (this.game && this.game.particles) {
      this.game.particles.spawnFloatingText(400, 180, "⚙️ 스테이지 & 스킬 설정 저장 완료!", "#00ff88");
    }
  }

  startTestPlay() {
    const modals = ['modal-solution-guide', 'modal-editor-props', 'modal-editor-generate', 'modal-stage-manager', 'modal-start', 'modal-save-slot'];
    modals.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });

    const currentData = JSON.parse(JSON.stringify(this.levelData));
    if (typeof currentData.spawnX !== 'number' || isNaN(currentData.spawnX)) currentData.spawnX = 90;
    if (typeof currentData.spawnY !== 'number' || isNaN(currentData.spawnY)) currentData.spawnY = 60;
    if (typeof currentData.gateX !== 'number' || isNaN(currentData.gateX)) currentData.gateX = 710;
    if (typeof currentData.gateY !== 'number' || isNaN(currentData.gateY)) currentData.gateY = 254;

    this.game.exitEditorToPlay(currentData);
  }

  startAutoSolveTest() {
    const modals = ['modal-solution-guide', 'modal-editor-props', 'modal-editor-generate', 'modal-start', 'modal-save-slot'];
    modals.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });
    const overlay = document.getElementById('editor-overlay');
    if (overlay) overlay.style.display = 'none';
    const hudBottom = document.getElementById('hud-bottom');
    if (hudBottom) hudBottom.style.display = 'flex';

    const currentData = JSON.parse(JSON.stringify(this.levelData));
    if (typeof currentData.spawnX !== 'number' || isNaN(currentData.spawnX)) currentData.spawnX = 90;
    if (typeof currentData.spawnY !== 'number' || isNaN(currentData.spawnY)) currentData.spawnY = 60;
    if (typeof currentData.gateX !== 'number' || isNaN(currentData.gateX)) currentData.gateX = 710;
    if (typeof currentData.gateY !== 'number' || isNaN(currentData.gateY)) currentData.gateY = 254;

    this.game.loadLevelFromData(currentData, false);
    const modalStart = document.getElementById('modal-start');
    if (modalStart) modalStart.style.display = 'none';

    this.game.gameState = GAME_STATE.PLAYING;
    this.game.setSpeed(1);
    this.game.spawnTimer = 180;
    this.game.autoSolver.start(this.game, currentData);
    SFX.playTeleport();
  }

  saveCurrentMap() {
    let diff = 'normal';
    const titleUpper = (this.levelData.title || '').toUpperCase();
    if (titleUpper.includes('EASY')) diff = 'easy';
    else if (titleUpper.includes('HARD')) diff = 'hard';
    else if (titleUpper.includes('NIGHTMARE')) diff = 'nightmare';
    else if (titleUpper.includes('NORMAL')) diff = 'normal';
    else {
      const score = this.levelData.difficultyScore || 50;
      if (score < 45) diff = 'easy';
      else if (score < 80) diff = 'normal';
      else if (score < 130) diff = 'hard';
      else diff = 'nightmare';
    }

    if (!titleUpper.includes(`(${diff.toUpperCase()})`) && !titleUpper.includes(`[${diff.toUpperCase()}]`)) {
      this.levelData.title = `[${diff.toUpperCase()}] ${this.levelData.title || 'CUSTOM SECTOR'}`;
    }

    if (this.game && this.game.stageMgr) {
      const isNewMap = (this.game.isCustomPlay || this.levelData.id === 'NEW_MAP' || this.levelData.id === 'CUSTOM' || !this.levelData.id || typeof this.levelData.id === 'string');
      const defaultSlot = isNewMap ? 'add_new' : this.game.currentLevelIdx;
      this.game.stageMgr.openSaveSlotModal(this.levelData, defaultSlot);
    }
  }

  setTool(tool) {
    this.selectedTool = tool;
    document.querySelectorAll('.btn-tool[data-tool]').forEach(b => {
      b.classList.toggle('active', b.dataset.tool === tool);
    });
    this.isMovingElement = false;
    this.isMovingSpawn = false;
    this.isMovingGate = false;
    this.isResizingWidth = false;
    this.isResizingThickness = false;
    this.isDrawing = false;
    if (tool !== 'select') {
      this.selectedElementIndex = -1;
      this.selectedSpecial = null;
    }
    this.updateStatus();
    SFX.playClick();
  }

  adjustSelectedWidth(delta) {
    if (this.selectedElementIndex < 0 || this.selectedElementIndex >= this.levelData.elements.length) return;
    const el = this.levelData.elements[this.selectedElementIndex];
    if (el.type === 'spawn' || el.type === 'gate') return;

    const oldW = el.w || 100;
    const targetW = this.snap ? this.snapCoord(oldW + delta) : (oldW + delta);
    const minW = (el.type === 'steelBarrier' || el.type === 'rockWall') ? this.snapSize : this.snapSize * 2;
    const newW = Math.max(minW, Math.min(760, targetW));
    if (newW === oldW) return;

    el.w = newW;
    this.saveHistory();
    this.syncTerrain();
    this.updateStatus();
    SFX.playClick();
  }

  adjustSelectedThickness(delta) {
    if (this.selectedElementIndex < 0 || this.selectedElementIndex >= this.levelData.elements.length) return;
    const el = this.levelData.elements[this.selectedElementIndex];
    if (el.type === 'spawn' || el.type === 'gate') return;

    const oldH = el.h || 20;
    const targetH = this.snap ? this.snapCoord(oldH + delta) : (oldH + delta);
    const minH = (el.type === 'steelBarrier' || el.type === 'rockWall') ? this.snapSize : this.snapSize;
    const newH = Math.max(minH, Math.min(260, targetH));
    if (newH === oldH) return;

    el.h = newH;
    if (el.profile && el.profile.length > 0) {
      const ratio = newH / oldH;
      el.profile = el.profile.map(p => Math.max(6, Math.round(p * ratio)));
    }
    this.saveHistory();
    this.syncTerrain();
    this.updateStatus();
    SFX.playClick();
  }

  setSelectedPalette(palKey) {
    if (this.selectedElementIndex < 0 || this.selectedElementIndex >= this.levelData.elements.length) return;
    const el = this.levelData.elements[this.selectedElementIndex];
    el.palette = palKey;
    this.saveHistory();
    this.syncTerrain();
    this.updateStatus();
    SFX.playClick();
  }

  snapCoord(val) {
    if (!this.snap) return Math.round(val);
    return Math.round(val / this.snapSize) * this.snapSize;
  }

  syncTerrain() {
    if (this.game && this.game.terrain) {
      StageDataEngine.buildTerrainFromData(this.game.terrain, this.levelData);
    }
  }

  updateUI() {
    this.updateStatus();
  }

  updateStatus() {
    const info = document.getElementById('editor-status-info');
    const selectedControls = document.getElementById('editor-selected-controls');
    const widthVal = document.getElementById('editor-selected-width-val');
    const thickVal = document.getElementById('editor-selected-thick-val');
    const count = (this.levelData.elements || []).length;

    if (this.selectedSpecial === 'spawn') {
      if (info) info.innerHTML = `<span style="color:#ffaa00; font-weight:700;">🚪 선택: [스폰 해치 (SPAWN)]</span> 위치: (${this.levelData.spawnX}, ${this.levelData.spawnY}) | [클릭 또는 드래그하여 위치 지정]`;
      if (selectedControls) selectedControls.style.display = 'none';
      return;
    }

    if (this.selectedSpecial === 'gate') {
      if (info) info.innerHTML = `<span style="color:#bf00ff; font-weight:700;">🌀 선택: [탈출 웜홀 (WARP GATE)]</span> 위치: (${this.levelData.gateX}, ${this.levelData.gateY}) | [클릭 또는 드래그하여 위치 지정]`;
      if (selectedControls) selectedControls.style.display = 'none';
      return;
    }

    if (this.selectedElementIndex >= 0 && this.selectedElementIndex < this.levelData.elements.length) {
      const el = this.levelData.elements[this.selectedElementIndex];
      const palKey = el.palette || this.levelData.terrainTheme || 'cyan';
      const pal = TERRAIN_PALETTES[palKey] || TERRAIN_PALETTES.cyan;

      if (info) info.innerText = `선택: [${el.type.toUpperCase()}] ${el.w}×${el.h}px | 위치: (${el.x}, ${el.y}) | 🎨 ${pal.name}`;
      if (selectedControls) selectedControls.style.display = 'flex';
      if (widthVal) widthVal.innerText = `${el.w}px`;
      if (thickVal) thickVal.innerText = `${el.h}px`;

      ['cyan', 'red', 'brown', 'green', 'purple'].forEach(k => {
        const btn = document.getElementById(`btn-pal-${k}`);
        if (btn) btn.classList.toggle('active', k === palKey);
      });
    } else {
      let dnaInfo = '';
      if (this.levelData.solutionDna && this.levelData.solutionDna.length > 0) {
        dnaInfo = ` | 🧬 DNA: [${this.levelData.solutionDna.join('→')}] (${this.levelData.difficultyScore || 0}pt)`;
      }
      if (info) info.innerText = `도구: ${this.selectedTool.toUpperCase()} | 오브젝트: ${count}개 | 🚪 스폰:(${this.levelData.spawnX},${this.levelData.spawnY}) 🌀 웜홀:(${this.levelData.gateX},${this.levelData.gateY})${dnaInfo}`;
      if (selectedControls) selectedControls.style.display = 'none';
    }
  }

  exportToJSON() {
    if (this.game && this.game.stageMgr) {
      this.game.stageMgr.openModal('tab-json');
    }
  }

  exitEditor() {
    this.game.exitEditor();
  }

  saveHistory() {
    const json = JSON.stringify(this.levelData);
    if (this.history[this.history.length - 1] !== json) {
      this.history.push(json);
      if (this.history.length > this.maxHistory) {
        this.history.shift();
      }
    }
  }

  undo() {
    if (this.history.length > 1) {
      this.history.pop();
      const prev = this.history[this.history.length - 1];
      this.levelData = JSON.parse(prev);
      this.selectedElementIndex = -1;
      this.selectedSpecial = null;
      this.syncTerrain();
      this.updateStatus();
      SFX.playClick();
    }
  }

  // Canvas interaction handlers
  handlePointerDown(x, y) {
    const sx = this.snapCoord(x);
    const sy = this.snapCoord(y);

    if (this.selectedTool === 'select') {
      // Check for Thickness Drag Handle
      if (this.selectedElementIndex >= 0 && this.selectedElementIndex < this.levelData.elements.length) {
        const el = this.levelData.elements[this.selectedElementIndex];
        const hx = el.x + el.w / 2;
        const hy = el.y + el.h;
        if (Math.abs(x - hx) < 40 && Math.abs(y - hy) < 16) {
          this.isResizingThickness = true;
          const minH = (el.type === 'steelBarrier' || el.type === 'rockWall') ? this.snapSize : this.snapSize;
          if (this.snap) {
            el.y = this.snapCoord(el.y);
            el.h = Math.max(minH, this.snapCoord(el.h));
          }
          this.initialResizeH = el.h;
          this.initialResizeY = el.y;
          return;
        }

        // Check for Width Drag Handle (Right Edge pill bar)
        const rx = el.x + el.w;
        const ry = el.y + el.h / 2;
        if (Math.abs(x - rx) < 18 && Math.abs(y - ry) < 24) {
          this.isResizingWidth = true;
          const minW = (el.type === 'steelBarrier' || el.type === 'rockWall') ? this.snapSize : this.snapSize * 2;
          if (this.snap) {
            el.x = this.snapCoord(el.x);
            el.w = Math.max(minW, this.snapCoord(el.w));
          }
          this.initialResizeW = el.w;
          this.initialResizeX = el.x;
          return;
        }
      }

      // Check Spawn Hatch selection (Hatch canopy + holographic beam bounding box)
      const spX = this.levelData.spawnX || 90;
      const spY = this.levelData.spawnY || 60;
      const inSpawn = (Math.abs(x - spX) <= 34 && y >= spY - 50 && y <= spY + 32) || (Math.hypot(x - spX, y - spY) < 36);
      if (inSpawn) {
        this.selectedSpecial = 'spawn';
        this.selectedElementIndex = -1;
        this.isMovingSpawn = true;
        this.moveStartElementPos = { x: spX, y: spY };
        this.moveStartPointer = { x: this.snapCoord(x), y: this.snapCoord(y) };
        this.updateStatus();
        SFX.playClick();
        return;
      }

      // Check Warp Gate selection (Vortex ring + frame bounding box)
      const gtX = this.levelData.gateX || 710;
      const gtY = this.levelData.gateY || 254;
      const inGate = (Math.abs(x - gtX) <= 36 && Math.abs(y - gtY) <= 36) || (Math.hypot(x - gtX, y - gtY) < 36);
      if (inGate) {
        this.selectedSpecial = 'gate';
        this.selectedElementIndex = -1;
        this.isMovingGate = true;
        this.moveStartElementPos = { x: gtX, y: gtY };
        this.moveStartPointer = { x: this.snapCoord(x), y: this.snapCoord(y) };
        this.updateStatus();
        SFX.playClick();
        return;
      }

      // Check element selection
      const foundIdx = this.findElementAt(x, y);
      this.selectedElementIndex = foundIdx;
      this.selectedSpecial = null;
      if (foundIdx !== -1) {
        const el = this.levelData.elements[foundIdx];
        this.isMovingElement = true;
        const minW = (el.type === 'steelBarrier' || el.type === 'rockWall') ? this.snapSize : this.snapSize * 2;
        const minH = (el.type === 'steelBarrier' || el.type === 'rockWall') ? this.snapSize : this.snapSize;
        if (this.snap) {
          el.x = this.snapCoord(el.x);
          el.y = this.snapCoord(el.y);
          el.w = Math.max(minW, this.snapCoord(el.w));
          el.h = Math.max(minH, this.snapCoord(el.h));
        }
        this.moveStartElementPos = { x: el.x, y: el.y };
        this.moveStartPointer = { x: this.snapCoord(x), y: this.snapCoord(y) };
        SFX.playClick();
      }
      this.updateStatus();
    } else if (this.selectedTool === 'delete') {
      const foundIdx = this.findElementAt(x, y);
      if (foundIdx !== -1) {
        this.levelData.elements.splice(foundIdx, 1);
        this.selectedElementIndex = -1;
        this.selectedSpecial = null;
        this.saveHistory();
        this.syncTerrain();
        this.updateStatus();
        SFX.playExplosion();
      }
    } else if (this.selectedTool === 'spawn') {
      this.levelData.spawnX = sx;
      this.levelData.spawnY = sy;
      this.selectedSpecial = 'spawn';
      this.selectedElementIndex = -1;
      this.isMovingSpawn = true;
      this.moveStartElementPos = { x: sx, y: sy };
      this.moveStartPointer = { x: sx, y: sy };
      this.saveHistory();
      this.updateStatus();
      SFX.playClick();
    } else if (this.selectedTool === 'gate') {
      this.levelData.gateX = sx;
      this.levelData.gateY = sy;
      this.selectedSpecial = 'gate';
      this.selectedElementIndex = -1;
      this.isMovingGate = true;
      this.moveStartElementPos = { x: sx, y: sy };
      this.moveStartPointer = { x: sx, y: sy };
      this.saveHistory();
      this.updateStatus();
      SFX.playClick();
    } else {
      this.isDrawing = true;
      this.dragStart = { x: sx, y: sy };
      this.dragCurrent = { x: sx, y: sy };
    }
  }

  handlePointerMove(x, y) {
    if (this.isMovingSpawn) {
      const curPointerX = this.snapCoord(x);
      const curPointerY = this.snapCoord(y);
      const deltaX = curPointerX - this.moveStartPointer.x;
      const deltaY = curPointerY - this.moveStartPointer.y;
      this.levelData.spawnX = Math.max(30, Math.min(770, this.snapCoord(this.moveStartElementPos.x + deltaX)));
      this.levelData.spawnY = Math.max(30, Math.min(420, this.snapCoord(this.moveStartElementPos.y + deltaY)));
      this.updateStatus();
      return;
    }

    if (this.isMovingGate) {
      const curPointerX = this.snapCoord(x);
      const curPointerY = this.snapCoord(y);
      const deltaX = curPointerX - this.moveStartPointer.x;
      const deltaY = curPointerY - this.moveStartPointer.y;
      this.levelData.gateX = Math.max(30, Math.min(770, this.snapCoord(this.moveStartElementPos.x + deltaX)));
      this.levelData.gateY = Math.max(30, Math.min(420, this.snapCoord(this.moveStartElementPos.y + deltaY)));
      this.updateStatus();
      return;
    }

    if (this.isResizingThickness) {
      if (this.selectedElementIndex >= 0 && this.selectedElementIndex < this.levelData.elements.length) {
        const el = this.levelData.elements[this.selectedElementIndex];
        const targetBottom = this.snapCoord(y);
        const minH = (el.type === 'steelBarrier' || el.type === 'rockWall') ? this.snapSize : this.snapSize;
        const targetH = Math.max(minH, Math.min(260, targetBottom - el.y));
        if (targetH !== el.h) {
          const oldH = el.h;
          el.h = targetH;
          if (el.profile && el.profile.length > 0) {
            const ratio = targetH / oldH;
            el.profile = el.profile.map(p => Math.max(6, Math.round(p * ratio)));
          }
          this.syncTerrain();
          this.updateStatus();
        }
      }
      return;
    }

    if (this.isResizingWidth) {
      if (this.selectedElementIndex >= 0 && this.selectedElementIndex < this.levelData.elements.length) {
        const el = this.levelData.elements[this.selectedElementIndex];
        const targetRight = this.snapCoord(x);
        const minW = (el.type === 'steelBarrier' || el.type === 'rockWall') ? this.snapSize : this.snapSize * 2;
        const targetW = Math.max(minW, Math.min(800 - el.x, targetRight - el.x));
        if (targetW !== el.w) {
          el.w = targetW;
          this.syncTerrain();
          this.updateStatus();
        }
      }
      return;
    }

    if (this.isMovingElement && this.selectedElementIndex >= 0) {
      const el = this.levelData.elements[this.selectedElementIndex];
      const curPointerX = this.snapCoord(x);
      const curPointerY = this.snapCoord(y);
      const deltaX = curPointerX - this.moveStartPointer.x;
      const deltaY = curPointerY - this.moveStartPointer.y;
      el.x = Math.max(0, Math.min(800 - el.w, this.snapCoord(this.moveStartElementPos.x + deltaX)));
      el.y = Math.max(0, Math.min(450 - el.h, this.snapCoord(this.moveStartElementPos.y + deltaY)));
      this.syncTerrain();
      this.updateStatus();
      return;
    }

    if (this.isDrawing) {
      this.dragCurrent = { x: this.snapCoord(x), y: this.snapCoord(y) };
    }
  }

  handlePointerUp(x, y) {
    if (this.isMovingSpawn) {
      this.isMovingSpawn = false;
      this.saveHistory();
      this.updateStatus();
      return;
    }

    if (this.isMovingGate) {
      this.isMovingGate = false;
      this.saveHistory();
      this.updateStatus();
      return;
    }

    if (this.isResizingThickness) {
      this.isResizingThickness = false;
      this.saveHistory();
      return;
    }

    if (this.isResizingWidth) {
      this.isResizingWidth = false;
      this.saveHistory();
      return;
    }

    if (this.isMovingElement) {
      this.isMovingElement = false;
      this.saveHistory();
      return;
    }

    if (this.isDrawing) {
      this.isDrawing = false;
      const x0 = Math.min(this.dragStart.x, this.dragCurrent.x);
      const y0 = Math.min(this.dragStart.y, this.dragCurrent.y);
      const rawW = Math.abs(this.dragCurrent.x - this.dragStart.x);
      const rawH = Math.abs(this.dragCurrent.y - this.dragStart.y);
      const minW = (this.selectedTool === 'steelBarrier' || this.selectedTool === 'rockWall') ? this.snapSize : this.snapSize * 2;
      const minH = (this.selectedTool === 'steelBarrier' || this.selectedTool === 'rockWall') ? this.snapSize : this.snapSize;
      const w = this.snap ? Math.max(minW, this.snapCoord(rawW)) : Math.max(minW, Math.round(rawW));
      const h = this.snap ? Math.max(minH, this.snapCoord(rawH)) : Math.max(minH, Math.round(rawH));

      const newEl = {
        type: this.selectedTool,
        x: x0,
        y: y0,
        w: w,
        h: h,
        palette: this.levelData.terrainTheme || 'cyan'
      };

      if (newEl.type === 'craggyRock') {
        const segs = Math.max(3, Math.floor(w / 35));
        newEl.profile = [];
        for (let i = 0; i < segs; i++) {
          newEl.profile.push(Math.round(h * (0.65 + Math.random() * 0.7)));
        }
      } else if (newEl.type === 'volcanicBasalt') {
        const segs = Math.max(3, Math.floor(w / 28));
        newEl.profile = [];
        for (let i = 0; i < segs; i++) {
          const colStep = (i % 2 === 0) ? 0.8 : 0.35;
          newEl.profile.push(Math.round(h * (colStep + Math.random() * 0.5)));
        }
      } else if (newEl.type === 'quantumCrystal') {
        const segs = Math.max(3, Math.floor(w / 30));
        newEl.profile = [];
        for (let i = 0; i < segs; i++) {
          const crystalTip = (i % 3 === 1) ? 1.15 : 0.6;
          newEl.profile.push(Math.round(h * (crystalTip + Math.random() * 0.35)));
        }
      }

      this.levelData.elements.push(newEl);
      this.selectedElementIndex = this.levelData.elements.length - 1;
      this.selectedSpecial = null;
      this.saveHistory();
      this.syncTerrain();
      this.updateStatus();
      SFX.playBuild();
    }
  }

  findElementAt(x, y) {
    for (let i = this.levelData.elements.length - 1; i >= 0; i--) {
      const el = this.levelData.elements[i];
      if (x >= el.x && x <= el.x + el.w && y >= el.y && y <= el.y + el.h) {
        return i;
      }
    }
    return -1;
  }

  render(ctx) {
    // 1. Grid lines (Clean cybernetic grid: 10px minor grid, 20px/50px major grid)
    ctx.save();
    const snap = this.snapSize || 10;
    for (let gx = 0; gx <= 800; gx += snap) {
      const isMajor = (gx % (snap * 2) === 0);
      ctx.strokeStyle = isMajor ? 'rgba(0, 243, 255, 0.12)' : 'rgba(0, 243, 255, 0.04)';
      ctx.lineWidth = isMajor ? 1.0 : 0.6;
      ctx.beginPath();
      ctx.moveTo(gx, 0);
      ctx.lineTo(gx, 450);
      ctx.stroke();
    }
    for (let gy = 0; gy <= 450; gy += snap) {
      const isMajor = (gy % (snap * 2) === 0);
      ctx.strokeStyle = isMajor ? 'rgba(0, 243, 255, 0.12)' : 'rgba(0, 243, 255, 0.04)';
      ctx.lineWidth = isMajor ? 1.0 : 0.6;
      ctx.beginPath();
      ctx.moveTo(0, gy);
      ctx.lineTo(800, gy);
      ctx.stroke();
    }
    ctx.restore();

    // 2. Selected element bounding box & resize handles
    if (this.selectedElementIndex >= 0 && this.selectedElementIndex < this.levelData.elements.length) {
      const el = this.levelData.elements[this.selectedElementIndex];
      ctx.strokeStyle = '#00f3ff';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(el.x, el.y, el.w, el.h);
      ctx.setLineDash([]);

      const palKey = el.palette || this.levelData.terrainTheme || 'cyan';
      const palName = (TERRAIN_PALETTES[palKey] || TERRAIN_PALETTES.cyan).name;
      ctx.fillStyle = '#00f3ff';
      ctx.font = 'bold 12px Orbitron, sans-serif';
      const stairSteps = Math.round(el.y / 24);
      ctx.fillText(`[${el.type}] ${el.w}×${el.h}px | 🎨 ${palName} | (${el.x}, ${el.y}) [계단 ${stairSteps}단: ${stairSteps * 24}px]`, el.x, el.y - 8);

      // Width Resize Handle [↔] on right edge
      const rx = el.x + el.w;
      const ry = el.y + el.h / 2;
      ctx.fillStyle = '#00f3ff';
      ctx.beginPath();
      ctx.roundRect(rx - 4, ry - 14, 8, 28, 4);
      ctx.fill();
      ctx.fillStyle = '#000';
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('↔', rx, ry);

      // Thickness Resize Handle [↕ 두께] on bottom edge
      const hx = el.x + el.w / 2;
      const hy = el.y + el.h;
      ctx.fillStyle = '#ffb700';
      ctx.beginPath();
      ctx.roundRect(hx - 28, hy - 6, 56, 12, 4);
      ctx.fill();
      ctx.fillStyle = '#000';
      ctx.font = 'bold 9px sans-serif';
      ctx.fillText('↕ 두께', hx, hy);
    }

    // 3. Current drawing preview box (Snapped to grid)
    if (this.isDrawing) {
      const x0 = Math.min(this.dragStart.x, this.dragCurrent.x);
      const y0 = Math.min(this.dragStart.y, this.dragCurrent.y);
      const rawW = Math.abs(this.dragCurrent.x - this.dragStart.x);
      const minW = (this.selectedTool === 'steelBarrier' || this.selectedTool === 'rockWall') ? this.snapSize : this.snapSize * 2;
      const minH = (this.selectedTool === 'steelBarrier' || this.selectedTool === 'rockWall') ? this.snapSize : this.snapSize;
      const w = this.snap ? Math.max(minW, this.snapCoord(rawW)) : Math.max(minW, rawW);
      const h = this.snap ? Math.max(minH, this.snapCoord(rawH)) : Math.max(minH, rawH);

      ctx.strokeStyle = '#ffb700';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 2]);
      ctx.strokeRect(x0, y0, w, h);
      ctx.fillStyle = 'rgba(255, 183, 0, 0.2)';
      ctx.fillRect(x0, y0, w, h);
      ctx.setLineDash([]);
    }

    // 4. Spawn & Exit Gate markers (Unified High-Tech GatewayRenderer)
    const spX = this.levelData.spawnX || 90;
    const spY = this.levelData.spawnY || 60;
    const gtX = this.levelData.gateX || 710;
    const gtY = this.levelData.gateY || 254;
    const time = performance.now() * 0.003;

    if (typeof GatewayRenderer !== 'undefined') {
      GatewayRenderer.renderSpawn(ctx, spX, spY, time, this.selectedSpecial === 'spawn');
      GatewayRenderer.renderGate(ctx, gtX, gtY, time, this.selectedSpecial === 'gate');
    } else {
      ctx.fillStyle = '#ffaa00';
      ctx.fillRect(spX - 16, spY - 20, 32, 20);
      ctx.fillStyle = '#bf00ff';
      ctx.beginPath();
      ctx.arc(gtX, gtY, 20, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = LevelEditor;
}

