import { ReactNode } from "react";

export default function Popup({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="popup">
      <div
        className="popup-backdrop"
        onClick={onClose}
        aria-hidden="true"
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
        }}
      />
      <div
        className="popup-panel"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
      >
        <div className="popup-toolbar">
          <button
            className="popup-back"
            type="button"
            onClick={onClose}
            aria-label="Chiudi e torna indietro"
          >
            &larr;
          </button>
          <h2 className="popup-title">{title}</h2>
        </div>
        <div className="popup-content">{children}</div>
      </div>
    </div>
  );
}
