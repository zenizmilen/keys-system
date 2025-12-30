const express = require('express');
const cors = require('cors');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const DATABASE_FILE = './keys.json';

app.use(cors());
app.use(express.json());

// Carrega banco de dados
function loadDatabase() {
    try {
        if (fs.existsSync(DATABASE_FILE)) {
            return JSON.parse(fs.readFileSync(DATABASE_FILE, 'utf8'));
        }
    } catch (error) {
        console.error('Erro ao carregar database:', error);
    }
    return { keys: {}, hwids: {} };
}

// Salva banco de dados
function saveDatabase(data) {
    fs.writeFileSync(DATABASE_FILE, JSON.stringify(data, null, 2));
}

// Verifica se key é válida
function isKeyValid(keyData) {
    if (!keyData || !keyData.active) return false;
    if (keyData.expiresAt && Date.now() > keyData.expiresAt) return false;
    return true;
}

// ENDPOINT: Verificar Key
app.get('/verify-key', (req, res) => {
    const { key, hwid } = req.query;
    
    if (!key) {
        return res.json({ valid: false, reason: 'Key não fornecida' });
    }
    
    const db = loadDatabase();
    const keyData = db.keys[key];
    
    if (!keyData) {
        return res.json({ valid: false, reason: 'Key não encontrada' });
    }
    
    if (!keyData.active) {
        return res.json({ valid: false, reason: 'Key desativada' });
    }
    
    if (keyData.expiresAt && Date.now() > keyData.expiresAt) {
        keyData.active = false;
        saveDatabase(db);
        return res.json({ valid: false, reason: 'Key expirada' });
    }
    
    // HWID Check
    if (hwid) {
        if (keyData.hwid && keyData.hwid !== hwid) {
            return res.json({ 
                valid: false, 
                reason: 'Key vinculada a outro dispositivo' 
            });
        }
        
        if (!keyData.hwid) {
            keyData.hwid = hwid;
            db.hwids[hwid] = { key: key, linkedAt: Date.now() };
            saveDatabase(db);
        }
    }
    
    return res.json({
        valid: true,
        key: key,
        expiresAt: keyData.expiresAt,
        username: keyData.usedByUsername || null
    });
});

// ENDPOINT: Página Inicial
app.get('/', (req, res) => {
    res.send(`
        <html>
        <head>
            <title>Clufin Key System</title>
            <style>
                body {
                    font-family: Arial;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    height: 100vh;
                    margin: 0;
                }
                .container {
                    background: rgba(0,0,0,0.3);
                    padding: 40px;
                    border-radius: 20px;
                    text-align: center;
                }
                h1 { font-size: 3em; margin: 0; }
                .status { 
                    background: rgba(0,255,0,0.3);
                    padding: 20px;
                    border-radius: 10px;
                    margin-top: 20px;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>🔐 Clufin Key System</h1>
                <div class="status">
                    <h2>✅ Sistema Online</h2>
                    <p>Servidor funcionando corretamente!</p>
                </div>
            </div>
        </body>
        </html>
    `);
});

// ENDPOINT: Estatísticas
app.get('/stats', (req, res) => {
    const db = loadDatabase();
    const keys = Object.values(db.keys);
    
    res.json({
        total: keys.length,
        active: keys.filter(k => k.active).length,
        expired: keys.filter(k => k.expiresAt && k.expiresAt <= Date.now()).length
    });
});

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`✅ Servidor online na porta ${PORT}`);
});

// Criar banco de dados se não existir
if (!fs.existsSync(DATABASE_FILE)) {
    saveDatabase({ keys: {}, hwids: {} });
}
