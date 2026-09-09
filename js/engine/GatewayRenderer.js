/**
 * ====================================================================
 * GatewayRenderer.js
 * 
 * 차세대 양자 게이트웨이 통합 벡터 렌더러
 * - [입구: QUANTUM DEPLOYMENT GATEWAY] (육각 장갑 캐노피, 하방 전개 홀로그램 빔, 시안/앰버 플라즈마)
 * - [출구: QUANTUM EXTRACTION WORMHOLE] (원형 구속 가속기 링, 이중 역회전 사건의 지평선, 바이올렛/마젠타 소용돌이)
 * - LevelEditor와 GameEngine 양쪽에서 100% 동일한 고품질 벡터 그래픽 및 60fps 애니메이션 공유
 * ====================================================================
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.GatewayRenderer = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {

  class GatewayRenderer {

    /**
     * 입구: [QUANTUM DEPLOYMENT GATEWAY] (양자 나노봇 투하 관문)
     * @param {CanvasRenderingContext2D} ctx
     * @param {number} x 투하 중심 X좌표
     * @param {number} y 투하 중심 Y좌표 (나노봇 출현 지점)
     * @param {number} time 애니메이션 타임스탬프
     * @param {boolean} isSelected 에디터 선택 상태 여부
     */
    static renderSpawn(ctx, x, y, time = 0, isSelected = false) {
      x = Math.round(x);
      y = Math.round(y);
      ctx.save();

      // ── 1. 하방 전개 홀로그램 에너지 콘 (Downward Holographic Beam) ──
      const beamGrad = ctx.createLinearGradient(x, y - 8, x, y + 26);
      beamGrad.addColorStop(0, 'rgba(0, 243, 255, 0.35)');
      beamGrad.addColorStop(0.4, 'rgba(0, 243, 255, 0.15)');
      beamGrad.addColorStop(1, 'rgba(0, 243, 255, 0.0)');

      ctx.beginPath();
      ctx.moveTo(x - 14, y - 8);
      ctx.lineTo(x - 22, y + 26);
      ctx.lineTo(x + 22, y + 26);
      ctx.lineTo(x + 14, y - 8);
      ctx.closePath();
      ctx.fillStyle = beamGrad;
      ctx.fill();

      // 하향 에너지 스캔라인 (Laser Grid Scanline)
      const scanPhase = ((time * 35) % 32);
      const scanY = (y - 7) + scanPhase;
      const scanHalfW = 14 + (scanPhase / 32) * 7;
      ctx.strokeStyle = 'rgba(0, 243, 255, 0.75)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x - scanHalfW, scanY);
      ctx.lineTo(x + scanHalfW, scanY);
      ctx.stroke();

      // 하향 유도 화살표 (Downward Flux Chevrons)
      const arrowAlpha1 = Math.max(0, Math.sin(time * 4) * 0.7 + 0.3);
      const arrowAlpha2 = Math.max(0, Math.cos(time * 4) * 0.7 + 0.3);
      ctx.fillStyle = `rgba(0, 243, 255, ${arrowAlpha1 * 0.8})`;
      ctx.font = 'bold 8px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('▼', x, y + 7);
      ctx.fillStyle = `rgba(0, 243, 255, ${arrowAlpha2 * 0.8})`;
      ctx.fillText('▼', x, y + 17);

      // ── 2. 중장갑 티타늄 상부 캐노피 (Armored Canopy Hood) ──
      // 베벨 육각형 하우징
      ctx.beginPath();
      ctx.moveTo(x - 22, y - 10);
      ctx.lineTo(x - 22, y - 26);
      ctx.lineTo(x - 14, y - 34);
      ctx.lineTo(x + 14, y - 34);
      ctx.lineTo(x + 22, y - 26);
      ctx.lineTo(x + 22, y - 10);
      ctx.lineTo(x + 16, y - 6);
      ctx.lineTo(x - 16, y - 6);
      ctx.closePath();

      const hoodGrad = ctx.createLinearGradient(x, y - 34, x, y - 6);
      hoodGrad.addColorStop(0, '#101524');
      hoodGrad.addColorStop(0.5, '#1e283d');
      hoodGrad.addColorStop(1, '#141a29');
      ctx.fillStyle = hoodGrad;
      ctx.fill();

      ctx.strokeStyle = '#00f3ff';
      ctx.lineWidth = 2;
      ctx.shadowColor = 'rgba(0, 243, 255, 0.6)';
      ctx.shadowBlur = 6;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // 상단 경고 띠 (Caution Stripe Bar)
      ctx.fillStyle = '#ffb700';
      ctx.fillRect(x - 10, y - 32, 20, 3);
      ctx.fillStyle = '#000000';
      for (let bx = -9; bx < 9; bx += 4) {
        ctx.fillRect(x + bx, y - 32, 2, 3);
      }

      // ── 3. 좌우 양자 방출 파일런 노드 (Quantum Emitter Pylons) ──
      const pylonAlpha = Math.sin(time * 6) > 0 ? '#00f3ff' : '#00ffaa';
      // 좌측 파일런
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(x - 26, y - 24, 5, 12);
      ctx.strokeStyle = pylonAlpha;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x - 26, y - 24, 5, 12);
      ctx.fillStyle = pylonAlpha;
      ctx.fillRect(x - 25, y - 21, 3, 6);

      // 우측 파일런
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(x + 21, y - 24, 5, 12);
      ctx.strokeStyle = pylonAlpha;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x + 21, y - 24, 5, 12);
      ctx.fillStyle = pylonAlpha;
      ctx.fillRect(x + 22, y - 21, 3, 6);

      // ── 4. 중심 투하 아퍼처 & 플라즈마 코어 (Central Aperture Iris) ──
      const corePulse = 1.0 + Math.sin(time * 5) * 0.18;
      ctx.beginPath();
      ctx.arc(x, y - 16, 7 * corePulse, 0, Math.PI * 2);
      const coreGrad = ctx.createRadialGradient(x, y - 16, 1, x, y - 16, 7 * corePulse);
      coreGrad.addColorStop(0, '#ffffff');
      coreGrad.addColorStop(0.5, '#00f3ff');
      coreGrad.addColorStop(1, 'rgba(0, 243, 255, 0.0)');
      ctx.fillStyle = coreGrad;
      ctx.fill();

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(x, y - 16, 3, 0, Math.PI * 2);
      ctx.stroke();

      // ── 5. 홀로그램 상태 라벨 ──
      ctx.font = '900 9px Orbitron, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillStyle = '#00f3ff';
      ctx.shadowColor = 'rgba(0, 243, 255, 0.7)';
      ctx.shadowBlur = 4;
      ctx.fillText('DEPLOY // SPAWN', x, y - 37);
      ctx.shadowBlur = 0;

      // ── 6. 에디터 선택 상자 (Selected Indicator) ──
      if (isSelected) {
        ctx.strokeStyle = '#00f3ff';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 3]);
        ctx.strokeRect(x - 28, y - 48, 56, 76);
        ctx.setLineDash([]);
        ctx.fillStyle = '#00f3ff';
        ctx.font = 'bold 11px Orbitron, sans-serif';
        ctx.fillText(`🚪 SPAWN (${x}, ${y})`, x, y - 52);
      }

      ctx.restore();
    }

    /**
     * 출구: [QUANTUM EXTRACTION WORMHOLE] (양자 나노봇 회수 웜홀)
     * @param {CanvasRenderingContext2D} ctx
     * @param {number} x 웜홀 중심 X좌표
     * @param {number} y 웜홀 중심 Y좌표
     * @param {number} time 애니메이션 타임스탬프
     * @param {boolean} isSelected 에디터 선택 상태 여부
     */
    static renderGate(ctx, x, y, time = 0, isSelected = false) {
      x = Math.round(x);
      y = Math.round(y);
      ctx.save();
      ctx.translate(x, y);

      // ── 1. 외곽 티타늄 가속기 링 & 구속 코일 4기 (Outer Stator Housing) ──
      ctx.strokeStyle = 'rgba(28, 20, 44, 0.85)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(0, 0, 27, 0, Math.PI * 2);
      ctx.stroke();

      // 4방향 자기장 구속 코일 블록 (0°, 90°, 180°, 270°)
      const coilAngles = [0, Math.PI * 0.5, Math.PI, Math.PI * 1.5];
      for (const ang of coilAngles) {
        ctx.save();
        ctx.rotate(ang);
        ctx.fillStyle = '#161026';
        ctx.fillRect(24, -4, 6, 8);
        ctx.strokeStyle = '#bf00ff';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(24, -4, 6, 8);
        ctx.fillStyle = '#00f3ff';
        ctx.fillRect(25, -2, 4, 4);
        ctx.restore();
      }

      // ── 2. 시계방향 회전 외곽 가속기 링 (Clockwise Accelerator) ──
      ctx.save();
      ctx.rotate(time * 0.85);
      ctx.strokeStyle = 'rgba(191, 0, 255, 0.55)';
      ctx.lineWidth = 3;
      ctx.setLineDash([8, 6]);
      ctx.beginPath();
      ctx.arc(0, 0, 24, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      // ── 3. 반시계방향 초고속 이중 나선 타원 (Counter-Rotating Quantum Ellipses) ──
      ctx.save();
      ctx.rotate(-time * 1.5);
      for (let i = 0; i < 4; i++) {
        const radX = 19 - i * 3.5;
        const radY = 11 - i * 2;
        const tilt = (i * Math.PI) / 4;
        ctx.strokeStyle = (i % 2 === 0) ? '#bf00ff' : '#00f3ff';
        ctx.lineWidth = 2.2;
        ctx.shadowColor = (i % 2 === 0) ? 'rgba(191, 0, 255, 0.8)' : 'rgba(0, 243, 255, 0.8)';
        ctx.shadowBlur = 5;
        ctx.beginPath();
        ctx.ellipse(0, 0, Math.max(3, radX), Math.max(2, radY), tilt, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.shadowBlur = 0;
      ctx.restore();

      // ── 4. 흡입형 사건의 지평선 특이점 (Inward Gravitational Singularity) ──
      const coreScale = 1.0 + Math.sin(time * 3) * 0.22;
      const vortexGrad = ctx.createRadialGradient(0, 0, 1, 0, 0, 12 * coreScale);
      vortexGrad.addColorStop(0, '#ffffff');
      vortexGrad.addColorStop(0.35, '#00f3ff');
      vortexGrad.addColorStop(0.7, '#bf00ff');
      vortexGrad.addColorStop(1, 'rgba(191, 0, 255, 0.0)');

      ctx.beginPath();
      ctx.arc(0, 0, 12 * coreScale, 0, Math.PI * 2);
      ctx.fillStyle = vortexGrad;
      ctx.fill();

      // 중심 초백색 에너지 코어
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, 0, 4.5 * coreScale, 0, Math.PI * 2);
      ctx.fill();

      // 회수 흡입 나선 파티클 (Inward Spiral Flux Dots)
      for (let p = 0; p < 4; p++) {
        const pPhase = (time * 1.8 + (p * Math.PI / 2)) % (Math.PI * 2);
        const pDist = 20 - (pPhase / (Math.PI * 2)) * 16;
        const px = Math.cos(pPhase * 2) * pDist;
        const py = Math.sin(pPhase * 2) * pDist;
        ctx.fillStyle = (p % 2 === 0) ? '#00f3ff' : '#ffffff';
        ctx.beginPath();
        ctx.arc(px, py, 1.4, 0, Math.PI * 2);
        ctx.fill();
      }

      // ── 5. 홀로그램 상태 라벨 ──
      ctx.font = '900 9px Orbitron, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillStyle = '#bf00ff';
      ctx.shadowColor = 'rgba(191, 0, 255, 0.7)';
      ctx.shadowBlur = 5;
      ctx.fillText('EXTRACT // GATE', 0, -32);
      ctx.shadowBlur = 0;

      // ── 6. 에디터 선택 상자 (Selected Indicator) ──
      if (isSelected) {
        ctx.strokeStyle = '#bf00ff';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 3]);
        ctx.strokeRect(-32, -32, 64, 64);
        ctx.setLineDash([]);
        ctx.fillStyle = '#00f3ff';
        ctx.font = 'bold 11px Orbitron, sans-serif';
        ctx.fillText(`🌀 GATE (${x}, ${y})`, 0, -42);
      }

      ctx.restore();
    }
  }

  return GatewayRenderer;
}));
