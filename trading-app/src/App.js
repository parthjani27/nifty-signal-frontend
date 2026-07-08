import React, { useState, useCallback, useRef } from "react";
import ChartComponent from "./components/ChartComponent";
import SignalPanel from "./components/SignalPanel";

const SYMBOLS = [
  { id: "NIFTY", label: "NIFTY 50" },
  { id: "SENSEX", label: "SENSEX" },
];

const TIMEFRAMES = [
  { id: "1min", label: "1m" },
  { id: "5min", label: "5m" },
  { id: "15min", label: "15m" },
];

export default function App() {
  const [activeSymbol, setActiveSymbol] = useState("NIFTY");
  const [activeTimeframe, setActiveTimeframe] = useState("5min");
  const [signals, setSignals] = useState([]);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  const handleSignal = useCallback((signal) => {
    setSignals((prev) => [...prev.slice(-49), signal]);

    // Show toast notification
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(signal);
    toastTimer.current = setTimeout(() => setToast(null), 4000);

    // Browser notification (if permitted)
    if (Notification.permission === "granted") {
      new Notification(
        `${signal.type} Signal — ${signal.symbol}`,
        {
          body: `EMA 9/21 crossover on ${signal.timeframe} @ ₹${signal.price?.toFixed(2)}`,
          icon: "/favicon.ico",
        }
      );
    }
  }, []);

  const requestNotificationPermission = () => {
    if (Notification.permission === "default") {
      Notification.requestPermission();
    }
  };

  return (
    <div style={styles.root}>
      <style>{globalStyles}</style>

      {/* ── Header ── */}
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <div style={styles.logo}>
            <span style={styles.logoIcon}>◈</span>
            <span style={styles.logoText}>NiftySignal</span>
            <span style={styles.logoPro}>PRO</span>
          </div>
          <div style={styles.liveChip}>
            <span style={styles.liveDot} />
            LIVE
          </div>
        </div>

        <div style={styles.headerCenter}>
          {/* Symbol tabs */}
          <div style={styles.tabGroup}>
            {SYMBOLS.map((s) => (
              <button
                key={s.id}
                onClick={() => setActiveSymbol(s.id)}
                style={{
                  ...styles.tab,
                  ...(activeSymbol === s.id ? styles.tabActive : {}),
                }}
              >
                {s.label}
              </button>
            ))}
          </div>

          {/* Timeframe tabs */}
          <div style={styles.tabGroup}>
            {TIMEFRAMES.map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveTimeframe(t.id)}
                style={{
                  ...styles.tfTab,
                  ...(activeTimeframe === t.id ? styles.tfTabActive : {}),
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div style={styles.headerRight}>
          <button
            style={styles.notifBtn}
            onClick={requestNotificationPermission}
            title="Enable notifications"
          >
            🔔
          </button>
          <div style={styles.emaLegend}>
            <span style={{ ...styles.dot, background: "#00d4ff" }} />
            <span style={styles.legendLabel}>EMA 9</span>
            <span style={{ ...styles.dot, background: "#ff9f43" }} />
            <span style={styles.legendLabel}>EMA 21</span>
          </div>
        </div>
      </header>

      {/* ── Main content ── */}
      <main style={styles.main}>
        {/* Chart area */}
        <div style={styles.chartCard}>
          <div style={styles.chartHeader}>
            <span style={styles.chartTitle}>
              {SYMBOLS.find((s) => s.id === activeSymbol)?.label}
            </span>
            <span style={styles.chartSubtitle}>
              EMA 9 × EMA 21 Crossover &nbsp;·&nbsp;{" "}
              {TIMEFRAMES.find((t) => t.id === activeTimeframe)?.label} chart
            </span>
          </div>
          <div style={styles.chartBody}>
            <ChartComponent
              symbol={activeSymbol}
              timeframe={activeTimeframe}
              onSignal={handleSignal}
            />
          </div>
        </div>

        {/* Signal panel */}
        <div style={styles.signalCard}>
          <SignalPanel signals={signals} />
        </div>
      </main>

      {/* ── Toast notification ── */}
      {toast && (
        <div
          style={{
            ...styles.toast,
            borderColor: toast.type === "BUY" ? "#00e5a0" : "#ff4560",
            background:
              toast.type === "BUY"
                ? "rgba(0,229,160,0.08)"
                : "rgba(255,69,96,0.08)",
          }}
        >
          <span
            style={{
              ...styles.toastBadge,
              color: toast.type === "BUY" ? "#00e5a0" : "#ff4560",
            }}
          >
            {toast.type === "BUY" ? "▲ BUY SIGNAL" : "▼ SELL SIGNAL"}
          </span>
          <span style={styles.toastBody}>
            {toast.symbol} · {toast.timeframe}
          </span>
          <span style={styles.toastPrice}>
            ₹{toast.price?.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
          </span>
          <span style={styles.toastTime}>{toast.timestamp}</span>
        </div>
      )}
    </div>
  );
}

// ─── Styles ────────────────────────────────────────────────────────
const styles = {
  root: {
    minHeight: "100vh",
    background: "#070b18",
    fontFamily: "'Space Grotesk', sans-serif",
    color: "#cdd5f0",
    display: "flex",
    flexDirection: "column",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0 24px",
    height: "60px",
    background: "rgba(10,14,30,0.95)",
    borderBottom: "1px solid rgba(100,120,180,0.12)",
    backdropFilter: "blur(10px)",
    position: "sticky",
    top: 0,
    zIndex: 100,
    gap: "16px",
  },
  headerLeft: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    minWidth: "180px",
  },
  logo: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
  logoIcon: {
    fontSize: "22px",
    color: "#00d4ff",
  },
  logoText: {
    fontSize: "16px",
    fontWeight: "700",
    color: "#e8ecf8",
    letterSpacing: "-0.3px",
  },
  logoPro: {
    fontSize: "9px",
    fontWeight: "700",
    letterSpacing: "2px",
    color: "#00d4ff",
    background: "rgba(0,212,255,0.1)",
    border: "1px solid rgba(0,212,255,0.3)",
    padding: "2px 6px",
    borderRadius: "4px",
  },
  liveChip: {
    display: "flex",
    alignItems: "center",
    gap: "5px",
    fontSize: "10px",
    fontWeight: "600",
    letterSpacing: "1.5px",
    color: "#00e5a0",
    background: "rgba(0,229,160,0.08)",
    border: "1px solid rgba(0,229,160,0.2)",
    padding: "3px 8px",
    borderRadius: "20px",
  },
  liveDot: {
    width: "6px",
    height: "6px",
    borderRadius: "50%",
    background: "#00e5a0",
    animation: "pulse 1.5s infinite",
  },
  headerCenter: {
    display: "flex",
    alignItems: "center",
    gap: "16px",
    flex: 1,
    justifyContent: "center",
  },
  tabGroup: {
    display: "flex",
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(100,120,180,0.15)",
    borderRadius: "8px",
    padding: "3px",
    gap: "2px",
  },
  tab: {
    padding: "5px 18px",
    borderRadius: "6px",
    border: "none",
    background: "transparent",
    color: "rgba(136,146,176,0.7)",
    fontSize: "13px",
    fontWeight: "600",
    cursor: "pointer",
    fontFamily: "'Space Grotesk', sans-serif",
    transition: "all 0.15s ease",
  },
  tabActive: {
    background: "rgba(0,212,255,0.12)",
    color: "#00d4ff",
    boxShadow: "inset 0 0 0 1px rgba(0,212,255,0.25)",
  },
  tfTab: {
    padding: "5px 14px",
    borderRadius: "6px",
    border: "none",
    background: "transparent",
    color: "rgba(136,146,176,0.7)",
    fontSize: "12px",
    fontWeight: "600",
    cursor: "pointer",
    fontFamily: "'JetBrains Mono', monospace",
    transition: "all 0.15s ease",
    letterSpacing: "0.5px",
  },
  tfTabActive: {
    background: "rgba(255,159,67,0.12)",
    color: "#ff9f43",
    boxShadow: "inset 0 0 0 1px rgba(255,159,67,0.25)",
  },
  headerRight: {
    display: "flex",
    alignItems: "center",
    gap: "16px",
    minWidth: "180px",
    justifyContent: "flex-end",
  },
  notifBtn: {
    background: "transparent",
    border: "1px solid rgba(100,120,180,0.2)",
    borderRadius: "8px",
    padding: "6px 10px",
    cursor: "pointer",
    fontSize: "15px",
  },
  emaLegend: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    fontSize: "11px",
    color: "#8892b0",
    fontFamily: "'JetBrains Mono', monospace",
  },
  dot: {
    width: "8px",
    height: "8px",
    borderRadius: "50%",
    display: "inline-block",
  },
  legendLabel: {
    marginRight: "8px",
  },
  main: {
    display: "grid",
    gridTemplateColumns: "1fr 300px",
    gap: "0",
    flex: 1,
    padding: "16px",
    gap: "16px",
    height: "calc(100vh - 76px)",
  },
  chartCard: {
    background: "rgba(10,14,30,0.6)",
    border: "1px solid rgba(100,120,180,0.12)",
    borderRadius: "12px",
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
  },
  chartHeader: {
    padding: "12px 16px",
    borderBottom: "1px solid rgba(100,120,180,0.08)",
    display: "flex",
    alignItems: "center",
    gap: "12px",
  },
  chartTitle: {
    fontSize: "15px",
    fontWeight: "700",
    color: "#e8ecf8",
    letterSpacing: "-0.2px",
  },
  chartSubtitle: {
    fontSize: "11px",
    color: "rgba(136,146,176,0.6)",
    fontFamily: "'JetBrains Mono', monospace",
  },
  chartBody: {
    flex: 1,
    overflow: "hidden",
  },
  signalCard: {
    overflow: "hidden",
  },
  toast: {
    position: "fixed",
    bottom: "24px",
    right: "24px",
    border: "1px solid",
    borderRadius: "12px",
    padding: "16px 20px",
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    minWidth: "240px",
    backdropFilter: "blur(12px)",
    zIndex: 999,
    animation: "slideIn 0.3s ease",
  },
  toastBadge: {
    fontSize: "12px",
    fontWeight: "700",
    letterSpacing: "1.5px",
    fontFamily: "'JetBrains Mono', monospace",
  },
  toastBody: {
    fontSize: "13px",
    color: "#8892b0",
  },
  toastPrice: {
    fontSize: "20px",
    fontWeight: "700",
    color: "#e8ecf8",
    fontFamily: "'JetBrains Mono', monospace",
    marginTop: "2px",
  },
  toastTime: {
    fontSize: "10px",
    color: "rgba(136,146,176,0.5)",
    fontFamily: "'JetBrains Mono', monospace",
  },
};

const globalStyles = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #070b18; }
  ::-webkit-scrollbar { width: 4px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: rgba(100,120,180,0.2); border-radius: 4px; }

  @keyframes pulse {
    0%, 100% { opacity: 1; box-shadow: 0 0 4px currentColor; }
    50% { opacity: 0.5; box-shadow: 0 0 10px currentColor; }
  }

  @keyframes slideIn {
    from { transform: translateX(100px); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }
`;
