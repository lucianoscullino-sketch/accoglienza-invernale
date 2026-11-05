"use client";

import { useState } from "react";

export default function ServedBadge({
  served,
  onReset,
}: {
  served: boolean;
  onReset: () => Promise<void> | void;
}) {
  const [busy, setBusy] = useState(false);

  async function click() {
    if (!served || busy) return;
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
      disabled={!served || busy}
      title={served ? "Clicca per segnare come da servire" : "Da servire"}
      style={{
        cursor: served && !busy ? "pointer" : "default",
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