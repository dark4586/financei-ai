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

const DB_FILE = path.join(BASE_DIR, 'db.json');
let db = {};
if (fs.existsSync(DB_FILE)) {
    try {
        db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    } catch (e) {
        console.error("Erro ao ler db.json, reiniciando banco:", e);
        db = {};
    }
}

function saveDB() {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
    } catch (e) {
        console.error("Erro ao salvar db.json:", e);
    }
}

// Load .env file if it exists (for local development)
try {
    const dotenvPath = path.join(__dirname, '.env');
    if (fs.existsSync(dotenvPath)) {
        const envContent = fs.readFileSync(dotenvPath, 'utf8');
        envContent.split('\n').forEach(line => {
            const parts = line.split('=');
            if (parts.length >= 2) {
                const key = parts[0].trim();
                const value = parts.slice(1).join('=').trim().replace(/^['"]|['"]$/g, '');
                if (key && value && !process.env[key]) {
                    process.env[key] = value;
                }
            }
        });
    }
} catch (e) {
    console.error("Failed to load .env file:", e);
}

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

                let apiRes;
                const models = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-1.5-flash'];
                let success = false;
                let apiData;
                for (const model of models) {
                    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
                    try {
                        apiRes = await fetch(geminiUrl, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                contents: [{ parts: [{ text: geminiPrompt }] }]
                            })
                        });
                        if (apiRes.ok) {
                            apiData = await apiRes.json();
                            success = true;
                            break;
                        } else {
                            const errText = await apiRes.text();
                            console.error(`Gemini API error for model ${model}:`, errText);
                        }
                    } catch (err) {
                        console.error(`Fetch failed for model ${model}:`, err);
                    }
                }

                if (success && apiData) {
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
                    throw new Error("Todos os modelos do Gemini falharam.");
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

function getRequestBuffer(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        req.on('data', chunk => chunks.push(chunk));
        req.on('end', () => resolve(Buffer.concat(chunks)));
        req.on('error', err => reject(err));
    });
}

function parseMultipart(buffer, boundary) {
    const boundaryBuffer = Buffer.from(boundary);
    const parts = [];
    
    let index = buffer.indexOf(boundaryBuffer);
    while (index !== -1) {
        const nextIndex = buffer.indexOf(boundaryBuffer, index + boundaryBuffer.length);
        if (nextIndex === -1) break;
        
        const part = buffer.subarray(index + boundaryBuffer.length, nextIndex);
        parts.push(part);
        
        index = nextIndex;
    }
    
    for (const part of parts) {
        let headerEnd = part.indexOf(Buffer.from('\r\n\r\n'));
        let delimiterLength = 4;
        if (headerEnd === -1) {
            headerEnd = part.indexOf(Buffer.from('\n\n'));
            delimiterLength = 2;
        }
        if (headerEnd === -1) continue;
        
        const header = part.subarray(0, headerEnd).toString('binary');
        let body = part.subarray(headerEnd + delimiterLength);
        
        if (body.length >= 2 && body[0] === 13 && body[1] === 10) {
            body = body.subarray(2);
        } else if (body.length >= 1 && body[0] === 10) {
            body = body.subarray(1);
        }
        
        if (body.length >= 2 && body[body.length - 2] === 13 && body[body.length - 1] === 10) {
            body = body.subarray(0, body.length - 2);
        } else if (body.length >= 1 && body[body.length - 1] === 10) {
            body = body.subarray(0, body.length - 1);
        }
        
        if (header.includes('name="file"')) {
            const filenameMatch = header.match(/filename="([^"]+)"/);
            const filename = filenameMatch ? filenameMatch[1] : 'uploaded_file';
            
            const contentTypeMatch = header.match(/Content-Type:\s*([^\r\n]+)/i);
            const contentType = contentTypeMatch ? contentTypeMatch[1] : 'application/octet-stream';
            
            return { filename, contentType, data: body };
        }
    }
    return null;
}

async function handleUploadFile(req, res) {
    try {
        const contentTypeHeader = req.headers['content-type'] || '';
        if (!contentTypeHeader.includes('multipart/form-data')) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Content-Type must be multipart/form-data' }));
            return;
        }

        const boundaryMatch = contentTypeHeader.match(/boundary=([^\s;]+)/i);
        if (!boundaryMatch) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Boundary not found in Content-Type' }));
            return;
        }

        const boundary = '--' + boundaryMatch[1];
        const requestBuffer = await getRequestBuffer(req);
        
        const filePart = parseMultipart(requestBuffer, boundary);
        if (!filePart || !filePart.data) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'No file part found in request' }));
            return;
        }

        const safeFilename = Date.now() + '_' + filePart.filename.replace(/[^a-zA-Z0-9.-]/g, '_');
        const targetPath = path.join(MEDIA_DIR, 'images', safeFilename);

        const imagesDir = path.join(MEDIA_DIR, 'images');
        if (!fs.existsSync(imagesDir)) {
            fs.mkdirSync(imagesDir, { recursive: true });
        }

        fs.writeFileSync(targetPath, filePart.data);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ file_url: `/images/${safeFilename}` }));
        logRequest(req.method, req.url, 200, `Uploaded file: ${safeFilename}`);
    } catch (e) {
        console.error("UploadFile handler failed:", e);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal Server Error' }));
    }
}

async function handleSendEmail(req, res) {
    try {
        const bodyText = await getRequestBody(req);
        const body = JSON.parse(bodyText);
        const { to, subject, body: emailBody } = body;

        console.log(`[SendEmail] Tentando enviar email para: ${to}, assunto: ${subject}`);

        // Salva o relatório HTML localmente para depuração e visualização
        try {
            const reportPath = path.join(BASE_DIR, 'last_report.html');
            fs.writeFileSync(reportPath, emailBody, 'utf8');
            console.log(`[SendEmail] Cópia local do relatório salva em: ${reportPath}`);
        } catch (err) {
            console.error("[SendEmail] Falha ao salvar cópia local do relatório:", err);
        }

        const resendKey = process.env.RESEND_API_KEY;
        const brevoKey = process.env.BREVO_API_KEY;
        const emailFrom = process.env.EMAIL_FROM || 'onboarding@resend.dev';
        
        let sent = false;
        let errorMessage = '';

        if (resendKey) {
            try {
                console.log("[SendEmail] Usando serviço Resend...");
                const response = await fetch('https://api.resend.com/emails', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${resendKey}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        from: emailFrom,
                        to: to,
                        subject: subject,
                        html: emailBody
                    })
                });

                if (response.ok) {
                    sent = true;
                    console.log("[SendEmail] Email enviado com sucesso via Resend.");
                } else {
                    const errText = await response.text();
                    errorMessage = `Erro Resend API (status ${response.status}): ${errText}`;
                    console.error("[SendEmail]", errorMessage);
                }
            } catch (err) {
                errorMessage = `Falha na requisição ao Resend: ${err.message}`;
                console.error("[SendEmail]", errorMessage);
            }
        }

        if (!sent && brevoKey) {
            try {
                console.log("[SendEmail] Usando serviço Brevo...");
                const response = await fetch('https://api.brevo.com/v3/smtp/email', {
                    method: 'POST',
                    headers: {
                        'api-key': brevoKey,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        sender: { email: emailFrom, name: "FinanceAI" },
                        to: [{ email: to }],
                        subject: subject,
                        htmlContent: emailBody
                    })
                });

                if (response.ok) {
                    sent = true;
                    console.log("[SendEmail] Email enviado com sucesso via Brevo.");
                } else {
                    const errText = await response.text();
                    errorMessage = `Erro Brevo API (status ${response.status}): ${errText}`;
                    console.error("[SendEmail]", errorMessage);
                }
            } catch (err) {
                errorMessage = `Falha na requisição ao Brevo: ${err.message}`;
                console.error("[SendEmail]", errorMessage);
            }
        }

        if (!sent) {
            if (!resendKey && !brevoKey) {
                console.log("[SendEmail] AVISO: Nenhum serviço de e-mail (Resend/Brevo) configurado. Simulação de envio bem-sucedida.");
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, mock: true }));
                logRequest(req.method, req.url, 200, 'Served Mock SendEmail (No API Key)');
            } else {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: errorMessage || 'Failed to send email' }));
                logRequest(req.method, req.url, 500, `SendEmail failed: ${errorMessage}`);
            }
        } else {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));
            logRequest(req.method, req.url, 200, 'Email sent successfully');
        }
    } catch (e) {
        console.error("[SendEmail] Handler crashed:", e);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal Server Error' }));
    }
}

async function handleEntityRequest(req, res, appId, entityName, subPath) {
    try {
        if (!db[entityName]) {
            db[entityName] = [];
        }

        const method = req.method;
        const bodyText = await getRequestBody(req);
        let body = {};
        if (bodyText) {
            try {
                body = JSON.parse(bodyText);
            } catch (e) {}
        }
        if (body && body.data && typeof body.data === 'object' && !body.id) {
            body = body.data;
        }
        db[entityName] = db[entityName].map(item => (item && item.data && typeof item.data === 'object' && item.data.id) ? item.data : item);

        if (method === 'POST' && subPath === 'bulk') {
            const items = Array.isArray(body) ? body : [body];
            const now = new Date().toISOString();
            const existingMap = new Map((db[entityName] || []).map(item => [item.id, item]));
            const createdItems = items.map(item => {
                const id = item.id || `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
                const existing = existingMap.get(id) || {};
                const newItem = {
                    ...existing,
                    ...item,
                    id,
                    created_date: item.created_date || existing.created_date || now,
                    updated_date: now
                };
                existingMap.set(id, newItem);
                return newItem;
            });
            db[entityName] = Array.from(existingMap.values());
            saveDB();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(createdItems));
            logRequest(method, req.url, 200, `Bulk upserted ${createdItems.length} items in ${entityName}`);
            return;
        }

        if (method === 'PATCH' && subPath === 'update-many') {
            const { query, data } = body;
            const now = new Date().toISOString();
            let count = 0;
            db[entityName] = db[entityName].map(item => {
                const matches = Object.entries(query || {}).every(([k, v]) => item[k] === v);
                if (matches) {
                    count++;
                    return { ...item, ...data, updated_date: now };
                }
                return item;
            });
            if (count > 0) saveDB();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, count }));
            logRequest(method, req.url, 200, `Updated many ${count} items in ${entityName}`);
            return;
        }

        if (method === 'DELETE' && !subPath) {
            const items = Array.isArray(body) ? body : (body && Array.isArray(body.items) ? body.items : null);
            if (items && Array.isArray(items)) {
                const ids = items.map(x => typeof x === 'object' ? x.id : x).filter(Boolean);
                const initialCount = db[entityName].length;
                if (ids.length > 0) {
                    db[entityName] = db[entityName].filter(item => !ids.includes(item.id));
                    saveDB();
                }
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, count: initialCount - db[entityName].length }));
                logRequest(method, req.url, 200, `Deleted specified ${ids.length} items in ${entityName}`);
                return;
            } else if (body && body.clearAll === true) {
                const initialCount = db[entityName].length;
                db[entityName] = [];
                saveDB();
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, count: initialCount }));
                logRequest(method, req.url, 200, `Cleared all ${initialCount} items in ${entityName}`);
                return;
            } else {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, count: 0 }));
                return;
            }
        }

        if (subPath) {
            const itemIndex = db[entityName].findIndex(item => item.id === subPath);

            if (method === 'GET') {
                if (itemIndex !== -1) {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(db[entityName][itemIndex]));
                    logRequest(method, req.url, 200, `Fetched item ${subPath} in ${entityName}`);
                } else {
                    res.writeHead(404, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Item not found' }));
                    logRequest(method, req.url, 404, `Item ${subPath} not found in ${entityName}`);
                }
                return;
            }

            if (method === 'PUT') {
                if (itemIndex !== -1) {
                    const now = new Date().toISOString();
                    db[entityName][itemIndex] = {
                        ...db[entityName][itemIndex],
                        ...body,
                        updated_date: now
                    };
                    saveDB();
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(db[entityName][itemIndex]));
                    logRequest(method, req.url, 200, `Updated item ${subPath} in ${entityName}`);
                } else {
                    // Create if missing on PUT
                    const now = new Date().toISOString();
                    const newItem = {
                        ...body,
                        id: subPath,
                        created_date: body.created_date || now,
                        updated_date: now
                    };
                    db[entityName].push(newItem);
                    saveDB();
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(newItem));
                    logRequest(method, req.url, 200, `Created item ${subPath} via PUT in ${entityName}`);
                }
                return;
            }

            if (method === 'DELETE') {
                if (itemIndex !== -1) {
                    db[entityName].splice(itemIndex, 1);
                    saveDB();
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true }));
                    logRequest(method, req.url, 200, `Deleted item ${subPath} in ${entityName}`);
                } else {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true }));
                    logRequest(method, req.url, 200, `Item ${subPath} already deleted in ${entityName}`);
                }
                return;
            }
        }

        if (method === 'GET' && !subPath) {
            if (entityName === 'Savings' && db.Savings) {
                let updated = false;
                const now = new Date();
                db.Savings.forEach(item => {
                    if (item && item.taxa_rendimento > 0 && item.valor_investido > 0) {
                        const lastDateStr = item.last_rendimento_date || item.updated_date || item.created_date || item.data_inicio;
                        if (lastDateStr) {
                            const lastDate = new Date(lastDateStr);
                            const diffMs = now.getTime() - lastDate.getTime();
                            const daysPassed = Math.floor(diffMs / (1000 * 60 * 60 * 24));
                            if (daysPassed >= 1) {
                                const monthlyRate = parseFloat(item.taxa_rendimento) / 100;
                                const dailyRate = monthlyRate / 30;
                                const accruedMultiplier = Math.pow(1 + dailyRate, daysPassed);
                                const newValor = parseFloat((item.valor_investido * accruedMultiplier).toFixed(4));
                                if (newValor > item.valor_investido) {
                                    item.valor_investido = newValor;
                                    item.last_rendimento_date = now.toISOString();
                                    item.updated_date = now.toISOString();
                                    updated = true;
                                }
                            }
                        }
                    }
                });
                if (updated) {
                    saveDB();
                }
            }

            const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
            const qParam = parsedUrl.searchParams.get('q');
            const sortParam = parsedUrl.searchParams.get('sort');
            const limitParam = parsedUrl.searchParams.get('limit');

            let results = [...db[entityName]];

            if (qParam) {
                try {
                    const queryObj = JSON.parse(qParam);
                    results = results.filter(item => {
                        return Object.entries(queryObj).every(([k, v]) => item[k] === v);
                    });
                } catch (e) {
                    console.error("Error parsing q filter:", e);
                }
            }

            if (sortParam) {
                const isDescending = sortParam.startsWith('-');
                const field = isDescending ? sortParam.slice(1) : sortParam;
                results.sort((o, s) => {
                    const c = o[field] ?? o.created_date ?? "";
                    const d = s[field] ?? s.created_date ?? "";
                    return isDescending ? (d > c ? 1 : -1) : (c > d ? 1 : -1);
                });
            }

            if (limitParam) {
                const limit = parseInt(limitParam, 10);
                if (!isNaN(limit)) {
                    results = results.slice(0, limit);
                }
            }

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(results));
            logRequest(method, req.url, 200, `Listed ${results.length} items in ${entityName}`);
            return;
        }

        if (method === 'POST' && !subPath) {
            const now = new Date().toISOString();
            const itemId = body.id || `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
            const newItem = {
                ...body,
                id: itemId,
                created_date: body.created_date || now,
                updated_date: body.updated_date || now
            };
            const existingIdx = db[entityName].findIndex(item => item.id === itemId);
            if (existingIdx !== -1) {
                db[entityName][existingIdx] = { ...db[entityName][existingIdx], ...newItem };
            } else {
                db[entityName].push(newItem);
            }
            saveDB();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(newItem));
            logRequest(method, req.url, 200, `Created/Updated item ${newItem.id} in ${entityName}`);
            return;
        }

        res.writeHead(405, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Method Not Allowed' }));
        logRequest(method, req.url, 405, `Unsupported request for ${entityName}`);
    } catch (e) {
        console.error("handleEntityRequest failed:", e);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal Server Error' }));
    }
}

const server = http.createServer((req, res) => {
    // Add CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-App-Id');

    // Disable caching for API requests
    if (req.url.includes('/api/')) {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
    }

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

        // Intercept UploadFile POST request
        if (req.method === 'POST' && pathname.endsWith('/integration-endpoints/Core/UploadFile')) {
            handleUploadFile(req, res);
            return;
        }

        // Intercept SendEmail POST request
        if (req.method === 'POST' && pathname.endsWith('/integration-endpoints/Core/SendEmail')) {
            handleSendEmail(req, res);
            return;
        }

        // Intercept Entity database requests
        const entityMatch = pathname.match(/^\/api\/apps\/([^\/]+)\/entities\/([^\/]+)(?:\/(.+))?$/);
        if (entityMatch) {
            const appId = entityMatch[1];
            const entityName = entityMatch[2];
            const subPath = entityMatch[3];
            
            if (entityName !== 'User') {
                handleEntityRequest(req, res, appId, entityName, subPath);
                return;
            }
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
