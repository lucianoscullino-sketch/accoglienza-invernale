"use client";

// Menu speciale del coordinamento (solo admin). Raggruppa in un unico posto:
//  - Associazioni: crea / rinomina / elimina le organizzazioni.
//  - Account: associa un profilo a un'organizzazione, ne cambia ruolo o nome.
//  - Calendario e Report: riuso delle viste esistenti, già limitate all'admin.
// Le scritture passano dal client Supabase: la sicurezza è garantita dalle
// policy RLS ("orgs admin write" e "profiles admin update").

import { useState } from "react";
import type {
  CalendarOverride,
  DailyLog,
  Org,
  Profile,
  Proposal,
  ServiceUser,
  Settings,
} from "@/lib/types";
import CalendarView from "@/components/CalendarView";
import ReportView from "@/components/ReportView";
import PanelHeader from "@/components/PanelHeader";
import { supabase } from "@/lib/supabase";
import { orgName } from "@/lib/format";

type Section = "associazioni" | "account" | "utenze" | "calendario" | "report";

const slug = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || ("org-" + Math.random().toString(36).slice(2, 8));

// Form di conferma per sospensione/eliminazione: textarea motivazione
// (facoltativa) più i pulsanti di azione. Usato nella sezione "Utenze".
function NoteConfirm({
  what,
  danger,
  busy,
  busyKey,
  actNote,
  setActNote,
  onCancel,
  onGo,
}: {
  what: string;
  danger?: boolean;
  busy: string;
  busyKey: string;
  actNote: string;
  setActNote: (v: string) => void;
  onCancel: () => void;
  onGo: () => void;
}) {
  return (
    <div className="stack" style={{ gap: 8 }}>
      <label className="lb" htmlFor={`note-${busyKey}`}>
        Motivazione (facoltativa)
      </label>
      <textarea
        id={`note-${busyKey}`}
        rows={2}
        value={actNote}
        placeholder={`Motivo della ${danger ? "eliminazione" : "sospensione"} di ${what}…`}
        onChange={(e) => setActNote(e.target.value)}
      />
      <div className="actions" style={{ padding: 0 }}>
        <button
          className={`btn btn-sm ${danger ? "btn-danger" : "btn-primary"}`}
          type="button"
          disabled={busy === busyKey}
          onClick={onGo}
        >
          {busy === busyKey
            ? "Attendo…"
            : danger
              ? "Sì, elimina definitivamente"
              : "Conferma sospensione"}
        </button>
        <button className="btn btn-sm" type="button" onClick={onCancel}>
          Annulla
        </button>
      </div>
    </div>
  );
}

export default function AdminPanel({
  profile,
  orgs,
  setOrgs,
  profiles,
  setProfiles,
  users,
  setUsers,
  suspendedUsers,
  setSuspendedUsers,
  logs,
  proposals,
  setProposals,
  settings,
  overrides,
  calAll,
  setCalAll,
  calMsg,
  onSetOverride,
  onSaveSettings,
  onApplyText,
  rep,
  setRep,
  onToast,
  onBack,
}: {
  profile: Profile;
  orgs: Org[];
  setOrgs: React.Dispatch<React.SetStateAction<Org[]>>;
  profiles: Profile[];
  setProfiles: React.Dispatch<React.SetStateAction<Profile[]>>;
  users: ServiceUser[];
  setUsers: React.Dispatch<React.SetStateAction<ServiceUser[]>>;
  suspendedUsers: ServiceUser[];
  setSuspendedUsers: React.Dispatch<React.SetStateAction<ServiceUser[]>>;
  logs: DailyLog[];
  proposals: Proposal[];
  setProposals: React.Dispatch<React.SetStateAction<Proposal[]>>;
  settings: Settings | null;
  overrides: CalendarOverride[];
  calAll: boolean;
  setCalAll: (v: boolean) => void;
  calMsg: string;
  onSetOverride: (dateKey: string, val: string | null | undefined) => Promise<void>;
  onSaveSettings: (patch: Partial<Pick<Settings, "weekly" | "sat">>) => Promise<void>;
  onApplyText: (text: string) => Promise<void>;
  rep: { from: string; to: string };
  setRep: React.Dispatch<React.SetStateAction<{ from: string; to: string }>>;
  onToast: (msg: string) => void;
  onBack: () => void;
}) {
  const [section, setSection] = useState<Section>("associazioni");
  const [busy, setBusy] = useState("");
  const [newName, setNewName] = useState("");
  const [rename, setRename] = useState<Record<string, string>>({});
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [edit, setEdit] = useState<Record<string, { display_name: string; role: string; org_id: string }>>({});
  // Email di accesso modificabile solo dall'admin (via API server con service-role).
  const [mail, setMail] = useState<Record<string, string>>({});
  // Motivazione corrente di una sospensione/eliminazione in corso.
  const [actNote, setActNote] = useState("");
  // Elemento per cui il form di conferma è aperto (utenza o proposta).
  const [confirmAct, setConfirmAct] = useState<
    { kind: "user" | "prop"; id: string; op: "suspend" | "delete" } | null
  >(null);

  const orgUserCount = (id: string) => profiles.filter((p) => p.org_id === id).length;

  const SUSPEND_MISSING =
    "La migrazione 0007 non è ancora stata applicata: incolla supabase/migrations/0007_suspensions.sql nel SQL Editor di Supabase e riprova.";

  function closeAct() {
    setConfirmAct(null);
    setActNote("");
  }

  function openAct(kind: "user" | "prop", id: string, op: "suspend" | "delete") {
    setConfirmAct({ kind, id, op });
    setActNote("");
  }

  // ---- Sospensione / eliminazione UTENZE (solo coordinamento) ----
  // Sospendere nasconde da mappa ed elenchi ma tiene il record (reversibile);
  // eliminare cancella definitivamente (esiti via cascade). La colonna active
  // esiste già, quindi la sospensione funziona anche senza la migrazione 0007.
  async function suspendUser(u: ServiceUser) {
    setBusy("sus-u-" + u.id);
    try {
      const { error } = await supabase()
        .from("service_users")
        .update({ active: false, suspension_note: actNote.trim() })
        .eq("id", u.id);
      if (error) {
        if (/suspension_note/i.test(error.message || "")) {
          // Colonna nota non presente: sospendiamo comunque senza motivo.
          const r2 = await supabase()
            .from("service_users")
            .update({ active: false })
            .eq("id", u.id);
          if (r2.error) throw r2.error;
        } else throw error;
      }
      setUsers((prev) => prev.filter((x) => x.id !== u.id));
      setSuspendedUsers((prev) => [{ ...u, active: false }, ...prev]);
      closeAct();
      onToast(`Utenza "${u.name}" sospesa: non sarà più visualizzata su mappa ed elenchi.`);
    } catch (e) {
      onToast("Errore nella sospensione: " + (e instanceof Error ? e.message : "riprova"));
    } finally {
      setBusy("");
    }
  }

  async function resumeUser(u: ServiceUser) {
    setBusy("res-u-" + u.id);
    try {
      const { error } = await supabase()
        .from("service_users")
        .update({ active: true, suspension_note: "" })
        .eq("id", u.id);
      if (error && /suspension_note/i.test(error.message || "")) {
        const r2 = await supabase().from("service_users").update({ active: true }).eq("id", u.id);
        if (r2.error) throw r2.error;
      } else if (error) throw error;
      setSuspendedUsers((prev) => prev.filter((x) => x.id !== u.id));
      setUsers((prev) => [{ ...u, active: true }, ...prev]);
      onToast(`Utenza "${u.name}" riattivata: torna su mappa ed elenchi.`);
    } catch (e) {
      onToast("Errore nella riattivazione: " + (e instanceof Error ? e.message : "riprova"));
    } finally {
      setBusy("");
    }
  }

  async function deleteUser(u: ServiceUser) {
    setBusy("del-u-" + u.id);
    try {
      const { data, error } = await supabase()
        .from("service_users")
        .delete()
        .eq("id", u.id)
        .select("id");
      if (error) throw error;
      if (!data || data.length === 0) {
        onToast("Impossibile eliminare l'utenza (permessi o dati collegati).");
        return;
      }
      setUsers((prev) => prev.filter((x) => x.id !== u.id));
      setSuspendedUsers((prev) => prev.filter((x) => x.id !== u.id));
      closeAct();
      onToast(`Utenza "${u.name}" eliminata definitivamente.`);
    } catch (e) {
      onToast("Errore nell'eliminazione: " + (e instanceof Error ? e.message : "riprova"));
    } finally {
      setBusy("");
    }
  }

  // ---- Sospensione / eliminazione PROPOSTE (solo coordinamento) ----
  async function suspendProposal(p: Proposal) {
    setBusy("sus-p-" + p.id);
    try {
      const note = actNote.trim();
      const { error } = await supabase()
        .from("proposals")
        .update({ suspended: true, suspension_note: note })
        .eq("id", p.id);
      if (error) {
        if (/suspended/i.test(error.message || "")) throw new Error(SUSPEND_MISSING);
        throw error;
      }
      setProposals((prev) =>
        prev.map((x) => (x.id === p.id ? { ...x, suspended: true, suspension_note: note } : x))
      );
      closeAct();
      onToast(`Proposta "${p.name}" sospesa: non sarà più visualizzata su mappa ed elenchi.`);
    } catch (e) {
      onToast("Errore nella sospensione: " + (e instanceof Error ? e.message : "riprova"));
    } finally {
      setBusy("");
    }
  }

  async function resumeProposal(p: Proposal) {
    setBusy("res-p-" + p.id);
    try {
      const { error } = await supabase()
        .from("proposals")
        .update({ suspended: false, suspension_note: "" })
        .eq("id", p.id);
      if (error) {
        if (/suspended/i.test(error.message || "")) throw new Error(SUSPEND_MISSING);
        throw error;
      }
      setProposals((prev) => prev.map((x) => (x.id === p.id ? { ...x, suspended: false } : x)));
      onToast(`Proposta "${p.name}" riattivata: torna su mappa ed elenchi.`);
    } catch (e) {
      onToast("Errore nella riattivazione: " + (e instanceof Error ? e.message : "riprova"));
    } finally {
      setBusy("");
    }
  }

  async function deleteProposalAdmin(p: Proposal) {
    setBusy("del-p-" + p.id);
    try {
      const { data, error } = await supabase()
        .from("proposals")
        .delete()
        .eq("id", p.id)
        .select("id");
      if (error) throw error;
      if (!data || data.length === 0) {
        onToast("Impossibile eliminare la proposta (permessi o dati collegati).");
        return;
      }
      setProposals((prev) => prev.filter((x) => x.id !== p.id));
      closeAct();
      onToast(`Proposta "${p.name}" eliminata definitivamente.`);
    } catch (e) {
      onToast("Errore nell'eliminazione: " + (e instanceof Error ? e.message : "riprova"));
    } finally {
      setBusy("");
    }
  }

  async function createOrg() {
    const name = newName.trim();
    if (!name) {
      onToast("Scrivi il nome dell'associazione.");
      return;
    }
    if (orgs.some((o) => o.name.toLowerCase() === name.toLowerCase())) {
      onToast("Esiste già un'associazione con questo nome.");
      return;
    }
    let id = slug(name);
    if (orgs.some((o) => o.id === id)) id = id + "-" + Math.random().toString(36).slice(2, 6);
    setBusy("new");
    try {
      const { data, error } = await supabase()
        .from("organizations")
        .insert({ id, name })
        .select("id, name")
        .single();
      if (error) throw error;
      setOrgs((prev) => [...prev, data as Org]);
      setNewName("");
      onToast(`Associazione "${name}" creata.`);
    } catch (e) {
      onToast("Errore nella creazione: " + (e instanceof Error ? e.message : "riprova"));
    } finally {
      setBusy("");
    }
  }

  async function saveRename(o: Org) {
    const name = (rename[o.id] ?? o.name).trim();
    if (!name || name === o.name) return;
    setBusy("ren-" + o.id);
    try {
      const { error } = await supabase().from("organizations").update({ name }).eq("id", o.id);
      if (error) throw error;
      setOrgs((prev) => prev.map((x) => (x.id === o.id ? { ...x, name } : x)));
      setRename((prev) => ({ ...prev, [o.id]: "" }));
      onToast("Nome aggiornato.");
    } catch (e) {
      onToast("Errore: " + (e instanceof Error ? e.message : "riprova"));
    } finally {
      setBusy("");
    }
  }

  async function deleteOrg(o: Org) {
    setBusy("del-" + o.id);
    try {
      const { data, error } = await supabase()
        .from("organizations")
        .delete()
        .eq("id", o.id)
        .select("id");
      if (error) throw error;
      if (!data || data.length === 0) {
        onToast("Impossibile eliminare: risulta usata da dati esistenti. Rinomina invece di cancellarla.");
        return;
      }
      setOrgs((prev) => prev.filter((x) => x.id !== o.id));
      setProfiles((prev) => prev.map((p) => (p.org_id === o.id ? { ...p, org_id: null } : p)));
      setConfirmDel(null);
      onToast(`Associazione "${o.name}" eliminata.`);
    } catch (e) {
      onToast(
        "Impossibile eliminare: risulta usata da dati esistenti. " +
          (e instanceof Error ? e.message : "rinomina invece di cancellarla.")
      );
    } finally {
      setBusy("");
    }
  }

  function startEdit(p: Profile) {
    setEdit((prev) => ({
      ...prev,
      [p.id]: { display_name: p.display_name || "", role: p.role, org_id: p.org_id || "" },
    }));
    setMail((prev) => ({ ...prev, [p.id]: p.email || "" }));
  }

  async function saveProfile(p: Profile) {
    const d = edit[p.id];
    if (!d) return;
    const patch = {
      display_name: d.display_name.trim(),
      role: d.role as Profile["role"],
      org_id: d.org_id || null,
    };
    setBusy("prof-" + p.id);
    try {
      const { error } = await supabase().from("profiles").update(patch).eq("id", p.id);
      if (error) throw error;
      setProfiles((prev) => prev.map((x) => (x.id === p.id ? { ...x, ...patch } : x)));
      setEdit((prev) => {
        const n = { ...prev };
        delete n[p.id];
        return n;
      });
      onToast("Account aggiornato.");
    } catch (e) {
      onToast("Errore: " + (e instanceof Error ? e.message : "riprova"));
    } finally {
      setBusy("");
    }
  }

  async function saveEmail(p: Profile) {
    const email = (mail[p.id] ?? "").trim();
    if (!email) {
      onToast("Inserisci un indirizzo email.");
      return;
    }
    setBusy("mail-" + p.id);
    try {
      const res = await fetch("/api/admin/account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: p.id, email }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Errore sconosciuto");
      setProfiles((prev) => prev.map((x) => (x.id === p.id ? { ...x, email } : x)));
      onToast("Email di accesso aggiornata.");
    } catch (e) {
      onToast("Errore: " + (e instanceof Error ? e.message : "riprova"));
    } finally {
      setBusy("");
    }
  }

  const secBtn = (id: Section, label: string) => (
    <button
      key={id}
      type="button"
      className={"tab" + (section === id ? " sel" : "")}
      role="tab"
      aria-selected={section === id}
      style={section === id ? { borderColor: "var(--accent)", color: "var(--accent)" } : undefined}
      onClick={() => setSection(id)}
    >
      {label}
    </button>
  );

  return (
    <div className="detail stack">
      <PanelHeader
        title="Menu coordinamento"
        subtitle={
          <>
            Accesso come <strong>{profile.display_name || "Coordinamento"}</strong>. Gestione di
            associazioni, account, calendario e report.
          </>
        }
        onClose={onBack}
      />

      <div className="tabs" role="tablist" aria-label="Sezioni del coordinamento">
        {secBtn("associazioni", "Associazioni")}
        {secBtn("account", "Account")}
        {secBtn("utenze", "Utenze")}
        {secBtn("calendario", "Calendario")}
        {secBtn("report", "Report")}
      </div>
      {section === "associazioni" && (
        <div className="stack">
          <div className="stack">
            <h3>Nuova associazione</h3>
            <div>
              <label className="lb" htmlFor="org-name">
                Nome dell&apos;associazione
              </label>
              <input
                id="org-name"
                type="text"
                autoComplete="off"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="es. Croce Rossa"
              />
            </div>
          </div>

          <div className="stack">
            <h3>Associazioni esistenti</h3>
            {orgs.length ? (
              <ul className="list">
                {orgs.map((o) => (
                  <li key={o.id} className="hist">
                    <div className="h-top">
                      <span className="h-org">{o.name}</span>
                      <span className="tag">
                        {orgUserCount(o.id)} account · id: {o.id}
                      </span>
                    </div>
                    <div className="stack" style={{ gap: 8 }}>
                      <div>
                        <label className="lb" htmlFor={`ren-${o.id}`}>
                          Rinomina
                        </label>
                        <input
                          id={`ren-${o.id}`}
                          type="text"
                          value={rename[o.id] ?? ""}
                          placeholder={o.name}
                          onChange={(e) => setRename((prev) => ({ ...prev, [o.id]: e.target.value }))}
                        />
                      </div>
                      <div className="actions" style={{ padding: 0 }}>
                        <button
                          className="btn btn-sm"
                          type="button"
                          disabled={busy === "ren-" + o.id || !(rename[o.id] || "").trim()}
                          onClick={() => saveRename(o)}
                        >
                          {busy === "ren-" + o.id ? "Salvo…" : "Salva nome"}
                        </button>
                        {confirmDel === o.id ? (
                          <>
                            <button
                              className="btn btn-sm"
                              type="button"
                              disabled={busy === "del-" + o.id}
                              onClick={() => deleteOrg(o)}
                            >
                              {busy === "del-" + o.id ? "Elimino…" : "Sì, elimina"}
                            </button>
                            <button className="btn btn-sm" type="button" onClick={() => setConfirmDel(null)}>
                              Annulla
                            </button>
                          </>
                        ) : (
                          <button className="btn btn-sm" type="button" onClick={() => setConfirmDel(o.id)}>
                            Elimina
                          </button>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="notice">Nessuna associazione presente.</p>
            )}
            <button className="btn btn-sm" type="button" disabled={busy === "new"} onClick={createOrg}>
              {busy === "new" ? "Creo…" : "Aggiungi associazione"}
            </button>
          </div>
        </div>
      )}

      {section === "account" && (
        <div className="stack">
          <p className="notice">
            Per ogni account puoi assegnare l&apos;associazione, il ruolo (coordinamento o
            associazione) e il nome mostrato. I nuovi accessi si creano dal pannello Supabase;
            qui li attivi e li organizzi.
          </p>
          {profiles.length ? (
            <ul className="list">
              {profiles.map((p) => {
                const d = edit[p.id];
                return (
                  <li key={p.id} className="hist">
                    <div className="h-top">
                      <span className="h-org">{p.display_name || "(senza nome)"}</span>
                      <span className="tag">{p.role === "admin" ? "Coordinamento" : "Associazione"}</span>
                      <span className="tag tag-muted">
                        {p.org_id ? orgName(p.org_id, orgs) : "In sola consultazione"}
                      </span>
                    </div>
                    {p.email ? <p className="h-note mono">{p.email}</p> : null}
                    {p.id === profile.id ? (
                      <p className="pgtxt pgnote">Questo è il tuo account (sei connesso).</p>
                    ) : null}
                    {d ? (
                      <div className="stack" style={{ gap: 8 }}>
                        <div>
                          <label className="lb" htmlFor={`pn-${p.id}`}>
                            Nome mostrato
                          </label>
                          <input
                            id={`pn-${p.id}`}
                            type="text"
                            value={d.display_name}
                            onChange={(e) =>
                              setEdit((prev) => ({
                                ...prev,
                                [p.id]: { ...prev[p.id], display_name: e.target.value },
                              }))
                            }
                          />
                        </div>
                        <div>
                          <label className="lb" htmlFor={`pr-${p.id}`}>
                            Ruolo
                          </label>
                          <select
                            id={`pr-${p.id}`}
                            value={d.role}
                            onChange={(e) =>
                              setEdit((prev) => ({ ...prev, [p.id]: { ...prev[p.id], role: e.target.value } }))
                            }
                          >
                            <option value="org">Associazione</option>
                            <option value="admin">Coordinamento</option>
                          </select>
                        </div>
                        <div>
                          <label className="lb" htmlFor={`po-${p.id}`}>
                            Associazione
                          </label>
                          <select
                            id={`po-${p.id}`}
                            value={d.org_id}
                            onChange={(e) =>
                              setEdit((prev) => ({ ...prev, [p.id]: { ...prev[p.id], org_id: e.target.value } }))
                            }
                          >
                            <option value="">Nessuna (sola consultazione)</option>
                            {orgs.map((o) => (
                              <option key={o.id} value={o.id}>
                                {o.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="lb" htmlFor={`pe-${p.id}`}>
                            Email di accesso (username)
                          </label>
                          <input
                            id={`pe-${p.id}`}
                            type="email"
                            autoComplete="off"
                            value={mail[p.id] ?? p.email ?? ""}
                            onChange={(e) =>
                              setMail((prev) => ({ ...prev, [p.id]: e.target.value }))
                            }
                          />
                          <p className="pgtxt" style={{ fontSize: "13px", opacity: 0.75, margin: "4px 0 0" }}>
                            La password è quella di default comunicata all&apos;associazione; può essere
                            cambiata solo dall&apos;interessato con &quot;Password dimenticata?&quot; nella
                            schermata di accesso.
                          </p>
                        </div>
                        <div className="actions" style={{ padding: 0 }}>
                          <button
                            className="btn btn-sm"
                            type="button"
                            disabled={busy === "mail-" + p.id}
                            onClick={() => saveEmail(p)}
                          >
                            {busy === "mail-" + p.id ? "Aggiorno…" : "Aggiorna email"}
                          </button>
                          <button
                            className="btn btn-ok btn-sm"
                            type="button"
                            disabled={busy === "prof-" + p.id}
                            onClick={() => saveProfile(p)}
                          >
                            {busy === "prof-" + p.id ? "Salvo…" : "Salva"}
                          </button>
                          <button
                            className="btn btn-sm"
                            type="button"
                            onClick={() =>
                              setEdit((prev) => {
                                const n = { ...prev };
                                delete n[p.id];
                                return n;
                              })
                            }
                          >
                            Annulla
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="actions" style={{ padding: 0 }}>
                        <button className="btn btn-sm" type="button" onClick={() => startEdit(p)}>
                          Modifica
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="notice">Nessun account trovato.</p>
          )}
        </div>
      )}

      {section === "utenze" && (
        <div className="stack">
          <p className="notice">
            Gestisci le utenze senza dimora e le proposte in attesa. <strong>Sospendere</strong>{" "}
            nasconde da mappa ed elenchi ma tiene il record (riattivabile in ogni momento);
            <strong> eliminare</strong> è definitivo (esiti e verifiche collegati vengono cancellati).
            In entrambi i casi puoi allegare una motivazione.
          </p>

          <div className="stack">
            <h3>Proposte in attesa</h3>
            {(() => {
              const pending = proposals.filter((p) => p.status === "pending" && !p.suspended);
              if (!pending.length) return <p className="notice">Nessuna proposta in attesa.</p>;
              return (
                <ul className="list">
                  {pending.map((p) => {
                    const isConfirming = confirmAct?.kind === "prop" && confirmAct.id === p.id;
                    if (isConfirming && confirmAct.op === "suspend")
                      return (
                        <li key={p.id} className="hist">
                          <NoteConfirm
                            what={`la proposta "${p.name}"`}
                            busyKey={"sus-p-" + p.id}
                            busy={busy}
                            actNote={actNote}
                            setActNote={setActNote}
                            onCancel={closeAct}
                            onGo={() => suspendProposal(p)}
                          />
                        </li>
                      );
                    if (isConfirming && confirmAct.op === "delete")
                      return (
                        <li key={p.id} className="hist">
                          <NoteConfirm
                            what={`la proposta "${p.name}"`}
                            danger
                            busyKey={"del-p-" + p.id}
                            busy={busy}
                            actNote={actNote}
                            setActNote={setActNote}
                            onCancel={closeAct}
                            onGo={() => deleteProposalAdmin(p)}
                          />
                        </li>
                      );
                    return (
                      <li key={p.id} className="hist">
                        <div className="h-top">
                          <span className="h-org">{p.name}</span>
                          <span className="tag tag-prop">Proposta</span>
                        </div>
                        <div className="actions" style={{ padding: 0 }}>
                          <button
                            className="btn btn-sm"
                            type="button"
                            onClick={() => openAct("prop", p.id, "suspend")}
                          >
                            Sospendi
                          </button>
                          <button
                            className="btn btn-danger btn-sm"
                            type="button"
                            onClick={() => openAct("prop", p.id, "delete")}
                          >
                            Elimina
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              );
            })()}
          </div>

          <div className="stack">
            <h3>Utenze attive ({users.length})</h3>
            {!users.length ? (
              <p className="notice">Nessuna utenza attiva.</p>
            ) : (
              <ul className="list">
                {users.map((u) => {
                  const isConfirming = confirmAct?.kind === "user" && confirmAct.id === u.id;
                  if (isConfirming && confirmAct.op === "suspend")
                    return (
                      <li key={u.id} className="hist">
                        <NoteConfirm
                          what={`l'utenza "${u.name}"`}
                          busyKey={"sus-u-" + u.id}
                          busy={busy}
                          actNote={actNote}
                          setActNote={setActNote}
                          onCancel={closeAct}
                          onGo={() => suspendUser(u)}
                        />
                      </li>
                    );
                  if (isConfirming && confirmAct.op === "delete")
                    return (
                      <li key={u.id} className="hist">
                        <NoteConfirm
                          what={`l'utenza "${u.name}"`}
                          danger
                          busyKey={"del-u-" + u.id}
                          busy={busy}
                          actNote={actNote}
                          setActNote={setActNote}
                          onCancel={closeAct}
                          onGo={() => deleteUser(u)}
                        />
                      </li>
                    );
                  return (
                    <li key={u.id} className="hist">
                      <div className="h-top">
                        <span className="h-org">{u.name}</span>
                        <span className="tag">Attiva</span>
                      </div>
                      {u.note ? <p className="h-note">{u.note}</p> : null}
                      <div className="actions" style={{ padding: 0 }}>
                        <button
                          className="btn btn-sm"
                          type="button"
                          onClick={() => openAct("user", u.id, "suspend")}
                        >
                          Sospendi
                        </button>
                        <button
                          className="btn btn-danger btn-sm"
                          type="button"
                          onClick={() => openAct("user", u.id, "delete")}
                        >
                          Elimina
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="stack">
            <h3>Utenze sospese ({suspendedUsers.length})</h3>
            {!suspendedUsers.length ? (
              <p className="notice">Nessuna utenza sospesa.</p>
            ) : (
              <ul className="list">
                {suspendedUsers.map((u) => {
                  const isConfirming = confirmAct?.kind === "user" && confirmAct.id === u.id;
                  if (isConfirming && confirmAct.op === "delete")
                    return (
                      <li key={u.id} className="hist">
                        <NoteConfirm
                          what={`l'utenza "${u.name}"`}
                          danger
                          busyKey={"del-u-" + u.id}
                          busy={busy}
                          actNote={actNote}
                          setActNote={setActNote}
                          onCancel={closeAct}
                          onGo={() => deleteUser(u)}
                        />
                      </li>
                    );
                  return (
                    <li key={u.id} className="hist">
                      <div className="h-top">
                        <span className="h-org">{u.name}</span>
                        <span className="tag tag-danger">Sospesa</span>
                      </div>
                      {u.suspension_note ? <p className="h-note">Motivo: {u.suspension_note}</p> : null}
                      <div className="actions" style={{ padding: 0 }}>
                        <button
                          className="btn btn-sm"
                          type="button"
                          disabled={busy === "res-u-" + u.id}
                          onClick={() => resumeUser(u)}
                        >
                          {busy === "res-u-" + u.id ? "Riattivo…" : "Riattiva"}
                        </button>
                        <button
                          className="btn btn-danger btn-sm"
                          type="button"
                          onClick={() => openAct("user", u.id, "delete")}
                        >
                          Elimina
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}

      {section === "calendario" && (
        <CalendarView
          orgs={orgs}
          settings={settings}
          overrides={overrides}
          isAdmin
          myOrg={null}
          calAll={calAll}
          setCalAll={setCalAll}
          calMsg={calMsg}
          onSetOverride={onSetOverride}
          onSaveSettings={onSaveSettings}
          onApplyText={onApplyText}
          onBack={() => setSection("associazioni")}
        />
      )}

      {section === "report" && (
        <ReportView
          orgs={orgs}
          users={users}
          logs={logs}
          proposals={proposals}
          rep={rep}
          setRep={setRep}
          onBack={() => setSection("associazioni")}
        />
      )}
    </div>
  );
}

