"use client";

import { useState } from "react";
import type { Org, Proposal, ServiceUser, Stop } from "@/lib/types";
import { orgName } from "@/lib/format";

interface StopDetailProps {
  stop: Stop;
  users: ServiceUser[];
  proposals: Proposal[];
  orgs: Org[];
  isAdmin: boolean;
  onOpenMap: (lat: number, lng: number, label: string) => void;
  onSaveStop: (patch: { name: string; lat: number; lng: number; note: string }) => Promise<void>;
  onSuspend: (note: string) => Promise<void>;
  onRestore: () => Promise<void>;
  onDelete: (note: string) => Promise<void>;
  onAddUser?: (values: { name: string; desc: string }) => Promise<void>;
  onMarkServed?: (stopId: string) => Promise<void>;
  onOpenUser?: (userId: string) => void;
}

export default function StopDetail({
  stop, users, proposals, orgs, isAdmin, onOpenMap,
  onSaveStop, onSuspend, onRestore, onDelete, onAddUser, onMarkServed, onOpenUser,
}: StopDetailProps) {
  const [busy, setBusy] = useState<"" | "susp" | "rest" | "del" | "save" | "add">("");
  const [confirm, setConfirm] = useState(false);
  const [edit, setEdit] = useState(false);
  const [edName, setEdName] = useState(stop.name);
  const [edLat, setEdLat] = useState(String(stop.lat));
  const [edLng, setEdLng] = useState(String(stop.lng));
  const [edNote, setEdNote] = useState(stop.note || "");
  const [editErr, setEditErr] = useState("");
  const [manageOpen, setManageOpen] = useState(false);
  const [addingUser, setAddingUser] = useState(false);
  const [addUserName, setAddUserName] = useState("");
  const [addUserDesc, setAddUserDesc] = useState("");
  const [addUserErr, setAddUserErr] = useState("");
  const empty = users.length === 0 && proposals.length === 0;
  const statusLabel = { active: "Attiva", suspended: "Sospesa", deleted: "Eliminata" }[stop.status];
  const canManage = isAdmin;

  async function doAddUser() {
    if (!onAddUser || !addUserName.trim()) return;
    setBusy("add");
    setAddUserErr("");
    try {
      await onAddUser({ name: addUserName.trim(), desc: addUserDesc.trim() });
      setAddingUser(false);
      setAddUserName("");
      setAddUserDesc("");
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
        {!isAdmin && (
          <button className="btn btn-sm" type="button" onClick={() => onOpenMap(stop.lat, stop.lng, stop.name)}>
            Naviga con Maps
          </button>
        )}
        {canManage && !confirm && !edit ? (
          <>
            <button className="btn btn-sm" type="button" onClick={() => setManageOpen((v) => !v)}>Gestisci tappa</button>
            <button
              className="btn btn-sm"
              type="button"
              onClick={() => { setAddingUser(true); setAddUserErr(""); }}
              style={{ background: "#0f766e", color: "#fff", border: "none" }}
            >
              Aggiungi utente
            </button>
            {!isAdmin && users.length === 0 ? (
              <>
                <button className="btn btn-sm btn-success" type="button" disabled={busy === "susp"} onClick={() => onMarkServed?.(stop.id)}>
                  {busy === "susp" ? "Servo…" : "Tappa servita"}
                </button>
              </>
            ) : null}
            {stop.status === "suspended" && empty ? (
              <button className="btn btn-sm btn-ok" type="button" disabled={busy === "rest"} onClick={() => onRestore().finally(() => setBusy(""))}>
                {busy === "rest" ? "Ripristino…" : "Riattiva tappa"}
              </button>
            ) : null}
          </>
        ) : null}
      </div>

      {canManage && !confirm && !edit && manageOpen ? (
        <div className="stack" style={{ gap: 6, padding: 8, border: "1px solid var(--line)", borderRadius: 8, marginTop: 4 }}>
          <button className="btn btn-sm" type="button" onClick={() => { setEdit(true); setManageOpen(false); }}>Modifica tappa</button>
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

      {addingUser && canManage && onAddUser ? (
        <div className="stack" style={{ gap: 8, marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--line)" }}>
          <h4 className="pgtxt" style={{ margin: 0 }}>Nuovo utente in questa tappa</h4>
          <div>
            <label className="lb" htmlFor="add-user-name">Nome / nickname</label>
            <input id="add-user-name" value={addUserName} onChange={(e) => setAddUserName(e.target.value)} />
          </div>
          <div>
            <label className="lb" htmlFor="add-user-desc">Descrizione / dove dorme</label>
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
        <h3 style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {stop.name}
        </h3>
        <p className="pgtxt">{stop.lat.toFixed(5)}, {stop.lng.toFixed(5)}{stop.note ? ` · ${stop.note}` : ""}</p>

        <h4 className="pgtxt" style={{ margin: "12px 0 4px" }}>Utenti assegnati ({users.length})</h4>
        {users.length === 0 ? (
          <p className="notice">Nessun utente assegnato a questa tappa.</p>
        ) : (
          <ul className="list" style={{ gap: 0 }}>
            {users.map((u) => (
              <li key={u.id} className="calrow" style={{ cursor: "pointer" }} onClick={() => onOpenUser?.(u.id)}>
                <span className="caldate" style={{ fontSize: 16, fontWeight: 600 }} onMouseEnter={(e) => (e.currentTarget.style.textDecoration = "underline")} onMouseLeave={(e) => (e.currentTarget.style.textDecoration = "none")}>{u.name}</span>
                <span className="pgtxt">{u.description}</span>
                <button className="btn btn-sm" type="button" onClick={(e) => { e.stopPropagation(); onOpenMap(u.lat, u.lng, u.name); }}>Naviga con Maps</button>
              </li>
            ))}
          </ul>
        )}

        <h4 className="pgtxt" style={{ margin: "12px 0 4px" }}>Candidati di questa tappa ({proposals.length})</h4>
        {proposals.length === 0 ? (
          <p className="notice">Nessun candidato assegnato a questa tappa.</p>
        ) : (
          <ul className="list" style={{ gap: 0 }}>
            {proposals.map((p) => (
              <li key={p.id} className="calrow">
                <span className="caldate">{p.name}</span>
                <span className="pgtxt">{orgName(p.proposed_by, orgs)} · {p.status === "pending" ? "in attesa" : p.status === "validated" ? "validata" : "rifiutata"}</span>
                <button className="btn btn-sm" type="button" onClick={() => onOpenMap(p.lat, p.lng, p.name)}>Naviga con Maps</button>
              </li>
            ))}
          </ul>
        )}

        {canManage && edit ? (
          <form className="stack" style={{ gap: 8 }} onSubmit={(e) => {
            e.preventDefault(); setBusy("save");
            const n = Number(edLat); const g = Number(edLng);
            if (!Number.isFinite(n) || !Number.isFinite(g)) { setEditErr("Coordinate non valide"); setBusy(""); return; }
            onSaveStop({ name: edName, lat: n, lng: g, note: edNote }).finally(() => { setBusy(""); setEdit(false); });
          }}>
            <div><label className="lb" htmlFor="stop-edit-name">Nome tappa</label><input id="stop-edit-name" value={edName} onChange={(e) => setEdName(e.target.value)} /></div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div><label className="lb" htmlFor="stop-edit-lat">Latitudine</label><input id="stop-edit-lat" type="text" inputMode="decimal" value={edLat} onChange={(e) => setEdLat(e.target.value)} /></div>
              <div><label className="lb" htmlFor="stop-edit-lng">Longitudine</label><input id="stop-edit-lng" type="text" inputMode="decimal" value={edLng} onChange={(e) => setEdLng(e.target.value)} /></div>
            </div>
            <div><label className="lb" htmlFor="stop-edit-note">Nota</label><textarea id="stop-edit-note" rows={2} value={edNote} onChange={(e) => setEdNote(e.target.value)} /></div>
            {editErr ? <p className="notice" style={{ color: "var(--danger)" }}>{editErr}</p> : null}
            <div className="actions" style={{ padding: 0 }}>
              <button className="btn btn-primary btn-sm" type="submit" disabled={busy === "save"}>{busy === "save" ? "Salvo…" : "Salva tappa"}</button>
              <button className="btn btn-sm" type="button" disabled={busy === "save"} onClick={() => { setEdit(false); setEditErr(""); }}>Annulla</button>
            </div>
          </form>
        ) : null}
      </div>
    </div>
  );
}
