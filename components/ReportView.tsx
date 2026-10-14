"use client";

// Tab "Report" (solo coordinamento): KPI, breakdown per associazione e utente
// (attivi sempre; sospesi ed eliminati solo se accesi i relativi flag nel
// filtro per utente, con stato tra parentesi), beni forniti, richieste
// emerse ed esportazione CSV.

import { useMemo, useRef, useState } from "react";
import type { DailyLog, Org, Proposal, ServiceUser } from "@/lib/types";
import { allRecs, csvOf, filterRange } from "@/lib/report";
import { downloadExcel, reportFileName } from "@/lib/excel";
import { addDaysKey, fmtShort, orgName, today } from "@/lib/format";
import PanelHeader from "@/components/PanelHeader";

export default function ReportView({
  orgs,
  users,
  logs,
  proposals,
  rep,
  setRep,
}: {
  orgs: Org[];
  users: ServiceUser[];
  logs: DailyLog[];
  proposals: Proposal[];
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
  const [fUser, setFUser] = useState("");
  // Due flag distinti per includere nel report gli utenti non attivi.
  const [repIncSusp, setRepIncSusp] = useState(false);
  const [repIncDel, setRepIncDel] = useState(false);

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

  // Tipo della selezione corrente: spegnendo un flag, una selezione di un
  // utente non più visibile viene annullata in automatico.
  const kindOf = (id: string) => {
    const u = users.find((x) => x.id === id);
    if (!u) return "";
    return u.deleted ? "del" : !u.active ? "susp" : "active";
  };

  const recs = useMemo(() => allRecs(users, logs, proposals), [users, logs, proposals]);
  const ranged = useMemo(() => filterRange(recs, rep.from, rep.to), [recs, rep.from, rep.to]);
  const rows = useMemo(
    () =>
      ranged.filter(
        (r) =>
          (!fDay || r.date === fDay) &&
          (!fOrg || r.org === fOrg) &&
          (!fUser || (r.uid ? r.uid === fUser : r.name === fUser)) &&
          (!r.uid || visibleUid.has(r.uid))
      ),
    [ranged, fDay, fOrg, fUser, visibleUid]
  );
  const filtersOn = !!(fDay || fOrg || fUser || repIncSusp || repIncDel);

  const nights = new Set(rows.map((r) => r.date)).size;
  const found = rows.filter((r) => r.found).length;
  const rate = rows.length ? Math.round((found / rows.length) * 100) : 0;

  const prov: [string, number][] = [];
  const provMap: Record<string, number> = {};
  rows.forEach((r) =>
    r.provided.forEach((p) => {
      if (!provMap[p]) prov.push([p, 0]);
      provMap[p] = (provMap[p] || 0) + 1;
    })
  );
  prov.forEach((p) => (p[1] = provMap[p[0]]));
  prov.sort((a, b) => b[1] - a[1]);
  const max = prov.length ? prov[0][1] : 1;

  const byOrg: Record<string, { d: Set<string>; n: number; f: number }> = {};
  rows.forEach((r) => {
    const o = byOrg[r.org] || (byOrg[r.org] = { d: new Set(), n: 0, f: 0 });
    o.d.add(r.date);
    o.n += 1;
    if (r.found) o.f += 1;
  });

  const byUser = visibleUsers
    .map((u) => {
      const ul = rows.filter((r) => r.uid === u.id);
      return {
        name: uidOf.get(u.id) || u.name,
        n: ul.length,
        f: ul.filter((r) => r.found).length,
        last: ul.length ? ul[ul.length - 1].date : "",
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const reqs = rows.filter((r) => r.requested).slice().reverse();

  const kpi = (v: string | number, l: string) => (
    <div className="kpi">
      <b>{v}</b>
      <span>{l}</span>
    </div>
  );
  const tbl = (head: string[], trs: React.ReactNode[]) => (
    <div className="tblwrap">
      <table>
        <thead>
          <tr>
            {head.map((h, i) => (
              <th key={h} className={i ? "num" : ""}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{trs}</tbody>
      </table>
    </div>
  );

  async function copyCsv() {
    const csv = csvOf(rows, orgs);
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
      await downloadExcel(rows, orgs, "Report", reportFileName("report_accoglienza", rep.to));
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
          <input id="f-day" type="date" value={fDay} onChange={(e) => setFDay(e.target.value)} />
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
          <label className="lb" htmlFor="f-user">
            Utente
          </label>
          <select id="f-user" value={fUser} onChange={(e) => setFUser(e.target.value)}>
            <option value="">Tutti gli utenti</option>
            {visibleUsers.map((u) => (
              <option key={u.id} value={u.id}>
                {uidOf.get(u.id) || u.name}
              </option>
            ))}
          </select>
        </div>
        {!!(suspUsers.length || delUsers.length) && (
          <div className="actions" style={{ padding: 0 }} role="group" aria-label="Includi nel report utenti non attivi">
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
          </div>
        )}
        {filtersOn ? (
          <button
            className="btn btn-sm"
            type="button"
            onClick={() => {
              setFDay("");
              setFOrg("");
              setFUser("");
              setRepIncSusp(false);
              setRepIncDel(false);
            }}
          >
            Azzera filtri
          </button>
        ) : null}
      </div>

      {!rows.length ? (
        <p className="notice">Nessuna uscita registrata nel periodo scelto.</p>
      ) : (
        <>
          <div className="kpis">
            {kpi(nights, "serate di servizio")}
            {kpi(rows.length, "utenti visitati (contatti)")}
            {kpi(`${found} (${rate}%)`, "trovati")}
            {kpi(rows.length - found, "non trovati")}
          </div>

          <div className="stack">
            <h3>Per associazione</h3>
            {tbl(
              ["Associazione", "Serate", "Trovati"],
              Object.keys(byOrg).map((id) => (
                <tr key={id}>
                  <td>{orgName(id, orgs)}</td>
                  <td className="num">{byOrg[id].d.size}</td>
                  <td className="num">
                    {byOrg[id].f} / {byOrg[id].n}
                  </td>
                </tr>
              ))
            )}
          </div>

          <div className="stack">
            <h3>Cosa è stato fornito</h3>
            {prov.length ? (
              <ul className="bars">
                {prov.map(([p, n]) => (
                  <li className="bar" key={p}>
                    <span>{p}</span>
                    <span className="barfill">
                      <i style={{ width: Math.round((n / max) * 100) + "%" }} />
                    </span>
                    <b>{n}</b>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="notice">Nulla nel periodo.</p>
            )}
          </div>

          <div className="stack">
            <h3>Richieste emerse</h3>
            {reqs.length ? (
              <ul className="hist">
                {reqs.map((r, i) => (
                  <li key={i}>
                    <div className="h-top">
                      <span className="mono">{fmtShort(r.date)}</span>
                      <span className="h-org">{r.name}</span>
                    </div>
                    <p>{r.requested}</p>
                    <p className="h-note">{orgName(r.org, orgs)}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="notice">Nessuna richiesta nel periodo.</p>
            )}
          </div>

          <div className="stack">
            <h3>Per utente</h3>
            {tbl(
              ["Nickname", "Uscite", "Trovato", "Ultima"],
              byUser.map((u) => (
                <tr key={u.name}>
                  <td>{u.name}</td>
                  <td className="num">{u.n}</td>
                  <td className="num">{u.f}</td>
                  <td className="num">{u.last ? fmtShort(u.last) : "-"}</td>
                </tr>
              ))
            )}
          </div>

          <div className="stack" ref={boxRef}>
            <h3>Esporta</h3>
            <p className="notice">
              Il testo copiato contiene una riga per ogni uscita (data, associazione, nickname,
              trovato, fornito, richiesto, note, se è una proposta) e si incolla in Excel o Fogli
              Google. Il file Excel usa le stesse righe e si scarica direttamente nel browser.
            </p>
            <button className="btn btn-primary" type="button" onClick={copyCsv}>
              {copied ? "Copiato!" : "Copia report in CSV"}
            </button>
            <button className="btn" type="button" onClick={downloadXlsx} disabled={busyXlsx}>
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
        </>
      )}
    </div>
  );
}

