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
  orgs,
  readOnlyMsg,
  onSave,
}: {
  user: ServiceUser;
  status: Status;
  tonight: DailyLog | null;
  past: DailyLog[];
  canRecord: boolean;
  orgs: Org[];
  readOnlyMsg: string;
  onSave: (v: EntryValues) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [showAllPast, setShowAllPast] = useState(false);
  const vref = useRef<EntryValues>(entryFrom(tonight));

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
        {form}
        {hist}
      </div>
    );
}
