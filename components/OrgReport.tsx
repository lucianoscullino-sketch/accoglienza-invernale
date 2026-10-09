"use client";

// Tab "Il tuo report": ogni associazione vede le attività svolte in un suo turno.
// Di default viene mostrata l'ultima uscita (inclusa quella di stasera, se c'è già
// qualcosa registrato), con possibilità di scegliere un'altra sera ed esportare in CSV.

import { useMemo, useState } from "react";
import type { DailyLog, Org, Proposal, ServiceUser } from "@/lib/types";
import { allRecs } from "@/lib/report";
import { downloadExcel, reportFileName } from "@/lib/excel";
import { fmtShort, orgName, today } from "@/lib/format";

export default function OrgReport({
  orgs,
  users,
  logs,
  proposals,
  myOrg,
}: {
  orgs: Org[];
  users: ServiceUser[];
  logs: DailyLog[];
  proposals: Proposal[];
  myOrg: string;
}) {
  const [nightSel, setNightSel] = useState("");
  const [busyXlsx, setBusyXlsx] = useState(false);

  const mine = useMemo(
    () =>
      allRecs(users, logs, proposals)
        .filter((r) => r.org === myOrg)
        .sort((a, b) => b.date.localeCompare(a.date) || b.at.localeCompare(a.at)),
    [users, logs, proposals, myOrg]
  );
  const nights = useMemo(() => [...new Set(mine.map((r) => r.date))], [mine]);
  // Ultima uscita di default (inclusa quella di stasera), senza effetti collaterali
  const night = nights.includes(nightSel) ? nightSel : nights[0] || "";

  if (!nights.length)
    return (
      <div className="detail stack">
        <h2>Il tuo report</h2>
        <p className="notice">
          La tua associazione non ha ancora registrato uscite. Il report di una sera compare qui
          dopo la prima registrazione.
        </p>
      </div>
    );

  const rows = mine
    .filter((r) => r.date === night)
    .sort((a, b) => a.at.localeCompare(b.at));
  const found = rows.filter((r) => r.found).length;

  const kpi = (v: string | number, l: string) => (
    <div className="kpi">
      <b>{v}</b>
      <span>{l}</span>
    </div>
  );

  async function downloadXlsx() {
    setBusyXlsx(true);
    try {
      await downloadExcel(rows, orgs, fmtShort(night), reportFileName(`report_${myOrg}`, night));
    } finally {
      setBusyXlsx(false);
    }
  }

  return (
    <div className="detail stack">
      <div>
        <h2>Il tuo report</h2>
        <p className="pgtxt" style={{ margin: "4px 0 0" }}>
          Tutte le attività svolte da <strong>{orgName(myOrg, orgs)}</strong> in una sera di
          uscita, utenti regolari e proposte verificate.
        </p>
      </div>
      <div>
        <label className="lb" htmlFor="my-night">
          Sera di uscita
        </label>
        <select id="my-night" value={night} onChange={(e) => setNightSel(e.target.value)}>
          {nights.map((n) => (
            <option key={n} value={n}>
              {fmtShort(n)}
              {n === today() ? " · stasera" : ""}
            </option>
          ))}
        </select>
      </div>

      <div className="kpis">
        {kpi(rows.length, "utenti visitati (contatti)")}
        {kpi(found, "trovati")}
        {kpi(rows.length - found, "non trovati")}
      </div>

      <div className="stack">
        <h3>Attività della sera</h3>
        <div className="tblwrap">
          <table>
            <thead>
              <tr>
                <th>Nickname</th>
                <th className="num">Trovato</th>
                <th>Fornito</th>
                <th>Richiesto</th>
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td>
                    {r.name}
                    {r.prop ? " (proposta)" : null}
                  </td>
                  <td className="num">{r.found ? "sì" : "no"}</td>
                  <td>{r.provided.join(", ").toLowerCase() || "-"}</td>
                  <td>{r.requested || "-"}</td>
                  <td>{r.note || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="stack">
        <h3>Esporta</h3>
        <p className="notice">
          Il file Excel contiene una riga per ogni uscita della sera (data, associazione,
          nickname, trovato, fornito, richiesto, note, se è una proposta) e si scarica
          direttamente nel browser: su telefono finisce in Download/File.
        </p>
        <button className="btn btn-primary" type="button" onClick={downloadXlsx} disabled={busyXlsx}>
          {busyXlsx ? "Genero…" : "Scarica report della sera in Excel (.xlsx)"}
        </button>
      </div>
    </div>
  );
}
