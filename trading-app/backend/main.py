from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from smartapi import SmartConnect
import pyotp
import pandas as pd
from datetime import datetime, timedelta
import uvicorn

app = FastAPI()

# ─── Allow frontend to connect ──────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── YOUR ANGEL ONE CREDENTIALS ─────────────────────────────────────
# Replace these with your actual credentials
CLIENT_ID   = "YOUR_CLIENT_ID"       # e.g. "A12345678"
PASSWORD    = "YOUR_PASSWORD"         # your Angel One login password
TOTP_KEY    = "YOUR_TOTP_SECRET_KEY"  # the key shown when setting up TOTP (not the 6-digit code)

# ─── Symbol tokens for Angel One API ────────────────────────────────
SYMBOL_CONFIG = {
    "NIFTY": {
        "token": "99926000",
        "exchange": "NSE",
        "symbol": "Nifty 50",
    },
    "SENSEX": {
        "token": "99919000",
        "exchange": "BSE",
        "symbol": "SENSEX",
    },
}

# ─── Timeframe mapping ───────────────────────────────────────────────
TIMEFRAME_MAP = {
    "1min":  "ONE_MINUTE",
    "5min":  "FIVE_MINUTE",
    "15min": "FIFTEEN_MINUTE",
}

# ─── Login to Angel One ──────────────────────────────────────────────
def get_angel_session():
    try:
        obj = SmartConnect(api_key=CLIENT_ID)
        totp = pyotp.TOTP(TOTP_KEY).now()
        data = obj.generateSession(CLIENT_ID, PASSWORD, totp)
        if data["status"] == False:
            raise Exception("Login failed: " + str(data))
        return obj
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Angel One login failed: {str(e)}")

# ─── Routes ──────────────────────────────────────────────────────────
@app.get("/")
def root():
    return {"status": "NiftySignal backend running ✅"}


@app.get("/chart-data/{symbol}/{timeframe}")
def get_chart_data(symbol: str, timeframe: str):
    symbol = symbol.upper()
    timeframe = timeframe.lower()

    if symbol not in SYMBOL_CONFIG:
        raise HTTPException(status_code=400, detail=f"Unknown symbol: {symbol}. Use NIFTY or SENSEX.")

    if timeframe not in TIMEFRAME_MAP:
        raise HTTPException(status_code=400, detail=f"Unknown timeframe: {timeframe}. Use 1min, 5min, or 15min.")

    config = SYMBOL_CONFIG[symbol]
    interval = TIMEFRAME_MAP[timeframe]

    # Date range — last 5 trading days
    to_date   = datetime.now()
    from_date = to_date - timedelta(days=5)

    from_str = from_date.strftime("%Y-%m-%d %H:%M")
    to_str   = to_date.strftime("%Y-%m-%d %H:%M")

    try:
        obj = get_angel_session()

        params = {
            "exchange":    config["exchange"],
            "symboltoken": config["token"],
            "interval":    interval,
            "fromdate":    from_str,
            "todate":      to_str,
        }

        response = obj.getCandleData(params)

        if not response or response.get("status") == False:
            raise HTTPException(status_code=500, detail="Failed to fetch candle data from Angel One")

        candles = response.get("data", [])

        if not candles:
            raise HTTPException(status_code=404, detail="No candle data returned")

        # Return as array: [datetime, open, high, low, close]
        result = []
        for candle in candles:
            result.append([
                candle[0],   # datetime string
                candle[1],   # open
                candle[2],   # high
                candle[3],   # low
                candle[4],   # close
            ])

        return result

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ─── Run server ──────────────────────────────────────────────────────
if __name__ == "__main__":
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
