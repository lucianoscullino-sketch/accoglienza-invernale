"use client";

// Scheda di un utente regolare: descrizione, esito di stasera (firmato) e uscite precedenti.

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
}: {
  user: ServiceUser;
  status: Status;
  tonight: DailyLog | null;
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
  }) => Promise<void>;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const [busy, setBusy] = useState(false);
  const vref = useRef<EntryValues>(entryFrom(tonight));
  // Valori dell'ultimo salvataggio (o iniziali): servono a capire se ci sono modifiche
  const baseRef = useRef<EntryValues>(entryFrom(tonight));
  const [entryDirty, setEntryDirty] = useState(false);

  // Modifica dati anagrafici
  const [editing, setEditing] = useState(false);
  const [edName, setEdName] = useState(user.name);
  const [edDesc, setEdDesc] = useState(user.description || "");
  const [edLat, setEdLat] = useState(String(user.lat));
  const [edLng, setEdLng] = useState(String(user.lng));
  const [edNote, setEdNote] = useState(user.note || "");
  const [editBusy, setEditBusy] = useState(false);
  const [editErr, setEditErr] = useState("");

  const dataDirty =
    editing &&
    (edName !== user.name ||
      edDesc !== (user.description || "") ||
      edLat !== String(user.lat) ||
      edLng !== String(user.lng) ||
      (isAdmin && edNote !== (user.note || "")));
  const dirty = entryDirty || dataDirty;

  // Comunica al genitore se ci sono modifiche non salvate
  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

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
          <div className="meta">
            <span className={tagCls}>{ST_LABEL[status]}</span>
          </div>
        </div>
        <p className="desc">{user.description || "Nessuna descrizione."}</p>
        <p className="pgtxt mono">
          Destinazione inviata a Maps: {Number(user.lat).toFixed(5)}, {Number(user.lng).toFixed(5)}
        </p>
        {form}
        {hist}

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
                  setEditErr("");
                  setEditing(true);
                }}
              >
                {myOrg && user.created_by_org === myOrg ? "Modifica i tuoi dati" : "Modifica utente"}
              </button>
            ) : (
              <>
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
                    } = { name: edName.trim(), description: edDesc.trim(), lat, lng };
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
                    <input
                      className="input"
                      value={edName}
                      onChange={(e) => setEdName(e.target.value)}
                      required
                    />
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
                    <button
                      className="btn btn-primary"
                      type="submit"
                      disabled={editBusy}
                    >
                      {editBusy ? "Salvo…" : "Salva modifiche"}
                    </button>
                    <button
                      className="btn btn-sm"
                      type="button"
                      onClick={() => setEditing(false)}
                    >
                      Annulla
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        )}
      </div>
    </>
  );
}