 (cd "$(git rev-parse --show-toplevel)" && git apply --3way <<'EOF' 
diff --git a/README.md b/README.md
index 504f2efd76b5fdefec7cceb9c53247928ed6a50c..d0ce8305b97192f7f3581c140c574dd005ee4ff9 100644
--- a/README.md
+++ b/README.md
@@ -1,25 +1,51 @@
-# 쓰레기 무단투기 신고 MVP
+# ECO-PICK
 
-간단한 HTML/JavaScript 신고 화면입니다. `index.html`만 직접 열면 브라우저 `localStorage`에만 저장되므로 새로고침은 유지되지만 다른 사용자에게는 보이지 않습니다.
+사진과 지도 위치를 이용하는 생활 쓰레기 신고 서비스입니다. 신고자 화면과 간편 비밀번호로 보호되는 미화원 처리 화면을 제공합니다.
 
-여러 사용자가 같은 신고 접수 목록을 보려면 함께 추가된 Node.js 서버를 실행해야 합니다.
-
-## 실행 방법
+## 로컬 실행
 
 ```bash
-node server.js
+npm install
+npm start
 ```
 
-브라우저에서 다음 주소를 엽니다.
+브라우저에서 `http://localhost:3000`을 엽니다. 개발용 미화원 비밀번호는 `1234`이며, 운영 환경에서는 반드시 변경해야 합니다. `DATABASE_URL`이 없으면 로컬 개발용 `data/reports.json`을 사용합니다.
+
+## Render 배포
+
+GitHub Pages는 Node.js 서버를 실행하지 않지만, **Render Web Service가 이 저장소를 실행한다면 프런트엔드와 API를 모두 Render 주소에서 사용할 수 있습니다.** 실제 서비스 주소는 GitHub Pages 주소가 아닌 `https://서비스명.onrender.com`입니다.
+
+Render 설정:
 
 ```text
-http://localhost:3000
+Runtime: Node
+Build Command: npm install
+Start Command: npm start
+Health Check Path: /api/health
 ```
 
-## 공유 저장 방식
+Render PostgreSQL을 생성해 Web Service에 연결하고 다음 환경 변수를 설정하세요.
+
+| 환경 변수 | 필수 | 설명 |
+| --- | --- | --- |
+| `DATABASE_URL` | 운영 시 권장 | Render PostgreSQL의 내부 연결 주소. 설정하면 테이블이 자동 생성됩니다. |
+| `CLEANER_PASSWORD` | 필수 | 미화원 전용 간편 비밀번호 |
+| `KAKAO_MAP_KEY` | 지도 사용 시 필수 | Kakao Developers에서 발급한 JavaScript 키 |
+| `NODE_ENV` | 권장 | `production` |
+
+일반 Render Web Service의 로컬 파일은 재배포나 재시작 시 유지된다고 보장할 수 없습니다. 따라서 운영 환경에서 신고를 보존하려면 `DATABASE_URL`을 반드시 연결하세요. PostgreSQL 연결에 실패하면 서버는 파일 저장으로 조용히 전환하지 않고 시작을 중단하여 데이터 유실 가능성을 알립니다.
+
+## Kakao Maps 설정
+
+1. [Kakao Developers](https://developers.kakao.com/)에서 애플리케이션을 만들고 JavaScript 키를 확인합니다.
+2. Web 플랫폼 사이트 도메인에 실제 Render 주소(예: `https://eco-pick.onrender.com`)를 등록합니다.
+3. Render 환경 변수 `KAKAO_MAP_KEY`에 JavaScript 키를 설정하고 재배포합니다.
 
-서버로 실행하면 신고 목록은 `data/reports.json` 파일에 저장됩니다. 같은 서버 주소로 접속한 사용자들은 `/api/reports` API를 통해 같은 신고 목록을 조회하고, 신고를 추가하거나 처리 완료로 변경할 수 있습니다.
+키를 생략해도 주소 직접 입력과 브라우저의 현재 위치 기능은 사용할 수 있습니다.
 
-## 주의 사항
+## 저장 및 만료 정책
 
-GitHub Pages는 정적 파일만 호스팅하므로 `server.js` 같은 백엔드 서버를 실행하지 않습니다. GitHub Pages에서 열면 다른 사용자와 신고 목록을 공유할 수 없고, 브라우저별 `localStorage` 저장만 동작합니다.
+- PostgreSQL 연결 시 신고 내용과 사진 데이터는 `reports` 테이블에 저장됩니다.
+- 로컬 개발 시에만 `data/reports.json`을 대체 저장소로 사용합니다.
+- 신고는 생성 후 24시간이 지나면 조회 시 자동 삭제됩니다.
+- 업로드 사진은 Base64 데이터로 저장되므로 운영 규모가 커지면 Cloudinary 또는 S3 같은 객체 저장소 사용을 권장합니다.
 
EOF
)
