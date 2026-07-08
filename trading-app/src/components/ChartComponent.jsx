import React, { useEffect, useRef, useCallback } from "react";
import { createChart } from "lightweight-charts";

// ─── EMA Calculation ────────────────────────────────────────────────
const calculateEMA = (data, period) => {
  if (!data || data.length < period) return [];
  const multiplier = 2 / (period + 1);
  let ema = data.slice(0, period).reduce((sum, d) => sum + d.close, 0) / period;
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

// ─── Detect Crossovers ──────────────────────────────────────────────
const detectCrossovers = (ema9, ema21) => {
  const signals = [];
  const map21 = {};
  ema21.forEach((d) => (map21[d.time] = d.value));

  for (let i = 1; i < ema9.length; i++) {
    const curr9 = ema9[i].value;
    const prev9 = ema9[i - 1].value;
    const curr21 = map21[ema9[i].time];
    const prev21 = map21[ema9[i - 1].time];

    if (!curr21 || !prev21) continue;

    // Bullish crossover: EMA9 crosses above EMA21
    if (prev9 <= prev21 && curr9 > curr21) {
      signals.push({ time: ema9[i].time, type: "BUY", value: curr9 });
    }
    // Bearish crossover: EMA9 crosses below EMA21
    else if (prev9 >= prev21 && curr9 < curr21) {
      signals.push({ time: ema9[i].time, type: "SELL", value: curr9 });
    }
  }
  return signals;
};

// ─── Component ──────────────────────────────────────────────────────
const ChartComponent = ({ symbol, timeframe, onSignal }) => {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const candleRef = useRef(null);
  const ema9Ref = useRef(null);
  const ema21Ref = useRef(null);
  const buyMarkersRef = useRef(null);
  const sellMarkersRef = useRef(null);
  const intervalRef = useRef(null);
  const mountedRef = useRef(false);
  const fittedRef = useRef(false);
  const lastSignalRef = useRef(null);

  const fetchData = useCallback(async () => {
    if (!mountedRef.current || !chartRef.current) return;

    try {
      const res = await fetch(
        `http://127.0.0.1:8000/chart-data/${symbol}/${timeframe}`
      );
      if (!res.ok) return;
      const raw = await res.json();
      if (!Array.isArray(raw) || !raw.length) return;

      const formatted = raw
        .map((item) => ({
          time: Math.floor(new Date(item[0]).getTime() / 1000),
          open: Number(item[1]),
          high: Number(item[2]),
          low: Number(item[3]),
          close: Number(item[4]),
        }))
        .filter(
          (d) =>
            !isNaN(d.open) && !isNaN(d.high) && !isNaN(d.low) && !isNaN(d.close)
        )
        .sort((a, b) => a.time - b.time);

      if (!formatted.length || !mountedRef.current) return;

      // Set candlestick data
      candleRef.current?.setData(formatted);

      // EMA lines
      const ema9 = calculateEMA(formatted, 9);
      const ema21 = calculateEMA(formatted, 21);
      ema9Ref.current?.setData(ema9);
      ema21Ref.current?.setData(ema21);

      // Crossover signals as markers
      const signals = detectCrossovers(ema9, ema21);

      const buyMarkers = signals
        .filter((s) => s.type === "BUY")
        .map((s) => ({
          time: s.time,
          position: "belowBar",
          color: "#00ff88",
          shape: "arrowUp",
          text: "BUY",
          size: 2,
        }));

      const sellMarkers = signals
        .filter((s) => s.type === "SELL")
        .map((s) => ({
          time: s.time,
          position: "aboveBar",
          color: "#ff4d4d",
          shape: "arrowDown",
          text: "SELL",
          size: 2,
        }));

      candleRef.current?.setMarkers([...buyMarkers, ...sellMarkers]);

      // Fire latest signal to parent
      if (signals.length > 0 && onSignal) {
        const latest = signals[signals.length - 1];
        const key = `${latest.time}-${latest.type}`;
        if (key !== lastSignalRef.current) {
          lastSignalRef.current = key;
          const price = formatted.find((d) => d.time === latest.time)?.close;
          onSignal({
            ...latest,
            symbol,
            timeframe,
            price,
            timestamp: new Date(latest.time * 1000).toLocaleTimeString("en-IN", {
              hour: "2-digit",
              minute: "2-digit",
              hour12: true,
            }),
          });
        }
      }

      // Fit chart only on first load
      if (!fittedRef.current) {
        chartRef.current?.timeScale().fitContent();
        fittedRef.current = true;
      }
    } catch (err) {
      console.error("Fetch error:", err);
    }
  }, [symbol, timeframe, onSignal]);

  useEffect(() => {
    mountedRef.current = true;
    fittedRef.current = false;

    if (intervalRef.current) clearInterval(intervalRef.current);
    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }

    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height: containerRef.current.clientHeight || 420,
      layout: {
        background: { color: "transparent" },
        textColor: "#8892b0",
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: "rgba(100,120,180,0.08)" },
        horzLines: { color: "rgba(100,120,180,0.08)" },
      },
      rightPriceScale: {
        borderColor: "rgba(100,120,180,0.2)",
        textColor: "#8892b0",
      },
      timeScale: {
        borderColor: "rgba(100,120,180,0.2)",
        timeVisible: true,
        secondsVisible: false,
        tickMarkFormatter: (time) => {
          const d = new Date(time * 1000);
          return d.toLocaleTimeString("en-IN", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          });
        },
      },
      crosshair: {
        mode: 1,
        vertLine: { color: "rgba(100,180,255,0.3)", width: 1, style: 3 },
        horzLine: { color: "rgba(100,180,255,0.3)", width: 1, style: 3 },
      },
    });

    chartRef.current = chart;

    // Candlestick series
    candleRef.current = chart.addCandlestickSeries({
      upColor: "#00e5a0",
      downColor: "#ff4560",
      borderVisible: false,
      wickUpColor: "#00e5a0",
      wickDownColor: "#ff4560",
    });

    // EMA 9 — cyan
    ema9Ref.current = chart.addLineSeries({
      color: "#00d4ff",
      lineWidth: 2,
      title: "EMA 9",
      priceLineVisible: false,
      lastValueVisible: true,
    });

    // EMA 21 — orange
    ema21Ref.current = chart.addLineSeries({
      color: "#ff9f43",
      lineWidth: 2,
      title: "EMA 21",
      priceLineVisible: false,
      lastValueVisible: true,
    });

    fetchData();
    intervalRef.current = setInterval(fetchData, 3000);

    const onResize = () => {
      if (chartRef.current && containerRef.current) {
        chartRef.current.applyOptions({
          width: containerRef.current.clientWidth,
        });
      }
    };
    window.addEventListener("resize", onResize);

    return () => {
      mountedRef.current = false;
      clearInterval(intervalRef.current);
      window.removeEventListener("resize", onResize);
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  }, [symbol, timeframe]);

  // Re-fetch when fetchData changes (symbol/timeframe)
  useEffect(() => {
    if (mountedRef.current) fetchData();
  }, [fetchData]);

  return (
    <div
      ref={containerRef}
      style={{ width: "100%", height: "100%", minHeight: "420px" }}
    />
  );
};

export default ChartComponent;
