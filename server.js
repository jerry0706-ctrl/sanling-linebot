// server.js - 一壹車業行庫存查詢 LINE Bot
const express = require('express');
const crypto = require('crypto');
const axios = require('axios');
const app = express();

// ===== 設定區 =====
const LINE_CHANNEL_SECRET = process.env.LINE_CHANNEL_SECRET;
const LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;

// ===== 暫存待確認的庫存辨識結果 =====
const pendingInventory = {};

// ===== Supabase Headers =====
function sbHeaders() {
  return {
    'apikey': SUPABASE_SECRET_KEY,
    'Authorization': `Bearer ${SUPABASE_SECRET_KEY}`,
    'Content-Type': 'application/json'
  };
}

// ===== 讀取庫存 =====
async function getInventory() {
  try {
    const res = await axios.get(
      `${SUPABASE_URL}/rest/v1/inventory?select=content&order=updated_at.desc&limit=1`,
      { headers: sbHeaders() }
    );
    if (res.data && res.data.length > 0) return res.data[0].content;
    return '（庫存資料暫時無法讀取，請來電洽詢門市）';
  } catch (e) {
    console.error('讀取庫存失敗:', e.response?.data || e.message);
    return '（庫存資料暫時無法讀取，請來電洽詢門市）';
  }
}

// ===== 更新庫存 =====
async function updateInventory(content) {
  try {
    await axios.delete(`${SUPABASE_URL}/rest/v1/inventory?id=gt.0`, { headers: sbHeaders() });
    await axios.post(
      `${SUPABASE_URL}/rest/v1/inventory`,
      { content },
      { headers: { ...sbHeaders(), 'Prefer': 'return=minimal' } }
    );
    return true;
  } catch (e) {
    console.error('更新庫存失敗:', e.response?.data || e.message);
    return false;
  }
}

// ===== 用 Claude 辨識圖片 =====
async function recognizeInventoryImage(imageUrl) {
  try {
    const imgRes = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
      headers: { Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}` }
    });
    const base64 = Buffer.from(imgRes.data).toString('base64');
    const contentType = imgRes.headers['content-type'] || 'image/jpeg';

    const res = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4000,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: contentType, data: base64 } },
            { type: 'text', text: `請仔細讀取這張庫存明細表圖片，將所有內容轉換成純文字格式。
格式要求：
- 第一行寫【庫存明細表 日期】
- 每個機種用「機種: 」開頭
- 每個型式用「  型式: 」開頭（縮排2格）
- 每個顏色庫存用「  顏色代碼 顏色名稱: 各區庫存」格式（縮排2格）
- 數字就寫數字，"有"就寫有，空白或"-"就寫無
- 預購車/停產等特殊說明要保留
- 只輸出純文字，不要任何說明或前言` }
          ]
        }]
      },
      { headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' } }
    );
    return res.data.content?.[0]?.text || null;
  } catch (e) {
    console.error('圖片辨識失敗:', e.message);
    return null;
  }
}

// ===== Express 設定 =====
app.use(express.json({ verify: (req, res, buf) => { req.rawBody = buf; } }));

// ===== LIFF 查詢頁面 =====
app.get('/liff', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="zh-TW">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
<title>一壹車業行 庫存查詢</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Noto Sans TC', sans-serif; background: #c5e8b0; min-height: 100vh; display: flex; flex-direction: column; }
  .header { background: #06C755; padding: 16px; text-align: center; color: white; font-size: 18px; font-weight: bold; }
  .chat { flex: 1; padding: 16px; overflow-y: auto; display: flex; flex-direction: column; gap: 12px; padding-bottom: 80px; }
  .msg-ai { display: flex; gap: 8px; align-items: flex-end; }
  .msg-user { display: flex; gap: 8px; align-items: flex-end; flex-direction: row-reverse; }
  .avatar { width: 36px; height: 36px; border-radius: 50%; background: white; display: flex; align-items: center; justify-content: center; font-size: 20px; flex-shrink: 0; }
  .bubble-ai { background: white; padding: 10px 14px; border-radius: 18px; border-top-left-radius: 4px; max-width: 75%; font-size: 14px; line-height: 1.6; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
  .bubble-user { background: #06C755; color: white; padding: 10px 14px; border-radius: 18px; border-bottom-right-radius: 4px; max-width: 75%; font-size: 14px; line-height: 1.6; }
  .input-area { background: #f5f5f5; border-top: 1px solid #ddd; padding: 10px; display: flex; gap: 8px; position: fixed; bottom: 0; left: 0; right: 0; }
  .input-area input { flex: 1; border: 1px solid #ddd; border-radius: 20px; padding: 10px 16px; font-size: 14px; outline: none; }
  .input-area input:focus { border-color: #06C755; }
  .send-btn { width: 40px; height: 40px; background: #06C755; border: none; border-radius: 50%; color: white; font-size: 18px; cursor: pointer; flex-shrink: 0; }
  .typing { display: flex; gap: 4px; padding: 4px 0; }
  .typing span { width: 7px; height: 7px; background: #aaa; border-radius: 50%; animation: bounce 1.2s infinite; }
  .typing span:nth-child(2) { animation-delay: 0.2s; }
  .typing span:nth-child(3) { animation-delay: 0.4s; }
  @keyframes bounce { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-5px)} }
</style>
</head>
<body>
<div class="header">🏍️ 一壹車業行 庫存查詢</div>
<div class="chat" id="chat">
  <div class="msg-ai">
    <div class="avatar">🏍️</div>
    <div class="bubble-ai">您好！歡迎來到一壹車業行！<br>請問您想查詢哪款機車的庫存？<br><br>例如：「Woo 115 有嗎？」<br>「迪爵 125 白色還有嗎？」</div>
  </div>
</div>
<div class="input-area">
  <input id="inp" type="text" placeholder="輸入想查詢的車款…" onkeydown="if(event.key==='Enter')send()">
  <button class="send-btn" onclick="send()">➤</button>
</div>
<script>
let loading = false;
async function send() {
  if (loading) return;
  const inp = document.getElementById('inp');
  const msg = inp.value.trim();
  if (!msg) return;
  inp.value = '';
  appendMsg('user', msg);
  const tid = appendTyping();
  loading = true;
  try {
    const res = await fetch('/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: msg })
    });
    const data = await res.json();
    removeTyping(tid);
    appendMsg('ai', data.reply || '抱歉，系統暫時無法回覆，請來電洽詢。');
  } catch(e) {
    removeTyping(tid);
    appendMsg('ai', '抱歉，連線發生問題，請來電洽詢門市。');
  }
  loading = false;
}
function appendMsg(role, text) {
  const chat = document.getElementById('chat');
  const div = document.createElement('div');
  div.className = role === 'ai' ? 'msg-ai' : 'msg-user';
  if (role === 'ai') {
    div.innerHTML = '<div class="avatar">🏍️</div><div class="bubble-ai">' + text.replace(/\\n/g,'<br>') + '</div>';
  } else {
    div.innerHTML = '<div class="bubble-user">' + text + '</div><div class="avatar">👤</div>';
  }
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
}
function appendTyping() {
  const id = 'typing-' + Date.now();
  const chat = document.getElementById('chat');
  const div = document.createElement('div');
  div.className = 'msg-ai'; div.id = id;
  div.innerHTML = '<div class="avatar">🏍️</div><div class="bubble-ai"><div class="typing"><span></span><span></span><span></span></div></div>';
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
  return id;
}
function removeTyping(id) { const el = document.getElementById(id); if (el) el.remove(); }
</script>
</body>
</html>`);
});

// ===== LIFF 查詢 API =====
app.post('/ask', async (req, res) => {
  const { message } = req.body;
  if (!message) return res.json({ reply: '請輸入查詢內容' });
  try {
    const inventoryText = await getInventory();
    const SYSTEM_PROMPT = `你是一壹車業行的客服AI助手，根據以下庫存明細表回答客戶問題，用繁體中文、友善口氣回覆。

【目前庫存資料】
${inventoryText}

回覆規則：
1. 客戶問某車款時，先說有沒有，再說各顏色數量。
2. "有"代表有庫存但確切數字不明，數字代表台數，無代表缺貨。
3. 若總數低於5台，要提醒「數量極少，建議電話確認是否為預購車」。
4. 若是預購車/停產，要特別說明。
5. 不要把A/B/C/D區分開來報告。
6. 若客戶問到特定顏色，重點回答那個顏色。
7. 回覆簡潔，不超過200字，不用Markdown格式。
8. 若問到不在列表的車款，說明目前沒有該車款資料，請來電洽詢。`;

    const claudeRes = await axios.post(
      'https://api.anthropic.com/v1/messages',
      { model: 'claude-sonnet-4-20250514', max_tokens: 500, system: SYSTEM_PROMPT, messages: [{ role: 'user', content: message }] },
      { headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' } }
    );
    res.json({ reply: claudeRes.data.content?.[0]?.text || '抱歉，系統暫時無法回覆。' });
  } catch (e) {
    console.error(e.message);
    res.json({ reply: '抱歉，系統暫時發生問題，請來電洽詢門市。' });
  }
});

// ===== 健康檢查 =====
app.get('/', (req, res) => { res.send('一壹車業行庫存查詢 LINE Bot 運行中 ✅'); });

// ===== LINE Webhook =====
app.post('/webhook', async (req, res) => {
  const signature = req.headers['x-line-signature'];
  const hash = crypto.createHmac('SHA256', LINE_CHANNEL_SECRET).update(req.rawBody).digest('base64');
  if (hash !== signature) return res.status(401).send('Unauthorized');
  res.status(200).send('OK');
  const events = req.body.events || [];
  for (const event of events) {
    if (event.type === 'message') {
      if (event.message.type === 'text') await handleTextMessage(event);
      else if (event.message.type === 'image') await handleImageMessage(event);
    }
  }
});

// ===== 處理文字訊息 =====
async function handleTextMessage(event) {
  const userMessage = event.message.text;
  const replyToken = event.replyToken;
  const userId = event.source.userId;

  if (userMessage === '✅確認更新' && pendingInventory[userId]) {
    const content = pendingInventory[userId];
    delete pendingInventory[userId];
    const ok = await updateInventory(content);
    await replyMessage(replyToken, ok ? '✅ 庫存已成功更新！客人查詢將使用最新資料。' : '❌ 更新失敗，請重新傳圖。');
    return;
  }

  if (userMessage === '❌取消更新' && pendingInventory[userId]) {
    delete pendingInventory[userId];
    await replyMessage(replyToken, '已取消，庫存維持不變。');
    return;
  }

  try {
    const inventoryText = await getInventory();
    const SYSTEM_PROMPT = `你是一壹車業行的LINE客服AI助手，根據以下庫存明細表回答客戶問題，用繁體中文、友善口氣回覆。
當客戶打招呼時，請回覆：「您好！歡迎來到一壹車業行！我是您的LINE客服助手，可以幫您查詢各種機車的庫存狀況。請問您想了解哪款車的庫存呢？」

【目前庫存資料】
${inventoryText}

回覆規則：
1. 客戶問某車款時，先說有沒有，再說各顏色數量。
2. "有"代表有庫存但確切數字不明，數字代表台數，無代表缺貨。
3. 若總數低於5台，要提醒「數量極少，建議電話確認是否為預購車」。
4. 若是預購車/停產，要特別說明。
5. 不要把A/B/C/D區分開來報告。
6. 若客戶問到特定顏色，重點回答那個顏色。
7. 回覆簡潔，不超過200字，不用Markdown格式。
8. 若問到不在列表的車款，說明目前沒有該車款資料，請來電洽詢。
9. 結尾可加提醒：如需進一步確認請來電洽詢門市。`;

    const claudeRes = await axios.post(
      'https://api.anthropic.com/v1/messages',
      { model: 'claude-sonnet-4-20250514', max_tokens: 1000, system: SYSTEM_PROMPT, messages: [{ role: 'user', content: userMessage }] },
      { headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' } }
    );
    await replyMessage(replyToken, claudeRes.data.content?.[0]?.text || '抱歉，系統暫時無法回覆，請來電洽詢門市。');
  } catch (err) {
    console.error('Error:', err.message);
    await replyMessage(replyToken, '抱歉，系統暫時發生問題，請來電洽詢門市，謝謝！');
  }
}

// ===== 處理圖片訊息 =====
async function handleImageMessage(event) {
  const replyToken = event.replyToken;
  const userId = event.source.userId;
  const imageId = event.message.id;

  await replyMessage(replyToken, '📸 收到圖片！正在辨識庫存資料，請稍候...');

  try {
    const imageUrl = `https://api-data.line.me/v2/bot/message/${imageId}/content`;
    const recognized = await recognizeInventoryImage(imageUrl);
    if (!recognized) {
      await pushMessage(userId, '❌ 圖片辨識失敗，請重新傳送清晰的庫存表圖片。');
      return;
    }
    pendingInventory[userId] = recognized;
    const preview = recognized.length > 500 ? recognized.substring(0, 500) + '\n...(以下省略)' : recognized;
    await pushMessage(userId, `📋 辨識結果預覽：\n\n${preview}\n\n請確認內容是否正確：\n回覆「✅確認更新」→ 更新庫存\n回覆「❌取消更新」→ 取消`);
  } catch (err) {
    console.error('圖片處理失敗:', err.message);
    await pushMessage(userId, '❌ 處理失敗，請重新傳送圖片。');
  }
}

// ===== LINE 訊息函式 =====
async function replyMessage(replyToken, text) {
  await axios.post('https://api.line.me/v2/bot/message/reply',
    { replyToken, messages: [{ type: 'text', text }] },
    { headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}` } }
  );
}

async function pushMessage(userId, text) {
  await axios.post('https://api.line.me/v2/bot/message/push',
    { to: userId, messages: [{ type: 'text', text }] },
    { headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}` } }
  );
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => { console.log(`Server running on port ${PORT}`); });
