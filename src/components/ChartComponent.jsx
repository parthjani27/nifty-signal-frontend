import React, { useEffect, useRef, useCallback } from "react";
import { createChart } from "lightweight-charts";

const API_URL = "https://niftysignal-backend.onrender.com";
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
    if (i === period - 1) {
      result.push({ time: candle.time, value: parseFloat(ema.toFixed(2)) });
      return;
    }
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
  for (let i = period + 1; i < n; i++) {
    atr[i] = (atr[i-1] * (period - 1) + tr[i]) / period;
  }
  return atr;
};

const calculateADX = (data, period = 14) => {
  const n = data.length;
  const adx = new Array(n).fill(null);
  if (n < period * 2) return adx;
  const plusDM = new Array(n).fill(0);
  const minusDM = new Array(n).fill(0);
  const tr = new Array(n).fill(0);
  for (let i = 1; i < n; i++) {
    const high = data[i].high, low = data[i].low;
    const prevHigh = data[i-1].high, prevLow = data[i-1].low, prevClose = data[i-1].close;
    const upMove = high - prevHigh;
    const downMove = prevLow - low;
    plusDM[i] = (upMove > downMove && upMove > 0) ? upMove : 0;
    minusDM[i] = (downMove > upMove && downMove > 0) ? downMove : 0;
    tr[i] = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
  }
  const smTR = new Array(n).fill(null);
  const smPlus = new Array(n).fill(null);
  const smMinus = new Array(n).fill(null);
  let sumTR = 0, sumPlus = 0, sumMinus = 0;
  for (let i = 1; i <= period; i++) { sumTR += tr[i]; sumPlus += plusDM[i]; sumMinus += minusDM[i]; }
  smTR[period] = sumTR; smPlus[period] = sumPlus; smMinus[period] = sumMinus;
  for (let i = period + 1; i < n; i++) {
    smTR[i] = smTR[i-1] - (smTR[i-1] / period) + tr[i];
    smPlus[i] = smPlus[i-1] - (smPlus[i-1] / period) + plusDM[i];
    smMinus[i] = smMinus[i-1] - (smMinus[i-1] / period) + minusDM[i];
  }
  const dx = new Array(n).fill(null);
  for (let i = period; i < n; i++) {
    if (!smTR[i]) continue;
    const plusDI = 100 * (smPlus[i] / smTR[i]);
    const minusDI = 100 * (smMinus[i] / smTR[i]);
    if ((plusDI + minusDI) === 0) continue;
    dx[i] = 100 * Math.abs(plusDI - minusDI) / (plusDI + minusDI);
  }
  let dxSum = 0, dxCount = 0;
  for (let i = period; i < period * 2; i++) { if (dx[i] != null) { dxSum += dx[i]; dxCount++; } }
  if (dxCount < period) return adx;
  adx[period*2 - 1] = dxSum / period;
  for (let i = period * 2; i < n; i++) {
    if (dx[i] == null) continue;
    adx[i] = (adx[i-1] * (period - 1) + dx[i]) / period;
  }
  return adx;
};

const calculateVWAP = (data) => {
  const n = data.length;
  const vwap = new Array(n).fill(null);
  let cumPV = 0, cumVol = 0, currentDay = null;
  for (let i = 0; i < n; i++) {
    const day = new Date(data[i].time * 1000).toISOString().slice(0, 10);
    if (day !== currentDay) { currentDay = day; cumPV = 0; cumVol = 0; }
    const typicalPrice = (data[i].high + data[i].low + data[i].close) / 3;
    const volume = data[i].volume || 0;
    cumPV += typicalPrice * volume;
    cumVol += volume;
    vwap[i] = cumVol > 0 ? cumPV / cumVol : data[i].close;
  }
  return vwap;
};

const detectCrossovers = (formatted, ema9, ema26, atr, adx, vwap) => {
  const signals = [];
  const map26 = {}, atrMap = {}, adxMap = {}, vwapMap = {};
  ema26.forEach((d) => (map26[d.time] = d.value));
  formatted.forEach((c, idx) => {
    atrMap[c.time] = atr[idx];
    adxMap[c.time] = adx[idx];
    vwapMap[c.time] = vwap[idx];
  });
  for (let i = 1; i < ema9.length; i++) {
    const c9 = ema9[i].value, p9 = ema9[i-1].value;
    const c26 = map26[ema9[i].time], p26 = map26[ema9[i-1].time];
    if (!c26 || !p26) continue;
    const t = ema9[i].time;
    const a = atrMap[t], adxVal = adxMap[t], vw = vwapMap[t];
    if (a == null || adxVal == null || vw == null) continue;
    const isTrending = adxVal > ADX_THRESHOLD;
    const price = formatted.find(d => d.time === t)?.close;
    if (price == null) continue;

    if (p9 <= p26 && c9 > c26 && isTrending && price > vw) {
      signals.push({
        time: t, type: "BUY", value: c9,
        sl: parseFloat((price - 1.5 * a).toFixed(2)),
        target: parseFloat((price + 2 * a).toFixed(2)),
        adx: parseFloat(adxVal.toFixed(1)), vwap: parseFloat(vw.toFixed(2)),
      });
    } else if (p9 >= p26 && c9 < c26 && isTrending && price < vw) {
      signals.push({
        time: t, type: "SELL", value: c9,
        sl: parseFloat((price + 1.5 * a).toFixed(2)),
        target: parseFloat((price - 2 * a).toFixed(2)),
        adx: parseFloat(adxVal.toFixed(1)), vwap: parseFloat(vw.toFixed(2)),
      });
    }
  }
  return signals;
};

const ChartComponent = ({ symbol, timeframe, onSignal }) => {
  const containerRef = useRef(null);
  const chartRef     = useRef(null);
  const candleRef    = useRef(null);
  const ema9Ref      = useRef(null);
  const ema26Ref     = useRef(null);
  const vwapRef      = useRef(null);
  const intervalRef  = useRef(null);
  const mountedRef   = useRef(false);
  const fittedRef    = useRef(false);
  const lastSigRef   = useRef(null);

  const fetchCandles = useCallback(async () => {
    if (!mountedRef.current || !chartRef.current) return;
    try {
      const res = await fetch(`${API_URL}/chart-data/${symbol}/${timeframe}`);
      if (!res.ok) return;
      const raw = await res.json();
      if (!Array.isArray(raw) || !raw.length) return;
      const formatted = raw.map((item) => ({
        time:   toChartTime(item[0]),
        open:   Number(item[1]), high: Number(item[2]),
        low:    Number(item[3]), close: Number(item[4]),
        volume: Number(item[5] || 0),
      })).filter(d => !isNaN(d.open) && d.open > 0).sort((a, b) => a.time - b.time);
      if (!formatted.length || !mountedRef.current) return;

      candleRef.current?.setData(formatted);

      const ema9  = calculateEMA(formatted, 9);
      const ema26 = calculateEMA(formatted, 26);
      const atr   = calculateATR(formatted, 14);
      const adx   = calculateADX(formatted, 14);
      const vwap  = calculateVWAP(formatted);

      ema9Ref.current?.setData(ema9);
      ema26Ref.current?.setData(ema26);
      vwapRef.current?.setData(formatted.map((d, idx) => ({ time: d.time, value: vwap[idx] })).filter(d => d.value != null));

      const signals = detectCrossovers(formatted, ema9, ema26, atr, adx, vwap);
      candleRef.current?.setMarkers(signals.map(s => ({
        time: s.time,
        position: s.type === "BUY" ? "belowBar" : "aboveBar",
        color:    s.type === "BUY" ? "#00e5a0"  : "#ff4560",
        shape:    s.type === "BUY" ? "arrowUp"  : "arrowDown",
        text: s.type, size: 2,
      })));

      if (signals.length && onSignal) {
        const latest = signals[signals.length - 1];
        const key = `${latest.time}-${latest.type}`;
        if (key !== lastSigRef.current) {
          lastSigRef.current = key;
          const price = formatted.find(d => d.time === latest.time)?.close;
          const realUtcMs = latest.time * 1000 - IST_OFFSET_MS;
          onSignal({ ...latest, symbol, timeframe, price,
            timestamp: new Date(realUtcMs).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" }),
          });
        }
      }
      if (!fittedRef.current) { chartRef.current?.timeScale().fitContent(); fittedRef.current = true; }
    } catch (err) { console.error("Fetch error:", err); }
  }, [symbol, timeframe, onSignal]);

  useEffect(() => {
    mountedRef.current = true; fittedRef.current = false;
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (chartRef.current) { chartRef.current.remove(); chartRef.current = null; }
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height: containerRef.current.clientHeight || 420,
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
    fetchCandles();
    intervalRef.current = setInterval(fetchCandles, 5000);
    const onResize = () => { if (chartRef.current && containerRef.current) chartRef.current.applyOptions({ width: containerRef.current.clientWidth }); };
    window.addEventListener("resize", onResize);
    return () => {
      mountedRef.current = false; clearInterval(intervalRef.current);
      window.removeEventListener("resize", onResize);
      if (chartRef.current) { chartRef.current.remove(); chartRef.current = null; }
    };
  }, [symbol, timeframe]);

  useEffect(() => { if (mountedRef.current) fetchCandles(); }, [fetchCandles]);

  return <div ref={containerRef} style={{ width: "100%", height: "100%", minHeight: "420px" }} />;
};

export default ChartComponent;