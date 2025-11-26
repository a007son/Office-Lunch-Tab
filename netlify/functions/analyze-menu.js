/**
 * Serverless Function: Menu Analysis
 * * 負責接收前端上傳的 Base64 圖片，呼叫 Google Gemini API 進行分析，
 * 並將結果整理為 JSON 格式回傳。
 * * 環境變數需求 (在 Netlify 後台設定):
 * - GEMINI_API_KEY
 */

exports.handler = async function(event, context) {
  // 1. 只允許 POST 方法
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: "Method Not Allowed" }),
    };
  }

  try {
    // 2. 解析請求內容
    const body = JSON.parse(event.body);
    const base64Image = body.image;

    if (!base64Image) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "No image provided" }),
      };
    }

    // 3. 取得 API Key
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error("Server Error: GEMINI_API_KEY is missing.");
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "Server configuration error" }),
      };
    }

    // 4. 呼叫 Google Gemini API
    // 這裡使用 fetch 直接呼叫 REST API，避免引入額外的肥大 SDK
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: "Analyze this menu image. 1. Extract the Restaurant Name, Phone Number, and Address. 2. Extract all food items and their prices. Return a JSON object with this exact structure: { \"restaurant\": { \"name\": \"string\", \"phone\": \"string\", \"address\": \"string\" }, \"items\": [{ \"name\": \"string\", \"price\": 123 }] }. If address or phone is missing, use empty string. Do not use markdown code blocks. Just pure JSON string." },
              { inlineData: { mimeType: "image/jpeg", data: base64Image } }
            ]
          }]
        })
      }
    );

    const data = await response.json();

    if (data.error) {
      throw new Error(data.error.message);
    }

    // 5. 解析 Gemini 回傳的資料
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      throw new Error("No text content in AI response");
    }

    // 清理可能存在的 Markdown 標記 (```json ... ```)
    const jsonStr = text.replace(/```json|```/g, '').trim();
    const parsedResult = JSON.parse(jsonStr);

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(parsedResult),
    };

  } catch (error) {
    console.error("AI Analysis Failed:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message || "Internal Server Error" }),
    };
  }
};