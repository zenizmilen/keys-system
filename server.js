const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATABASE_FILE = path.join(__dirname, 'keys.json');

console.log('🚀 Iniciando servidor...');
console.log('📁 Database path:', DATABASE_FILE);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS para aceitar requisições do Roblox
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

// Log de todas as requisições
app.use((req, res, next) => {
    console.log(`${req.method} ${req.path} - ${new Date().toISOString()}`);
    next();
});

// Funções do banco de dados
function loadDB() {
    try {
        if (fs.existsSync(DATABASE_FILE)) {
            const data = fs.readFileSync(DATABASE_FILE, 'utf8');
            const parsed = JSON.parse(data);
            console.log(`✅ DB carregado: ${Object.keys(parsed.keys || {}).length} keys`);
            return parsed;
        }
    } catch (error) {
        console.error('❌ Erro ao carregar DB:', error);
    }
    console.log('📝 Criando novo banco de dados');
    return { keys: {}, hwids: {} };
}

function saveDB(data) {
    try {
        fs.writeFileSync(DATABASE_FILE, JSON.stringify(data, null, 2));
        console.log('💾 DB salvo com sucesso');
        return true;
    } catch (error) {
        console.error('❌ Erro ao salvar DB:', error);
        return false;
    }
}

// Inicializar DB
const initialDB = loadDB();
if (!fs.existsSync(DATABASE_FILE)) {
    saveDB(initialDB);
}

// ROOT - Página inicial
app.get('/', (req, res) => {
    // Se não tem parâmetros, mostra página de status
    if (!req.query.key && !req.query.hwid) {
        return res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Clufin Key Verification</title>
                <style>
                    body {
                        background: #0d0d0d;
                        color: #00d4ff;
                        font-family: 'Courier New', monospace;
                        padding: 40px;
                        text-align: center;
                    }
                    .container {
                        max-width: 600px;
                        margin: 0 auto;
                        background: #1a1a1a;
                        padding: 30px;
                        border-radius: 10px;
                        border: 2px solid #00d4ff;
                    }
                    h1 { color: #00ff96; }
                    .status { color: #00ff96; font-size: 24px; }
                    code {
                        background: #0d0d0d;
                        padding: 5px 10px;
                        border-radius: 5px;
                        display: block;
                        margin: 10px 0;
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>🔐 Clufin Key Verification Server</h1>
                    <p class="status">✅ ONLINE</p>
                    <p>Server Time: ${new Date().toISOString()}</p>
                    <hr>
                    <h3>📡 Endpoints:</h3>
                    <code>GET /?key=YOUR_KEY&hwid=YOUR_HWID</code>
                    <code>GET /health</code>
                    <code>GET /debug/keys</code>
                    <code>POST /test-key (body: {key, hwid})</code>
                </div>
            </body>
            </html>
        `);
    }

    // Verificação de key via GET
    const { key, hwid } = req.query;
    
    console.log(`[VERIFICAÇÃO] Key: ${key}, HWID: ${hwid}`);
    
    if (!key || !hwid) {
        console.log('[ERRO] Parâmetros faltando');
        return res.json({
            valid: false,
            reason: 'Key ou HWID não fornecido'
        });
    }
    
    const db = loadDB();
    const keyData = db.keys[key];
    
    if (!keyData) {
        console.log(`[ERRO] Key não encontrada: ${key}`);
        return res.json({
            valid: false,
            reason: 'Key inválida ou não encontrada'
        });
    }
    
    if (!keyData.active) {
        console.log(`[ERRO] Key desativada: ${key}`);
        return res.json({
            valid: false,
            reason: 'Key foi desativada'
        });
    }
    
    const now = Date.now();
    if (keyData.expiresAt && keyData.expiresAt < now) {
        console.log(`[ERRO] Key expirada: ${key}`);
        keyData.active = false;
        saveDB(db);
        return res.json({
            valid: false,
            reason: 'Key expirou'
        });
    }
    
    if (keyData.hwid && keyData.hwid !== hwid) {
        console.log(`[ERRO] HWID diferente. Registrado: ${keyData.hwid}, Tentando: ${hwid}`);
        return res.json({
            valid: false,
            reason: 'Key já está vinculada a outro dispositivo'
        });
    }
    
    if (!keyData.hwid) {
        console.log(`[INFO] Registrando HWID para key ${key}`);
        keyData.hwid = hwid;
        keyData.firstUsedAt = now;
        saveDB(db);
    }
    
    keyData.lastUsedAt = now;
    saveDB(db);
    
    console.log(`[✅ SUCESSO] Key válida: ${key}`);
    return res.json({
        valid: true,
        expiresAt: keyData.expiresAt,
        daysLeft: Math.ceil((keyData.expiresAt - now) / (1000 * 60 * 60 * 24)),
        username: keyData.usedByUsername || 'Usuário'
    });
});

// Health check
app.get('/health', (req, res) => {
    const db = loadDB();
    res.json({ 
        status: 'online',
        timestamp: new Date().toISOString(),
        uptime: Math.floor(process.uptime()),
        totalKeys: Object.keys(db.keys || {}).length
    });
});

// POST para testar keys
app.post('/test-key', (req, res) => {
    const { key, hwid } = req.body;
    
    if (!key || !hwid) {
        return res.json({
            valid: false,
            reason: 'Key ou HWID não fornecido'
        });
    }
    
    const db = loadDB();
    const keyData = db.keys[key];
    
    if (!keyData) {
        return res.json({
            valid: false,
            reason: 'Key não encontrada'
        });
    }
    
    return res.json({
        valid: keyData.active,
        hasHWID: !!keyData.hwid,
        expired: keyData.expiresAt < Date.now(),
        data: keyData
    });
});

// Debug - listar keys
app.get('/debug/keys', (req, res) => {
    const db = loadDB();
    const keyList = Object.values(db.keys || {}).map(k => ({
        key: k.key,
        active: k.active,
        hasHWID: !!k.hwid,
        hwid: k.hwid ? k.hwid.substring(0, 8) + '...' : null,
        expiresAt: new Date(k.expiresAt).toLocaleString('pt-BR'),
        usedBy: k.usedByUsername
    }));
    
    res.json({
        total: keyList.length,
        active: keyList.filter(k => k.active).length,
        keys: keyList
    });
});

// Criar key de teste (APENAS PARA DEBUG)
app.get('/create-test-key', (req, res) => {
    const testKey = 'TEST' + Math.floor(Math.random() * 1000000);
    const db = loadDB();
    
    db.keys[testKey] = {
        key: testKey,
        createdAt: Date.now(),
        expiresAt: Date.now() + (30 * 24 * 60 * 60 * 1000), // 30 dias
        active: true,
        usedBy: null,
        hwid: null
    };
    
    saveDB(db);
    
    res.json({
        success: true,
        key: testKey,
        testUrl: `${req.protocol}://${req.get('host')}/?key=${testKey}&hwid=test123`
    });
});

// Reset HWID
app.post('/reset-hwid', (req, res) => {
    const { key, adminPassword } = req.body;
    
    if (adminPassword !== 'admin123') {
        return res.json({ success: false, message: 'Senha incorreta' });
    }
    
    const db = loadDB();
    const keyData = db.keys[key];
    
    if (!keyData) {
        return res.json({ success: false, message: 'Key não encontrada' });
    }
    
    keyData.hwid = null;
    saveDB(db);
    
    console.log(`[ADMIN] HWID resetado para key: ${key}`);
    return res.json({ success: true, message: 'HWID resetado' });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ 
        error: 'Endpoint não encontrado',
        path: req.path
    });
});

// Error handler
app.use((err, req, res, next) => {
    console.error('❌ Erro:', err);
    res.status(500).json({ 
        error: 'Erro interno do servidor',
        message: err.message
    });
});

// Iniciar servidor
app.listen(PORT, '0.0.0.0', () => {
    console.log('═══════════════════════════════════════');
    console.log('🚀 SERVIDOR ONLINE!');
    console.log(`📡 Porta: ${PORT}`);
    console.log(`🌐 URL Local: http://localhost:${PORT}`);
    console.log(`⏰ Iniciado em: ${new Date().toLocaleString('pt-BR')}`);
    console.log('═══════════════════════════════════════');
});
