"use client";

import { useState, useEffect } from "react";
import type { Org, Proposal, ServiceUser, Stop } from "@/lib/types";
import { orgName } from "@/lib/format";

interface StopDetailProps {
  stop: Stop;
  users: ServiceUser[];
  proposals: Proposal[];
  orgs: Org[];
  isAdmin: boolean;
  canAddUser: boolean;
  myOrg: string | null;
  inactiveUsers?: ServiceUser[];
  onOpenMap: (lat: number, lng: number, label: string) => void;
  onSaveStop: (patch: { name: string; lat: number; lng: number; note: string }) => Promise<void>;
  onSuspend: (note: string) => Promise<void>;
  onRestore: () => Promise<void>;
  onDelete: (note: string) => Promise<void>;
  onAddUser?: (values: { name: string; desc: string; multiple: boolean }) => Promise<void>;
  onOpenUser?: (userId: string) => void;
  onOpenProp?: (propId: string) => void;
  onEditChange?: (editing: boolean) => void;
}

export default function StopDetail({
  stop, users, proposals, orgs, isAdmin, canAddUser, myOrg, onOpenMap,
  onOpenProp,
  onSaveStop, onSuspend, onRestore, onDelete, onAddUser, onOpenUser, onEditChange, inactiveUsers = [],
}: StopDetailProps) {
  const [busy, setBusy] = useState<"" | "susp" | "rest" | "del" | "save" | "add">("");
  const [confirm, setConfirm] = useState(false);
  const [edit, setEdit] = useState(false);
  const [edName, setEdName] = useState(stop.name);
  const [edLat, setEdLat] = useState(String(stop.lat));
  const [edLng, setEdLng] = useState(String(stop.lng));
  const [edNote, setEdNote] = useState(stop.note || "");
  const [editErr, setEditErr] = useState("");
  const [addUserMulti, setAddUserMulti] = useState(false);
  const [saccoChecked, setSaccoChecked] = useState(false);
  const [copertaChecked, setCopertaChecked] = useState(false);
  const [saccoQty, setSaccoQty] = useState("");
  const [copertaQty, setCopertaQty] = useState("");


  // Sincronizza le coordinate quando la tappa viene spostata dal pin sulla mappa principale
  useEffect(() => {
    setEdLat(String(stop.lat));
    setEdLng(String(stop.lng));
  }, [stop.lat, stop.lng]);
  const [manageOpen, setManageOpen] = useState(false);
  const [addingUser, setAddingUser] = useState(false);
  const [addUserName, setAddUserName] = useState("");
  const [addUserDesc, setAddUserDesc] = useState("");
  const [addUserErr, setAddUserErr] = useState("");
  const empty = users.length === 0 && proposals.length === 0;
  const canManage = isAdmin;

  async function doAddUser() {
    if (!onAddUser || !addUserName.trim()) return;
    setBusy("add");
    setAddUserErr("");
    try {
      await onAddUser({ name: addUserName.trim(), desc: addUserDesc.trim(), multiple: addUserMulti });
      setAddingUser(false);
      setAddUserName("");
      setAddUserDesc("");
      setAddUserMulti(false);
    } catch (e) {
      // Mostra errore reale in console per il debug
    console.error("Errore add user:", e);
    // Mostra l'errore reale di Supabase all'utente (più informativo del messaggio generico)
    setAddUserErr(e instanceof Error ? e.message : "Errore nella creazione");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="detail stack">
      <div className="actions" style={{ padding: 0, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        {!isAdmin && stop.lat !== 0 && (
          <button className="btn btn-sm" type="button" onClick={() => onOpenMap(stop.lat, stop.lng, stop.name)}>
            Naviga con Maps
          </button>
        )}
        {canManage && !confirm && !edit && (
          <button className="btn btn-sm" type="button" onClick={() => setManageOpen((v) => !v)}>
            Gestisci tappa
          </button>
        )}
        {canAddUser && !confirm && !edit && (
          <button
            className="btn btn-sm"
            type="button"
            onClick={() => { setAddingUser(true); setAddUserErr(""); }}
            style={{ background: "#0f766e", color: "#fff", border: "none" }}
          >
            Aggiungi utente
          </button>
        )}
            {stop.status === "suspended" && empty && !confirm && !edit ? (
              <button className="btn btn-sm btn-ok" type="button" disabled={busy === "rest"} onClick={() => onRestore().finally(() => setBusy(""))}>
                {busy === "rest" ? "Ripristino…" : "Riattiva tappa"}
              </button>
            ) : null}
          </div>

      {canManage && !confirm && !edit && manageOpen ? (
        <div className="stack" style={{ gap: 6, padding: 8, border: "1px solid var(--line)", borderRadius: 8, marginTop: 4 }}>
          <button className="btn btn-sm" type="button" onClick={() => { setEdit(true); onEditChange?.(true); setManageOpen(false); }}>Modifica tappa</button>
          {empty ? (
            <>
              <button className="btn btn-sm btn-warning" type="button" disabled={busy === "susp"} onClick={() => setConfirm(true)}>
                {busy === "susp" ? "Sospendo…" : "Sospendi tappa"}
              </button>
              <button className="btn btn-sm btn-danger" type="button" disabled={busy === "del"} onClick={() => setConfirm(true)}>
                {busy === "del" ? "Elimino…" : "Elimina tappa"}
              </button>
            </>
          ) : null}
        </div>
      ) : null}

      {addingUser && canAddUser && onAddUser ? (
        <div className="stack" style={{ gap: 8, marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--line)" }}>
          <h4 className="pgtxt" style={{ margin: 0 }}>Nuovo utente in questa tappa</h4>
          <div>
            <label className="lb" htmlFor="add-user-name">Nome / nickname</label>
            <input id="add-user-name" value={addUserName} onChange={(e) => setAddUserName(e.target.value)} />
          </div>
          <div>
            <label className="lb" htmlFor="add-user-desc">Descrizione / dove dorme</label>
            <label className="check">
            <input type="checkbox" checked={addUserMulti} onChange={(e) => setAddUserMulti(e.target.checked)} />{" "}
            Utenti multipli (più persone insieme)
          </label>
            <textarea id="add-user-desc" rows={2} value={addUserDesc} onChange={(e) => setAddUserDesc(e.target.value)} />
          </div>
          {addUserErr ? <p className="notice" style={{ color: "var(--danger)" }}>{addUserErr}</p> : null}
          <div className="actions" style={{ padding: 0, display: "flex", gap: 8 }}>
            <button
              className="btn btn-primary btn-sm"
              type="button"
              disabled={busy === "add" || !addUserName.trim()}
              onClick={doAddUser}
            >
              {busy === "add" ? "Creo…" : "Crea utente"}
            </button>
            <button className="btn btn-sm" type="button" onClick={() => { setAddingUser(false); setAddUserErr(""); setAddUserName(""); setAddUserDesc(""); }}>
              Annulla
            </button>
          </div>
        </div>
      ) : null}

      {confirm && empty && canManage ? (
        <div className="stack" style={{ gap: 6 }}>
          <p className="notice">L&rsquo;operazione è consentita solo perché la tappa è vuota (nessun utente assegnato e nessun candidato). I candidati eventualmente presenti verranno sganciati e restano fuori tappa.</p>
          <div className="actions" style={{ padding: 0 }}>
            <button className="btn btn-danger btn-sm" type="button" disabled={busy === "susp" || busy === "del"} onClick={() => { setBusy("susp"); onSuspend("Sospesa dal coordinamento").finally(() => { setBusy(""); setConfirm(false); }); }}>
              {busy === "susp" ? "Sospendo…" : "Sì, sospendi"}
            </button>
            <button className="btn btn-danger btn-sm" type="button" disabled={busy === "susp" || busy === "del"} onClick={() => { setBusy("del"); onDelete("Eliminata dal coordinamento").finally(() => { setBusy(""); setConfirm(false); }); }}>
              {busy === "del" ? "Elimino…" : "Sì, elimina"}
            </button>
            <button className="btn btn-sm" type="button" onClick={() => setConfirm(false)}>Annulla</button>
          </div>
        </div>
      ) : null}
      <div className="stack" style={{ gap: 8 }}>
        <p className="pgtxt">{stop.lat.toFixed(5)}, {stop.lng.toFixed(5)}{stop.note ? ` · ${stop.note}` : ""}</p>
        <h4 className="pgtxt" style={{ margin: "12px 0 4px" }}>Utenti assegnati ({users.length})</h4>
        {users.length === 0 ? (
          <p className="notice">Nessun utente assegnato a questa tappa.</p>
        ) : (
          <ul className="list" style={{ gap: 0 }}>
            {users.map((u) => (
              <li key={u.id} className="calrow" style={{ cursor: "pointer" }} onClick={() => onOpenUser?.(u.id)}>
                <span
                  className="caldate"
                  style={{
                    fontSize: 16,
                    fontWeight: 600,
                    textDecoration: "underline",
                    color: u.created_by_org === myOrg ? "#0f766e" : "#1e293b",
                    cursor: "pointer",
                  }}
                >
                  {u.name}
                  {u.multiple ? " (multipli)" : ""}
                </span>
                <span className="pgtxt">{u.description}</span>
              </li>
            ))}
          </ul>
        )}

        {isAdmin && inactiveUsers.length > 0 && (
          <>
            <h4 className="pgtxt" style={{ margin: "12px 0 4px" }}>
              Utenti sospesi o eliminati ({inactiveUsers.length})
            </h4>
            <ul className="list" style={{ gap: 0 }}>
              {inactiveUsers.map((u) => (
                <li key={u.id} className="calrow" style={{ cursor: "pointer" }} onClick={() => onOpenUser?.(u.id)}>
                  <span
                    className="caldate"
                    style={{ fontSize: 16, fontWeight: 600, textDecoration: "underline", color: "#6b7280", cursor: "pointer" }}
                  >
                    {u.name}
                  </span>
                  <span className="pgtxt">
                    {u.deleted ? "eliminato" : "sospeso"}
                    {u.suspension_note ? ` · ${u.suspension_note}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}

        <h4 className="pgtxt" style={{ margin: "12px 0 4px" }}>Candidati di questa tappa ({proposals.length})</h4>
        {proposals.length === 0 ? (
        <div style={{ width: "100%" }}>
          
          {/* === CAMPO NOTE (in alto, larghezza piena) === */}
          <div style={{ marginBottom: 12, border: "1px solid var(--line)", borderRadius: 6, padding: 12, background: "#f8fafc" }}>
            <label className="lb" style={{ display: "block", marginBottom: 6, fontSize: 13, fontWeight: 600 }}>
              Note sulla tappa
            </label>
            <textarea
              id="stop-note"
              rows={3}
              value={edNote}
              onChange={(e) => setEdNote(e.target.value)}
              placeholder="Aggiungi una nota alla tappa…"
              style={{
                width: "100%",
                border: "1px solid var(--line)",
                borderRadius: 4,
                padding: 6,
                fontSize: 13,
                boxSizing: "border-box",
                resize: "vertical",
              }}
            />
          </div>

          {/* === RIGA SOTTO: tabella a sinistra (occupa tutto lo spazio), tasto Salva a destra === */}
          <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
            
            {/* Tabella beni a sinistra - occupa tutto lo spazio disponibile */}
            <div style={{ 
              flex: 1, 
              border: "1px solid var(--line)", 
              borderRadius: 6, 
              background: "#f8fafc", 
              padding: 8 
            }}>
              <h4 className="pgtxt" style={{ margin: "0 0 8px 0", fontSize: 14, fontWeight: 600 }}>
                Beni forniti da consuntivare
              </h4>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr>
                    <th
                      style={{
                        textAlign: "left",
                        padding: "4px 6px",
                        borderBottom: "1px solid #cbd5e1",
                        fontSize: 12,
                        fontWeight: 600,
                        color: "#64748b",
                      }}
                    >
                      Bene
                    </th>
                    <th
                      style={{
                        textAlign: "center",
                        padding: "4px 6px",
                        borderBottom: "1px solid #cbd5e1",
                        fontSize: 12,
                        fontWeight: 600,
                        color: "#64748b",
                      }}
                    >
                      Sacco a pelo
                    </th>
                    <th
                      style={{
                        textAlign: "center",
                        padding: "4px 6px",
                        borderBottom: "1px solid #cbd5e1",
                        fontSize: 12,
                        fontWeight: 600,
                        color: "#64748b",
                      }}
                    >
                      Coperta
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {/* Riga spunte */}
                  <tr>
                    <td
                      style={{
                        padding: "4px 6px",
                        borderBottom: "1px solid #cbd5e1",
                        fontWeight: 600,
                        fontSize: 12,
                        color: "#334155",
                      }}
                    >
                      Fornito
                    </td>
                    <td style={{ textAlign: "center", padding: "4px 6px" }}>
                      <input
                        type="checkbox"
                        checked={saccoChecked}
                        onChange={() => setSaccoChecked(!saccoChecked)}
                        style={{ width: 16, height: 16, cursor: "pointer" }}
                      />
                    </td>
                    <td style={{ textAlign: "center", padding: "4px 6px" }}>
                      <input
                        type="checkbox"
                        checked={copertaChecked}
                        onChange={() => setCopertaChecked(!copertaChecked)}
                        style={{ width: 16, height: 16, cursor: "pointer" }}
                      />
                    </td>
                  </tr>

                  {/* Riga quantità (visibile/editabile solo se spunta selezionata) */}
                  <tr>
                    <td
                      style={{
                        padding: "4px 6px",
                        borderBottom: "1px solid #cbd5e1",
                        fontWeight: 600,
                        fontSize: 12,
                        color: "#334155",
                      }}
                    >
                      Quantità (N)
                    </td>
                    <td style={{ textAlign: "center", padding: "4px 6px" }}>
                      <input
                        type="number"
                        min="0"
                        disabled={!saccoChecked}
                        value={saccoQty}
                        onChange={(e) => setSaccoQty(e.target.value)}
                        placeholder="N"
                        style={{
                          width: "70px",
                          padding: "2px 4px",
                          border: "1px solid var(--line)",
                          borderRadius: 4,
                          fontSize: 13,
                          background: !saccoChecked ? "#e2e8f0" : "#ffffff",
                        }}
                      />
                    </td>
                    <td style={{ textAlign: "center", padding: "4px 6px" }}>
                      <input
                        type="number"
                        min="0"
                        disabled={!copertaChecked}
                        value={copertaQty}
                        onChange={(e) => setCopertaQty(e.target.value)}
                        placeholder="N"
                        style={{
                          width: "70px",
                          padding: "2px 4px",
                          border: "1px solid var(--line)",
                          borderRadius: 4,
                          fontSize: 13,
                          background: !copertaChecked ? "#e2e8f0" : "#ffffff",
                        }}
                      />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Tasto Salva a destra, in basso */}
            <div style={{ marginTop: "auto", marginLeft: "auto" }}>
              <button
                type="button"
                onClick={() => {
                  onSaveStop({
                    name: stop.name,
                    lat: stop.lat,
                    lng: stop.lng,
                    note: edNote,
                  });
                }}
                className="btn btn-primary btn-sm"
              >
                Salva
              </button>
            </div>

          </div>
        </div>


        ) : (
          <ul className="list" style={{ gap: 0 }}>
            {proposals.map((p) => (
              <li key={p.id} className="calrow">
                ...
              </li>
            ))}
          </ul>
        )}


        {canManage && edit ? (
          <form className="stack" style={{ gap: 8 }} onSubmit={(e) => {
            e.preventDefault(); setBusy("save");
            const n = Number(edLat); const g = Number(edLng);
            if (!Number.isFinite(n) || !Number.isFinite(g)) { setEditErr("Coordinate non valide"); setBusy(""); return; }
            onSaveStop({ name: edName, lat: n, lng: g, note: edNote }).finally(() => { setBusy(""); setEdit(false); onEditChange?.(false); });
          }}>
            <div><label className="lb" htmlFor="stop-edit-name">Nome tappa</label><input id="stop-edit-name" value={edName} onChange={(e) => setEdName(e.target.value)} /></div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div><label className="lb" htmlFor="stop-edit-lat">Latitudine</label><input id="stop-edit-lat" type="text" inputMode="decimal" value={edLat} onChange={(e) => setEdLat(e.target.value)} style={{ background: "#ffffff" }} /></div>
              <div><label className="lb" htmlFor="stop-edit-lng">Longitudine</label><input id="stop-edit-lng" type="text" inputMode="decimal" value={edLng} onChange={(e) => setEdLng(e.target.value)} style={{ background: "#ffffff" }} /></div>
            </div>
            <div><label className="lb" htmlFor="stop-edit-note">Nota</label><textarea id="stop-edit-note" rows={2} value={edNote} onChange={(e) => setEdNote(e.target.value)} /></div>
            {editErr ? <p className="notice" style={{ color: "var(--danger)" }}>{editErr}</p> : null}
            <div className="actions" style={{ padding: 0 }}>
              <button className="btn btn-primary btn-sm" type="submit" disabled={busy === "save"}>{busy === "save" ? "Salvo…" : "Salva tappa"}</button>
              <button className="btn btn-sm" type="button" disabled={busy === "save"} onClick={() => { setEdit(false); onEditChange?.(false); setEditErr(""); setAddUserMulti(false); }}>Annulla</button>
            </div>
          </form>
        ) : null}
      </div>
    </div>
  );
}
