# NiftySignal PRO — Setup Guide

## What's included
- React web app with TradingView-style chart
- EMA 9 / EMA 21 crossover detection with BUY/SELL markers
- Live signal history panel
- Toast notifications + browser push alerts
- Nifty & Sensex tabs with 1m / 5m / 15m timeframes

---

## 1. Install & Run Locally

```bash
cd trading-app
npm install
npm start
```
App opens at http://localhost:3000
Make sure your Angel One backend is running at http://127.0.0.1:8000

---

## 2. Backend API Expected Format

Your backend must return this format from:
GET http://127.0.0.1:8000/chart-data/{symbol}/{timeframe}

Example: /chart-data/NIFTY/5min

Response (array of arrays):
```json
[
  ["2024-01-15T09:15:00", 21800.0, 21850.0, 21780.0, 21830.0],
  ["2024-01-15T09:20:00", 21830.0, 21900.0, 21820.0, 21880.0]
]
```
Format: [datetime, open, high, low, close]

---

## 3. Deploy to Your Domain

```bash
npm run build
```
This creates a /build folder. Upload everything inside /build to your domain's public_html folder via FTP or cPanel.

That's it — your site will be live!

---

## 4. Make the Android APK (for family)

### Step 1 — Install Capacitor
```bash
npm install @capacitor/core @capacitor/cli @capacitor/android
npx cap init "NiftySignal" "com.yourname.niftysignal"
```

### Step 2 — Build the web app
```bash
npm run build
```

### Step 3 — Add Android platform
```bash
npx cap add android
npx cap copy android
npx cap sync android
```

### Step 4 — Build the APK
```bash
npx cap open android
```
This opens Android Studio. Then:
- Click Build → Build Bundle(s) / APK(s) → Build APK(s)
- APK will be at: android/app/build/outputs/apk/debug/app-debug.apk

Share this APK file with your family via WhatsApp/email.

### Note for APK: Update API URL
Before building APK, change the API URL in ChartComponent.jsx from:
  http://127.0.0.1:8000/...
to your live domain:
  https://yourdomain.com/api/...

---

## 5. Folder Structure

```
trading-app/
├── public/
│   └── index.html
├── src/
│   ├── components/
│   │   ├── ChartComponent.jsx   ← chart + EMA + signals
│   │   └── SignalPanel.jsx      ← signal history list
│   ├── App.js                   ← main dashboard layout
│   └── index.js                 ← entry point
├── package.json
└── README.md
```

---

## 6. Customization

| What to change | Where |
|---|---|
| EMA periods (9/21) | ChartComponent.jsx → calculateEMA calls |
| Timeframes | App.js → TIMEFRAMES array |
| API URL | ChartComponent.jsx → fetch() call |
| Colors | App.js → styles object |
| Auto-refresh interval | ChartComponent.jsx → setInterval(fetchData, 3000) |

---

## Need help?
- Backend not connecting? Check CORS is enabled on your FastAPI/Flask backend
- Chart not loading? Open browser console (F12) and check for errors
- APK not connecting? Make sure API URL is your live domain, not localhost
