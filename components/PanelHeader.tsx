import type { ReactNode } from "react";

// Intestazione standard dei pannelli di menu (Calendario, Report, Coordinamento,
// Il tuo report): titolo e sottotitolo a sinistra, "X" a destra per tornare alla
// schermata principale. Coerente con la "X" del popup.

export default function PanelHeader({
  title,
  subtitle,
  onClose,
}: {
  title: string;
  subtitle?: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="panelhead">
      <div>
        <h2>{title}</h2>
        {subtitle ? (
          <p className="pgtxt" style={{ margin: "4px 0 0" }}>
            {subtitle}
          </p>
        ) : null}
      </div>
      <button
        className="panelhead-x"
        type="button"
        onClick={onClose}
        aria-label="Chiudi e torna alla schermata principale"
      >
        &times;
      </button>
    </div>
  );
}
