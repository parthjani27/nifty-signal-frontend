import React, { useEffect, useRef, useCallback } from "react";
import { createChart } from "lightweight-charts";

const API_URL = "https://niftysignal-backend.onrender.com";

// IST is UTC+5:30. Lightweight Charts always displays time using UTC.
// Our backend sends correct IST timestamps (e.g. "...T09:15:00+05:30"),
// which new Date() converts to the TRUE utc epoch. If we feed that epoch
// directly to the chart, it displays it as if that utc value were the
// wall-clock time, shifting every candle back by 5:30 hours on screen.
// So we add the 5:30 offset back in before converting to seconds, making
// the chart's "UTC" display match the correct IST wall-clock time.
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

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

const detectCrossovers = (ema9, ema26) => {
  const signals = [], map26 = {};
  ema26.forEach((d) => (map26[d.time] = d.value));
  for (let i = 1; i < ema9.length; i++) {
    const c9 = ema9[i].value, p9 = ema9[i-1].value;
    const c26 = map26[ema9[i].time], p26 = map26[ema9[i-1].time];
    if (!c26 || !p26) continue;
    if (p9 <= p26 && c9 > c26) signals.push({ time: ema9[i].time, type: "BUY", value: c9 });
    else if (p9 >= p26 && c9 < c26) signals.push({ time: ema9[i].time, type: "SELL", value: c9 });
  }
  return signals;
};

const ChartComponent = ({ symbol, timeframe, onSignal }) => {
  const containerRef = useRef(null);
  const chartRef     = useRef(null);
  const candleRef    = useRef(null);
  const ema9Ref      = useRef(null);
  const ema26Ref     = useRef(null);
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
        time:  toChartTime(item[0]),
        open:  Number(item[1]), high: Number(item[2]),
        low:   Number(item[3]), close: Number(item[4]),
      })).filter(d => !isNaN(d.open) && d.open > 0).sort((a, b) => a.time - b.time);
      if (!formatted.length || !mountedRef.current) return;
      candleRef.current?.setData(formatted);
      const ema9  = calculateEMA(formatted, 9);
      const ema26 = calculateEMA(formatted, 26);
      ema9Ref.current?.setData(ema9);
      ema26Ref.current?.setData(ema26);
      const signals = detectCrossovers(ema9, ema26);
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
          // latest.time is already IST-adjusted "fake utc" seconds, so we
          // must subtract the offset back out before formatting for display,
          // otherwise toLocaleTimeString would double-apply the shift.
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