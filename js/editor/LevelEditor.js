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
    this.maxHistory = 50;
    this.redoStack = [];
    this.lintResult = null;
    this.showLint = true;
    this.solverOverlay = null;
    this.lastVerdict = null;
    this.seedLock = false;
    this.lastGenParams = null;
    this._keyHandler = null;
    this._genBusy = false;
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
    this.redoStack = [];
    this.solverOverlay = null;
    this.lastVerdict = null;
    
    this.bindEvents();
    this.bindKeyboard();
    this.runLint();
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

    // Moving Platform Range Adjustment Buttons
    const bindRangeBtn = (id, delta) => {
      const btn = document.getElementById(id);
      if (btn) btn.onclick = () => this.adjustSelectedRange(delta);
    };
    bindRangeBtn('btn-range-sub50', -50);
    bindRangeBtn('btn-range-sub10', -10);
    bindRangeBtn('btn-range-add10', 10);
    bindRangeBtn('btn-range-add50', 50);

    const btnToggleAxis = document.getElementById('btn-range-toggle-axis');
    if (btnToggleAxis) {
      btnToggleAxis.onclick = () => {
        if (this.selectedElementIndex >= 0 && this.selectedElementIndex < this.levelData.elements.length) {
          const el = this.levelData.elements[this.selectedElementIndex];
          if (el.type === 'movingPlatform') {
            el.axis = (el.axis === 'vertical') ? 'horizontal' : 'vertical';
            this.saveHistory();
            this.updateStatus();
            this._toast(`발판 방향: ${el.axis === 'horizontal' ? '↔ 좌우' : '↕ 상하'}`);
          }
        }
      };
    }

    // Color Palette Selector Buttons
    ['cyan', 'red', 'brown', 'green', 'purple'].forEach(palKey => {
      const btn = document.getElementById(`btn-pal-${palKey}`);
      if (btn) btn.onclick = () => this.setSelectedPalette(palKey);
    });

    const btnSelDel = document.getElementById('btn-selected-delete');
    if (btnSelDel) {
      btnSelDel.onclick = () => this.deleteSelectedElement();
    }

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

    // [NEW] 선택적 버튼들 — HTML 에 있으면 연결, 없으면 무시
    const bindOpt = (id, fn) => { const b = document.getElementById(id); if (b) b.onclick = (e) => { if (e && e.stopPropagation) e.stopPropagation(); fn(); }; return b; };
    bindOpt('btn-editor-redo', () => this.redo());
    bindOpt('btn-editor-duplicate', () => this.duplicateSelected());
    bindOpt('btn-editor-mirror', () => this.mirrorLevel());
    bindOpt('btn-editor-lint', () => this.showLintReport());
    bindOpt('btn-editor-verify', () => this.verifyWithSolver());
    bindOpt('btn-editor-generate-verified', () => this.generateVerified(this._readGenParams()));
    bindOpt('btn-editor-clear-overlay', () => this.clearSolverOverlay());
    const btnSeedLock = bindOpt('btn-editor-seed-lock', () => {
      this.seedLock = !this.seedLock;
      const b = document.getElementById('btn-editor-seed-lock');
      if (b) { b.classList.toggle('active', this.seedLock); b.innerText = this.seedLock ? '🔒 시드 고정' : '🔓 시드 자유'; }
      this.updateStatus();
    });
    if (btnSeedLock) btnSeedLock.innerText = this.seedLock ? '🔒 시드 고정' : '🔓 시드 자유';
    bindOpt('btn-lint-close', () => { const m = document.getElementById('modal-editor-lint'); if (m) m.style.display = 'none'; });
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

  // [NEW] 생성 모달의 파라미터 읽기
  _readGenParams() {
    const getVal = (id) => { const el = document.getElementById(id); return el ? el.value : ''; };
    const getChecked = (id) => { const el = document.getElementById(id); return el ? el.checked : false; };
    return {
      difficulty: getVal('gen-difficulty') || 'normal',
      layout: getVal('gen-layout') || 'random',
      theme: getVal('gen-theme') || 'random',
      palette: getVal('gen-palette') || 'random',
      includeMovingPlatform: getChecked('gen-moving-platform')
    };
  }

  _newSeed() {
    const manual = document.getElementById('gen-seed');
    if (manual && manual.value && /^-?\d+$/.test(String(manual.value).trim())) return parseInt(manual.value, 10);
    if (this.seedLock && typeof this.levelData.seed === 'number') return this.levelData.seed;
    return ((Math.random() * 1e9) | 0) ^ (Date.now() & 0x7fffffff);
  }

  _verifyEnabled() {
    const cb = document.getElementById('gen-verify');
    return !!(cb && cb.checked && typeof LevelSolver !== 'undefined' && LevelSolver.evaluate);
  }

  executeGenerate(closeModal = false) {
    try {
      const params = this._readGenParams();
      if (this._verifyEnabled()) {
        this.generateVerified(params, { closeModal });
        return;
      }
      const seed = this._newSeed();
      let generatedData = ProceduralMapEngine.generate(Object.assign({}, params, { seed }));
      if (params.includeMovingPlatform && typeof MovingPlatformArchitect !== 'undefined') {
        generatedData = MovingPlatformArchitect.injectMovingPlatforms(generatedData, { seed });
      }
      generatedData.seed = seed;
      generatedData.genParams = params;
      this.lastGenParams = params;
      this._applyGenerated(generatedData, null, params.difficulty);
    } catch (err) {
      console.error('[LevelEditor] executeGenerate error:', err);
    } finally {
      if (closeModal && !this._verifyEnabled()) {
        this.closeGenerateModal();
      }
    }
  }

  _applyGenerated(generatedData, verdict, difficulty, log) {
    this.levelData = generatedData;
    this.selectedElementIndex = -1;
    this.selectedSpecial = null;
    this.solverOverlay = null;
    this.lastVerdict = verdict || null;

    if (this.game && this.game.bgImg) {
      this.game.bgImg.src = this.levelData.bgImg;
    }

    if (verdict) this._storeVerification(verdict);
    this.saveHistory();
    this.syncTerrain();
    this.updateStatus();
    if (verdict) this._overlayFromVerdict(verdict);

    const statusBox = document.getElementById('gen-modal-status');
    if (statusBox) {
      const dnaStr = (this.levelData.solutionDna || []).join(' → ') || 'CUSTOM';
      const archStr = this.levelData.layoutType || 'random';
      const lint = this.lintResult;
      const lintStr = lint ? `${lint.errors.length ? '⛔' : '✅'} 린트 ${lint.summary}` : '';
      let verifyStr = '';
      if (verdict) {
        const sc = verdict.score ? `${verdict.score.total}pt → <b style="color:#fff;">${verdict.band.toUpperCase()}</b>` : '점수 없음';
        verifyStr = verdict.accepted
          ? `<br>• ✅ 솔버 검증 통과 (${verdict.adapter}) — 필수 스킬 ${verdict.solve.requiredSkills}개 · critical ${verdict.timing.criticalActions}개 · 대체해답 ${verdict.alternatives.count}개 · ${sc}`
          : `<br>• ⚠ 검증 미통과: <b style="color:#ff8080;">${verdict.reasons.join(', ')}</b> (${verdict.adapter}) — 가장 나은 후보를 적용했습니다.`;
        if (log && log.length) verifyStr += `<br>• 시도 ${log.length}회: ` + log.map(l => `${l.accepted ? '✅' : '✖'}${l.band ? l.band[0].toUpperCase() : '-'}`).join(' ');
      }
      statusBox.style.display = 'block';
      statusBox.innerHTML = `
        <div style="color:#00ff88; font-weight:bold; font-size:12px; margin-bottom:4px;">
          ✨ [${(difficulty || 'normal').toUpperCase()}] 새 맵 생성 완료! (${(this.levelData.elements || []).length}개 지형) · 🎲 seed ${this.levelData.seed}
        </div>
        <div style="color:#a0e8ff; font-size:11px; line-height:1.4;">
          • 레이아웃: <b style="color:#fff;">${archStr}</b> | 솔루션 DNA: <b style="color:#ffcc00;">${dnaStr}</b> | ${lintStr}${verifyStr}<br>
          • 마음에 들 때까지 <b>'🎲 즉시 생성'</b>을 계속 눌러 새로운 맵을 뽑아볼 수 있습니다! (시드 고정 시 같은 맵 재현)
        </div>
      `;
    }

    if (typeof SFX !== 'undefined' && SFX.playTeleport) {
      SFX.playTeleport();
    }
  }

  generateVerified(params, opts = {}) {
    if (this._genBusy) return;
    if (typeof ProceduralMapEngine === 'undefined') return;
    const canVerify = typeof LevelSolver !== 'undefined' && LevelSolver.evaluate;
    const attempts = this.seedLock ? 1 : (opts.attempts || 8);
    const targetBand = (params.difficulty && params.difficulty !== 'random') ? params.difficulty : null;
    const statusBox = document.getElementById('gen-modal-status');
    const log = [];
    let best = null;
    let n = 0;
    this._genBusy = true;
    this.lastGenParams = params;

    const rank = (v) => !v ? 9999 : ((v.accepted ? 0 : 1000) + (v.solve && v.solve.solvable ? 0 : 500) + (v.zeroSkill && v.zeroSkill.shortcut ? 200 : 0) + (v.lint && !v.lint.ok ? 100 : 0) + v.reasons.length);
    const finish = () => {
      this._genBusy = false;
      try { this._applyGenerated(best.data, best.verdict, params.difficulty, log); }
      catch (err) { console.error('[LevelEditor] generateVerified apply error:', err); }
      if (opts.closeModal) this.closeGenerateModal();
    };
    const step = () => {
      n++;
      try {
        const seed = this._newSeed();
        let data = ProceduralMapEngine.generate(Object.assign({}, params, { seed }));
        if (params.includeMovingPlatform && typeof MovingPlatformArchitect !== 'undefined') {
          data = MovingPlatformArchitect.injectMovingPlatforms(data, { seed });
        }
        data.seed = seed;
        data.genParams = params;
        let verdict = null;
        if (canVerify) {
          verdict = LevelSolver.evaluate(data, {
            bands: LevelEditor.DIFFICULTY_BANDS,
            lint: (typeof LevelLint !== 'undefined') ? LevelLint : null,
            targetBand,
            solve: { maxMillis: opts.maxMillis || 700, maxNodes: opts.maxNodes || 3000 }
          });
        }
        log.push({ n, seed, accepted: !!(verdict && verdict.accepted), reasons: verdict ? verdict.reasons : [], band: verdict ? verdict.band : null, score: verdict && verdict.score ? verdict.score.total : null });
        if (!best || rank(verdict) < rank(best.verdict)) best = { data, verdict };
        if (statusBox) {
          statusBox.style.display = 'block';
          statusBox.innerHTML = `<div style="color:#ffcc00; font-size:12px;">🔎 검증 생성 중… ${n}/${attempts}</div>
            <div style="color:#a0e8ff; font-size:11px;">${log.map(l => `#${l.n} ${l.accepted ? '✅' : '✖'} ${l.band || ''} ${l.score != null ? l.score + 'pt' : ''} ${l.reasons.join(', ')}`).join('<br>')}</div>`;
        }
        if ((verdict && verdict.accepted) || n >= attempts || !canVerify) { finish(); return; }
      } catch (err) {
        console.error('[LevelEditor] generateVerified error:', err);
        if (!best) { this._genBusy = false; return; }
        finish(); return;
      }
      setTimeout(step, 0);
    };
    step();
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
      const v = this.levelData.verification;
      const score = (v && typeof v.score === 'number') ? v.score : (this.levelData.difficultyScore || 50);
      diff = LevelEditor.classifyDifficulty(score);
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

  // ============================================================================
  // [NEW] 난이도 밴드 단일 소스 — saveCurrentMap 과 솔버 평가가 같은 표를 쓴다.
  // ============================================================================
  static get DIFFICULTY_BANDS() {
    return [
      { key: 'easy', max: 45 },
      { key: 'normal', max: 80 },
      { key: 'hard', max: 130 },
      { key: 'nightmare', max: Infinity }
    ];
  }
  static classifyDifficulty(score) {
    const s = (typeof score === 'number' && !isNaN(score)) ? score : 50;
    for (const b of LevelEditor.DIFFICULTY_BANDS) if (s < b.max) return b.key;
    return 'nightmare';
  }

  deleteSelectedElement() {
    if (this.selectedElementIndex >= 0 && this.selectedElementIndex < this.levelData.elements.length) {
      this.levelData.elements.splice(this.selectedElementIndex, 1);
      this.selectedElementIndex = -1;
      this.selectedSpecial = null;
      this.saveHistory();
      this.syncTerrain();
      this.updateStatus();
      SFX.playExplosion();
    }
  }

  setTool(tool) {
    if (tool === 'delete') {
      if (this.selectedElementIndex >= 0 && this.selectedElementIndex < this.levelData.elements.length) {
        this.deleteSelectedElement();
        return;
      }
    }
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
    if (tool !== 'select' && tool !== 'delete') {
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

  adjustSelectedRange(delta) {
    if (this.selectedElementIndex < 0 || this.selectedElementIndex >= this.levelData.elements.length) return;
    const el = this.levelData.elements[this.selectedElementIndex];
    if (el.type !== 'movingPlatform') return;

    const oldR = el.range || 120;
    const targetR = this.snap ? this.snapCoord(oldR + delta) : (oldR + delta);
    const newR = Math.max(20, Math.min(650, targetR));
    if (newR === oldR) return;

    el.range = newR;
    this.saveHistory();
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
    this.runLint();
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
      const rangeGroup = document.getElementById('editor-selected-range-group');
      const rangeVal = document.getElementById('editor-selected-range-val');

      if (el.type === 'movingPlatform') {
        const axisText = el.axis === 'vertical' ? '↕ 상하' : '↔ 좌우';
        if (info) info.innerHTML = `<span style="color:#00f3ff; font-weight:700;">선택: [⚡ 무빙발판 (${axisText})]</span> ${el.w}×${el.h}px | 범위: ${el.range || 120}px | 속도: ${el.speed || 0.75} | <span style="color:#ffb700;">[단축키 [: 범위-, ]: 범위+, X: ↔/↕ 전환]</span>`;
        if (rangeGroup) rangeGroup.style.display = 'flex';
        if (rangeVal) rangeVal.innerText = `${el.range || 120}px`;
      } else {
        if (info) info.innerText = `선택: [${el.type.toUpperCase()}] ${el.w}×${el.h}px | 위치: (${el.x}, ${el.y}) | 🎨 ${pal.name}`;
        if (rangeGroup) rangeGroup.style.display = 'none';
      }
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
      let extra = '';
      if (typeof this.levelData.seed === 'number') extra += ` | 🎲 seed ${this.levelData.seed}${this.seedLock ? '🔒' : ''}`;
      if (this.lintResult) extra += ` | ${this.lintResult.ok ? '🧪' : '⛔'} ${this.lintResult.summary}${this.showLint ? '' : ' (마커 숨김 H)'}`;
      const v = this.levelData.verification;
      if (v) extra += v.solvable ? ` | ✅ 검증 ${v.band ? v.band.toUpperCase() : ''} ${v.score != null ? v.score + 'pt' : ''} (${v.requiredSkills}스킬)` : ' | ❌ 솔버 미해결';
      if (info) info.innerText = `도구: ${this.selectedTool.toUpperCase()} | 오브젝트: ${count}개 | 🚪 스폰:(${this.levelData.spawnX},${this.levelData.spawnY}) 🌀 웜홀:(${this.levelData.gateX},${this.levelData.gateY})${dnaInfo}${extra}`;
      if (selectedControls) selectedControls.style.display = 'none';
    }
  }

  exportToJSON() {
    if (this.game && this.game.stageMgr) {
      this.game.stageMgr.openModal('tab-json');
    }
  }

  exitEditor() {
    this.unbindKeyboard();
    this.game.exitEditor();
  }

  saveHistory() {
    const json = JSON.stringify(this.levelData);
    if (this.history[this.history.length - 1] !== json) {
      this.history.push(json);
      if (this.history.length > this.maxHistory) {
        this.history.shift();
      }
      this.redoStack = [];
      this.solverOverlay = null;
    }
  }

  undo() {
    if (this.history.length > 1) {
      this.redoStack.push(this.history.pop());
      const prev = this.history[this.history.length - 1];
      this.levelData = JSON.parse(prev);
      this.selectedElementIndex = -1;
      this.selectedSpecial = null;
      this.solverOverlay = null;
      this.syncTerrain();
      this.updateStatus();
      if (typeof SFX !== 'undefined' && SFX.playClick) SFX.playClick();
    }
  }

  redo() {
    if (this.redoStack.length > 0) {
      const next = this.redoStack.pop();
      this.history.push(next);
      if (this.history.length > this.maxHistory) this.history.shift();
      this.levelData = JSON.parse(next);
      this.selectedElementIndex = -1;
      this.selectedSpecial = null;
      this.solverOverlay = null;
      this.syncTerrain();
      this.updateStatus();
      if (typeof SFX !== 'undefined' && SFX.playClick) SFX.playClick();
    }
  }

  // ============================================================================
  // [NEW] 키보드 단축키
  // ============================================================================
  bindKeyboard() {
    if (this._keyHandler || typeof window === 'undefined') return;
    this._keyHandler = (e) => this.handleKeyDown(e);
    window.addEventListener('keydown', this._keyHandler);
  }
  unbindKeyboard() {
    if (this._keyHandler && typeof window !== 'undefined') {
      window.removeEventListener('keydown', this._keyHandler);
      this._keyHandler = null;
    }
  }
  isEditorActive() {
    if (typeof document === 'undefined') return false;
    const overlay = document.getElementById('editor-overlay');
    if (overlay && overlay.style && overlay.style.display === 'none') return false;
    if (typeof GAME_STATE !== 'undefined' && GAME_STATE.EDITOR !== undefined && this.game &&
        this.game.gameState !== undefined && this.game.gameState !== GAME_STATE.EDITOR) return false;
    const modals = ['modal-editor-generate', 'modal-editor-props', 'modal-solution-guide', 'modal-stage-manager', 'modal-save-slot', 'modal-editor-lint'];
    for (const id of modals) {
      const m = document.getElementById(id);
      if (m && m.style && m.style.display && m.style.display !== 'none') return false;
    }
    return true;
  }
  handleKeyDown(e) {
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
    if (!this.isEditorActive()) return;
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key;
    const stop = () => { e.preventDefault(); e.stopPropagation(); };

    if (mod && (key === 'z' || key === 'Z')) { stop(); if (e.shiftKey) this.redo(); else this.undo(); return; }
    if (mod && (key === 'y' || key === 'Y')) { stop(); this.redo(); return; }
    if (mod && (key === 'd' || key === 'D')) { stop(); this.duplicateSelected(); return; }
    if (mod && (key === 'm' || key === 'M')) { stop(); this.mirrorLevel(); return; }
    if (mod) return;

    switch (key) {
      case 'Delete':
      case 'Backspace': stop(); this.deleteSelectedElement(); return;
      case 'Escape': stop(); this.selectedElementIndex = -1; this.selectedSpecial = null; this.setTool('select'); return;
      case 'ArrowLeft': stop(); this.nudgeSelected(-1, 0, e.shiftKey); return;
      case 'ArrowRight': stop(); this.nudgeSelected(1, 0, e.shiftKey); return;
      case 'ArrowUp': stop(); this.nudgeSelected(0, -1, e.shiftKey); return;
      case 'ArrowDown': stop(); this.nudgeSelected(0, 1, e.shiftKey); return;
      case '1': stop(); this.setTool('select'); return;
      case '2': stop(); this.setTool('platform'); return;
      case '3': stop(); this.setTool('craggyRock'); return;
      case '4': stop(); this.setTool('volcanicBasalt'); return;
      case '5': stop(); this.setTool('quantumCrystal'); return;
      case '6': stop(); this.setTool('rockWall'); return;
      case '7': stop(); this.setTool('steelBarrier'); return;
      case '8': stop(); this.setTool('spawn'); return;
      case '9': stop(); this.setTool('gate'); return;
      case '0': stop(); this.setTool('movingPlatform'); return;
      case 'v':
      case 'V': stop(); this.setTool('select'); return;
      case 'x':
      case 'X':
        if (this.selectedElementIndex >= 0 && this.selectedElementIndex < this.levelData.elements.length) {
          const el = this.levelData.elements[this.selectedElementIndex];
          if (el.type === 'movingPlatform') {
            stop();
            el.axis = (el.axis === 'vertical') ? 'horizontal' : 'vertical';
            this.saveHistory();
            this.updateStatus();
            this._toast(`발판 방향: ${el.axis === 'horizontal' ? '↔ 좌우 이동' : '↕ 상하 이동'}`);
            return;
          }
        }
        break;
      case '[':
        if (this.selectedElementIndex >= 0 && this.selectedElementIndex < this.levelData.elements.length) {
          stop();
          this.adjustSelectedRange(e.shiftKey ? -50 : -10);
          return;
        }
        break;
      case ']':
        if (this.selectedElementIndex >= 0 && this.selectedElementIndex < this.levelData.elements.length) {
          stop();
          this.adjustSelectedRange(e.shiftKey ? 50 : 10);
          return;
        }
        break;
      case 'l':
      case 'L': stop(); this.showLintReport(); return;
      case 'h':
      case 'H': stop(); this.showLint = !this.showLint; this.updateStatus(); return;
      case 't':
      case 'T': stop(); this.verifyWithSolver(); return;
      case 'g':
      case 'G': stop(); this.openGenerateModal(); return;
    }
  }

  nudgeSelected(dx, dy, large = false) {
    const step = (large ? 50 : 10);
    if (this.selectedSpecial === 'spawn') {
      this.levelData.spawnX = Math.max(30, Math.min(770, this.levelData.spawnX + dx * step));
      this.levelData.spawnY = Math.max(30, Math.min(420, this.levelData.spawnY + dy * step));
      this.saveHistory(); this.updateStatus(); return;
    }
    if (this.selectedSpecial === 'gate') {
      this.levelData.gateX = Math.max(30, Math.min(770, this.levelData.gateX + dx * step));
      this.levelData.gateY = Math.max(30, Math.min(420, this.levelData.gateY + dy * step));
      this.saveHistory(); this.updateStatus(); return;
    }
    if (this.selectedElementIndex < 0 || this.selectedElementIndex >= this.levelData.elements.length) return;
    const el = this.levelData.elements[this.selectedElementIndex];
    el.x = Math.max(0, Math.min(800 - el.w, el.x + dx * step));
    el.y = Math.max(0, Math.min(450 - el.h, el.y + dy * step));
    this.saveHistory(); this.syncTerrain(); this.updateStatus();
  }

  duplicateSelected() {
    if (this.selectedElementIndex < 0 || this.selectedElementIndex >= this.levelData.elements.length) return;
    const src = this.levelData.elements[this.selectedElementIndex];
    const copy = JSON.parse(JSON.stringify(src));
    copy.x = Math.max(0, Math.min(800 - copy.w, copy.x + this.snapSize * 2));
    copy.y = Math.max(0, Math.min(450 - copy.h, copy.y + this.snapSize * 2));
    this.levelData.elements.push(copy);
    this.selectedElementIndex = this.levelData.elements.length - 1;
    this.selectedSpecial = null;
    this.saveHistory(); this.syncTerrain(); this.updateStatus();
    if (typeof SFX !== 'undefined' && SFX.playBuild) SFX.playBuild();
  }

  mirrorLevel() {
    const W = 800;
    (this.levelData.elements || []).forEach(el => {
      el.x = W - el.x - el.w;
      if (Array.isArray(el.profile)) el.profile = el.profile.slice().reverse();
    });
    this.levelData.spawnX = W - this.levelData.spawnX;
    this.levelData.gateX = W - this.levelData.gateX;
    delete this.levelData.verification;
    this.saveHistory(); this.syncTerrain(); this.updateStatus();
    this._toast('↔ 좌우 반전 완료 (재검증 필요)', '#00f3ff');
  }

  _toast(msg, color) {
    if (this.game && this.game.particles && this.game.particles.spawnFloatingText) {
      this.game.particles.spawnFloatingText(400, 180, msg, color || '#00ff88');
    } else if (typeof console !== 'undefined') {
      console.log('[LevelEditor]', msg);
    }
  }

  runLint() {
    if (typeof LevelLint === 'undefined' || !LevelLint.run) { this.lintResult = null; return null; }
    try { this.lintResult = LevelLint.run(this.levelData); }
    catch (err) { console.warn('[LevelEditor] lint error:', err); this.lintResult = null; }
    return this.lintResult;
  }

  showLintReport() {
    const r = this.runLint();
    if (!r) { this._toast('LevelLint.js 가 로드되지 않았습니다', '#ff8080'); return; }
    const modal = document.getElementById('modal-editor-lint');
    const box = document.getElementById('lint-report');
    const icon = (lv) => lv === 'error' ? '⛔' : (lv === 'warn' ? '⚠️' : 'ℹ️');
    if (modal && box) {
      box.innerHTML = `<div style="font-weight:bold; margin-bottom:6px;">${r.ok ? '✅' : '⛔'} ${r.summary}</div>` +
        (r.issues.length ? r.issues.map(i =>
          `<div class="lint-item lint-${i.level}" data-idx="${typeof i.elementIndex === 'number' ? i.elementIndex : ''}" style="cursor:${typeof i.elementIndex === 'number' ? 'pointer' : 'default'}; padding:3px 0;">${icon(i.level)} <b>${i.code}</b> ${i.msg}</div>`).join('')
          : '<div>문제 없음 🎉</div>');
      box.querySelectorAll('.lint-item[data-idx]').forEach(div => {
        div.onclick = () => {
          const idx = parseInt(div.dataset.idx, 10);
          if (!isNaN(idx)) { this.selectedElementIndex = idx; this.selectedSpecial = null; this.setTool('select'); this.updateStatus(); }
          modal.style.display = 'none';
        };
      });
      modal.style.display = 'flex';
    } else {
      const lines = r.issues.slice(0, 14).map(i => `${icon(i.level)} ${i.code} ${i.msg}`);
      if (r.issues.length > 14) lines.push(`… 외 ${r.issues.length - 14}건`);
      if (typeof window !== 'undefined' && window.alert) window.alert(`🧪 레벨 린트 — ${r.summary}\n\n${lines.join('\n') || '문제 없음 🎉'}`);
    }
    if (typeof SFX !== 'undefined' && SFX.playClick) SFX.playClick();
  }

  verifyWithSolver(opts = {}) {
    if (typeof LevelSolver === 'undefined' || !LevelSolver.evaluate) { this._toast('LevelSolver.js 가 로드되지 않았습니다', '#ff8080'); return null; }
    let verdict = null;
    try {
      verdict = LevelSolver.evaluate(this.levelData, Object.assign({
        bands: LevelEditor.DIFFICULTY_BANDS,
        lint: (typeof LevelLint !== 'undefined') ? LevelLint : null,
        targetBand: null
      }, opts));
    } catch (err) {
      console.error('[LevelEditor] solver error:', err);
      this._toast('솔버 오류: ' + err.message, '#ff8080');
      return null;
    }
    this.lastVerdict = verdict;
    this._storeVerification(verdict);
    this._overlayFromVerdict(verdict);
    this.updateStatus();
    const s = verdict.solve;
    if (s && s.solvable) {
      this._toast(`✅ 풀림: ${s.plan.map(a => a.skill.toUpperCase()).join('→')} · ${verdict.score.total}pt ${verdict.band.toUpperCase()} · critical ${verdict.timing.criticalActions} · 대체 ${verdict.alternatives.count} (${verdict.adapter})`, '#00ff88');
    } else {
      this._toast(`❌ 솔버가 해답을 못 찾음 (${s ? s.reason : '?'}) · ${verdict.reasons.join(', ')}`, '#ff8080');
    }
    return verdict;
  }

  _storeVerification(verdict) {
    if (!verdict) return;
    const s = verdict.solve || {};
    this.levelData.verification = {
      adapter: verdict.adapter,
      solvable: !!s.solvable,
      plan: s.plan || null,
      score: verdict.score ? verdict.score.total : null,
      scoreParts: verdict.score ? verdict.score.parts : null,
      band: verdict.band,
      requiredSkills: s.requiredSkills != null ? s.requiredSkills : null,
      criticalActions: verdict.timing ? verdict.timing.criticalActions : null,
      minWindow: verdict.timing ? verdict.timing.minWindow : null,
      alternatives: verdict.alternatives ? verdict.alternatives.count : null,
      zeroSkillShortcut: !!(verdict.zeroSkill && verdict.zeroSkill.shortcut),
      lintOk: verdict.lint ? verdict.lint.ok : null,
      reasons: verdict.reasons,
      nodes: s.nodes,
      checkedAt: new Date().toISOString()
    };
  }

  _overlayFromVerdict(verdict) {
    if (!verdict || typeof LevelSolver === 'undefined') { this.solverOverlay = null; return; }
    try {
      if (verdict.solve && verdict.solve.solvable) {
        const rp = LevelSolver.replay(this.levelData, verdict.solve.plan, { record: true });
        this.solverOverlay = { trail: rp.trail, actions: rp.actions, deaths: rp.deaths, plan: verdict.solve.plan, timing: verdict.timing, failed: !rp.success };
      } else {
        const z = verdict.zeroSkill || {};
        this.solverOverlay = { trail: z.trail || [], actions: [], deaths: z.deaths || [], plan: [], timing: null, failed: true };
      }
    } catch (err) { console.warn('[LevelEditor] overlay error:', err); this.solverOverlay = null; }
  }

  setSolverOverlay(overlay) { this.solverOverlay = overlay || null; }
  clearSolverOverlay() { this.solverOverlay = null; this.updateStatus(); }

  // Canvas interaction handlers
  handlePointerDown(x, y) {
    // Defensively reset any stuck drag state before starting new interaction
    this.isMovingSpawn = false;
    this.isMovingGate = false;
    this.isMovingElement = false;
    this.isResizingWidth = false;
    this.isResizingThickness = false;
    this.isDrawing = false;

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
      const rawW = Math.abs(this.dragCurrent.x - this.dragStart.x);
      const rawH = Math.abs(this.dragCurrent.y - this.dragStart.y);

      let x0, y0, w, h;

      if (rawW < 12 && rawH < 12) {
        // Single click placement! Provide generous default dimensions
        if (this.selectedTool === 'movingPlatform') {
          w = 100;
          h = 18;
        } else if (this.selectedTool === 'steelBarrier') {
          w = 20;
          h = 80;
        } else if (this.selectedTool === 'rockWall') {
          w = 40;
          h = 100;
        } else if (this.selectedTool === 'craggyRock' || this.selectedTool === 'volcanicBasalt' || this.selectedTool === 'quantumCrystal') {
          w = 120;
          h = 40;
        } else {
          // platform
          w = 140;
          h = 20;
        }
        x0 = this.snap ? this.snapCoord(this.dragStart.x - w / 2) : Math.round(this.dragStart.x - w / 2);
        y0 = this.snap ? this.snapCoord(this.dragStart.y - h / 2) : Math.round(this.dragStart.y - h / 2);
        x0 = Math.max(0, Math.min(800 - w, x0));
        y0 = Math.max(0, Math.min(450 - h, y0));
      } else {
        // Drag placement
        x0 = Math.min(this.dragStart.x, this.dragCurrent.x);
        y0 = Math.min(this.dragStart.y, this.dragCurrent.y);
        const minW = (this.selectedTool === 'steelBarrier' || this.selectedTool === 'rockWall') ? this.snapSize : this.snapSize * 2;
        const minH = (this.selectedTool === 'steelBarrier' || this.selectedTool === 'rockWall') ? this.snapSize : this.snapSize;
        w = this.snap ? Math.max(minW, this.snapCoord(rawW)) : Math.max(minW, Math.round(rawW));
        h = this.snap ? Math.max(minH, this.snapCoord(rawH)) : Math.max(minH, Math.round(rawH));
      }

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
      } else if (newEl.type === 'movingPlatform') {
        newEl.axis = 'horizontal';
        newEl.range = 120;
        newEl.speed = 1.0;
        newEl.pauseTicks = 30;
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

  findElementAt(x, y, pad = 5) {
    for (let i = this.levelData.elements.length - 1; i >= 0; i--) {
      const el = this.levelData.elements[i];
      const p = Math.max(pad, (el.h < 18 || el.w < 18) ? 7 : pad);
      if (x >= el.x - p && x <= el.x + el.w + p && y >= el.y - p && y <= el.y + el.h + p) {
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

    ctx.save();
    // 1.5 Dynamic Moving Platforms Rendering & Trajectory Guide in Editor
    if (this.levelData && this.levelData.elements) {
      this.levelData.elements.forEach((el, idx) => {
        if (el.type === 'movingPlatform' && typeof MovingPlatform !== 'undefined') {
          const isSelected = (this.selectedElementIndex === idx);
          const previewPlat = new MovingPlatform(el);
          previewPlat.render(ctx, true, isSelected);
        }
      });
    }

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
      if (ctx.roundRect) {
        ctx.roundRect(rx - 4, ry - 14, 8, 28, 4);
      } else {
        ctx.rect(rx - 4, ry - 14, 8, 28);
      }
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
      if (ctx.roundRect) {
        ctx.roundRect(hx - 28, hy - 6, 56, 12, 4);
      } else {
        ctx.rect(hx - 28, hy - 6, 56, 12);
      }
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
      const rawH = Math.abs(this.dragCurrent.y - this.dragStart.y);
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

    // [NEW] 3.5 린트 마커
    if (this.showLint && this.lintResult && this.lintResult.issues.length) {
      ctx.save();
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.font = 'bold 10px sans-serif';
      this.lintResult.issues.forEach(is => {
        if (typeof is.x !== 'number' || typeof is.y !== 'number') return;
        const color = is.level === 'error' ? '#ff3b3b' : (is.level === 'warn' ? '#ffb700' : 'rgba(0,243,255,0.8)');
        if (typeof is.w === 'number' && typeof is.h === 'number') {
          ctx.strokeStyle = color;
          ctx.lineWidth = 1.5;
          ctx.setLineDash([3, 3]);
          ctx.strokeRect(is.x, is.y, is.w, is.h);
          ctx.setLineDash([]);
        }
        ctx.fillStyle = color;
        ctx.fillText((is.level === 'error' ? '⛔ ' : (is.level === 'warn' ? '⚠ ' : 'ℹ ')) + is.code, is.x + 2, Math.max(10, is.y - 3));
      });
      ctx.restore();
    }

    // [NEW] 3.6 솔버 오버레이 (경로 / 스킬 지점 / 사망 지점)
    if (this.solverOverlay) {
      const ov = this.solverOverlay;
      ctx.save();
      if (ov.trail && ov.trail.length > 1) {
        ctx.strokeStyle = ov.failed ? 'rgba(255, 80, 80, 0.85)' : 'rgba(0, 255, 136, 0.85)';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 3]);
        ctx.beginPath();
        ov.trail.forEach((p, i) => { if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); });
        ctx.stroke();
        ctx.setLineDash([]);
      }
      (ov.actions || []).forEach((a, i) => {
        const win = ov.timing && ov.timing.windows && ov.timing.windows[i] ? ov.timing.windows[i] : null;
        ctx.fillStyle = win && win.critical ? '#ff5e5e' : '#ffcc00';
        ctx.beginPath(); ctx.arc(a.x, a.y - 8, 8, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#000'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(String(i + 1), a.x, a.y - 8);
        ctx.fillStyle = win && win.critical ? '#ff5e5e' : '#ffcc00';
        ctx.font = 'bold 10px Orbitron, sans-serif';
        ctx.fillText(a.skill.toUpperCase() + (win ? ` (-${win.early}/+${win.late})` : ''), a.x, a.y - 24);
      });
      (ov.deaths || []).forEach(d => {
        ctx.strokeStyle = '#ff3b3b'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(d.x - 6, d.y - 6); ctx.lineTo(d.x + 6, d.y + 6); ctx.moveTo(d.x + 6, d.y - 6); ctx.lineTo(d.x - 6, d.y + 6); ctx.stroke();
        ctx.fillStyle = '#ff3b3b'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        ctx.fillText(d.reason || 'dead', d.x, d.y + 8);
      });
      ctx.restore();
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

