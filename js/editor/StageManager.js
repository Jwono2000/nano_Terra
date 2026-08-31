// --- Stage Manager & Declarative JSON Loader System ---
class StageDataEngine {
  static buildTerrainFromData(terrain, levelData) {
    terrain.clear();
    if (!levelData || !levelData.elements) return;
    
    const stagePal = levelData.terrainTheme || 'cyan';
    for (const el of levelData.elements) {
      const pal = el.palette || stagePal;
      switch (el.type) {
        case 'platform':
          terrain.drawPlatform(el.x, el.y, el.w, el.h || 20, pal);
          break;
        case 'craggyRock':
          terrain.drawCraggyRockFloor(el.x, el.y, el.w, el.h || 22, el.profile || [18, 24, 36, 16], pal);
          break;
        case 'volcanicBasalt':
          terrain.drawVolcanicBasaltFloor(el.x, el.y, el.w, el.h || 24, el.profile || [16, 28, 40, 14], el.palette || (stagePal === 'cyan' ? 'red' : stagePal));
          break;
        case 'quantumCrystal':
          terrain.drawQuantumCrystalFloor(el.x, el.y, el.w, el.h || 24, el.profile || [14, 22, 34, 18], el.palette || (stagePal === 'cyan' ? 'purple' : stagePal));
          break;
        case 'rockWall':
          terrain.drawRockWall(el.x, el.y, el.w || 70, el.h || 70, pal);
          break;
        case 'steelBarrier':
          terrain.drawSteelBarrier(el.x, el.y, el.w || 20, el.h || 80);
          break;
      }
    }
  }

  static createDefaultStage() {
    return {
      id: 1,
      title: "GENESIS DROP",
      bgImg: "assets/bg_level_1.jpg",
      terrainTheme: "cyan",
      desc: "지휘관이 직접 설계한 테라포밍 전술 구역입니다. 나노봇 군단을 무사히 웜홀까지 유도하십시오.",
      totalUnits: 15,
      needPercent: 70,
      spawnRate: 20,
      timeLimit: 240,
      skills: {
        climb: 4, float: 4, bash: 4, mine: 4, drill: 4, bomb: 2, build: 6, block: 3, portal: 1
      },
      spawnX: 90,
      spawnY: 60,
      gateX: 710,
      gateY: 254,
      elements: [
        { type: 'platform', x: 40, y: 120, w: 160, h: 20, palette: 'cyan' },
        { type: 'craggyRock', x: 100, y: 200, w: 420, h: 22, palette: 'cyan', profile: [18, 22, 34, 38, 20, 14, 16] },
        { type: 'rockWall', x: 280, y: 130, w: 70, h: 70, palette: 'cyan' },
        { type: 'steelBarrier', x: 500, y: 120, w: 20, h: 80 },
        { type: 'craggyRock', x: 400, y: 280, w: 360, h: 28, palette: 'cyan', profile: [24, 28, 32, 26, 20] }
      ]
    };
  }

  static createBlankStage() {
    return {
      id: "NEW_MAP",
      title: "NEW CREATED SECTOR",
      bgImg: "assets/bg_level_1.jpg",
      terrainTheme: "cyan",
      desc: "크리에이터 모드로 처음부터 제작한 전술 구역입니다.",
      totalUnits: 15,
      needPercent: 70,
      spawnRate: 20,
      timeLimit: 240,
      skills: {
        climb: 4, float: 4, bash: 4, mine: 4, drill: 4, bomb: 2, build: 6, block: 3, portal: 1
      },
      spawnX: 90,
      spawnY: 60,
      gateX: 710,
      gateY: 340,
      elements: [
        { type: 'platform', x: 40, y: 120, w: 150, h: 20, palette: 'cyan' },
        { type: 'platform', x: 520, y: 360, w: 240, h: 20, palette: 'cyan' }
      ],
      solutionDna: ["CUSTOM"],
      difficultyScore: 50
    };
  }
}

// Built-in 10 Full Campaign Stages (Guaranteed Offline / file:/// protocol support)
const BUILTIN_10_STAGES = [
  {
    "id": 1,
    "title": "GENESIS DROP",
    "bgImg": "assets/bg_level_1.jpg",
    "terrainTheme": "cyan",
    "desc": "1구역: 외계 행성 테라포밍 전초기지입니다. 1층에서 2층으로 착지 후 플라즈마 레이저(Bash)로 암벽을 뚫고, 강철벽 앞에서 바닥을 드릴(Drill)로 뚫어 탈출하십시오.<br><span style='color: #ffb700;'>※ 노란색 사선 줄무늬의 강철 격벽은 절삭/천공할 수 없습니다!</span>",
    "totalUnits": 15,
    "needPercent": 70,
    "spawnRate": 20,
    "timeLimit": 240,
    "skills": {
      "climb": 4, "float": 4, "bash": 6, "mine": 4, "drill": 4, "bomb": 3, "build": 8, "block": 4, "portal": 1
    },
    "spawnX": 90,
    "spawnY": 60,
    "gateX": 710,
    "gateY": 254,
    "solutionDna": ["FLOAT", "BASH", "DRILL"],
    "difficultyScore": 45,
    "elements": [
      { "type": "platform", "x": 40, "y": 120, "w": 160, "h": 20, "palette": "cyan" },
      { "type": "craggyRock", "x": 100, "y": 200, "w": 420, "h": 22, "palette": "cyan", "profile": [18, 22, 34, 38, 20, 14, 16] },
      { "type": "rockWall", "x": 280, "y": 130, "w": 70, "h": 70, "palette": "cyan" },
      { "type": "steelBarrier", "x": 500, "y": 120, "w": 20, "h": 80 },
      { "type": "craggyRock", "x": 400, "y": 280, "w": 360, "h": 28, "palette": "cyan", "profile": [24, 28, 32, 26, 20] }
    ]
  },
  {
    "id": 2,
    "title": "MAGMA CREVASSE",
    "bgImg": "assets/bg_level_2.jpg",
    "terrainTheme": "red",
    "desc": "2구역: 화산 균열 지대입니다. 붉은 현무암과 마그마 암벽이 펼쳐집니다. 레이저(Bash)로 중앙 암벽을 뚫고, 강철벽 앞에서 바닥을 드릴(Drill) 또는 대각 굴착(Mine)으로 뚫어 탈출하십시오!<br><span style='color: #ffb700;'>※ 강철 격벽은 파괴 불가!</span>",
    "totalUnits": 20,
    "needPercent": 75,
    "spawnRate": 25,
    "timeLimit": 240,
    "skills": {
      "climb": 3, "float": 5, "bash": 5, "mine": 4, "drill": 4, "bomb": 2, "build": 6, "block": 3, "portal": 1
    },
    "spawnX": 80,
    "spawnY": 50,
    "gateX": 720,
    "gateY": 254,
    "solutionDna": ["FLOAT", "BASH", "DRILL"],
    "difficultyScore": 60,
    "elements": [
      { "type": "platform", "x": 40, "y": 110, "w": 140, "h": 20, "palette": "red" },
      { "type": "volcanicBasalt", "x": 40, "y": 190, "w": 480, "h": 24, "palette": "red", "profile": [16, 28, 42, 38, 14, 12] },
      { "type": "rockWall", "x": 250, "y": 120, "w": 70, "h": 70, "palette": "red" },
      { "type": "steelBarrier", "x": 500, "y": 110, "w": 20, "h": 80 },
      { "type": "volcanicBasalt", "x": 380, "y": 280, "w": 380, "h": 30, "palette": "red", "profile": [26, 34, 40, 28, 22] }
    ]
  },
  {
    "id": 3,
    "title": "QUANTUM LABYRINTH",
    "bgImg": "assets/bg_level_3.jpg",
    "terrainTheme": "purple",
    "desc": "3구역: 양자 크리스탈 유적지입니다. 신비로운 보랏빛 유적 지형입니다. 1층에서 2층으로 하강 -> 강철벽 앞에서 바닥 드릴(Drill) -> 3층 암벽 레이저(Bash) 관통으로 웜홀에 도달하십시오.",
    "totalUnits": 20,
    "needPercent": 80,
    "spawnRate": 30,
    "timeLimit": 240,
    "skills": {
      "climb": 4, "float": 5, "bash": 5, "mine": 4, "drill": 4, "bomb": 2, "build": 6, "block": 3, "portal": 1
    },
    "spawnX": 90,
    "spawnY": 50,
    "gateX": 720,
    "gateY": 254,
    "solutionDna": ["DRILL", "BASH", "BUILD"],
    "difficultyScore": 75,
    "elements": [
      { "type": "quantumCrystal", "x": 40, "y": 110, "w": 140, "h": 20, "palette": "purple", "profile": [18, 22, 18] },
      { "type": "quantumCrystal", "x": 100, "y": 190, "w": 320, "h": 24, "palette": "purple", "profile": [14, 20, 36, 16] },
      { "type": "steelBarrier", "x": 400, "y": 90, "w": 20, "h": 100 },
      { "type": "quantumCrystal", "x": 260, "y": 280, "w": 500, "h": 30, "palette": "purple", "profile": [18, 28, 36, 32, 22] },
      { "type": "rockWall", "x": 480, "y": 210, "w": 70, "h": 70, "palette": "purple" }
    ]
  },
  {
    "id": 4,
    "title": "CORE COLLAPSE",
    "bgImg": "assets/bg_level_4.jpg",
    "terrainTheme": "brown",
    "desc": "4구역: 심층 황무지 코어 발전소입니다. 1층 드릴 관통 -> 2층 레이저 절삭 -> 계단 생성으로 25기 나노봇 전원을 손실 없이 구출하십시오!",
    "totalUnits": 25,
    "needPercent": 80,
    "spawnRate": 30,
    "timeLimit": 240,
    "skills": {
      "climb": 3, "float": 5, "bash": 5, "mine": 4, "drill": 4, "bomb": 2, "build": 8, "block": 3, "portal": 1
    },
    "spawnX": 70,
    "spawnY": 50,
    "gateX": 730,
    "gateY": 314,
    "solutionDna": ["DRILL", "FLOAT", "BASH", "BUILD"],
    "difficultyScore": 85,
    "elements": [
      { "type": "platform", "x": 30, "y": 110, "w": 130, "h": 22, "palette": "brown" },
      { "type": "craggyRock", "x": 90, "y": 190, "w": 280, "h": 22, "palette": "brown", "profile": [14, 22, 36, 18] },
      { "type": "steelBarrier", "x": 350, "y": 80, "w": 20, "h": 110 },
      { "type": "craggyRock", "x": 200, "y": 270, "w": 360, "h": 24, "palette": "brown", "profile": [18, 32, 44, 20, 16] },
      { "type": "rockWall", "x": 420, "y": 200, "w": 70, "h": 70, "palette": "brown" },
      { "type": "platform", "x": 460, "y": 340, "w": 310, "h": 32, "palette": "green" }
    ]
  },
  {
    "id": 5,
    "title": "BIO-EDEN SANCTUARY",
    "bgImg": "assets/bg_level_1.jpg",
    "terrainTheme": "green",
    "desc": "5구역: 외계 바이오 에덴 성역입니다. 다단 녹색 테라스와 암벽을 방어막(Block)으로 나노봇의 진로를 반전시키고 흡착 등반(Climb)을 활용해 웜홀로 집결시키십시오.",
    "totalUnits": 20,
    "needPercent": 80,
    "spawnRate": 25,
    "timeLimit": 240,
    "skills": {
      "climb": 5, "float": 5, "bash": 4, "mine": 4, "drill": 4, "bomb": 2, "build": 8, "block": 5, "portal": 1
    },
    "spawnX": 80,
    "spawnY": 60,
    "gateX": 710,
    "gateY": 210,
    "solutionDna": ["BLOCK", "BUILD", "BASH", "CLIMB"],
    "difficultyScore": 95,
    "elements": [
      { "type": "platform", "x": 40, "y": 120, "w": 180, "h": 20, "palette": "green" },
      { "type": "craggyRock", "x": 160, "y": 200, "w": 380, "h": 24, "palette": "green", "profile": [16, 26, 36, 22, 18] },
      { "type": "steelBarrier", "x": 520, "y": 110, "w": 20, "h": 90 },
      { "type": "rockWall", "x": 300, "y": 130, "w": 70, "h": 70, "palette": "green" },
      { "type": "craggyRock", "x": 80, "y": 290, "w": 400, "h": 26, "palette": "green", "profile": [18, 28, 38, 24, 18] },
      { "type": "platform", "x": 440, "y": 230, "w": 330, "h": 22, "palette": "green" }
    ]
  },
  {
    "id": 6,
    "title": "VOLCANIC SPEEDWAY",
    "bgImg": "assets/bg_level_2.jpg",
    "terrainTheme": "red",
    "desc": "6구역: 마그마 고속 회랑입니다. 낙하 지점 아래의 용암 바닥을 조심하십시오! 역추진(Float)으로 감속 낙하 후 연속 드릴(Drill)로 2개 층을 신속히 관통하십시오.",
    "totalUnits": 25,
    "needPercent": 85,
    "spawnRate": 20,
    "timeLimit": 220,
    "skills": {
      "climb": 4, "float": 8, "bash": 6, "mine": 4, "drill": 6, "bomb": 3, "build": 6, "block": 4, "portal": 1
    },
    "spawnX": 70,
    "spawnY": 50,
    "gateX": 730,
    "gateY": 290,
    "solutionDna": ["FLOAT", "DRILL", "DRILL", "BASH"],
    "difficultyScore": 105,
    "elements": [
      { "type": "platform", "x": 30, "y": 100, "w": 140, "h": 20, "palette": "red" },
      { "type": "volcanicBasalt", "x": 120, "y": 180, "w": 340, "h": 22, "palette": "red", "profile": [14, 24, 34, 20] },
      { "type": "steelBarrier", "x": 440, "y": 80, "w": 20, "h": 100 },
      { "type": "volcanicBasalt", "x": 200, "y": 260, "w": 380, "h": 24, "palette": "red", "profile": [16, 28, 38, 22] },
      { "type": "rockWall", "x": 480, "y": 190, "w": 70, "h": 70, "palette": "red" },
      { "type": "platform", "x": 400, "y": 310, "w": 360, "h": 24, "palette": "red" }
    ]
  },
  {
    "id": 7,
    "title": "HYPERION CITADEL",
    "bgImg": "assets/bg_level_3.jpg",
    "terrainTheme": "purple",
    "desc": "7구역: 하이페리온 양자 요새입니다. 공중에 떠 있는 다중 섬 지형입니다. 3D 계단(Build)으로 절벽을 잇거나 차원 포탈(Portal)을 생성해 강철벽을 우회하십시오.",
    "totalUnits": 22,
    "needPercent": 85,
    "spawnRate": 30,
    "timeLimit": 240,
    "skills": {
      "climb": 4, "float": 6, "bash": 4, "mine": 4, "drill": 4, "bomb": 2, "build": 10, "block": 4, "portal": 2
    },
    "spawnX": 80,
    "spawnY": 50,
    "gateX": 720,
    "gateY": 180,
    "solutionDna": ["BUILD", "PORTAL", "BASH", "BUILD"],
    "difficultyScore": 120,
    "elements": [
      { "type": "quantumCrystal", "x": 40, "y": 110, "w": 160, "h": 22, "palette": "purple", "profile": [14, 22, 28, 16] },
      { "type": "quantumCrystal", "x": 240, "y": 150, "w": 180, "h": 22, "palette": "purple", "profile": [16, 24, 22, 14] },
      { "type": "steelBarrier", "x": 400, "y": 50, "w": 20, "h": 100 },
      { "type": "quantumCrystal", "x": 120, "y": 250, "w": 320, "h": 24, "palette": "purple", "profile": [16, 26, 36, 20] },
      { "type": "rockWall", "x": 340, "y": 180, "w": 70, "h": 70, "palette": "purple" },
      { "type": "quantumCrystal", "x": 460, "y": 200, "w": 300, "h": 24, "palette": "purple", "profile": [14, 24, 30, 18] }
    ]
  },
  {
    "id": 8,
    "title": "ASTEROID DRILL FACILITY",
    "bgImg": "assets/bg_level_4.jpg",
    "terrainTheme": "brown",
    "desc": "8구역: 소행성 지하 채굴 기지입니다. 단단한 황무지 암반층과 복합 격벽이 있습니다. 코어 폭파(Bomb)와 융해 드릴(Drill)을 결합하여 심층 탈출로를 뚫으십시오.",
    "totalUnits": 30,
    "needPercent": 85,
    "spawnRate": 25,
    "timeLimit": 240,
    "skills": {
      "climb": 6, "float": 6, "bash": 5, "mine": 5, "drill": 5, "bomb": 4, "build": 8, "block": 4, "portal": 1
    },
    "spawnX": 80,
    "spawnY": 50,
    "gateX": 730,
    "gateY": 320,
    "solutionDna": ["DRILL", "BOMB", "BASH", "BUILD"],
    "difficultyScore": 135,
    "elements": [
      { "type": "platform", "x": 40, "y": 100, "w": 150, "h": 20, "palette": "brown" },
      { "type": "craggyRock", "x": 60, "y": 180, "w": 460, "h": 24, "palette": "brown", "profile": [18, 30, 42, 28, 16] },
      { "type": "rockWall", "x": 240, "y": 110, "w": 70, "h": 70, "palette": "brown" },
      { "type": "steelBarrier", "x": 500, "y": 90, "w": 20, "h": 90 },
      { "type": "craggyRock", "x": 160, "y": 260, "w": 400, "h": 26, "palette": "brown", "profile": [20, 32, 40, 24] },
      { "type": "steelBarrier", "x": 300, "y": 190, "w": 20, "h": 70 },
      { "type": "platform", "x": 360, "y": 340, "w": 400, "h": 28, "palette": "brown" }
    ]
  },
  {
    "id": 9,
    "title": "PLASMA VOID RIFT",
    "bgImg": "assets/bg_level_1.jpg",
    "terrainTheme": "cyan",
    "desc": "9구역: 플라즈마 에너지 심연입니다. 높고 좁은 수직 낭떠러지 구조입니다. 역추진(Float)과 방어막(Block), 3D 계단을 적재적소에 배치하여 낭떠러지 추락을 방지하십시오.",
    "totalUnits": 25,
    "needPercent": 90,
    "spawnRate": 25,
    "timeLimit": 240,
    "skills": {
      "climb": 5, "float": 6, "bash": 6, "mine": 5, "drill": 5, "bomb": 3, "build": 10, "block": 5, "portal": 2
    },
    "spawnX": 80,
    "spawnY": 50,
    "gateX": 730,
    "gateY": 270,
    "solutionDna": ["BLOCK", "DRILL", "FLOAT", "BASH", "BUILD"],
    "difficultyScore": 150,
    "elements": [
      { "type": "platform", "x": 30, "y": 100, "w": 150, "h": 20, "palette": "cyan" },
      { "type": "craggyRock", "x": 100, "y": 180, "w": 340, "h": 24, "palette": "cyan", "profile": [16, 28, 38, 22] },
      { "type": "steelBarrier", "x": 420, "y": 80, "w": 20, "h": 100 },
      { "type": "craggyRock", "x": 200, "y": 250, "w": 300, "h": 24, "palette": "cyan", "profile": [18, 30, 36, 20] },
      { "type": "rockWall", "x": 380, "y": 180, "w": 70, "h": 70, "palette": "cyan" },
      { "type": "steelBarrier", "x": 480, "y": 170, "w": 20, "h": 80 },
      { "type": "platform", "x": 360, "y": 290, "w": 400, "h": 26, "palette": "cyan" }
    ]
  },
  {
    "id": 10,
    "title": "TERRAFORM ALPHA CORE",
    "bgImg": "assets/bg_level_4.jpg",
    "terrainTheme": "purple",
    "desc": "10구역: [최종 결전] 행성 중심 테라포밍 알파 코어입니다. 9종 나노 스킬을 종합 운용하여 30기 나노봇을 전원 무사 구출하고 테라포밍 미션을 최종 완수하십시오!",
    "totalUnits": 30,
    "needPercent": 90,
    "spawnRate": 25,
    "timeLimit": 270,
    "skills": {
      "climb": 6, "float": 8, "bash": 6, "mine": 6, "drill": 6, "bomb": 4, "build": 12, "block": 5, "portal": 2
    },
    "spawnX": 80,
    "spawnY": 50,
    "gateX": 730,
    "gateY": 340,
    "solutionDna": ["FLOAT", "BASH", "DRILL", "BLOCK", "BUILD", "PORTAL"],
    "difficultyScore": 180,
    "elements": [
      { "type": "platform", "x": 30, "y": 100, "w": 160, "h": 20, "palette": "purple" },
      { "type": "quantumCrystal", "x": 80, "y": 170, "w": 360, "h": 24, "palette": "purple", "profile": [16, 28, 40, 24] },
      { "type": "rockWall", "x": 260, "y": 100, "w": 70, "h": 70, "palette": "purple" },
      { "type": "steelBarrier", "x": 420, "y": 70, "w": 20, "h": 100 },
      { "type": "volcanicBasalt", "x": 160, "y": 250, "w": 380, "h": 26, "palette": "red", "profile": [18, 30, 42, 26] },
      { "type": "steelBarrier", "x": 260, "y": 180, "w": 20, "h": 70 },
      { "type": "rockWall", "x": 420, "y": 180, "w": 70, "h": 70, "palette": "red" },
      { "type": "craggyRock", "x": 300, "y": 330, "w": 280, "h": 26, "palette": "cyan", "profile": [16, 26, 36, 22] },
      { "type": "platform", "x": 520, "y": 360, "w": 250, "h": 28, "palette": "purple" }
    ]
  }
];

// Global Default & Active Levels Array (Pre-populated with 10 stages immediately)
let DEFAULT_CAMPAIGN_LEVELS = JSON.parse(JSON.stringify(BUILTIN_10_STAGES));
let LEVELS = JSON.parse(JSON.stringify(BUILTIN_10_STAGES));

class StageManager {
  constructor(game) {
    this.game = game;
    this.customStages = [];
    this.campaignOverrides = {};
    this.currentTab = 'tab-campaign';
    this.pendingSaveData = null;

    this.loadCustomStagesFromStorage();
    this.loadCampaignOverridesFromStorage();
    this.initTabs();
    this.initJsonButtons();
    this.initSaveSlotModalEvents();
  }

  static async loadCampaignLevels() {
    try {
      const res = await fetch('stages/campaign.json');
      if (res.ok) {
        const json = await res.json();
        if (Array.isArray(json) && json.length >= 10) {
          DEFAULT_CAMPAIGN_LEVELS = json;
        }
      }
    } catch(e) {
      console.warn("fetch('stages/campaign.json') failed or skipped, using built-in 10 stages", e);
    }

    if (!DEFAULT_CAMPAIGN_LEVELS || DEFAULT_CAMPAIGN_LEVELS.length === 0) {
      DEFAULT_CAMPAIGN_LEVELS = JSON.parse(JSON.stringify(BUILTIN_10_STAGES));
    }

    // Apply saved overrides from localStorage
    StageManager.rebuildActiveLevels();
    return LEVELS;
  }

  static rebuildActiveLevels() {
    let overrides = {};
    try {
      const saved = localStorage.getItem('terra_campaign_overrides');
      if (saved) overrides = JSON.parse(saved);
    } catch(e) {}

    const source = (DEFAULT_CAMPAIGN_LEVELS && DEFAULT_CAMPAIGN_LEVELS.length >= 10) 
      ? DEFAULT_CAMPAIGN_LEVELS 
      : BUILTIN_10_STAGES;

    LEVELS = source.map((defLvl, idx) => {
      let lvlObj = null;
      const ov = overrides[idx] || overrides[idx.toString()];
      if (ov && Array.isArray(ov.elements)) {
        lvlObj = JSON.parse(JSON.stringify(ov));
        lvlObj.isOverridden = true;
      } else {
        lvlObj = JSON.parse(JSON.stringify(defLvl));
        lvlObj.isOverridden = false;
      }
      lvlObj.id = idx + 1;
      lvlObj.title = lvlObj.title || defLvl.title || `${idx + 1}구역`;
      lvlObj.desc = lvlObj.desc || defLvl.desc || "테라포밍 작전 구역입니다.";
      lvlObj.bgImg = lvlObj.bgImg || defLvl.bgImg || `assets/bg_level_${(idx % 5) + 1}.jpg`;
      lvlObj.terrainTheme = lvlObj.terrainTheme || defLvl.terrainTheme || 'cyan';
      lvlObj.totalUnits = (typeof lvlObj.totalUnits === 'number' && !isNaN(lvlObj.totalUnits) && lvlObj.totalUnits > 0) ? lvlObj.totalUnits : (defLvl.totalUnits || 15);
      lvlObj.needPercent = (typeof lvlObj.needPercent === 'number' && !isNaN(lvlObj.needPercent)) ? lvlObj.needPercent : (defLvl.needPercent || 70);
      lvlObj.timeLimit = (typeof lvlObj.timeLimit === 'number' && !isNaN(lvlObj.timeLimit) && lvlObj.timeLimit > 0) ? lvlObj.timeLimit : (defLvl.timeLimit || 240);
      lvlObj.spawnRate = (typeof lvlObj.spawnRate === 'number' && !isNaN(lvlObj.spawnRate) && lvlObj.spawnRate > 0) ? lvlObj.spawnRate : (defLvl.spawnRate || 20);
      
      const defaultSkills = defLvl.skills || { climb: 4, float: 4, bash: 4, mine: 4, drill: 4, bomb: 2, build: 6, block: 3, portal: 1 };
      lvlObj.skills = Object.assign({}, defaultSkills, lvlObj.skills || {});

      if (typeof lvlObj.spawnX !== 'number' || isNaN(lvlObj.spawnX)) lvlObj.spawnX = defLvl.spawnX || 90;
      if (typeof lvlObj.spawnY !== 'number' || isNaN(lvlObj.spawnY)) lvlObj.spawnY = defLvl.spawnY || 60;
      if (typeof lvlObj.gateX !== 'number' || isNaN(lvlObj.gateX)) lvlObj.gateX = defLvl.gateX || 710;
      if (typeof lvlObj.gateY !== 'number' || isNaN(lvlObj.gateY)) lvlObj.gateY = defLvl.gateY || 254;
      if (!Array.isArray(lvlObj.elements) || lvlObj.elements.length === 0) {
        lvlObj.elements = JSON.parse(JSON.stringify(defLvl.elements || []));
      }
      return lvlObj;
    });
  }

  loadCampaignOverridesFromStorage() {
    try {
      const saved = localStorage.getItem('terra_campaign_overrides');
      if (saved) {
        this.campaignOverrides = JSON.parse(saved);
      } else {
        this.campaignOverrides = {};
      }
    } catch(e) {
      this.campaignOverrides = {};
    }
  }

  saveCampaignOverridesToStorage() {
    try {
      localStorage.setItem('terra_campaign_overrides', JSON.stringify(this.campaignOverrides));
      StageManager.rebuildActiveLevels();
    } catch(e) {
      console.warn("Failed to save campaign overrides", e);
    }
  }

  saveToCampaignSlot(slotIdx, stageData) {
    if (slotIdx < 0 || slotIdx >= (DEFAULT_CAMPAIGN_LEVELS.length || 10)) return null;
    const clone = JSON.parse(JSON.stringify(stageData));
    clone.id = slotIdx + 1;
    clone.isOverridden = true;
    if (typeof clone.spawnX !== 'number' || isNaN(clone.spawnX)) clone.spawnX = 90;
    if (typeof clone.spawnY !== 'number' || isNaN(clone.spawnY)) clone.spawnY = 60;
    if (typeof clone.gateX !== 'number' || isNaN(clone.gateX)) clone.gateX = 710;
    if (typeof clone.gateY !== 'number' || isNaN(clone.gateY)) clone.gateY = 254;
    
    this.campaignOverrides[slotIdx] = clone;
    this.saveCampaignOverridesToStorage();
    this.renderStageList();

    // If game is currently on this stage, reload terrain
    if (!this.game.isCustomPlay && this.game.currentLevelIdx === slotIdx) {
      if (this.game.gameState !== GAME_STATE.EDITOR) {
        this.game.loadLevel(slotIdx, false);
      }
    }
    return clone;
  }

  resetCampaignSlot(slotIdx) {
    if (this.campaignOverrides[slotIdx]) {
      delete this.campaignOverrides[slotIdx];
      this.saveCampaignOverridesToStorage();
      this.renderStageList();

      if (!this.game.isCustomPlay && this.game.currentLevelIdx === slotIdx) {
        if (this.game.gameState !== GAME_STATE.EDITOR) {
          this.game.loadLevel(slotIdx, false);
        }
      }
      return true;
    }
    return false;
  }

  resetAllCampaignSlots() {
    this.campaignOverrides = {};
    this.saveCampaignOverridesToStorage();
    this.renderStageList();
    if (!this.game.isCustomPlay) {
      this.game.loadLevel(this.game.currentLevelIdx, false);
    }
  }

  loadCustomStagesFromStorage() {
    try {
      const saved = localStorage.getItem('terra_custom_stages');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          this.customStages = parsed;
        }
      }
    } catch(e) {
      this.customStages = [];
    }
  }

  saveCustomStagesToStorage() {
    try {
      localStorage.setItem('terra_custom_stages', JSON.stringify(this.customStages));
    } catch(e) {}
  }

  saveCustomLevel(stageData) {
    if (!stageData) return null;
    const clone = JSON.parse(JSON.stringify(stageData));
    if (!clone.id || typeof clone.id === 'number') {
      clone.id = `CUSTOM_${Date.now()}`;
    }
    if (!clone.title) {
      clone.title = "CUSTOM SECTOR";
    }
    if (typeof clone.spawnX !== 'number' || isNaN(clone.spawnX)) clone.spawnX = 90;
    if (typeof clone.spawnY !== 'number' || isNaN(clone.spawnY)) clone.spawnY = 60;
    if (typeof clone.gateX !== 'number' || isNaN(clone.gateX)) clone.gateX = 710;
    if (typeof clone.gateY !== 'number' || isNaN(clone.gateY)) clone.gateY = 254;

    const existingIdx = this.customStages.findIndex(s => s.id === clone.id || (s.title && s.title === clone.title));
    if (existingIdx >= 0) {
      this.customStages[existingIdx] = clone;
    } else {
      this.customStages.push(clone);
    }

    this.saveCustomStagesToStorage();
    this.renderStageList();
    return clone;
  }

  addCustomStage(stageData) {
    return this.saveCustomLevel(stageData);
  }

  deleteCustomStage(idx) {
    if (idx >= 0 && idx < this.customStages.length) {
      this.customStages.splice(idx, 1);
      this.saveCustomStagesToStorage();
      this.renderStageList();
    }
  }

  // --- Save Target Slot Modal ---
  openSaveSlotModal(stageData, defaultSlot = null) {
    this.pendingSaveData = JSON.parse(JSON.stringify(stageData));
    const modal = document.getElementById('modal-save-slot');
    const select = document.getElementById('save-target-slot-select');
    const titleInput = document.getElementById('save-target-title-input');
    if (!modal || !select) return;

    select.innerHTML = '';

    // Campaign 1 ~ 10 options
    LEVELS.forEach((lvl, idx) => {
      const opt = document.createElement('option');
      opt.value = idx.toString();
      const isMod = !!this.campaignOverrides[idx];
      opt.innerText = `[${idx + 1}구역 슬롯] ${lvl.title} ${isMod ? '★(커스텀 수정됨)' : '(기본 맵)'}`;
      select.appendChild(opt);
    });

    // Custom slot option
    const customOpt = document.createElement('option');
    customOpt.value = 'custom';
    customOpt.innerText = `[📁 커스텀 슬롯] 새 커스텀 맵으로 독립 보관`;
    select.appendChild(customOpt);

    // Determine preselected value
    if (defaultSlot === 'custom') {
      select.value = 'custom';
    } else if (defaultSlot !== null && defaultSlot !== undefined && !isNaN(defaultSlot)) {
      select.value = defaultSlot.toString();
    } else if (!this.game.isCustomPlay) {
      select.value = this.game.currentLevelIdx.toString();
    } else {
      select.value = 'custom';
    }

    if (titleInput) {
      titleInput.value = this.pendingSaveData.title || 'CUSTOM SECTOR';
    }

    modal.style.display = 'flex';
    SFX.playClick();
  }

  closeSaveSlotModal() {
    const modal = document.getElementById('modal-save-slot');
    if (modal) modal.style.display = 'none';
    this.pendingSaveData = null;
  }

  initSaveSlotModalEvents() {
    const btnCancel = document.getElementById('btn-save-slot-cancel');
    if (btnCancel) {
      btnCancel.onclick = () => this.closeSaveSlotModal();
    }

    const btnConfirm = document.getElementById('btn-save-slot-confirm');
    if (btnConfirm) {
      btnConfirm.onclick = () => this.executeSaveSlot();
    }

    const select = document.getElementById('save-target-slot-select');
    const titleInput = document.getElementById('save-target-title-input');
    if (select && titleInput) {
      select.onchange = () => {
        const val = select.value;
        if (val !== 'custom') {
          const idx = parseInt(val, 10);
          if (LEVELS[idx] && (!titleInput.value || titleInput.value === 'CUSTOM SECTOR' || titleInput.value === 'NEW CREATED SECTOR')) {
            titleInput.value = LEVELS[idx].title;
          }
        }
      };
    }
  }

  executeSaveSlot() {
    if (!this.pendingSaveData) return;
    const select = document.getElementById('save-target-slot-select');
    const titleInput = document.getElementById('save-target-title-input');
    const downloadCheck = document.getElementById('save-download-json-check');

    const targetVal = select ? select.value : 'custom';
    const newTitle = titleInput && titleInput.value.trim() ? titleInput.value.trim() : (this.pendingSaveData.title || 'CUSTOM SECTOR');
    this.pendingSaveData.title = newTitle;

    // Deep clone data before any modal closing
    const finalSavedData = JSON.parse(JSON.stringify(this.pendingSaveData));

    let savedResult = null;
    let savedLabel = '';

    if (targetVal === 'custom') {
      savedResult = this.saveCustomLevel(finalSavedData);
      savedLabel = `[📁 커스텀 슬롯] '${newTitle}' 저장 완료!`;
    } else {
      const slotIdx = parseInt(targetVal, 10);
      savedResult = this.saveToCampaignSlot(slotIdx, finalSavedData);
      savedLabel = `[${slotIdx + 1}구역 슬롯] '${newTitle}' 캠페인 적용 완료!`;
    }

    // Download JSON if checked
    if (downloadCheck && downloadCheck.checked) {
      const cleanTitle = newTitle.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_');
      const fileName = targetVal === 'custom' ? `custom_${cleanTitle}.json` : `stage_${parseInt(targetVal, 10) + 1}_${cleanTitle}.json`;
      try {
        const jsonStr = JSON.stringify(finalSavedData, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch(e) {
        console.warn("Direct download skipped:", e);
      }
    }

    // Feedback
    SFX.playTeleport();

    if (this.game && this.game.editor) {
      this.game.editor.levelData = JSON.parse(JSON.stringify(finalSavedData));
      this.game.editor.updateStatus();
    }

    this.closeSaveSlotModal();

    const statusEl = document.getElementById('editor-status-info');
    if (statusEl) {
      statusEl.innerHTML = `<span style="color: #00ff88; font-weight: 700;">💾 ${savedLabel}</span>`;
    }
    if (this.game && this.game.particles) {
      this.game.particles.spawnFloatingText(400, 180, `💾 ${savedLabel}`, "#00ff88");
    }
  }

  // --- Modal Tabs & List Rendering ---
  initTabs() {
    const tabBtns = document.querySelectorAll('.modal-tab-btn');
    tabBtns.forEach(btn => {
      btn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const targetTab = btn.dataset.tab;
        if (targetTab) {
          this.switchTab(targetTab);
          SFX.playClick();
        }
      };
    });
  }

  initJsonButtons() {
    const btnImport = document.getElementById('btn-stage-mgr-import');
    if (btnImport) {
      btnImport.onclick = () => this.importFromJson();
    }
    const btnRefresh = document.getElementById('btn-stage-mgr-refresh');
    if (btnRefresh) {
      btnRefresh.onclick = () => {
        this.updateJsonView();
        SFX.playClick();
      };
    }
    const btnClose = document.getElementById('btn-stage-mgr-close');
    if (btnClose) {
      btnClose.onclick = () => this.closeModal();
    }
    const btnResetAll = document.getElementById('btn-reset-all-campaign');
    if (btnResetAll) {
      btnResetAll.onclick = () => {
        if (confirm("전체 10개 캠페인 구역을 오리지널 기본 맵으로 초기화하시겠습니까?")) {
          this.resetAllCampaignSlots();
          SFX.playExplosion();
          if (this.game && this.game.particles) {
            this.game.particles.spawnFloatingText(400, 180, "🔄 전체 10개 구역 기본 맵으로 초기화 완료!", "#ffb700");
          }
        }
      };
    }

    // 1-Click Campaign.json Download (For GitHub synchronization)
    const btnDownCamp = document.getElementById('btn-download-campaign-json');
    if (btnDownCamp) {
      btnDownCamp.onclick = () => this.downloadCampaignJson();
    }

    // Copy JSON to clipboard
    const btnCopy = document.getElementById('btn-copy-json');
    if (btnCopy) {
      btnCopy.onclick = () => this.copyJsonToClipboard();
    }

    // Download current JSON view file
    const btnDownJson = document.getElementById('btn-download-json-file');
    if (btnDownJson) {
      btnDownJson.onclick = () => this.downloadCurrentJsonArea();
    }

    // File upload trigger & listener
    const btnUploadTrig = document.getElementById('btn-upload-json-file-trigger');
    const inputStageFile = document.getElementById('input-stage-file');
    if (btnUploadTrig && inputStageFile) {
      btnUploadTrig.onclick = () => inputStageFile.click();
      inputStageFile.onchange = (e) => {
        const file = e.target.files[0];
        if (file) {
          this.importFromJsonFile(file);
          inputStageFile.value = '';
        }
      };
    }

    // Radio type switch in JSON tab
    document.querySelectorAll('input[name="json-export-type"]').forEach(radio => {
      radio.onchange = () => this.updateJsonView();
    });
  }

  switchTab(tabId) {
    this.currentTab = tabId;
    const tabBtns = document.querySelectorAll('.modal-tab-btn');
    const tabContents = document.querySelectorAll('#modal-stage-manager .tab-content');

    tabBtns.forEach(btn => {
      const isTarget = btn.dataset.tab === tabId;
      btn.classList.toggle('active', isTarget);
    });

    tabContents.forEach(content => {
      const isTarget = content.id === tabId;
      content.classList.toggle('active', isTarget);
      content.style.display = isTarget ? 'flex' : 'none';
    });

    if (tabId === 'tab-json') {
      this.updateJsonView();
    } else {
      this.renderStageList();
    }
  }

  openModal(defaultTab = 'tab-campaign') {
    const modal = document.getElementById('modal-stage-manager');
    if (!modal) return;
    modal.style.display = 'flex';
    this.switchTab(defaultTab);
    SFX.playClick();
  }

  closeModal() {
    const modal = document.getElementById('modal-stage-manager');
    if (modal) modal.style.display = 'none';
  }

  renderStageList() {
    const campList = document.getElementById('campaign-stage-list');
    const customList = document.getElementById('custom-stage-list');
    
    if (campList) {
      campList.innerHTML = '';
      LEVELS.forEach((lvl, idx) => {
        const item = document.createElement('div');
        item.className = 'stage-item-card';
        const isMod = !!this.campaignOverrides[idx];
        const modBadge = isMod ? ` <span style="background: rgba(255,183,0,0.25); color:var(--neon-gold); border:1px solid var(--neon-gold); border-radius:4px; padding:1px 5px; font-size:9px;">★커스텀 수정됨</span>` : ` <span style="background: rgba(0,255,136,0.15); color:#00ff88; border:1px solid #00ff88; border-radius:4px; padding:1px 5px; font-size:9px;">기본</span>`;
        const scoreBadge = lvl.difficultyScore ? ` <span style="color:var(--neon-gold); font-size:10px;">(${lvl.difficultyScore}pt)</span>` : '';
        const dnaBadge = lvl.solutionDna ? ` | <span style="color:var(--neon-cyan); font-size:10px;">DNA: ${lvl.solutionDna.join('→')}</span>` : '';

        item.innerHTML = `
          <div class="stage-item-info">
            <div class="stage-item-title">${idx + 1}구역: ${lvl.title}${modBadge}${scoreBadge}</div>
            <div class="stage-item-desc">${lvl.totalUnits}기 유닛 | 목표 ${lvl.needPercent}% | 제한 ${lvl.timeLimit}초${dnaBadge}</div>
          </div>
          <div class="stage-item-actions">
            <button class="btn-tool btn-tool-play" data-act="play" data-idx="${idx}">▶️ 플레이</button>
            <button class="btn-tool" data-act="edit" data-idx="${idx}">✏️ 수정</button>
            ${isMod ? `<button class="btn-tool" style="border-color: #ffb700; color: #ffb700;" data-act="reset-slot" data-idx="${idx}" title="기본 맵으로 복원">🔄 복원</button>` : ''}
          </div>
        `;
        campList.appendChild(item);
      });
    }

    if (customList) {
      customList.innerHTML = '';
      if (this.customStages.length === 0) {
        customList.innerHTML = `
          <div style="font-size:12px; color:var(--text-dim); padding:24px 10px; text-align:center; line-height: 1.6;">
            저장된 커스텀 맵이 없습니다.<br>
            <span style="color:var(--neon-cyan);">[🛠️ EDITOR]</span> 또는 <span style="color:#00ff88;">[✨ CREATOR]</span>에서 맵을 제작 후 <span style="color:#00ff88; font-weight:bold;">[💾 맵 저장]</span>을 누르거나,<br>
            <span style="color:var(--neon-gold);">[JSON 입출력]</span> 탭에서 JSON 코드를 불러오세요.
          </div>
        `;
      } else {
        this.customStages.forEach((lvl, idx) => {
          const item = document.createElement('div');
          item.className = 'stage-item-card';
          const totalU = lvl.totalUnits || 15;
          const quota = lvl.needPercent || 70;
          const elemCount = (lvl.elements || []).length;
          item.innerHTML = `
            <div class="stage-item-info">
              <div class="stage-item-title">${lvl.title || 'CUSTOM SECTOR'}</div>
              <div class="stage-item-desc">${totalU}기 유닛 | 목표 ${quota}% | 지형 오브젝트 ${elemCount}개</div>
            </div>
            <div class="stage-item-actions">
              <button class="btn-tool btn-tool-play" data-act="play-custom" data-idx="${idx}">▶️ 플레이</button>
              <button class="btn-tool" data-act="edit-custom" data-idx="${idx}">✏️ 수정</button>
              <button class="btn-tool btn-tool-danger" data-act="del-custom" data-idx="${idx}" title="삭제">🗑️</button>
            </div>
          `;
          customList.appendChild(item);
        });
      }
    }

    this.bindListEvents();
  }

  bindListEvents() {
    document.querySelectorAll('#campaign-stage-list button, #custom-stage-list button').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const act = btn.dataset.act;
        const idx = parseInt(btn.dataset.idx, 10);

        if (act === 'play') {
          this.closeModal();
          this.game.loadLevel(idx, false);
          this.game.startMissionWithCountdown();
        } else if (act === 'edit') {
          this.closeModal();
          this.game.enterEditor(LEVELS[idx]);
        } else if (act === 'reset-slot') {
          if (confirm(`${idx + 1}구역을 오리지널 기본 맵으로 복원하시겠습니까?`)) {
            this.resetCampaignSlot(idx);
            SFX.playClick();
          }
        } else if (act === 'play-custom') {
          this.closeModal();
          if (this.customStages[idx]) {
            this.game.loadLevelFromData(this.customStages[idx], true);
          }
        } else if (act === 'edit-custom') {
          this.closeModal();
          if (this.customStages[idx]) {
            this.game.enterEditor(this.customStages[idx]);
          }
        } else if (act === 'del-custom') {
          const target = this.customStages[idx];
          const name = target ? target.title : '커스텀 맵';
          if (confirm(`'${name}'을(를) 삭제하시겠습니까?`)) {
            this.deleteCustomStage(idx);
            SFX.playExplosion();
          }
        }
      };
    });
  }

  updateJsonView() {
    const area = document.getElementById('json-export-area');
    if (!area) return;
    const typeRadio = document.querySelector('input[name="json-export-type"]:checked');
    const exportType = typeRadio ? typeRadio.value : 'current';

    if (exportType === 'campaign') {
      // Full 10 Campaign Stages Set (matching stages/campaign.json structure)
      const campaignSet = LEVELS.map(lvl => {
        const clone = JSON.parse(JSON.stringify(lvl));
        delete clone.isOverridden;
        return clone;
      });
      area.value = JSON.stringify(campaignSet, null, 2);
    } else if (exportType === 'all') {
      // Full Backup including campaign and custom slots
      const fullBackup = {
        version: "1.0",
        timestamp: new Date().toISOString(),
        campaign: LEVELS.map(lvl => {
          const clone = JSON.parse(JSON.stringify(lvl));
          delete clone.isOverridden;
          return clone;
        }),
        customStages: this.customStages || []
      };
      area.value = JSON.stringify(fullBackup, null, 2);
    } else {
      // Single Current Level
      let current = null;
      if (this.game.gameState === GAME_STATE.EDITOR && this.game.editor && this.game.editor.levelData) {
        current = this.game.editor.levelData;
      } else if (this.game.isCustomPlay && this.game.activeCustomData) {
        current = this.game.activeCustomData;
      } else if (LEVELS && LEVELS[this.game.currentLevelIdx]) {
        current = LEVELS[this.game.currentLevelIdx];
      } else if (this.game.editor && this.game.editor.levelData) {
        current = this.game.editor.levelData;
      } else {
        current = StageDataEngine.createDefaultStage();
      }
      const clone = JSON.parse(JSON.stringify(current));
      delete clone.isOverridden;
      area.value = JSON.stringify(clone, null, 2);
    }
  }

  downloadCampaignJson() {
    const campaignSet = LEVELS.map(lvl => {
      const clone = JSON.parse(JSON.stringify(lvl));
      delete clone.isOverridden;
      return clone;
    });
    const jsonStr = JSON.stringify(campaignSet, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'campaign.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    SFX.playTeleport();
    if (this.game && this.game.particles) {
      this.game.particles.spawnFloatingText(400, 180, "💾 campaign.json 다운로드 완료! (stages/ 폴더 덮어쓰기 후 git push)", "#00ff88");
    }
  }

  downloadCurrentJsonArea() {
    const area = document.getElementById('json-export-area');
    if (!area) return;
    const jsonStr = area.value.trim();
    if (!jsonStr) {
      alert("다운로드할 JSON 데이터가 없습니다.");
      return;
    }
    const typeRadio = document.querySelector('input[name="json-export-type"]:checked');
    const exportType = typeRadio ? typeRadio.value : 'current';
    let filename = 'stage.json';
    if (exportType === 'campaign') filename = 'campaign.json';
    else if (exportType === 'all') filename = `nano_terra_backup_${Date.now()}.json`;
    else {
      try {
        const parsed = JSON.parse(jsonStr);
        if (parsed.title) filename = `stage_${parsed.title.replace(/[^a-zA-Z0-9가-힣_]/g, '_')}.json`;
      } catch(e) {}
    }

    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    SFX.playTeleport();
  }

  copyJsonToClipboard() {
    const area = document.getElementById('json-export-area');
    if (!area) return;
    const text = area.value.trim();
    if (!text) {
      alert("복사할 JSON 내용이 없습니다.");
      return;
    }
    navigator.clipboard.writeText(text).then(() => {
      SFX.playClick();
      if (this.game && this.game.particles) {
        this.game.particles.spawnFloatingText(400, 180, "📋 JSON 클립보드 복사 완료!", "#ffb700");
      } else {
        alert("클립보드에 복사되었습니다!");
      }
    }).catch(() => {
      area.select();
      document.execCommand('copy');
      alert("클립보드에 복사되었습니다!");
    });
  }

  importFromJsonFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target.result;
        this.processImportedJsonData(JSON.parse(content));
      } catch(err) {
        alert(`JSON 파일 파싱 실패: ${err.message}`);
      }
    };
    reader.readAsText(file);
  }

  importFromJson() {
    const area = document.getElementById('json-export-area');
    if (!area) return;
    const rawVal = area.value.trim();
    if (!rawVal) {
      alert("JSON 코드를 입력해주세요.");
      return;
    }

    try {
      const data = JSON.parse(rawVal);
      this.processImportedJsonData(data);
    } catch(err) {
      alert(`JSON 불러오기 오류: ${err.message}`);
    }
  }

  processImportedJsonData(data) {
    if (!data) return;

    // 1. Case: Entire Campaign Set (Array of stages, e.g. campaign.json)
    if (Array.isArray(data) && data.length > 0 && data[0].elements) {
      if (confirm(`총 ${data.length}개의 구역이 포함된 캠페인 맵 세트 파일입니다.\n현재 캠페인 1~${data.length}구역에 일괄 적용하시겠습니까?`)) {
        this.campaignOverrides = {};
        data.forEach((lvl, idx) => {
          if (idx < 10) {
            const clone = JSON.parse(JSON.stringify(lvl));
            clone.id = idx + 1;
            clone.isOverridden = true;
            this.campaignOverrides[idx] = clone;
          }
        });
        this.saveCampaignOverridesToStorage();
        this.renderStageList();
        if (!this.game.isCustomPlay) {
          this.game.loadLevel(this.game.currentLevelIdx, false);
        }
        SFX.playTeleport();
        alert("✅ 전체 캠페인 맵 세트가 성공적으로 적용되었습니다!");
        return;
      }
    }

    // 2. Case: Full Backup Object ({ campaign: [...], customStages: [...] })
    if (data.campaign && Array.isArray(data.campaign)) {
      if (confirm("캠페인 10개 구역 및 커스텀 슬롯이 모두 포함된 통합 백업 파일입니다.\n전체 복원하시겠습니까?")) {
        this.campaignOverrides = {};
        data.campaign.forEach((lvl, idx) => {
          if (idx < 10) {
            const clone = JSON.parse(JSON.stringify(lvl));
            clone.id = idx + 1;
            clone.isOverridden = true;
            this.campaignOverrides[idx] = clone;
          }
        });
        this.saveCampaignOverridesToStorage();

        if (Array.isArray(data.customStages)) {
          this.customStages = data.customStages;
          this.saveCustomStagesToStorage();
        }
        this.renderStageList();
        SFX.playTeleport();
        alert("✅ 전체 맵 및 커스텀 슬롯 통합 복원이 완료되었습니다!");
        return;
      }
    }

    // 3. Case: Single Stage Object
    if (data.elements && Array.isArray(data.elements)) {
      if (!data.title) data.title = "IMPORTED SECTOR";
      if (!data.totalUnits) data.totalUnits = 15;
      if (!data.needPercent) data.needPercent = 70;
      if (!data.timeLimit) data.timeLimit = 240;
      if (!data.spawnRate) data.spawnRate = 20;
      if (!data.skills) {
        data.skills = { climb: 4, float: 4, bash: 4, mine: 4, drill: 4, bomb: 2, build: 6, block: 3, portal: 1 };
      }
      if (data.spawnX === undefined) data.spawnX = 90;
      if (data.spawnY === undefined) data.spawnY = 60;
      if (data.gateX === undefined) data.gateX = 710;
      if (data.gateY === undefined) data.gateY = 254;

      this.openSaveSlotModal(data, 'custom');
      this.closeModal();
      SFX.playTeleport();
      return;
    }

    throw new Error("올바른 맵 데이터 형식이 아닙니다 (elements 또는 campaign 배열 누락).");
  }
}
