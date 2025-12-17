require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const cron = require('node-cron');
const YomAPI = require('./yom-api');

const token = process.env.TELEGRAM_BOT_TOKEN;

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
      [{ text: '✅ Complete All Tasks', callback_data: 'complete_tasks' }],
      [{ text: '📅 Daily Check-In', callback_data: 'daily_checkin' }],
      [{ text: '🔄 Auto Mode ON/OFF', callback_data: 'toggle_auto' }],
      [{ text: '⚙️ Set Session Cookie', callback_data: 'set_cookie' }],
      [{ text: '❓ Help', callback_data: 'help' }]
    ]
  }
};

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const welcomeMessage = `
🎮 *YOM Airdrop Bot*

Selamat datang! Bot ini membantu kamu untuk:
- Auto complete tasks
- Daily check-in otomatis
- Monitor status akun

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
  
  const session = userSessions.get(chatId) || { autoMode: false, cookie: null };
  
  switch (action) {
    case 'status':
      await handleStatus(chatId, session);
      break;
    case 'complete_tasks':
      await handleCompleteTasks(chatId, session);
      break;
    case 'daily_checkin':
      await handleDailyCheckin(chatId, session);
      break;
    case 'toggle_auto':
      await handleToggleAuto(chatId, session);
      break;
    case 'set_cookie':
      await handleSetCookie(chatId);
      break;
    case 'help':
      await handleHelp(chatId);
      break;
  }
});

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  
  if (text && text.startsWith('cookie:')) {
    const cookie = text.replace('cookie:', '').trim();
    const session = userSessions.get(chatId) || { autoMode: false, cookie: null };
    session.cookie = cookie;
    userSessions.set(chatId, session);
    
    bot.sendMessage(chatId, '✅ Cookie berhasil disimpan!\n\nSekarang kamu bisa menggunakan semua fitur bot.', mainMenu);
  }
});

async function handleStatus(chatId, session) {
  if (!session.cookie) {
    bot.sendMessage(chatId, '⚠️ Cookie belum diset. Silahkan set cookie terlebih dahulu.', mainMenu);
    return;
  }
  
  try {
    bot.sendMessage(chatId, '🔄 Mengambil data...');
    const yom = new YomAPI(session.cookie);
    const userData = await yom.getSession();
    
    if (userData && userData.user) {
      const statusMsg = `
📊 *Status Akun YOM*

👤 User ID: \`${userData.user.id}\`
💰 Wallet: \`${userData.address}\`
📅 Expires: ${new Date(userData.expires).toLocaleDateString()}

🔄 Auto Mode: ${session.autoMode ? '✅ ON' : '❌ OFF'}
      `;
      bot.sendMessage(chatId, statusMsg, { parse_mode: 'Markdown', ...mainMenu });
    } else {
      bot.sendMessage(chatId, '❌ Gagal mengambil data. Cookie mungkin expired.', mainMenu);
    }
  } catch (error) {
    bot.sendMessage(chatId, '❌ Error: ' + error.message, mainMenu);
  }
}

async function handleCompleteTasks(chatId, session) {
  if (!session.cookie) {
    bot.sendMessage(chatId, '⚠️ Cookie belum diset. Silahkan set cookie terlebih dahulu.', mainMenu);
    return;
  }
  
  try {
    bot.sendMessage(chatId, '🔄 Memproses tasks...');
    const yom = new YomAPI(session.cookie);
    const result = await yom.completeTasks();
    
    bot.sendMessage(chatId, `✅ Task processing complete!\n\n${result}`, mainMenu);
  } catch (error) {
    bot.sendMessage(chatId, '❌ Error: ' + error.message, mainMenu);
  }
}

async function handleDailyCheckin(chatId, session) {
  if (!session.cookie) {
    bot.sendMessage(chatId, '⚠️ Cookie belum diset. Silahkan set cookie terlebih dahulu.', mainMenu);
    return;
  }
  
  try {
    bot.sendMessage(chatId, '🔄 Melakukan daily check-in...');
    const yom = new YomAPI(session.cookie);
    const result = await yom.dailyCheckin();
    
    bot.sendMessage(chatId, `📅 Daily Check-in Result:\n\n${result}`, mainMenu);
  } catch (error) {
    bot.sendMessage(chatId, '❌ Error: ' + error.message, mainMenu);
  }
}

async function handleToggleAuto(chatId, session) {
  session.autoMode = !session.autoMode;
  userSessions.set(chatId, session);
  
  if (session.autoMode) {
    bot.sendMessage(chatId, '✅ Auto Mode diaktifkan!\n\nBot akan otomatis:\n- Daily check-in setiap hari jam 00:05 UTC\n- Complete tasks setiap 6 jam', mainMenu);
  } else {
    bot.sendMessage(chatId, '❌ Auto Mode dinonaktifkan.', mainMenu);
  }
}

async function handleSetCookie(chatId) {
  const msg = `
⚙️ *Set Session Cookie*

Untuk menggunakan bot ini, kamu perlu mengirimkan session cookie dari browser.

*Cara mendapatkan cookie:*
1. Login ke https://quests.yom.net
2. Buka Developer Tools (F12)
3. Pergi ke tab Network
4. Refresh halaman
5. Cari request ke \`/api/auth/session\`
6. Copy nilai dari header Cookie

*Format:*
Kirim pesan dengan format:
\`cookie:PASTE_COOKIE_HERE\`

Contoh:
\`cookie:cf_clearance=xxx; __Secure-next-auth.session-token=xxx\`
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
📊 *Check Status* - Lihat info akun YOM
✅ *Complete Tasks* - Selesaikan semua task
📅 *Daily Check-In* - Daily login untuk reward
🔄 *Auto Mode* - Otomatis complete tasks & check-in
⚙️ *Set Cookie* - Setup session cookie

*Tips:*
- Pastikan cookie selalu fresh (update jika expired)
- Aktifkan Auto Mode untuk kemudahan
- Bot menggunakan cloudscraper untuk bypass Cloudflare

*Support:*
Jika ada masalah, pastikan:
1. Cookie valid dan tidak expired
2. Akun YOM terhubung dengan wallet
  `;
  bot.sendMessage(chatId, helpMsg, { parse_mode: 'Markdown', ...mainMenu });
}

cron.schedule('5 0 * * *', async () => {
  console.log('Running scheduled daily check-in...');
  for (const [chatId, session] of userSessions.entries()) {
    if (session.autoMode && session.cookie) {
      try {
        const yom = new YomAPI(session.cookie);
        const result = await yom.dailyCheckin();
        bot.sendMessage(chatId, `🤖 *Auto Daily Check-in*\n\n${result}`, { parse_mode: 'Markdown' });
      } catch (error) {
        bot.sendMessage(chatId, `❌ Auto check-in failed: ${error.message}`);
      }
    }
  }
});

cron.schedule('0 */6 * * *', async () => {
  console.log('Running scheduled task completion...');
  for (const [chatId, session] of userSessions.entries()) {
    if (session.autoMode && session.cookie) {
      try {
        const yom = new YomAPI(session.cookie);
        const result = await yom.completeTasks();
        bot.sendMessage(chatId, `🤖 *Auto Complete Tasks*\n\n${result}`, { parse_mode: 'Markdown' });
      } catch (error) {
        bot.sendMessage(chatId, `❌ Auto task completion failed: ${error.message}`);
      }
    }
  }
});

console.log('YOM Airdrop Bot is running...');
