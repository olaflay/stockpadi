"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[GlobalCrash]", error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, -apple-system, sans-serif", backgroundColor: "#fff", color: "#14181a" }}>
        <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px", textAlign: "center" }}>
          <h1 style={{ fontSize: "24px", fontWeight: "bold", marginBottom: "8px" }}>
            Application Error
          </h1>
          <p style={{ color: "#5e6b6f", maxWidth: "360px", marginBottom: "24px" }}>
            A critical system error occurred. Local offline data remains stored safely on this device.
          </p>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              minHeight: "48px",
              padding: "0 24px",
              borderRadius: "12px",
              backgroundColor: "#0a6e4d",
              color: "#fff",
              border: "none",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Reload Application
          </button>
        </div>
      </body>
    </html>
  );
}
