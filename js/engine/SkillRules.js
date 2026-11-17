/* ============================================================================
 * SkillRules.js — 스킬 적용 규칙 단일 소스 (Single Source of Truth)
 *
 * GameEngine(실제 플레이)과 ForgeSim(맵 생성기 헤드리스 검증)이 "완전히 같은"
 * 스킬 적용 판정을 쓰도록 분리한 순수 로직입니다. UI/사운드/진동은 호출자 책임.
 *
 *   SkillRules.apply(terrain, unit, skillKey, particles?) → { applied, color }
 *
 * portal 은 유닛이 아니라 좌표에 설치하므로 여기서 다루지 않습니다.
 * ==========================================================================*/
(function (root) {
  'use strict';

  function getState() {
    if (typeof STATE !== 'undefined') return STATE;
    if (root && root.STATE) return root.STATE;
    throw new Error('SkillRules: STATE (NanoUnit.js) is not loaded');
  }

  function burst(particles, x, y, color, n, s) {
    if (particles && particles.spawnBurst) particles.spawnBurst(x, y, color, n, s);
  }
  function popText(particles, x, y, t, c) {
    if (particles && particles.spawnFloatingText) particles.spawnFloatingText(x, y, t, c);
  }
  function stop(unit) {
    if (unit && typeof unit.stopSounds === 'function') unit.stopSounds();
  }

  const SkillRules = {
    SKILLS: ['climb', 'float', 'bash', 'mine', 'drill', 'bomb', 'build', 'block', 'portal'],

    /** 유닛에게 스킬을 적용. 실패(적용 불가) 시 applied=false (스킬 소모 안 함) */
    apply(terrain, unit, skillKey, particles) {
      const S = getState();
      const res = { applied: false, color: '#00f3ff', steelHit: false };
      if (!unit || unit.state === S.DEAD || unit.state === S.EXITING) return res;
      const isFalling = (unit.state === S.FALLING || unit.state === S.FLOATING);

      switch (skillKey) {
        case 'climb':
          if (!unit.hasMagnetizer) {
            unit.hasMagnetizer = true;
            res.applied = true; res.color = '#ffb700';
          }
          break;

        case 'float':
          if (!unit.hasAntiGrav) {
            unit.hasAntiGrav = true;
            if (unit.state === S.FALLING) unit.state = S.FLOATING;
            res.applied = true; res.color = '#00ff88';
          }
          break;

        case 'bash': {
          if (isFalling) return res;
          let hasWall = false, isSteelWall = false;
          for (let dist = 1; dist <= 12 && !hasWall; dist += 2) {
            const cx = unit.x + unit.dir * dist;
            for (let cy = -22; cy <= -2; cy += 4) {
              const py = unit.y + cy;
              if (terrain.isSolid(cx, py)) {
                hasWall = true;
                if (terrain.isSteel(cx, py)) isSteelWall = true;
                break;
              }
            }
          }
          if (hasWall && isSteelWall) { res.steelHit = true; return res; }
          if (hasWall) {
            stop(unit);
            unit.state = S.PLASMA_CUTTING;
            unit.hasPlasmaCutter = false;
            unit.cutSteps = 0;
            unit.cutStartY = Math.round(unit.y);
          } else {
            unit.hasPlasmaCutter = true; // 예약: 벽에 닿는 순간 자동 발사
          }
          res.applied = true; res.color = '#00f3ff';
          break;
        }

        case 'mine': {
          if (isFalling) return res;
          const ax = unit.x + unit.dir * 6;
          const steel = terrain.isSteel(ax, unit.y + 2) || terrain.isSteel(ax, unit.y - 4) ||
            terrain.isSteel(unit.x + unit.dir * 4, unit.y + 1) || terrain.isSteel(unit.x, unit.y + 1);
          if (steel) {
            burst(particles, unit.x + unit.dir * 4, unit.y - 4, '#ffffff', 8, 2.5);
            burst(particles, unit.x + unit.dir * 4, unit.y - 4, '#ffb700', 10, 3.2);
            popText(particles, unit.x, unit.y - 16, '🛡️ STEEL!', '#ffb700');
            res.steelHit = true;
            return res;
          }
          stop(unit);
          unit.state = S.DIAGONAL_MINING;
          unit.mineStartX = Math.round(unit.x);
          let floorY = Math.round(unit.y) + 1;
          for (let dy = -2; dy <= 4; dy++) {
            if (terrain.isSolid(unit.mineStartX, Math.round(unit.y) + dy)) { floorY = Math.round(unit.y) + dy; break; }
          }
          unit.mineStartY = floorY - 1;
          unit.mineDir = unit.dir;
          unit.cutSteps = 0;
          unit.exitSteps = 0;
          res.applied = true; res.color = '#f0a028';
          break;
        }

        case 'drill': {
          if (isFalling) return res;
          const steelFloor = terrain.isSteel(unit.x, unit.y + 1) || terrain.isSteel(unit.x, unit.y + 3) ||
            terrain.isSteel(unit.x - 4, unit.y + 2) || terrain.isSteel(unit.x + 4, unit.y + 2) ||
            terrain.isSteel(unit.x, unit.y + 5);
          if (steelFloor) {
            burst(particles, unit.x, unit.y, '#ffffff', 8, 2.5);
            burst(particles, unit.x, unit.y, '#ffb700', 10, 3.2);
            popText(particles, unit.x, unit.y - 16, '🛡️ STEEL!', '#ffb700');
            res.steelHit = true;
            return res;
          }
          stop(unit);
          unit.state = S.THERMAL_DRILLING;
          unit.cutSteps = 0;
          unit.exitSteps = 0;
          unit.vx = 0;
          unit.drillDir = unit.dir;
          res.applied = true; res.color = '#ff6600';
          break;
        }

        case 'bomb':
          if (unit.bombTimer <= 0) {
            unit.bombTimer = 240;
            res.applied = true; res.color = '#ff2255';
          }
          break;

        case 'build':
          if (isFalling) return res;
          stop(unit);
          unit.state = S.BUILDING_3D_PRINT;
          unit.stepCount = 0;
          unit.timer = 0;
          unit.buildFinishTimer = 0;
          res.applied = true; res.color = '#00f3ff';
          break;

        case 'block':
          if (isFalling) return res;
          stop(unit);
          if (unit.state === S.BLOCKING_SHIELD) {
            unit.state = S.WALKING;
            res.color = '#00f3ff';
          } else {
            unit.state = S.BLOCKING_SHIELD;
            res.color = '#00ff88';
          }
          res.applied = true;
          break;
      }
      return res;
    }
  };

  root.SkillRules = SkillRules;
  if (typeof module !== 'undefined' && module.exports) module.exports = { SkillRules };
})(typeof self !== 'undefined' ? self : (typeof globalThis !== 'undefined' ? globalThis : this));
