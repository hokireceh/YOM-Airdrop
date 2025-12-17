require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const cron = require('node-cron');
const YomAPI = require('./yom-api');

const token = process.env.TELEGRAM_BOT_TOKEN;
const envPrivateKey = process.env.WALLET_PRIVATE_KEY;
const envCookie = process.env.YOM_SESSION_COOKIE;

if (!token) {
  console.error('TELEGRAM_BOT_TOKEN is required!');
  process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });
const userSessions = new Map();

const mainMenu = {
  reply_markup: {
    inline_keyboard: [
      [{ text: '📊 Check Status', callback_data: 'status' }],
      [{ text: '💰 Check Points', callback_data: 'points' }],
      [{ text: '✅ Complete All Tasks', callback_data: 'complete_tasks' }],
      [{ text: '📅 Daily Check-In', callback_data: 'daily_checkin' }],
      [{ text: '📋 View Available Tasks', callback_data: 'view_tasks' }],
      [{ text: '🔄 Auto Mode ON/OFF', callback_data: 'toggle_auto' }],
      [{ text: '⚙️ Setup Auth', callback_data: 'setup_auth' }],
      [{ text: '❓ Help', callback_data: 'help' }]
    ]
  }
};

const authMenu = {
  reply_markup: {
    inline_keyboard: [
      [{ text: '🍪 Set Session Cookie', callback_data: 'set_cookie' }],
      [{ text: '🔐 Use Env Private Key', callback_data: 'use_env_key' }],
      [{ text: '⬅️ Back to Menu', callback_data: 'back_menu' }]
    ]
  }
};

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  
  const session = userSessions.get(chatId) || { autoMode: false, cookie: null, useEnvKey: false };
  if (envPrivateKey && !session.useEnvKey && !session.cookie) {
    session.useEnvKey = true;
    userSessions.set(chatId, session);
  }
  if (envCookie && !session.cookie) {
    session.cookie = envCookie;
    userSessions.set(chatId, session);
  }
  
  const hasEnvAuth = envPrivateKey || envCookie;
  
  const welcomeMessage = `
🎮 *YOM Airdrop Bot*

Selamat datang! Bot ini membantu kamu untuk:
- Auto complete tasks
- Daily check-in otomatis
- Monitor status akun & points

${hasEnvAuth ? '✅ Auth dari environment terdeteksi!' : '⚠️ Setup auth diperlukan'}

*Auth Options:*
🔐 Environment Secret (WALLET_PRIVATE_KEY) - Aman
🍪 Session Cookie - Manual dari browser

Pilih menu di bawah untuk memulai:
  `;
  bot.sendMessage(chatId, welcomeMessage, { parse_mode: 'Markdown', ...mainMenu });
});

bot.onText(/\/menu/, (msg) => {
  bot.sendMessage(msg.chat.id, '📋 *Menu Utama*', { parse_mode: 'Markdown', ...mainMenu });
});

bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const action = query.data;
  
  await bot.answerCallbackQuery(query.id);
  
  let session = userSessions.get(chatId) || { autoMode: false, cookie: null, useEnvKey: false, waitingFor: null };
  
  switch (action) {
    case 'status':
      await handleStatus(chatId, session);
      break;
    case 'points':
      await handlePoints(chatId, session);
      break;
    case 'complete_tasks':
      await handleCompleteTasks(chatId, session);
      break;
    case 'daily_checkin':
      await handleDailyCheckin(chatId, session);
      break;
    case 'view_tasks':
      await handleViewTasks(chatId, session);
      break;
    case 'toggle_auto':
      await handleToggleAuto(chatId, session);
      break;
    case 'setup_auth':
      const envStatus = envPrivateKey ? '✅ WALLET_PRIVATE_KEY detected' : (envCookie ? '✅ YOM_SESSION_COOKIE detected' : '❌ No env auth');
      bot.sendMessage(chatId, `⚙️ *Setup Authentication*\n\n${envStatus}\n\nPilih metode:`, { parse_mode: 'Markdown', ...authMenu });
      break;
    case 'use_env_key':
      if (envPrivateKey) {
        session.useEnvKey = true;
        session.cookie = null;
        userSessions.set(chatId, session);
        bot.sendMessage(chatId, '✅ Menggunakan WALLET_PRIVATE_KEY dari environment!', mainMenu);
      } else {
        bot.sendMessage(chatId, '❌ WALLET_PRIVATE_KEY tidak ditemukan di environment.\n\nTambahkan di Secrets:\n`WALLET_PRIVATE_KEY=0x...`', { parse_mode: 'Markdown', ...authMenu });
      }
      break;
    case 'set_cookie':
      await handleSetCookie(chatId, session);
      break;
    case 'back_menu':
      bot.sendMessage(chatId, '📋 *Menu Utama*', { parse_mode: 'Markdown', ...mainMenu });
      break;
    case 'help':
      await handleHelp(chatId);
      break;
  }
});

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  
  if (!text || text.startsWith('/')) return;
  
  const session = userSessions.get(chatId) || { autoMode: false, cookie: null, useEnvKey: false, waitingFor: null };
  
  if (session.waitingFor === 'cookie') {
    const cookie = text.trim();
    if (cookie.includes('__Secure-next-auth.session-token') || cookie.includes('cf_clearance')) {
      session.cookie = cookie;
      session.useEnvKey = false;
      session.waitingFor = null;
      userSessions.set(chatId, session);
      bot.sendMessage(chatId, '✅ Cookie berhasil disimpan!\n\nSekarang kamu bisa menggunakan semua fitur bot.', mainMenu);
    } else {
      bot.sendMessage(chatId, '⚠️ Cookie tidak valid. Pastikan menyertakan session token.');
    }
    return;
  }
});

function getYomInstance(session) {
  if (session.useEnvKey && envPrivateKey) {
    return new YomAPI(session.cookie, envPrivateKey);
  } else if (session.cookie) {
    return new YomAPI(session.cookie);
  } else if (envCookie) {
    return new YomAPI(envCookie);
  }
  return null;
}

async function handleStatus(chatId, session) {
  const yom = getYomInstance(session);
  if (!yom) {
    bot.sendMessage(chatId, '⚠️ Belum ada auth. Silahkan setup terlebih dahulu.\n\nGunakan Secrets untuk menambahkan:\n- `WALLET_PRIVATE_KEY` atau\n- `YOM_SESSION_COOKIE`', { parse_mode: 'Markdown', ...mainMenu });
    return;
  }
  
  try {
    bot.sendMessage(chatId, '🔄 Mengambil data...');
    
    const userInfo = await yom.getUserInfo();
    
    if (userInfo) {
      const metadata = userInfo.userMetadata?.[0] || {};
      const points = await yom.getPoints();
      
      const authType = session.useEnvKey ? 'Env Private Key' : 'Cookie';
      
      const statusMsg = `
📊 *Status Akun YOM*

👤 User ID: \`${userInfo.id}\`
💰 Wallet: \`${userInfo.walletAddress}\`
🏆 Points: *${points} XP*

📱 Twitter: ${metadata.twitterUser || 'Not connected'}
💬 Discord: ${metadata.discordUser || 'Not connected'}

🔄 Auto Mode: ${session.autoMode ? '✅ ON' : '❌ OFF'}
🔐 Auth: ${authType}
      `;
      bot.sendMessage(chatId, statusMsg, { parse_mode: 'Markdown', ...mainMenu });
    } else {
      bot.sendMessage(chatId, '❌ Gagal mengambil data. Auth mungkin expired.', mainMenu);
    }
  } catch (error) {
    bot.sendMessage(chatId, '❌ Error: ' + error.message, mainMenu);
  }
}

async function handlePoints(chatId, session) {
  const yom = getYomInstance(session);
  if (!yom) {
    bot.sendMessage(chatId, '⚠️ Belum ada auth.', mainMenu);
    return;
  }
  
  try {
    bot.sendMessage(chatId, '🔄 Mengambil data points...');
    const points = await yom.getPoints();
    const userInfo = await yom.getUserInfo();
    
    bot.sendMessage(chatId, `💰 *YOM Points*\n\n🏆 Total XP: *${points}*\n👛 Wallet: \`${userInfo?.walletAddress || 'N/A'}\``, { parse_mode: 'Markdown', ...mainMenu });
  } catch (error) {
    bot.sendMessage(chatId, '❌ Error: ' + error.message, mainMenu);
  }
}

async function handleCompleteTasks(chatId, session) {
  const yom = getYomInstance(session);
  if (!yom) {
    bot.sendMessage(chatId, '⚠️ Belum ada auth.', mainMenu);
    return;
  }
  
  try {
    bot.sendMessage(chatId, '🔄 Memproses tasks...');
    const result = await yom.completeTasks();
    
    bot.sendMessage(chatId, `✅ *Task Processing Complete!*\n\n${result}`, { parse_mode: 'Markdown', ...mainMenu });
  } catch (error) {
    bot.sendMessage(chatId, '❌ Error: ' + error.message, mainMenu);
  }
}

async function handleDailyCheckin(chatId, session) {
  const yom = getYomInstance(session);
  if (!yom) {
    bot.sendMessage(chatId, '⚠️ Belum ada auth.', mainMenu);
    return;
  }
  
  try {
    bot.sendMessage(chatId, '🔄 Melakukan daily check-in...');
    const result = await yom.dailyCheckin();
    
    bot.sendMessage(chatId, `📅 *Daily Check-in Result*\n\n${result}`, { parse_mode: 'Markdown', ...mainMenu });
  } catch (error) {
    bot.sendMessage(chatId, '❌ Error: ' + error.message, mainMenu);
  }
}

async function handleViewTasks(chatId, session) {
  const yom = getYomInstance(session);
  if (!yom) {
    bot.sendMessage(chatId, '⚠️ Belum ada auth.', mainMenu);
    return;
  }
  
  try {
    bot.sendMessage(chatId, '🔄 Mengambil daftar tasks...');
    const rules = await yom.getLoyaltyRules();
    
    if (rules.length === 0) {
      bot.sendMessage(chatId, '📋 Tidak ada task yang tersedia.', mainMenu);
      return;
    }
    
    let taskList = '📋 *Available Tasks*\n\n';
    for (const rule of rules.slice(0, 15)) {
      const emoji = rule.type === 'check_in' ? '📅' : 
                   rule.type.includes('twitter') || rule.type.includes('x_') ? '🐦' :
                   rule.type.includes('discord') ? '💬' : '✅';
      taskList += `${emoji} *${rule.name}*\n   Reward: ${rule.amount} XP\n\n`;
    }
    
    if (rules.length > 15) {
      taskList += `\n... dan ${rules.length - 15} task lainnya`;
    }
    
    bot.sendMessage(chatId, taskList, { parse_mode: 'Markdown', ...mainMenu });
  } catch (error) {
    bot.sendMessage(chatId, '❌ Error: ' + error.message, mainMenu);
  }
}

async function handleToggleAuto(chatId, session) {
  session.autoMode = !session.autoMode;
  userSessions.set(chatId, session);
  
  if (session.autoMode) {
    bot.sendMessage(chatId, '✅ *Auto Mode Diaktifkan!*\n\nBot akan otomatis:\n- Daily check-in: 00:05 UTC\n- Complete tasks: Setiap 6 jam', { parse_mode: 'Markdown', ...mainMenu });
  } else {
    bot.sendMessage(chatId, '❌ Auto Mode dinonaktifkan.', mainMenu);
  }
}

async function handleSetCookie(chatId, session) {
  session.waitingFor = 'cookie';
  userSessions.set(chatId, session);
  
  const msg = `
🍪 *Set Session Cookie*

*Cara mendapatkan cookie:*
1. Login ke https://quests.yom.net
2. Buka Developer Tools (F12)
3. Pergi ke tab Network
4. Refresh halaman
5. Cari request ke \`/api/auth/session\`
6. Copy nilai dari header Cookie

Kirim cookie lengkap:
  `;
  bot.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
}

async function handleHelp(chatId) {
  const helpMsg = `
❓ *Panduan YOM Airdrop Bot*

*Commands:*
/start - Mulai bot
/menu - Tampilkan menu

*Fitur:*
📊 *Check Status* - Lihat info akun
💰 *Check Points* - Lihat total XP
✅ *Complete Tasks* - Selesaikan semua task
📅 *Daily Check-In* - Daily login
📋 *View Tasks* - Lihat daftar task
🔄 *Auto Mode* - Otomatis

*Auth (Pilih salah satu):*
🔐 *WALLET_PRIVATE_KEY* - Di Secrets (aman)
🍪 *YOM_SESSION_COOKIE* - Di Secrets
🍪 *Manual Cookie* - Via chat

*Setup Secrets:*
Tambahkan di tab Secrets:
\`WALLET_PRIVATE_KEY=0x...\`
atau
\`YOM_SESSION_COOKIE=cf_clearance=...\`
  `;
  bot.sendMessage(chatId, helpMsg, { parse_mode: 'Markdown', ...mainMenu });
}

cron.schedule('5 0 * * *', async () => {
  console.log('Running scheduled daily check-in...');
  for (const [chatId, session] of userSessions.entries()) {
    if (session.autoMode) {
      const yom = getYomInstance(session);
      if (yom) {
        try {
          const result = await yom.dailyCheckin();
          bot.sendMessage(chatId, `🤖 *Auto Daily Check-in*\n\n${result}`, { parse_mode: 'Markdown' });
        } catch (error) {
          bot.sendMessage(chatId, `❌ Auto check-in failed: ${error.message}`);
        }
      }
    }
  }
});

cron.schedule('0 */6 * * *', async () => {
  console.log('Running scheduled task completion...');
  for (const [chatId, session] of userSessions.entries()) {
    if (session.autoMode) {
      const yom = getYomInstance(session);
      if (yom) {
        try {
          const result = await yom.completeTasks();
          bot.sendMessage(chatId, `🤖 *Auto Complete Tasks*\n\n${result}`, { parse_mode: 'Markdown' });
        } catch (error) {
          bot.sendMessage(chatId, `❌ Auto task failed: ${error.message}`);
        }
      }
    }
  }
});

console.log('YOM Airdrop Bot is running...');
console.log('Auth: Use WALLET_PRIVATE_KEY or YOM_SESSION_COOKIE in Secrets');
