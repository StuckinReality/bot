import { WOLF } from 'wolf.js';
import Groq from 'groq-sdk';
import express from 'express'; // إدخال مكتبة السيرفر

// استدعاء البيانات بأمان عبر البيئة المحيطة بالسيرفر (Environment Variables)
const EMAIL = process.env.BOT_EMAIL;
const PASSWORD = process.env.BOT_PASSWORD;
const GROQ_API_KEY = process.env.GROQ_API_KEY;

// --- تشغيل سيرفر ويب وهمي خفيف لإبقاء البوت صاحياً ---
const app = express();
app.get('/', (req, res) => res.send('Bot نول Is Online & Live! 🚀'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`[WEB SERVER] Listening on port ${PORT}`));
// --------------------------------------------------

const groq = new Groq({ apiKey: GROQ_API_KEY });

// غرف الإعلانات
const PRIVATE_AD_ROOMS = [17159115, 81617952, 28659, 18662117, 16943791, 179743, 189677, 18862485, 19295707, 82028935, 10461987, 9129836, 10612371, 11582949, 3542632, 17062339, 81664900, 82012338, 71171, 81666093, 1708234, 81828862, 4624289, 27, 18787787, 81881043, 17768381, 81790744, 19362683, 81991349, 19248791, 18070433, 18877451, 11049782, 696, 19087459, 17971190, 81830393, 14173717, 1943554, 5151, 81901234];

// غرف الشات
const CHAT_TARGET_ROOMS = [19022874, 82030343];

// 🚫 قائمة الحسابات المطلوب تجاهلها
const IGNORED_USERS = [
  22634890, 84520027, 45578849, 80277459, 22634829, 10324473, 39369782, 
  15145815, 32060007, 78943360, 10304399, 27549723, 39041609, 24957563, 
  82641759, 23647146, 26494626, 26491704, 18290953, 30973870, 42244679, 
  76305584, 11118233, 10876886, 84135130
];

const ALL_ROOMS = [...new Set([...PRIVATE_AD_ROOMS, ...CHAT_TARGET_ROOMS])];
const contactedMembers = new Set();
let currentBotId = null;
let isBotFullyReady = false; 

const messageQueue = [];
let isProcessingQueue = false;

const client = new WOLF({
  connection: {
    host: 'full-client.prod.palringo.com',
    port: 443,
    ssl: true
  }
});

async function processQueue() {
  if (isProcessingQueue || messageQueue.length === 0 || !isBotFullyReady) return;
  isProcessingQueue = true;

  while (messageQueue.length > 0) {
    const targetId = messageQueue.shift();
    try {
      await client.messaging.sendPrivateMessage(targetId, 'ادخل [المطرقة]');
      console.log(`[QUEUE SUCCESS] Sent to ${targetId}. Left in queue: ${messageQueue.length}`);
    } catch (e) {
      console.error(`[QUEUE ERROR] Failed for ${targetId}:`, e.message);
    }
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
  isProcessingQueue = false;
}

async function generateAIResponse(userPrompt) {
  try {
    const systemInstruction = 'أنت بوت دردشة مساعد وذكي ومحترم اسمه نول. رُد باللهجة السعودية العامية بشكل طبيعي ومباشر ومختصر جداً بدون مقدمات.';
    const chatCompletion = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: systemInstruction },
        { role: 'user', content: userPrompt }
      ],
      model: 'llama-3.1-8b-instant',
      temperature: 0.7,
      max_tokens: 100
    });
    return chatCompletion.choices[0]?.message?.content?.trim() || null;
  } catch (error) {
    console.error('[GROQ ERROR]:', error.message);
    return null;
  }
}

client.on('ready', async () => {
  console.log(`[READY] Logged in successfully. Waiting 12 seconds for socket stabilization...`);
  currentBotId = client.currentSubscriber ? Number(client.currentSubscriber.id) : null;

  setTimeout(async () => {
    console.log(`[STABLE] Connection ready. Checking and joining rooms...`);
    let currentJoinedRooms = [];
    try {
      const currentChannels = await client.channel.list();
      currentJoinedRooms = currentChannels.map(c => Number(c.id));
      console.log(`[INFO] Bot is already in ${currentJoinedRooms.length} rooms.`);
    } catch (e) {
      console.log(`[WARN] Could not fetch current room list, proceeding anyway.`);
    }

    for (const roomId of ALL_ROOMS) {
      if (currentJoinedRooms.includes(roomId)) {
        console.log(`[ALREADY IN] Room: ${roomId} (Skipped join request)`);
        continue;
      }
      try {
        await client.channel.join(roomId);
        console.log(`[JOINED] Room: ${roomId}`);
      } catch (err) {
        console.log(`[ROOM STATE] Room ${roomId} bypass or already active.`);
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    isBotFullyReady = true;
    console.log(`[SYSTEM LIVE] All systems operational. Monitoring messages and queue active!`);
    processQueue();
  }, 12000); 
});

client.on('channelMessage', async (message) => {
  try {
    const senderId = Number(message.sourceSubscriberId || message.subscriberId || message.originator?.id || message.sender?.id || message.sourceUserId);
    const channelId = Number(message.targetChannelId || message.targetGroupId || message.channel?.id || message.targetId);

    if (!channelId || !senderId) return;
    if (currentBotId && senderId === currentBotId) return;
    if (IGNORED_USERS.includes(senderId)) return;

    const text = message.body?.trim();
    if (!text) return;

    if (PRIVATE_AD_ROOMS.includes(channelId)) {
      if (!contactedMembers.has(senderId)) {
        contactedMembers.add(senderId); 
        messageQueue.push(senderId);
        if (isBotFullyReady) {
          processQueue();
        }
      }
      return;
    }

    if (CHAT_TARGET_ROOMS.includes(channelId)) {
      const triggerWords = ['نول', 'يا نول', 'بوت', 'البوت'];
      const isCalled = triggerWords.some(word => text.toLowerCase().includes(word));
      if (!isCalled) return;

      let cleanPrompt = text;
      triggerWords.forEach(word => {
        cleanPrompt = cleanPrompt.replace(new RegExp(word, 'gi'), '');
      });
      cleanPrompt = cleanPrompt.trim();

      if (!cleanPrompt) {
        await client.messaging.sendChannelMessage(channelId, 'لبيه؟ قولي وش سؤالك؟ 🤔');
        return;
      }

      const aiReply = await generateAIResponse(cleanPrompt);
      if (aiReply) {
        await client.messaging.sendChannelMessage(channelId, aiReply);
      }
    }
  } catch (err) {
    console.error('[ERROR]:', err.message);
  }
});

console.log('[LOGIN] Logging into WOLF...');
client.login(EMAIL, PASSWORD).catch((err) => {
  console.error('[FATAL] Login failed', err.message);
});