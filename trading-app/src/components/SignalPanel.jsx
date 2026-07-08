import React from "react";

const SignalPanel = ({ signals }) => {
  return (
    <div style={styles.panel}>
      <div style={styles.header}>
        <span style={styles.dot} />
        <span style={styles.title}>LIVE SIGNALS</span>
      </div>

      <div style={styles.list}>
        {signals.length === 0 ? (
          <div style={styles.empty}>Waiting for crossover...</div>
        ) : (
          [...signals].reverse().map((s, i) => (
            <div
              key={i}
              style={{
                ...styles.row,
                borderLeft: `3px solid ${s.type === "BUY" ? "#00e5a0" : "#ff4560"}`,
                opacity: i === 0 ? 1 : 0.7 - i * 0.08,
              }}
            >
              <div style={styles.rowLeft}>
                <span
                  style={{
                    ...styles.badge,
                    background:
                      s.type === "BUY"
                        ? "rgba(0,229,160,0.12)"
                        : "rgba(255,69,96,0.12)",
                    color: s.type === "BUY" ? "#00e5a0" : "#ff4560",
                  }}
                >
                  {s.type === "BUY" ? "▲ BUY" : "▼ SELL"}
                </span>
                <span style={styles.symbol}>{s.symbol}</span>
              </div>
              <div style={styles.rowRight}>
                <span style={styles.price}>
                  ₹{s.price?.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                </span>
                <span style={styles.meta}>
                  {s.timeframe} · {s.timestamp}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

const styles = {
  panel: {
    background: "rgba(15,20,40,0.8)",
    border: "1px solid rgba(100,120,180,0.15)",
    borderRadius: "12px",
    overflow: "hidden",
    height: "100%",
    display: "flex",
    flexDirection: "column",
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "14px 16px",
    borderBottom: "1px solid rgba(100,120,180,0.12)",
  },
  dot: {
    width: "7px",
    height: "7px",
    borderRadius: "50%",
    background: "#00e5a0",
    boxShadow: "0 0 6px #00e5a0",
    animation: "pulse 2s infinite",
  },
  title: {
    fontSize: "11px",
    fontWeight: "600",
    letterSpacing: "2px",
    color: "#8892b0",
  },
  list: {
    flex: 1,
    overflowY: "auto",
    padding: "8px",
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  empty: {
    color: "rgba(136,146,176,0.4)",
    fontSize: "12px",
    textAlign: "center",
    marginTop: "32px",
    fontStyle: "italic",
  },
  row: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "10px 12px",
    background: "rgba(255,255,255,0.03)",
    borderRadius: "8px",
    paddingLeft: "10px",
  },
  rowLeft: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
  rowRight: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-end",
    gap: "2px",
  },
  badge: {
    fontSize: "10px",
    fontWeight: "700",
    letterSpacing: "1px",
    padding: "3px 8px",
    borderRadius: "4px",
    fontFamily: "'JetBrains Mono', monospace",
  },
  symbol: {
    fontSize: "12px",
    color: "#cdd5f0",
    fontWeight: "500",
  },
  price: {
    fontSize: "13px",
    fontWeight: "600",
    color: "#e8ecf8",
    fontFamily: "'JetBrains Mono', monospace",
  },
  meta: {
    fontSize: "10px",
    color: "rgba(136,146,176,0.6)",
    fontFamily: "'JetBrains Mono', monospace",
  },
};

export default SignalPanel;
