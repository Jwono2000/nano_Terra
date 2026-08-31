// --- Infinite Combinatorial Procedural Map Generation Engine ---
class ProceduralMapEngine {
  static THEMES = [
    'assets/bg_level_1.jpg',
    'assets/bg_level_2.jpg',
    'assets/bg_level_3.jpg',
    'assets/bg_level_4.jpg'
  ];

  static PALETTES = ['cyan', 'red', 'brown', 'green', 'purple'];
  static LAYOUTS = ['multi_tiered', 'zigzag', 'labyrinth', 'floating_islands', 'speedway', 'twin_towers'];

  static SECTOR_NAMES = [
    'GENESIS', 'VALKYRIE', 'HYPERION', 'NEBULA', 'ECLIPSE', 'QUANTUM', 
    'SOLARIS', 'CYBERDYNE', 'KRONOS', 'ABYSS', 'PROMETHEUS', 'TITAN', 
    'NEXUS', 'VORTEX', 'OLYMPUS', 'ANDROMEDA', 'AURORA', 'ZENITH'
  ];

  static getRandomItem(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  static generateProfile(points = 5, minH = 14, maxH = 40) {
    const res = [];
    for (let i = 0; i < points; i++) {
      res.push(Math.floor(Math.random() * (maxH - minH + 1)) + minH);
    }
    return res;
  }

  static generate(options = {}) {
    const difficulty = options.difficulty || 'normal';
    let layout = options.layout;
    if (!layout || layout === 'random') {
      layout = this.getRandomItem(this.LAYOUTS);
    }

    let theme = options.theme;
    if (!theme || theme === 'random') {
      theme = this.getRandomItem(this.THEMES);
    }

    let palette = options.palette;
    if (!palette || palette === 'random') {
      if (theme.includes('level_2')) palette = 'red';
      else if (theme.includes('level_3')) palette = 'purple';
      else if (theme.includes('level_4')) palette = 'brown';
      else palette = this.getRandomItem(this.PALETTES);
    }

    const cfg = DIFFICULTY_SPECS[difficulty] || DIFFICULTY_SPECS.normal;
    let rockType = 'craggyRock';
    if (palette === 'red') rockType = 'volcanicBasalt';
    else if (palette === 'purple') rockType = 'quantumCrystal';

    const spawnX = 50 + Math.floor(Math.random() * 50);
    const spawnY = 40 + Math.floor(Math.random() * 20);
    let elements = [];
    let gateX = 720;
    let gateY = 260;

    let fatalDropCount = 0;
    let decoyCount = 0;
    let steelCount = 0;
    let comboCount = 0;

    // --- Layout 1: MULTI_TIERED (3~4 다단 하강형) ---
    if (layout === 'multi_tiered') {
      // 1. Tier 1 (Spawn Deck)
      const t1W = 100 + Math.floor(Math.random() * 60);
      const t1Y = 90 + Math.floor(Math.random() * 20);
      elements.push({ type: 'platform', x: spawnX - 25, y: t1Y, w: t1W, h: 20, palette });

      // Decoy Upper Trap
      if (cfg.decoyPath || difficulty === 'hard' || difficulty === 'nightmare') {
        const decoyW = 140 + Math.floor(Math.random() * 50);
        elements.push({ type: 'platform', x: spawnX + t1W + 15, y: t1Y, w: decoyW, h: 20, palette });
        elements.push({ type: 'steelBarrier', x: spawnX + t1W + decoyW, y: t1Y - 70, w: 20, h: 90 });
        decoyCount++;
        steelCount++;
      }

      // 2. Tier 2 (Middle Deck)
      const t2Y = (cfg.fatalDrop || difficulty === 'hard' || difficulty === 'nightmare') ? 260 : 190;
      if (cfg.fatalDrop) fatalDropCount++;
      const t2X = 50 + Math.floor(Math.random() * 30);
      const t2W = 460 + Math.floor(Math.random() * 80);
      elements.push({
        type: rockType, x: t2X, y: t2Y, w: t2W, h: 24, palette,
        profile: this.generateProfile(6, 16, 36)
      });

      // Rock wall & Steel barrier
      const wallX = t2X + 160 + Math.floor(Math.random() * 60);
      elements.push({ type: 'rockWall', x: wallX, y: t2Y - 70, w: 60, h: 70, palette });

      if (difficulty !== 'easy') {
        const steelX = wallX + 100 + Math.floor(Math.random() * 40);
        elements.push({ type: 'steelBarrier', x: steelX, y: t2Y - 75, w: 20, h: 95 });
        steelCount++;
      }

      // 3. Tier 3 (Lower Runway to Portal)
      const t3Y = t2Y + 80 + Math.floor(Math.random() * 20);
      const t3X = 200 + Math.floor(Math.random() * 60);
      const t3W = 540;
      elements.push({
        type: rockType, x: t3X, y: t3Y, w: t3W, h: 28, palette,
        profile: this.generateProfile(6, 20, 42)
      });

      if (difficulty === 'nightmare') {
        elements.push({ type: 'rockWall', x: 560 + Math.floor(Math.random() * 40), y: t3Y - 70, w: 60, h: 70, palette });
      }

      gateX = 710 + Math.floor(Math.random() * 30);
      gateY = t3Y - 26;

    // --- Layout 2: ZIGZAG (좌우 반전 회랑형) ---
    } else if (layout === 'zigzag') {
      const t1W = 120 + Math.floor(Math.random() * 40);
      const t1Y = 90 + Math.floor(Math.random() * 20);
      elements.push({ type: 'platform', x: 40, y: t1Y, w: t1W, h: 20, palette });

      const t2Y = 190 + Math.floor(Math.random() * 30);
      elements.push({
        type: rockType, x: 50, y: t2Y, w: 630, h: 24, palette,
        profile: this.generateProfile(7, 16, 36)
      });

      // Right turnaround block wall
      elements.push({ type: 'steelBarrier', x: 650, y: t2Y - 70, w: 20, h: 90 });
      steelCount++;

      // Mid barriers
      elements.push({ type: 'rockWall', x: 300 + Math.floor(Math.random() * 60), y: t2Y - 70, w: 60, h: 70, palette });

      const t3Y = t2Y + 85 + Math.floor(Math.random() * 20);
      elements.push({
        type: rockType, x: 60, y: t3Y, w: 700, h: 28, palette,
        profile: this.generateProfile(7, 20, 40)
      });

      gateX = 720;
      gateY = t3Y - 26;

    // --- Layout 3: QUANTUM_LABYRINTH (분기 미궁형) ---
    } else if (layout === 'labyrinth') {
      const t1Y = 90;
      elements.push({ type: 'platform', x: 40, y: t1Y, w: 140, h: 20, palette });

      // Upper bypass route
      const upperW = 180 + Math.floor(Math.random() * 40);
      elements.push({ type: 'platform', x: 200, y: t1Y, w: upperW, h: 20, palette });
      elements.push({ type: 'steelBarrier', x: 200 + upperW - 15, y: t1Y - 70, w: 20, h: 90 });
      steelCount++;

      // Middle route
      const t2Y = 200 + Math.floor(Math.random() * 20);
      elements.push({
        type: rockType, x: 70, y: t2Y, w: 530, h: 26, palette,
        profile: this.generateProfile(6, 18, 36)
      });
      elements.push({ type: 'rockWall', x: 270 + Math.floor(Math.random() * 40), y: t2Y - 70, w: 60, h: 70, palette });
      elements.push({ type: 'steelBarrier', x: 460 + Math.floor(Math.random() * 40), y: t2Y - 75, w: 20, h: 95 });
      steelCount++;

      // Lower route
      const t3Y = 305 + Math.floor(Math.random() * 20);
      elements.push({
        type: rockType, x: 200, y: t3Y, w: 560, h: 30, palette,
        profile: this.generateProfile(6, 20, 42)
      });

      gateX = 720;
      gateY = t3Y - 26;

    // --- Layout 4: FLOATING_ISLANDS (다중 섬 징검다리형) ---
    } else if (layout === 'floating_islands') {
      const t1Y = 90;
      elements.push({ type: 'platform', x: 40, y: t1Y, w: 120, h: 20, palette });

      // Island A
      const is1Y = 180 + Math.floor(Math.random() * 20);
      elements.push({
        type: rockType, x: 70, y: is1Y, w: 220, h: 24, palette,
        profile: this.generateProfile(4, 16, 32)
      });
      elements.push({ type: 'rockWall', x: 190, y: is1Y - 70, w: 55, h: 70, palette });

      // Island B
      const is2Y = is1Y + 30;
      elements.push({
        type: rockType, x: 320, y: is2Y, w: 200, h: 24, palette,
        profile: this.generateProfile(4, 18, 34)
      });
      elements.push({ type: 'steelBarrier', x: 470, y: is2Y - 70, w: 20, h: 90 });
      steelCount++;

      // Island C (Landing & Gate)
      const is3Y = 290 + Math.floor(Math.random() * 20);
      elements.push({
        type: rockType, x: 260, y: is3Y, w: 500, h: 28, palette,
        profile: this.generateProfile(5, 20, 40)
      });

      gateX = 720;
      gateY = is3Y - 26;

    // --- Layout 5: SPEEDWAY (직선 런웨이 및 고가 포탈형) ---
    } else if (layout === 'speedway') {
      const t1Y = 100;
      elements.push({ type: 'platform', x: 40, y: t1Y, w: 130, h: 20, palette });

      const t2Y = 210 + Math.floor(Math.random() * 20);
      elements.push({
        type: rockType, x: 60, y: t2Y, w: 480, h: 26, palette,
        profile: this.generateProfile(6, 18, 36)
      });

      elements.push({ type: 'rockWall', x: 240 + Math.floor(Math.random() * 30), y: t2Y - 70, w: 60, h: 70, palette });
      elements.push({ type: 'rockWall', x: 400 + Math.floor(Math.random() * 30), y: t2Y - 70, w: 60, h: 70, palette });

      // Elevated Gate Deck reachable by stairs or float
      const gateDeckY = 160 + Math.floor(Math.random() * 20);
      elements.push({ type: 'platform', x: 580, y: gateDeckY, w: 180, h: 22, palette });
      gateX = 720;
      gateY = gateDeckY - 26;

    // --- Layout 6: TWIN_TOWERS (쌍둥이 타워 및 지하 연결형) ---
    } else {
      const t1Y = 90;
      elements.push({ type: 'platform', x: 40, y: t1Y, w: 130, h: 20, palette });

      // Tower 1 deck
      const t2Y = 200;
      elements.push({
        type: rockType, x: 60, y: t2Y, w: 300, h: 26, palette,
        profile: this.generateProfile(4, 18, 36)
      });
      elements.push({ type: 'rockWall', x: 220, y: t2Y - 80, w: 60, h: 80, palette });

      // Tower 2 deck
      elements.push({
        type: rockType, x: 400, y: t2Y, w: 260, h: 26, palette,
        profile: this.generateProfile(4, 18, 36)
      });
      elements.push({ type: 'steelBarrier', x: 530, y: t2Y - 80, w: 20, h: 90 });
      steelCount++;

      // Underground Floor
      const t3Y = 310;
      elements.push({
        type: rockType, x: 180, y: t3Y, w: 580, h: 28, palette,
        profile: this.generateProfile(6, 20, 42)
      });

      gateX = 720;
      gateY = t3Y - 26;
    }

    // Dynamic Solution DNA
    const pool = ['BASH', 'DRILL', 'FLOAT', 'BUILD', 'CLIMB', 'BLOCK'];
    const count = Math.floor(Math.random() * (cfg.maxActions - cfg.minActions + 1)) + cfg.minActions;
    const solution = [];
    if (cfg.fatalDrop) solution.push('FLOAT');
    solution.push('BASH', 'DRILL');
    while (solution.length < count) {
      solution.push(this.getRandomItem(pool));
    }

    // Dynamic Skills Budget
    const skills = {
      float: 3 + Math.floor(Math.random() * 4),
      bash: 3 + Math.floor(Math.random() * 4),
      mine: 3 + Math.floor(Math.random() * 4),
      drill: 3 + Math.floor(Math.random() * 4),
      build: 3 + Math.floor(Math.random() * 4),
      block: 2 + Math.floor(Math.random() * 3),
      climb: 2 + Math.floor(Math.random() * 3),
      bomb: 2,
      portal: 1
    };

    const timeLimit = 120 + Math.floor(Math.random() * 120);
    const uniqueSector = this.getRandomItem(this.SECTOR_NAMES);
    const sectorCode = Math.floor(Math.random() * 899 + 100);
    const diffScore = Math.floor(Math.random() * 50 + cfg.minScore);

    const levelData = {
      id: "CUSTOM",
      title: `${uniqueSector} SECTOR #${sectorCode} (${difficulty.toUpperCase()})`,
      bgImg: theme,
      terrainTheme: palette,
      desc: `[${layout.toUpperCase()}] 레이아웃의 전술 테라포밍 구역입니다. (난이도: ${difficulty.toUpperCase()}, 점수: ${diffScore}pt)`,
      totalUnits: cfg.totalUnits + Math.floor(Math.random() * 5),
      needPercent: cfg.needPercent,
      spawnRate: cfg.spawnRate,
      timeLimit,
      skills,
      spawnX,
      spawnY,
      gateX,
      gateY,
      elements,
      solutionDna: solution,
      difficultyScore: diffScore,
      layoutType: layout
    };

    return levelData;
  }
}
