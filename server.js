const http = require('http');
const { readFile, writeFile, mkdir } = require('fs/promises');
const path = require('path');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = __dirname;
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'reports.json');
const REPORT_EXPIRATION_MS = 24 * 60 * 60 * 1000;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8'
};

function isReportExpired(report) {
  return Date.now() - new Date(report.created_at).getTime() >= REPORT_EXPIRATION_MS;
}

function getActiveReports(reports) {
  return reports.filter((report) => !isReportExpired(report));
}

async function readReports() {
  await mkdir(DATA_DIR, { recursive: true });

  try {
    const data = await readFile(DATA_FILE, 'utf-8');
    const reports = JSON.parse(data);
    const activeReports = getActiveReports(reports);

    if (activeReports.length !== reports.length) {
      await writeReports(activeReports);
    }

    return activeReports;
  } catch (error) {
    await writeFile(DATA_FILE, '[]');
    return [];
  }
}

async function writeReports(reports) {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(DATA_FILE, JSON.stringify(reports, null, 2));
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    let body = '';

    request.on('data', (chunk) => {
      body += chunk;
    });

    request.on('end', () => {
      resolve(body ? JSON.parse(body) : {});
    });

    request.on('error', reject);
  });
}

function sendJson(response, statusCode, data) {
  response.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(data));
}

async function handleApiRequest(request, response) {
  if (request.url === '/api/reports' && request.method === 'GET') {
    sendJson(response, 200, await readReports());
    return;
  }

  if (request.url === '/api/reports' && request.method === 'POST') {
    const reports = await readReports();
    const body = await readRequestBody(request);
    const nextId = reports.length === 0 ? 1 : Math.max(...reports.map((report) => report.id)) + 1;
    const report = {
      id: nextId,
      location: body.location,
      description: body.description,
      photoData: body.photoData || '',
      created_at: new Date().toISOString(),
      is_completed: false
    };

    reports.push(report);
    await writeReports(reports);
    sendJson(response, 201, report);
    return;
  }

  const completeMatch = request.url.match(/^\/api\/reports\/(\d+)$/);

  if (completeMatch && request.method === 'PATCH') {
    const reports = await readReports();
    const report = reports.find((item) => item.id === Number(completeMatch[1]));

    if (!report) {
      sendJson(response, 404, { message: '신고를 찾을 수 없습니다.' });
      return;
    }

    report.is_completed = true;
    await writeReports(reports);
    sendJson(response, 200, report);
    return;
  }

  sendJson(response, 404, { message: '지원하지 않는 API입니다.' });
}

async function serveStaticFile(request, response) {
  const requestPath = request.url === '/' ? '/index.html' : request.url;
  const filePath = path.join(PUBLIC_DIR, requestPath);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    response.writeHead(403);
    response.end('Forbidden');
    return;
  }

  try {
    const file = await readFile(filePath);
    const contentType = MIME_TYPES[path.extname(filePath)] || 'application/octet-stream';
    response.writeHead(200, { 'Content-Type': contentType });
    response.end(file);
  } catch (error) {
    response.writeHead(404);
    response.end('Not Found');
  }
}

const server = http.createServer(async (request, response) => {
  if (request.url.startsWith('/api/')) {
    await handleApiRequest(request, response);
    return;
  }

  await serveStaticFile(request, response);
});

server.listen(PORT, () => {
  console.log(`Trash report app listening on http://localhost:${PORT}`);
});
