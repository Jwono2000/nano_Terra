// --- Application Entry Point & URL Router ---
async function initApp() {
  // 1. Load Campaign stages from JSON
  await StageManager.loadCampaignLevels();

  // 2. Initialize Game Engine
  window.game = new GameEngine();

  // 3. Check URL search params for direct mode routing
  const params = new URLSearchParams(window.location.search);
  const mode = params.get('mode');
  const lvlParam = params.get('level');
  const levelIdx = (lvlParam !== null) ? Math.max(0, parseInt(lvlParam) - 1) : 0;

  if (mode === 'editor') {
    window.game.loadLevel(levelIdx, false);
    window.game.enterEditor();
  } else if (mode === 'props') {
    window.game.loadLevel(levelIdx, false);
    window.game.enterEditor();
    window.game.editor.openPropsModal();
  } else if (mode === 'generate') {
    window.game.loadLevel(levelIdx, false);
    window.game.enterEditor();
    window.game.editor.openGenerateModal();
  } else if (mode === 'test_gen') {
    window.game.loadLevel(levelIdx, false);
    window.game.enterEditor();
    const gen = ProceduralMapEngine.generate({
      difficulty: params.get('diff') || 'normal',
      layout: params.get('layout') || 'random',
      theme: params.get('theme') || 'random',
      palette: params.get('palette') || 'random'
    });
    window.game.editor.levelData = gen;
    if (window.game.bgImg) window.game.bgImg.src = gen.bgImg;
    window.game.editor.syncTerrain();
    window.game.editor.updateStatus();
  } else if (mode === 'guide') {
    window.game.loadLevel(levelIdx, false);
    window.game.enterEditor();
    window.game.editor.openSolutionGuideModal();
  } else if (mode === 'auto_solve') {
    window.game.loadLevel(levelIdx, false);
    window.game.gameState = GAME_STATE.PLAYING;
    window.game.setSpeed(1);
    window.game.spawnTimer = 180;
    const curLvl = window.game.isCustomPlay ? window.game.activeCustomData : LEVELS[window.game.currentLevelIdx];
    window.game.autoSolver.start(window.game, curLvl);
  } else if (mode === 'stagemanager') {
    window.game.loadLevel(levelIdx, false);
    window.game.stageMgr.openModal();
  } else {
    // Standard game boot with briefing modal
    window.game.loadLevel(levelIdx, true);
  }

  // 4. Start Render & Game Loop
  requestAnimationFrame((t) => window.game.gameLoop(t));
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
