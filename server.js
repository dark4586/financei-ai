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
function getRequestBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', () => resolve(body));
        req.on('error', err => reject(err));
    });
}

async function handleInvokeLLM(req, res) {
    try {
        const bodyText = await getRequestBody(req);
        const body = JSON.parse(bodyText);
        const prompt = body.prompt;
        const schema = body.response_json_schema;

        const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;

        if (apiKey) {
            try {
                let geminiPrompt = prompt;
                if (schema) {
                    geminiPrompt += `\n\nResponda estritamente seguindo este JSON Schema: ${JSON.stringify(schema)}`;
                }

                const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
                const apiRes = await fetch(geminiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: geminiPrompt }] }]
                    })
                });

                if (apiRes.ok) {
                    const apiData = await apiRes.json();
                    let aiText = '';
                    try {
                        aiText = apiData.candidates[0].content.parts[0].text;
                    } catch (e) {
                        throw new Error("Formato de resposta do Gemini inválido.");
                    }

                    if (schema) {
                        try {
                            let cleanText = aiText.trim();
                            if (cleanText.startsWith('```json')) {
                                cleanText = cleanText.substring(7, cleanText.length - 3).trim();
                            } else if (cleanText.startsWith('```')) {
                                cleanText = cleanText.substring(3, cleanText.length - 3).trim();
                            }
                            const jsonResult = JSON.parse(cleanText);
                            res.writeHead(200, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify(jsonResult));
                            logRequest(req.method, req.url, 200, 'Served Gemini API response (schema)');
                            return;
                        } catch (e) {
                            console.error("Failed to parse Gemini JSON schema response:", e);
                        }
                    } else {
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify(aiText));
                        logRequest(req.method, req.url, 200, 'Served Gemini API response (text)');
                        return;
                    }
                } else {
                    const errText = await apiRes.text();
                    console.error("Gemini API error:", errText);
                    throw new Error(`Erro na API do Gemini: ${apiRes.status}`);
                }
            } catch (err) {
                console.error("Gemini invocation failed, falling back to mock:", err);
            }
        }

        // Fallback responder when no API key or when API call fails
        if (schema) {
            const mockInsights = {
                insights: [
                    {
                        type: "info",
                        title: "Ative a Inteligência Artificial",
                        message: "Adicione a variável de ambiente GEMINI_API_KEY no Render com a sua chave do Google AI Studio para ativar as análises automáticas."
                    },
                    {
                        type: "opportunity",
                        title: "Dica de Economia",
                        message: "Parabéns por começar a organizar suas finanças! Monitore seus gastos mensais para identificar onde economizar."
                    }
                ]
            };
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(mockInsights));
            logRequest(req.method, req.url, 200, 'Served Mock Insights (no API Key)');
        } else {
            const lowerPrompt = prompt.toLowerCase();
            if (lowerPrompt.includes('tema') || lowerPrompt.includes('theme') || lowerPrompt.includes('mudar para')) {
                let theme = 'dark';
                if (lowerPrompt.includes('azul') || lowerPrompt.includes('blue')) theme = 'blue';
                else if (lowerPrompt.includes('verde') || lowerPrompt.includes('green')) theme = 'green';
                else if (lowerPrompt.includes('roxo') || lowerPrompt.includes('purple')) theme = 'purple';
                else if (lowerPrompt.includes('vermelho') || lowerPrompt.includes('red')) theme = 'red';
                else if (lowerPrompt.includes('dourado') || lowerPrompt.includes('gold')) theme = 'gold';
                else if (lowerPrompt.includes('ciano') || lowerPrompt.includes('cyan')) theme = 'cyan';
                else if (lowerPrompt.includes('rosa') || lowerPrompt.includes('pink')) theme = 'pink';
                
                const msg = `Troquei o tema para você!\n\n\`\`\`action\n{\n  "type": "change_theme",\n  "payload": {\n    "tema": "${theme}"\n  }\n}\n\`\`\``;
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(msg));
                logRequest(req.method, req.url, 200, 'Served Mock Theme Change Action');
                return;
            }

            const defaultMsg = `Olá! Sou a **Luna**, sua assistente pessoal. 👋\n\nPara que eu possa analisar suas finanças detalhadamente e responder perguntas personalizadas usando inteligência artificial, você precisa configurar sua chave da API do Gemini.\n\n### Como configurar:\n1. Obtenha uma chave de API gratuita no [Google AI Studio](https://aistudio.google.com/).\n2. No painel do seu Web Service no **Render**, vá em **Environment**.\n3. Adicione uma variável de ambiente com a chave **\`GEMINI_API_KEY\`** e cole o valor da sua chave.\n4. Salve as alterações.\n\n*Enquanto isso, eu posso ajudar você com comandos simples (como: "mudar o tema para azul" ou "mudar o tema para roxo")!*`;
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(defaultMsg));
            logRequest(req.method, req.url, 200, 'Served Mock Chat Reply (no API Key)');
        }
    } catch (e) {
        console.error("InvokeLLM handler failed:", e);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal Server Error' }));
    }
}

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
        // Intercept InvokeLLM POST request
        if (req.method === 'POST' && pathname.endsWith('/integration-endpoints/Core/InvokeLLM')) {
            handleInvokeLLM(req, res);
            return;
        }

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
