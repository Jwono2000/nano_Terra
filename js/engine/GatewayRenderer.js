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
     * 메카닉 게이트웨이 공통 통합 렌더러 (스폰 & 웜홀 공통 메카닉 아키텍처)
     * - 고정밀 28px 베벨 티타늄 링 섀시
     * - 8점 정밀 메카닉 리벳 볼트
     * - 4방향 유압 마그네틱 클램프 & 통풍 인디케이터
     * - 회전식 6-티스 자계 가속기 스테이터 & 텔레메트리 링
     * - 이중 위상 반전 양자 조리개 & 중심 핫스팟
     * - 컬러 테마 & 방향성 입자 플럭스만 완벽히 대칭 차별화
     */
    static renderMechanicalGateway(ctx, x, y, time = 0, isSelected = false, type = 'spawn') {
      const isSpawn = (type === 'spawn');
      x = Math.round(x);
      y = Math.round(y);

      // 테마별 컬러 정의 (동일 메카닉 구조, 컬러만 완벽 대칭 차별화)
      const theme = isSpawn ? {
        primary: '#00f3ff',       // 네온 시안
        secondary: '#0088ff',     // 일렉트릭 블루
        glow: 'rgba(0, 243, 255, 0.65)',
        ambient: 'rgba(0, 243, 255, 0.18)',
        darkBase: '#0d1522',
        darkPlate: '#141e2e',
        darkRim: '#1e2d42',
        badge: 'IN // SPAWN',
        editorTitle: `🚪 SPAWN (${x}, ${y})`
      } : {
        primary: '#bf00ff',       // 퀀텀 바이올렛
        secondary: '#ff00aa',     // 네온 마젠타
        glow: 'rgba(191, 0, 255, 0.65)',
        ambient: 'rgba(191, 0, 255, 0.18)',
        darkBase: '#160c24',
        darkPlate: '#221438',
        darkRim: '#321d50',
        badge: 'OUT // WORMHOLE',
        editorTitle: `🌀 GATE (${x}, ${y})`
      };

      ctx.save();
      ctx.translate(x, y);

      // ── 1. 앰비언트 양자 필드 글로우 (Ambient Energy Halo) ──
      const glowPulse = 1.0 + Math.sin(time * 3) * 0.12;
      const ambGrad = ctx.createRadialGradient(0, 0, 6, 0, 0, 38 * glowPulse);
      ambGrad.addColorStop(0, theme.ambient);
      ambGrad.addColorStop(0.7, theme.ambient.replace('0.18', '0.06'));
      ambGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = ambGrad;
      ctx.beginPath();
      ctx.arc(0, 0, 38 * glowPulse, 0, Math.PI * 2);
      ctx.fill();

      // ── 2. 외곽 티타늄 메카닉 프레임 링 (Outer Armored Stator Ring) ──
      // 베벨 메인 하우징 링
      ctx.lineWidth = 5;
      const ringGrad = ctx.createLinearGradient(-26, -26, 26, 26);
      ringGrad.addColorStop(0, theme.darkRim);
      ringGrad.addColorStop(0.5, theme.darkPlate);
      ringGrad.addColorStop(1, theme.darkBase);
      ctx.strokeStyle = ringGrad;
      ctx.beginPath();
      ctx.arc(0, 0, 26, 0, Math.PI * 2);
      ctx.stroke();

      // 섀시 외곽 라인 & 내부 네온 림
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = theme.primary;
      ctx.shadowColor = theme.glow;
      ctx.shadowBlur = 4;
      ctx.beginPath();
      ctx.arc(0, 0, 28.5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, 23.5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0;

      // 8점 메카닉 리벳 볼트 (45도 간격)
      ctx.fillStyle = '#64748b';
      for (let i = 0; i < 8; i++) {
        const ang = (i * Math.PI) / 4;
        const rx = Math.cos(ang) * 26;
        const ry = Math.sin(ang) * 26;
        ctx.beginPath();
        ctx.arc(rx, ry, 1.2, 0, Math.PI * 2);
        ctx.fill();
      }

      // ── 3. 4방향 유압 마그네틱 클램프 브래킷 (4-Axis Magnetic Clamps) ──
      const clampAngles = [0, Math.PI * 0.5, Math.PI, Math.PI * 1.5];
      for (const ang of clampAngles) {
        ctx.save();
        ctx.rotate(ang);

        // 클램프 중장갑 바디 (외곽 돌출 블록)
        ctx.fillStyle = theme.darkPlate;
        ctx.fillRect(23, -5, 8, 10);
        ctx.strokeStyle = theme.darkRim;
        ctx.lineWidth = 1;
        ctx.strokeRect(23, -5, 8, 10);

        // 정밀 네온 인디케이터 노치
        ctx.fillStyle = theme.primary;
        ctx.fillRect(25, -2, 4, 4);

        // 미세 주의 스트라이프 (Hazard Accent)
        ctx.fillStyle = '#ffaa00';
        ctx.fillRect(29, -4, 1.5, 8);

        ctx.restore();
      }

      // ── 4. 회전식 내부 가속기 스테이터 & 텔레메트리 링 (Rotating Inner Stator) ──
      ctx.save();
      const rotSpeed = isSpawn ? (time * 0.75) : (-time * 0.75);
      ctx.rotate(rotSpeed);

      // 대시 텔레메트리 링
      ctx.strokeStyle = theme.primary;
      ctx.lineWidth = 1.2;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.arc(0, 0, 20, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      // 6개 내부 포커싱 메카닉 에미터 티스 (Inward Magnetic Teeth)
      for (let i = 0; i < 6; i++) {
        const fangAngle = (i * Math.PI) / 3;
        ctx.save();
        ctx.rotate(fangAngle);
        ctx.fillStyle = theme.primary;
        ctx.beginPath();
        ctx.moveTo(19, -2);
        ctx.lineTo(15, 0);
        ctx.lineTo(19, 2);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      ctx.restore();

      // ── 5. 양자 조리개 & 중심 특이점 코어 (Quantum Aperture Core) ──
      const corePulse = 1.0 + Math.sin(time * 5) * 0.15;
      const coreR = Math.max(8, 13 * corePulse);

      // 내부 회전 반전 듀얼 링 (Counter-phase inner energy flux)
      ctx.save();
      ctx.rotate(-rotSpeed * 1.5);
      ctx.strokeStyle = theme.secondary;
      ctx.lineWidth = 1.5;
      ctx.shadowColor = theme.glow;
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.arc(0, 0, 15, 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.restore();

      // 중심 방사 플라즈마 그라데이션
      const coreGrad = ctx.createRadialGradient(0, 0, 1, 0, 0, coreR);
      coreGrad.addColorStop(0, '#ffffff');
      coreGrad.addColorStop(0.35, theme.primary);
      coreGrad.addColorStop(0.75, theme.secondary);
      coreGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = coreGrad;
      ctx.beginPath();
      ctx.arc(0, 0, coreR, 0, Math.PI * 2);
      ctx.fill();

      // 중심 초백색 핫스팟
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, 0, 4.5 * corePulse, 0, Math.PI * 2);
      ctx.fill();

      // ── 6. 방향성 에너지 플럭스 효과 (Directional Particle Flux) ──
      if (isSpawn) {
        // [SPAWN] 투하/방출 플럭스: 아래쪽 전개 빔 & 하향 에너지 셰브론
        ctx.save();
        const beamAlpha = 0.35 + Math.sin(time * 4) * 0.15;
        const beamGrad = ctx.createLinearGradient(0, 15, 0, 36);
        beamGrad.addColorStop(0, `rgba(0, 243, 255, ${beamAlpha})`);
        beamGrad.addColorStop(1, 'rgba(0, 243, 255, 0.0)');
        ctx.fillStyle = beamGrad;
        ctx.beginPath();
        ctx.moveTo(-10, 15);
        ctx.lineTo(-16, 36);
        ctx.lineTo(16, 36);
        ctx.lineTo(10, 15);
        ctx.closePath();
        ctx.fill();

        // 하향 에너지 펄스 셰브론
        const arrowPhase = (time * 30) % 18;
        const arrowY = 16 + arrowPhase;
        const arrowAlpha = Math.max(0, 1 - (arrowPhase / 18));
        ctx.fillStyle = `rgba(255, 255, 255, ${arrowAlpha * 0.9})`;
        ctx.font = 'bold 8px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('▼', 0, arrowY);
        ctx.restore();

      } else {
        // [WORMHOLE] 회수/흡입 플럭스: 중심 흡입 나선 파티클
        ctx.save();
        for (let p = 0; p < 4; p++) {
          const pPhase = (time * 2.2 + (p * Math.PI / 2)) % (Math.PI * 2);
          const pDist = 22 - (pPhase / (Math.PI * 2)) * 18;
          const px = Math.cos(pPhase * 2) * pDist;
          const py = Math.sin(pPhase * 2) * pDist;
          const pAlpha = (pDist / 22);
          ctx.fillStyle = (p % 2 === 0) ? `rgba(255, 255, 255, ${pAlpha})` : `rgba(255, 0, 170, ${pAlpha})`;
          ctx.beginPath();
          ctx.arc(px, py, 1.4, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }

      // ── 7. 미니멀 메카닉 사이버 HUD 배지 (Tactical Hologram Badge) ──
      ctx.save();
      ctx.font = 'bold 8.5px Orbitron, monospace, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const badgeText = theme.badge;
      const textMetrics = ctx.measureText(badgeText);
      const badgeW = Math.max(48, textMetrics.width + 10);
      const badgeH = 12;
      const badgeY = -36;

      // 반투명 다크 전술 플레이트
      ctx.fillStyle = 'rgba(10, 16, 26, 0.85)';
      if (ctx.roundRect) {
        ctx.beginPath();
        ctx.roundRect(-badgeW / 2, badgeY - badgeH / 2, badgeW, badgeH, 2);
        ctx.fill();
      } else {
        ctx.fillRect(-badgeW / 2, badgeY - badgeH / 2, badgeW, badgeH);
      }

      // 네온 프레임
      ctx.strokeStyle = isSelected ? '#ffaa00' : theme.primary;
      ctx.lineWidth = 1;
      if (ctx.roundRect) {
        ctx.beginPath();
        ctx.roundRect(-badgeW / 2, badgeY - badgeH / 2, badgeW, badgeH, 2);
        ctx.stroke();
      } else {
        ctx.strokeRect(-badgeW / 2, badgeY - badgeH / 2, badgeW, badgeH);
      }

      // 텍스트 글로우
      ctx.shadowColor = theme.primary;
      ctx.shadowBlur = 4;
      ctx.fillStyle = isSelected ? '#ffcc00' : theme.primary;
      ctx.fillText(badgeText, 0, badgeY);
      ctx.restore();

      // ── 8. 에디터 선택 인디케이터 (Editor Selected Box) ──
      if (isSelected) {
        ctx.save();
        ctx.strokeStyle = isSelected ? '#ffaa00' : theme.primary;
        ctx.lineWidth = 1.8;
        ctx.setLineDash([4, 3]);
        ctx.strokeRect(-32, -32, 64, 64);
        ctx.setLineDash([]);
        ctx.font = 'bold 10px Orbitron, sans-serif';
        ctx.fillStyle = '#ffaa00';
        ctx.textAlign = 'center';
        ctx.fillText(theme.editorTitle, 0, -46);
        ctx.restore();
      }

      ctx.restore();
    }

    static renderSpawn(ctx, x, y, time = 0, isSelected = false) {
      this.renderMechanicalGateway(ctx, x, y, time, isSelected, 'spawn');
    }

    static renderGate(ctx, x, y, time = 0, isSelected = false) {
      this.renderMechanicalGateway(ctx, x, y, time, isSelected, 'gate');
    }
  }

  return GatewayRenderer;
}));
