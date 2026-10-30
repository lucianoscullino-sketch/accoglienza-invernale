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
import StopDetail from "@/components/StopDetail";
import Popup from "@/components/Popup";
import CalendarView from "@/components/CalendarView";
import ReportView from "@/components/ReportView";
import OrgReport from "@/components/OrgReport";
import AdminPanel from "@/components/AdminPanel";
import { supabase } from "@/lib/supabase";
import type {
  CalendarOverride,
  DailyLog,
  Notice,
  Org,
  Profile,
  Proposal,
  ProposalVerification,
  ServiceUser,
  Settings,
  Status,
  Stop,
} from "@/lib/types";
import { effDutyId } from "@/lib/duty";
import { DAY, ST_LABEL, VER_TXT, addDaysKey, fmtDay, fmtDM, orgName, parseCal, today } from "@/lib/format";
import { openGoogleMaps } from "@/lib/maps";
import { allRecs } from "@/lib/report";
import { downloadExcel, reportFileName } from "@/lib/excel";

type Tab =
  | "utenti"
  | "proposte"
  | "associazioni"
  | "calendario"
  | "report"
  | "mine";

// --- stato "letto" del popup di briefing, in localStorage (nessuna migrazione) ---
// LS_AVVISI: ids degli avvisi già letti su questo dispositivo (il popup torna
// solo per i nuovi). LS_BRIEF: data (YYYY-MM-DD) dell'ultimo riepilogo di
// uscita mostrato, per non ripresentarlo più volte nello stesso giorno.
const LS_AVVISI = "accoglienza:avvisi-letti";
const LS_BRIEF = "accoglienza:brief-uscita";
const lsGet = (k: string): string | null => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const lsSet = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* storage non disponibile (private mode): il banner resta la fonte */
  }
};
const seenNoticeIds = (): string[] => {
  try {
    return JSON.parse(lsGet(LS_AVVISI) || "[]") as string[];
  } catch {
    return [];
  }
};

export default function App({ profile }: { profile: Profile }) {
  const router = useRouter();

  // --- dati condivisi ---
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [users, setUsers] = useState<ServiceUser[]>([]);
  const [suspendedUsers, setSuspendedUsers] = useState<ServiceUser[]>([]);
  const [deletedUsers, setDeletedUsers] = useState<ServiceUser[]>([]);
  const [showSuspended, setShowSuspended] = useState(false);
  const [showDeleted, setShowDeleted] = useState(false);
  const [stops, setStops] = useState<Stop[]>([]);
  // Bandierina "Proposte" sulla mappa (attiva di default): mostra i pin viola.
  const [showProps, setShowProps] = useState(true);
  const [logs, setLogs] = useState<DailyLog[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [overrides, setOverrides] = useState<CalendarOverride[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  // Avvisi del coordinamento a TUTTE le associazioni (migrazione 0013):
  // restano in testata al pannello di ogni account finché non vengono rimossi.
  const [notices, setNotices] = useState<Notice[]>([]);
  const [noticesErr, setNoticesErr] = useState("");
  // Tappe marcate come servite dal coordinamento (anche se non hanno utenti)
  const [servedStops, setServedStops] = useState<Set<string>>(new Set());
  // Composizione dell'avviso (solo coordinamento), aperta dal tab Comunicazioni.
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [noticeDraft, setNoticeDraft] = useState("");
  const [noticeBusy, setNoticeBusy] = useState(false);
  // Popup di "briefing" all'accesso (solo associazioni): avvisi non ancora letti
  // e, il giorno della propria uscita, sommario dell'uscita della sera prima.
  // Visto/letto è derivato da questi stati (localStorage in lazy-init, null con
  // SSR): senza effect, per non innescare render a cascata.
  const [seenIds, setSeenIds] = useState<string[]>(() => seenNoticeIds());
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState("");
  // Generazione scaricabile del report del giorno precedente (popup briefing).
  const [busyBriefXlsx, setBusyBriefXlsx] = useState(false);
  // Chiusura temporanea del popup per questa sessione (si resetta al refresh).
  const [briefClosed, setBriefClosed] = useState(false);

  // --- stato interfaccia ---
  const [tab, setTab] = useState<Tab>("utenti");
  const [selected, setSelected] = useState<Selection | null>(null);
  const [placing, setPlacing] = useState(false);
  const [draftPos, setDraftPos] = useState<{ lat: number; lng: number } | null>(null);
  const [focus, setFocus] = useState<{ lat: number; lng: number; n: number } | null>(null);
  const [creatingStop, setCreatingStop] = useState(false);
  const [stopName, setStopName] = useState("");
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
      const problems: string[] = [];
      try {
        const sb = supabase();
        // La colonna profiles.created_at potrebbe mancare se il DB di
        // produzione non è allineato alle migrazioni: in quel caso
        // "order by created_at" fallisce con "column ... does not exist".
        // Proviamo con l'ordinamento e, se manca la colonna, ricarichiamo
        // i profili senza ordinamento (l'app resta pienamente funzionante).
        const prPromise = (async () => {
          const ordered = await sb.from("profiles").select("*").order("created_at", { ascending: true });
          if (ordered.error && /created_at/i.test(ordered.error.message || "")) {
            return sb.from("profiles").select("*");
          }
          return ordered;
        })();
        const [o, pr, u, l, p, c, s, su, st, nt] = await Promise.all([
          sb.from("organizations").select("id, name").order("name"),
          prPromise,
          sb.from("service_users").select("*").eq("active", true),
          sb.from("daily_logs").select("*").order("date", { ascending: false }).limit(3000),
          sb.from("proposals")
            .select("*, verifications:proposal_verifications(*)")
            .order("created_at", { ascending: false }),
          sb.from("calendar_overrides").select("*"),
          sb.from("settings").select("*").eq("id", "main").maybeSingle(),
          sb.from("stops").select("*").order("name"),
          // Le utenze non attive (sospese o eliminate): servono al coordinamento
          // per riattivarle/ripristinarle e, per tutti i ruoli, per poterle
          // mostrare su mappa con i flag "Sospesi"/"Eliminati" (off di default).
          sb.from("service_users").select("*").eq("active", false),
          // Avvisi del coordinamento (tabella della migrazione 0013): se manca,
          // l'errore è gestito sotto in modo NON bloccante.
          sb.from("notices").select("*").order("created_at", { ascending: false }),
        ]);
        // Carichiamo ogni tabella in modo indipendente: un errore su una query
        // non deve più impedire il caricamento di tutte le altre (prima bastava
        // una tabella in errore per svuotare l'intera app).
        const msg = (e: unknown): string => {
          if (!e) return "errore sconosciuto";
          if (typeof e === "string") return e;
          const m = (e as { message?: string }).message;
          return m || JSON.stringify(e);
        };
        if (o.error) problems.push(`associazioni: ${msg(o.error)}`);
        else setOrgs((o.data || []) as Org[]);
        if (pr.error) problems.push(`profili: ${msg(pr.error)}`);
        else setProfiles((pr.data || []) as Profile[]);
        if (u.error) problems.push(`utenti: ${msg(u.error)}`);
        else setUsers((u.data || []) as ServiceUser[]);
        if (su.error) problems.push(`utenze sospese: ${msg(su.error)}`);
        else {
          // Separiamo le sospese (reversibili) dalle eliminate (soft-delete).
          const inactive = (su.data || []) as ServiceUser[];
          setSuspendedUsers(inactive.filter((x) => !x.deleted));
          setDeletedUsers(inactive.filter((x) => !!x.deleted));
        }
        if (l.error) problems.push(`registri: ${msg(l.error)}`);
        else setLogs((l.data || []) as DailyLog[]);
        if (p.error) problems.push(`proposte: ${msg(p.error)}`);
        else
          setProposals(
            ((p.data || []) as Proposal[]).map((x) => ({
              ...x,
              verifications: [...(x.verifications || [])].sort((a, b) => a.date.localeCompare(b.date)),
            }))
          );
        if (c.error) problems.push(`calendario: ${msg(c.error)}`);
        else setOverrides((c.data || []) as CalendarOverride[]);
        if (s.error) problems.push(`impostazioni: ${msg(s.error)}`);
        else if (s.data) setSettings(s.data as Settings);
        if (st.error) problems.push(`tappe: ${msg(st.error)}`);
        else setStops((st.data || []) as Stop[]);
        // Avvisi: errore NON bloccante. La tabella arriva con la migrazione
        // 0013; se non è ancora applicata l'app resta pienamente funzionante
        // e l'errore viene mostrato al solo coordinamento nel tab Comunicazioni.
        if (nt.error) setNoticesErr(msg(nt.error));
        else setNotices((nt.data || []) as Notice[]);
      } catch (e) {
        // Errore di rete/client (env mancanti, fetch fallito, ecc.)
        problems.push(e instanceof Error ? e.message : String(e));
      } finally {
        if (dead) return;
        if (problems.length) setLoadErr(problems.join(" · "));
        setLoading(false);
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
  const dutyMsg = (suffix: string) =>
    duty ? `Stasera è in uscita ${duty.name}${suffix}` : "Stasera non c'è un'uscita in calendario.";

  // --- briefing all'accesso (solo associazioni) ---
  // Dati del riepilogo: ieri (la sera prima) e i suoi esiti registrati.
  const yKey = addDaysKey(-1);
  const dutyYesterday = dutyOrg(yKey);
  const yLogs = logs.filter((l) => l.date === yKey);
  const yFound = yLogs.filter((l) => l.found).length;
  const yWithNotes = yLogs.filter((l) => (l.note || "").trim()).length;
  const myTurnToday = !!duty && duty.id === myOrg;
  // Popup di briefing: si ripresenta a ogni refresh finché l'associazione ha
  // il turno stasera (riepilogo della sera prima), più eventuali avvisi del
  // coordinamento non ancora letti (una volta per dispositivo, per avviso).
  const briefUnseen = isAdmin || !myOrg ? [] : notices.filter((n) => !seenIds.includes(n.id));
  const briefOpen = !briefClosed && (briefUnseen.length > 0 || myTurnToday);

  const tonightLog = (uid: string) => logs.find((l) => l.user_id === uid && l.date === today());
  const statusOf = (u: ServiceUser): Status => {
    const l = tonightLog(u.id);
    return !l ? "todo" : l.found ? "done" : "missing";
  };
  const expTime = (p: Proposal) => new Date(p.created_at).getTime() + 7 * DAY;
  const visibleProps = showProps
    ? proposals.filter(
        (p) => p.status === "pending" && !p.suspended && Date.now() < expTime(p)
      )
    : [];
  const expiredProps = showProps
    ? proposals.filter(
        (p) => p.status === "pending" && !p.suspended && Date.now() >= expTime(p)
      )
    : [];
  const daysLeft = (p: Proposal) => Math.ceil((expTime(p) - Date.now()) / DAY);
  // Proposte eliminate dal coordinamento (soft-delete): fuori da mappa ed
  // elenchi di default, ma rivisibili con il flag "Eliminati" come le utenze.
  const deletedProps = proposals.filter((p) => p.suspended && p.status === "rejected");
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

  const mapItems: MapItem[] = [
    // Le tappe sono sempre mostrate (anche se vuote); sospese/eliminate solo
    // con i relativi flag attivi.
    ...stops.filter((s) => s.status === "active").map((s) => {
      // Calcola lo stato della tappa basandosi sui suoi utenti associati
      const usersInStop = users.filter((u) => u.stop_id === s.id);
      const doneUsers = usersInStop.filter((u) => {
        const l = tonightLog(u.id);
        return l && l.found;
      });
      // Se il coordinamento ha marcato la tappa come servita, forza "done"
      const stServed = servedStops.has(s.id) ? ("done" as Status) : undefined;
      // La tappa è "done" se almeno un utente è stato servito,
      // "missing" se ci sono utenti ma nessuno è stato servito, "todo" se nessun utente
      const st = stServed !== undefined ? stServed : doneUsers.length > 0 ? ("done" as Status) : usersInStop.length > 0 ? ("missing" as Status) : ("todo" as Status);
      return {
        kind: "stop" as const,
        id: s.id,
        lat: s.lat,
        lng: s.lng,
        st,
        name: s.name,
      };
    }),
    ...(showSuspended
      ? stops
          .filter((s) => s.status === "suspended")
          .map((s) => ({
            kind: "stop" as const,
            id: s.id,
            lat: s.lat,
            lng: s.lng,
            st: "missing" as Status,
            name: s.name,
            tip: "sospeso",
            inactive: "susp" as const,
          }))
      : []),
    ...(showDeleted
      ? stops
          .filter((s) => s.status === "deleted")
          .map((s) => ({
            kind: "stop" as const,
            id: s.id,
            lat: s.lat,
            lng: s.lng,
            st: "missing" as Status,
            name: s.name,
            tip: "eliminato",
            inactive: "del" as const,
          }))
      : []),
    // Candidati fuori tappa (stop_id === null): pin viola sulla mappa.
    ...visibleProps
      .filter((p) => !p.stop_id)
      .map((p) => {
        const st = propTonight(p),
          v = propVer(p);
        return {
          kind: "prop" as const,
          id: p.id,
          lat: p.lat,
          lng: p.lng,
          st,
          name: p.name,
          ver: v,
          tip: `proposta, ${ST_LABEL[st].toLowerCase()}, ${VER_TXT[v]}`,
          stop_id: p.stop_id,
        };
      }),
    // Proposte eliminate fuori tappa, visibili col flag "Eliminati".
    ...(showDeleted
      ? deletedProps.filter((p) => !p.stop_id).map((p) => ({
          kind: "prop" as const,
          id: p.id,
          lat: p.lat,
          lng: p.lng,
          st: "missing" as Status,
          name: p.name,
          tip: "proposta eliminata",
          inactive: "del" as const,
          stop_id: p.stop_id,
        }))
      : []),
    ...(placing && draftPos
      ? [{ kind: "draft" as const, id: "draft", lat: draftPos.lat, lng: draftPos.lng, st: "prop" as const, name: "Nuova proposta" }]
      : []),
  ];

  // --- selezione e proposta ---
  function select(kind: "user" | "prop" | "stop", id: string, fromMap: boolean) {
    setSelected({ kind, id });
    setPlacing(false);
    if (fromMap) {
      const o =
        kind === "stop"
          ? stops.find((s) => s.id === id)
          : kind === "user"
            ? users.find((u) => u.id === id)
            : proposals.find((p) => p.id === id);
      if (o) setFocus({ lat: o.lat, lng: o.lng, n: Date.now() });
    } else {
      if (typeof window !== "undefined" && window.matchMedia("(max-width:899px)").matches) {
        document.getElementById("panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
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
  function startCreateStop() {
    setCreatingStop(true);
    setPlacing(true);
    setSelected(null);
    setDraftPos(null);
    setStopName("");
  }
  function cancelCreateStop() {
    setCreatingStop(false);
    setPlacing(false);
    setDraftPos(null);
    setStopName("");
  }
  async function doCreateStop() {
    if (!draftPos || !stopName.trim()) return;
    try {
      const { data, error } = await supabase()
        .from("stops")
        .insert({
          name: stopName.trim(),
          lat: draftPos.lat,
          lng: draftPos.lng,
          status: "active",
        })
        .select()
        .single();
      if (error) throw error;
      setStops((prev) => [data as Stop, ...prev]);
      cancelCreateStop();
      toast("Tappa creata");
    } catch (err: any) {
      const msg = err?.message || (err?.error?.message) || (err?.details) || JSON.stringify(err) || "riprova";
      toast("Errore: " + msg);
    }
  }

  // --- azioni sulle tappe (solo coordinamento) ---

  async function saveStop(sid: string, patch: { name: string; lat: number; lng: number; note: string }) {
    try {
      const { error } = await supabase().from("stops").update({ name: patch.name, lat: patch.lat, lng: patch.lng, note: patch.note || null }).eq("id", sid);
      if (error) throw error;
      setStops((prev) => prev.map((s) => (s.id === sid ? { ...s, ...patch } : s)));
      toast("Tappa salvata");
    } catch (err) {
      toast("Errore: " + (err instanceof Error ? err.message : String(err)));
    }
  }

  async function suspendStop(sid: string) {
    try {
      const { error } = await supabase().from("stops").update({ status: "suspended" }).eq("id", sid);
      if (error) throw error;
      setStops((prev) => prev.map((s) => (s.id === sid ? { ...s, status: "suspended" as const } : s)));
      setSelected(null);
      toast("Tappa sospesa");
    } catch (err) {
      toast("Errore: " + (err instanceof Error ? err.message : String(err)));
    }
  }

  async function restoreStop(sid: string) {
    try {
      const { error } = await supabase().from("stops").update({ status: "active" }).eq("id", sid);
      if (error) throw error;
      setStops((prev) => prev.map((s) => (s.id === sid ? { ...s, status: "active" as const } : s)));
      setSelected(null);
      toast("Tappa riattivata");
    } catch (err) {
      toast("Errore: " + (err instanceof Error ? err.message : String(err)));
    }
  }

  async function deleteStop(sid: string) {
    try {
      const { error } = await supabase().from("stops").delete().eq("id", sid);
      if (error) throw error;
      setStops((prev) => prev.filter((s) => s.id !== sid));
      setSelected(null);
      toast("Tappa eliminata");
    } catch (err) {
      toast("Errore: " + (err instanceof Error ? err.message : String(err)));
    }
  }


// Tappa marcata come servita dal coordinamento
  async function markStopAsServed(sid: string) {
    try {
      setServedStops((prev) => {
        const next = new Set(prev);
        next.add(sid);
        return next;
      });
      toast("Tappa marcata come servita");
    } catch (err) {
      toast("Errore: " + (err instanceof Error ? err.message : String(err)));
    }
  }
  // --- azioni: scritture su Supabase ---
  const myOrgId = () => (isAdmin ? "admin" : myOrg || "admin");

  // Nota stabile del coordinamento su un utente (solo admin può modificarla).
  async function saveUserNote(uid: string, note: string) {
    try {
      const { error } = await supabase().from("service_users").update({ note }).eq("id", uid);
      if (error) throw error;
      setUsers((prev) => prev.map((x) => (x.id === uid ? { ...x, note } : x)));
      toast("Nota salvata");
    } catch (e) {
      toast("Errore nel salvataggio della nota: " + (e instanceof Error ? e.message : "riprova"));
    }
  }

  // Modifica dei dati anagrafici di un utente (nome, descrizione, posizione e
  // nota stabile). Consentita al coordinamento su tutte le utenze e alle
  // associazioni solo su quelle create da loro (RLS "users owner update").
  // La nota stabile resta competenza del coordinamento, quindi per le
  // associazioni la salviamo solo se l'utente è admin.
  async function saveUserData(
    uid: string,
    patch: { name: string; description: string; lat: number; lng: number; note: string }
  ) {
    try {
      const payload: Record<string, unknown> = {
        name: patch.name,
        description: patch.description,
        lat: patch.lat,
        lng: patch.lng,
      };
      if (isAdmin) payload.note = patch.note;
      const { error } = await supabase().from("service_users").update(payload).eq("id", uid);
      if (error) throw error;
      setUsers((prev) =>
        prev.map((x) =>
          x.id === uid
            ? {
                ...x,
                name: patch.name,
                description: patch.description,
                lat: patch.lat,
                lng: patch.lng,
                note: isAdmin ? patch.note : x.note,
              }
            : x
        )
      );
      toast("Dati utente aggiornati");
    } catch (e) {
      toast("Errore nel salvataggio: " + (e instanceof Error ? e.message : "riprova"));
      throw e;
    }
  }

  // Sospendere nasconde da mappa ed elenchi ma tiene il record (reversibile);
  // eliminare cancella definitivamente (esiti via cascade). La colonna active
  // esiste già, quindi la sospensione funziona anche senza la migrazione 0007.
  async function suspendUser(u: ServiceUser, note: string) {
    try {
      const { error } = await supabase()
        .from("service_users")
        .update({ active: false, suspension_note: note })
        .eq("id", u.id);
      if (error) {
        if (/suspension_note/i.test(error.message || "")) {
          // Colonna nota assente: sospendiamo comunque senza motivo.
          const r2 = await supabase().from("service_users").update({ active: false }).eq("id", u.id);
          if (r2.error) throw r2.error;
        } else throw error;
      }
      setUsers((prev) => prev.filter((x) => x.id !== u.id));
      setSuspendedUsers((prev) => [{ ...u, active: false, suspension_note: note }, ...prev]);
      toast(`Utenza "${u.name}" sospesa: non sarà più visualizzata su mappa ed elenchi.`);
    } catch (e) {
      toast("Errore nella sospensione: " + (e instanceof Error ? e.message : "riprova"));
    }
  }

  async function resumeUser(u: ServiceUser) {
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
      setUsers((prev) => [{ ...u, active: true, suspension_note: "" }, ...prev]);
      toast(`Utenza "${u.name}" riattivata: torna su mappa ed elenchi.`);
    } catch (e) {
      toast("Errore nella riattivazione: " + (e instanceof Error ? e.message : "riprova"));
    }
  }

  async function deleteUser(u: ServiceUser, note: string) {
    // Soft-delete: nascondiamo l'utenza (deleted=true, active=false) invece di
    // cancellarla, così il coordinamento può ancora rivederla su mappa col flag
    // "Eliminati" e, se serve, ripristinarla.
    try {
      // .select() è indispensabile: senza, con RLS un update a vuoto non dà
      // errore ma 0 righe → falso successo (l'utente "sparisce" in memoria ma
      // ricompare al refresh). Così distinguiamo il successo reale.
      const { data, error } = await supabase()
        .from("service_users")
        .update({ active: false, deleted: true, suspension_note: note })
        .eq("id", u.id)
        .select("id");
      if (error) {
        // Colonna "deleted" assente (migrazione 0008 non applicata): ripieghiamo
        // sulla disattivazione, che resta comunque un soft-delete reversibile.
        if (/deleted/i.test(error.message || "")) {
          const r2 = await supabase()
            .from("service_users")
            .update({ active: false })
            .eq("id", u.id)
            .select("id");
          if (r2.error) throw r2.error;
          if (!r2.data || r2.data.length === 0) {
            toast("Impossibile nascondere l'utenza: permessi insufficienti. Esegui la migrazione 0011.");
            return;
          }
          setUsers((prev) => prev.filter((x) => x.id !== u.id));
          setSuspendedUsers((prev) => prev.filter((x) => x.id !== u.id));
          toast(`Utenza "${u.name}" nascosta. Per rivederla tra gli «Eliminati» esegui la migrazione 0011.`);
          setSelected(null);
          return;
        }
        throw error;
      }
      if (!data || data.length === 0) {
        // Nessuna riga aggiornata: la policy RLS ha "nascosto" la riga oppure
        // manca la migrazione. Messaggio esplicito invece del silenzio.
        toast("Impossibile aggiornare lo stato dell'utenza (permessi o migrazione 0011 non applicata).");
        return;
      }
      setUsers((prev) => prev.filter((x) => x.id !== u.id));
      setSuspendedUsers((prev) => prev.filter((x) => x.id !== u.id));
      setDeletedUsers((prev) => [{ ...u, active: false, deleted: true, suspension_note: note }, ...prev]);
      toast(`Utenza "${u.name}" eliminata: non sarà più visibile (la ritrovi col flag "Eliminati" su mappa).`);
      setSelected(null);
    } catch (e) {
      toast("Errore nell'eliminazione: " + (e instanceof Error ? e.message : "riprova"));
    }
  }

  // Nota: l'eliminazione è sempre soft (reversibile). L'eliminazione fisica non
  // è più usata dall'app perché rischia di fallire sui vincoli (proposals) e di
  // perdere dati; la migrazione 0011 garantisce lo schema del soft-delete.

  // Ripristina un'utenza eliminata (soft-delete) riportandola attiva.
  async function restoreUser(u: ServiceUser) {
    try {
      const { error } = await supabase()
        .from("service_users")
        .update({ active: true, deleted: false, suspension_note: "" })
        .eq("id", u.id);
      if (error) {
        if (/deleted/i.test(error.message || "")) {
          const r2 = await supabase().from("service_users").update({ active: true }).eq("id", u.id);
          if (r2.error) throw r2.error;
        } else throw error;
      }
      setDeletedUsers((prev) => prev.filter((x) => x.id !== u.id));
      setUsers((prev) => [{ ...u, active: true, deleted: false, suspension_note: "" }, ...prev]);
      toast(`Utenza "${u.name}" ripristinata: torna su mappa ed elenchi.`);
    } catch (e) {
      toast("Errore nel ripristino: " + (e instanceof Error ? e.message : "riprova"));
    }
  }

  // Esito di stasera di una PROPOSTA (visita in campo): upsert su
  // proposal_verifications (unique su proposal_id,date), firmato dall'associazione.
  // Restituisce true se salvato: la scheda si chiude da sola per tornare
  // all'elenco/mappa. In caso di errore resta aperta, così si può riprovare.
  async function saveVerification(pid: string, v: EntryValues): Promise<boolean> {
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
      return true;
    } catch (e) {
      toast("Errore nel salvataggio: " + (e instanceof Error ? e.message : "riprova"));
      return false;
    }
  }

  // Report del giorno precedente (scaricabile), offerto nel popup di briefing
  // quando l'associazione ha il turno stasera: righe di ieri (utenze + proposte
  // non validate), stesso formato del report di coordinamento.
  async function downloadBriefXlsx(): Promise<void> {
    if (!yLogs.length) {
      toast("Nessun esito registrato ieri da scaricare");
      return;
    }
    setBusyBriefXlsx(true);
    try {
      const rows = allRecs(users, logs, proposals).filter((r) => r.date === yKey);
      await downloadExcel(
        rows,
        orgs,
        `Report ${fmtDay(yKey)}`,
        reportFileName("report_accoglienza", yKey)
      );
    } finally {
      setBusyBriefXlsx(false);
    }
  }

  // Esito di stasera di un utente REGOLARE: upsert su daily_logs (unique su
  // user_id,date), firmato dall'organizzazione che registra. È ciò che fa
  // accendere il pin verde/grigio sulla mappa (statusOf legge proprio questi log).
  // Restituisce true se salvato: in quel caso la scheda si chiude da sola per
  // tornare all'elenco/mappa. In caso di errore resta aperta, così si può riprovare.
  async function saveUserLog(uid: string, v: EntryValues): Promise<boolean> {
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
      setLogs((prev) => [
        ...prev.filter((l) => !(l.user_id === uid && l.date === row.date)),
        rec,
      ]);
      toast("Esito registrato, firmato " + orgName(row.org_id, orgs));
      return true;
    } catch (e) {
      toast("Errore nel salvataggio: " + (e instanceof Error ? e.message : "riprova"));
      return false;
    }
  }

  // Segnalazione al coordinamento per un'utenza sospesa/eliminata ritrovata in
  // strada: registriamo un log "trovato" di oggi firmato dall'associazione, senza
  // riattivare l'utenza (la decisione spetta al coordinamento). Nessuna
  // migrazione: riusiamo daily_logs come traccia (policy "logs insert" consente
  // org_id proprio), così il coordinamento la vede in scheda e nei report.
  async function reportUserFound(uid: string) {
    try {
      const row = {
        user_id: uid,
        date: today(),
        org_id: myOrgId(),
        found: true,
        provided: [] as string[],
        requested: "",
        note: "Segnalazione associazione: utenza non attiva ritrovata in strada. Valutare la riattivazione col coordinamento.",
        created_by: profile.id,
      };
      const { data, error } = await supabase()
        .from("daily_logs")
        .upsert(row, { onConflict: "user_id,date" })
        .select()
        .single();
      if (error) throw error;
      const rec = data as DailyLog;
      setLogs((prev) => [
        ...prev.filter((l) => !(l.user_id === uid && l.date === row.date)),
        rec,
      ]);
      toast("Segnalazione inviata al coordinamento: grazie.");
    } catch (e) {
      toast("Errore nella segnalazione: " + (e instanceof Error ? e.message : "riprova"));
    }
  }

  // Estrae il messaggio da un errore Supabase (postgrestError non è sempre
  // un'istanza di Error): serve per i toast senza perdere il testo reale.
  const errMsg = (e: unknown): string => {
    if (e instanceof Error) return e.message;
    if (e && typeof e === "object" && "message" in e) return String((e as { message: unknown }).message);
    return "riprova";
  };

  // Pubblica un avviso a TUTTE le associazioni (solo coordinamento). A differenza
  // del toast (effimero), l'avviso compare nel banner in testata al pannello di
  // ogni account e ci resta finché il coordinamento non lo rimuove.
  async function publishNotice() {
    const message = noticeDraft.trim();
    if (!message || noticeBusy) return;
    setNoticeBusy(true);
    try {
      const { data, error } = await supabase()
        .from("notices")
        .insert({ message, created_by: profile.id })
        .select()
        .single();
      if (error) throw error;
      setNotices((prev) => [data as Notice, ...prev]);
      setNoticeDraft("");
      setNoticeOpen(false);
      toast("Avviso pubblicato: resta visibile a tutte le associazioni finché non lo rimuovi.");
    } catch (e) {
      const m = errMsg(e);
      toast(
        "Errore nella pubblicazione dell'avviso: " +
          m +
          (/notices|relation|does not exist/i.test(m) ? " · esegui la migrazione 0013_notices.sql" : "")
      );
    } finally {
      setNoticeBusy(false);
    }
  }

  // Rimozione dell'avviso (solo coordinamento): sparisce dal banner di tutti.
  async function removeNotice(id: string) {
    try {
      const { error } = await supabase().from("notices").delete().eq("id", id);
      if (error) throw error;
      setNotices((prev) => prev.filter((n) => n.id !== id));
      toast("Avviso rimosso: non è più visibile alle associazioni.");
    } catch (e) {
      toast("Errore nella rimozione dell'avviso: " + errMsg(e));
    }
  }

  // Chiusura del popup di briefing: segna gli avvisi mostrati come letti e nasconde
  // il popup per il resto della sessione (si ripresenta al refresh successivo).
  function closeBrief() {
    setBriefClosed(true);
    if (briefUnseen.length) {
      const merged = Array.from(new Set([...seenIds, ...briefUnseen.map((n) => n.id)]));
      lsSet(LS_AVVISI, JSON.stringify(merged.slice(-100)));
      setSeenIds(merged);
    }
    if (myTurnToday) {
      lsSet(LS_BRIEF, today());
    }
  }

  // Correzione di nome/descrizione di una proposta già inserita (refusi):
  // il Coordinamento su qualsiasi proposta, l'associazione su quelle che ha
  // proposto (policy "proposals owner update" in 0009).
  async function updateProposal(pid: string, patch: { name: string; description: string }) {
    try {
      const { data, error } = await supabase()
        .from("proposals")
        .update(patch)
        .eq("id", pid)
        .select("id");
      if (error) throw error;
      if (!data || data.length === 0) {
        toast("Non puoi modificare questa proposta (permessi o proposta non più in attesa).");
        return;
      }
      setProposals((prev) => prev.map((x) => (x.id === pid ? { ...x, ...patch } : x)));
      toast("Proposta aggiornata");
    } catch (e) {
      toast("Errore nel salvataggio: " + (e instanceof Error ? e.message : "riprova"));
    }
  }

  // Correzione di una visita già registrata su una proposta: il Coordinamento
  // può correggere tutte le righe, l'associazione solo le proprie (già
  // consentito dalla policy "verifs update"). La firma (org_id) non cambia.
  async function updateVerification(v: ProposalVerification, vals: EntryValues) {
    try {
      if (!v.id) {
        toast("Questa visita non è ancora sincronizzata: attendi il ricaricamento e riprova.");
        return;
      }
      const patch = {
        found: vals.found,
        provided: vals.provided,
        requested: vals.requested,
        note: vals.note,
      };
      const { data, error } = await supabase()
        .from("proposal_verifications")
        .update(patch)
        .eq("id", v.id)
        .select("id");
      if (error) throw error;
      if (!data || data.length === 0) {
        toast("Non puoi modificare questa visita (permessi).");
        return;
      }
      setProposals((prev) =>
        prev.map((p) =>
          p.id === v.proposal_id
            ? {
                ...p,
                verifications: (p.verifications || []).map((x) =>
                  x.id === v.id ? { ...x, ...patch } : x
                ),
              }
            : p
        )
      );
      toast("Visita corretta");
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
      // Se il candidato non è già in una tappa, ne creiamo una colocata a lui.
      let stopId = p.stop_id;
      if (!stopId) {
        const { data: ns, error: se } = await sb
          .from("stops")
          .insert({
            name: p.name,
            lat: p.lat,
            lng: p.lng,
            status: "active",
            note: "Tappa creata dalla validazione del candidato",
            created_by: myOrgId(),
          })
          .select()
          .single();
        if (se) throw se;
        stopId = ns.id;
        setStops((prev) => [...prev, ns as Stop]);
      }
      const { data: nu, error } = await sb
        .from("service_users")
        .insert({ name: p.name, description: p.description, lat: p.lat, lng: p.lng, created_by_org: p.proposed_by, stop_id: stopId })
        .select()
        .single();
      if (error) throw error;
      const newUser = nu as ServiceUser;
      const { error: e2 } = await sb
        .from("proposals")
        .update({ status: "validated", validated_into: newUser.id, stop_id: stopId })
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
      // .select("id"): senza, con RLS un update a vuoto non dà errore ma 0 righe.
      const { data, error } = await supabase()
        .from("proposals")
        .update({ status: "rejected" })
        .eq("id", p.id)
        .select("id");
      if (error) throw error;
      if (!data || data.length === 0) {
        toast("Impossibile rifiutare la proposta: permessi insufficienti.");
        return;
      }
      setProposals((prev) => prev.map((x) => (x.id === p.id ? { ...x, status: "rejected" } : x)));
      setSelected(null);
      toast("Proposta rimossa");
    } catch (e) {
      toast("Errore: " + (e instanceof Error ? e.message : "riprova"));
    }
  }

  // "Elimina" (solo coordinamento): soft-delete di una proposta da QUALUNQUE
  // stato (in attesa, validata, rifiutata, scaduta o già sospesa). La togliamo
  // da mappa ed elenchi marcandola suspended + status="rejected": così resta
  // tracciata nel DB e sparisce dalla lista "in attesa" (che filtra le
  // suspended). Rivedibile col flag "Eliminati" su mappa.
  async function deleteProposalAdmin(pid: string) {
    try {
      // .select("id") ci dice quante righe ha toccato davvero l'UPDATE.
      const { data, error } = await supabase()
        .from("proposals")
        .update({ status: "rejected", suspended: true, suspension_note: "eliminata dal coordinamento" })
        .eq("id", pid)
        .select("id");
      if (error) {
        // Colonna suspended/suspension_note assente (migrazione 0007/0012 non
        // applicata): ripieghiamo sul solo status="rejected", che la toglie
        // comunque da mappa ed elenchi (senza poterla rivedere tra gli Eliminati).
        if (/suspended|suspension_note/i.test(error.message || "")) {
          const r2 = await supabase()
            .from("proposals")
            .update({ status: "rejected" })
            .eq("id", pid)
            .select("id");
          if (r2.error) throw r2.error;
          if (!r2.data || r2.data.length === 0) {
            toast("Impossibile eliminare la proposta: permessi insufficienti.");
            return;
          }
          setProposals((prev) => prev.map((x) => (x.id === pid ? { ...x, status: "rejected" } : x)));
          setSelected(null);
          setTab("proposte");
          toast("Proposta rimossa dalla mappa. Per rivederla tra gli «Eliminati» esegui la migrazione 0012.");
          return;
        }
        throw error;
      }
      if (!data || data.length === 0) {
        toast("Impossibile eliminare la proposta: permessi insufficienti.");
        return;
      }
      setProposals((prev) =>
        prev.map((x) =>
          x.id === pid
            ? { ...x, status: "rejected", suspended: true, suspension_note: "eliminata dal coordinamento" }
            : x
        )
      );
      setSelected(null);
      setTab("proposte");
      toast("Proposta eliminata: non sarà più visibile su mappa ed elenchi.");
    } catch (e) {
      toast("Errore nell'eliminazione: " + (e instanceof Error ? e.message : "riprova"));
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
        <div className="duty" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div>
            <p className="eyebrow">Stasera in uscita</p>
            <p className="dutyname">{dutyName}</p>
          </div>
          {tag}
          <div className="duty-actions" style={{ marginLeft: "auto", display: "flex", gap: 8, flexShrink: 0 }}>
            {isAdmin && (
              <button
                className="btn"
                type="button"
                onClick={startCreateStop}
                style={{
                  minWidth: 190,
                  height: 52,
                  background: "#0f766e",
                  color: "#fff",
                  border: "none",
                  padding: "10px 24px",
                  fontSize: "15px",
                  borderRadius: "6px",
                  cursor: "pointer",
                }}
              >
                Crea tappa
              </button>
            )}
            <button
              className="btn btn-prop"
              type="button"
              onClick={startPropose}
              style={{
                minWidth: 190,
                height: 52,
                background: "#2563eb",
                color: "#fff",
                border: "none",
                padding: "10px 24px",
                fontSize: "15px",
                borderRadius: "6px",
                cursor: "pointer",
              }}
            >
              Proponi utente
            </button>
          </div>
        </div>
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
          // Uscita anche dalla modalità "posiziona sulla mappa" di una proposta,
          // così cambiare tab non lascia l'app bloccata in placement.
          cancelPropose();
          setTab(id);
        }}
      >
        {label}
        {badge != null ? <span className="badge">{badge}</span> : null}
      </button>
    );
    return (
      <div className="tabs" role="tablist">
        {t("utenti", "Stasera")}
        {t("proposte", "Comunicazioni")}
        {isAdmin && t("associazioni", "Associazioni")}
        {t("calendario", "Calendario")}
        {!isAdmin && myOrg ? t("mine", "Il tuo report") : null}
        {isAdmin && t("report", "Report")}
      </div>
    );
  }

  function listHTML() {
    const order: Record<string, number> = { active: 0, suspended: 1, deleted: 2 };
    // Elenca le tappe (non gli utenti) nel tab "Stasera"
    const items = [
      ...stops.map((s) => ({
        kind: "stop" as const,
        id: s.id,
        name: s.name,
        desc: s.note || "",
        status: s.status,
        usersCount: users.filter((u) => u.stop_id === s.id).length,
      })),
    ].sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9) || a.name.localeCompare(b.name));
    return (
      <>
        <ul className="list">
          {items.map((it) => (
            <li key={it.id}>
              <button className="row" type="button" onClick={() => select("stop", it.id, false)}>
                <span className="rowmain">
                  <span className="rowname">{it.name}</span>
                  <span className="rowdesc">
                    {it.status === "active" ? "Attiva" : it.status === "suspended" ? "Sospesa" : "Eliminata"}
                    {it.usersCount > 0 ? ` · ${it.usersCount} utenti` : " · vuota"}
                  </span>
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
        {/* Sezione avvisi in alto, compatta: solo tasto e form. L'elenco degli
            avvisi pubblicati non serve qui — restano visibili nel banner in
            testata al pannello, con «Rimuovi» per il coordinamento. */}
        {isAdmin && (
          <div className="stack">
            {!noticeOpen ? (
              <button className="btn" type="button" onClick={() => setNoticeOpen(true)}>
                Invia avviso a tutte le associazioni
              </button>
            ) : (
              <form
                className="stack"
                onSubmit={(e) => {
                  e.preventDefault();
                  void publishNotice();
                }}
              >
                <label className="lb" htmlFor="notice-msg">
                  Avviso per tutte le associazioni
                </label>
                <textarea
                  id="notice-msg"
                  rows={3}
                  maxLength={600}
                  autoFocus
                  value={noticeDraft}
                  placeholder="Es.: sabato uscita straordinaria alle 21: portare coperte e tè caldo."
                  onChange={(e) => setNoticeDraft(e.target.value)}
                />
                <div className="actions" style={{ padding: 0 }}>
                  <button
                    className="btn btn-primary btn-sm"
                    type="submit"
                    disabled={noticeBusy || !noticeDraft.trim()}
                  >
                    {noticeBusy ? "Pubblico…" : "Pubblica"}
                  </button>
                  <button
                    className="btn btn-sm"
                    type="button"
                    onClick={() => {
                      setNoticeOpen(false);
                      setNoticeDraft("");
                    }}
                  >
                    Annulla
                  </button>
                </div>
              </form>
            )}
            {noticesErr && (
              <p className="notice">
                Avvisi non disponibili: esegui la migrazione 0013_notices.sql sul database ({noticesErr}).
              </p>
            )}
          </div>
        )}
        {!v.length && (
          <p className="notice">Nessuna proposta in attesa.</p>
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
        {/* Tasto di proposta spostato accanto a "Stasera in uscita" */}
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
    if (placing && creatingStop && draftPos) {
      return (
        <div className="stack" style={{ gap: 8, padding: 12, background: "#f8fafc", border: "1px solid #cbd5e1", borderRadius: 8, maxWidth: 300, margin: 12 }}>
          <label className="lb" style={{ fontSize: 12, margin: 0 }}>Nome della tappa</label>
          <input
            className="input"
            value={stopName}
            onChange={(e) => setStopName(e.target.value)}
            autoFocus
            style={{ width: "100%", padding: 6, fontSize: 13, border: "1px solid #cbd5e1", borderRadius: 4, boxSizing: "border-box" }}
          />
          <p className="pgtxt mono" style={{ fontSize: 11, margin: 4, color: "#64748b" }}>
            {draftPos.lat.toFixed(5)}, {draftPos.lng.toFixed(5)}
          </p>
          <div className="actions" style={{ padding: 0, display: "flex", gap: 6 }}>
            <button className="btn btn-sm" type="button" onClick={cancelCreateStop} style={{ flex: 1, fontSize: 12, padding: 6 }}>Annulla</button>
            <button
              className="btn btn-primary btn-sm"
              type="button"
              disabled={!stopName.trim()}
              onClick={doCreateStop}
              style={{ flex: 1, fontSize: 12, padding: 6, background: "#0f766e", border: "none", color: "#fff" }}
            >
              Crea tappa
            </button>
          </div>
        </div>
      );
    }
    if (placing)
      return (
        <ProposeForm
          pos={draftPos}
          isAdmin={isAdmin}
          onCancel={cancelPropose}
          onSubmit={doPropose}
          onPlace={(lat, lng) => setDraftPos({ lat, lng })}
        />
      );
    if (selected) {
      if (selected.kind === "user") {
        const u =
          users.find((x) => x.id === selected.id) ||
          suspendedUsers.find((x) => x.id === selected.id) ||
          deletedUsers.find((x) => x.id === selected.id);
        if (u)
          return (
            <Popup title={u.name} onClose={back}>
            <UserDetail
              key={u.id}
              user={u}
              past={logs
                .filter((l) => l.user_id === u.id && l.date !== today())
                .sort((a, b) => b.date.localeCompare(a.date))}
              canEditNote={isAdmin}
              orgs={orgs}
              onSaveNote={(note) => saveUserNote(u.id, note)}
              isAdmin={isAdmin}
              suspended={!u.active}
              deleted={!!u.deleted}
              onSuspend={(note) => suspendUser(u, note)}
              onResume={() => resumeUser(u)}
              onRestore={() => restoreUser(u)}
              onDelete={(note) => deleteUser(u, note)}
              myOrg={myOrg}
              canEditData={
                isAdmin || (!!myOrg && !!u.created_by_org && u.created_by_org === myOrg)
              }
              editDeniedMsg={
                u.created_by_org
                  ? "Solo il coordinamento o l'associazione che ha creato questa utenza può modificarne i dati."
                  : "Solo il coordinamento può modificare i dati di questa utenza."
              }
              onSaveData={(patch) => saveUserData(u.id, patch)}
              canRecord={!isAdmin && !!duty && duty.id === myOrg}
              todayLog={tonightLog(u.id)}
              recordMsg={
                duty
                  ? `Stasera è in uscita ${duty.name}: è a loro registrare l'esito.`
                  : "Stasera non c'è un'uscita in calendario."
              }
              onSaveEntry={async (v) => {
                // Dopo il salvataggio la scheda si chiude da sola (torna
                // all'elenco/mappa); se fallisce resta aperta per riprovare.
                if (await saveUserLog(u.id, v)) back();
              }}
              onReportFound={!isAdmin ? () => reportUserFound(u.id) : undefined}
            />
            </Popup>
          );
      } else if (selected.kind === "stop") {
        const s = stops.find((x) => x.id === selected.id);
        if (s) {
          const stopUsers = users.filter((u) => u.stop_id === s.id);
          const stopProps = proposals.filter((p) => p.stop_id === s.id);
          return (
            <Popup title={s.name} onClose={back}>
            <StopDetail
              key={s.id}
              stop={s}
              users={stopUsers}
              proposals={stopProps}
              orgs={orgs}
              isAdmin={isAdmin}
              onOpenMap={(lat, lng, label) => openGoogleMaps(lat, lng, label)}
              onSaveStop={(patch) => saveStop(s.id, patch)}
              onSuspend={() => suspendStop(s.id)}
              onRestore={() => restoreStop(s.id)}
              onDelete={() => deleteStop(s.id)}
              onMarkServed={() => markStopAsServed(s.id)}
              onAddUser={async (v) => {
                const sb = supabase();
                const { data, error } = await sb
                  .from("service_users")
                  .insert({
                    name: v.name,
                    description: v.desc,
                    lat: s.lat,
                    lng: s.lng,
                    created_by_org: myOrgId(),
                    stop_id: s.id,
                  })
                  .select()
                  .single();
                if (error) throw error;
                setUsers((prev) => [...prev, data as ServiceUser]);
                toast("Utente aggiunto alla tappa");
              }}
            />
            </Popup>
          );
        }
      } else {
        // Ogni proposta cliccata su mappa apre la scheda: quelle eliminate
        // (visibili col flag "Eliminati") hanno status="rejected" e vengono
        // mostrate in sola lettura, perché le azioni di validazione non
        // avrebbero più senso.
        const p = proposals.find((x) => x.id === selected.id);
        if (p) {
          const propReadOnly = p.status !== "pending";
          return (
            <Popup title={p.name} onClose={back}>
            <PropDetail
              p={p}
              orgs={orgs}
              isAdmin={isAdmin}
              expired={daysLeft(p) <= 0}
              canVerify={!propReadOnly && !isAdmin && !!duty && duty.id === myOrg}
              verifyMsg={dutyMsg(": tocca a loro andare a trovare l'utente.")}
              onSaveVer={async (v) => {
                // Dopo il salvataggio la scheda si chiude da sola (torna
                // all'elenco/mappa); se fallisce resta aperta per riprovare.
                if (await saveVerification(p.id, v)) back();
              }}
              onValidate={() => validate(p)}
              onReject={() => reject(p)}
              onDelete={!propReadOnly && !isAdmin && !!myOrg ? () => deleteProposal(p.id) : null}
              canDelete={!propReadOnly && !isAdmin && !!myOrg && p.proposed_by === myOrg}
              onDeleteAdmin={!propReadOnly && isAdmin ? () => deleteProposalAdmin(p.id) : null}
              myOrg={myOrg}
              readOnly={propReadOnly}
              onUpdateProp={(patch) => updateProposal(p.id, patch)}
              onUpdateVer={(v, vals) => updateVerification(v, vals)}
            />
            </Popup>
          );
        }
      }
    }
    return (
      <>
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
          <ReportView
            orgs={orgs}
            // Anche sospesi ed eliminati: i loro esiti restano nel report e
            // compariamo tutti nella scelta "Utente" (con lo stato tra parentesi).
            users={[...users, ...suspendedUsers, ...deletedUsers]}
            logs={logs}
            proposals={proposals}
            rep={rep}
            setRep={setRep}
          />
        ) : tab === "mine" && !isAdmin && myOrg ? (
          <OrgReport
            orgs={orgs}
            users={users}
            logs={logs}
            proposals={proposals}
            myOrg={myOrg}
          />
        ) : tab === "associazioni" && isAdmin ? (
          <AdminPanel
            profile={profile}
            orgs={orgs}
            setOrgs={setOrgs}
            profiles={profiles}
            setProfiles={setProfiles}
            onToast={toast}
          />
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
  const menuWide = isAdmin;
  // Tappe: da servire (almeno un utente todo), vuote (nessun utente), servite (utenti done e nessuno todo)
  const stopUserStats = stops.map((s) => {
    const su = users.filter((u) => u.stop_id === s.id);
    const todo = su.filter((u) => statusOf(u) === "todo").length;
    const done = su.filter((u) => statusOf(u) === "done").length;
    return { stop: s, todo, done, n: su.length };
  });
  const stopsServing = stopUserStats.filter((x) => x.todo > 0).length;
  const stopsEmpty = stopUserStats.filter((x) => x.n === 0).length;
  const stopsDone = stopUserStats.filter((x) => x.n > 0 && x.todo === 0 && x.done > 0).length;
  const legend = (
    <ul className="legend">
      <li>
        <span className="dot st-todo" /> Tappe da servire <b>{stopsServing}</b>
      </li>
      <li>
        <span className="dot st-done" /> Tappe servite <b>{stopsDone}</b>
      </li>
      <li>
        <span className="dot st-missing" /> Tappe vuote <b>{stopsEmpty}</b>
      </li>
      {showProps ? (
        <li>
          <span className="dot pr st-todo" /> Candidati <b>{visibleProps.filter((p) => !p.stop_id).length}</b>
        </li>
      ) : null}
      {showSuspended ? (
        <li>
          <span className="dot st-susp" /> Tappe sospese <b>{stops.filter((s) => s.status === "suspended").length}</b>
        </li>
      ) : null}
      {showDeleted ? (
        <li>
          <span className="dot st-del" /> Tappe eliminate <b>{stops.filter((s) => s.status === "deleted").length}</b>
        </li>
      ) : null}
    </ul>
  );

  return (
    <div className={menuWide ? "app app-wide" : "app"}>
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
            {!placing && (
              <div className="mapflags" role="group" aria-label="Mostra proposte">
                <label className="mapflag">
                  <input
                    type="checkbox"
                    checked={showProps}
                    onChange={(e) => setShowProps(e.target.checked)}
                  />
                  <span>Proposte</span>
                </label>
              </div>
            )}
            {!placing && (
              <div className="mapflags mapflags-bottomright" role="group" aria-label="Mostra tappe non attive">
                <label className="mapflag">
                  <input
                    type="checkbox"
                    checked={showSuspended}
                    onChange={(e) => setShowSuspended(e.target.checked)}
                  />
                  <span>Sospesi</span>
                </label>
                <label className="mapflag">
                  <input
                    type="checkbox"
                    checked={showDeleted}
                    onChange={(e) => setShowDeleted(e.target.checked)}
                  />
                  <span>Eliminati</span>
                </label>
              </div>
            )}
            {placing && <div className="hint">Tocca la mappa per indicare dove dorme l&apos;utente.</div>}
            {legend}
          </>
        }
      />

      <aside className="panel" id="panel" aria-live="polite">
        {/* Testata + barra dei tab sempre presenti, in tutti i tab e in tutti
            gli stati: la navigazione non sparisce mai. */}
        {headHTML()}
        {/* Navigazione + avvisi del coordinamento: il wrapper resta appeso
            (sticky) mentre il corpo del pannello scorre, così l'avviso
            permane visibile a schermo in ogni account fino alla rimozione. */}
        <div className="navsticky">
          {tabsHTML()}
          {!!notices.length && (
            <div className="broadcast" role="status" aria-label="Avvisi del coordinamento">
              {notices.map((n) => (
                <div className="broadcast-item" key={n.id}>
                  <span className="broadcast-tag">Avviso</span>
                  <p>{n.message}</p>
                  {isAdmin && (
                    <button
                      className="linkbtn"
                      type="button"
                      onClick={() => void removeNotice(n.id)}
                    >
                      Rimuovi
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        {panelBody()}
        <div className="foot">
          <p>Dati salvati su Supabase · mappa © OpenStreetMap contributors</p>
        </div>
      </aside>

      {/* Briefing d'accesso (solo associazioni): avvisi non ancora letti e,
          il giorno della propria uscita, sommario della sera prima con note
          evidenziate. Una volta al giorno per dispositivo. */}
      {briefOpen && (
        <Popup
          title={myTurnToday ? "La tua uscita di stasera" : "Avvisi del coordinamento"}
          onClose={closeBrief}
        >
          {briefUnseen.length > 0 && (
            <section className="brief-sec">
              <p className="subhead">Avvisi del coordinamento</p>
              {briefUnseen.map((n) => (
                <p key={n.id} className="brief-avviso">
                  {n.message}
                </p>
              ))}
            </section>
          )}
          {myTurnToday && (
            <section className="brief-sec">
              <p className="subhead">Uscita della sera {fmtDay(yKey)}</p>
              <p className="signed">
                {dutyYesterday
                  ? `Ieri era in uscita ${dutyYesterday.name}.`
                  : "Ieri non risultava un'uscita in calendario."}{" "}
                Utenze sulla mappa: <b>{users.length + visibleProps.length}</b> · esiti registrati:{" "}
                <b>{yLogs.length}</b> · trovati: <b>{yFound}</b> · non trovati:{" "}
                <b>{yLogs.length - yFound}</b>
                {yWithNotes ? ` · note per le prossime uscite: ${yWithNotes}` : ""}.
              </p>
              {!yLogs.length && <p className="notice">Ieri non è stato registrato alcun esito.</p>}
              {/* Nell'elenco citiamo per nome SOLO le utenze con il campo «Note per
                  la prossima uscita» compilato (in evidenza): le altre restano
                  conteggiate solo nelle statistiche qui sopra. */}
              {yWithNotes > 0 ? (
                <ul className="list brief-list">
                  {yLogs
                    .filter((l) => (l.note || "").trim())
                    .sort((a, b) => Number(b.found) - Number(a.found))
                    .map((l) => {
                      const name =
                        users.find((x) => x.id === l.user_id)?.name ||
                        proposals.find((x) => x.id === l.user_id)?.name ||
                        "Utenza";
                      return (
                        <li key={l.user_id}>
                          <div className="row" style={{ cursor: "default" }}>
                            <span className={`dot st-${l.found ? "done" : "missing"}`} />
                            <span className="rowmain">
                              <span className="rowname">{name}</span>
                              <span className="rowdesc">
                                {l.found ? "Trovato" : "Non trovato"}
                                {l.provided?.length ? ` · fornito: ${l.provided.join(", ")}` : ""}
                                {l.requested ? ` · richiesto: ${l.requested}` : ""}
                              </span>
                              <span className="brief-note">
                                Note per la prossima uscita: {l.note}
                              </span>
                            </span>
                          </div>
                        </li>
                      );
                    })}
                </ul>
              ) : (
                !!yLogs.length && (
                  <p className="notice">
                    Ieri nessun esito contiene note per la prossima uscita.
                  </p>
                )
              )}
              {yWithNotes > 0 && (
                <p className="mono brief-hint">Le note restano in storia fino a cancellazione.</p>
              )}
            </section>
          )}
          <div className="actions" style={{ padding: 0 }}>
            {myTurnToday && (
              <button
                className="btn"
                type="button"
                onClick={downloadBriefXlsx}
                disabled={busyBriefXlsx || !yLogs.length}
              >
                {!yLogs.length
                  ? "Nessun esito ieri da scaricare"
                  : busyBriefXlsx ? "Genero…" : "Scarica report ieri in Excel (.xlsx)"}
              </button>
            )}
          </div>
        </Popup>
      )}

      {toastMsg && (
        <div className="toast" role="status">
          {toastMsg}
        </div>
      )}
    </div>
  );
}






