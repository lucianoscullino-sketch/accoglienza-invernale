import { useEffect, type ReactNode } from "react";

// Dialog modale centrato: sovrapposto all'app, con "X" per chiudere.
// Lo sfondo resta semi-trasparente così si vede che l'app sotto è ancora aperta.
export default function Popup({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="popup">
      <div className="popup-backdrop" onClick={onClose} aria-hidden="true" />
      <div
        className="popup-panel"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
      >
        <div className="popup-toolbar">
          <h2 className="popup-title">{title}</h2>
          <button
            className="popup-close"
            type="button"
            onClick={onClose}
            aria-label="Chiudi"
          >
            &times;
          </button>
        </div>
        <div className="popup-content">{children}</div>
      </div>
    </div>
  );
}
