# 🍱 辦公室午餐記帳通 (Office Lunch Tab)

這是一個專為辦公室團購午餐設計的輕量級網頁應用程式。解決每天「找零錢」的困擾，採用「記帳制（Tab System）」，支援每週結算、AI 菜單辨識與截止時間自動封盤。

👉 **特色：**免註冊、AI 讀菜單、支援 Netlify Functions 安全轉發、完全 Serverless 架構。

---

## ✨ 功能亮點

### 極簡登入
輸入名字即可加入，支援「快速登入」列表與「記住我」功能。

### 🤖 AI 智慧菜單
管理員拍照上傳菜單，整合 Google Gemini Vision AI 自動辨識品項與價格。

### 記帳模式
不用每天收錢！系統記錄每人欠款，支援「一鍵收款」與「每週結帳」。

### 點餐防呆
支援數量調整、備註，以及「收單截止時間」自動鎖定功能。

---

## 🔐 雙模組架構 (Dual-Mode)

### 🛡️ 安全模式 (Production)
透過 Netlify Functions 轉發 AI 請求，隱藏 API Key。

### 🚀 便利模式 (Localhost)
本地開發時可直接讀取 `.env` 連線，開發除錯更方便。

---

## 🛠️ 技術堆疊

- **Frontend:** React 18, Vite, Tailwind CSS
- **Backend / Hosting:** Netlify (Hosting + Functions)
- **Database:** Firebase Firestore
- **Auth:** Firebase Authentication (Anonymous)
- **AI:** Google Gemini API (gemini-2.0-flash)

---

## 🚀 快速開始（本地開發）

### 1. 下載專案

```bash
git clone https://github.com/your-username/office-lunch.git
cd office-lunch
npm install
```

### 2. 設定環境變數

建立 `.env`：

```env
# --- Firebase 設定 (前端公開資訊) ---
VITE_FIREBASE_API_KEY=AIzaSy...
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...

# --- Gemini AI 設定 ---
# 僅供本地開發使用
VITE_GEMINI_API_KEY=AIzaSy...
```

### 3. 啟動開發伺服器

```bash
npm run dev
```

開啟 <http://localhost:5173> 測試（直連模式）。

---

## ☁️ 部署指南（Netlify）

1. Fork 專案到 GitHub。
2. Netlify → Import an existing project。
3. 選取 repo。
4. Build 設定：

```
Build command: npm run build
Publish directory: dist
```

5. 設定環境變數：

```
VITE_GEMINI_API_KEY = <你的 Gemini Key>
```

（選填）加入所有 `VITE_FIREBASE_...`。

6. Deploy。

部署後自動改用 **安全模式**（Functions 保護 API Key）。

---

## 🔑 服務申請教學

### 1. Firebase

Firestore Rule：

```firestore
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

### 2. Google AI Studio

建立 API Key，可加 HTTP Referrer 限制。

---

## 📂 專案結構

```
office-lunch/
├── netlify/functions/
│   └── analyze-menu.js
├── src/
│   ├── App.jsx
│   ├── main.jsx
│   └── index.css
├── .env
├── netlify.toml
├── package.json
└── vite.config.js
```

---

## 📝 授權

MIT License — 歡迎修改並使用於公司午餐團購。
