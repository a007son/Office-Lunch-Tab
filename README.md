🍱 辦公室午餐記帳通 (Office Lunch Tab)

這是一個專為辦公室團購午餐設計的輕量級網頁應用程式。解決每天「找零錢」的困擾，採用「記帳制（Tab System）」，支援每週結算、AI 菜單辨識與截止時間自動封盤。

👉 特色：免註冊、AI 讀菜單、支援 Netlify Functions 安全轉發、完全 Serverless 架構。

✨ 功能亮點

極簡登入：輸入名字即可加入，採用 Firebase 匿名驗證。

🤖 AI 智慧菜單：管理員拍照上傳菜單，整合 Google Gemini Vision AI 自動辨識品項與價格。

記帳模式：不用每天收錢！系統記錄每人欠款，支援「一鍵收款」與「每週結帳」。

點餐防呆：支援數量調整、備註、以及「收單截止時間」自動鎖定功能。

雙模組架構：

🛡️ 安全模式 (Production)：透過 Netlify Functions 轉發 AI 請求，隱藏 API Key。

🚀 便利模式 (Localhost)：本地開發時可直接讀取 .env 連線，開發除錯更方便。

🛠️ 技術堆疊

Frontend: React 18, Vite, Tailwind CSS

Backend / Hosting: Netlify (Hosting + Functions)

Database: Firebase Firestore

Auth: Firebase Authentication (Anonymous)

AI: Google Gemini API (gemini-2.0-flash)

🚀 快速開始 (本地開發)

1. 下載專案

git clone [https://github.com/your-username/office-lunch.git](https://github.com/your-username/office-lunch.git)
cd office-lunch
npm install


2. 設定環境變數

請在專案根目錄複製一份 .env.example 並重新命名為 .env（若無範例檔，請直接建立 .env）：

# --- Firebase 設定 (前端公開資訊) ---
VITE_FIREBASE_API_KEY=AIzaSy...
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...

# --- Gemini AI 設定 ---
# 注意：此變數僅供「本地開發」使用，部署到 Netlify 時請勿在 .env 設定此值
# 正式環境請在 Netlify 後台設定環境變數
VITE_GEMINI_API_KEY=AIzaSy...


3. 啟動開發伺服器

npm run dev


現在你可以開啟 http://localhost:5173 進行測試。

☁️ 部署指南 (Netlify)

本專案設計為與 Netlify 完美整合。

Fork 此專案 到你的 GitHub。

登入 Netlify 並點擊 "Add new site" -> "Import an existing project"。

選擇 GitHub 並授權，選取你的 office-lunch 倉庫。

Build Settings 維持預設：

Build command: npm run build

Publish directory: dist

⚠️ 關鍵步驟：設定環境變數 (Environment Variables)
在 Netlify 的 "Site configuration" -> "Environment variables" 中，新增以下變數：

VITE_GEMINI_API_KEY: 填入你的 Gemini API Key。

(選填) 所有的 VITE_FIREBASE_... 變數（若你不希望寫死在 App.jsx 中）。

點擊 Deploy。

關於安全性：透過 Netlify 部署後，系統會自動優先呼叫 netlify/functions/analyze-menu.js。這樣 API Key 只會存在於 Netlify 的伺服器端，不會暴露給終端使用者。

🔑 服務申請教學

1. Firebase (資料庫)

前往 Firebase Console 建立新專案。

Authentication: 啟用 "Anonymous" (匿名) 登入。

Firestore Database: 建立資料庫，並在 "Rules" 分頁將規則修改為：

rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}


Project Settings: 複製 Web App 的 firebaseConfig 資訊。

2. Google AI Studio (AI 辨識)

前往 Google AI Studio。

建立一把新的 API Key。

(建議) 在 Google Cloud Console 限制此 Key 的 HTTP Referrer 網域。

📂 專案結構

office-lunch/
├── netlify/functions/   # 後端：Serverless Functions (保護 API Key)
│   └── analyze-menu.js
├── src/
│   ├── App.jsx          # 前端：核心邏輯與 UI
│   └── main.jsx         # 前端：入口點
├── .env                 # 本地環境變數 (請勿上傳 GitHub)
├── netlify.toml         # Netlify 設定檔
└── ...


📝 授權

MIT License. 歡迎自由修改並應用於你的公司午餐團購！
