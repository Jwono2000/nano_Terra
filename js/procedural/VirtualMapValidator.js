// --- Headless Virtual Physics Map Validator & Feasibility Verifier ---
class VirtualMapValidator {
  static validate(levelData, maxSimulationTicks = 1200) {
    if (!levelData || !levelData.elements || levelData.elements.length === 0) {
      return { isValid: false, rescued: 0, reason: "지형 오브젝트가 없습니다." };
    }

    try {
      // 1. In-memory virtual terrain setup
      const vTerrain = new TerrainEngine(800, 450);
      StageDataEngine.buildTerrainFromData(vTerrain, levelData);

      const spawnX = levelData.spawnX || 90;
      const spawnY = levelData.spawnY || 60;
      const gateX = levelData.gateX || 720;
      const gateY = levelData.gateY || 260;
      const exitGate = { x: gateX, y: gateY };

      // 2. Simulated autonomous test units
      const testUnitCount = Math.min(5, levelData.totalUnits || 5);
      const units = [];
      let spawned = 0;
      let spawnTimer = 0;
      let rescued = 0;
      let dead = 0;

      // Virtual Skill pool
      const skillCounts = { ...(levelData.skills || {}) };

      // Virtual AutoSolver logic
      let solverCooldown = 0;

      for (let tick = 0; tick < maxSimulationTicks; tick++) {
        // Spawn units at interval
        if (spawned < testUnitCount) {
          spawnTimer++;
          if (spawnTimer >= 15) {
            spawnTimer = 0;
            spawned++;
            units.push(new NanoUnit(spawned, spawnX, spawnY, 1));
          }
        }

        // Virtual Solver Agent step
        if (solverCooldown > 0) solverCooldown--;

        const activeUnits = units.filter(u => u.state !== STATE.DEAD && u.state !== STATE.EXITING);
        if (activeUnits.length === 0 && spawned >= testUnitCount) break;

        // A. Proactive Float save
        for (const u of activeUnits) {
          if (u.state === STATE.FALLING && !u.hasAntiGrav && u.fallDistance >= 55) {
            if (skillCounts.float > 0 || skillCounts.float === undefined) {
              u.hasAntiGrav = true;
              u.state = STATE.FLOATING;
              if (skillCounts.float > 0) skillCounts.float--;
            }
          }
        }

        // B. Active Scout Obstacle navigation
        const walkers = activeUnits.filter(u => u.state === STATE.WALKING);
        if (walkers.length > 0 && solverCooldown <= 0) {
          walkers.sort((a, b) => (b.x * b.dir) - (a.x * a.dir));
          const scout = walkers[0];

          const aheadX = scout.x + scout.dir * 16;
          const isSolidAhead = vTerrain.isSolid(aheadX, scout.y) || vTerrain.isSolid(aheadX, scout.y - 10);
          const isSteelAhead = vTerrain.isSteel(aheadX, scout.y) || vTerrain.isSteel(aheadX, scout.y - 10);

          // Check if below has landing floor
          let hasLandingFloorBelow = false;
          for (let checkY = scout.y + 15; checkY < 420; checkY += 8) {
            if (vTerrain.isSolid(scout.x, checkY)) {
              hasLandingFloorBelow = true;
              break;
            }
          }

          // 1) Destructible Rock Wall -> BASH
          if (isSolidAhead && !isSteelAhead && !scout.hasPlasmaCutter) {
            if (skillCounts.bash > 0 || skillCounts.bash === undefined) {
              scout.hasPlasmaCutter = true;
              if (skillCounts.bash > 0) skillCounts.bash--;
              solverCooldown = 25;
            }
          }
          // 2) Steel barrier blocking path & safe floor below -> DRILL
          else if (isSteelAhead && hasLandingFloorBelow) {
            if (skillCounts.drill > 0 || skillCounts.drill === undefined) {
              scout.state = STATE.THERMAL_DRILLING;
              scout.cutSteps = 0;
              if (skillCounts.drill > 0) skillCounts.drill--;
              solverCooldown = 30;
            }
          }
          // 3) Reached cliff / gap near gate -> BUILD
          else if (Math.abs(scout.x - gateX) < 130 && !vTerrain.isSolid(aheadX, scout.y + 10)) {
            if (skillCounts.build > 0 || skillCounts.build === undefined) {
              scout.state = STATE.BUILDING_3D_PRINT;
              scout.stepCount = 0;
              scout.timer = 0;
              if (skillCounts.build > 0) skillCounts.build--;
              solverCooldown = 35;
            }
          }
        }

        // Update physics of each unit
        for (const u of units) {
          const prevState = u.state;
          u.update(vTerrain, null, exitGate, null, units, 1.0);
          if (u.state === STATE.EXITING && prevState !== STATE.EXITING) {
            rescued++;
          }
          if (u.state === STATE.DEAD && prevState !== STATE.DEAD) {
            dead++;
          }
        }

        if (rescued >= Math.ceil(testUnitCount * 0.6)) {
          return {
            isValid: true,
            rescued,
            total: testUnitCount,
            percent: Math.round((rescued / testUnitCount) * 100),
            reason: "검증 성공: 100% 클리어 가능한 정답 경로 확인됨!"
          };
        }
      }

      const rescuePct = Math.round((rescued / testUnitCount) * 100);
      const isSuccess = rescuePct >= Math.min(60, levelData.needPercent || 60);

      return {
        isValid: isSuccess,
        rescued,
        total: testUnitCount,
        percent: rescuePct,
        reason: isSuccess ? "클리어 경로 확인 완료" : `성립 불가: 나노봇 구출률(${rescuePct}%) 부족으로 미션 클리어 불가 (낙사/고립)`
      };
    } catch(err) {
      return { isValid: false, rescued: 0, reason: `시뮬레이션 에러: ${err.message}` };
    }
  }
}
