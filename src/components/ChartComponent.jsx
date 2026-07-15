import React, { useEffect, useRef, useCallback, useState } from "react";
import { createChart } from "lightweight-charts";

const API_URL       = "https://niftysignal-backend.onrender.com";
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const ADX_THRESHOLD = 20;

const toChartTime = (isoString) => {
  const utcMs = new Date(isoString).getTime();
  return Math.floor((utcMs + IST_OFFSET_MS) / 1000);
};

const calculateEMA = (data, period) => {
  if (!data || data.length < period) return [];
  const multiplier = 2 / (period + 1);
  let ema = data.slice(0, period).reduce((s, d) => s + d.close, 0) / period;
  const result = [];
  data.forEach((candle, i) => {
    if (i < period - 1) return;
    if (i === period - 1) { result.push({ time: candle.time, value: parseFloat(ema.toFixed(2)) }); return; }
    ema = (candle.close - ema) * multiplier + ema;
    result.push({ time: candle.time, value: parseFloat(ema.toFixed(2)) });
  });
  return result;
};

const calculateATR = (data, period = 14) => {
  const n = data.length;
  const atr = new Array(n).fill(null);
  if (n < period + 1) return atr;
  const tr = new Array(n).fill(null);
  for (let i = 1; i < n; i++) {
    const high = data[i].high, low = data[i].low, prevClose = data[i-1].close;
    tr[i] = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
  }
  let sum = 0;
  for (let i = 1; i <= period; i++) sum += tr[i];
  atr[period] = sum / period;
  for (let i = period + 1; i < n; i++) atr[i] = (atr[i-1] * (period - 1) + tr[i]) / period;
  return atr;
};

const calculateADX_DI = (data, period = 14) => {
  const n = data.length;
  const adx = new Array(n).fill(null);
  const plusDI = new Array(n).fill(null);
  const minusDI = new Array(n).fill(null);
  if (n < period * 2) return { adx, plusDI, minusDI };
  const pdm = new Array(n).fill(0), mdm = new Array(n).fill(0), tr = new Array(n).fill(0);
  for (let i = 1; i < n; i++) {
    const high = data[i].high, low = data[i].low;
    const ph = data[i-1].high, pl = data[i-1].low, pc = data[i-1].close;
    const up = high - ph, down = pl - low;
    pdm[i] = (up > down && up > 0) ? up : 0;
    mdm[i] = (down > up && down > 0) ? down : 0;
    tr[i] = Math.max(high - low, Math.abs(high - pc), Math.abs(low - pc));
  }
  const smTR = new Array(n).fill(null), smP = new Array(n).fill(null), smM = new Array(n).fill(null);
  let sTR = 0, sP = 0, sM = 0;
  for (let i = 1; i <= period; i++) { sTR += tr[i]; sP += pdm[i]; sM += mdm[i]; }
  smTR[period] = sTR; smP[period] = sP; smM[period] = sM;
  for (let i = period + 1; i < n; i++) {
    smTR[i] = smTR[i-1] - smTR[i-1]/period + tr[i];
    smP[i]  = smP[i-1]  - smP[i-1]/period  + pdm[i];
    smM[i]  = smM[i-1]  - smM[i-1]/period  + mdm[i];
  }
  const dx = new Array(n).fill(null);
  for (let i = period; i < n; i++) {
    if (!smTR[i]) continue;
    const pdi = 100 * smP[i] / smTR[i], mdi = 100 * smM[i] / smTR[i];
    plusDI[i] = pdi; minusDI[i] = mdi;
    if ((pdi + mdi) === 0) continue;
    dx[i] = 100 * Math.abs(pdi - mdi) / (pdi + mdi);
  }
  let dxSum = 0, dxCount = 0;
  for (let i = period; i < period * 2; i++) { if (dx[i] != null) { dxSum += dx[i]; dxCount++; } }
  if (dxCount < period) return { adx, plusDI, minusDI };
  adx[period*2 - 1] = dxSum / period;
  for (let i = period * 2; i < n; i++) {
    if (dx[i] == null) continue;
    adx[i] = (adx[i-1] * (period - 1) + dx[i]) / period;
  }
  return { adx, plusDI, minusDI };
};

const calculateVWAP = (data) => {
  const n = data.length;
  const vwap = new Array(n).fill(null);
  let cumPV = 0, cumVol = 0, currentDay = null;
  for (let i = 0; i < n; i++) {
    const day = new Date(data[i].time * 1000).toISOString().slice(0, 10);
    if (day !== currentDay) { currentDay = day; cumPV = 0; cumVol = 0; }
    const tp = (data[i].high + data[i].low + data[i].close) / 3;
    const vol = data[i].volume || 0;
    cumPV += tp * vol; cumVol += vol;
    vwap[i] = cumVol > 0 ? cumPV / cumVol : data[i].close;
  }
  return vwap;
};

// Mirrors the backend's strength heuristic so chart markers and Telegram
// alerts always agree — NOT a probability guarantee, just a rough
// confidence tier combining trend strength with how decisively one side
// (+DI vs -DI) is leading.
const getSignalStrength = (adxVal, plusDI, minusDI) => {
  const spread = Math.abs(plusDI - minusDI);
  if (adxVal >= 35 && spread >= 15) return "STRONG";
  if (adxVal >= 25 && spread >= 8) return "MODERATE";
  return "WEAK";
};

const detectCrossovers = (formatted, ema9, ema26, atr, adxDI, vwap) => {
  const { adx, plusDI, minusDI } = adxDI;
  const signals = [];
  const map26 = {};
  ema26.forEach((d) => (map26[d.time] = d.value));
  for (let i = 1; i < ema9.length; i++) {
    const c9 = ema9[i].value, p9 = ema9[i-1].value;
    const c26 = map26[ema9[i].time], p26 = map26[ema9[i-1].time];
    if (!c26 || !p26) continue;
    const idx = formatted.findIndex(d => d.time === ema9[i].time);
    if (idx < 0) continue;
    const a = atr[idx], adxVal = adx[idx], pdi = plusDI[idx], mdi = minusDI[idx], vw = vwap[idx];
    if (a == null || adxVal == null || pdi == null || mdi == null || vw == null) continue;
    const isTrending = adxVal > ADX_THRESHOLD;
    const price = formatted[idx].close;
    const strength = getSignalStrength(adxVal, pdi, mdi);

    if (p9 <= p26 && c9 > c26 && isTrending && pdi > mdi && price > vw) {
      signals.push({
        time: ema9[i].time, type: "BUY", value: c9, strength,
        sl: parseFloat((price - 1.5*a).toFixed(2)),
        t1: parseFloat((price + 1.0*a).toFixed(2)),
        t2: parseFloat((price + 2.0*a).toFixed(2)),
        t3: parseFloat((price + 3.0*a).toFixed(2)),
        adx: parseFloat(adxVal.toFixed(1)), plusDI: parseFloat(pdi.toFixed(1)), minusDI: parseFloat(mdi.toFixed(1)), vwap: parseFloat(vw.toFixed(2)),
      });
    } else if (p9 >= p26 && c9 < c26 && isTrending && mdi > pdi && price < vw) {
      signals.push({
        time: ema9[i].time, type: "SELL", value: c9, strength,
        sl: parseFloat((price + 1.5*a).toFixed(2)),
        t1: parseFloat((price - 1.0*a).toFixed(2)),
        t2: parseFloat((price - 2.0*a).toFixed(2)),
        t3: parseFloat((price - 3.0*a).toFixed(2)),
        adx: parseFloat(adxVal.toFixed(1)), plusDI: parseFloat(pdi.toFixed(1)), minusDI: parseFloat(mdi.toFixed(1)), vwap: parseFloat(vw.toFixed(2)),
      });
    }
  }
  return signals;
};

const getLastDayRange = (formatted) => {
  if (!formatted.length) return null;
  const lastTime = formatted[formatted.length - 1].time;
  const lastDayKey = new Date(lastTime * 1000).toISOString().slice(0, 10);
  const dayCandles = formatted.filter(d => new Date(d.time * 1000).toISOString().slice(0, 10) === lastDayKey);
  if (!dayCandles.length) return null;
  const step = formatted.length > 1 ? formatted[1].time - formatted[0].time : 300;
  return { from: dayCandles[0].time, to: dayCandles[dayCandles.length - 1].time + step * 8 };
};

const ChartComponent = ({ symbol, timeframe, onSignal }) => {
  const containerRef = useRef(null), chartRef = useRef(null), candleRef = useRef(null);
  const ema9Ref = useRef(null), ema26Ref = useRef(null), vwapRef = useRef(null);
  const intervalRef = useRef(null), mountedRef = useRef(false), fittedRef = useRef(false), lastSigRef = useRef(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [status, setStatus] = useState(null);

  const fetchCandles = useCallback(async (resetView = false) => {
    if (!mountedRef.current || !chartRef.current) return;
    try {
      const res = await fetch(`${API_URL}/chart-data/${symbol}/${timeframe}`);
      if (!res.ok) return;
      const raw = await res.json();
      if (!Array.isArray(raw) || !raw.length) return;
      const formatted = raw.map((item) => ({
        time: toChartTime(item[0]), open: Number(item[1]), high: Number(item[2]),
        low: Number(item[3]), close: Number(item[4]), volume: Number(item[5] || 0),
      })).filter(d => !isNaN(d.open) && d.open > 0).sort((a, b) => a.time - b.time);
      if (!formatted.length || !mountedRef.current) return;
      candleRef.current?.setData(formatted);
      const ema9 = calculateEMA(formatted, 9), ema26 = calculateEMA(formatted, 26);
      const atr = calculateATR(formatted, 14), adxDI = calculateADX_DI(formatted, 14), vwap = calculateVWAP(formatted);
      ema9Ref.current?.setData(ema9); ema26Ref.current?.setData(ema26);
      vwapRef.current?.setData(formatted.map((d, idx) => ({ time: d.time, value: vwap[idx] })).filter(d => d.value != null));
      const li = formatted.length - 1;
      const lastAdx = adxDI.adx[li], lastPDI = adxDI.plusDI[li], lastMDI = adxDI.minusDI[li];
      const lastVwap = vwap[li], lastPrice = formatted[li].close;
      if (lastAdx != null && lastVwap != null && lastPDI != null) {
        setStatus({ adx: lastAdx.toFixed(1), plusDI: lastPDI.toFixed(1), minusDI: lastMDI.toFixed(1),
          isTrending: lastAdx > ADX_THRESHOLD, bullsLead: lastPDI > lastMDI,
          price: lastPrice, vwap: lastVwap.toFixed(2), aboveVwap: lastPrice > lastVwap });
      }
      const signals = detectCrossovers(formatted, ema9, ema26, atr, adxDI, vwap);
      candleRef.current?.setMarkers(signals.map(s => ({
        time: s.time, position: s.type === "BUY" ? "belowBar" : "aboveBar",
        color: s.type === "BUY" ? "#00e5a0" : "#ff4560",
        shape: s.type === "BUY" ? "arrowUp" : "arrowDown", text: `${s.type} ${s.strength[0]}`, size: 2,
      })));
      if (signals.length && onSignal) {
        const latest = signals[signals.length - 1];
        const key = `${latest.time}-${latest.type}`;
        if (key !== lastSigRef.current) {
          lastSigRef.current = key;
          const price = formatted.find(d => d.time === latest.time)?.close;
          const realUtcMs = latest.time * 1000 - IST_OFFSET_MS;
          onSignal({ ...latest, symbol, timeframe, price,
            timestamp: new Date(realUtcMs).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" }) });
        }
      }
      if (!fittedRef.current || resetView) {
        const range = getLastDayRange(formatted);
        if (range) chartRef.current?.timeScale().setVisibleRange(range);
        else chartRef.current?.timeScale().fitContent();
        fittedRef.current = true;
      }
    } catch (err) { console.error("Fetch error:", err); }
  }, [symbol, timeframe, onSignal]);

  const handleManualRefresh = useCallback(async () => {
    setIsRefreshing(true); await fetchCandles(true); setTimeout(() => setIsRefreshing(false), 500);
  }, [fetchCandles]);

  useEffect(() => {
    mountedRef.current = true; fittedRef.current = false;
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (chartRef.current) { chartRef.current.remove(); chartRef.current = null; }
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth, height: containerRef.current.clientHeight || 420,
      layout: { background: { color: "transparent" }, textColor: "#8892b0", fontFamily: "'JetBrains Mono', monospace", fontSize: 11 },
      grid: { vertLines: { color: "rgba(100,120,180,0.08)" }, horzLines: { color: "rgba(100,120,180,0.08)" } },
      rightPriceScale: { borderColor: "rgba(100,120,180,0.2)" },
      timeScale: { borderColor: "rgba(100,120,180,0.2)", timeVisible: true, secondsVisible: false },
      crosshair: { mode: 1, vertLine: { color: "rgba(100,180,255,0.3)", width: 1, style: 3 }, horzLine: { color: "rgba(100,180,255,0.3)", width: 1, style: 3 } },
    });
    chartRef.current = chart;
    candleRef.current = chart.addCandlestickSeries({ upColor: "#00e5a0", downColor: "#ff4560", borderVisible: false, wickUpColor: "#00e5a0", wickDownColor: "#ff4560" });
    ema9Ref.current  = chart.addLineSeries({ color: "#00d4ff", lineWidth: 2, title: "EMA 9",  priceLineVisible: false, lastValueVisible: true });
    ema26Ref.current = chart.addLineSeries({ color: "#ff9f43", lineWidth: 2, title: "EMA 26", priceLineVisible: false, lastValueVisible: true });
    vwapRef.current  = chart.addLineSeries({ color: "#c084fc", lineWidth: 1, lineStyle: 2, title: "VWAP", priceLineVisible: false, lastValueVisible: true });
    fetchCandles(true);
    intervalRef.current = setInterval(() => fetchCandles(false), 5000);
    const onResize = () => { if (chartRef.current && containerRef.current) chartRef.current.applyOptions({ width: containerRef.current.clientWidth }); };
    window.addEventListener("resize", onResize);
    return () => {
      mountedRef.current = false; clearInterval(intervalRef.current);
      window.removeEventListener("resize", onResize);
      if (chartRef.current) { chartRef.current.remove(); chartRef.current = null; }
    };
  }, [symbol, timeframe]);

  useEffect(() => { if (mountedRef.current) fetchCandles(false); }, [fetchCandles]);

  return (
    <div style={{ width: "100%", height: "100%", minHeight: "420px", position: "relative" }}>
      {status && (
        <div style={{ position: "absolute", top: 8, left: 8, zIndex: 10,
          background: "rgba(10,14,26,0.88)", border: "1px solid rgba(100,120,180,0.25)",
          borderRadius: 6, padding: "5px 10px", fontSize: 11,
          fontFamily: "'JetBrains Mono', monospace", color: "#8892b0",
          display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
          <span>ADX <b style={{ color: status.isTrending ? "#00e5a0" : "#ff4560" }}>{status.adx}</b>
            <span style={{ color: status.isTrending ? "#00e5a0" : "#ff9f43", marginLeft: 4 }}>{status.isTrending ? "Trending" : "Choppy"}</span>
          </span>
          <span>
            <span style={{ color: "#00e5a0" }}>+DI {status.plusDI}</span>
            <span style={{ margin: "0 4px" }}>vs</span>
            <span style={{ color: "#ff4560" }}>-DI {status.minusDI}</span>
            <span style={{ marginLeft: 6, color: status.bullsLead ? "#00e5a0" : "#ff4560", fontWeight: "bold" }}>
              {status.bullsLead ? "▲ Bulls" : "▼ Bears"}
            </span>
          </span>
          <span>VWAP <b style={{ color: "#c084fc" }}>{status.vwap}</b>
            <span style={{ color: status.aboveVwap ? "#00e5a0" : "#ff4560", marginLeft: 4 }}>{status.aboveVwap ? "Above ↑" : "Below ↓"}</span>
          </span>
        </div>
      )}
      <button onClick={handleManualRefresh} disabled={isRefreshing} title="Refresh chart"
        style={{ position: "absolute", top: 8, right: 8, zIndex: 10, width: 32, height: 32, borderRadius: 6,
          background: "rgba(10,14,26,0.88)", border: "1px solid rgba(100,120,180,0.25)",
          color: "#8892b0", cursor: isRefreshing ? "default" : "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 16, transition: "transform 0.4s ease",
          transform: isRefreshing ? "rotate(360deg)" : "rotate(0deg)" }}>⟳</button>
      <div ref={containerRef} style={{ width: "100%", height: "100%", minHeight: "420px" }} />
    </div>
  );
};

export default ChartComponent;