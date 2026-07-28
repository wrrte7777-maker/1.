# 쓰레기 무단투기 신고 MVP

간단한 HTML/JavaScript 신고 화면입니다. `index.html`만 직접 열면 브라우저 `localStorage`에만 저장되므로 새로고침은 유지되지만 다른 사용자에게는 보이지 않습니다.

여러 사용자가 같은 신고 접수 목록을 보려면 함께 추가된 Node.js 서버를 실행해야 합니다.

## 실행 방법

```bash
node server.js
```

브라우저에서 다음 주소를 엽니다.

```text
http://localhost:3000
```

## 공유 저장 방식

서버로 실행하면 신고 목록은 `data/reports.json` 파일에 저장됩니다. 같은 서버 주소로 접속한 사용자들은 `/api/reports` API를 통해 같은 신고 목록을 조회하고, 신고를 추가하거나 처리 완료로 변경할 수 있습니다.

## 주의 사항

GitHub Pages는 정적 파일만 호스팅하므로 `server.js` 같은 백엔드 서버를 실행하지 않습니다. GitHub Pages에서 열면 다른 사용자와 신고 목록을 공유할 수 없고, 브라우저별 `localStorage` 저장만 동작합니다.
