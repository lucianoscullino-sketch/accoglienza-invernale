"use client";

// Scheda di un utente regolare: descrizione, nota del coordinamento e uscite precedenti.

import { useState } from "react";
import type { DailyLog, Org, ServiceUser } from "@/lib/types";
import { fmtShort, orgName } from "@/lib/format";

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
}) {
  const [note, setNote] = useState(user.note || "");
  const [noteBusy, setNoteBusy] = useState(false);
  const [showAllPast, setShowAllPast] = useState(false);

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
              {!resolvedCanEdit ? (
                <p className="notice">
                  {editDeniedMsg ||
                    "Solo il coordinamento o l'associazione che ha creato questa utenza può modificarne i dati."}
                </p>
              ) : null}
            </>
          )}
        </div>
      </div>
    );
}
