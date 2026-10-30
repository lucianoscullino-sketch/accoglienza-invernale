"use client";

// Scheda di un utente regolare: descrizione, nota del coordinamento e uscite precedenti.

import { useRef, useState } from "react";
import type { DailyLog, Org, ServiceUser } from "@/lib/types";
import { fmtShort, orgName } from "@/lib/format";
import { openGoogleMaps } from "@/lib/maps";
import { EntryFields, entryFrom, type EntryValues } from "@/components/EntryFields";

export default function UserDetail({
  user,
  past,
  canEditNote,
  orgs,
  onSaveNote,
  isAdmin,
  suspended,
  deleted,
  onSuspend,
  onResume,
  onRestore,
  onDelete,
  myOrg,
  canEditData,
  editDeniedMsg,
  onSaveData,
  canRecord,
  todayLog,
  onSaveEntry,
  recordMsg,
  onReportFound,
}: {
  user: ServiceUser;
  past: DailyLog[];
  canEditNote: boolean;
  orgs: Org[];
  onSaveNote?: (note: string) => Promise<void>;
  isAdmin?: boolean;
  suspended?: boolean;
  deleted?: boolean;
  onSuspend?: (note: string) => Promise<void>;
  onResume?: () => Promise<void>;
  onRestore?: () => Promise<void>;
  onDelete?: (note: string) => Promise<void>;
  // Modifica dati anagrafici (nome, descrizione, posizione, nota): il tasto
  // resta sempre visibile in fondo alla scheda; l'abilitazione dipende dal
  // ruolo (coordinamento ovunque, associazioni solo sulle proprie utenze).
  myOrg?: string | null;
  canEditData?: boolean;
  editDeniedMsg?: string;
  onSaveData?: (patch: { name: string; description: string; lat: number; lng: number; note: string }) => Promise<void>;
  // Esito di stasera: solo l'associazione in uscita registra trovato/
  // fornito/richiesto/note; il coordinamento consulta ma non registra.
  // Questo fa diventare il pin verde o grigio.
  canRecord?: boolean;
  todayLog?: DailyLog | null;
  onSaveEntry?: (v: EntryValues) => Promise<void>;
  recordMsg?: string;
  // Segnalazione al coordinamento per utenti sospesi/eliminati ritrovati in
  // strada: registra il ritrovamento di oggi (log "trovato") senza riattivare
  // l'utenza (la riattivazione resta decisione del coordinamento).
  onReportFound?: () => Promise<void>;
}) {
  const [note, setNote] = useState(user.note || "");
  const [noteBusy, setNoteBusy] = useState(false);
  const [viewLog, setViewLog] = useState<number | null>(null);
  const [reportBusy, setReportBusy] = useState(false);

  // --- Modifica dati anagrafici: sempre visibile in fondo alla scheda ---
  // Coordinamento su tutte le utenze, associazioni solo sulle proprie.
  const resolvedCanEdit =
    typeof canEditData === "boolean"
      ? canEditData
      : !!isAdmin || (!!myOrg && !!user.created_by_org && user.created_by_org === myOrg);
  const [editing, setEditing] = useState(false);
  const [edName, setEdName] = useState(user.name);
  const [edDesc, setEdDesc] = useState(user.description || "");
  const [edLat, setEdLat] = useState(String(user.lat));
  const [edLng, setEdLng] = useState(String(user.lng));
  const [edNote, setEdNote] = useState(user.note || "");
  const [editErr, setEditErr] = useState("");
  const [editBusy, setEditBusy] = useState(false);

  // --- Esito di stasera (upsert su daily_logs, firmato da chi registra) ---
  const entryRef = useRef<EntryValues>(entryFrom(todayLog));
  const [entryBusy, setEntryBusy] = useState(false);

  function openEdit() {
    setEdName(user.name);
    setEdDesc(user.description || "");
    setEdLat(String(user.lat));
    setEdLng(String(user.lng));
    setEdNote(user.note || "");
    setEditErr("");
    setEditing(true);
  }

  async function submitEdit(e: React.FormEvent) {
    e.preventDefault();
    const name = edName.trim();
    if (!name) {
      setEditErr("Scrivi il nickname dell'utente.");
      return;
    }
    const lat = Number(String(edLat).replace(",", "."));
    const lng = Number(String(edLng).replace(",", "."));
    if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) {
      setEditErr("Coordinate non valide (latitudine -90…90, longitudine -180…180).");
      return;
    }
    setEditErr("");
    setEditBusy(true);
    try {
      if (onSaveData) await onSaveData({ name, description: edDesc.trim(), lat, lng, note: edNote });
      setEditing(false);
    } catch (err) {
      setEditErr(err instanceof Error ? err.message : "Salvataggio non riuscito.");
    } finally {
      setEditBusy(false);
    }
  }

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

  // Sintesi degli ultimi 3 giorni; da lì si apre il dettaglio di un report e
  // lo si scorre avanti/indietro per data fra tutti i report dell'utente.
  const last3 = past.slice(0, 3);
  const viewed = viewLog != null ? past[viewLog] : null;
  const stepLog = (d: number) =>
    setViewLog((v) => (v == null ? null : Math.min(past.length - 1, Math.max(0, v + d))));
  const hist = past.length ? (
    <div className="stack">
      <h3>Report giorni precedenti</h3>
      {viewed ? (
        <>
          <div className="h-top" style={{ alignItems: "center", gap: 8 }}>
            <button
              className="btn btn-sm"
              type="button"
              disabled={(viewLog ?? 0) <= 0}
              onClick={() => stepLog(-1)}
            >
              ← Precedente
            </button>
            <span className="mono" style={{ flex: 1, textAlign: "center" }}>
              {fmtShort(viewed.date)} · {(viewLog ?? 0) + 1}/{past.length}
            </span>
            <button
              className="btn btn-sm"
              type="button"
              disabled={(viewLog ?? 0) >= past.length - 1}
              onClick={() => stepLog(1)}
            >
              Successivo →
            </button>
          </div>
          <p className="signed">
            {viewed.found ? "Trovato" : "Non trovato"} · {orgName(viewed.org_id, orgs)}
          </p>
          {viewed.provided.length ? (
            <p>
              {viewed.found ? "Fornito" : "Lasciato sul posto"}:{" "}
              {viewed.provided.join(", ").toLowerCase()}
            </p>
          ) : null}
          {viewed.requested ? <p>Richiesto: {viewed.requested}</p> : null}
          {viewed.note ? <p className="h-note">{viewed.note}</p> : null}
          <div className="actions" style={{ padding: 0 }}>
            <button className="btn btn-sm" type="button" onClick={() => setViewLog(null)}>
              ← Torna all&apos;elenco
            </button>
          </div>
        </>
      ) : (
        <ul className="hist">
          {last3.map((l, i) => (
            <li key={l.id || i}>
              <div className="h-top">
                <span className="mono">{fmtShort(l.date)}</span>
                <span className="h-org">{orgName(l.org_id, orgs)}</span>
              </div>
              <p style={{ margin: 0 }}>
                {l.found ? "Trovato" : "Non trovato"}
                {l.provided.length ? " · " + l.provided.join(", ").toLowerCase() : ""}
              </p>
              <button className="linkbtn" type="button" onClick={() => setViewLog(i)}>
                Vedi dettaglio →
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  ) : null;

  return (
    <div className="detail stack">
      <div>
        <h2>{user.name}</h2>
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

        <div className="actions" style={{ padding: 0 }}>
          <button className="btn btn-sm" type="button" onClick={() => openGoogleMaps(user.lat, user.lng, user.name)}>
            Apri su Google Maps
          </button>
        </div>
        <p className="pgtxt mono">
          {Number(user.lat).toFixed(5)}, {Number(user.lng).toFixed(5)}
        </p>
        {suspended || deleted ? (
          onReportFound ? (
            <div className="stack">
              <h3>Utenza {deleted ? "eliminata" : "sospesa"}</h3>
              <p className="notice">
                Questa utenza non è attiva e non prevede il servizio di stasera. Se l&apos;hai
                trovata per strada, segnalalo al coordinamento: registreremo il ritrovamento
                di oggi come traccia per la riattivazione.
              </p>
              <div className="actions" style={{ padding: 0 }}>
                <button
                  className="btn btn-sm"
                  type="button"
                  disabled={reportBusy}
                  onClick={() => {
                    setReportBusy(true);
                    onReportFound().finally(() => setReportBusy(false));
                  }}
                >
                  {reportBusy ? "Invio…" : "Segnala al coordinamento: trovato"}
                </button>
              </div>
            </div>
          ) : null
        ) : canRecord ? (
          <div className="stack">
            <h3>Esito di stasera</h3>
            <form
              className="stack"
              onSubmit={(e) => {
                e.preventDefault();
                setEntryBusy(true);
                (onSaveEntry ? onSaveEntry(entryRef.current) : Promise.resolve()).finally(
                  () => setEntryBusy(false)
                );
              }}
            >
              <EntryFields
                initial={entryFrom(todayLog)}
                idPrefix="ue"
                onValues={(v) => (entryRef.current = v)}
              />
              <div className="actions" style={{ padding: 0 }}>
                <button className="btn btn-primary btn-sm" type="submit" disabled={entryBusy}>
                  {entryBusy ? "Salvo…" : todayLog ? "Aggiorna esito" : "Salva esito"}
                </button>
              </div>
            </form>
          </div>
        ) : (
          <p className="notice">
            {recordMsg || "Stasera non è a te questa uscita: chi è in turno registra l'esito."}
          </p>
        )}
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
              </>
            )}
          </div>
        )}
        {hist}
        <div className="stack">
          <h3>Modifica dati</h3>
          {editing ? (
            <form className="stack" style={{ gap: 8 }} onSubmit={submitEdit}>
              {editErr ? <p className="err">{editErr}</p> : null}
              <div>
                <label className="lb" htmlFor="user-edit-name">
                  Nickname (come vuole essere chiamato)
                </label>
                <input
                  id="user-edit-name"
                  type="text"
                  autoComplete="off"
                  value={edName}
                  onChange={(e) => setEdName(e.target.value)}
                />
              </div>
              <div>
                <label className="lb" htmlFor="user-edit-desc">
                  Descrizione e punto in cui dorme
                </label>
                <textarea
                  id="user-edit-desc"
                  rows={3}
                  value={edDesc}
                  onChange={(e) => setEdDesc(e.target.value)}
                />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <div>
                  <label className="lb" htmlFor="user-edit-lat">
                    Latitudine
                  </label>
                  <input
                    id="user-edit-lat"
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    value={edLat}
                    onChange={(e) => setEdLat(e.target.value)}
                  />
                </div>
                <div>
                  <label className="lb" htmlFor="user-edit-lng">
                    Longitudine
                  </label>
                  <input
                    id="user-edit-lng"
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    value={edLng}
                    onChange={(e) => setEdLng(e.target.value)}
                  />
                </div>
              </div>
              {(isAdmin || resolvedCanEdit) ? (
                <div>
                  <label className="lb" htmlFor="user-edit-note">
                    Nota del coordinamento (visibile a tutte le associazioni)
                  </label>
                  <textarea
                    id="user-edit-note"
                    rows={2}
                    value={edNote}
                    placeholder="Es. avvicinare con cautela, non accetta cibo, chiamare i servizi sociali…"
                    onChange={(e) => setEdNote(e.target.value)}
                  />
                </div>
              ) : null}
              <div className="actions" style={{ padding: 0 }}>
                <button className="btn btn-primary btn-sm" type="submit" disabled={editBusy}>
                  {editBusy ? "Salvo…" : "Salva modifiche"}
                </button>
                <button
                  className="btn btn-sm"
                  type="button"
                  disabled={editBusy}
                  onClick={() => {
                    setEditing(false);
                    setEditErr("");
                  }}
                >
                  Annulla
                </button>
              </div>
            </form>
          ) : (
            <>
              <div className="actions" style={{ padding: 0 }}>
                <button
                  className="btn btn-sm"
                  type="button"
                  disabled={!resolvedCanEdit}
                  title={
                    resolvedCanEdit
                      ? "Modifica nome, descrizione, posizione e nota"
                      : (editDeniedMsg ||
                          "Solo il coordinamento o l'associazione che ha creato questa utenza può modificarne i dati.")
                  }
                  onClick={openEdit}
                >
                  Modifica
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    );
}
