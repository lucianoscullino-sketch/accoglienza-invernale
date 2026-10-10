"use client";

// Scheda di un utente regolare: descrizione, esito di stasera (firmato) e uscite precedenti.

import { useRef, useState } from "react";
import { EntryFields, entryFrom, type EntryValues } from "@/components/EntryFields";
import type { DailyLog, Org, ServiceUser, Status } from "@/lib/types";
import { ST_LABEL, fmtShort, fmtTime, orgName } from "@/lib/format";

export default function UserDetail({
  user,
  status,
  tonight,
  past,
  canRecord,
  canEditNote,
  orgs,
  readOnlyMsg,
  onSave,
  onSaveNote,
  isAdmin,
  suspended,
  deleted,
  onSuspend,
  onResume,
  onRestore,
  onDelete,
}: {
  user: ServiceUser;
  status: Status;
  tonight: DailyLog | null;
  past: DailyLog[];
  canRecord: boolean;
  canEditNote: boolean;
  orgs: Org[];
  readOnlyMsg: string;
  onSave: (v: EntryValues) => Promise<void>;
  onSaveNote?: (note: string) => Promise<void>;
  isAdmin?: boolean;
  suspended?: boolean;
  deleted?: boolean;
  onSuspend?: (note: string) => Promise<void>;
  onResume?: () => Promise<void>;
  onRestore?: () => Promise<void>;
  onDelete?: (note: string) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [showAllPast, setShowAllPast] = useState(false);
  const vref = useRef<EntryValues>(entryFrom(tonight));
  const [note, setNote] = useState(user.note || "");
  const [noteBusy, setNoteBusy] = useState(false);

  // --- Azioni coordinamento (solo admin): sospendi / riattiva / elimina ---
  const [actOp, setActOp] = useState<"suspend" | "delete" | null>(null);
  const [actNote, setActNote] = useState("");
  const [actBusy, setActBusy] = useState(false);

  function openAct(op: "suspend" | "delete") {
    setActOp(op);
    setActNote("");
  }
  function closeAct() {
    setActOp(null);
    setActNote("");
  }
  async function runAct() {
    if (!actOp) return;
    setActBusy(true);
    try {
      if (actOp === "suspend" && onSuspend) await onSuspend(actNote.trim());
      else if (actOp === "delete" && onDelete) await onDelete(actNote.trim());
      closeAct();
    } finally {
      setActBusy(false);
    }
  }

  const tagCls = status === "done" ? "tag tag-done" : status === "todo" ? "tag tag-todo" : "tag tag-muted";

  const form = canRecord ? (
    <form
      className="stack"
      onSubmit={(e) => {
        e.preventDefault();
        setBusy(true);
        onSave(vref.current).finally(() => setBusy(false));
      }}
    >
      <h3>Esito di stasera</h3>
      {tonight && (
        <p className="signed">
          Firmato da <strong>{orgName(tonight.org_id, orgs)}</strong>
          {tonight.created_at ? ` alle ${fmtTime(tonight.created_at)}` : ""}. Puoi modificarlo.
        </p>
      )}
      <EntryFields initial={entryFrom(tonight)} idPrefix="f" onValues={(v) => (vref.current = v)} />
      <button className="btn btn-primary" type="submit" disabled={busy}>
        {busy ? "Salvo…" : tonight ? "Aggiorna esito" : "Registra esito"}
      </button>
    </form>
  ) : (
    <div className="stack">
      <h3>Esito di stasera</h3>
      <p className="notice">{readOnlyMsg}</p>
      {tonight && (
        <p className="signed">
          Registrato da <strong>{orgName(tonight.org_id, orgs)}</strong>
          {tonight.created_at ? ` alle ${fmtTime(tonight.created_at)}` : ""}:{" "}
          {tonight.found ? "trovato" : "non trovato"}
          {tonight.provided.length
            ? (tonight.found ? ", fornito " : ", lasciato sul posto ") + tonight.provided.join(", ").toLowerCase()
            : ""}
          .
        </p>
      )}
    </div>
  );

  const PAST_PREVIEW = 5;
  const hasMorePast = past.length > PAST_PREVIEW;
  const visiblePast = showAllPast ? past : past.slice(0, PAST_PREVIEW);
  const hist = past.length ? (
    <div className="stack">
      <h3>Report giorni precedenti</h3>
      <ul className="hist">
        {visiblePast.map((l, i) => (
          <li key={l.id || i}>
            <div className="h-top">
              <span className="mono">{fmtShort(l.date)}</span>
              <span className="h-org">{orgName(l.org_id, orgs)}</span>
              <span className={`tag ${l.found ? "tag-done" : "tag-muted"}`}>
                {l.found ? "Trovato" : "Non trovato"}
              </span>
            </div>
            {l.provided.length ? (
              <p>
                {l.found ? "Fornito" : "Lasciato sul posto"}: {l.provided.join(", ").toLowerCase()}
              </p>
            ) : null}
            {l.requested ? <p>Richiesto: {l.requested}</p> : null}
            {l.note ? <p className="h-note">{l.note}</p> : null}
          </li>
        ))}
      </ul>
      {hasMorePast ? (
        <button
          className="btn btn-sm"
          type="button"
          onClick={() => setShowAllPast((v) => !v)}
        >
          {showAllPast
            ? "Mostra meno"
            : `Mostra tutte le uscite precedenti (${past.length})`}
        </button>
      ) : null}
    </div>
  ) : null;

  return (
    <div className="detail stack">
      <div>
        <h2>{user.name}</h2>
          <div className="meta">
            <span className={tagCls}>{ST_LABEL[status]}</span>
          </div>
        </div>
        <p className="desc">{user.description || "Nessuna descrizione."}</p>
      {canEditNote ? (
        <div className="stack" style={{ gap: 6 }}>
          <label className="lb" htmlFor="user-note">
            Nota del coordinamento (visibile a tutte le associazioni)
          </label>
          <textarea
            id="user-note"
            rows={3}
            value={note}
            placeholder="Es. avvicinare con cautela, non accetta cibo, chiamare i servizi sociali…"
            onChange={(e) => setNote(e.target.value)}
          />
          <div className="actions" style={{ padding: 0 }}>
            <button
              className="btn btn-sm"
              type="button"
              disabled={noteBusy || note === (user.note || "")}
              onClick={() => {
                setNoteBusy(true);
                (onSaveNote ? onSaveNote(note) : Promise.resolve()).finally(() => setNoteBusy(false));
              }}
            >
              {noteBusy ? "Salvo…" : "Salva nota"}
            </button>
          </div>
        </div>
      ) : user.note ? (
        <div className="stack" style={{ gap: 4 }}>
          <p className="lb" style={{ margin: 0 }}>
            Nota del coordinamento
          </p>
          <p className="signed">{user.note}</p>
        </div>
      ) : null}

        {!isAdmin && (
          <>
            <div className="actions" style={{ padding: 0 }}>
              <a
                className="btn btn-sm"
                href={`https://www.google.com/maps/dir/?api=1&origin=My+Location&destination=${user.lat},${user.lng}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Naviga con Maps
              </a>
            </div>
            <p className="pgtxt mono">
              Destinazione inviata a Maps: {Number(user.lat).toFixed(5)}, {Number(user.lng).toFixed(5)}
            </p>
          </>
        )}
        {form}
        {isAdmin && (
          <div className="stack">
            <h3>Azioni coordinamento</h3>
            {deleted ? (
              <>
                <p className="signed">
                  Utenza eliminata: non è visibile su mappa ed elenchi.
                  {user.suspension_note ? <> Motivo: {user.suspension_note}</> : null}
                </p>
                <div className="actions" style={{ padding: 0 }}>
                  <button
                    className="btn btn-ok btn-sm"
                    type="button"
                    onClick={() => onRestore && onRestore()}
                  >
                    Ripristina
                  </button>
                </div>
                <p className="notice">
                  Puoi riportare l&apos;utenza in elenco con «Ripristina». La rivedrai su mappa
                  anche con il flag «Eliminati» attivo.
                </p>
              </>
            ) : (
              <>
                {suspended ? (
                  <p className="signed">
                    Utenza sospesa: non è visibile su mappa ed elenchi.
                    {user.suspension_note ? <> Motivo: {user.suspension_note}</> : null}
                  </p>
                ) : null}
                {actOp ? (
                  <div className="stack" style={{ gap: 8 }}>
                    <label className="lb" htmlFor="act-note">
                      Motivazione (facoltativa)
                    </label>
                    <textarea
                      id="act-note"
                      rows={2}
                      value={actNote}
                      placeholder={`Motivo della ${actOp === "delete" ? "eliminazione" : "sospensione"}…`}
                      onChange={(e) => setActNote(e.target.value)}
                    />
                    <div className="actions" style={{ padding: 0 }}>
                      <button
                        className={`btn btn-sm ${actOp === "delete" ? "btn-danger" : "btn-primary"}`}
                        type="button"
                        disabled={actBusy}
                        onClick={runAct}
                      >
                        {actBusy
                          ? "Attendo…"
                          : actOp === "delete"
                            ? "Sì, elimina"
                            : "Conferma sospensione"}
                      </button>
                      <button className="btn btn-sm" type="button" onClick={closeAct}>
                        Annulla
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="actions" style={{ padding: 0 }}>
                    {suspended ? (
                      <button
                        className="btn btn-ok btn-sm"
                        type="button"
                        onClick={() => onResume && onResume()}
                      >
                        Riattiva
                      </button>
                    ) : (
                      <button className="btn btn-sm" type="button" onClick={() => openAct("suspend")}>
                        Sospendi
                      </button>
                    )}
                    <button
                      className="btn btn-danger btn-sm"
                      type="button"
                      onClick={() => openAct("delete")}
                    >
                      Elimina
                    </button>
                  </div>
                )}
                <p className="notice">
                  Sospendere nasconde l&apos;utenza da mappa ed elenchi ed è reversibile (Riattiva).
                  Eliminare la nasconde e la sposta fra gli «Eliminati» su mappa: potrai sempre
                  ripristinarla dalla sua scheda.
                </p>
              </>
            )}
          </div>
        )}
        {hist}
      </div>
    );
}
