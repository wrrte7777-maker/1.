diff --git a/server.js b/server.js
index d4cb89cac2e2ada15835b6d04a7dc6716be35c90..2c6aa44f2c5fd73dddcc8a8bd6d4995f7115feec 100644
--- a/server.js
+++ b/server.js
@@ -1,148 +1,179 @@
 const http = require('http');
+const crypto = require('crypto');
 const { readFile, writeFile, mkdir } = require('fs/promises');
 const path = require('path');
 
 const PORT = process.env.PORT || 3000;
+const CLEANER_PASSWORD = process.env.CLEANER_PASSWORD || '1234';
+const KAKAO_MAP_KEY = process.env.KAKAO_MAP_KEY || '';
+const DATABASE_URL = process.env.DATABASE_URL || '';
+const { Pool } = DATABASE_URL ? require('pg') : { Pool: null };
 const PUBLIC_DIR = __dirname;
 const DATA_DIR = path.join(__dirname, 'data');
 const DATA_FILE = path.join(DATA_DIR, 'reports.json');
 const REPORT_EXPIRATION_MS = 24 * 60 * 60 * 1000;
-
-const MIME_TYPES = {
-  '.html': 'text/html; charset=utf-8',
-  '.js': 'text/javascript; charset=utf-8',
-  '.css': 'text/css; charset=utf-8',
-  '.json': 'application/json; charset=utf-8'
-};
-
-function isReportExpired(report) {
-  return Date.now() - new Date(report.created_at).getTime() >= REPORT_EXPIRATION_MS;
+const cleanerTokens = new Set();
+const pool = DATABASE_URL ? new Pool({
+  connectionString: DATABASE_URL,
+  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined
+}) : null;
+const MIME_TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8' };
+
+function activeReports(reports) {
+  return reports.filter((report) => Date.now() - new Date(report.created_at).getTime() < REPORT_EXPIRATION_MS);
 }
 
-function getActiveReports(reports) {
-  return reports.filter((report) => !isReportExpired(report));
+async function writeFileReports(reports) {
+  await mkdir(DATA_DIR, { recursive: true });
+  await writeFile(DATA_FILE, JSON.stringify(reports, null, 2));
 }
 
-async function readReports() {
+async function readFileReports() {
   await mkdir(DATA_DIR, { recursive: true });
-
   try {
-    const data = await readFile(DATA_FILE, 'utf-8');
-    const reports = JSON.parse(data);
-    const activeReports = getActiveReports(reports);
-
-    if (activeReports.length !== reports.length) {
-      await writeReports(activeReports);
-    }
-
-    return activeReports;
+    const reports = JSON.parse(await readFile(DATA_FILE, 'utf8'));
+    const active = activeReports(reports);
+    if (active.length !== reports.length) await writeFileReports(active);
+    return active;
   } catch (error) {
-    await writeFile(DATA_FILE, '[]');
+    await writeFileReports([]);
     return [];
   }
 }
 
-async function writeReports(reports) {
-  await mkdir(DATA_DIR, { recursive: true });
-  await writeFile(DATA_FILE, JSON.stringify(reports, null, 2));
+async function initializeDatabase() {
+  if (!pool) return;
+  await pool.query(`
+    CREATE TABLE IF NOT EXISTS reports (
+      id BIGSERIAL PRIMARY KEY,
+      location TEXT NOT NULL,
+      description TEXT NOT NULL,
+      photo_data TEXT NOT NULL DEFAULT '',
+      latitude DOUBLE PRECISION,
+      longitude DOUBLE PRECISION,
+      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
+      is_completed BOOLEAN NOT NULL DEFAULT FALSE
+    )
+  `);
+  await pool.query('CREATE INDEX IF NOT EXISTS reports_created_at_idx ON reports (created_at)');
+}
+
+function normalizeReport(row) {
+  return {
+    id: Number(row.id),
+    location: row.location,
+    description: row.description,
+    photoData: row.photo_data,
+    latitude: row.latitude,
+    longitude: row.longitude,
+    created_at: new Date(row.created_at).toISOString(),
+    is_completed: row.is_completed
+  };
+}
+
+async function readReports() {
+  if (!pool) return readFileReports();
+  await pool.query("DELETE FROM reports WHERE created_at < NOW() - INTERVAL '24 hours'");
+  const result = await pool.query('SELECT * FROM reports ORDER BY created_at ASC');
+  return result.rows.map(normalizeReport);
+}
+
+async function createReport(body) {
+  if (!pool) {
+    const reports = await readFileReports();
+    const report = { id: reports.length ? Math.max(...reports.map((item) => item.id)) + 1 : 1, location: String(body.location), description: String(body.description), photoData: body.photoData || '', latitude: body.latitude || null, longitude: body.longitude || null, created_at: new Date().toISOString(), is_completed: false };
+    reports.push(report);
+    await writeFileReports(reports);
+    return report;
+  }
+  const values = [String(body.location), String(body.description), body.photoData || '', body.latitude || null, body.longitude || null];
+  const result = await pool.query('INSERT INTO reports (location, description, photo_data, latitude, longitude) VALUES ($1, $2, $3, $4, $5) RETURNING *', values);
+  return normalizeReport(result.rows[0]);
+}
+
+async function markReportCompleted(id) {
+  if (!pool) {
+    const reports = await readFileReports();
+    const report = reports.find((item) => item.id === id);
+    if (!report) return null;
+    report.is_completed = true;
+    await writeFileReports(reports);
+    return report;
+  }
+  const result = await pool.query('UPDATE reports SET is_completed = TRUE WHERE id = $1 RETURNING *', [id]);
+  return result.rows[0] ? normalizeReport(result.rows[0]) : null;
 }
 
-function readRequestBody(request) {
+function readBody(request) {
   return new Promise((resolve, reject) => {
     let body = '';
-
     request.on('data', (chunk) => {
       body += chunk;
+      if (body.length > 8_000_000) request.destroy();
     });
-
     request.on('end', () => {
-      resolve(body ? JSON.parse(body) : {});
+      try { resolve(body ? JSON.parse(body) : {}); } catch (error) { reject(error); }
     });
-
     request.on('error', reject);
   });
 }
 
-function sendJson(response, statusCode, data) {
-  response.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
+function json(response, status, data) {
+  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
   response.end(JSON.stringify(data));
 }
 
-async function handleApiRequest(request, response) {
-  if (request.url === '/api/reports' && request.method === 'GET') {
-    sendJson(response, 200, await readReports());
-    return;
+async function handleApi(request, response) {
+  if (request.url === '/api/config' && request.method === 'GET') return json(response, 200, { kakaoMapKey: KAKAO_MAP_KEY });
+  if (request.url === '/api/health' && request.method === 'GET') {
+    if (pool) await pool.query('SELECT 1');
+    return json(response, 200, { status: 'ok', storage: pool ? 'postgres' : 'file' });
   }
-
+  if (request.url === '/api/cleaner/login' && request.method === 'POST') {
+    const { password } = await readBody(request);
+    if (String(password) !== CLEANER_PASSWORD) return json(response, 401, { message: '비밀번호가 올바르지 않습니다.' });
+    const token = crypto.randomBytes(24).toString('hex');
+    cleanerTokens.add(token);
+    return json(response, 200, { token });
+  }
+  if (request.url === '/api/reports' && request.method === 'GET') return json(response, 200, await readReports());
   if (request.url === '/api/reports' && request.method === 'POST') {
-    const reports = await readReports();
-    const body = await readRequestBody(request);
-    const nextId = reports.length === 0 ? 1 : Math.max(...reports.map((report) => report.id)) + 1;
-    const report = {
-      id: nextId,
-      location: body.location,
-      description: body.description,
-      photoData: body.photoData || '',
-      created_at: new Date().toISOString(),
-      is_completed: false
-    };
-
-    reports.push(report);
-    await writeReports(reports);
-    sendJson(response, 201, report);
-    return;
+    const body = await readBody(request);
+    if (!body.location || !body.description) return json(response, 400, { message: '위치와 설명을 입력해 주세요.' });
+    const report = await createReport(body);
+    return json(response, 201, report);
   }
-
-  const completeMatch = request.url.match(/^\/api\/reports\/(\d+)$/);
-
-  if (completeMatch && request.method === 'PATCH') {
-    const reports = await readReports();
-    const report = reports.find((item) => item.id === Number(completeMatch[1]));
-
-    if (!report) {
-      sendJson(response, 404, { message: '신고를 찾을 수 없습니다.' });
-      return;
-    }
-
-    report.is_completed = true;
-    await writeReports(reports);
-    sendJson(response, 200, report);
-    return;
+  const match = request.url.match(/^\/api\/reports\/(\d+)$/);
+  if (match && request.method === 'PATCH') {
+    if (!cleanerTokens.has(request.headers['x-cleaner-token'])) return json(response, 401, { message: '미화원 인증이 필요합니다.' });
+    const report = await markReportCompleted(Number(match[1]));
+    if (!report) return json(response, 404, { message: '신고를 찾을 수 없습니다.' });
+    return json(response, 200, report);
   }
-
-  sendJson(response, 404, { message: '지원하지 않는 API입니다.' });
+  return json(response, 404, { message: '지원하지 않는 API입니다.' });
 }
 
-async function serveStaticFile(request, response) {
-  const requestPath = request.url === '/' ? '/index.html' : request.url;
-  const filePath = path.join(PUBLIC_DIR, requestPath);
-
-  if (!filePath.startsWith(PUBLIC_DIR)) {
-    response.writeHead(403);
-    response.end('Forbidden');
-    return;
-  }
-
+async function serveFile(request, response) {
+  const requestPath = request.url === '/' ? '/index.html' : request.url.split('?')[0];
+  const filePath = path.resolve(PUBLIC_DIR, `.${requestPath}`);
+  if (!filePath.startsWith(`${PUBLIC_DIR}${path.sep}`)) { response.writeHead(403); return response.end('Forbidden'); }
   try {
     const file = await readFile(filePath);
-    const contentType = MIME_TYPES[path.extname(filePath)] || 'application/octet-stream';
-    response.writeHead(200, { 'Content-Type': contentType });
+    response.writeHead(200, { 'Content-Type': MIME_TYPES[path.extname(filePath)] || 'application/octet-stream' });
     response.end(file);
-  } catch (error) {
-    response.writeHead(404);
-    response.end('Not Found');
-  }
+  } catch (error) { response.writeHead(404); response.end('Not Found'); }
 }
 
 const server = http.createServer(async (request, response) => {
-  if (request.url.startsWith('/api/')) {
-    await handleApiRequest(request, response);
-    return;
-  }
-
-  await serveStaticFile(request, response);
+  try {
+    if (request.url.startsWith('/api/')) await handleApi(request, response);
+    else await serveFile(request, response);
+  } catch (error) { json(response, 400, { message: '요청을 처리할 수 없습니다.' }); }
 });
 
-server.listen(PORT, () => {
-  console.log(`Trash report app listening on http://localhost:${PORT}`);
-});
+initializeDatabase()
+  .then(() => server.listen(PORT, () => console.log(`ECO-PICK listening on http://localhost:${PORT} (${pool ? 'PostgreSQL' : 'local file'})`)))
+  .catch((error) => {
+    console.error('ECO-PICK database initialization failed:', error.message);
+    process.exit(1);
+  });
