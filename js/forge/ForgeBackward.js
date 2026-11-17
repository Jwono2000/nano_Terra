/* ============================================================================
 * ForgeBackward.js — Backward-Chaining Compositional Puzzle Generator (v4)
 *
 * 유저 퍼즐 설계 철학 구현:
 *  1. 출구(GoalVault)를 먼저 결정하고 진입 방향·고도·접근 잠금을 역추적(Backward)
 *  2. 점프패드 필수 성소는 점프패드에 접근하는 과정 자체를 잠금
 *     (전방 강철 봉쇄 + 후방 역진입 / 좌우 밀폐 상단 슈트 / 2단 점프패드 릴레이)
 *  3. 중추(MidHub)에서 강제 방향 전환(Reversal) + 다중 분기 선택 + 막힌/함정 경로 배치
 *  4. 시작(SpawnOrigin)에서 상단/중단/하단/무방어막 가두리 등 다양한 출발 지형 조합
 *  5. 미사용 [Zone × Band] 셀에 가짜 지름길·미끼 점프패드·강철 막다른 골목을 절차적 주입
 *  6. portal = 0 강제 유지 (차원포탈 보너스 전용)
 * ==========================================================================*/
(function (root) {
  'use strict';

  function getGeomHelpers() {
    if (root && root.ForgeGeom) return root.ForgeGeom;
    if (typeof require === 'function') {
      const fm = require('./ForgeModules.js');
      return { makeWorldGeom: fm.makeWorldGeom, stoneType: fm.stoneType };
    }
    throw new Error('ForgeBackward: ForgeModules.js (ForgeGeom) is not loaded');
  }

  function makeBands(dy) {
    return {
      HIGH: 112 + dy,   // 106..118
      MID:  200 + dy,   // 194..206 (HIGH+88: 안전 낙하 <= 96, 헤드룸 >= 58)
      LOW:  288 + dy,   // 282..294 (MID+88: 안전 낙하 <= 96, HIGH->LOW 176px 치명 낙사!)
      BASE: 362 + dy    // 356..368 (LOW+74: 안전 낙하 <= 96, MID->BASE 162px 치명 낙사!)
    };
  }

  /* =========================================================================
   * [LAYER 1] GOAL VAULTS — 출구 먼저 설계 (Zone R: x = 484..740)
   * =======================================================================*/
  const GOAL_VAULTS = {

    /**
     * G1: 고공 성소 + 역방향 점프패드 (up-left)
     * -> Mid(494..584) 우측 반사벽에서 방향 전환 후 드릴 -> Low 반사 -> 암벽 돌파 ->
     *    천장이 트인 우하단 역방향 점프패드(668, up-left)로 고공 성소(502..622) 역도약!
     */
    G_REVERSE_PAD: {
      id: 'G_REVERSE_PAD',
      layoutAlias: 'cascade',
      label: '고공 역방향 점프패드 성소',
      inBand: 'MID',
      tags: ['jumppad', 'jumppad_puzzle', 'reverse_entry', 'uturn'],
      build({ g, st, dir, Y }) {
        const yHigh = Y.HIGH;
        const yMid = Y.MID;
        const yLow = Y.LOW;
        const vaultY = yHigh + 16;
        const els = [];

        // Exit 고공 성소 (496..592) — 우측 끝(592)을 줄여 P=10.0 up-left 궤적이 오른쪽 모서리에 걸리지 않고 위에서 내리꽂힘
        els.push(g.steelWall(494, vaultY - 62, 18, 62));                  // 좌측 정면 강철벽 (직진 등반 차단)
        els.push(g.steelFloor(496, vaultY, 96, 16));
        els.push(g.steelWall(580, vaultY - 18, 14, 18));

        // Mid 짧은 상단 반사대 (494..584) — 끝 반사벽에서 -dir 로 돌아서서 드릴!
        els.push(g.steelFloor(494, yMid, 42, 18));
        els.push(g.slab(536, yMid, 48, 18, st));                          // 536..584 드릴 슈트
        els.push(g.steelWall(568, yMid - 58, 18, 58));                    // 반사벽 (+dir -> -dir)

        // Low 점프패드 진입 회랑 (494..736)
        els.push(g.steelWall(494, yLow - 58, 18, 58));                    // 좌측 반사벽 (-dir -> +dir)
        els.push(g.slab(494, yLow, 242, 18, st));
        els.push(g.wall(606, yLow - 58, 28, 58));                         // 점프패드 전방 관문 암벽
        els.push(g.jumpPad(676, yLow - 10, 'up-left', 10.0));             // 역도약 점프패드 (x~545 위쪽에서 안전 착지!)
        els.push(g.steelWall(718, yLow - 62, 18, 62));

        return {
          id: 'G_REVERSE_PAD',
          inBand: 'MID',
          els,
          gateX: Math.round(g.px(546)),
          gateY: vaultY - 26,
          occupied: ['R:HIGH', 'R:MID', 'R:LOW'],
          req: { drill: 1, bash: 1 },
          altBonus: { mine: 1 },
          makePlan: ({ scout }) => [
            { skill: 'drill', unit: scout, at: g.pt(552, yMid, 12), dir: -dir },
            { skill: 'bash',  unit: scout, at: g.pt(592, yLow, 16), dir }
          ],
          dna: ['DRILL', 'BASH'],
          hintEnd: '중단 끝 벽에 반사되어 역방향 드릴로 내려간 뒤, 하단 관문을 뚫어 역방향 점프패드로 고공 성소에 도약하십시오.'
        };
      }
    },

    /**
     * G2: 좌우 밀폐 강철 슈트 점프패드 + 상단 역방향 투하
     * -> 점프패드(576)가 좌우 강철벽(556, 622)에 갇혀 있어 지상 진입 불가!
     *    상단 반사벽(610)을 찍고 역방향으로 드릴(594)해 슈트 위로 직낙하!
     */
    G_DROP_CHUTE_PAD: {
      id: 'G_DROP_CHUTE_PAD',
      layoutAlias: 'traverse',
      label: '밀폐 강철 슈트 점프패드',
      inBand: 'MID',
      tags: ['jumppad', 'jumppad_puzzle', 'uturn', 'drop_chute'],
      build({ g, st, dir, Y }) {
        const yMid = Y.MID;
        const yLow = Y.LOW;
        const els = [];

        // Mid 상단 지붕 & 낮은 반사벽 (494..586) — drill(552) 오른쪽을 586에서 끊어 45도 도약시 천장 충돌 완전 제거
        els.push(g.steelFloor(494, yMid, 42, 18));                        // 494..536 조기 드릴 차단
        els.push(g.slab(536, yMid, 50, 18, st));                          // 536..586 슈트 천장 개방구간
        els.push(g.steelWall(568, yMid - 34, 18, 34));                    // 34px 반사벽 (+dir -> -dir)

        // Low 밀폐 점프패드 박스 (522..616)
        els.push(g.steelWall(522, yLow - 58, 18, 58));                    // 좌측 강철벽
        els.push(g.steelFloor(522, yLow, 96, 18));
        els.push(g.jumpPad(560, yLow - 10, 'up-right', 8.4));             // 600 벽 상공을 넘어 642..722 출구 섬 안착!
        els.push(g.steelWall(600, yLow - 42, 18, 42));                    // 42px 밀폐 우측 강철벽

        // 우측 공중 출구 섬 (642..740, yMid + 8)
        els.push(g.slab(642, yMid + 8, 98, 18, st));
        els.push(g.steelWall(722, yMid - 74, 18, 82));                    // 82px 높은 우측 가드 (점프 초과 탈선 방지)

        return {
          id: 'G_DROP_CHUTE_PAD',
          inBand: 'MID',
          els,
          gateX: Math.round(g.px(700)),
          gateY: (yMid + 8) - 26,
          occupied: ['R:MID', 'R:LOW'],
          req: { drill: 1 },
          altBonus: { bomb: 1 },
          makePlan: ({ scout }) => [
            { skill: 'drill', unit: scout, at: g.pt(550, yMid, 12), dir: -dir }
          ],
          dna: ['DRILL'],
          hintEnd: '점프패드가 좌우 강철 박스에 갇혀 있습니다. 위쪽 반사벽에 부딪혀 역방향으로 드릴해 상자 내부로 낙하하십시오.'
        };
      }
    },

    /**
     * G3: 정면 강철 봉쇄 + 후방 역습 요새 (rockWall 또는 halfSteel + 하단 steelFloor 보호)
     */
    G_BACKDOOR_FORTRESS: {
      id: 'G_BACKDOOR_FORTRESS',
      layoutAlias: 'zigzag',
      label: '후방 개통 강철 요새',
      inBand: 'MID',
      tags: ['backdoor', 'uturn', 'reverse_entry'],
      build({ g, st, dir, Y, tierIdx, R, allowBlock }) {
        const yMid = Y.MID;
        const yLow = Y.LOW;
        const useHalfSteel = allowBlock && tierIdx >= 3 && R() < 0.55;
        const els = [];

        // Mid 상부 강철 교량 (494..676) + 후방 드릴 포켓 (676..738)
        els.push(g.steelFloor(494, yMid, 182, 18));
        els.push(g.slab(676, yMid, 62, 18, st));
        els.push(g.steelWall(720, yMid - 62, 18, 62));

        // Low 출구 요새 (498..738) — 폭파 지점 아래를 강철판으로 보강해 바닥 뚫림 방지
        els.push(g.steelWall(498, yLow - 64, 18, 64));                    // 전면 강철 방패
        els.push(g.slab(498, yLow, 114, 20, st));                         // 498..612
        els.push(g.steelFloor(612, yLow, 66, 20));                        // 612..678 폭파 충격 보호 강철바닥
        els.push(g.slab(678, yLow, 60, 20, st));                          // 678..738
        if (useHalfSteel) {
          els.push(g.wall(626, yLow - 28, 22, 28));
          els.push(g.steelWall(622, yLow - 62, 30, 34));                  // 하프스틸 후문 (BOMB 전용)
        } else {
          els.push(g.wall(626, yLow - 58, 30, 58));                       // 암벽 후문 (역방향 BASH)
        }
        els.push(g.steelWall(720, yLow - 62, 18, 62));

        return {
          id: 'G_BACKDOOR_FORTRESS',
          inBand: 'MID',
          els,
          gateX: Math.round(g.px(564)),
          gateY: yLow - 26,
          occupied: ['R:MID', 'R:LOW'],
          tagsExtra: useHalfSteel ? ['half_steel', 'timing'] : [],
          req: useHalfSteel ? { drill: 1, block: 1, bomb: 1 } : { drill: 1, bash: 1 },
          altBonus: useHalfSteel ? {} : { bomb: 1 },
          makePlan: ({ scout, helper }) => {
            if (useHalfSteel) {
              return [
                { skill: 'drill', unit: scout, at: g.pt(694, yMid, 12), dir: -dir },
                { skill: 'block', unit: helper || scout, at: g.pt(658, yLow, 10), dir: -dir },
                { skill: 'bomb',  unit: 'blocker', at: g.pt(658, yLow, 12) }
              ];
            }
            return [
              { skill: 'drill', unit: scout, at: g.pt(694, yMid, 12), dir: -dir },
              { skill: 'bash',  unit: scout, at: g.pt(664, yLow, 14), dir: -dir }
            ];
          },
          dna: useHalfSteel ? ['DRILL', 'BLOCK', 'BOMB'] : ['DRILL', 'BASH'],
          hintEnd: useHalfSteel
            ? '요새 정면은 강철로 막혀 있습니다. 위에서 뒤쪽으로 돌아 내려와 방어막+코어 폭파로 하프-스틸 후문을 여십시오.'
            : '요새 정면은 강철입니다. 상단을 지나 뒤편으로 내려와 역방향 레이저로 후문을 뚫으십시오.'
        };
      }
    },

    /**
     * G4: 2단 점프패드 릴레이 (Low Pad A -> Mid 고공 반사 섬 -> Mid Pad B -> High Exit)
     */
    G_DOUBLE_PAD_RELAY: {
      id: 'G_DOUBLE_PAD_RELAY',
      layoutAlias: 'ascent',
      label: '이중 점프패드 고공 릴레이',
      inBand: 'LOW',
      tags: ['jumppad', 'jumppad_puzzle', 'double_pad', 'uturn'],
      build({ g, st, dir, Y }) {
        const yHigh = Y.HIGH;
        const yMid = Y.MID;
        const yLow = Y.LOW;
        const els = [];

        // Low 1차 접근 및 패드 A (494..720)
        els.push(g.slab(494, yLow, 226, 18, st));
        els.push(g.wall(556, yLow - 58, 30, 58));
        els.push(g.jumpPad(652, yLow - 10, 'up-left', 9.2));
        els.push(g.steelWall(704, yLow - 62, 18, 62));

        // Mid 중계 반사 섬 & 패드 B (494..608)
        els.push(g.steelWall(494, yMid - 58, 18, 58));                    // 좌측 강철 반사벽 (-dir -> +dir)
        els.push(g.steelFloor(494, yMid, 114, 18));
        els.push(g.jumpPad(560, yMid - 10, 'up-right', 8.4));             // Pad B: 고공 출구로 사출

        // High 출구 성소 (644..738)
        els.push(g.steelFloor(644, yHigh + 14, 94, 18));
        els.push(g.steelWall(720, yHigh - 48, 18, 62));

        return {
          id: 'G_DOUBLE_PAD_RELAY',
          inBand: 'LOW',
          els,
          gateX: Math.round(g.px(688)),
          gateY: (yHigh + 14) - 26,
          occupied: ['R:HIGH', 'R:MID', 'R:LOW'],
          req: { bash: 1 },
          altBonus: { bomb: 1 },
          makePlan: ({ scout }) => [
            { skill: 'bash', unit: scout, at: g.pt(540, yLow, 16), dir }
          ],
          dna: ['BASH'],
          hintEnd: '하단 1차 점프패드(역방향)를 타면 상단 반사 섬에 착지하며, 좌측 강철벽에 반사되어 2차 점프패드로 출구에 도달합니다.'
        };
      }
    },

    /**
     * G5: 무빙셔틀 점프 도킹 성채 (Low 도약 -> Mid 승강장 반사 -> 수평 셔틀 -> Exit 섬)
     */
    G_SKY_SHUTTLE_LOCK: {
      id: 'G_SKY_SHUTTLE_LOCK',
      layoutAlias: 'elevator',
      label: '무빙셔틀 점프 도킹 성채',
      inBand: 'LOW',
      tags: ['moving_platform', 'jumppad', 'jumppad_puzzle', 'uturn'],
      build({ g, st, dir, Y }) {
        const yMid = Y.MID;
        const yLow = Y.LOW;
        const els = [];

        // Low 승차 접근부 (494..692)
        els.push(g.slab(494, yLow, 198, 18, st));
        els.push(g.wall(548, yLow - 58, 28, 58));
        els.push(g.jumpPad(594, yLow - 10, 'up-left', 8.0));              // 도킹 승강장(494..548)으로 역도약
        els.push(g.steelWall(674, yLow - 62, 18, 62));

        // Mid 승강장 + 수평 무빙셔틀 + 출구 섬
        els.push(g.steelWall(494, yMid - 58, 18, 58));
        els.push(g.steelFloor(494, yMid, 54, 18));
        els.push(g.movingPlatform(548, yMid, 106, 16, 'horizontal', 18, { speed: 0.62, pauseTicks: 20 }));
        els.push(g.slab(648, yMid + 2, 90, 18, st));
        els.push(g.steelWall(720, yMid - 56, 18, 58));

        return {
          id: 'G_SKY_SHUTTLE_LOCK',
          inBand: 'LOW',
          els,
          gateX: Math.round(g.px(694)),
          gateY: (yMid + 2) - 26,
          occupied: ['R:MID', 'R:LOW'],
          req: { bash: 1 },
          altBonus: { build: 1 },
          makePlan: ({ scout }) => [
            { skill: 'bash', unit: scout, at: g.pt(532, yLow, 16), dir }
          ],
          dna: ['BASH'],
          hintEnd: '하단 암벽을 돌파하고 역방향 점프패드로 상단 승강장에 올라 반사된 뒤 무빙 셔틀을 타고 도킹하십시오.'
        };
      }
    },

    /**
     * G6: 심층 3단 이중반사 하프스틸 벙커
     * -> Mid(+1) 우측 끝 하강 -> Low(-1) 강철 지붕 왼쪽으로 역낙하 -> Base(+1) 반사 후 하프스틸 BOMB 돌파!
     */
    G_BASE_HALFSTEEL_BUNKER: {
      id: 'G_BASE_HALFSTEEL_BUNKER',
      layoutAlias: 'chamber',
      label: '심층 이중반사 하프스틸 벙커',
      inBand: 'MID',
      requiresBlock: true,
      tags: ['half_steel', 'timing', 'uturn', 'double_reversal'],
      build({ g, st, dir, Y }) {
        const yMid = Y.MID;
        const yLow = Y.LOW;
        const yBase = Y.BASE;
        const els = [];

        // Mid 유도 강철 교량 (494..668)
        els.push(g.steelFloor(494, yMid, 174, 18));

        // Low 강철 천장 + 우측 반사벽 (522..736)
        els.push(g.steelFloor(522, yLow, 214, 18));
        els.push(g.steelWall(718, yLow - 62, 18, 62));

        // Base 심층 성소 & 하프스틸 문 (484..738) — 폭파 지점(540..626) 강철 바닥으로 구멍 방지!
        els.push(g.steelWall(484, yBase - 58, 18, 58));                    // 좌측 강철 반사벽 (-dir -> +dir)
        els.push(g.steelFloor(484, yBase, 144, 20));                      // 484..628 강철 바닥 (코어 폭파 충격에도 안전)
        els.push(g.slab(628, yBase, 110, 20, st));
        els.push(g.wall(586, yBase - 32, 12, 32));
        els.push(g.steelWall(582, yBase - 66, 20, 34));                   // 하프스틸 문 (폭파 후 32px 통과 헤드룸 확보, BASH/CLIMB 불가)
        els.push(g.steelWall(720, yBase - 62, 18, 62));

        return {
          id: 'G_BASE_HALFSTEEL_BUNKER',
          inBand: 'MID',
          els,
          gateX: Math.round(g.px(672)),
          gateY: yBase - 26,
          occupied: ['R:MID', 'R:LOW', 'R:BASE'],
          req: { block: 1, bomb: 1 },
          altBonus: {},
          makePlan: ({ scout }) => [
            { skill: 'block', unit: scout, at: g.pt(575, yBase, 5), dir },
            { skill: 'bomb',  unit: 'blocker', at: g.pt(575, yBase, 8) }
          ],
          dna: ['BLOCK', 'BOMB'],
          hintEnd: '중단 끝에서 내려와 강철 지붕을 역주행해 최하단으로 떨어진 뒤, 좌측 벽 반사 후 하프-스틸 문을 방어막+코어 폭파로 여십시오.'
        };
      }
    }
  };

  /* =========================================================================
   * [LAYER 2 & 3] BACKWARD-CONNECTED FRONTEND CHAINS (Zone L + Zone M)
   * =======================================================================*/
  const FRONTEND_CHAINS = {

    /**
     * C1: HIGH 스폰 + 48px 강철벽 선봉(climb+float) + 반사암벽 역방향 계단 가교(reverse_bridge) + 본대 대각굴착
     */
    C_HIGH_REVERSE_BRIDGE: {
      id: 'C_HIGH_REVERSE_BRIDGE',
      layoutAlias: 'cascade',
      label: '상단 선봉 & 역방향 계단 가교',
      supportedTargets: ['MID', 'LOW'],
      forbidsBlock: false,
      tags: ['pioneer_split', 'fatal_drop', 'reverse_bridge', 'uturn'],
      build({ g, st, dir, Y, targetBand }) {
        const yHigh = Y.HIGH;
        const yMid = Y.MID;
        const yLow = Y.LOW;
        const yCatch = yHigh + 62; // ~174
        const els = [];

        // Zone L: HIGH 스폰 대기실 (64..256)
        els.push(g.steelWall(64, yHigh - 66, 18, 66));
        els.push(g.steelFloor(64, yHigh, 84, 16));
        els.push(g.slab(148, yHigh, 108, 16, st));                         // 본대 대각굴착 구간 (148..256)
        els.push(g.steelWall(238, yHigh - 48, 18, 48));                    // 48px 강철 가드 (x=256에서 하강 착지 x~274)

        // 본대 캐치 렛지 (174..234, yCatch) — 역계단 미완성 시 심연 추락!
        els.push(g.steelWall(174, yCatch - 42, 18, 42));
        els.push(g.slab(174, yCatch, 60, 16, st));

        // Zone M: 264..494 (234..264 = 30px 갭, build(272) -> 224 연결!)
        if (targetBand === 'MID') {
          els.push(g.slab(264, yMid, 230, 18, st));                        // 264..494
        } else {
          els.push(g.slab(264, yMid, 164, 18, st));                        // 264..428
          els.push(g.slab(424, yLow, 70, 18, st));                         // 424..494 (88px 안전 하강)
        }
        els.push(g.wall(354, yMid - 58, 28, 58));                          // 1차 반사 & 후속 돌파용 암벽!

        return {
          id: 'C_HIGH_REVERSE_BRIDGE',
          spawnX: Math.round(g.px(110)),
          spawnY: yHigh - 42,
          scoutUnit: 'pioneer1',
          helperUnit: 'crowd_lead',
          occupied: targetBand === 'LOW' ? ['L:HIGH', 'M:MID', 'M:LOW'] : ['L:HIGH', 'M:MID'],
          els,
          req: { climb: 1, float: 1, build: 1, bash: 1, mine: 1 },
          altBonus: { build: 1 },
          maxFloat: 1,
          makeFrontPlan: (goalPlan) => [
            { skill: 'climb', unit: 'pioneer1', at: g.pt(214, yHigh, 16), dir },
            { skill: 'float', unit: 'pioneer1', at: g.pt(232, yHigh, 16), dir },
            { skill: 'build', unit: 'pioneer1', at: g.pt(276, yMid, 10), dir: -dir },
            { skill: 'bash',  unit: 'pioneer1', at: g.pt(338, yMid, 16), dir },
            ...goalPlan,
            { skill: 'mine',  unit: 'crowd_lead', at: g.pt(186, yHigh, 12), dir, minSpawned: 7, wait: 180 }
          ],
          dnaFront: ['CLIMB', 'FLOAT', 'BUILD', 'BASH', 'MINE'],
          hintFront: '선발대 1명만 상단 벽을 흡착+역추진으로 넘어 중단 암벽에서 반사된 뒤 캐치 렛지로 역방향 계단을 건설하고, 본대를 대각굴착으로 합류시키십시오.'
        };
      }
    },

    /**
     * C2: 무방어막 천연 가두리 (block = 0!, 122px 월담 낙사 vs 88px 벽파괴 안전 낙하) + 중추 협곡 가교
     */
    C_NO_BLOCK_HOLD_PIT: {
      id: 'C_NO_BLOCK_HOLD_PIT',
      layoutAlias: 'split',
      label: '무방어막 지형 가두리 & 시간차 해방',
      supportedTargets: ['MID', 'LOW'],
      forbidsBlock: true,
      tags: ['no_block_pit', 'pioneer_split', 'fatal_drop', 'anti_climb'],
      build({ g, st, dir, Y, targetBand }) {
        const yHigh = Y.HIGH;
        const yMid = Y.MID;
        const yLow = Y.LOW;
        const els = [];

        // Zone L: HIGH 천연 가두리 (64..228) — 강철 바닥으로 즉시 드릴 차단!
        els.push(g.steelWall(64, yHigh - 66, 18, 66));
        els.push(g.steelFloor(64, yHigh, 164, 18));
        els.push(g.wall(196, yHigh - 34, 32, 34));                         // 34px 암벽 (등반 낙하 122px 낙사 / 파괴 낙하 88px 안전!)

        // Zone M: 중추 다리 & 돌파구 (236..494) — 다리 착지 높이는 항상 Y.MID(200) 유지해 112px 낙사 방지!
        els.push(g.slab(236, yMid, 128, 18, st));                          // 236..364
        // 364..406: 심연 42px 갭 (미건설 시 추락사!)
        if (targetBand === 'MID') {
          els.push(g.slab(406, yMid, 88, 18, st));                         // 406..494
        } else {
          els.push(g.slab(406, yMid, 58, 18, st));                         // 406..464 안전 착지
          els.push(g.slab(460, yLow, 34, 18, st));                         // 460..494 (88px 안전 하강)
        }
        els.push(g.wall(434, yMid - 58, 28, 58));

        return {
          id: 'C_NO_BLOCK_HOLD_PIT',
          spawnX: Math.round(g.px(116)),
          spawnY: yHigh - 42,
          scoutUnit: 'pioneer1',
          helperUnit: 'crowd_lead',
          occupied: targetBand === 'LOW' ? ['L:HIGH', 'M:MID', 'M:LOW'] : ['L:HIGH', 'M:MID'],
          els,
          req: { climb: 1, float: 1, build: 1, bash: 2 },
          altBonus: { build: 1 },
          forbidSkills: ['block'],
          maxFloat: 1,
          makeFrontPlan: (goalPlan) => [
            { skill: 'climb', unit: 'pioneer1', at: g.pt(166, yHigh, 16), dir },
            { skill: 'float', unit: 'pioneer1', at: g.pt(190, yHigh, 16), dir },
            { skill: 'build', unit: 'pioneer1', at: g.pt(356, yMid, 10), dir },
            { skill: 'bash',  unit: 'pioneer1', at: g.pt(418, yMid, 16), dir },
            ...goalPlan,
            { skill: 'bash',  unit: 'crowd_lead', at: g.pt(184, yHigh, 12), dir, minSpawned: 8, wait: 180 }
          ],
          dnaFront: ['CLIMB', 'FLOAT', 'BUILD', 'BASH', 'BASH'],
          hintFront: '방어막이 0개지만 본대는 상단 가두리에서 안전하게 왕복합니다. 1명만 흡착+역추진으로 넘어가 모든 다리와 출구 경로를 연 뒤 마지막에 가두리 벽을 부수십시오.'
        };
      }
    },

    /**
     * C3: 45도 강철 빔 활주 스폰 + 치명 협곡 가교 + 중추 돌파
     */
    C_BEAM_SLIDE_FORK: {
      id: 'C_BEAM_SLIDE_FORK',
      layoutAlias: 'traverse',
      label: '강철 빔 활주 & 협곡 가교',
      supportedTargets: ['MID', 'LOW'],
      forbidsBlock: false,
      tags: ['beam_skate', 'pioneer_split', 'fatal_drop'],
      build({ g, st, dir, Y, targetBand }) {
        const yHigh = Y.HIGH;
        const yMid = Y.MID;
        const yLow = Y.LOW;
        const els = [];

        // Zone L: HIGH 스폰 + 45도 빔 캐치 (64..312)
        els.push(g.steelWall(64, yHigh - 64, 18, 64));
        els.push(g.steelFloor(64, yHigh, 180, 16));                        // 64..244
        els.push(g.beam(244, yHigh + 24, 68, 68, 1, 16));                  // 244..312 -> yMid(200)

        // Zone M: 빔 착지 & 42px 심연 갭 (308..494) — 다리 착지는 항상 Y.MID 유지!
        els.push(g.slab(308, yMid, 68, 18, st));                           // 308..376
        if (targetBand === 'MID') {
          els.push(g.slab(418, yMid, 76, 18, st));                         // 418..494
        } else {
          els.push(g.slab(418, yMid, 48, 18, st));                         // 418..466
          els.push(g.slab(462, yLow, 32, 18, st));                         // 462..494 (88px 안전 하강)
        }
        els.push(g.wall(436, yMid - 58, 26, 58));

        return {
          id: 'C_BEAM_SLIDE_FORK',
          spawnX: Math.round(g.px(110)),
          spawnY: yHigh - 42,
          scoutUnit: 'pioneer1',
          helperUnit: 'pioneer2',
          occupied: targetBand === 'LOW' ? ['L:HIGH', 'M:MID', 'M:LOW'] : ['L:HIGH', 'M:MID'],
          els,
          req: { block: 2, build: 1, bash: 1 },
          altBonus: { build: 1 },
          makeFrontPlan: (goalPlan) => [
            { skill: 'block', unit: 'pioneer2', at: g.pt(204, yHigh, 12), dir },
            { skill: 'build', unit: 'pioneer1', at: g.pt(368, yMid, 10), dir },
            { skill: 'bash',  unit: 'pioneer1', at: g.pt(422, yMid, 16), dir },
            ...goalPlan,
            { skill: 'block', unit: 'blocker',  at: g.pt(204, yHigh, 14), wait: 180, minSpawned: 7 }
          ],
          dnaFront: ['BLOCK', 'BUILD', 'BASH', 'BLOCK'],
          hintFront: '선발대 1명을 빔으로 먼저 내려보낸 뒤 2호가 상단에서 본대를 대기시키고, 중단 다리와 출구 루트 완성 후 본대를 해방하십시오.'
        };
      }
    },

    /**
     * C4: 하단 스폰 역상승 (LOW -> 상단 점프패드 도약 -> 중단 강철벽 반사 -> 역방향 드릴 -> 하부 재개척!)
     */
    C_LOW_JUMPPAD_ASCENT: {
      id: 'C_LOW_JUMPPAD_ASCENT',
      layoutAlias: 'ascent',
      label: '하단 출발 점프패드 역상승 & 반전',
      supportedTargets: ['MID', 'LOW'],
      forbidsBlock: false,
      tags: ['low_start', 'jumppad', 'pioneer_split', 'uturn'],
      build({ g, st, dir, Y, targetBand }) {
        const yMid = Y.MID;
        const yLow = Y.LOW;
        const els = [];

        // Zone L: LOW 스폰 + 암벽 관문 + 상향 점프패드 (64..248)
        els.push(g.steelWall(64, yLow - 62, 18, 62));
        els.push(g.steelFloor(64, yLow, 184, 18));
        els.push(g.wall(164, yLow - 58, 28, 58));                          // 0-스킬 저지 암벽
        els.push(g.jumpPad(196, yLow - 10, 'up-right', 8.6));              // 310..335, Y.MID 착지!
        els.push(g.steelWall(234, yLow - 18, 16, 18));                     // 끝단 낮은 18px 강철 턱 (도보 이탈 차단, 도약은 통과)

        // Zone M 상단 착지 반사대 (276..398, Y.MID) — 오른쪽 강철벽(382) 아래는 강철판, 왼쪽(276..338)만 드릴 가능!
        els.push(g.steelWall(276, yMid - 14, 16, 14));
        els.push(g.slab(276, yMid, 62, 18, st));                           // 276..338 역방향 드릴 구간
        els.push(g.steelFloor(338, yMid, 60, 18));                         // 338..398 강철판 (직관 드릴 방지!)
        els.push(g.steelWall(382, yMid - 62, 18, 62));                     // 우측 강철 반사벽 (+dir -> -dir)

        // Zone M 하부 돌파 & 재진입 회랑 (276..494, Y.LOW)
        els.push(g.steelWall(276, yLow - 58, 18, 58));                     // 좌측 반사벽 (-dir -> +dir)
        els.push(g.slab(276, yLow, 218, 18, st));                          // 276..494
        els.push(g.wall(366, yLow - 58, 28, 58));
        if (targetBand === 'MID') {
          els.push(g.jumpPad(402, yLow - 10, 'up-right', 8.4));            // Zone R yMid(494..534) 안전 착지!
        }

        return {
          id: 'C_LOW_JUMPPAD_ASCENT',
          spawnX: Math.round(g.px(110)),
          spawnY: yLow - 42,
          scoutUnit: 'pioneer1',
          helperUnit: 'pioneer2',
          occupied: ['L:LOW', 'M:MID', 'M:LOW'],
          els,
          req: { block: 2, bash: 2, drill: 1 },
          altBonus: { build: 1, mine: 1 },
          makeFrontPlan: (goalPlan) => [
            { skill: 'bash',  unit: 'pioneer1', at: g.pt(150, yLow, 14), dir },
            { skill: 'block', unit: 'pioneer2', at: g.pt(138, yLow, 12), dir },
            { skill: 'drill', unit: 'pioneer1', at: g.pt(314, yMid, 12), dir: -dir },
            { skill: 'bash',  unit: 'pioneer1', at: g.pt(350, yLow, 16), dir },
            ...goalPlan,
            { skill: 'block', unit: 'blocker',  at: g.pt(138, yLow, 14), wait: 180, minSpawned: 7 }
          ],
          dnaFront: ['BASH', 'BLOCK', 'DRILL', 'BASH', 'BLOCK'],
          hintFront: '하단에서 점프패드로 중단 반사대에 올라 우측 강철벽에 반사된 뒤 역방향 드릴로 하부 회랑으로 내려가 출구 경로를 개척하십시오.'
        };
      }
    },

    /**
     * C5: 중단 스폰 + 정면 강철 벙커 차단 + 지하 우회 / 점프패드 재진입
     */
    C_MID_UNDERPASS_FORK: {
      id: 'C_MID_UNDERPASS_FORK',
      layoutAlias: 'chamber',
      label: '중단 강철 함정 분기 & 지하 우회',
      supportedTargets: ['MID', 'LOW'],
      forbidsBlock: false,
      tags: ['pioneer_split', 'underpass', 'anti_climb', 'decoy_front'],
      build({ g, st, dir, Y, targetBand }) {
        const yMid = Y.MID;
        const yLow = Y.LOW;
        const els = [];

        // Zone L: MID 스폰실 (64..248)
        els.push(g.steelWall(64, yMid - 64, 18, 64));
        els.push(g.steelFloor(64, yMid, 126, 18));                         // 64..190 (blocker 162 안전, 190..248 드릴 가능!)
        els.push(g.slab(190, yMid, 58, 18, st));                           // 190..248 드릴 구간 (blocker 162 앞!)
        // 정면 직진 차단 강철 벙커(미끼!) (248..360)
        els.push(g.steelWall(248, yMid - 70, 18, 88));
        els.push(g.steelFloor(232, yMid - 70, 130, 18));
        els.push(g.steelWall(344, yMid - 54, 18, 72));

        // Zone M 하부 지하 회랑 (160..494, yLow)
        els.push(g.steelWall(160, yLow - 58, 18, 58));
        els.push(g.steelFloor(160, yLow, 72, 18));                         // 160..232 착지 강철판
        els.push(g.slab(232, yLow, 132, 18, st));                          // 232..364
        els.push(g.wall(284, yLow - 58, 30, 58));                          // 지하 암벽
        // 364..404: 40px 갭
        els.push(g.slab(404, yLow, 90, 18, st));                           // 404..494
        if (targetBand === 'MID') {
          els.push(g.jumpPad(396, yLow - 10, 'up-right', 8.4));            // 396+115=511 -> steelFloor(494..536) 위 안전 착지!
        }

        return {
          id: 'C_MID_UNDERPASS_FORK',
          spawnX: Math.round(g.px(108)),
          spawnY: yMid - 42,
          scoutUnit: 'pioneer1',
          helperUnit: 'pioneer2',
          occupied: ['L:MID', 'L:LOW', 'M:HIGH', 'M:MID', 'M:LOW'],
          els,
          req: { block: 2, drill: 1, bash: 1, build: 1 },
          altBonus: { bomb: 1, mine: 1 },
          makeFrontPlan: (goalPlan) => [
            { skill: 'drill', unit: 'pioneer1', at: g.pt(214, yMid, 12), dir },
            { skill: 'block', unit: 'pioneer2', at: g.pt(166, yMid, 12), dir },
            { skill: 'bash',  unit: 'pioneer1', at: g.pt(268, yLow, 14), dir },
            { skill: 'build', unit: 'pioneer1', at: g.pt(356, yLow, 10), dir },
            ...goalPlan,
            { skill: 'block', unit: 'blocker',  at: g.pt(166, yMid, 14), wait: 220, minSpawned: 6 }
          ],
          dnaFront: ['DRILL', 'BLOCK', 'BASH', 'BUILD', 'BLOCK'],
          hintFront: '정면 강철 벙커는 오버행으로 등반이 불가능합니다. 선발대가 전방에서 드릴로 지하로 내려가는 동안 2호가 뒤에서 본대를 대기시키고, 다리 완성 후 해방하십시오.'
        };
      }
    },

    /**
     * C6: 후방 비밀 포켓 양방향 스폰 (정면 강철 오버행 -> 뒤로 반사되어 스폰 뒤편 드릴 -> 하부 가교!)
     */
    C_REAR_ESCAPE_SPLIT: {
      id: 'C_REAR_ESCAPE_SPLIT',
      layoutAlias: 'terraces',
      label: '전면 봉쇄 & 후방 우회 스폰',
      supportedTargets: ['MID', 'LOW'],
      forbidsBlock: false,
      tags: ['pioneer_split', 'uturn', 'backdoor', 'underpass'],
      build({ g, st, dir, Y, targetBand }) {
        const yHigh = Y.HIGH;
        const yMid = Y.MID;
        const yLow = Y.LOW;
        const els = [];

        // Zone L: HIGH 스폰 (앞은 강철 오버행, 뒤쪽 왼쪽에 연약 바닥)
        els.push(g.steelWall(56, yHigh - 64, 18, 64));
        els.push(g.slab(56, yHigh, 102, 16, st));                          // 74..158 드릴 구간
        els.push(g.steelFloor(158, yHigh, 102, 16));                       // 스폰(196) 아래 강철 보호
        els.push(g.steelWall(246, yHigh - 66, 18, 66));
        els.push(g.steelFloor(224, yHigh - 66, 56, 16));

        // Zone L~M 하부 회랑 (74..494, 236..268 32px 갭)
        els.push(g.steelWall(74, yMid - 58, 18, 58));
        els.push(g.slab(74, yMid, 162, 18, st));                           // 74..236
        els.push(g.wall(168, yMid - 58, 28, 58));
        if (targetBand === 'MID') {
          els.push(g.slab(268, yMid, 226, 18, st));                        // 268..494
        } else {
          els.push(g.slab(268, yMid, 160, 18, st));                        // 268..428
          els.push(g.slab(424, yLow, 70, 18, st));                         // 424..494 (88px 하강)
        }

        return {
          id: 'C_REAR_ESCAPE_SPLIT',
          spawnX: Math.round(g.px(196)),
          spawnY: yHigh - 42,
          scoutUnit: 'pioneer1',
          helperUnit: 'pioneer2',
          occupied: targetBand === 'LOW' ? ['L:HIGH', 'L:MID', 'M:MID', 'M:LOW'] : ['L:HIGH', 'L:MID', 'M:MID'],
          els,
          req: { block: 2, drill: 1, bash: 1, build: 1 },
          altBonus: { mine: 1, bomb: 1 },
          makeFrontPlan: (goalPlan) => [
            { skill: 'drill', unit: 'pioneer1', at: g.pt(114, yHigh, 12), dir: -dir },
            { skill: 'block', unit: 'pioneer2', at: g.pt(148, yHigh, 12), dir: -dir },
            { skill: 'bash',  unit: 'pioneer1', at: g.pt(154, yMid, 14), dir },
            { skill: 'build', unit: 'pioneer1', at: g.pt(226, yMid, 10), dir },
            ...goalPlan,
            { skill: 'block', unit: 'blocker',  at: g.pt(148, yHigh, 14), wait: 180, minSpawned: 6 }
          ],
          dnaFront: ['DRILL', 'BLOCK', 'BASH', 'BUILD', 'BLOCK'],
          hintFront: '정면은 강철 오버행으로 막혀 있습니다. 뒤쪽 벽에서 방향을 반전시켜 스폰 뒤편 바닥을 드릴한 뒤 하부 협곡 다리를 놓으십시오.'
        };
      }
    }
  };

  /* =========================================================================
   * [LAYER 4] DECOY INJECTOR — 빈 슬롯에 가짜 지름길·미끼 점프패드·막힌 문 주입
   * =======================================================================*/
  function injectDecoys(els, occupiedList, g, st, Y, dir, R, opts) {
    if (opts.includeOptionA === false && opts.includeOptionB === false) return [];
    const occ = new Set(occupiedList);
    const addedTags = [];

    if (!occ.has('M:HIGH') && !occ.has('L:HIGH') && R() < 0.85) {
      els.push(g.slab(258, Y.HIGH, 176, 16, st));
      els.push(g.wall(322, Y.HIGH - 56, 26, 56));
      els.push(g.steelWall(416, Y.HIGH - 62, 18, 62));
      els.push(g.steelFloor(398, Y.HIGH - 62, 38, 14));
      occ.add('M:HIGH');
      addedTags.push('decoy_branch');
    }

    if (!occ.has('R:HIGH') && R() < 0.8) {
      els.push(g.steelFloor(514, Y.HIGH, 160, 16));
      els.push(g.wall(568, Y.HIGH - 54, 24, 54));
      els.push(g.steelWall(656, Y.HIGH - 58, 18, 58));
      occ.add('R:HIGH');
      addedTags.push('decoy_roof');
    }

    if (!occ.has('M:BASE') && !occ.has('M:LOW') && opts.includeOptionB !== false && R() < 0.65) {
      // Decoy 3: 중하단 막힌 암벽 벙커 (무작위 점프패드 대신 막힌 우회 함정)
      els.push(g.steelWall(258, Y.BASE - 56, 18, 56));
      els.push(g.slab(258, Y.BASE, 144, 18, st));
      els.push(g.wall(318, Y.BASE - 52, 24, 52));
      els.push(g.steelWall(384, Y.BASE - 56, 18, 56));
      occ.add('M:BASE');
      addedTags.push('decoy_bunker');
    } else if (!occ.has('L:LOW') && !occ.has('L:BASE') && R() < 0.7) {
      els.push(g.steelWall(76, Y.LOW - 56, 18, 56));
      els.push(g.slab(76, Y.LOW, 140, 18, st));
      els.push(g.wall(144, Y.LOW - 52, 24, 52));
      els.push(g.steelWall(198, Y.LOW - 58, 18, 58));
      occ.add('L:LOW');
      addedTags.push('decoy_pocket');
    }

    return addedTags;
  }

  const LAYOUT_TO_GOAL = {
    cascade: 'G_REVERSE_PAD',
    jumppad_reverse: 'G_REVERSE_PAD',
    traverse: 'G_DROP_CHUTE_PAD',
    jumppad_chute: 'G_DROP_CHUTE_PAD',
    zigzag: 'G_BACKDOOR_FORTRESS',
    backdoor_fortress: 'G_BACKDOOR_FORTRESS',
    ascent: 'G_DOUBLE_PAD_RELAY',
    double_pad: 'G_DOUBLE_PAD_RELAY',
    elevator: 'G_SKY_SHUTTLE_LOCK',
    sky_shuttle: 'G_SKY_SHUTTLE_LOCK',
    chamber: 'G_BASE_HALFSTEEL_BUNKER',
    halfsteel_bunker: 'G_BASE_HALFSTEEL_BUNKER'
  };

  const LAYOUT_TO_FRONT = {
    split: 'C_NO_BLOCK_HOLD_PIT',
    no_block_pit: 'C_NO_BLOCK_HOLD_PIT',
    terraces: 'C_REAR_ESCAPE_SPLIT',
    low_ascent: 'C_LOW_JUMPPAD_ASCENT'
  };

  function composeBackwardCandidate({ tierIdx, R, pal, dir, opts = {} }) {
    const { makeWorldGeom, stoneType } = getGeomHelpers();
    const g = makeWorldGeom(dir, pal);
    const st = stoneType(pal, R);
    const dy = R.irange(-5, 5);
    const Y = makeBands(dy);

    const reqLayout = opts.layout ? String(opts.layout) : '';
    const goalKeys = Object.keys(GOAL_VAULTS);
    const frontKeys = Object.keys(FRONTEND_CHAINS);

    // 1. 출구(GoalVault) 먼저 결정!
    let goalKey = LAYOUT_TO_GOAL[reqLayout];
    if (!goalKey) {
      if (opts.goalPool && opts.goalPool.length) goalKey = R.pick(opts.goalPool);
      else {
        const pool = tierIdx <= 1
          ? goalKeys.filter(k => k !== 'G_BASE_HALFSTEEL_BUNKER')
          : goalKeys;
        goalKey = R.pick(pool);
      }
    }
    const goalSpec = GOAL_VAULTS[goalKey];

    // 2. 출구의 진입 고도 및 제약(requiresBlock)에 맞는 Frontend(Spawn+MidHub) 역추적 선택!
    let frontKey = LAYOUT_TO_FRONT[reqLayout];
    const compatibleFronts = frontKeys.filter(fk => {
      const f = FRONTEND_CHAINS[fk];
      if (!f.supportedTargets.includes(goalSpec.inBand)) return false;
      if (goalSpec.requiresBlock && f.forbidsBlock) return false;
      return true;
    });
    if (!frontKey || !compatibleFronts.includes(frontKey)) {
      if (opts.frontPool && opts.frontPool.length) {
        const sub = opts.frontPool.filter(fk => compatibleFronts.includes(fk));
        frontKey = sub.length ? R.pick(sub) : R.pick(compatibleFronts);
      } else {
        frontKey = R.pick(compatibleFronts);
      }
    }
    const frontSpec = FRONTEND_CHAINS[frontKey];

    const goalBuilt = goalSpec.build({ g, st, dir, Y, tierIdx, R, opts, allowBlock: !frontSpec.forbidsBlock });
    const frontBuilt = frontSpec.build({ g, st, dir, Y, targetBand: goalBuilt.inBand, tierIdx, R, opts });

    // 3. 합체 + 미사용 셀에 미끼/차단 함정 주입!
    const elements = [...frontBuilt.els, ...goalBuilt.els];
    const occupied = [...frontBuilt.occupied, ...goalBuilt.occupied];
    const decoyTags = injectDecoys(elements, occupied, g, st, Y, dir, R, opts);

    // 4. 역방향 조립된 계획 합체
    const goalPlan = goalBuilt.makePlan({
      scout: frontBuilt.scoutUnit,
      helper: frontBuilt.helperUnit
    });
    const plan = frontBuilt.makeFrontPlan(goalPlan);

    // 5. 스킬 예산 합산 (forbid / maxFloat / portal=0 엄격 유지)
    const req = {};
    for (const [k, v] of Object.entries(frontBuilt.req || {})) req[k] = (req[k] || 0) + v;
    for (const [k, v] of Object.entries(goalBuilt.req || {})) req[k] = (req[k] || 0) + v;

    const forbid = new Set([...(frontBuilt.forbidSkills || []), ...(goalBuilt.forbidSkills || []), 'portal']);
    const altBonus = {};
    for (const [k, v] of Object.entries(frontBuilt.altBonus || {})) {
      if (!forbid.has(k)) altBonus[k] = (altBonus[k] || 0) + v;
    }
    for (const [k, v] of Object.entries(goalBuilt.altBonus || {})) {
      if (!forbid.has(k)) altBonus[k] = (altBonus[k] || 0) + v;
    }

    const tags = Array.from(new Set([
      'backward_chain',
      ...(frontSpec.tags || []),
      ...(goalSpec.tags || []),
      ...(goalBuilt.tagsExtra || []),
      ...decoyTags
    ]));

    const solutionDna = [...(frontBuilt.dnaFront || []), ...(goalBuilt.dna || [])];

    return {
      blueprintId: `${frontSpec.id}__${goalSpec.id}`,
      layoutType: goalSpec.layoutAlias || 'backward',
      variantName: `${goalSpec.label} × ${frontSpec.label}`,
      gimmickLabel: `역방향 설계 (${goalSpec.label})`,
      goalVault: goalSpec.id,
      frontChain: frontSpec.id,
      decoyCount: decoyTags.length,
      elements,
      spawnX: frontBuilt.spawnX,
      spawnY: frontBuilt.spawnY,
      gateX: goalBuilt.gateX,
      gateY: goalBuilt.gateY,
      plan,
      req,
      altBonus,
      forbidSkills: Array.from(forbid),
      maxFloat: frontBuilt.maxFloat != null ? frontBuilt.maxFloat : null,
      tags,
      solutionDna,
      hint: `${frontBuilt.hintFront} ${goalBuilt.hintEnd}`
    };
  }

  root.ForgeBackward = {
    GOAL_VAULTS,
    FRONTEND_CHAINS,
    composeBackwardCandidate
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { GOAL_VAULTS, FRONTEND_CHAINS, composeBackwardCandidate };
  }
})(typeof self !== 'undefined' ? self : (typeof globalThis !== 'undefined' ? globalThis : this));
