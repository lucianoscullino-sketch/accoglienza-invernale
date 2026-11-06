"use client";

import { useState } from "react";

export default function ServedBadge({
  served,
  canReset,
  onReset,
}: {
  served: boolean;
  canReset: boolean;
  onReset: () => Promise<void> | void;
}) {
  const [busy, setBusy] = useState(false);
  const clickable = served && canReset && !busy;

  async function click() {
    if (!clickable) return;
    setBusy(true);
    try {
      await onReset();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={click}
      disabled={!clickable}
      title={
        !served
          ? "Da servire"
          : canReset
            ? "Clicca per segnare come da servire"
            : "Servito (modificabile solo dall'associazione in uscita)"
      }
      style={{
        cursor: clickable ? "pointer" : "default",
        padding: "2px 10px",
        borderRadius: 999,
        fontSize: 14,
        fontWeight: 600,
        border: `1px solid ${served ? "#16a34a" : "#dc2626"}`,
        background: served ? "#dcfce7" : "#fee2e2",
        color: served ? "#166534" : "#991b1b",
        opacity: 1,
      }}
    >
      {served ? "Servito" : "Da servire"}
    </button>
  );
}