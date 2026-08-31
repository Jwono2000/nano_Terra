// --- Puzzle Actions & Difficulty Grammar System ---
const PUZZLE_ACTIONS = {
  WALK:   { skill: null,     difficulty: 0, timeCost: 8,  name: '전진', icon: '🚶' },
  BASH:   { skill: 'bash',   difficulty: 2, timeCost: 16, name: '플라즈마 수평 레이저', icon: '⚡' },
  MINE:   { skill: 'mine',   difficulty: 2, timeCost: 16, name: '대각선 연속 굴착', icon: '⛏️' },
  DRILL:  { skill: 'drill',  difficulty: 2, timeCost: 15, name: '열핵 수직 드릴', icon: '🔥' },
  CLIMB:  { skill: 'climb',  difficulty: 2, timeCost: 14, name: '전자기 흡착', icon: '🧲' },
  FLOAT:  { skill: 'float',  difficulty: 3, timeCost: 12, name: '역추진 감쇄', icon: '🚀' },
  BUILD:  { skill: 'build',  difficulty: 3, timeCost: 20, name: '3D 프린터 계단', icon: '🧱' },
  BLOCK:  { skill: 'block',  difficulty: 3, timeCost: 10, name: '위상 방어막', icon: '🛡️' },
  BOMB:   { skill: 'bomb',   difficulty: 4, timeCost: 12, name: '코어 오버로드', icon: '💣' },
  PORTAL: { skill: 'portal', difficulty: 5, timeCost: 15, name: '차원 관문', icon: '🌀' }
};

const PUZZLE_COMBOS = [
  ['BASH', 'DRILL'],
  ['BLOCK', 'BASH'],
  ['DRILL', 'FLOAT'],
  ['BUILD', 'CLIMB'],
  ['BLOCK', 'BUILD'],
  ['CLIMB', 'FLOAT'],
  ['FLOAT', 'DRILL'],
  ['BASH', 'FLOAT', 'DRILL'],
  ['BLOCK', 'BASH', 'DRILL']
];

const DIFFICULTY_SPECS = {
  easy: {
    minActions: 2,
    maxActions: 3,
    minSkillTypes: 1,
    spareAdd: 3,
    decoyPath: false,
    fatalDrop: false,
    microPlatform: false,
    decoySkill: false,
    minScore: 25,
    timeMultiplier: 1.8,
    totalUnits: 12,
    needPercent: 60,
    spawnRate: 20,
    titlePrefix: "ALPHA SECTOR (EASY)"
  },
  normal: {
    minActions: 3,
    maxActions: 5,
    minSkillTypes: 2,
    spareAdd: 2,
    decoyPath: true,
    fatalDrop: false,
    microPlatform: false,
    decoySkill: false,
    minScore: 50,
    timeMultiplier: 1.45,
    totalUnits: 15,
    needPercent: 70,
    spawnRate: 25,
    titlePrefix: "BRAVO SECTOR (NORMAL)"
  },
  hard: {
    minActions: 5,
    maxActions: 7,
    minSkillTypes: 3,
    spareAdd: 1,
    decoyPath: true,
    fatalDrop: true, // Drop 170px fatal without Float
    microPlatform: true,
    decoySkill: true,
    minScore: 85,
    timeMultiplier: 1.20,
    totalUnits: 20,
    needPercent: 80,
    spawnRate: 30,
    titlePrefix: "DELTA SECTOR (HARD)"
  },
  nightmare: {
    minActions: 7,
    maxActions: 9,
    minSkillTypes: 4,
    spareAdd: 0, // 0 spare tolerance
    decoyPath: true,
    fatalDrop: true,
    microPlatform: true,
    decoySkill: true,
    minScore: 110,
    timeMultiplier: 1.05,
    totalUnits: 25,
    needPercent: 85,
    spawnRate: 35,
    titlePrefix: "OMEGA SECTOR (NIGHTMARE)"
  }
};
