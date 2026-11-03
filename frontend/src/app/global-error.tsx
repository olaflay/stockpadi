"use client";

import { useEffect } from "react";

/**
 * Global error boundary. This component replaces the entire document, so it
 * cannot use the shared StateCard (which lives inside the app's own layout and
 * token sheet). Colours are still taken from the design tokens rather than
 * raw hex, loaded from the same stylesheet.
 */
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
      <body
        style={{
          margin: 0,
          fontFamily: "system-ui, -apple-system, sans-serif",
          backgroundColor: "var(--color-surface, #ffffff)",
          color: "var(--color-on-surface, #14181a)",
        }}
      >
        <div
          style={{
            minHeight: "100dvh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "24px",
            textAlign: "center",
          }}
        >
          <h1 style={{ fontSize: "24px", fontWeight: "bold", marginBottom: "8px" }}>
            Something unexpected happened
          </h1>
          <p
            style={{
              color: "var(--color-on-surface-muted, #495357)",
              maxWidth: "360px",
              marginBottom: "24px",
            }}
          >
            Your saved work is safe on this device. Reload the app to continue where you left off.
          </p>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              minHeight: "48px",
              padding: "0 24px",
              borderRadius: "12px",
              backgroundColor: "var(--color-brand-accent, #0a6e4d)",
              color: "var(--color-brand-accent-contrast, #ffffff)",
              border: "none",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Reload the app
          </button>
        </div>
      </body>
    </html>
  );
}
