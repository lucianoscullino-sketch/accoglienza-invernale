"use client";

// Menu del coordinamento (solo admin). Elenco unico dove ogni riga è
// un'associazione con il SUO account (l'account è un attributo della riga):
// sotto ogni riga i tasti Modifica / Salva Nome / Elimina; «Modifica» apre
// nome associazione e email dell'account. In fondo l'account del coordinamento.
// Calendario e Report hanno ormai tab propri di primo livello e non passano più
// da qui. Le scritture passano dal client Supabase: la sicurezza è garantita
// dalle policy RLS ("orgs admin write" e "profiles admin update").

import { useState } from "react";
import type { Org, Profile } from "@/lib/types";
import PanelHeader from "@/components/PanelHeader";
import { supabase } from "@/lib/supabase";

const slug = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || ("org-" + Math.random().toString(36).slice(2, 8));


export default function AdminPanel({
  profile,
  orgs,
  setOrgs,
  profiles,
  setProfiles,
  onToast,
}: {
  profile: Profile;
  orgs: Org[];
  setOrgs: React.Dispatch<React.SetStateAction<Org[]>>;
  profiles: Profile[];
  setProfiles: React.Dispatch<React.SetStateAction<Profile[]>>;
  onToast: (msg: string) => void;
}) {
  const [busy, setBusy] = useState("");
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  // Il form di creazione appare solo dopo il click su "Aggiungi associazione".
  const [adding, setAdding] = useState(false);
  const [rename, setRename] = useState<Record<string, string>>({});
  // Rinomina inline: l'input (precompilato col nome corrente) appare solo
  // premendo «Modifica», così il nome si scrive una volta sola.
  const [renameOpen, setRenameOpen] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  // Email di accesso modificabile solo dall'admin (via API server con service-role).
  const [mail, setMail] = useState<Record<string, string>>({});

  async function createOrg() {
    const name = newName.trim();
    const email = newEmail.trim().toLowerCase();
    if (!name) {
      onToast("Scrivi il nome dell'associazione.");
      return;
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      onToast("Indirizzo email non valido.");
      return;
    }
    if (orgs.some((o) => o.name.toLowerCase() === name.toLowerCase())) {
      onToast("Esiste già un'associazione con questo nome.");
      return;
    }
    if (email && profiles.some((p) => (p.email || "").toLowerCase() === email)) {
      onToast("Esiste già un account con questa email.");
      return;
    }
    let id = slug(name);
    if (orgs.some((o) => o.id === id)) id = id + "-" + Math.random().toString(36).slice(2, 6);
    setBusy("new");
    let created = false;
    try {
      const { data, error } = await supabase()
        .from("organizations")
        .insert({ id, name })
        .select("id, name")
        .single();
      if (error) throw error;
      created = true;
      setOrgs((prev) => [...prev, data as Org]);

      // Se è stata indicata un'email, crea subito anche l'account collegato
      // (via API server con service-role; senza password: la imposterà
      // l'associazione con "Password dimenticata?").
      if (email) {
        const res = await fetch("/api/admin/account", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "create", orgId: id, displayName: name, email }),
        });
        const d = (await res.json().catch(() => ({}))) as { error?: string; userId?: string };
        if (!res.ok) throw new Error(d.error || "impossibile creare l'account");
        setProfiles((prev) => [
          ...prev,
          { id: d.userId as string, role: "org", org_id: id, display_name: name, email },
        ]);
      }

      setNewName("");
      setNewEmail("");
      setAdding(false);
      onToast(
        email
          ? `Associazione "${name}" e account ${email} creati: all'associazione basta usare «Password dimenticata?» per impostare la password.`
          : `Associazione "${name}" creata.`
      );
    } catch (e) {
      const m = e instanceof Error ? e.message : "riprova";
      if (created && email) {
        // Niente stati parziali: se l'account non è nato, annulla l'associazione.
        await supabase().from("organizations").delete().eq("id", id);
        setOrgs((prev) => prev.filter((x) => x.id !== id));
        onToast("Associazione NON creata (l'account non è stato possibile): " + m);
      } else {
        onToast("Errore nella creazione: " + m);
      }
    } finally {
      setBusy("");
    }
  }

  // Apre/chiude il form di riga (nome associazione + email account).
  function toggleEdit(o: Org) {
    if (renameOpen === o.id) {
      setRenameOpen(null);
      setRename((prev) => ({ ...prev, [o.id]: "" }));
    } else {
      setConfirmDel(null);
      setRenameOpen(o.id);
      setRename((prev) => ({ ...prev, [o.id]: o.name }));
    }
  }

  // Salva in un colpo nome associazione e email dell'account della riga.
  async function saveRow(o: Org) {
    const name = (rename[o.id] ?? "").trim();
    if (!name) {
      onToast("Il nome dell'associazione non può essere vuoto.");
      return;
    }
    const accs = profiles.filter((p) => p.org_id === o.id);
    for (const p of accs) {
      if (mail[p.id] !== undefined && !(mail[p.id] ?? "").trim()) {
        onToast(`Inserisci un indirizzo email per ${p.display_name || "l'account"}.`);
        return;
      }
    }
    const nameChanged = name !== o.name;
    const mailChanged = accs.filter(
      (p) => (mail[p.id] ?? p.email ?? "").trim() !== (p.email ?? "").trim()
    );
    if (!nameChanged && mailChanged.length === 0) {
      setRenameOpen(null);
      return;
    }
    setBusy("ren-" + o.id);
    try {
      if (nameChanged) {
        const { error } = await supabase().from("organizations").update({ name }).eq("id", o.id);
        if (error) throw error;
        setOrgs((prev) => prev.map((x) => (x.id === o.id ? { ...x, name } : x)));
      }
      for (const p of mailChanged) {
        const email = (mail[p.id] ?? "").trim();
        const res = await fetch("/api/admin/account", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: p.id, email }),
        });
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) throw new Error(data.error || "Errore nell'aggiornamento dell'email");
        setProfiles((prev) => prev.map((x) => (x.id === p.id ? { ...x, email } : x)));
      }
      setRename((prev) => ({ ...prev, [o.id]: "" }));
      setRenameOpen(null);
      onToast(
        nameChanged && mailChanged.length
          ? "Nome e account aggiornati."
          : nameChanged
            ? "Nome aggiornato."
            : "Account aggiornato."
      );
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
      setRenameOpen(null);
      onToast("Email di accesso aggiornata.");
    } catch (e) {
      onToast("Errore: " + (e instanceof Error ? e.message : "riprova"));
    } finally {
      setBusy("");
    }
  }
  const admins = profiles.filter((p) => p.role === "admin");
  const adminKey = (id: string) => "admin:" + id;

  // Quanto è "sporco" il form di una riga org (nome o qualche email cambiata).
  const rowDirty = (o: Org) => {
    const name = (rename[o.id] ?? "").trim();
    if (!name) return false;
    if (name !== o.name) return true;
    return profiles
      .filter((p) => p.org_id === o.id)
      .some((p) => (mail[p.id] ?? p.email ?? "").trim() !== (p.email ?? "").trim());
  };

  return (
    <div className="detail stack">
      <PanelHeader
        title="Associazioni"
        subtitle={
          <>
            Accesso come <strong>{profile.display_name || "Coordinamento"}</strong>.{" "}
            Ogni riga è un&apos;associazione con il suo account: con «Modifica» cambi nome e
            email di accesso.
          </>
        }
      />

      <div className="stack">
        <h3>Associazioni e account</h3>
        {orgs.length ? (
          <ul className="list">
            {orgs.map((o) => {
              const accs = profiles.filter((p) => p.org_id === o.id);
              const open = renameOpen === o.id;
              return (
                <li key={o.id} className="hist">
                  <div className="h-top">
                    <span className="h-org">{o.name}</span>
                    <span className="tag tag-muted">
                      {accs.length
                        ? accs
                            .map(
                              (p) =>
                                `${p.display_name || "(senza nome)"}${
                                  p.email ? " · " + p.email : ""
                                }`
                            )
                            .join("   |   ")
                        : "Nessun account"}
                    </span>
                  </div>
                  {open ? (
                    <div className="stack" style={{ gap: 8 }}>
                      <div>
                        <label className="lb" htmlFor={`ren-${o.id}`}>
                          Nome dell&apos;associazione
                        </label>
                        <input
                          id={`ren-${o.id}`}
                          type="text"
                          autoComplete="off"
                          autoFocus
                          value={rename[o.id] ?? ""}
                          onChange={(e) => setRename((prev) => ({ ...prev, [o.id]: e.target.value }))}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && rowDirty(o)) saveRow(o);
                          }}
                        />
                      </div>
                      {accs.map((p) => (
                        <div key={`me-${p.id}`} className="stack" style={{ gap: 6 }}>
                          <label className="lb" htmlFor={`me-${p.id}`}>
                            Email di accesso ({p.display_name || "account"})
                          </label>
                          <input
                            id={`me-${p.id}`}
                            type="email"
                            autoComplete="off"
                            value={mail[p.id] ?? p.email ?? ""}
                            onChange={(e) => setMail((prev) => ({ ...prev, [p.id]: e.target.value }))}
                          />
                          <p
                            className="pgtxt"
                            style={{ fontSize: "13px", opacity: 0.75, margin: "0 0 4px" }}
                          >
                            La password è quella di default comunicata
                            all&apos;associazione; può essere cambiata
                            dall&apos;interessato con &quot;Password
                            dimenticata?&quot; nella schermata di accesso.
                          </p>
                          <button
                            className="btn btn-sm"
                            type="button"
                            disabled={
                              !open ||
                              busy === "mail-" + p.id ||
                              (mail[p.id] ?? p.email ?? "").trim() ===
                                (p.email ?? "").trim() ||
                              !(mail[p.id] ?? p.email ?? "").trim()
                            }
                            onClick={() => saveEmail(p)}
                          >
                            {busy === "mail-" + p.id ? "Salvo…" : "Salva email"}
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  <div className="actions" style={{ padding: 0 }}>
                    <button
                      className="btn btn-sm"
                      type="button"
                      onClick={() => toggleEdit(o)}
                    >
                      {open ? "Chiudi" : "Modifica"}
                    </button>
                    <button
                      className="btn btn-sm"
                      type="button"
                      disabled={!open || !rowDirty(o) || busy === "ren-" + o.id}
                      onClick={() => saveRow(o)}
                    >
                      {busy === "ren-" + o.id ? "Salvo…" : "Salva Nome"}
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
                        <button
                          className="btn btn-sm"
                          type="button"
                          onClick={() => setConfirmDel(null)}
                        >
                          Annulla
                        </button>
                      </>
                    ) : (
                      <button
                        className="btn btn-sm"
                        type="button"
                        onClick={() => {
                          setRenameOpen(null);
                          setConfirmDel(o.id);
                        }}
                      >
                        Elimina
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="notice">Nessuna associazione presente.</p>
        )}

        {/* Creazione a due tempi: prima il tasto, poi (se cliccato) i campi.
            La lista resta compatta finché non serve davvero aggiungere. */}
        {!adding ? (
          <button className="btn btn-sm" type="button" onClick={() => setAdding(true)}>
            Aggiungi associazione
          </button>
        ) : (
          <div className="stack" style={{ gap: 8 }}>
            <div>
              <label className="lb" htmlFor="org-name">
                Nome della nuova associazione
              </label>
              <input
                id="org-name"
                type="text"
                autoComplete="off"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") createOrg();
                }}
                placeholder="es. Croce Rossa"
              />
            </div>
            <div>
              <label className="lb" htmlFor="org-email">
                Email dell&apos;account (facoltativa)
              </label>
              <input
                id="org-email"
                type="email"
                autoComplete="off"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") createOrg();
                }}
                placeholder="es. crocerossa@associazione.it"
              />
              <p className="pgtxt pgnote" style={{ marginTop: 4 }}>
                Se la inserisci, l&apos;account di accesso viene creato subito collegato
                all&apos;associazione: all&apos;interessato basterà usare «Password dimenticata?» per
                impostare la password.
              </p>
            </div>
            <div className="actions" style={{ padding: 0 }}>
              <button
                className="btn btn-primary btn-sm"
                type="button"
                disabled={busy === "new"}
                onClick={createOrg}
              >
                {busy === "new" ? "Creo…" : "Crea associazione"}
              </button>
              <button
                className="btn btn-sm"
                type="button"
                disabled={busy === "new"}
                onClick={() => {
                  setAdding(false);
                  setNewName("");
                  setNewEmail("");
                }}
              >
                Annulla
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="stack">
        <h3>Coordinamento</h3>
        {admins.length ? (
          admins.map((p) => {
            const open = renameOpen === adminKey(p.id);
            return (
              <div key={p.id} className="hist">
                <div className="h-top">
                  <span className="h-org">{p.display_name || "(senza nome)"}</span>
                  <span className="tag tag-muted">{p.email || "nessuna email"}</span>
                </div>
                {p.id === profile.id ? (
                  <p className="pgtxt pgnote">Questo è il tuo account (sei connesso).</p>
                ) : null}
                {open ? (
                  <div className="stack" style={{ gap: 8 }}>
                    <div>
                      <label className="lb" htmlFor={`me-${p.id}`}>
                        Email di accesso
                      </label>
                      <input
                        id={`me-${p.id}`}
                        type="email"
                        autoComplete="off"
                        autoFocus
                        value={mail[p.id] ?? p.email ?? ""}
                        onChange={(e) => setMail((prev) => ({ ...prev, [p.id]: e.target.value }))}
                      />
                      <p
                        className="pgtxt"
                        style={{ fontSize: "13px", opacity: 0.75, margin: "4px 0 0" }}
                      >
                        La password è quella di default; può essere cambiata solo
                        dall&apos;interessato con &quot;Password dimenticata?&quot; nella
                        schermata di accesso.
                      </p>
                    </div>
                  </div>
                ) : null}
                <div className="actions" style={{ padding: 0 }}>
                  <button
                    className="btn btn-sm"
                    type="button"
                    onClick={() => {
                      if (open) setRenameOpen(null);
                      else {
                        setConfirmDel(null);
                        setRenameOpen(adminKey(p.id));
                      }
                    }}
                  >
                    {open ? "Chiudi" : "Modifica"}
                  </button>
                  <button
                    className="btn btn-sm"
                    type="button"
                    disabled={
                      !open ||
                      busy === "mail-" + p.id ||
                      (mail[p.id] ?? p.email ?? "").trim() === (p.email ?? "").trim() ||
                      !(mail[p.id] ?? p.email ?? "").trim()
                    }
                    onClick={() => saveEmail(p)}
                  >
                    {busy === "mail-" + p.id ? "Salvo…" : "Salva email"}
                  </button>
                </div>
              </div>
            );
          })
        ) : (
          <p className="notice">Nessun account di coordinamento presente.</p>
        )}
      </div>
    </div>
  );
}


