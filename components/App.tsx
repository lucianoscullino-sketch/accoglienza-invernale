"use client";

// Applicazione principale: mappa, elenco, schede, esiti firmati, proposte,
// calendario delle uscite e report. Dati letti/scritti su Supabase (RLS).

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import MapView, { type MapItem, type Selection } from "@/components/MapView";
import type { EntryValues } from "@/components/EntryFields";
import ProposeForm from "@/components/ProposeForm";
import UserDetail from "@/components/UserDetail";
import PropDetail from "@/components/PropDetail";
import Popup from "@/components/Popup";
import CalendarView from "@/components/CalendarView";
import ReportView from "@/components/ReportView";
import OrgReport from "@/components/OrgReport";
import { supabase } from "@/lib/supabase";
import type {
  CalendarOverride,
  DailyLog,
  Org,
  Profile,
  Proposal,
  ProposalVerification,
  ServiceUser,
  Settings,
  Status,
} from "@/lib/types";
import { effDutyId } from "@/lib/duty";
import { DAY, ST_LABEL, VER_TXT, addDaysKey, fmtDay, fmtDM, orgName, parseCal, today } from "@/lib/format";

type Tab = "utenti" | "proposte" | "calendario" | "report" | "mine";

export default function App({ profile }: { profile: Profile }) {
  const router = useRouter();

  // --- dati condivisi ---
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [users, setUsers] = useState<ServiceUser[]>([]);
  const [logs, setLogs] = useState<DailyLog[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [overrides, setOverrides] = useState<CalendarOverride[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState("");

  // --- stato interfaccia ---
  const [tab, setTab] = useState<Tab>("utenti");
  const [selected, setSelected] = useState<Selection | null>(null);
  const [placing, setPlacing] = useState(false);
  const [draftPos, setDraftPos] = useState<{ lat: number; lng: number } | null>(null);
  const [focus, setFocus] = useState<{ lat: number; lng: number; n: number } | null>(null);
  const [calAll, setCalAll] = useState(false);
  const [calMsg, setCalMsg] = useState("");
  const [rep, setRep] = useState({ from: addDaysKey(-6), to: today() });
  const [toastMsg, setToastMsg] = useState("");
  const toastT = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isAdmin = profile.role === "admin";
  const myOrg = profile.org_id;

  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const sb = supabase();
        const [o, u, l, p, c, s] = await Promise.all([
          sb.from("organizations").select("id, name").order("name"),
          sb.from("service_users").select("*").eq("active", true),
          sb.from("daily_logs").select("*").order("date", { ascending: false }).limit(3000),
          sb.from("proposals")
            .select("*, verifications:proposal_verifications(*)")
            .order("created_at", { ascending: false }),
          sb.from("calendar_overrides").select("*"),
          sb.from("settings").select("*").eq("id", "main").maybeSingle(),
        ]);
        const err = o.error || u.error || l.error || p.error || c.error || s.error;
        if (err) throw err;
        if (dead) return;
        setOrgs((o.data || []) as Org[]);
        setUsers((u.data || []) as ServiceUser[]);
        setLogs((l.data || []) as DailyLog[]);
        setProposals(
          (((p.data || []) as Proposal[])).map((x) => ({
            ...x,
            verifications: [...(x.verifications || [])].sort((a, b) => a.date.localeCompare(b.date)),
          }))
        );
        setOverrides((c.data || []) as CalendarOverride[]);
        if (s.data) setSettings(s.data as Settings);
      } catch (e) {
        if (!dead) setLoadErr(e instanceof Error ? e.message : "Impossibile caricare i dati da Supabase.");
      } finally {
        if (!dead) setLoading(false);
      }
    })();
    return () => {
      dead = true;
    };
  }, []);

  function toast(msg: string) {
    setToastMsg(msg);
    if (toastT.current) clearTimeout(toastT.current);
    toastT.current = setTimeout(() => setToastMsg(""), 3600);
  }


  // --- derivazioni (come nel prototipo) ---
  const dutyOrg = (k: string): Org | null => {
    if (!settings) return null;
    const id = effDutyId(settings, overrides, k);
    if (!id) return null;
    return orgs.find((o) => o.id === id) || null;
  };
  const duty = dutyOrg(today());
  const dutyName = duty ? duty.name : "Nessuna uscita in calendario";
  const canRecord = isAdmin || (!!duty && duty.id === myOrg);
  const dutyMsg = (suffix: string) =>
    duty ? `Stasera è in uscita ${duty.name}${suffix}` : "Stasera non c'è un'uscita in calendario.";

  const tonightLog = (uid: string) => logs.find((l) => l.user_id === uid && l.date === today());
  const statusOf = (u: ServiceUser): Status => {
    const l = tonightLog(u.id);
    return !l ? "todo" : l.found ? "done" : "missing";
  };
  const expTime = (p: Proposal) => new Date(p.created_at).getTime() + 7 * DAY;
  const visibleProps = proposals.filter((p) => p.status === "pending" && Date.now() < expTime(p));
  const expiredProps = proposals.filter((p) => p.status === "pending" && Date.now() >= expTime(p));
  const daysLeft = (p: Proposal) => Math.ceil((expTime(p) - Date.now()) / DAY);
  const propVer = (p: Proposal): "ok" | "no" | "none" => {
    const vs = p.verifications || [];
    return vs.length ? (vs[vs.length - 1].found ? "ok" : "no") : "none";
  };
  const propTonight = (p: Proposal): Status => {
    const v = (p.verifications || []).find((x) => x.date === today());
    return !v ? "todo" : v.found ? "done" : "missing";
  };

  function counts() {
    const c: Record<string, number> = { t: 0, d: 0, m: 0, tu: 0, tp: 0, du: 0, dp: 0, mu: 0, mp: 0, p: visibleProps.length };
    const add = (st: Status, isP: boolean) => {
      const k = st === "todo" ? "t" : st === "done" ? "d" : "m";
      c[k] += 1;
      c[k + (isP ? "p" : "u")] += 1;
    };
    users.forEach((u) => add(statusOf(u), false));
    visibleProps.forEach((p) => add(propTonight(p), true));
    return c;
  }
  /* totale con parziali, per esempio 10 (7+3) = 7 utenti + 3 proposte */
  const part = (c: Record<string, number>, k: string) =>
    c.p ? `${c[k]} (${c[k + "u"]}+${c[k + "p"]})` : String(c[k]);

  const mapItems: MapItem[] = [
    ...users.map((u) => ({ kind: "user" as const, id: u.id, lat: u.lat, lng: u.lng, st: statusOf(u), name: u.name })),
    ...visibleProps.map((p) => {
      const st = propTonight(p), v = propVer(p);
      return { kind: "prop" as const, id: p.id, lat: p.lat, lng: p.lng, st, name: p.name, ver: v, tip: `proposta, ${ST_LABEL[st].toLowerCase()}, ${VER_TXT[v]}` };
    }),
    ...(placing && draftPos
      ? [{ kind: "draft" as const, id: "draft", lat: draftPos.lat, lng: draftPos.lng, st: "prop" as const, name: "Nuova proposta" }]
      : []),
  ];

  // --- selezione e proposta ---
  function select(kind: "user" | "prop", id: string, fromMap: boolean) {
    setSelected({ kind, id });
    setPlacing(false);
    if (fromMap) {
      setFocus(null);
      if (typeof window !== "undefined" && window.matchMedia("(max-width:899px)").matches) {
        document.getElementById("panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    } else {
      const o = kind === "user" ? users.find((u) => u.id === id) : proposals.find((p) => p.id === id);
      if (o) setFocus({ lat: o.lat, lng: o.lng, n: Date.now() });
    }
  }
  function back() {
    setSelected(null);
    setFocus(null);
  }
  function startPropose() {
    setPlacing(true);
    setSelected(null);
    setDraftPos(null);
    setTab("proposte");
  }
  function cancelPropose() {
    setPlacing(false);
    setDraftPos(null);
  }


  // --- azioni: scritture su Supabase ---
  const myOrgId = () => (isAdmin ? "admin" : myOrg || "admin");

  async function saveUserEntry(uid: string, v: EntryValues) {
    try {
      const row = {
        user_id: uid,
        date: today(),
        org_id: myOrgId(),
        found: v.found,
        provided: v.provided,
        requested: v.requested,
        note: v.note,
        created_by: profile.id,
      };
      const { data, error } = await supabase()
        .from("daily_logs")
        .upsert(row, { onConflict: "user_id,date" })
        .select()
        .single();
      if (error) throw error;
      const rec = data as DailyLog;
      setLogs((prev) => [...prev.filter((l) => !(l.user_id === uid && l.date === row.date)), rec]);
      const u = users.find((x) => x.id === uid);
      toast(`Esito registrato per ${u ? u.name : "utente"}, firmato ${orgName(row.org_id, orgs)}`);
      back();
    } catch (e) {
      toast("Errore nel salvataggio: " + (e instanceof Error ? e.message : "riprova"));
    }
  }

  async function saveVerification(pid: string, v: EntryValues) {
    try {
      const row = {
        proposal_id: pid,
        date: today(),
        org_id: myOrgId(),
        found: v.found,
        provided: v.provided,
        requested: v.requested,
        note: v.note,
        created_by: profile.id,
      };
      const { data, error } = await supabase()
        .from("proposal_verifications")
        .upsert(row, { onConflict: "proposal_id,date" })
        .select()
        .single();
      if (error) throw error;
      const rec = data as ProposalVerification;
      setProposals((prev) =>
        prev.map((p) =>
          p.id === pid
            ? { ...p, verifications: [...(p.verifications || []).filter((x) => x.date !== row.date), rec].sort((a, b) => a.date.localeCompare(b.date)) }
            : p
        )
      );
      toast("Verifica registrata, firmata " + orgName(row.org_id, orgs));
    } catch (e) {
      toast("Errore nel salvataggio: " + (e instanceof Error ? e.message : "riprova"));
    }
  }

  async function doPropose(v: { name: string; desc: string; entry: EntryValues }) {
    if (!draftPos) return;
    try {
      const by = myOrgId();
      const { data, error } = await supabase()
        .from("proposals")
        .insert({ name: v.name, description: v.desc, lat: draftPos.lat, lng: draftPos.lng, proposed_by: by })
        .select("*, verifications:proposal_verifications(*)")
        .single();
      if (error) throw error;
      let prop = data as Proposal;
      prop = { ...prop, verifications: prop.verifications || [] };
      if (!isAdmin) {
        const { data: ver, error: ve } = await supabase()
          .from("proposal_verifications")
          .insert({
            proposal_id: prop.id,
            date: today(),
            org_id: by,
            found: v.entry.found,
            provided: v.entry.provided,
            requested: v.entry.requested,
            note: v.entry.note,
            created_by: profile.id,
          })
          .select()
          .single();
        if (ve) throw ve;
        prop = { ...prop, verifications: [...(prop.verifications || []), ver as ProposalVerification] };
      }
      setProposals((prev) => [prop, ...prev]);
      setPlacing(false);
      setDraftPos(null);
      setTab("proposte");
      setSelected({ kind: "prop", id: prop.id });
      toast("Proposta inviata: resta sulla mappa fino al " + fmtDM(Date.now() + 7 * DAY));
    } catch (e) {
      toast("Errore nell'invio: " + (e instanceof Error ? e.message : "riprova"));
    }
  }


  async function validate(p: Proposal) {
    try {
      const sb = supabase();
      const { data: nu, error } = await sb
        .from("service_users")
        .insert({ name: p.name, description: p.description, lat: p.lat, lng: p.lng })
        .select()
        .single();
      if (error) throw error;
      const newUser = nu as ServiceUser;
      const { error: e2 } = await sb
        .from("proposals")
        .update({ status: "validated", validated_into: newUser.id })
        .eq("id", p.id);
      if (e2) throw e2;
      const vs = p.verifications || [];
      if (vs.length) {
        const { error: e3 } = await sb.from("daily_logs").upsert(
          vs.map((v) => ({
            user_id: newUser.id,
            date: v.date,
            org_id: v.org_id,
            found: v.found,
            provided: v.provided,
            requested: v.requested,
            note: v.note,
          })),
          { onConflict: "user_id,date" }
        );
        if (e3) throw e3;
        setLogs((prev) => [
          ...prev,
          ...vs
            .filter((v) => !prev.some((l) => l.user_id === newUser.id && l.date === v.date))
            .map<DailyLog>((v) => ({
              user_id: newUser.id,
              date: v.date,
              org_id: v.org_id,
              found: v.found,
              provided: v.provided,
              requested: v.requested,
              note: v.note,
            })),
        ]);
      }
      setUsers((prev) => [...prev, newUser]);
      setProposals((prev) =>
        prev.map((x) => (x.id === p.id ? { ...x, status: "validated", validated_into: newUser.id } : x))
      );
      setSelected({ kind: "user", id: newUser.id });
      setFocus({ lat: newUser.lat, lng: newUser.lng, n: Date.now() });
      toast("Utente aggiunto all'elenco regolare");
    } catch (e) {
      toast("Errore nella validazione: " + (e instanceof Error ? e.message : "riprova"));
    }
  }

  async function reject(p: Proposal) {
    try {
      const { error } = await supabase().from("proposals").update({ status: "rejected" }).eq("id", p.id);
      if (error) throw error;
      setProposals((prev) => prev.map((x) => (x.id === p.id ? { ...x, status: "rejected" } : x)));
      setSelected(null);
      toast("Proposta rimossa");
    } catch (e) {
      toast("Errore: " + (e instanceof Error ? e.message : "riprova"));
    }
  }

  // Cancella definitivamente una proposta creata per errore (solo chi l'ha proposta)
  async function deleteProposal(pid: string) {
    try {
      // .select() fa sì che PostgREST restituisca le righe eliminate: se la policy
      // RLS blocca l'operazione, data è vuoto (0 righe) e la proposta resta nel DB.
      const { data, error } = await supabase()
        .from("proposals")
        .delete()
        .eq("id", pid)
        .select("id");
      if (error) throw error;
      if (!data || data.length === 0) {
        toast("Cancellazione non riuscita: permesso negato. Ricarica la pagina e riprova.");
        return;
      }
      setProposals((prev) => prev.filter((x) => x.id !== pid));
      setSelected(null);
      setTab("proposte");
      toast("Proposta cancellata");
    } catch (e) {
      toast("Errore nella cancellazione: " + (e instanceof Error ? e.message : "riprova"));
    }
  }

  // val: id associazione, "" = nessuna uscita, undefined = torna alla regola fissa
  async function setOverride(dateKey: string, val: string | null | undefined) {
    try {
      const sb = supabase();
      if (val === undefined) {
        const { error } = await sb.from("calendar_overrides").delete().eq("date", dateKey);
        if (error) throw error;
        setOverrides((prev) => prev.filter((o) => o.date !== dateKey));
      } else {
        const { data, error } = await sb
          .from("calendar_overrides")
          .upsert({ date: dateKey, org_id: val === "" ? null : val }, { onConflict: "date" })
          .select()
          .single();
        if (error) throw error;
        setOverrides((prev) => [...prev.filter((o) => o.date !== dateKey), data as CalendarOverride]);
      }
      toast("Calendario aggiornato");
    } catch (e) {
      toast("Errore nel calendario: " + (e instanceof Error ? e.message : "riprova"));
    }
  }

  async function saveSettings(patch: Partial<Pick<Settings, "weekly" | "sat">>) {
    if (!settings) return;
    try {
      const { error } = await supabase().from("settings").update(patch).eq("id", "main");
      if (error) throw error;
      setSettings({ ...settings, ...patch });
      toast("Calendario aggiornato");
    } catch (e) {
      toast("Errore nel calendario: " + (e instanceof Error ? e.message : "riprova"));
    }
  }

  async function applyCalText(text: string) {
    if (!isAdmin) return;
    const r = parseCal(text, orgs);
    for (const [d, v] of r.ok) {
      try {
        const sb = supabase();
        if (v === null) {
          const { error } = await sb.from("calendar_overrides").delete().eq("date", d);
          if (error) throw error;
          setOverrides((prev) => prev.filter((o) => o.date !== d));
        } else {
          const { data, error } = await sb
            .from("calendar_overrides")
            .upsert({ date: d, org_id: v === "" ? null : v }, { onConflict: "date" })
            .select()
            .single();
          if (error) throw error;
          setOverrides((prev) => [...prev.filter((o) => o.date !== d), data as CalendarOverride]);
        }
      } catch {
        r.bad.push(d);
      }
    }
    setCalMsg(
      (r.ok.length ? `Caricate ${r.ok.length} ${r.ok.length === 1 ? "sera" : "sere"}.` : "Nessuna riga valida.") +
        (r.bad.length
          ? ` ${r.bad.length} ${r.bad.length === 1 ? "riga non riconosciuta" : "righe non riconosciute"}: ${r.bad.slice(0, 3).join(" / ")}${r.bad.length > 3 ? " ..." : ""}.`
          : "")
    );
    toast(r.ok.length ? "Calendario aggiornato" : "Calendario non modificato");
  }

  async function signOut() {
    try {
      await supabase().auth.signOut();
    } catch {
      /* ignora */
    }
    router.push("/login");
    router.refresh();
  }


  // --- render: pannello ---
  function headHTML() {
    const c = counts();
    const mine = !!duty && duty.id === myOrg && !isAdmin;
    const tag = mine ? (
      <span className="tag tag-me">Tocca a voi</span>
    ) : isAdmin ? (
      <span className="tag">Vista coordinamento</span>
    ) : (
      <span className="tag">Sola consultazione</span>
    );
    return (
      <>
        <div className="duty">
          <div>
            <p className="eyebrow">Stasera in uscita</p>
            <p className="dutyname">{dutyName}</p>
          </div>
          {tag}
        </div>
        <div
          className="progress"
          role="img"
          aria-label={`${c.d} serviti, ${c.m} non trovati, ${c.t} da servire`}
        >
          <span className="pg-done" style={{ flex: c.d }} />
          <span className="pg-missing" style={{ flex: c.m }} />
          <span className="pg-todo" style={{ flex: c.t }} />
        </div>
        <p className="pgtxt">
          <strong>{part(c, "t")}</strong> da servire · <strong>{part(c, "d")}</strong> serviti ·{" "}
          <strong>{part(c, "m")}</strong> non trovati
          {c.p ? (
            <>
              <br />
              <span className="pgnote">tra parentesi: utenti + proposte</span>
            </>
          ) : null}
        </p>
      </>
    );
  }

  function tabsHTML() {
    const t = (id: Tab, label: string, badge?: number) => (
      <button
        key={id}
        className="tab"
        role="tab"
        type="button"
        aria-selected={tab === id}
        onClick={() => {
          setSelected(null);
          setTab(id);
        }}
      >
        {label}
        {badge != null ? <span className="badge">{badge}</span> : null}
      </button>
    );
    return (
      <div className="tabs" role="tablist">
        {t("utenti", "Stasera", counts().t)}
        {t("proposte", "Proposte", visibleProps.length)}
        {t("calendario", "Calendario")}
        {!isAdmin && myOrg ? t("mine", "Il tuo report") : null}
        {isAdmin && t("report", "Report")}
      </div>
    );
  }

  function listHTML() {
    const order: Record<Status, number> = { todo: 0, missing: 1, done: 2 };
    const items = [
      ...users.map((u) => ({ kind: "user" as const, id: u.id, name: u.name, desc: u.description, s: statusOf(u) })),
      ...visibleProps.map((p) => ({ kind: "prop" as const, id: p.id, name: p.name, desc: p.description, s: propTonight(p) })),
    ].sort((a, b) => order[a.s] - order[b.s] || a.name.localeCompare(b.name));
    return (
      <>
        <button className="btn btn-prop" type="button" onClick={startPropose}>
          Proponi un nuovo utente
        </button>
        <ul className="list">
          {items.map((it) => (
            <li key={it.kind + it.id}>
              <button className="row" type="button" onClick={() => select(it.kind, it.id, false)}>
                <span className={`dot${it.kind === "prop" ? " pr" : ""} st-${it.s}`} />
                <span className="rowmain">
                  <span className="rowname">{it.name}</span>
                  <span className="rowdesc">{it.desc}</span>
                </span>
                <span className="rowst">
                  {ST_LABEL[it.s]}
                  {it.kind === "prop" ? (
                    <>
                      <br />
                      proposta
                    </>
                  ) : null}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </>
    );
  }

  function propsTabHTML() {
    const v = [...visibleProps].sort((a, b) => a.created_at.localeCompare(b.created_at));
    return (
      <>
        <button className="btn btn-prop" type="button" onClick={startPropose}>
          Proponi un nuovo utente
        </button>
        {!v.length && (
          <p className="notice">Nessuna proposta in attesa. Le proposte restano sulla mappa per 7 giorni.</p>
        )}
        {!!v.length && (
          <ul className="list">
            {v.map((p) => {
              const l = daysLeft(p);
              return (
                <li key={p.id}>
                  <button className="row" type="button" onClick={() => select("prop", p.id, false)}>
                    <span className={`dot pr st-${propTonight(p)}`} />
                    <span className="rowmain">
                      <span className="rowname">{p.name}</span>
                      <span className="rowdesc">
                        Proposto da {orgName(p.proposed_by, orgs)} · {VER_TXT[propVer(p)]} · visibile ancora{" "}
                        {l}
                        {l === 1 ? " giorno" : " giorni"}
                      </span>
                    </span>
                  </button>
                  {isAdmin && (
                    <div className="actions">
                      <button className="btn btn-ok btn-sm" type="button" onClick={() => validate(p)}>
                        Valida
                      </button>
                      <button className="btn btn-sm" type="button" onClick={() => reject(p)}>
                        Rifiuta
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {isAdmin && !!expiredProps.length && (
          <>
            <p className="subhead">Scadute, non più sulla mappa</p>
            <ul className="list">
              {expiredProps.map((p) => (
                <li key={p.id}>
                  <div className="row" style={{ cursor: "default" }}>
                    <span className="dot st-missing" />
                    <span className="rowmain">
                      <span className="rowname">{p.name}</span>
                      <span className="rowdesc">
                        Scaduta il {fmtDM(expTime(p))} · proposta da {orgName(p.proposed_by, orgs)}
                      </span>
                    </span>
                  </div>
                  <div className="actions">
                    <button className="btn btn-ok btn-sm" type="button" onClick={() => validate(p)}>
                      Valida comunque
                    </button>
                    <button className="btn btn-sm" type="button" onClick={() => reject(p)}>
                      Elimina
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </>
    );
  }

  function panelBody(): ReactNode {
    if (loading) return <p className="notice">Caricamento dei dati…</p>;
    if (loadErr)
      return (
        <p className="err">
          Impossibile caricare i dati da Supabase: {loadErr}
        </p>
      );
    if (placing)
      return <ProposeForm pos={draftPos} isAdmin={isAdmin} onCancel={cancelPropose} onSubmit={doPropose} />;
    if (selected) {
      if (selected.kind === "user") {
        const u = users.find((x) => x.id === selected.id);
        if (u)
          return (
            <Popup title={u.name} onClose={back}>
            <UserDetail
              user={u}
              status={statusOf(u)}
              tonight={tonightLog(u.id) || null}
              past={logs
                .filter((l) => l.user_id === u.id && l.date !== today())
                .sort((a, b) => b.date.localeCompare(a.date))}
              canRecord={canRecord}
              orgs={orgs}
              readOnlyMsg={dutyMsg(
                ". Con questo accesso puoi consultare la scheda, ma non registrare gli esiti."
              )}
              onSave={(v) => saveUserEntry(u.id, v)}
            />
            </Popup>
          );
      } else {
        const p = proposals.find((x) => x.id === selected.id && x.status === "pending");
        if (p)
          return (
            <Popup title={p.name} onClose={back}>
            <PropDetail
              p={p}
              orgs={orgs}
              isAdmin={isAdmin}
              expired={daysLeft(p) <= 0}
              canVerify={!isAdmin && !!duty && duty.id === myOrg}
              verifyMsg={dutyMsg(": tocca a loro andare a trovare l'utente.")}
              expTime={expTime(p)}
              onSaveVer={(v) => saveVerification(p.id, v)}
              onValidate={() => validate(p)}
              onReject={() => reject(p)}
              onDelete={!isAdmin && !!myOrg ? () => deleteProposal(p.id) : null}
              canDelete={!isAdmin && !!myOrg && p.proposed_by === myOrg}
              myOrg={myOrg}
            />
            </Popup>
          );
      }
    }
    return (
      <>
        {headHTML()}
        {tabsHTML()}
        {tab === "calendario" ? (
          <CalendarView
            orgs={orgs}
            settings={settings}
            overrides={overrides}
            isAdmin={isAdmin}
            myOrg={myOrg}
            calAll={calAll}
            setCalAll={setCalAll}
            calMsg={calMsg}
            onSetOverride={setOverride}
            onSaveSettings={saveSettings}
            onApplyText={applyCalText}
          />
        ) : tab === "report" && isAdmin ? (
          <ReportView orgs={orgs} users={users} logs={logs} proposals={proposals} rep={rep} setRep={setRep} />
        ) : tab === "mine" && !isAdmin && myOrg ? (
          <OrgReport orgs={orgs} users={users} logs={logs} proposals={proposals} myOrg={myOrg} />
        ) : tab === "proposte" ? (
          propsTabHTML()
        ) : (
          listHTML()
        )}
      </>
    );
  }

  // --- legenda e layout ---
  const c = counts();
  const legend = (
    <ul className="legend">
      <li>
        <span className="dot st-todo" /> Da servire <b>{part(c, "t")}</b>
      </li>
      <li>
        <span className="dot st-done" /> Serviti <b>{part(c, "d")}</b>
      </li>
      <li>
        <span className="dot st-missing" /> Non trovati <b>{part(c, "m")}</b>
      </li>
      {c.p ? (
        <li>
          <span className="dot pr st-todo" /> Proposte (bordo tratteggiato, più piccole) <b>{c.p}</b>
        </li>
      ) : null}
    </ul>
  );

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <h1>Accoglienza Invernale</h1>
          <p className="mono">{fmtDay(today())}</p>
        </div>
        <div className="who">
          <label>Accesso come</label>
          <div className="duty" style={{ alignItems: "center" }}>
            <span className="dutyname" style={{ fontSize: "15px" }}>
              {profile.display_name || orgName(myOrgId(), orgs)}
            </span>
            <button className="linkbtn" type="button" onClick={signOut}>
              Esci
            </button>
          </div>
        </div>
      </header>

      <MapView
        items={mapItems}
        selected={selected}
        placing={placing}
        focusTo={focus}
        onSelect={select}
        onPlace={(lat, lng) => setDraftPos({ lat, lng })}
        overlays={
          <>
            {placing && <div className="hint">Tocca la mappa per indicare dove dorme l&apos;utente.</div>}
            {legend}
          </>
        }
      />

      <aside className="panel" id="panel" aria-live="polite">
        {panelBody()}
        <div className="foot">
          <p>Dati salvati su Supabase · mappa © OpenStreetMap contributors</p>
        </div>
      </aside>

      {toastMsg && (
        <div className="toast" role="status">
          {toastMsg}
        </div>
      )}
    </div>
  );
}






