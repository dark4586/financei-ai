const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const PORT = process.env.PORT || 3000;
const BASE_DIR = __dirname;
const FRONTEND_DIR = path.join(BASE_DIR, 'finance-ai-copy-e2e84.base44.app');
const API_DIR = path.join(BASE_DIR, 'base44.app');
const MEDIA_DIR = path.join(BASE_DIR, 'media.base44.com');
const LOG_FILE = path.join(BASE_DIR, 'requests.log');

// Clear log file at startup
try {
    fs.writeFileSync(LOG_FILE, '', 'utf8');
} catch (e) {}

function logRequest(method, url, status, detail = '') {
    const logLine = `[${new Date().toISOString()}] ${method} ${url} -> ${status} ${detail}\n`;
    try {
        fs.appendFileSync(LOG_FILE, logLine, 'utf8');
    } catch (e) {}
    console.log(`[${method}] ${url} -> ${status} ${detail}`);
}

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
    // Add CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-App-Id');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        logRequest(req.method, req.url, 200, 'CORS Preflight');
        return;
    }

    const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
    let pathname = decodeURIComponent(parsedUrl.pathname);

    // 1. API Route
    if (pathname.startsWith('/api/')) {
        // Try to serve mock API files by appending .html
        let filePath = path.join(BASE_DIR, 'base44.app', pathname);
        let filePathWithHtml = filePath + '.html';

        if (fs.existsSync(filePathWithHtml) && fs.statSync(filePathWithHtml).isFile()) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            fs.createReadStream(filePathWithHtml).pipe(res);
            logRequest(req.method, req.url, 200, `Served API mock: ${filePathWithHtml}`);
            return;
        } else if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            fs.createReadStream(filePath).pipe(res);
            logRequest(req.method, req.url, 200, `Served API file: ${filePath}`);
            return;
        } else {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Mock endpoint not found' }));
            logRequest(req.method, req.url, 404, `API Mock Not Found: ${filePathWithHtml}`);
            return;
        }
    }

    // 2. Media / Images Route
    if (pathname.startsWith('/images/')) {
        let filePath = path.join(MEDIA_DIR, pathname);
        if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
            const ext = path.extname(filePath).toLowerCase();
            res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
            fs.createReadStream(filePath).pipe(res);
            logRequest(req.method, req.url, 200, `Served Image: ${filePath}`);
            return;
        } else {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Image not found');
            logRequest(req.method, req.url, 404, `Image Not Found: ${filePath}`);
            return;
        }
    }

    // 3. Frontend Route
    let filePath = path.join(FRONTEND_DIR, pathname);
    
    // Check if filePath is a directory, try to serve home.html
    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
        filePath = path.join(filePath, 'home.html');
    }

    // SPA logic: If it doesn't have an extension (e.g. /Receitas), serve home.html
    const hasExtension = path.extname(filePath) !== '';
    if (!hasExtension) {
        filePath = path.join(FRONTEND_DIR, 'home.html');
    }

    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        const ext = path.extname(filePath).toLowerCase();
        res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'text/html' });
        fs.createReadStream(filePath).pipe(res);
        logRequest(req.method, req.url, 200, `Served Frontend file: ${filePath}`);
    } else {
        // Fallback to home.html for routing
        const fallbackPath = path.join(FRONTEND_DIR, 'home.html');
        if (fs.existsSync(fallbackPath)) {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            fs.createReadStream(fallbackPath).pipe(res);
            logRequest(req.method, req.url, 200, `Served SPA Fallback: ${fallbackPath}`);
        } else {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Not Found');
            logRequest(req.method, req.url, 404, `Not Found: ${filePath}`);
        }
    }
});

server.listen(PORT, () => {
    console.log(`==================================================`);
    console.log(` Servidor FinanceAI ativo na porta ${PORT}`);
    console.log(` Pressione Ctrl+C para encerrar o servidor`);
    console.log(`==================================================`);
    
    // Abre o navegador automaticamente no Windows (apenas em ambiente local)
    if (process.platform === 'win32' && !process.env.PORT) {
        exec(`start http://localhost:${PORT}`);
    }
});
