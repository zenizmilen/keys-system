const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATABASE_FILE = './keys.json';

// Middleware
app.use(express.json());

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

// Funções do banco de dados
function loadDB() {
    try {
        if (fs.existsSync(DATABASE_FILE)) {
            const data = fs.readFileSync(DATABASE_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        console.error('Erro ao carregar DB:', error);
    }
    return { keys: {}, hwids: {} };
}

function saveDB(data) {
    try {
        fs.writeFileSync(DATABASE_FILE, JSON.stringify(data, null, 2));
        return true;
    } catch (error) {
        console.error('Erro ao salvar DB:', error);
        return false;
    }
}

// Endpoint principal de verificação (GET)
app.get('/', (req, res) => {
    const { key, hwid } = req.query;
    
    console.log(`[VERIFICAÇÃO] Key: ${key}, HWID: ${hwid}, Time: ${new Date().toISOString()}`);
    
    // Validação básica
    if (!key || !hwid) {
        console.log('[ERRO] Key ou HWID faltando');
        return res.json({
            valid: false,
            reason: 'Key ou HWID não fornecido'
        });
    }
    
    const db = loadDB();
    const keyData = db.keys[key];
    
    // Key não existe
    if (!keyData) {
        console.log(`[ERRO] Key não encontrada: ${key}`);
        return res.json({
            valid: false,
            reason: 'Key inválida ou não encontrada'
        });
    }
    
    // Key não está ativa
    if (!keyData.active) {
        console.log(`[ERRO] Key desativada: ${key}`);
        return res.json({
            valid: false,
            reason: 'Key foi desativada'
        });
    }
    
    // Verificar expiração
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
    
    // Verificar HWID
    if (keyData.hwid) {
        // Key já tem HWID registrado
        if (keyData.hwid !== hwid) {
            console.log(`[ERRO] HWID diferente. Registrado: ${keyData.hwid}, Tentando: ${hwid}`);
            return res.json({
                valid: false,
                reason: 'Key já está vinculada a outro dispositivo'
            });
        }
    } else {
        // Primeira vez usando a key - registrar HWID
        console.log(`[INFO] Registrando HWID para key ${key}: ${hwid}`);
        keyData.hwid = hwid;
        keyData.firstUsedAt = now;
        saveDB(db);
    }
    
    // Atualizar último uso
    keyData.lastUsedAt = now;
    saveDB(db);
    
    // Key válida!
    console.log(`[SUCESSO] Key válida: ${key}`);
    return res.json({
        valid: true,
        expiresAt: keyData.expiresAt,
        daysLeft: Math.ceil((keyData.expiresAt - now) / (1000 * 60 * 60 * 24)),
        username: keyData.usedByUsername || 'Usuário'
    });
});

// Endpoint para resetar HWID (apenas para admins)
app.post('/reset-hwid', (req, res) => {
    const { key, adminPassword } = req.body;
    
    // Senha de admin simples (MUDE ISSO!)
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
    return res.json({ success: true, message: 'HWID resetado com sucesso' });
});

// Endpoint para listar keys (apenas para debug)
app.get('/debug/keys', (req, res) => {
    const db = loadDB();
    const keyList = Object.values(db.keys).map(k => ({
        key: k.key,
        active: k.active,
        hasHWID: !!k.hwid,
        expiresAt: new Date(k.expiresAt).toLocaleString('pt-BR'),
        usedBy: k.usedByUsername
    }));
    
    res.json({
        total: keyList.length,
        keys: keyList
    });
});

// Health check
app.get('/health', (req, res) => {
    res.json({ 
        status: 'online',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`🚀 Servidor de verificação rodando na porta ${PORT}`);
    console.log(`📝 Endpoint de verificação: http://localhost:${PORT}/?key=KEY&hwid=HWID`);
    console.log(`💾 Arquivo de banco de dados: ${DATABASE_FILE}`);
    
    // Criar arquivo de keys se não existir
    if (!fs.existsSync(DATABASE_FILE)) {
        console.log('📁 Criando arquivo de banco de dados...');
        saveDB({ keys: {}, hwids: {} });
    }
});
