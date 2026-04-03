// server.js - 一個壹機車行庫存查詢 LINE Bot
const express = require('express');
const crypto = require('crypto');
const axios = require('axios');
const app = express();

// ===== 設定區 =====
const LINE_CHANNEL_SECRET = process.env.LINE_CHANNEL_SECRET;
const LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// ===== 從 GitHub 讀取庫存（每次收到訊息時自動抓最新版本）=====
const INVENTORY_URL = 'https://raw.githubusercontent.com/jerry0706-ctrl/sanling-linebot/main/inventory.txt';

async function getInventory() {
  try {
    const res = await axios.get(INVENTORY_URL + '?t=' + Date.now());
    return res.data;
  } catch (e) {
    console.error('讀取庫存失敗:', e.message);
    return '（庫存資料暫時無法讀取，請來電洽詢門市）';
  }
}

// ===== Express 設定 =====
app.use(express.json({
  verify: (req, res, buf) => { req.rawBody = buf; }
}));

// 健康檢查
app.get('/', (req, res) => {
  res.send('一個壹機車行庫存查詢 LINE Bot 運行中 ✅');
});

// LINE Webhook
app.post('/webhook', async (req, res) => {
  const signature = req.headers['x-line-signature'];
  const hash = crypto
    .createHmac('SHA256', LINE_CHANNEL_SECRET)
    .update(req.rawBody)
    .digest('base64');

  if (hash !== signature) {
    return res.status(401).send('Unauthorized');
  }

  res.status(200).send('OK');

  const events = req.body.events || [];
  for (const event of events) {
    if (event.type === 'message' && event.message.type === 'text') {
      await handleMessage(event);
    }
  }
});

async function handleMessage(event) {
  const userMessage = event.message.text;
  const replyToken = event.replyToken;

  try {
    // 每次都抓最新庫存
    const inventoryText = await getInventory();

    const SYSTEM_PROMPT = `你是一個壹機車行的LINE客服AI助手，根據以下庫存明細表回答客戶問題，用繁體中文、友善口氣回覆。
當客戶打招呼（例如說「你好」、「哈囉」、「hi」等）時，請回覆：「您好！歡迎來到一個壹機車行！我是您的LINE客服助手，可以幫您查詢各種機車的庫存狀況。請問您想了解哪款車的庫存呢？如需進一步確認或有其他問題，歡迎來電洽詢門市！」

【目前庫存資料】
${inventoryText}

回覆規則：
1. 客戶問某車款時，先說有沒有，再說各顏色數量（用各區加總判斷整體庫存狀況）。
2. "有"代表有庫存但確切數字不明，數字代表台數，無或(無)代表缺貨。
3. 若總數低於5台，要提醒「數量極少，建議電話確認是否為預購車」。
4. 若是預購車/停產，要特別說明。
5. 不要把A/B/C/D區分開來報告，直接給客戶最有用的總結。
6. 若客戶問到特定顏色，重點回答那個顏色。
7. 回覆要簡潔，不超過200字。
8. 使用純文字，不使用 Markdown 格式（不要 ** 或 #）。
9. 若問到不在列表的車款，說明目前沒有該車款資料，請來電洽詢。
10. 結尾可加提醒：如需進一步確認請來電洽詢門市。`;

    const claudeRes = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMessage }]
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        }
      }
    );

    const replyText = claudeRes.data.content?.[0]?.text || '抱歉，系統暫時無法回覆，請來電洽詢門市。';

    await axios.post(
      'https://api.line.me/v2/bot/message/reply',
      {
        replyToken,
        messages: [{ type: 'text', text: replyText }]
      },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`
        }
      }
    );

  } catch (err) {
    console.error('Error:', err.response?.data || err.message);
    await axios.post(
      'https://api.line.me/v2/bot/message/reply',
      {
        replyToken,
        messages: [{ type: 'text', text: '抱歉，系統暫時發生問題，請來電洽詢門市，謝謝！' }]
      },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`
        }
      }
    );
  }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
