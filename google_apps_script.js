/**
 * ============================================================================
 * [nano_Terra] 온라인 랭킹 수집 및 조회용 Google Apps Script
 * ============================================================================
 * 
 * [시트 구성 안내]
 * 1. 구글 드라이브에서 새로운 '구글 스프레드시트'를 하나 생성합니다.
 * 2. 하단 시트 탭 이름을 'scores' 로 변경합니다.
 * 3. 1행에 아래 순서대로 헤더를 입력합니다:
 *    -------------------------------------------------------------------------
 *    A열: 서버시각 (serverTime)
 *    B열: nickname
 *    C열: stageId
 *    D열: stageName
 *    E열: score
 *    F열: rank
 *    G열: clearedAt
 *    -------------------------------------------------------------------------
 *    ※ 시트가 비어있어도 첫 전송 시 위 헤더가 자동으로 생성됩니다.
 * 
 * [배포 방법 (중요)]
 * 1. 스프레드시트 상단 메뉴 [확장 프로그램] -> [Apps Script] 클릭
 * 2. 편집기에 있는 기본 코드를 지우고 본 파일의 전체 코드를 복사하여 붙여넣기
 * 3. SCORE_TOKEN 값을 게임 코드(js/engine/GameEngine.js)의 SCORE_TOKEN과 동일하게 설정
 * 4. 우측 상단 파란색 [배포] -> [새 배포] 클릭
 * 5. 왼쪽 톱니바퀴 아이콘 클릭 -> [웹 앱(Web App)] 선택
 *    - 설명: nano_Terra Ranking API
 *    - 다음 사용자 권한으로 실행: 나 (Me)
 *    - 액세스 권한: 모든 사용자 (Anyone)  <--- 필수! (로그인 없이 점수 전송/조회 가능하도록)
 * 6. [배포] 클릭 -> [액세스 승인] 절차 완료
 * 7. 발급된 '웹 앱 URL' (https://script.google.com/macros/s/.../exec) 복사
 * 8. 게임 코드(js/engine/GameEngine.js)의 SCORE_API_URL 상수에 붙여넣기!
 * ============================================================================
 */

// 시트 열 순서: [서버시각, nickname, stageId, stageName, score, rank, clearedAt]
const SCORE_TOKEN = "nano_terra_secret_token_2026";
const SHEET_NAME = "scores";

/**
 * 점수 전송 API (POST)
 * Content-Type: 'text/plain' 으로 전송된 JSON 문자열 수신
 * 본문: { token, nickname, stageId, stageName, score, rank, clearedAt }
 */
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return jsonResponse({ ok: false, error: "요청 본문이 없습니다." });
    }

    let data;
    try {
      data = JSON.parse(e.postData.contents);
    } catch (parseErr) {
      return jsonResponse({ ok: false, error: "JSON 파싱 실패: " + parseErr.message });
    }

    // 1. 보안 토큰 검사
    if (!data.token || data.token !== SCORE_TOKEN) {
      return jsonResponse({ ok: false, error: "인증 토큰이 일치하지 않습니다." });
    }

    // 2. 닉네임 유효성 검사
    const nickname = (data.nickname || "").toString().trim();
    if (!nickname) {
      return jsonResponse({ ok: false, error: "닉네임이 누락되었습니다." });
    }

    // 3. 스프레드시트 접근 및 'scores' 시트 준비
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) {
      sheet = ss.insertSheet(SHEET_NAME);
      // 헤더 행 생성 (A~G열)
      sheet.appendRow(["서버시각", "nickname", "stageId", "stageName", "score", "rank", "clearedAt"]);
      sheet.getRange(1, 1, 1, 7).setFontWeight("bold").setBackground("#0f1b29").setFontColor("#00f3ff");
    }

    // 4. 데이터 정제 및 행 추가
    const serverTime = Utilities.formatDate(new Date(), "Asia/Seoul", "yyyy-MM-dd HH:mm:ss");
    const stageId = data.stageId != null ? String(data.stageId) : "";
    const stageName = (data.stageName || "").toString().trim();
    const score = Number(data.score) || 0;
    const rank = (data.rank || "-").toString().trim();
    const clearedAt = (data.clearedAt || serverTime).toString().trim();

    // 행 추가: [서버시각, nickname, stageId, stageName, score, rank, clearedAt]
    sheet.appendRow([serverTime, nickname, stageId, stageName, score, rank, clearedAt]);

    return jsonResponse({ ok: true, message: "점수 기록 완료" });

  } catch (err) {
    return jsonResponse({ ok: false, error: err.toString() });
  }
}

/**
 * 랭킹 조회 API (GET)
 * 'scores' 시트의 모든 기록을 JSON 배열로 반환
 */
function doGet(e) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) {
      return jsonResponse([]);
    }

    const rows = sheet.getDataRange().getValues();
    if (rows.length <= 1) {
      // 헤더만 있거나 비어있는 경우 빈 배열 반환
      return jsonResponse([]);
    }

    // A열: 서버시각, B열: nickname, C열: stageId, D열: stageName, E열: score, F열: rank, G열: clearedAt
    const result = [];
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      const nick = r[1] ? String(r[1]).trim() : "";
      if (!nick) continue; // 닉네임 없는 행은 제외

      result.push({
        serverTime: r[0] ? String(r[0]) : "",
        nickname: nick,
        stageId: r[2] != null ? String(r[2]) : "",
        stageName: r[3] ? String(r[3]) : "",
        score: Number(r[4]) || 0,
        rank: r[5] ? String(r[5]) : "-",
        clearedAt: r[6] ? String(r[6]) : (r[0] ? String(r[0]) : "")
      });
    }

    return jsonResponse(result);

  } catch (err) {
    return jsonResponse({ ok: false, error: err.toString() });
  }
}

/**
 * JSON 응답 헬퍼
 */
function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
