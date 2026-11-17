/* Node 환경에서 실제 게임 엔진(브라우저용 스크립트)을 헤드리스로 로드합니다.
 * - document/canvas/SFX 를 무동작 스텁으로 대체
 * - vm.runInThisContext 로 실행하여 class/const 가 전역 렉시컬 스코프에 등록됨
 * 사용: require('./loadEngine').load(); const { ForgeSim } = require('../../js/forge/ForgeSim.js');
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..');
let loaded = false;

function makeNoopProxy() {
  const target = function () {};
  const handler = {
    get(_t, prop) {
      if (prop === Symbol.toPrimitive) return () => 0;
      if (prop === 'width' || prop === 'height' || prop === 'length') return 0;
      return proxy;
    },
    set() { return true; },
    apply() { return proxy; },
    construct() { return proxy; }
  };
  const proxy = new Proxy(target, handler);
  return proxy;
}

function load(extra = []) {
  if (loaded) return;
  const noop = makeNoopProxy();
  const canvasStub = () => ({ width: 0, height: 0, getContext: () => noop, style: {} });
  if (typeof global.document === 'undefined') {
    global.document = {
      createElement: (tag) => (tag === 'canvas' ? canvasStub() : { style: {}, appendChild() {}, setAttribute() {} }),
      getElementById: () => null,
      querySelectorAll: () => [],
      addEventListener() {}
    };
  }
  if (typeof global.window === 'undefined') global.window = global;
  if (typeof global.navigator === 'undefined') global.navigator = {};
  if (typeof global.localStorage === 'undefined') {
    const store = {};
    global.localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
  }
  global.SFX = noop;
  if (typeof global.Image === 'undefined') global.Image = function () { return { complete: false, naturalWidth: 0 }; };

  const files = [
    'js/engine/TerrainEngine.js',
    'js/engine/MovingPlatform.js',
    'js/engine/JumpPad.js',
    'js/engine/NanoUnit.js',
    'js/engine/SkillRules.js',
    'js/editor/StageManager.js',
    ...extra
  ];
  for (const f of files) {
    const code = fs.readFileSync(path.join(ROOT, f), 'utf8');
    vm.runInThisContext(code, { filename: f });
  }
  loaded = true;
}

module.exports = { load, ROOT };
