"use client";

// Applicazione principale: mappa, elenco, schede, esiti firmati, proposte,
// calendario delle uscite e report. Dati letti/scritti su Supabase (RLS).

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import MapView, { type MapItem, type Selection } from "@/components/MapView";
import type { EntryValues } from "@/components/EntryFields";
import ProposeForm from "@/components/ProposeForm";
import ProposeStopForm from "@/components/ProposeStopForm";
import UserDetail from "@/components/UserDetail";
import PropDetail from "@/components/PropDetail";
import StopDetail from "@/components/StopDetail";
import Popup from "@/components/Popup";
import CalendarView from "@/components/CalendarView";
import ReportView from "@/components/ReportView";
import OrgReport from "@/components/OrgReport";
import AdminPanel from "@/components/AdminPanel";
import ServedBadge from "@/components/ServedBadge";
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
  StopLog,
} from "@/lib/types";
import { effDutyId } from "@/lib/duty";
import { DAY, ST_LABEL, addDaysKey, fmtDay, fmtDM, orgName, parseCal, today } from "@/lib/format";
import { openGoogleMaps } from "@/lib/maps";
import { allRecs } from "@/lib/report";
import { blobToBase64, buildExcelBlob, downloadExcel, reportFileName } from "@/lib/excel";

// Fine stagione: cancellazione dei dati personali degli utenti (solo coordinamento).
// Le uscite terminano il 30 marzo 2027: da quel giorno compare il popup per il
// coordinamento e si può eseguire la cancellazione (purge_season_data lo ricontrolla).
const SEASON = "2026-27";
const SEASON_END = "2027-03-30";
const PURGE_NOTICE_FROM = "2027-03-30";
const PURGE_AUTO_DATE = "2027-04-30"; // cancellazione automatica (pg_cron su Supabase)

interface PurgeLog {
  season: string;
  executed_at: string;
  deleted_users: number;
  deleted_logs: number;
  deleted_proposals: number;
  deleted_verifications: number;
}

type Tab =
  | "utenti"
  | "validare"
  | "proposte"
  | "associazioni"
  | "calendario"
  | "report"
  | "mine";

// --- stato "letto" del popup di briefing, in localStorage (nessuna migrazione) ---
// LS_AVVISI: ids degli avvisi già letti su questo dispositivo (il popup torna
// solo per i nuovi). Il riepilogo di uscita invece si ripresenta a ogni refresh
// finché è il turno dell'associazione.
const LS_AVVISI = "accoglienza:avvisi-letti";
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

// Testo di un avviso: le righe con tabulazioni (incollate da Excel) diventano
// una tabella, il resto resta testo. Nessun HTML salvato: niente rischi di sicurezza.
function NoticeText({ text }: { text: string }) {
  const lines = text.split(/\r?\n/);
  const blocks: ({ t: "p"; s: string } | { t: "tb"; rows: string[][] })[] = [];
  for (const ln of lines) {
    if (ln.includes("\t")) {
      const row = ln.split("\t").map((c) => c.trim());
      const last = blocks[blocks.length - 1];
      if (last && last.t === "tb") last.rows.push(row);
      else blocks.push({ t: "tb", rows: [row] });
    } else if (ln.trim()) blocks.push({ t: "p", s: ln });
  }
  return (
    <div>
      {blocks.map((b, i) =>
        b.t === "p" ? (
          <p key={i} style={{ margin: "0 0 4px" }}>
            {b.s}
          </p>
        ) : (
          <div key={i} style={{ overflowX: "auto", margin: "4px 0" }}>
            <table style={{ borderCollapse: "collapse", fontSize: "0.85em" }}>
              <tbody>
                {b.rows.map((r, ri) => (
                  <tr key={ri}>
                    {r.map((c, ci) => {
                      return (
                        <td
                          key={ci}
                          style={{
                            border: "1px solid #cbd5e1",
                            padding: "2px 6px",
                            textAlign: "left",
                            whiteSpace: "nowrap",
                            fontWeight: 400,
                          }}
                        >
                          {c}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  );
}

// Mini segnaposto per la legenda: stessa forma e stessi colori dei pin sulla mappa
function LegendPin({
  color,
  glyph,
  badge,
}: {
  color: string;
  glyph: "slash" | "cross" | "prop";
  badge?: "todo" | "done" | "missing";
}) {
  const prop = glyph === "prop";
  const badgeBg = badge === "done" ? "#10b981" : badge === "missing" ? "#6b7280" : "#ef4444";
  return (
    <svg width="17" height="20" viewBox="0 0 34 42" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path
        d="M15 41C15 41 1 24 1 14.5C1 6.5 7.3 1 15 1s14 5.5 14 13.5C29 24 15 41 15 41z"
        fill={prop ? "#fff" : color}
        stroke={prop ? color : "#fff"}
        strokeWidth={prop ? 3 : 2}
        strokeDasharray={prop ? "5 3" : undefined}
      />
      {glyph === "slash" ? (
        <path d="M10 20L20 9" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" fill="none" />
      ) : glyph === "cross" ? (
        <path
          d="M10.5 9.5L19.5 18.5M19.5 9.5L10.5 18.5"
          stroke="#fff"
          strokeWidth="2.5"
          strokeLinecap="round"
          fill="none"
        />
      ) : (
        <text x="15" y="21" textAnchor="middle" fontSize="16" fontWeight="bold" fill={color} fontFamily="sans-serif">
          ?
        </text>
      )}
      {badge && (
        <>
          <circle cx="26" cy="8" r="8" fill={badgeBg} stroke="#fff" strokeWidth="1.5" />
          {badge === "done" ? (
            <path d="M22 8l3 3 5-6" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          ) : badge === "missing" ? (
            <path d="M22 8H30" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" fill="none" />
          ) : (
            <>
              <path d="M26 4V8.5" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" fill="none" />
              <circle cx="26" cy="11.5" r="1.3" fill="#fff" />
            </>
          )}
        </>
      )}
    </svg>
  );
}

// Legge tutte le righe a blocchi da 1000 (Supabase ne restituisce al massimo 1000 per richiesta).
async function fetchAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<{ data: T[] | null; error: { message: string } | null }> {
  const all: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(from, from + 999);
    if (error) return { data: null, error };
    all.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return { data: all, error: null };
}

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
  const [stopLogs, setStopLogs] = useState<StopLog[]>([]);
  // Bandierina "Tappe proposte" sulla mappa (spenta di default): mostra i pin piccoli a bordo viola.
  const [showStopProps, setShowStopProps] = useState(false);
  const [logs, setLogs] = useState<DailyLog[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [overrides, setOverrides] = useState<CalendarOverride[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  // Avvisi del coordinamento a TUTTE le associazioni (migrazione 0013):
  // restano in testata al pannello di ogni account finché non vengono rimossi.
  const [notices, setNotices] = useState<Notice[]>([]);
  const [noticesErr, setNoticesErr] = useState("");
  // Tappe marcate come servite dal coordinamento (anche se non hanno utenti)
  // Stato servita/da servire delle tappe: letto da served_at (Supabase),
  // non più in client-side state. Reset automatico alle 20:00 del giorno successivo.
  // Composizione dell'avviso (solo coordinamento), aperta dal tab Comunicazioni.
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [noticeDraft, setNoticeDraft] = useState("");
  const [noticeBusy, setNoticeBusy] = useState(false);
  // Modifica di un avviso già pubblicato (solo coordinamento), direttamente nel banner.
  const [editNoticeId, setEditNoticeId] = useState<string | null>(null);
  const [editNoticeText, setEditNoticeText] = useState("");
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


  // Limite massimo (ora definita da coordinamento) entro cui il report della serata va inviato; oltre, il
  // sistema lo invia in automatico (anche parziale). Mostrato nel popup di uscita.
  const autoReportHour = settings?.autoReportHour ?? 16;

  // --- stato interfaccia ---
  const [tab, setTab] = useState<Tab>("utenti");
  const [selected, setSelected] = useState<Selection | null>(null);
  // Tappa da riaprire alla chiusura di una scheda utente/proposta aperta da dentro la scheda tappa.
  const [returnStopId, setReturnStopId] = useState<string | null>(null);
  // Id della tappa attualmente in modifica: solo il suo pin è trascinabile sulla mappa.
  const [editingStopId, setEditingStopId] = useState<string | null>(null);
  const [placing, setPlacing] = useState(false);
  const [draftPos, setDraftPos] = useState<{ lat: number; lng: number } | null>(null);
  const [focus, setFocus] = useState<{ lat: number; lng: number; n: number } | null>(null);
  // Tappa scelta dall'elenco: resta evidenziata sulla mappa anche a popup chiuso.
  const [hlStop, setHlStop] = useState<string | null>(null);
  const [creatingStop, setCreatingStop] = useState(false);
  // Uscita dell'associazione in turno: popup con tre scelte (genera il report ed
  // esci / esci senza generare / resta).
  const [exitOpen, setExitOpen] = useState(false);
  const [exitBusy, setExitBusy] = useState(false);
  // Avviso e cancellazione di fine stagione (solo coordinamento).
  const [purgeLogs, setPurgeLogs] = useState<PurgeLog[]>([]);
  const [purgeClosed, setPurgeClosed] = useState(false);
  const [purgeStep, setPurgeStep] = useState<"info" | "confirm">("info");
  const [purgeText, setPurgeText] = useState("");
  const [purgeBusy, setPurgeBusy] = useState(false);
  const [purgeErr, setPurgeErr] = useState("");
  const [exitError, setExitError] = useState("");
  // Esiti registrati nella serata corrente (calcolati all'apertura del popup di uscita).
  const [exitCount, setExitCount] = useState(0);
  const [stopName, setStopName] = useState("");
  const [calAll, setCalAll] = useState(false);
  const [calMsg, setCalMsg] = useState("");
  const [rep, setRep] = useState({ from: addDaysKey(-6), to: today() });
  const [toastMsg, setToastMsg] = useState("");
  const toastT = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userDirtyRef = useRef(false);
  // --- Ridisegna l’app ogni minuto, quindi il cambio turno compare entro 60 secondi.
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 60_000);
    return () => clearInterval(t);
  }, []);

  // Tasto Indietro (mobile): non si esce dall'app senza una conferma.
  // Al primo tocco si aggiunge alla cronologia una voce "sentinella": Indietro
  // la consuma e resta sulla pagina, aprendo il popup di conferma. (Chrome salta
  // le voci aggiunte prima di una interazione dell'utente, per questo non la
  // aggiungiamo all'avvio.) "Esci" nel popup torna indietro di due voci.
  const [backOpen, setBackOpen] = useState(false);
  const leavingRef = useRef(false);

  useEffect(() => {
    let guarded = false;
    const pushGuard = () => window.history.pushState(window.history.state, "", window.location.href);
    const armGuard = () => {
      if (guarded) return;
      guarded = true;
      pushGuard();
    };

    const ua = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
    if (ua?.hasBeenActive) armGuard();
    else {
      window.addEventListener("pointerdown", armGuard, { once: true, capture: true });
      window.addEventListener("keydown", armGuard, { once: true, capture: true });
    }

    const handlePopState = () => {
      if (leavingRef.current || !guarded) return;
      pushGuard(); // rimette la sentinella: si resta nell'app
      setBackOpen(true);
    };
    // Chiusura/ricarica della scheda (soprattutto desktop): richiesta nativa del browser.
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (leavingRef.current) return;
      e.preventDefault();
      e.returnValue = "";
    };

    window.addEventListener("popstate", handlePopState);
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("pointerdown", armGuard, { capture: true });
      window.removeEventListener("keydown", armGuard, { capture: true });
      window.removeEventListener("popstate", handlePopState);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, []);

  function confirmBackLeave() {
    leavingRef.current = true;
    setBackOpen(false);
    window.history.go(-2);
    // Se non c'era una pagina precedente la pagina resta: si riarma il controllo.
    setTimeout(() => {
      leavingRef.current = false;
    }, 600);
  }

  const isAdmin = profile.role === "admin";
  const myOrg = profile.org_id;

  useEffect(() => {
    let dead = false;
    (async () => {
      const problems: string[] = [];
      try {
        const sb = supabase();
        const prPromise = sb.from("profiles").select("*").order("created_at", { ascending: true });
        const [o, pr, u, l, p, c, s, su, st, nt, sl, pl] = await Promise.all([
          sb.from("organizations").select("id, name").order("name"),
          prPromise,
          sb.from("service_users").select("*").eq("active", true),
          fetchAll<DailyLog>((a, b) =>
            sb.from("daily_logs").select("*").order("date", { ascending: false }).order("id").range(a, b)
          ),
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
          // Log su base tappa (beni forniti, esito tappa): non bloccante come gli avvisi.
          fetchAll<StopLog>((a, b) =>
            sb.from("stop_logs").select("*").order("date", { ascending: false }).order("id").range(a, b)
          ),
          // Registro cancellazioni di fine stagione (solo il coordinamento lo legge): non bloccante.
          sb.from("purge_log").select("*"),
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
        if (st.error) problems.push(`utenze sospese: ${msg(st.error)}`);
        else {
          // Separiamo le sospese (reversibili) dalle eliminate (soft-delete).
          const inactive = (st.data || []) as ServiceUser[];
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
        if (su.error) problems.push(`tappe: ${msg(su.error)}`);
        else setStops((su.data || []) as Stop[]);
        // Avvisi: errore NON bloccante. La tabella arriva con la migrazione
        // 0013; se non è ancora applicata l'app resta pienamente funzionante
        // e l'errore viene mostrato al solo coordinamento nel tab Comunicazioni.
        if (nt.error) setNoticesErr(msg(nt.error));
        else setNotices((nt.data || []) as Notice[]);
        if (sl.error) console.error("stop_logs", sl.error);
        else setStopLogs((sl.data || []) as StopLog[]);
        if (pl.error) console.error("purge_log", pl.error);
        else setPurgeLogs((pl.data || []) as PurgeLog[]);
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

  // --- briefing all'accesso (solo associazioni) ---
  // Dati del riepilogo: ieri (la sera prima) e i suoi esiti registrati.
  const yKey = addDaysKey(-1);
  const dutyYesterday = dutyOrg(yKey);
  const yLogs = logs.filter((l) => l.date === yKey);
  const yFound = yLogs
  .filter((l) => l.found)
  .reduce((acc, l) => acc + (l.users_found ?? (l.found ? 1 : 0)), 0);
  const yWithNotes = yLogs.filter((l) => (l.note || "").trim()).length;
  const myTurnToday = !!duty && duty.id === myOrg;
  
  // Giorno di servizio: dalle 20:00 alle 20:00 del giorno dopo. Coincide con il cambio
  // dei diritti di scrittura: a quell'ora tutte le tappe tornano "da servire".
  const SHIFT_SWITCH_HOUR = 20;
  const serviceDayKey = (d: Date = new Date()): string =>
    new Date(d.getTime() - SHIFT_SWITCH_HOUR * 3600 * 1000).toLocaleDateString("sv-SE"); // YYYY-MM-DD
  // Data dell'uscita "aperta" ora: con questa si leggono e si salvano esiti e visite
  const serviceKey = serviceDayKey();

  // Fino alle 20:00 scrive l'associazione uscita ieri, dopo quella di stasera.
  // Il coordinamento scrive sempre.
  const activeDuty = dutyOrg(serviceKey);
  const isActiveOrg = !isAdmin && !!myOrg && activeDuty?.id === myOrg;
  const canWrite = isAdmin || isActiveOrg;

  // Popup di briefing: si ripresenta a ogni refresh finché l'associazione ha
  // il turno stasera (riepilogo della sera prima), più eventuali avvisi del
  // coordinamento non ancora letti (una volta per dispositivo, per avviso).
  const briefUnseen = isAdmin || !myOrg ? [] : notices.filter((n) => !seenIds.includes(n.id));
  const briefOpen = !briefClosed && (briefUnseen.length > 0 || myTurnToday);

  // Avviso di fine stagione: solo coordinamento, da PURGE_NOTICE_FROM finché la
  // cancellazione non risulta eseguita. Il pulsante di cancellazione c'è da SEASON_END.
  const purgeDone = purgeLogs.some((p) => p.season === SEASON);
  const purgeNoticeOpen = isAdmin && !purgeClosed && !purgeDone && today() >= PURGE_NOTICE_FROM;
  const purgeAllowed = today() >= SEASON_END;
  const purgeDaysLeft = Math.max(
    0,
    Math.ceil((new Date(SEASON_END).getTime() - new Date(today()).getTime()) / 86400000)
  );

  const tonightLog = (uid: string) => logs.find((l) => l.user_id === uid && l.date === serviceKey);
  const statusOf = (u: ServiceUser): Status => {
    const l = tonightLog(u.id);
    return !l ? "missing" : l.found ? "done" : "missing";
  };

  const sameServiceDay = (iso?: string | null) =>
    !!iso && serviceDayKey(new Date(iso)) === serviceDayKey();

  const stopServed = (s: Stop): boolean => {
  const resetToday = sameServiceDay(s.reset_at);
  const servedAfterReset =
    !!s.served_at && (!s.reset_at || new Date(s.served_at) > new Date(s.reset_at));
    if (resetToday && !servedAfterReset) return false;
  // Basta un esito registrato stasera (trovato o no) per un utente della tappa
  const someLogged = users.some((u) => u.stop_id === s.id && !!tonightLog(u.id));
    return sameServiceDay(s.served_at) || someLogged;
  };

  // Solo l'associazione in uscita nel giorno di servizio può modificare lo stato
  const canResetServed = isActiveOrg;
  const expTime = (p: Proposal) => new Date(p.created_at).getTime() + 7 * DAY;
  // Tappe proposte dalle associazioni (stops con status "pending") da validare
  const pendingStops = stops.filter((st) => st.status === "pending");

  // Selezione evidenziata sulla mappa: la scheda aperta oppure la tappa evidenziata.
  const mapSelected: Selection | null = selected ?? (hlStop ? { kind: "stop", id: hlStop } : null);

  const daysLeft = (p: Proposal) => Math.ceil((expTime(p) - Date.now()) / DAY);
  // Proposte eliminate dal coordinamento (soft-delete): fuori da mappa ed
  // elenchi di default, ma rivisibili con il flag "Eliminati" come le utenze.
  const deletedProps = proposals.filter((p) => p.suspended && p.status === "rejected");

  const mapItems: MapItem[] = [
    // Le tappe sono sempre mostrate (anche se vuote); sospese/eliminate solo
    // con i relativi flag attivi.
    ...stops.filter((s) => s.status === "active").map((s) => {
      // Lo stato "servita" è calcolato da stopServed (stessa logica del badge)
      const usersInStop = users.filter((u) => u.stop_id === s.id);
      // "done" se servita, "missing" se vuota, "todo" (da servire) negli altri casi
      const st: Status = stopServed(s)
        ? "done"
        : usersInStop.length === 0
          ? "missing"
          : "todo";
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
    // Tappe proposte in attesa di validazione: pin sulla mappa
    // visibili solo con il flag "Tappe proposte" attivo.
    ...(showStopProps
      ? stops
          .filter((s) => s.status === "pending")
          .map((s) => ({
            kind: "stop" as const,
            id: s.id,
            lat: s.lat,
            lng: s.lng,
            st: stopServed(s) ? ("done" as Status) : ("todo" as Status),
            name: s.name,
            tip: "tappa da validare",
            isProposal: true,
         }))
      : []),

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
    userDirtyRef.current = false;
    if (fromMap) setHlStop(kind === "stop" ? id : null);
    setReturnStopId(null);
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
    userDirtyRef.current = false;
    setReturnStopId(null);
    setSelected(null);
    setFocus(null);
  }
  // Chiude la scheda utente/proposta: se era stata aperta dalla scheda tappa, torna a quella.
  function backToStopOrClose() {
    userDirtyRef.current = false;
    if (returnStopId && stops.some((x) => x.id === returnStopId)) {
      setSelected({ kind: "stop", id: returnStopId });
      setReturnStopId(null);
    } else {
      back();
    }
  }
  function closeUserCard() {
    if (
      userDirtyRef.current &&
      !window.confirm("Hai modifiche non salvate. Vuoi chiudere la scheda senza salvare?")
    ) {
      return;
    }
    backToStopOrClose();
  }
  function startPropose() {
    if (!canWrite) return;
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
    } catch (err) {
      toast("Errore: " + errMsg(err));
    }
  }

  // --- azioni sulle tappe (solo coordinamento) ---

  async function saveStop(sid: string, patch: { name: string; lat: number; lng: number; note: string }) {
    try {
      const { error } = await supabase().from("stops").update({ name: patch.name, lat: patch.lat, lng: patch.lng, note: patch.note ?? "" }).eq("id", sid);
      if (error) throw error;
      setStops((prev) => prev.map((s) => (s.id === sid ? { ...s, ...patch } : s)));
      toast("Tappa salvata");
    } catch (err) {
      toast("Errore: " + (err instanceof Error ? err.message : String(err)));
    }
  }

  // Sposta una tappa o un utente trascinando il pin sulla mappa principale.
  async function onMapMove(kind: "user" | "prop" | "stop", id: string, lat: number, lng: number) {
    if (kind === "stop") {
      const s = stops.find((x) => x.id === id);
      if (s) await saveStop(s.id, { name: s.name, lat, lng, note: s.note || "" });
    } else if (kind === "user") {
      const u = [...users, ...suspendedUsers, ...deletedUsers].find((x) => x.id === id);
      if (u) await saveUserData(u.id, { name: u.name, description: u.description || "", lat, lng, note: u.note || "" });
    }
  }

  function onStopEditChange(editing: boolean) {
    if (editing && selected?.kind === "stop") setEditingStopId(selected.id);
    else setEditingStopId(null);
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
      const { error } = await supabase()
        .from("stops")
        .update({ status: "deleted" })   // <-- aggiorna lo status invece di cancellare
        .eq("id", sid);
      if (error) throw error;
      setStops((prev) => prev.map((s) => (s.id === sid ? { ...s, status: "deleted" as const } : s)));
      setSelected(null);
      toast("Tappa eliminata");
    } catch (err) {
      toast("Errore: " + (err instanceof Error ? err.message : String(err)));
    }
  }


  // Log su base tappa del giorno di servizio corrente: aggiorna solo i campi
  // passati (l'upsert non tocca gli altri), quindi esito e beni non si sovrascrivono.
  async function upsertStopLog(
    sid: string,
    patch: Partial<Pick<StopLog, "served" | "note" | "sacchi_a_pelo" | "coperte">>
  ): Promise<boolean> {
    try {
      const row = {
        stop_id: sid,
        date: serviceKey,
        org_id: myOrgId() ?? null,
        created_by: profile.id,
        updated_at: new Date().toISOString(),
        ...patch,
      };
      const { data, error } = await supabase()
        .from("stop_logs")
        .upsert(row, { onConflict: "stop_id,date" })
        .select()
        .single();
      if (error) throw error;
      const rec = data as StopLog;
      setStopLogs((prev) => [
        ...prev.filter((x) => !(x.stop_id === sid && x.date === serviceKey)),
        rec,
      ]);
      return true;
    } catch (e) {
      console.error("stop_logs", e);
      toast("Errore stop_logs: " + ((e as { message?: string })?.message || JSON.stringify(e)));
      return false;
    }
  }

  // Beni forniti alla tappa (da consuntivare): salvati nel log tappa del giorno.
  async function saveStopGoods(sid: string, v: { sacchi_a_pelo: number; coperte: number }) {
    if (!isAdmin && !isActiveOrg) {
      toast("Non hai diritti di scrittura in questo momento.");
      return;
    }
    const ok = await upsertStopLog(sid, v);
    toast(ok ? "Beni della tappa registrati" : "Errore nel salvataggio dei beni della tappa");
  }

  // Tappa riportata da "Servito" a "Da servire" dall'associazione in uscita
  async function resetStopServed(sid: string) {
    if (!canResetServed) {
      toast("Solo l'associazione in uscita può modificare lo stato della tappa.");
      return;
    }
    try {
      const { error } = await supabase().rpc("reset_stop_served", { p_stop: sid });
      if (error) throw error;
      await upsertStopLog(sid, { served: false });
      setStops((prev) =>
        prev.map((s) =>
          s.id === sid ? { ...s, served_at: null, reset_at: new Date().toISOString() } : s
        )
      );
      toast("Tappa segnata come da servire");
    } catch (err) {
      toast("Errore: " + (err instanceof Error ? err.message : JSON.stringify(err)));
    }
  }

  // --- azioni: scritture su Supabase ---
  const myOrgId = () => myOrg;

  // Modifica dei dati anagrafici di un utente (nome, descrizione, posizione e
  // nota stabile). Consentita al coordinamento su tutte le utenze e alle
  // associazioni solo su quelle create da loro (RLS "users owner update").
  // La nota stabile resta competenza del coordinamento, quindi per le
  // associazioni la salviamo solo se l'utente è admin.
  async function saveUserData(
    uid: string,
    patch: {
      name: string;
      description: string;
      lat: number;
      lng: number;
      note: string;
      multiple?: boolean;
    }
  ) {
    try {
      const payload: Record<string, unknown> = {
        name: patch.name,
        description: patch.description,
        lat: patch.lat,
        lng: patch.lng,
      };
      if (isAdmin) payload.note = patch.note;
      if (patch.multiple !== undefined) payload.multiple = patch.multiple;
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
                multiple: patch.multiple ?? x.multiple,
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

  // Sospendere nasconde da mappa ed elenchi ma tiene il record (reversibile).
  async function suspendUser(u: ServiceUser, note: string) {
    try {
      const { error } = await supabase()
        .from("service_users")
        .update({ active: false, suspension_note: note })
        .eq("id", u.id);
      if (error) throw error;
      setUsers((prev) => prev.filter((x) => x.id !== u.id));
      setSuspendedUsers((prev) => [{ ...u, active: false, suspension_note: note }, ...prev]);
      toast(`Utenza "${u.name}" sospesa: non sarà più visualizzata su mappa ed elenchi.`);
    } catch (e) {
      toast("Errore nella sospensione: " + errMsg(e));
    }
  }

  async function resumeUser(u: ServiceUser) {
    try {
      const { error } = await supabase()
        .from("service_users")
        .update({ active: true, suspension_note: "" })
        .eq("id", u.id);
      if (error) throw error;
      setSuspendedUsers((prev) => prev.filter((x) => x.id !== u.id));
      setUsers((prev) => [{ ...u, active: true, suspension_note: "" }, ...prev]);
      toast(`Utenza "${u.name}" riattivata: torna su mappa ed elenchi.`);
    } catch (e) {
      toast("Errore nella riattivazione: " + errMsg(e));
    }
  }

  // Eliminazione sempre soft (deleted=true, active=false): reversibile.
  async function deleteUser(u: ServiceUser, note: string) {
    try {
      // .select("id") è indispensabile: con RLS un update a vuoto non dà errore
      // ma 0 righe, quindi senza sarebbe un falso successo.
      const { data, error } = await supabase()
        .from("service_users")
        .update({ active: false, deleted: true, suspension_note: note })
        .eq("id", u.id)
        .select("id");
      if (error) throw error;
      if (!data || data.length === 0) {
        toast("Impossibile eliminare l'utenza: permessi insufficienti.");
        return;
      }
      setUsers((prev) => prev.filter((x) => x.id !== u.id));
      setSuspendedUsers((prev) => prev.filter((x) => x.id !== u.id));
      setDeletedUsers((prev) => [{ ...u, active: false, deleted: true, suspension_note: note }, ...prev]);
      toast(`Utenza "${u.name}" eliminata: non sarà più visibile (la ritrovi col flag "Eliminati" su mappa).`);
      setSelected(null);
    } catch (e) {
      toast("Errore nell'eliminazione: " + errMsg(e));
    }
  }

  // Ripristina un'utenza eliminata (soft-delete) riportandola attiva.
  async function restoreUser(u: ServiceUser) {
    try {
      const { data, error } = await supabase()
        .from("service_users")
        .update({ active: true, deleted: false, suspension_note: "" })
        .eq("id", u.id)
        .select("id");
      if (error) throw error;
      if (!data || data.length === 0) {
        toast("Impossibile ripristinare l'utenza: permessi insufficienti.");
        return;
      }
      setDeletedUsers((prev) => prev.filter((x) => x.id !== u.id));
      setUsers((prev) => [{ ...u, active: true, deleted: false, suspension_note: "" }, ...prev]);
      toast(`Utenza "${u.name}" ripristinata: torna su mappa ed elenchi.`);
    } catch (e) {
      toast("Errore nel ripristino: " + errMsg(e));
    }
  }

  // Esito di stasera di una PROPOSTA (visita in campo): upsert su
  // proposal_verifications (unique su proposal_id,date), firmato dall'associazione.
  // Restituisce true se salvato: la scheda si chiude da sola per tornare
  // all'elenco/mappa. In caso di errore resta aperta, così si può riprovare.
  async function saveVerification(pid: string, v: EntryValues): Promise<boolean> {
    try {
      if (!isActiveOrg) {
        toast("Non hai diritti di scrittura in questo momento.");
        return false;
      }
      const row = {
        proposal_id: pid,
        date: serviceKey,
        org_id: myOrgId() || "",
        found: v.found,
        provided: v.provided,
        requested: v.requested,
        note: v.note,
        extra: v.extra,
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
      toast("Verifica registrata, firmata " + (row.org_id ? orgName(row.org_id, orgs) : "-"));
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
      const rows = allRecs([...users, ...suspendedUsers, ...deletedUsers], logs, proposals).filter((r) => r.date === yKey);
      await downloadExcel(
        rows,
        orgs,
        `Report ${fmtDay(yKey)}`,
        reportFileName("report_accoglienza", yKey),
        stops,
        stopLogs.filter((g) => g.date === yKey),
        { extras: true }
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
    if (!isActiveOrg) {
      toast("Non hai diritti di scrittura in questo momento.");
      return false;
    }
    try {
      const row = {
        user_id: uid,
        date: serviceKey,
        org_id: myOrgId() || "",
        found: v.found,
        users_found: v.found ? (v.users_found ?? 1) : 0,
        provided: v.provided,
        requested: v.requested,
        note: v.note,
        extra: v.extra,
        // Tappa dell'utente in questo momento: resta fissata nello storico.
        stop_id: users.find((x) => x.id === uid)?.stop_id ?? null,
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

      // Qualsiasi esito registrato (trovato o no): la tappa risulta servita
      const u = users.find((x) => x.id === uid);
      if (u?.stop_id) {
        const { error: e2 } = await supabase().rpc("mark_stop_served", { p_stop: u.stop_id });
        if (!e2) {
          setStops((prev) =>
            prev.map((s) =>
              s.id === u.stop_id ? { ...s, served_at: new Date().toISOString() } : s
            )
          );
        } else {
          console.error("mark_stop_served", e2);
        }
        // Lo stesso esito tappa va anche nel log su base tappa (storico).
        await upsertStopLog(u.stop_id, { served: true });
      }

      toast("Esito registrato, firmato " + (row.org_id ? orgName(row.org_id, orgs) : "-"));
      return true;
    } catch (e) {
      toast("Errore nel salvataggio: " + (e instanceof Error ? e.message : "riprova"));
      return false;
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

  // Modifica del testo di un avviso (solo coordinamento): si aggiorna nel banner di tutti.
  async function saveNoticeEdit() {
    const message = editNoticeText.trim();
    if (!editNoticeId || !message || noticeBusy) return;
    setNoticeBusy(true);
    try {
      const { error } = await supabase().from("notices").update({ message }).eq("id", editNoticeId);
      if (error) throw error;
      setNotices((prev) => prev.map((n) => (n.id === editNoticeId ? { ...n, message } : n)));
      setEditNoticeId(null);
      setEditNoticeText("");
      toast("Avviso aggiornato.");
    } catch (e) {
      toast("Errore nella modifica dell'avviso: " + errMsg(e));
    } finally {
      setNoticeBusy(false);
    }
  }

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
        extra: vals.extra,
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
    if (!canWrite) {
      toast("Non hai diritti di scrittura in questo momento.");
      return;
    }
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
            date: serviceKey,
            org_id: by,
            found: v.entry.found,
            provided: v.entry.provided,
            requested: v.entry.requested,
            note: v.entry.note,
            extra: v.entry.extra,
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
      let createdNewStop = false;
      if (!stopId) {
        const { data: ns, error: se } = await sb
          .from("stops")
          .insert({
            name: p.name,
            lat: p.lat,
            lng: p.lng,
            status: "active",
            note: "",
            created_by: myOrgId(),
          })
          .select()
          .single();
        if (se) throw se;
        stopId = ns.id;
        setStops((prev) => [...prev, ns as Stop]);
        createdNewStop = true;
      }
      const { data: nu, error } = await sb
        .from("service_users")
        .insert({
          name: p.name,
          description: p.description,
          lat: p.lat,
          lng: p.lng,
          created_by_org: myOrg,
          stop_id: stopId,
          multiple: !!p.multiple,
        })
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
            extra: v.extra,
            stop_id: newUser.stop_id ?? null,
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
              extra: v.extra,
              users_found: null,
            })),
        ]);
      }
      setUsers((prev) => [...prev, newUser]);
      // La proposta viene eliminata: l'utente ora esiste in service_users.
      setProposals((prev) => prev.filter((x) => x.id !== p.id));
      // Se è stata creata una nuova tappa, apri il dettaglio della tappa per
      // inserire i dettagli (es: note, gestori), non solo l'utente.
      if (createdNewStop) {
        setSelected({ kind: "stop", id: stopId! });
      } else {
        setSelected({ kind: "user", id: newUser.id });
      }
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

  // Validazione di una tappa proposta (solo coordinamento): diventa attiva e
  // gli utenti già collegati restano nell'elenco regolare.
  async function validateStop(st: Stop) {
    try {
      const { data, error } = await supabase()
        .from("stops")
        .update({ status: "active" })
        .eq("id", st.id)
        .select("id");
      if (error) throw error;
      if (!data || data.length === 0) {
        toast("Impossibile validare la tappa: permessi insufficienti.");
        return;
      }
      setStops((prev) => prev.map((x) => (x.id === st.id ? { ...x, status: "active" as const } : x)));
      setSelected({ kind: "stop", id: st.id });
      setFocus({ lat: st.lat, lng: st.lng, n: Date.now() });
      toast("Tappa validata");
    } catch (e) {
      toast("Errore nella validazione: " + errMsg(e));
    }
  }

  async function rejectStop(st: Stop) {
    try {
      const { data, error } = await supabase()
        .from("stops")
        .update({ status: "deleted" })
        .eq("id", st.id)
        .select("id");
      if (error) throw error;
      if (!data || data.length === 0) {
        toast("Impossibile rifiutare la tappa: permessi insufficienti.");
        return;
      }
      setStops((prev) => prev.map((x) => (x.id === st.id ? { ...x, status: "deleted" as const } : x)));
      setSelected(null);
      toast("Tappa proposta rifiutata");
    } catch (e) {
      toast("Errore: " + errMsg(e));
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
      if (error) throw error;
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
      toast("Errore nell'eliminazione: " + errMsg(e));
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

  async function saveSettings(patch: Partial<Pick<Settings, "weekly" | "sat" | "autoReportHour">>) {
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

  // Uscita dell'associazione in turno: apre il popup con le tre scelte.
  function openExit() {
    const n = allRecs(users, logs, proposals).filter((r) => r.date === serviceKey).length;
    setExitCount(n);
    setExitError("");
    setExitOpen(true);
  }

  // Righe del report della serata corrente (esiti utenti + log di tappa).
  function outingReportInput() {
    return {
      rows: allRecs([...users, ...suspendedUsers, ...deletedUsers], logs, proposals).filter((r) => r.date === serviceKey),
      stopLogsDay: stopLogs.filter((g) => g.date === serviceKey),
    };
  }

  // "Invia report ed esci": costruisce l'Excel, lo manda alla API
  // /api/admin/account/send_report (che lo spedisce via Google Apps Script) ed esce.
  async function sendReportAndExit() {
    setExitBusy(true);
    setExitError("");
    try {
      const { rows, stopLogsDay } = outingReportInput();
      const blob = await buildExcelBlob(rows, orgs, `Report ${fmtDay(serviceKey)}`, stops, stopLogsDay, {
        extras: true,
      });
      const { data: sess } = await supabase().auth.getSession();
      const jwt = sess.session?.access_token;
      if (!jwt) throw new Error("Sessione scaduta: rientra nell'app.");
      const res = await fetch("/api/admin/account/send_report", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` },
        body: JSON.stringify({
          outingDate: serviceKey,
          filename: reportFileName("report_accoglienza", serviceKey),
          xlsxBase64: await blobToBase64(blob),
        }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error || "Invio non riuscito.");
      }
      setExitOpen(false);
      await signOut();
    } catch (e) {
      console.error("invio report", e);
      setExitError(e instanceof Error ? e.message : "Invio non riuscito.");
    } finally {
      setExitBusy(false);
    }
  }

  // Scarica il report della serata sul dispositivo (alternativa all'invio).
  async function downloadOutingReport() {
    try {
      const { rows, stopLogsDay } = outingReportInput();
      await downloadExcel(
        rows,
        orgs,
        `Report ${fmtDay(serviceKey)}`,
        reportFileName("report_accoglienza", serviceKey),
        stops,
        stopLogsDay,
        { extras: true }
      );
    } catch (e) {
      console.error("download report", e);
      setExitError("Non sono riuscito a generare il file.");
    }
  }

  // Cancellazione definitiva dei dati personali della stagione (funzione SQL
  // purge_season_data, riservata al coordinamento).
  async function runPurge() {
    setPurgeBusy(true);
    setPurgeErr("");
    try {
      const { error } = await supabase().rpc("purge_season_data", {
        p_season: SEASON,
        p_confirm: purgeText.trim(),
        p_not_before: SEASON_END,
      });
      if (error) throw error;
      setUsers([]);
      setSuspendedUsers([]);
      setDeletedUsers([]);
      setLogs([]);
      setProposals([]);
      setPurgeLogs((prev) => [
        ...prev,
        {
          season: SEASON,
          executed_at: new Date().toISOString(),
          deleted_users: 0,
          deleted_logs: 0,
          deleted_proposals: 0,
          deleted_verifications: 0,
        },
      ]);
      setSelected(null);
      toast("Dati della stagione cancellati.");
    } catch (e) {
      setPurgeErr(
        (e as { message?: string })?.message || "Cancellazione non riuscita."
      );
    } finally {
      setPurgeBusy(false);
    }
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
    const beforeSwitch = new Date().getHours() < SHIFT_SWITCH_HOUR;
    const writerName = activeDuty ? activeDuty.name : "Solo Coordinamento";
    const tag = isActiveOrg ? (
      <span className="tag tag-me">Tocca a voi</span>
    ) : isAdmin ? (
      <span className="tag">Vista coordinamento</span>
    ) : myTurnToday ? (
      <span className="tag">Stasera tocca a voi · dalle {SHIFT_SWITCH_HOUR}:00</span>
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
          <div>
            <p className="eyebrow">In scrittura ora</p>
            <p className="dutyname">{writerName}</p>
            {beforeSwitch && duty && duty.id !== activeDuty?.id ? (
              <p className="pgtxt" style={{ margin: 0, fontSize: 12 }}>
                dalle {SHIFT_SWITCH_HOUR}:00: {duty.name}
              </p>
            ) : null}
          </div>
          {tag}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexShrink: 0, width: "100%" }}>
          {/* === SINISTRA: select solo per admin === */}
          {isAdmin && (
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <label style={{ fontSize: 12, color: "#666", whiteSpace: "nowrap" }}>
                Invio auto-report:
              </label>
              <select
                value={settings?.autoReportHour ?? 16}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  saveSettings({ autoReportHour: v });
                }}
                style={{ fontSize: 12, padding: "4px 8px", height: 32 }}
              >
                {[8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19].map((h) => (
                  <option key={h} value={h}>
                    {h}:00
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* === DESTRA: bottoni esistenti allineati a destra === */}
          <div style={{ display: "flex", gap: 8, flexShrink: 0, alignItems: "center" }}>
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
            {canWrite && (
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
            )}
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
        {isAdmin && t("validare", "Tappe da validare", pendingStops.length)}
        {t("proposte", "Comunicazioni")}
        {isAdmin && t("associazioni", "Associazioni")}
        {t("calendario", "Calendario")}
        {!isAdmin && myOrg ? t("mine", "Il tuo report") : null}
        {isAdmin && t("report", "Report")}
      </div>
    );
  }

  function listHTML() {
    const order: Record<string, number> = { active: 0, pending: 1, suspended: 2, deleted: 3 };
    // Come sulla mappa: attive sempre; proposte, sospese ed eliminate solo con il relativo flag.
    const showInList = (s: Stop) =>
      s.status === "active" ||
      (s.status === "pending" && showStopProps) ||
      (s.status === "suspended" && showSuspended) ||
      (s.status === "deleted" && showDeleted);
    const items = stops.filter(showInList).map((s) => ({
      kind: "stop" as const,
      id: s.id,
      name: s.name,
      lat: s.lat,
      lng: s.lng,
      desc: s.note || "",
      status: s.status,
      usersCount: users.filter((u) => u.stop_id === s.id).length,
      // Solo le tappe attive hanno uno stato servita / da servire
      served: s.status === "active" && stopServed(s),
    }));

    // Attive prima, poi sospese ed eliminate; tra le attive le servite vanno in fondo
    items.sort(
      (a, b) =>
        (order[a.status] ?? 9) - (order[b.status] ?? 9) ||
        Number(a.served) - Number(b.served) ||
        a.name.localeCompare(b.name)
    );

    const tint = (it: (typeof items)[number]): CSSProperties | undefined => {
      if (it.status !== "active") return undefined;
      return it.served
        ? { background: "#ecfdf5", borderColor: "#bbf7d0" }
        : { background: "#fef2f2", borderColor: "#fecaca" };
    };

    return (
      <>
        <ul className="list">
          {items.map((it) => (
            <li key={it.id}>
              <button
                className="row"
                type="button"
                style={tint(it)}
                onClick={() => {
                  select("stop", it.id, false);
                  setHlStop(it.id);
                  setFocus({ lat: it.lat, lng: it.lng, n: Date.now() });
                }}
              >
                <span className="rowmain">
                  <span className="rowname">{it.name}</span>
                  <span className="rowdesc">
                    {it.status === "active"
                      ? it.served
                        ? "Servita"
                        : "Da servire"
                      : it.status === "suspended"
                        ? "Sospesa"
                        : "Eliminata"}
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

  function validateTabHTML() {
    if (!pendingStops.length) return <p className="notice">Nessuna tappa da validare.</p>;
    return (
      <ul className="list">
        {pendingStops.map((st) => {
          const nUsers = users.filter((u) => u.stop_id === st.id).length;
          const orgId = (st as { organization_id?: string | null }).organization_id;
          return (
            <li key={st.id}>
              <button
                className="row"
                type="button"
                style={selected?.id === st.id ? { background: "var(--surface2)" } : undefined}
                onClick={() => {
                  select("stop", st.id, false);
                  setFocus({ lat: st.lat, lng: st.lng, n: Date.now() });
                }}
              >
                <span className="dot pr st-todo" />
                <span className="rowmain">
                  <span className="rowname">{st.name}</span>
                  <span className="rowdesc">
                    {orgId ? `Proposta da ${orgName(orgId, orgs)} · ` : ""}
                    {nUsers} {nUsers === 1 ? "utente" : "utenti"}
                  </span>
                </span>
              </button>
              <div className="actions">
                <button className="btn btn-ok btn-sm" type="button" onClick={() => validateStop(st)}>
                  Valida
                </button>
                <button className="btn btn-sm" type="button" onClick={() => rejectStop(st)}>
                  Rifiuta
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    );
  }

  function propsTabHTML() {
    // Note importanti riportate dalle associazioni (esiti degli utenti e visite ai candidati)
    const everyUser = [...users, ...suspendedUsers, ...deletedUsers];
    const noteRows = [
      ...logs
        .filter((l) => l.org_id && (l.note || "").trim())
        .map((l) => ({
          key: `l-${l.user_id}-${l.date}`,
          org: l.org_id,
          kind: "user" as const,
          targetId: l.user_id,
          user: everyUser.find((x) => x.id === l.user_id)?.name || "Utenza",
          note: l.note,
          date: l.date,
        })),
      ...proposals.flatMap((p) =>
        (p.verifications || [])
          .filter((vv) => vv.org_id && (vv.note || "").trim())
          .map((vv) => ({
            key: `v-${p.id}-${vv.date}`,
            org: vv.org_id,
            kind: "prop" as const,
            targetId: p.id,
            user: `${p.name} (candidato)`,
            note: vv.note,
            date: vv.date,
          }))
      ),
    ].sort((a, b) => b.date.localeCompare(a.date));

    return (
      <>
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
                  rows={6}
                  maxLength={3000}
                  autoFocus
                  value={noticeDraft}
                  placeholder="Es.: sabato uscita straordinaria alle 21: portare coperte e tè caldo."
                  onChange={(e) => setNoticeDraft(e.target.value)}
                />
                {noticeDraft.trim() ? (
                  <div className="notice">
                    <b>Anteprima</b>
                    <NoticeText text={noticeDraft} />
                  </div>
                ) : null}
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

        <div className="stack" style={{ marginTop: isAdmin ? 12 : 0 }}>
          <p className="subhead">Note importanti ({noteRows.length})</p>
          {!noteRows.length ? (
            <p className="notice">Nessuna nota importante.</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr>
                    {["Associazione", "Utente", "Nota", "Data"].map((h) => (
                      <th
                        key={h}
                        style={{
                          textAlign: "left",
                          padding: "6px 8px",
                          borderBottom: "1px solid var(--line)",
                          fontWeight: 600,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {noteRows.map((r) => (
                    <tr key={r.key}>
                      <td style={{ padding: "6px 8px", verticalAlign: "top" }}>{orgName(r.org ?? "", orgs)}</td>
                      <td style={{ padding: "6px 8px", verticalAlign: "top" }}>
                        <button
                          className="linkbtn"
                          type="button"
                          style={{ padding: 0, textAlign: "left" }}
                          onClick={() => select(r.kind, r.targetId, false)}
                        >
                          {r.user}
                        </button>
                      </td>
                      <td style={{ padding: "6px 8px", verticalAlign: "top", minWidth: 160 }}>{r.note}</td>
                      <td style={{ padding: "6px 8px", verticalAlign: "top", whiteSpace: "nowrap" }}>
                        {fmtDay(r.date)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
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
    if (placing) {
      if (isAdmin) {
        // Coordinamento: invariato (può creare tappa o utente all'interno di una tappa)
        return (
          <ProposeForm
            pos={draftPos}
            isAdmin={isAdmin}
            onCancel={cancelPropose}
            onSubmit={doPropose}
            onPlace={(lat, lng) => setDraftPos({ lat, lng })}
          />
        );
      }
      // Associazione: popup "Proponi utente" che crea tappa in stops (stato pending)
      if (!draftPos) return null;
      return (
        <ProposeStopForm
            organization_id={myOrg ?? ""}
            initialLat={draftPos.lat}
            initialLng={draftPos.lng}
            onSuccess={async (stopId, _stopName, _userName, lat, lng) => {
              cancelPropose();
              // La tappa (pending) e l'utente sono stati creati dal form direttamente
              // su Supabase: li ricarichiamo nello stato, altrimenti la scheda
              // tappa non troverebbe nulla da mostrare.
              try {
                const sb = supabase();
                const [st, us] = await Promise.all([
                  sb.from("stops").select("*").eq("id", stopId).maybeSingle(),
                  sb.from("service_users").select("*").eq("stop_id", stopId),
                ]);
                if (st.error) throw st.error;
                if (us.error) throw us.error;
                if (st.data) {
                  setStops((prev) => [...prev.filter((x) => x.id !== stopId), st.data as Stop]);
                }
                const rows = ((us.data || []) as ServiceUser[]).filter((r) => r.active !== false);
                if (rows.length) {
                  setUsers((prev) => [...prev.filter((x) => !rows.some((r) => r.id === x.id)), ...rows]);
                }
              } catch (e) {
                toast("Tappa creata, ma non riesco a ricaricarla: " + errMsg(e));
              }
              // Apre la classica scheda tappa con l'utente appena creato
              setSelected({ kind: "stop", id: stopId });
              setFocus({ lat, lng, n: Date.now() });
            }}
            onClose={cancelPropose}
          />
      );
    }
    if (selected) {
      if (selected.kind === "user") {
        const u =
          users.find((x) => x.id === selected.id) ||
          suspendedUsers.find((x) => x.id === selected.id) ||
          deletedUsers.find((x) => x.id === selected.id);
        if (u) {
          return (
            <Popup
              title={u.name}
              titleExtra={
                <span className={`tag ${tonightLog(u.id) ? "tag-done" : "tag-todo"}`}>
                  {ST_LABEL[tonightLog(u.id) ? "done" : "todo"]}
                </span>
              }
              onClose={closeUserCard}
            >
              <UserDetail
                key={u.id}
                user={u}
                isAdmin={isAdmin}
                status={tonightLog(u.id) ? "done" : "todo"}
                tonight={tonightLog(u.id) ?? null}
                outingTitle={
                  serviceKey === today()
                    ? "Esito di stasera"
                    : `Esito dell'uscita: ${fmtDay(serviceKey)}`
                }
                past={logs
                  .filter((l) => l.user_id === u.id && l.date !== serviceKey)
                  .sort((a, b) => b.date.localeCompare(a.date))}
                canRecord={isActiveOrg}
                canEditData={isAdmin || (isActiveOrg && !!myOrg && u.created_by_org === myOrg)}
                myOrg={myOrg}
                orgs={orgs}
                readOnlyMsg={
                  duty
                    ? `Fino alle ${SHIFT_SWITCH_HOUR}:00 scrivono solo il Coordinamento e l'associazione uscita ieri; da quell'ora tocca a ${duty.name}.`
                    : "Stasera non c'è un'uscita in calendario."
                }
                onSave={(v) => saveUserLog(u.id, v)}
                onSaveUserData={async (patch) => {
                  await saveUserData(u.id, { ...patch, note: patch.note || "" });
                }}
                onDirtyChange={(d) => { userDirtyRef.current = d; }}
                onSuspend={(note) => suspendUser(u, note)}
                onResume={() => resumeUser(u)}
                onDelete={(note) => deleteUser(u, note)}
                onRestore={() => restoreUser(u)}
                onBack={closeUserCard}
              />
            </Popup>
          );
        }
      } else if (selected.kind === "stop") {
      const s = stops.find((x) => x.id === selected.id);
      if (s) {
        const stopUsers = users.filter((u) => u.stop_id === s.id);
        const stopProps = proposals.filter(
          (p) => p.stop_id === s.id && p.status === "pending" && !p.suspended
        );
        const stopInactive = [...suspendedUsers, ...deletedUsers].filter((u) => u.stop_id === s.id);
        const isServed = stopServed(s);

        return (
          <Popup
            title={s.name}
            titleExtra={
              <>
                <span className={`badge badge-${s.status}`}>
                  {s.status === "active" ? "Attiva" : s.status === "suspended" ? "Sospesa" : s.status === "pending" ? "In attesa di validazione" : "Eliminata"}
                </span>
                {!isAdmin && (s.status === "active" || s.status === "pending") && (
                  <ServedBadge served={isServed} canReset={canResetServed} onReset={() => resetStopServed(s.id)} />
                )}
              </>
            }
            onClose={back}
            noBackdrop
          >
            <StopDetail
              key={s.id}
              stop={s}
              users={stopUsers}
              proposals={stopProps}
              orgs={orgs}
              isAdmin={isAdmin}
              canAddUser={isAdmin || isActiveOrg}
              myOrg={myOrg}
              inactiveUsers={isAdmin ? stopInactive : []}
              onOpenMap={(lat, lng, label) => openGoogleMaps(lat, lng, label)}
              onSaveStop={(patch) => saveStop(s.id, patch)}
              goods={stopLogs.find((x) => x.stop_id === s.id && x.date === serviceKey) ?? null}
              canEditGoods={isAdmin || isActiveOrg}
              onSaveGoods={(v) => saveStopGoods(s.id, v)}
              onSuspend={() => suspendStop(s.id)}
              onRestore={() => restoreStop(s.id)}
              onDelete={() => deleteStop(s.id)}
              onOpenUser={(uid) => { select("user", uid, false); setReturnStopId(s.id); }}
              onOpenProp={(pid) => { select("prop", pid, false); setReturnStopId(s.id); }}
              onEditChange={onStopEditChange}
              onAddUser={async (v) => {
                if (!isAdmin && !isActiveOrg) {
                  throw new Error("Non hai diritti di scrittura in questo momento.");
                }
                const { data, error } = await supabase()
                  .from("service_users")
                  .insert({
                    name: v.name,
                    description: v.desc,
                    lat: s.lat,
                    lng: s.lng,
                    created_by_org: myOrgId(),
                    stop_id: s.id,
                    multiple: v.multiple,
                  })
                  .select()
                  .single();
                if (error) throw error;
                setUsers((prev) => [...prev, data as ServiceUser]);
                toast("Utente aggiunto alla tappa");
              }}
              onValidate={() => validateStop(s)}
            />
          </Popup>
        );
        }
      } else if (selected.kind === "prop") {
        // Ogni proposta cliccata (su mappa o da elenco) apre la scheda.
        // Vecchie proposte (Proposal): gestite da PropDetail.
        const p = proposals.find((x) => x.id === selected.id);
        if (p) {
          const propReadOnly = p.status !== "pending";
          return (
            <Popup title={p.name} onClose={backToStopOrClose}>
            <PropDetail
              p={p}
              orgs={orgs}
              isAdmin={isAdmin}
              expired={daysLeft(p) <= 0}
              canVerify={!propReadOnly && isActiveOrg}
              verifyMsg={
                duty
                  ? `Fino alle ${SHIFT_SWITCH_HOUR}:00 scrivono solo il Coordinamento e l'associazione uscita ieri; da quell'ora tocca a ${duty.name}.`
                  : "Stasera non c'è un'uscita in calendario."
              }
              onSaveVer={async (v) => {
                // Dopo il salvataggio la scheda si chiude da sola (torna
                // all'elenco/mappa); se fallisce resta aperta per riprovare.
                if (await saveVerification(p.id, v)) back();
              }}
              onValidate={() => validate(p)}
              onReject={() => reject(p)}
              onDelete={!propReadOnly && isActiveOrg ? () => deleteProposal(p.id) : null}
              canDelete={!propReadOnly && isActiveOrg && p.proposed_by === myOrg}
              onDeleteAdmin={!propReadOnly && isAdmin ? () => deleteProposalAdmin(p.id) : null}
              myOrg={myOrg}
              readOnly={propReadOnly || !canWrite}
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
            stops={stops}
            stopLogs={stopLogs}
            rep={rep}
            setRep={setRep}
          />
        ) : tab === "mine" && !isAdmin && myOrg ? (
          <OrgReport
            orgs={orgs}
            users={[...users, ...suspendedUsers, ...deletedUsers]}
            logs={logs}
            proposals={proposals}
            stops={stops}
            stopLogs={stopLogs}
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
        ) : tab === "validare" && isAdmin ? (
          validateTabHTML()
        ) : tab === "proposte" ? (
          propsTabHTML()
        ) : (
          listHTML()
        )}
      </>
    );
  }

  // --- legenda e layout ---
  const menuWide = isAdmin;
  // Conteggi allineati ai segnaposto sulla mappa (stessa regola di mapItems)
  const activeStops = stops.filter((s) => s.status === "active");
  const stopsDone = activeStops.filter((s) => stopServed(s)).length;
  const stopsEmpty = activeStops.filter(
    (s) => !stopServed(s) && !users.some((u) => u.stop_id === s.id)
  ).length;
  const stopsServing = activeStops.length - stopsDone - stopsEmpty;
  const stopsSusp = showSuspended ? stops.filter((s) => s.status === "suspended").length : 0;
  const stopsDel = showDeleted ? stops.filter((s) => s.status === "deleted").length : 0;
  // Tappe proposte in legenda solo se hanno il pin sulla mappa (flag "Tappe proposte" attivo).
  const propsTodo = showStopProps ? pendingStops.filter((s) => !stopServed(s)).length : 0;
  const propsDone = showStopProps ? pendingStops.filter((s) => stopServed(s)).length : 0;

  const legend =
    stopsServing + stopsDone + stopsEmpty + stopsSusp + stopsDel + propsTodo + propsDone > 0 ? (
      <ul className="legend">
        {stopsServing > 0 && (
          <li>
            <span className="dot st-todo" /> Tappe da servire <b>{stopsServing}</b>
          </li>
        )}
        {stopsDone > 0 && (
          <li>
            <span className="dot st-done" /> Tappe servite <b>{stopsDone}</b>
          </li>
        )}
        {stopsEmpty > 0 && (
          <li>
            <span className="dot st-missing" /> Tappe vuote <b>{stopsEmpty}</b>
          </li>
        )}
        {stopsSusp > 0 && (
          <li>
            <LegendPin color="#f59e0b" glyph="slash" /> Tappe sospese <b>{stopsSusp}</b>
          </li>
        )}
        {stopsDel > 0 && (
          <li>
            <LegendPin color="#374151" glyph="cross" /> Tappe eliminate <b>{stopsDel}</b>
          </li>
        )}
        {propsTodo > 0 && (
          <li>
            <LegendPin color="#7c3aed" glyph="prop" badge="todo" /> Proposte da servire <b>{propsTodo}</b>
          </li>
        )}
        {propsDone > 0 && (
          <li>
            <LegendPin color="#7c3aed" glyph="prop" badge="done" /> Proposte servite <b>{propsDone}</b>
          </li>
        )}
      </ul>
    ) : null;

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
              {profile.display_name || (myOrgId() ? orgName(myOrgId() ?? "", orgs) : "-")}
            </span>
            <button className="linkbtn" type="button" onClick={isActiveOrg ? openExit : signOut}>
              Esci
            </button>
          </div>
        </div>
      </header>

      {exitOpen ? (
        <Popup title="" onClose={() => (exitBusy ? undefined : setExitOpen(false))}>
          <div className="stack">
            {exitCount > 0 ? (
              <div className="stack" style={{ gap: 6 }}>
                <p style={{ margin: 0, fontWeight: 700 }}>
                  Vuoi generare il report dell&apos;uscita del {fmtDay(serviceKey)} prima di uscire?
                </p>
                <p style={{ margin: 0, fontSize: "0.85em" }}>
                  Il report va inviato entro le ore {autoReportHour}:00. Se non lo invii tu, il sistema
                  provvederà all&apos;invio autonomo, anche se parziale.
                </p>
              </div>
            ) : (
              <p className="notice">
                Per l&apos;uscita del {fmtDay(serviceKey)} non risulta nessun esito registrato, quindi non
                c&apos;è un report da generare.
              </p>
            )}
            {exitError ? (
              <p className="notice" style={{ color: "var(--danger)" }}>
                {exitError} Puoi riprovare, scaricare il file oppure uscire senza inviare.
              </p>
            ) : null}

            <div className="stack" style={{ gap: 8 }}>
              {exitCount > 0 ? (
                <>
                  <button className="btn btn-primary" type="button" onClick={sendReportAndExit} disabled={exitBusy}>
                    {exitBusy ? "Invio il report…" : "Genera e invia report ed esci"}
                  </button>
                  {exitError ? (
                    <button className="btn" type="button" onClick={downloadOutingReport} disabled={exitBusy}>
                      Scarica il file
                    </button>
                  ) : null}
                </>
              ) : null}
              <button className="btn" type="button" onClick={signOut} disabled={exitBusy}>
                Esci senza generare
              </button>
              <button className="btn" type="button" onClick={() => setExitOpen(false)} disabled={exitBusy}>
                Resta nell&apos;app
              </button>
            </div>
          </div>
        </Popup>
      ) : null}

      {backOpen ? (
        <Popup title="" onClose={() => setBackOpen(false)}>
          <div className="stack">
            <p style={{ margin: 0, fontWeight: 700 }}>Vuoi uscire dall&apos;app?</p>
            <p style={{ margin: 0, fontSize: "0.85em" }}>
              Hai premuto il tasto Indietro. Se resti, continui da dove eri.
            </p>
            <div className="stack" style={{ gap: 8 }}>
              <button className="btn btn-primary" type="button" onClick={() => setBackOpen(false)}>
                Resta nell&apos;app
              </button>
              <button
                className="btn"
                type="button"
                onClick={() => {
                  setBackOpen(false);
                  if (isActiveOrg) openExit();
                  else confirmBackLeave();
                }}
              >
                Esci
              </button>
            </div>
          </div>
        </Popup>
      ) : null}

      <MapView
        items={mapItems}
        selected={mapSelected}
        placing={placing}
        focusTo={focus}
        onSelect={select}
        onPlace={(lat, lng) => setDraftPos({ lat, lng })}
        onMove={onMapMove}
        draggableId={editingStopId}
        overlays={
          <>
            {!placing && (
              <div className="mapflags mapflags-bottomright" role="group" aria-label="Mostra tappe non attive">
                <label className="mapflag">
                  <input
                    type="checkbox"
                    checked={showStopProps}
                    onChange={(e) => setShowStopProps(e.target.checked)}
                  />
                  <span>Tappe proposte</span>
                </label>
                <label className="mapflag">
                  <input
                    type="checkbox"
                    checked={showSuspended}
                    onChange={(e) => setShowSuspended(e.target.checked)}
                  />
                  <span>Tappe sospese</span>
                </label>
                <label className="mapflag">
                  <input
                    type="checkbox"
                    checked={showDeleted}
                    onChange={(e) => setShowDeleted(e.target.checked)}
                  />
                  <span>Tappe eliminate</span>
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
        </div>
        {!!notices.length && tab === "proposte" && (
          <div className="broadcast" role="status" aria-label="Avvisi del coordinamento">
            {notices.map((n) => (
              <div className="broadcast-item" key={n.id}>
                <span className="broadcast-tag">Avviso</span>
                {isAdmin && editNoticeId === n.id ? (
                  <div className="stack" style={{ gap: 6, flex: 1 }}>
                    <textarea
                      rows={6}
                      maxLength={3000}
                      autoFocus
                      value={editNoticeText}
                      onChange={(e) => setEditNoticeText(e.target.value)}
                    />
                    <div className="actions" style={{ padding: 0, display: "flex", gap: 8 }}>
                      <button
                        className="btn btn-primary btn-sm"
                        type="button"
                        disabled={noticeBusy || !editNoticeText.trim()}
                        onClick={() => void saveNoticeEdit()}
                      >
                        {noticeBusy ? "Salvo…" : "Salva"}
                      </button>
                      <button
                        className="btn btn-sm"
                        type="button"
                        disabled={noticeBusy}
                        onClick={() => {
                          setEditNoticeId(null);
                          setEditNoticeText("");
                        }}
                      >
                        Annulla
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <NoticeText text={n.message} />
                    {isAdmin && (
                      <div style={{ display: "flex", gap: 14, marginTop: 6 }}>
                        <button
                          className="linkbtn"
                          type="button"
                          onClick={() => void removeNotice(n.id)}
                        >
                          Rimuovi
                        </button>
                        <button
                          className="linkbtn"
                          type="button"
                          onClick={() => {
                            setEditNoticeId(n.id);
                            setEditNoticeText(n.message);
                          }}
                        >
                          Modifica
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        {panelBody()}
        <div className="foot">
          <p>Dati salvati su Supabase · mappa © OpenStreetMap contributors</p>
        </div>
      </aside>

      {/* Briefing d'accesso (solo associazioni): avvisi non ancora letti e,
          il giorno della propria uscita, sommario della sera prima con note
          evidenziate. Si ripresenta a ogni refresh finché è il turno dell'associazione;
          gli avvisi già letti non tornano. */}
      {briefOpen && (
        <Popup
          title="Aggiornamenti"
          onClose={closeBrief}
          wide
        >
          {briefUnseen.length > 0 && (
            <section className="brief-sec">
              <p className="subhead">Avvisi del coordinamento</p>
              {briefUnseen.map((n) => (
                <div key={n.id} className="brief-avviso">
                  <NoticeText text={n.message} />
                </div>
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
                Tappe attive: <b>{stops.filter((s) => s.status === "active").length}</b> ·
                Utenze sulla mappa: <b>{users.length}</b> · esiti registrati:{" "}
                <b>{yLogs.length}</b> · trovati: <b>{yFound}</b> · non trovati:{" "}
                <b>{yLogs.filter((l) => !l.found).length}</b>
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
                    Ieri nessuna nota importante riportata.
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

      {purgeNoticeOpen ? (
        <Popup title="Fine stagione: cancellazione dei dati" onClose={() => setPurgeClosed(true)}>
          <div className="stack">
            <p style={{ margin: 0, fontWeight: 700 }}>
              {purgeAllowed
                ? `Le uscite sono terminate il ${fmtDay(SEASON_END)}: vuoi cancellare ora i dati degli utenti?`
                : `Il servizio termina il ${fmtDay(SEASON_END)}: tra ${purgeDaysLeft} ${purgeDaysLeft === 1 ? "giorno" : "giorni"} i dati degli utenti vanno cancellati.`}
            </p>
            <p style={{ margin: 0, fontSize: "0.9em" }}>
              Se non cancelli tu, la cancellazione avverrà in automatico il{" "}
              <b>{fmtDay(PURGE_AUTO_DATE)}</b>.
            </p>
            <div className="stack" style={{ gap: 6, fontSize: "0.9em" }}>
              <p style={{ margin: 0 }}>
                <b>Verranno cancellati</b>: utenti (nickname, descrizione, posizione, note), esiti
                serali, candidati e relative verifiche.
              </p>
              <p style={{ margin: 0 }}>
                <b>Resteranno</b>: le tappe, i beni forniti per tappa e uno storico statistico
                anonimo (utenti trovati per tappa e serata, cosa è stato fornito).
              </p>
              <p style={{ margin: 0 }}>
                Prima di procedere scarica dal tab Report i file che ti servono e avvisa le
                associazioni. La cancellazione è definitiva e non si può annullare.
              </p>
            </div>
            {purgeAllowed && purgeStep === "info" ? (
              <div className="actions" style={{ padding: 0, display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  className="btn btn-danger"
                  type="button"
                  onClick={() => {
                    setPurgeStep("confirm");
                    setPurgeText("");
                    setPurgeErr("");
                  }}
                >
                  Cancella i dati della stagione…
                </button>
                <button className="btn" type="button" onClick={() => setPurgeClosed(true)}>
                  Più tardi
                </button>
              </div>
            ) : null}
            {purgeAllowed && purgeStep === "confirm" ? (
              <div className="stack" style={{ gap: 8 }}>
                <label className="lb" htmlFor="purge-confirm">
                  Per confermare scrivi <b>CANCELLA</b>
                </label>
                <input
                  id="purge-confirm"
                  type="text"
                  autoComplete="off"
                  value={purgeText}
                  onChange={(e) => setPurgeText(e.target.value)}
                />
                {purgeErr ? (
                  <p className="notice" style={{ color: "var(--danger)" }}>
                    {purgeErr}
                  </p>
                ) : null}
                <div className="actions" style={{ padding: 0, display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    className="btn btn-danger"
                    type="button"
                    onClick={runPurge}
                    disabled={purgeBusy || purgeText.trim() !== "CANCELLA"}
                  >
                    {purgeBusy ? "Cancello…" : "Cancella definitivamente"}
                  </button>
                  <button className="btn" type="button" onClick={() => setPurgeStep("info")} disabled={purgeBusy}>
                    Annulla
                  </button>
                </div>
              </div>
            ) : null}
            {!purgeAllowed ? (
              <div className="actions" style={{ padding: 0 }}>
                <button className="btn" type="button" onClick={() => setPurgeClosed(true)}>
                  Ho capito
                </button>
              </div>
            ) : null}
          </div>
        </Popup>
      ) : null}

      {toastMsg && (
        <div className="toast" role="status">
          {toastMsg}
        </div>
      )}
    </div>
  );
}






