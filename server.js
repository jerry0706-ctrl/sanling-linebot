// server.js - 三零科技庫存查詢 LINE Bot
const express = require('express');
const crypto = require('crypto');
const axios = require('axios');
const app = express();

// ===== 設定區 =====
const LINE_CHANNEL_SECRET = process.env.LINE_CHANNEL_SECRET;
const LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// ===== 完整庫存資料 =====
const INVENTORY_TEXT = `
【庫存明細表 115年4月2日】

機種: E-Woo 電動車
  型式: ED5LU1
  BL 藍: 預購車預定4/27交車
  S 銀: 預購車預定4/27交車

機種: Woo 115
  型式: CBS HJ11U3
  S 銀: A區有 B區有 C區有 D區有
  W 白: A區有 B區有 C區有 D區7
  PK 粉紅: A區有 B區有 C區有 D區8
  BR 棕: A區有 B區有 C區有 D區9

機種: Fiddle 115
  型式: CBS FM11W9 (油耗精進版)
  BK 黑: A區2 B區1 C區有 D區無
  SP 消光銀紫: A區有 B區9 C區8 D區1
  W 白: A區有 B區有 C區有 D區4
  S 銀: A區有 B區有 C區9 D區7
  型式: 晶片鎖 FM11WA (油耗精進版) - 預定停產
  BK 消光黑: 預定停產
  W 白: 預定停產

機種: 全新Fiddle 125
  型式: ABS FAE12B1
  BK1 黑: A區2 B區5 C區無 D區2
  W 白: A區有 B區有 C區7 D區3
  型式: CBS FAE12D1
  BK1 黑: A區有 B區9 C區9 D區5
  S 銀: A區有 B區9 C區5 D區6
  SP 消光銀紫: A區有 B區有 C區9 D區3
  W 白: A區有 B區有 C區有 D區5

機種: 活力VIVO125
  型式: CBS FX12T5
  SP1 銀淺紫消光: A區有 B區有 C區有 D區5
  GY1 灰: A區有 B區有 C區有 D區2
  鼓一級油耗 W1 白: A區有 B區有 C區6 D區9
  鼓一級油耗 BL1 藍: A區8 B區9 C區8 D區6
  型式: CBS碟 FX12V7 一級油耗
  SP1 銀淺紫消光: A區有 B區5 C區1 D區2
  GY1 灰: A區5 B區6 C區4 D區1
  碟一級油耗 W1 白: A區9 B區3 C區4 D區無
  碟一級油耗 BL1 藍: D區1

機種: 迪爵125
  型式: CBS鼓 FC12TEZ1 一級油耗 時鐘版
  S 銀: A區6 B區3 D區3
  BL 藍: C區1
  型式: CBS碟 FC12VGZ1 一級油耗 時鐘版
  S 銀: A區3 C區7 D區3
  BL 藍: A區3 C區2 D區4

機種: 全新迪爵125 LED版
  型式: CBS鼓 FU12T3
  BL 消光藍: A區3 B區6 C區7
  S 銀: A區有 B區有 D區1
  GY 消光灰: A區有 B區有 C區有 D區6
  W 白: A區4 B區3 C區2
  型式: CBS碟 FU12V4
  BL 消光藍: A區有 B區有 C區有 D區3
  S 銀: A區有 B區有 C區3 D區4
  GY 消光灰: A區有 B區有 C區有 D區4
  W 白: A區有 B區8 C區2 D區3

機種: KRN 125
  型式: KR12W1
  GYK1 消光灰黑: A區3 B區1 C區1
  WBK1 白黑: A區4 B區2 C區1

機種: 蜂鳥CLBCU 新式樣
  型式: CBS碟 FYA12D3
  BR 消光棕: A區有 B區5 D區3
  P 消光紫: A區7 B區5 C區6 D區2
  PK 消光粉紅: A區有 B區有 C區6 D區2
  S 銀: A區有 B區8 C區3 D區3
  W 消光白: A區有 B區有 C區有 D區2
  型式: CBS碟晶片鎖 FYA12D4
  S 銀: 預購車要等到六月初量產
  W 消光白: 預購車要等到六月初量產

機種: Z1 attila 125
  型式: CBS雙碟 FR12V7 BOSCH噴射
  GY 消光灰: A區7 B區1 C區2
  W 白: B區1
  型式: ABS雙碟 FR12V9
  BK 黑: A區4 B區1 C區1
  W 白: A區2 B區1
  BL 藍: A區3 C區3

機種: JET SR 125
  型式: ABS雙碟 FK12W1
  GYG 消光灰綠: A區4 B區2 C區3
  GYR 消光灰淺棕: A區5 B區4 C區2
  WPK 白粉紅: A區有 B區7 C區2 D區1
  型式: CBS雙碟 FK12W2Z1
  GYG 消光灰綠: A區4 B區2 C區2 D區2
  GYR 消光灰淺棕: A區8 B區1 C區4 D區1
  WPK 白粉紅: A區8 B區3 C區4 D區2

機種: JET SL 125 Super C
  型式: TCS ABS FK12WD
  GBK 消光綠黑: A區有 B區5 C區4 D區2
  PBK 紫黑: A區有 B區8 C區6 D區2
  WBK 消光白黑: A區有 B區有 C區有 D區1
  型式: TCS ABS水冷雙碟 FK12WE-H
  GBK 消光綠黑: A區有 B區5 C區4 D區2
  PBK 紫黑: A區有 B區8 C區6 D區2
  WBK 消光白黑: A區有 B區有 C區有 D區1

機種: JET SL +158 Super C
  型式: TCS ABS FK16WB
  BKK 消光黑: A區有 B區有 C區有 D區5
  GYK 消光灰黑: A區有 B區6 C區有 D區1
  型式: TCS ABS水冷雙碟 FK16WC-H
  BKK 消光黑: A區有 B區有 C區有 D區5
  GYK 消光灰黑: A區有 B區6 C區有 D區1
  WBK 消光白黑: A區有 B區有 C區有 D區8
  WKR 消光白黑紅: A區有 B區有 C區有 D區5

機種: 4-Mica 好米件125
  型式: 碟 AL12W4
  GYD 消光灰金: A區6 B區6 C區9 D區3
  BKK 消光黑: A區有 B區8 C區有 D區4
  WSP 消光白銀: A區4 B區2 C區3 D區2
  BPK 藍粉紅: A區3 B區1 C區3 D區2
  型式: ABS AL12W5
  BKK 消光黑: A區5 B區2 C區5 D區2
  WSP 消光白銀: A區3 B區1 D區1

機種: 4-Mica 好米件150
  型式: 碟 AL15W4
  GYD 消光灰金: A區有 B區有 C區9
  BKK 消光黑: A區有 B區7 C區1 D區5
  WSP 消光白銀: A區4 B區6 C區4 D區1
  BPK 藍粉紅: A區6 B區7
  型式: ABS AL15W5
  BKK 消光黑: A區有 B區有 C區4 D區1
  WSP 消光白銀: A區8 B區6 C區9 D區1

機種: 全新Fiddle DX158
  型式: TCS ABS雙碟 FAE16T1
  BK1 黑: A區有 B區有 C區有
  G 消光深綠: A區有 B區有 C區有 D區2
  S 銀: A區有 B區有 C區8 D區2
  型式: CBS雙碟 FAE16C1
  BK1 黑: A區4 B區4 C區5 D區2
  G 消光深綠: A區有 B區3 C區2 D區2
  S 銀: A區3 B區1 C區2 D區2

機種: DRG BT 龍王158
  型式: TCS ABS TBB16T6-H
  BK 消光黑: A區有 B區7 C區7 D區1
  G 消光綠: A區1 C區1 D區2
  P 紫: A區9 B區9 C區5 D區1
  W 消光白: A區8 B區4 C區4 D區1
  型式: TCS ABS晶片鎖雙碟急速 TBB16T7-H 彎道特仕版
  BK 消光黑: A區有 B區有 C區有 D區4
  G 消光綠: A區6 B區3 C區2 D區1
  P 紫: A區4 B區3 C區2
  W 消光白: A區有 B區有 C區8 D區1

機種: MMBCU 曼巴158
  型式: TCS TDA16T2
  S 消光銀: 少量舊庫存
  型式: ABS TDA16T6-H
  G 消光綠: A區3 B區1 C區3
  型式: TCS TDA16T6-H
  W 消光白: A區有 B區有 C區5
  型式: ABS雙碟 TDA16T6-H
  BK 消光黑: A區有 B區有 C區有 D區1
  G 消光綠: A區有 B區有 C區2 D區1
  S 消光銀: A區1 B區1 C區2

機種: 野狼125
  型式: PA12MB
  BL 藍: A區2
  R 紅: 無庫存

機種: 傳狼125
  型式: PA12MA
  SBK 銀黑: A區1
  GYK 灰黑: A區3 C區1

注意: 庫存低於5台以下，有可能為預購車尚未領牌，請務必以電話洽詢！
`;

const SYSTEM_PROMPT = `你是三零科技機車行的LINE客服AI助手，根據以下庫存明細表回答客戶問題，用繁體中文、友善口氣回覆。

${INVENTORY_TEXT}

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

// ===== Express 設定 =====
app.use(express.json({
  verify: (req, res, buf) => { req.rawBody = buf; }
}));

// 健康檢查
app.get('/', (req, res) => {
  res.send('三零科技庫存查詢 LINE Bot 運行中 ✅');
});

// LINE Webhook
app.post('/webhook', async (req, res) => {
  // 驗證 LINE 簽名
  const signature = req.headers['x-line-signature'];
  const hash = crypto
    .createHmac('SHA256', LINE_CHANNEL_SECRET)
    .update(req.rawBody)
    .digest('base64');

  if (hash !== signature) {
    return res.status(401).send('Unauthorized');
  }

  res.status(200).send('OK'); // 先回應 LINE，避免 timeout

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
    // 呼叫 Claude API
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

    // 回覆 LINE 使用者
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
    // 回覆錯誤訊息給使用者
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
