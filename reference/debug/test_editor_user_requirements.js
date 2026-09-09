const assert = require('assert');

// 1. Mock DOM environment
global.document = {
  elements: {},
  getElementById(id) {
    if (!this.elements[id]) {
      this.elements[id] = { id, style: {}, innerHTML: '', innerText: '', value: '', classList: { toggle() {} } };
    }
    return this.elements[id];
  },
  querySelectorAll() {
    return [];
  }
};

global.performance = { now: () => Date.now() };
global.SFX = {
  playClick() {}, playBuild() {}, playTeleport() {}, playExplosion() {}
};

// 2. Load engines
const { FullCanvasLevelArchitect } = require('../../js/procedural/FullCanvasLevelArchitect.js');
global.FullCanvasLevelArchitect = FullCanvasLevelArchitect;
const { ProceduralMapEngine } = require('../../js/procedural/ProceduralMapEngine.js');
global.ProceduralMapEngine = ProceduralMapEngine;

// Mock StageDataEngine
global.StageDataEngine = {
  createDefaultStage: () => ({
    id: 'TEST_STAGE',
    title: 'Test Stage',
    spawnX: 90, spawnY: 60,
    gateX: 710, gateY: 254,
    elements: [
      { type: 'platform', x: 40, y: 150, w: 260, h: 24, palette: 'cyan' },
      { type: 'steelBarrier', x: 40, y: 85, w: 20, h: 65 }
    ]
  }),
  buildTerrainFromData: () => {}
};

global.TERRAIN_PALETTES = {
  cyan: { name: 'CYBER' }, red: { name: 'MAGMA' }, brown: { name: 'DIRT' }, green: { name: 'BIO' }, purple: { name: 'VOID' }
};

// Load LevelEditor
const LevelEditor = require('../../js/editor/LevelEditor.js');

console.log('=== RUNNING COMPREHENSIVE USER REQUIREMENTS TEST ===\n');

// -------------------------------------------------------------
// REQUIREMENT 1: 강철벽 가로/세로 10px 단위 및 최소 10px 유지 검증
// -------------------------------------------------------------
console.log('--- [1] Testing SteelBarrier 10px Snapping & Minimums ---');
const editor = new LevelEditor({
  terrain: {},
  exitEditor: () => {}
});

// A. Check initial steelBarrier of w: 20, h: 65
assert.strictEqual(editor.levelData.elements[1].w, 20, 'Initial steel barrier width is 20');
assert.strictEqual(editor.levelData.elements[1].h, 65, 'Initial steel barrier height is 65');

// B. Select steel barrier via 'select' tool
editor.setTool('select');
editor.handlePointerDown(50, 100); // inside the steelBarrier (x: 40, y: 85, w: 20, h: 65)
assert.strictEqual(editor.selectedElementIndex, 1, 'Steel barrier is selected');
// Crucial: The width must NOT jump to 30px upon selection!
assert.strictEqual(editor.levelData.elements[1].w, 20, 'Steel barrier width MUST REMAIN 20 upon selection (NOT forced to 30!)');
console.log('✓ Selection of 20px steel barrier preserved width=20px (did not force to 30px)');

// C. Test adjustSelectedWidth delta -10
editor.adjustSelectedWidth(-10);
assert.strictEqual(editor.levelData.elements[1].w, 10, 'Steel barrier width reduced to 10px');
console.log('✓ Steel barrier width reduced to minimum 10px');

// D. Test adjustSelectedWidth delta +10
editor.adjustSelectedWidth(10);
assert.strictEqual(editor.levelData.elements[1].w, 20, 'Steel barrier width increased to 20px');
console.log('✓ Steel barrier width adjusted to 20px in 10px increment');

// E. Test adjustSelectedThickness
editor.adjustSelectedThickness(-10);
assert.strictEqual(editor.levelData.elements[1].h, 60, 'Steel barrier height snapped to 60px');
editor.adjustSelectedThickness(-50);
assert.strictEqual(editor.levelData.elements[1].h, 10, 'Steel barrier height can be reduced to 10px');
console.log('✓ Steel barrier height can be adjusted in 10px increments down to 10px');

// F. Draw new steel barrier with 10px width
editor.setTool('steelBarrier');
editor.handlePointerDown(400, 200);
editor.handlePointerMove(410, 250);
editor.handlePointerUp(410, 250);
const newSteel = editor.levelData.elements[editor.levelData.elements.length - 1];
assert.strictEqual(newSteel.type, 'steelBarrier');
assert.strictEqual(newSteel.w, 10, 'Newly drawn steel barrier is exactly 10px wide');
console.log('✓ Newly created steel barrier supports 10px width');

// -------------------------------------------------------------
// REQUIREMENT 2: 입구(SPAWN), 출구(GATE) '선택' 도구 모드에서 선택 및 이동 검증
// -------------------------------------------------------------
console.log('\n--- [2] Testing Spawn and Gate Selection in "Select" Mode ---');
editor.setTool('select');

// Click on the Spawn canopy (y=30 above spawn center y=60)
editor.handlePointerDown(90, 30);
assert.strictEqual(editor.selectedSpecial, 'spawn', 'Spawn is selected even when clicking upper canopy');
assert.strictEqual(editor.selectedElementIndex, -1, 'Elements underneath are not selected');
console.log('✓ Spawn successfully selected via canopy in "select" mode');

// Drag Spawn
editor.handlePointerMove(120, 50); // delta +30, +20
assert.strictEqual(editor.levelData.spawnX, 120, 'Spawn X moved smoothly to 120');
assert.strictEqual(editor.levelData.spawnY, 80, 'Spawn Y moved smoothly to 80');
editor.handlePointerUp(120, 50);
console.log('✓ Spawn moved smoothly via mouse delta without coordinate jumps');

// Click on the Gate
editor.handlePointerDown(715, 250);
assert.strictEqual(editor.selectedSpecial, 'gate', 'Gate is selected in "select" mode');
console.log('✓ Gate successfully selected in "select" mode');

// Drag Gate
editor.handlePointerMove(685, 270);
assert.strictEqual(editor.levelData.gateX, 680, 'Gate X moved smoothly to 680');
editor.handlePointerUp(685, 270);
console.log('✓ Gate moved smoothly via mouse delta');

// -------------------------------------------------------------
// REQUIREMENT 3: 맵 생성할 때 즉시 생성 누를 때마다 매번 새로운 맵 생성 검증
// -------------------------------------------------------------
console.log('\n--- [3] Testing Repeatable Instant Map Generation ---');
const modal = document.getElementById('modal-editor-generate');
modal.style.display = 'flex';

const mapSignatures = new Set();
for (let i = 1; i <= 5; i++) {
  editor.executeGenerate(false); // keep modal open, like clicking '🎲 즉시 생성'
  
  // Modal must stay open
  assert.strictEqual(modal.style.display, 'flex', 'Modal remains open during continuous generation');
  
  // Status box must be updated
  const statusBox = document.getElementById('gen-modal-status');
  assert.strictEqual(statusBox.style.display, 'block', 'Status box displays feedback');
  assert.ok(statusBox.innerHTML.includes('새 맵 생성 완료'), 'Status box contains success message');

  // Verify each generated map is uniquely randomized
  const sig = `${editor.levelData.title}_${editor.levelData.spawnX}_${editor.levelData.gateX}_${editor.levelData.elements.length}`;
  assert.ok(!mapSignatures.has(sig), `Map #${i} must be unique (${sig})`);
  mapSignatures.add(sig);
  console.log(`✓ Click #${i} generated distinct map: ${editor.levelData.title} (${editor.levelData.elements.length} elements)`);
}

// Close via apply button
editor.closeGenerateModal();
assert.strictEqual(modal.style.display, 'none', 'Modal closed upon confirming');
console.log('✓ Modal closed successfully via confirm button');

console.log('\n=== ALL 3 USER REQUIREMENTS VERIFIED AND PASSED 100%! ===');
