"use client";

// Tab "Report" (solo coordinamento): filtri e generazione del report (CSV o
// Excel). Gli esiti non si mostrano a video: i filtri servono solo a scegliere
// cosa includere nel report generato. Utenti attivi sempre; sospesi ed eliminati
// solo se accesi i relativi flag; visite su proposte solo se acceso il flag
// dedicato (spento di default); una singola proposta è selezionabile dal filtro
// Utente anche se non valutata.

import { useMemo, useRef, useState } from "react";
import type { DailyLog, Org, Proposal, ServiceUser, Stop, StopLog } from "@/lib/types";
import { allRecs, csvOf, filterRange, reportTable } from "@/lib/report";
import { downloadExcel, reportFileName } from "@/lib/excel";
import { addDaysKey, today } from "@/lib/format";
import PanelHeader from "@/components/PanelHeader";

export default function ReportView({
  orgs,
  users,
  logs,
  proposals,
  stops,
  stopLogs,
  rep,
  setRep,
}: {
  orgs: Org[];
  users: ServiceUser[];
  logs: DailyLog[];
  proposals: Proposal[];
  stops: Stop[];
  stopLogs: StopLog[];
  rep: { from: string; to: string };
  setRep: React.Dispatch<React.SetStateAction<{ from: string; to: string }>>;
}) {
  const [copied, setCopied] = useState(false);
  const [fallback, setFallback] = useState("");
  const [busyXlsx, setBusyXlsx] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);
  // Filtri aggiuntivi sul periodo: giorno singolo, associazione, utente.
  const [fDay, setFDay] = useState("");
  const [fOrg, setFOrg] = useState("");
  const [fStop, setFStop] = useState("");
  const [fUser, setFUser] = useState("");
  // Due flag distinti per includere nel report gli utenti non attivi,
  // più quello per le visite sulle proposte (spento di default).
  const [repIncSusp, setRepIncSusp] = useState(false);
  const [repIncDel, setRepIncDel] = useState(false);
  const [repIncProp, setRepIncProp] = useState(false);

  const stOf = (u: ServiceUser) => (u.deleted ? "eliminato" : !u.active ? "sospeso" : "");
  // Nome visualizzato per ogni utenza: stato tra parentesi solo se non attiva.
  const uidOf = useMemo(() => {
    const m = new Map<string, string>();
    users.forEach((u) => m.set(u.id, u.name + (stOf(u) ? ` (${stOf(u)})` : "")));
    return m;
  }, [users]);
  const suspUsers = useMemo(() => users.filter((u) => !u.deleted && !u.active), [users]);
  const delUsers = useMemo(() => users.filter((u) => !!u.deleted), [users]);
  // Utenze selezionabili e mostrata a tabella: attive sempre, non attive solo
  // se il relativo flag è acceso.
  const visibleUsers = useMemo(
    () =>
      users.filter(
        (u) =>
          (!u.deleted && u.active) ||
          (repIncSusp && !u.deleted && !u.active) ||
          (repIncDel && !!u.deleted)
      ),
    [users, repIncSusp, repIncDel]
  );
  const visibleUid = useMemo(() => new Set(visibleUsers.map((u) => u.id)), [visibleUsers]);

  // Filtro Tappe: gli esiti si legano alla tappa tramite l'utente (o la proposta)
  // a cui appartengono. Con una tappa scelta, Utente e Proposte mostrano solo
  // quelli di quella tappa.
  const stopsSorted = useMemo(
    () => [...stops].sort((a, b) => a.name.localeCompare(b.name)),
    [stops]
  );
  const stopLabel = (s: Stop) =>
    s.name + (s.status === "active" ? "" : s.status === "pending" ? " (in attesa)" : s.status === "suspended" ? " (sospesa)" : " (eliminata)");
  const userStop = useMemo(() => new Map(users.map((u) => [u.id, u.stop_id])), [users]);
  const propStop = useMemo(() => new Map(proposals.map((p) => [p.id, p.stop_id])), [proposals]);
  const selectableUsers = useMemo(
    () => visibleUsers.filter((u) => !fStop || u.stop_id === fStop),
    [visibleUsers, fStop]
  );

  const recs = useMemo(() => allRecs(users, logs, proposals), [users, logs, proposals]);
  const ranged = useMemo(() => filterRange(recs, rep.from, rep.to), [recs, rep.from, rep.to]);

  // Proposte non validate: primo gruppo "Seleziona proposta" se qualche visita
  // rientra nel periodo, secondo gruppo tutte (anche quelle mai valutate:
  // in quel caso il report esce vuoto).
  const propVisits = useMemo(
    () => new Set(ranged.filter((r) => r.pid).map((r) => r.pid as string)),
    [ranged]
  );
  const propsAll = useMemo(
    () => [...proposals].sort((a, b) => a.name.localeCompare(b.name)),
    [proposals]
  );
  const propsInStop = useMemo(
    () => propsAll.filter((p) => !fStop || p.stop_id === fStop),
    [propsAll, fStop]
  );
  const propsAllOthers = useMemo(
    () => propsInStop.filter((p) => !propVisits.has(p.id)),
    [propsInStop, propVisits]
  );

  // Tipo di selezione corrente del filtro Utente: utenti regolari (plain uid),
  // proposte non validate (prefisso "p:"). Spegnendo un flag, selezioni che
  // non sono più visibili vengono annullate in automatico.
  const kindOf = (id: string) => {
    const u = users.find((x) => x.id === id);
    if (!u) return "";
    return u.deleted ? "del" : !u.active ? "susp" : "active";
  };

  // L'id di selezione di una proposta non validata ("p:<id>") bypasse il flag
  // Proposte: il report di una proposta specifica è sempre disponibile.
  const rows = useMemo(() => {
    const fProp = fUser.startsWith("p:") ? fUser.slice(2) : "";
    return ranged.filter(
      (r) =>
        (!fDay || r.date === fDay) &&
        (!fOrg || r.org === fOrg) &&
        (!fStop || r.stop === fStop) &&
        (!fUser || (fProp ? r.pid === fProp : r.uid === fUser)) &&
        (!r.uid || visibleUid.has(r.uid)) &&
        (!r.prop || repIncProp || !!fProp)
    );
  }, [ranged, fDay, fOrg, fStop, fUser, visibleUid, repIncProp]);
  const filtersOn = !!(fDay || fOrg || fStop || fUser || repIncSusp || repIncDel || repIncProp);

  // Beni forniti alle tappe (log su base tappa), con gli stessi filtri di periodo,
  // giorno, associazione e tappa. Non dipendono dagli utenti: si sommano a parte.
  const stopLogsF = useMemo(
    () =>
      stopLogs.filter(
        (g) =>
          g.date >= rep.from &&
          g.date <= rep.to &&
          (!fDay || g.date === fDay) &&
          (!fOrg || g.org_id === fOrg) &&
          (!fStop || g.stop_id === fStop)
      ),
    [stopLogs, rep.from, rep.to, fDay, fOrg, fStop]
  );

  // Righe che conterrà il report generato con i filtri attuali (il report non si
  // mostra a video: qui serve solo per capire se i filtri danno qualcosa).
  const exportCount = useMemo(
    () => reportTable(rows, orgs, stops, stopLogsF, { extras: !fUser }).length,
    [rows, orgs, stops, stopLogsF, fUser]
  );


  async function copyCsv() {
    const csv = csvOf(rows, orgs, stops, stopLogsF, { extras: !fUser });
    try {
      await navigator.clipboard.writeText(csv);
      setCopied(true);
      setFallback("");
      setTimeout(() => setCopied(false), 3200);
    } catch {
      setFallback(csv);
    }
  }

  async function downloadXlsx() {
    setBusyXlsx(true);
    try {
      await downloadExcel(rows, orgs, "Report", reportFileName("report_accoglienza", rep.to), stops, stopLogsF, {
        extras: !fUser,
      });
    } finally {
      setBusyXlsx(false);
    }
  }

  function preset(days: number | "all") {
    if (days === "all") {
      const ds = recs.map((r) => r.date).sort();
      setRep({ from: ds[0] || today(), to: today() });
    } else {
      setRep({ from: addDaysKey(-(days - 1)), to: today() });
    }
  }

  return (
    <div className="detail stack">
      <PanelHeader title="Report" subtitle="Riservato al coordinamento" />
      <div className="rep-range">
        <div>
          <label className="lb" htmlFor="r-from">
            Dal
          </label>
          <input
            id="r-from"
            type="date"
            value={rep.from}
            onChange={(e) => setRep((s) => ({ ...s, from: e.target.value }))}
          />
        </div>
        <div>
          <label className="lb" htmlFor="r-to">
            Al
          </label>
          <input
            id="r-to"
            type="date"
            value={rep.to}
            onChange={(e) => setRep((s) => ({ ...s, to: e.target.value }))}
          />
        </div>
      </div>
      <div className="actions" style={{ padding: 0 }}>
        <button className="btn btn-sm" type="button" onClick={() => preset(7)}>
          Ultimi 7 giorni
        </button>
        <button className="btn btn-sm" type="button" onClick={() => preset(30)}>
          Ultimi 30 giorni
        </button>
        <button className="btn btn-sm" type="button" onClick={() => preset("all")}>
          Tutto
        </button>
      </div>

      <div className="stack">
        <h3>Filtri</h3>
        <div>
          <label className="lb" htmlFor="f-day">
            Giorno singolo
          </label>
          <input
            id="f-day"
            type="date"
            value={fDay}
            onChange={(e) => {
              const v = e.target.value;
              setFDay(v);
              if (v && (v < rep.from || v > rep.to)) setRep({ from: v <= rep.from ? v : rep.from, to: v >= rep.to ? v : rep.to });
            }}
          />
        </div>
        <div>
          <label className="lb" htmlFor="f-org">
            Associazione
          </label>
          <select id="f-org" value={fOrg} onChange={(e) => setFOrg(e.target.value)}>
            <option value="">Tutte le associazioni</option>
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="lb" htmlFor="f-stop">
            Tappa
          </label>
          <select
            id="f-stop"
            value={fStop}
            onChange={(e) => {
              const v = e.target.value;
              setFStop(v);
              // Se l'utente o la proposta scelti non sono in questa tappa, si annulla la selezione.
              if (v && fUser) {
                const ok = fUser.startsWith("p:")
                  ? propStop.get(fUser.slice(2)) === v
                  : userStop.get(fUser) === v;
                if (!ok) setFUser("");
              }
            }}
          >
            <option value="">Tutte le tappe</option>
            {stopsSorted.map((s) => (
              <option key={s.id} value={s.id}>
                {stopLabel(s)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="lb" htmlFor="f-user">
            Utente
          </label>
          <select id="f-user" value={fUser} onChange={(e) => setFUser(e.target.value)}>
            <option value="">Tutti gli utenti</option>
            <optgroup label="Utenti">
              {selectableUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {uidOf.get(u.id) || u.name}
                </option>
              ))}
            </optgroup>
            {!!propVisits.size && (!fStop || propsInStop.some((p) => propVisits.has(p.id))) && (
              <optgroup label="Proposte con visite nel periodo">
                {[...propVisits]
                  .map((id) => propsAll.find((p) => p.id === id))
                  .filter((p): p is Proposal => !!p && (!fStop || p.stop_id === fStop))
                  .map((p) => (
                    <option key={`p:${p.id}`} value={`p:${p.id}`}>
                      {p.name} (proposta)
                    </option>
                  ))}
              </optgroup>
            )}
            {!!propsAllOthers.length && (
              <optgroup label="Altre proposte">
                {propsAllOthers.map((p) => (
                  <option key={`p:${p.id}`} value={`p:${p.id}`}>
                    {p.name} (proposta)
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </div>
        {!!(suspUsers.length || delUsers.length || propsAll.length) && (
          <div className="actions" style={{ padding: 0 }} role="group" aria-label="Includi nel report utenti non attivi e proposte">
            {!!suspUsers.length && (
              <label className="mapflag">
                <input
                  type="checkbox"
                  checked={repIncSusp}
                  onChange={(e) => {
                    const v = e.target.checked;
                    setRepIncSusp(v);
                    if (!v && fUser && kindOf(fUser) === "susp") setFUser("");
                  }}
                />
                <span>Sospesi ({suspUsers.length})</span>
              </label>
            )}
            {!!delUsers.length && (
              <label className="mapflag">
                <input
                  type="checkbox"
                  checked={repIncDel}
                  onChange={(e) => {
                    const v = e.target.checked;
                    setRepIncDel(v);
                    if (!v && fUser && kindOf(fUser) === "del") setFUser("");
                  }}
                />
                <span>Eliminati ({delUsers.length})</span>
              </label>
            )}
            {!!propsAll.length && (
              <label className="mapflag">
                <input
                  type="checkbox"
                  checked={repIncProp}
                  onChange={(e) => setRepIncProp(e.target.checked)}
                />
                <span>Proposte ({propsAll.length})</span>
              </label>
            )}
          </div>
        )}
        {filtersOn ? (
          <button
            className="btn btn-sm"
            type="button"
            onClick={() => {
              setFDay("");
              setFOrg("");
              setFStop("");
              setFUser("");
              setRepIncSusp(false);
              setRepIncDel(false);
              setRepIncProp(false);
            }}
          >
            Azzera filtri
          </button>
        ) : null}
      </div>

      <div className="stack" ref={boxRef}>
        <h3>Genera report</h3>
        <p className="notice">
          {exportCount
            ? `Il report contiene ${exportCount} ${exportCount === 1 ? "riga" : "righe"}.`
            : "Nessuna uscita registrata con i filtri scelti."}{" "}
          Il testo CSV si incolla in Excel o Fogli Google;
          il file Excel si scarica direttamente nel browser.
        </p>
        <button className="btn btn-primary" type="button" onClick={copyCsv} disabled={!exportCount}>
          {copied ? "Copiato!" : "Copia report in CSV"}
        </button>
        <button className="btn" type="button" onClick={downloadXlsx} disabled={busyXlsx || !exportCount}>
          {busyXlsx ? "Genero…" : "Scarica report in Excel (.xlsx)"}
        </button>
        {fallback ? (
          <div>
            <label className="lb" htmlFor="csvta">
              Copia il testo e incollalo in un foglio di calcolo
            </label>
            <textarea id="csvta" rows={6} readOnly value={fallback} />
          </div>
        ) : null}
      </div>
    </div>
  );
}

