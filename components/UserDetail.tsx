"use client";

// Scheda di un utente regolare: descrizione, esito di stasera (firmato), esito di ieri
// (modificabile fino alle 20:00) e uscite precedenti.

import { useEffect, useRef, useState } from "react";
import { EntryFields, entryFrom, type EntryValues } from "@/components/EntryFields";
import type { DailyLog, Org, ServiceUser, Status } from "@/lib/types";
import { ST_LABEL, fmtShort, fmtTime, orgName } from "@/lib/format";

const sameEntry = (a: EntryValues, b: EntryValues) =>
  a.found === b.found &&
  a.requested.trim() === b.requested.trim() &&
  a.note.trim() === b.note.trim() &&
  [...a.provided].sort().join("|") === [...b.provided].sort().join("|");

export default function UserDetail({
  user,
  status,
  tonight,
  yesterday,
  canEditYesterday,
  onSaveYesterday,
  past,
  canRecord,
  orgs,
  readOnlyMsg,
  onSave,
  onBack,
  isAdmin,
  canEditData,
  myOrg,
  onSaveUserData,
  onDirtyChange,
  onSuspend,
  onResume,
  onDelete,
  onRestore,
}: {
  user: ServiceUser;
  status: Status;
  tonight: DailyLog | null;
  yesterday?: DailyLog | null;
  canEditYesterday?: boolean;
  onSaveYesterday?: (v: EntryValues) => Promise<boolean | void>;
  past: DailyLog[];
  canRecord: boolean;
  orgs: Org[];
  readOnlyMsg: string;
  onSave: (v: EntryValues) => Promise<boolean | void>;
  onBack: () => void;
  isAdmin: boolean;
  canEditData: boolean;
  myOrg: string | null;
  onSaveUserData: (patch: {
    name: string;
    description: string;
    lat: number;
    lng: number;
    note?: string;
    multiple?: boolean;
  }) => Promise<void>;
  onDirtyChange?: (dirty: boolean) => void;
  onSuspend?: (note: string) => Promise<void>;
  onResume?: () => Promise<void>;
  onDelete?: (note: string) => Promise<void>;
  onRestore?: () => Promise<void>;
}) {
  // Esito di stasera
  const [busy, setBusy] = useState(false);
  const vref = useRef<EntryValues>(entryFrom(tonight));
  const baseRef = useRef<EntryValues>(entryFrom(tonight));
  const [entryDirty, setEntryDirty] = useState(false);

  // Esito di ieri
  const yvref = useRef<EntryValues>(entryFrom(yesterday));
  const ybaseRef = useRef<EntryValues>(entryFrom(yesterday));
  const [yDirty, setYDirty] = useState(false);
  const [yBusy, setYBusy] = useState(false);

  // Modifica dati anagrafici
  const [editing, setEditing] = useState(false);
  const [edName, setEdName] = useState(user.name);
  const [edDesc, setEdDesc] = useState(user.description || "");
  const [edLat, setEdLat] = useState(String(user.lat));
  const [edLng, setEdLng] = useState(String(user.lng));
  const [edNote, setEdNote] = useState(user.note || "");
  const [edMulti, setEdMulti] = useState(!!user.multiple);
  const [editBusy, setEditBusy] = useState(false);
  const [editErr, setEditErr] = useState("");

  // Sospensione / eliminazione (solo coordinamento)
  const [action, setAction] = useState<"" | "susp" | "del">("");
  const [actNote, setActNote] = useState("");
  const [actBusy, setActBusy] = useState(false);
  const isDeleted = !!user.deleted;
  const isSuspended = !user.active && !user.deleted;

  const dataDirty =
    editing &&
    (edName !== user.name ||
      edDesc !== (user.description || "") ||
      edLat !== String(user.lat) ||
      edLng !== String(user.lng) ||
      edMulti !== !!user.multiple ||
      (isAdmin && edNote !== (user.note || "")));
  const dirty = entryDirty || yDirty || dataDirty;

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  async function runAct(fn?: () => Promise<void>) {
    if (!fn) return;
    setActBusy(true);
    try {
      await fn();
    } finally {
      setActBusy(false);
    }
  }

  async function confirmAction() {
    setActBusy(true);
    try {
      if (action === "susp") await onSuspend?.(actNote.trim());
      else if (action === "del") await onDelete?.(actNote.trim());
      setAction("");
      setActNote("");
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
        const values = vref.current;
        onSave(values)
          .then((ok) => {
            if (ok !== false) {
              baseRef.current = values;
              setEntryDirty(false);
            }
          })
          .finally(() => setBusy(false));
      }}
    >
      <h3>Esito di stasera</h3>
      {tonight && (
        <p className="signed">
          Firmato da <strong>{orgName(tonight.org_id, orgs)}</strong>
          {tonight.created_at ? ` alle ${fmtTime(tonight.created_at)}` : ""}. Puoi modificarlo.
        </p>
      )}
      <EntryFields
        initial={entryFrom(tonight)}
        idPrefix="f"
        onValues={(v) => {
          vref.current = v;
          setEntryDirty(!sameEntry(v, baseRef.current));
        }}
      />
      {(() => {
        const unchanged = !!tonight && !entryDirty;
        return (
          <button
            className="btn btn-primary"
            type="submit"
            disabled={busy || unchanged}
            style={
              unchanged
                ? { background: "#fff", color: "#94a3b8", border: "1px solid #cbd5e1", cursor: "default" }
                : undefined
            }
          >
            {busy ? "Salvo…" : tonight ? "Aggiorna esito" : "Registra esito"}
          </button>
        );
      })()}
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

  const yForm =
    canEditYesterday && onSaveYesterday ? (
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          setYBusy(true);
          const values = yvref.current;
          onSaveYesterday(values)
            .then((ok) => {
              if (ok !== false) {
                ybaseRef.current = values;
                setYDirty(false);
              }
            })
            .finally(() => setYBusy(false));
        }}
      >
        <h3>Esito di ieri</h3>
        <p className="notice">Puoi modificarlo fino alle 20:00 di oggi.</p>
        {yesterday && (
          <p className="signed">
            Firmato da <strong>{orgName(yesterday.org_id, orgs)}</strong>
            {yesterday.created_at ? ` alle ${fmtTime(yesterday.created_at)}` : ""}.
          </p>
        )}
        <EntryFields
          initial={entryFrom(yesterday)}
          idPrefix="y"
          onValues={(v) => {
            yvref.current = v;
            setYDirty(!sameEntry(v, ybaseRef.current));
          }}
        />
        {(() => {
          const unchanged = !!yesterday && !yDirty;
          return (
            <button
              className="btn btn-primary"
              type="submit"
              disabled={yBusy || unchanged}
              style={
                unchanged
                  ? { background: "#fff", color: "#94a3b8", border: "1px solid #cbd5e1", cursor: "default" }
                  : undefined
              }
            >
              {yBusy ? "Salvo…" : yesterday ? "Aggiorna esito di ieri" : "Registra esito di ieri"}
            </button>
          );
        })()}
      </form>
    ) : null;

  const hist = past.length ? (
    <div className="stack">
      <h3>Uscite precedenti</h3>
      <ul className="hist">
        {past.map((l, i) => (
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
    </div>
  ) : null;

  return (
    <>
      <button className="back" type="button" onClick={onBack}>
        &larr; Torna all&apos;elenco
      </button>
      <div className="detail stack">
        <div>
          <h2>{user.name}</h2>
          <div className="meta" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <span className={tagCls}>{ST_LABEL[status]}</span>
            {user.multiple ? <span className="tag tag-muted">Utenti multipli</span> : null}
            {isDeleted ? (
              <span className="tag tag-muted">Eliminato</span>
            ) : isSuspended ? (
              <span className="tag tag-muted">Sospeso</span>
            ) : null}
          </div>
        </div>
        {(isSuspended || isDeleted) && user.suspension_note ? (
          <p className="notice">Motivo: {user.suspension_note}</p>
        ) : null}
        <p className="desc">{user.description || "Nessuna descrizione."}</p>
        <p className="pgtxt mono">
          Destinazione inviata a Maps: {Number(user.lat).toFixed(5)}, {Number(user.lng).toFixed(5)}
        </p>
        {form}
        {yForm}
        {hist}

        {/* --- Sospensione / eliminazione (solo coordinamento) --- */}
        {isAdmin && (
          <div className="stack" style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid #e2e8f0" }}>
            {isDeleted ? (
              <button
                className="btn btn-sm btn-ok"
                type="button"
                disabled={actBusy}
                onClick={() => runAct(onRestore)}
              >
                {actBusy ? "Ripristino…" : "Ripristina utente"}
              </button>
            ) : action ? (
              <div className="stack" style={{ gap: 8 }}>
                <p className="notice">
                  {action === "susp"
                    ? "L'utente non comparirà più negli elenchi e nelle uscite; potrai riattivarlo quando vuoi."
                    : "L'utente verrà nascosto da mappa ed elenchi; lo storico degli esiti resta e potrai ripristinarlo."}
                </p>
                <label className="lb" htmlFor="user-act-note">
                  Motivo (facoltativo)
                </label>
                <textarea
                  id="user-act-note"
                  rows={2}
                  value={actNote}
                  onChange={(e) => setActNote(e.target.value)}
                />
                <div className="actions" style={{ padding: 0, display: "flex", gap: 8 }}>
                  <button className="btn btn-danger btn-sm" type="button" disabled={actBusy} onClick={confirmAction}>
                    {actBusy ? "Attendo…" : action === "susp" ? "Sì, sospendi" : "Sì, elimina"}
                  </button>
                  <button
                    className="btn btn-sm"
                    type="button"
                    disabled={actBusy}
                    onClick={() => {
                      setAction("");
                      setActNote("");
                    }}
                  >
                    Annulla
                  </button>
                </div>
              </div>
            ) : (
              <div className="actions" style={{ padding: 0, display: "flex", gap: 8, flexWrap: "wrap" }}>
                {isSuspended ? (
                  <button
                    className="btn btn-sm btn-ok"
                    type="button"
                    disabled={actBusy}
                    onClick={() => runAct(onResume)}
                  >
                    {actBusy ? "Riattivo…" : "Riattiva utente"}
                  </button>
                ) : (
                  <button className="btn btn-sm btn-warning" type="button" onClick={() => setAction("susp")}>
                    Sospendi utente
                  </button>
                )}
                <button className="btn btn-sm btn-danger" type="button" onClick={() => setAction("del")}>
                  Elimina utente
                </button>
              </div>
            )}
          </div>
        )}

        {/* --- Modifica dati anagrafici (admin o associazione proponente) --- */}
        {canEditData && (
          <div className="stack" style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid #e2e8f0" }}>
            {!editing ? (
              <button
                className="btn btn-sm"
                type="button"
                onClick={() => {
                  setEdName(user.name);
                  setEdDesc(user.description || "");
                  setEdLat(String(user.lat));
                  setEdLng(String(user.lng));
                  setEdNote(user.note || "");
                  setEdMulti(!!user.multiple);
                  setEditErr("");
                  setEditing(true);
                }}
              >
                {myOrg && user.created_by_org === myOrg ? "Modifica i tuoi dati" : "Modifica utente"}
              </button>
            ) : (
              <form
                className="stack"
                style={{ gap: 8 }}
                onSubmit={(e) => {
                  e.preventDefault();
                  setEditErr("");
                  setEditBusy(true);
                  const lat = Number(edLat);
                  const lng = Number(edLng);
                  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
                    setEditErr("Coordinate non valide.");
                    setEditBusy(false);
                    return;
                  }
                  const patch: {
                    name: string;
                    description: string;
                    lat: number;
                    lng: number;
                    note?: string;
                    multiple?: boolean;
                  } = { name: edName.trim(), description: edDesc.trim(), lat, lng, multiple: edMulti };
                  if (isAdmin) patch.note = edNote.trim();
                  onSaveUserData(patch)
                    .then(() => {
                      setEditing(false);
                      setEditBusy(false);
                    })
                    .catch((err) => {
                      setEditErr(err instanceof Error ? err.message : "Errore nel salvataggio.");
                      setEditBusy(false);
                    });
                }}
              >
                <div>
                  <label className="lb">Nickname</label>
                  <input className="input" value={edName} onChange={(e) => setEdName(e.target.value)} required />
                </div>
                <div>
                  <label className="lb">Descrizione e punto in cui dorme</label>
                  <textarea
                    className="input"
                    rows={3}
                    value={edDesc}
                    onChange={(e) => setEdDesc(e.target.value)}
                  />
                </div>
                <label className="check">
                  <input type="checkbox" checked={edMulti} onChange={(e) => setEdMulti(e.target.checked)} />{" "}
                  Utenti multipli (più persone insieme)
                </label>
                <div style={{ display: "flex", gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <label className="lb">Latitudine</label>
                    <input
                      className="input"
                      type="number"
                      step="0.00001"
                      value={edLat}
                      onChange={(e) => setEdLat(e.target.value)}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label className="lb">Longitudine</label>
                    <input
                      className="input"
                      type="number"
                      step="0.00001"
                      value={edLng}
                      onChange={(e) => setEdLng(e.target.value)}
                    />
                  </div>
                </div>
                {isAdmin && (
                  <div>
                    <label className="lb">Nota del coordinamento</label>
                    <textarea
                      className="input"
                      rows={2}
                      value={edNote}
                      onChange={(e) => setEdNote(e.target.value)}
                    />
                  </div>
                )}
                {editErr && <p className="err">{editErr}</p>}
                <div className="actions" style={{ padding: 0, gap: 8 }}>
                  <button className="btn btn-primary" type="submit" disabled={editBusy}>
                    {editBusy ? "Salvo…" : "Salva modifiche"}
                  </button>
                  <button className="btn btn-sm" type="button" onClick={() => setEditing(false)}>
                    Annulla
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
      </div>
    </>
  );
}