const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const express = require('express');
const fs = require('fs');
const path = require('path');

// ===== CONFIGURAÇÃO =====
const CONFIG = {
    TOKEN: process.env.DISCORD_TOKEN || 'COLOQUE_SEU_TOKEN_AQUI_APENAS_PARA_TESTES_LOCAIS',
    PREFIX: '!',
    ADMIN_ROLE: 'Admin',
    PORT: process.env.PORT || 3000
};

const DATABASE_FILE = path.join(__dirname, 'keys.json');

// ===== FUNÇÕES DO BANCO DE DADOS =====
function loadDB() {
    try {
        if (fs.existsSync(DATABASE_FILE)) {
            const data = fs.readFileSync(DATABASE_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        console.error('❌ Erro ao carregar DB:', error);
    }
    return { keys: {}, hwids: {} };
}

function saveDB(data) {
    try {
        fs.writeFileSync(DATABASE_FILE, JSON.stringify(data, null, 2));
        return true;
    } catch (error) {
        console.error('❌ Erro ao salvar DB:', error);
        return false;
    }
}

function generateKey(prefix) {
    return prefix + Math.floor(Math.random() * 10000000);
}

// Inicializar DB
if (!fs.existsSync(DATABASE_FILE)) {
    saveDB({ keys: {}, hwids: {} });
}

// ===== SERVIDOR WEB (EXPRESS) =====
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

// Log
app.use((req, res, next) => {
    console.log(`[WEB] ${req.method} ${req.path}`);
    next();
});

// ROOT - Verificação de key
app.get('/', (req, res) => {
    // Página de status
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
                    <p>Time: ${new Date().toISOString()}</p>
                    <hr>
                    <h3>📡 Endpoints:</h3>
                    <code>GET /?key=YOUR_KEY&hwid=YOUR_HWID</code>
                    <code>GET /health</code>
                    <code>GET /debug/keys</code>
                </div>
            </body>
            </html>
        `);
    }

    // Verificação de key
    const { key, hwid } = req.query;
    
    console.log(`[VERIFY] Key: ${key}, HWID: ${hwid}`);
    
    if (!key || !hwid) {
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
        return res.json({
            valid: false,
            reason: 'Key foi desativada'
        });
    }
    
    const now = Date.now();
    if (keyData.expiresAt && keyData.expiresAt < now) {
        keyData.active = false;
        saveDB(db);
        return res.json({
            valid: false,
            reason: 'Key expirou'
        });
    }
    
    if (keyData.hwid && keyData.hwid !== hwid) {
        console.log(`[ERRO] HWID diferente`);
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
        totalKeys: Object.keys(db.keys || {}).length,
        botOnline: client.isReady()
    });
});

// Debug keys
app.get('/debug/keys', (req, res) => {
    const db = loadDB();
    const keyList = Object.values(db.keys || {}).map(k => ({
        key: k.key,
        active: k.active,
        hasHWID: !!k.hwid,
        expiresAt: new Date(k.expiresAt).toLocaleString('pt-BR'),
        usedBy: k.usedByUsername
    }));
    
    res.json({
        total: keyList.length,
        active: keyList.filter(k => k.active).length,
        keys: keyList
    });
});

// Criar key de teste
app.get('/create-test-key', (req, res) => {
    const testKey = 'TEST' + Math.floor(Math.random() * 1000000);
    const db = loadDB();
    
    db.keys[testKey] = {
        key: testKey,
        createdAt: Date.now(),
        expiresAt: Date.now() + (30 * 24 * 60 * 60 * 1000),
        active: true,
        usedBy: null,
        hwid: null
    };
    
    saveDB(db);
    
    res.json({
        success: true,
        key: testKey,
        testUrl: `/?key=${testKey}&hwid=test123`
    });
});

// ===== BOT DISCORD =====
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

function createPanel() {
    const embed = new EmbedBuilder()
        .setColor(0x7289DA)
        .setTitle('CloudNotifier Premium Version Control Panel')
        .setDescription('**Gerencie seu acesso através dos botões abaixo.**\n\n' +
            '🔑 **Redeem Key** - Ativar sua key\n' +
            '📜 **Get Script** - Obter o loadstring\n' +
            '📊 **Get Stats** - Ver suas estatísticas')
        .setFooter({ text: 'Clufin Auto Joiner V4.2' })
        .setTimestamp();

    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('redeem_key')
                .setLabel('Redeem Key')
                .setEmoji('🔑')
                .setStyle(ButtonStyle.Success),
            
            new ButtonBuilder()
                .setCustomId('get_script')
                .setLabel('Get Script')
                .setEmoji('📜')
                .setStyle(ButtonStyle.Primary),
            
            new ButtonBuilder()
                .setCustomId('get_stats')
                .setLabel('Get Stats')
                .setEmoji('📊')
                .setStyle(ButtonStyle.Secondary)
        );

    return { embeds: [embed], components: [row] };
}

client.on('ready', () => {
    console.log(`✅ Bot Discord online: ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    if (!message.content.startsWith(CONFIG.PREFIX)) return;

    const args = message.content.slice(CONFIG.PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    if (command === 'panel') {
        const panel = createPanel();
        await message.channel.send(panel);
        await message.delete().catch(() => {});
    }

    if (command === 'genkey') {
        const prefix = args[0] || 'PREMIUM';
        const days = parseInt(args[1]) || 30;
        const duration = days * 24 * 60 * 60 * 1000;

        const key = generateKey(prefix);
        const db = loadDB();
        
        db.keys[key] = {
            key: key,
            createdAt: Date.now(),
            createdBy: message.author.id,
            createdByUsername: message.author.tag,
            expiresAt: Date.now() + duration,
            active: true,
            usedBy: null,
            hwid: null
        };
        
        saveDB(db);

        const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('✅ Key Gerada!')
            .addFields(
                { name: '🎫 Key', value: `\`${key}\``, inline: false },
                { name: '⏰ Duração', value: `${days} dias`, inline: true }
            )
            .setTimestamp();

        await message.reply({ embeds: [embed] });
    }
});

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;

    if (interaction.customId === 'redeem_key') {
        await interaction.reply({
            content: '🔑 Digite sua key no chat (você tem 60 segundos):',
            ephemeral: true
        });

        const filter = m => m.author.id === interaction.user.id;
        const collector = interaction.channel.createMessageCollector({ 
            filter, 
            max: 1, 
            time: 60000 
        });

        collector.on('collect', async (msg) => {
            const key = msg.content.trim();
            await msg.delete().catch(() => {});

            const db = loadDB();
            const keyData = db.keys[key];

            if (!keyData || !keyData.active) {
                return interaction.followUp({
                    content: '❌ Key inválida!',
                    ephemeral: true
                });
            }

            keyData.usedBy = interaction.user.id;
            keyData.usedByUsername = interaction.user.tag;
            keyData.usedAt = Date.now();
            saveDB(db);

            await interaction.followUp({
                content: '✅ Key ativada com sucesso!',
                ephemeral: true
            });
        });
    }

    if (interaction.customId === 'get_script') {
        const db = loadDB();
        const userKey = Object.values(db.keys).find(
            k => k.usedBy === interaction.user.id && k.active
        );

        if (!userKey) {
            return interaction.reply({
                content: '❌ Você não tem uma key ativa!',
                ephemeral: true
            });
        }

        const loadstring = `_G.Key = "${userKey.key}"\nloadstring(game:HttpGet("https://pastefy.app/kNdaThjM/raw"))()`;

        const embed = new EmbedBuilder()
            .setColor(0x00D4FF)
            .setTitle('🚀 Seu Script!')
            .setDescription('Cole no executor:')
            .addFields({ 
                name: '📋 Loadstring', 
                value: `\`\`\`lua\n${loadstring}\n\`\`\``, 
                inline: false 
            })
            .setTimestamp();

        await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (interaction.customId === 'get_stats') {
        const db = loadDB();
        const userKey = Object.values(db.keys).find(
            k => k.usedBy === interaction.user.id
        );

        if (!userKey) {
            return interaction.reply({
                content: '❌ Você não tem keys registradas!',
                ephemeral: true
            });
        }

        const embed = new EmbedBuilder()
            .setColor(0x00D4FF)
            .setTitle('📊 Suas Estatísticas')
            .addFields(
                { name: '🎫 Key', value: `\`${userKey.key}\``, inline: true },
                { name: '📊 Status', value: userKey.active ? '✅ Ativa' : '❌ Inativa', inline: true },
                { name: '⏰ Expira', value: new Date(userKey.expiresAt).toLocaleString('pt-BR'), inline: false }
            )
            .setTimestamp();

        await interaction.reply({ embeds: [embed], ephemeral: true });
    }
});

// ===== INICIAR TUDO =====
app.listen(CONFIG.PORT, '0.0.0.0', () => {
    console.log('═══════════════════════════════════════');
    console.log('🌐 SERVIDOR WEB ONLINE');
    console.log(`📡 Porta: ${CONFIG.PORT}`);
    console.log(`🔗 URL: http://localhost:${CONFIG.PORT}`);
    console.log('═══════════════════════════════════════');
});

client.login(CONFIG.TOKEN).then(() => {
    console.log('🤖 Bot Discord conectando...');
}).catch(err => {
    console.error('❌ Erro ao conectar bot:', err);
});
