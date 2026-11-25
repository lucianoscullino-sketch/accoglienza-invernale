"use client";

// Tab "Il tuo report": ogni associazione vede le attività svolte in un suo turno.
// Di default viene mostrata l'ultima uscita (inclusa quella di stasera, se c'è già
// qualcosa registrato), con possibilità di scegliere un'altra sera ed esportare in Excel.
// Include il riepilogo per tappa (esito tappa e beni forniti).

import { useMemo, useState } from "react";
import type { DailyLog, Org, Proposal, ServiceUser, Stop, StopLog } from "@/lib/types";
import { allRecs } from "@/lib/report";
import { downloadExcel, reportFileName } from "@/lib/excel";
import { fmtShort, orgName, today } from "@/lib/format";
import PanelHeader from "@/components/PanelHeader";

export default function OrgReport({
  orgs,
  users,
  logs,
  proposals,
  stops,
  stopLogs,
  myOrg,
}: {
  orgs: Org[];
  users: ServiceUser[];
  logs: DailyLog[];
  proposals: Proposal[];
  stops: Stop[];
  stopLogs: StopLog[];
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

  // Sere con esiti utente oppure con dati di tappa (esito o beni) firmati dall'associazione.
  const nights = useMemo(() => {
    const set = new Set<string>(mine.map((r) => r.date));
    stopLogs
      .filter((g) => g.org_id === myOrg && (g.served || g.sacchi_a_pelo > 0 || g.coperte > 0))
      .forEach((g) => set.add(g.date));
    return [...set].sort((a, b) => b.localeCompare(a));
  }, [mine, stopLogs, myOrg]);

  // Ultima uscita di default (inclusa quella di stasera), senza effetti collaterali
  const night = nights.includes(nightSel) ? nightSel : nights[0] || "";

  if (!nights.length)
    return (
      <div className="detail stack">
        <PanelHeader title="Il tuo report" />
        <p className="notice">La tua associazione non ha ancora registrato uscite.</p>
      </div>
    );

  const rows = mine.filter((r) => r.date === night).sort((a, b) => a.at.localeCompare(b.at));
  // Log di tappa della sera: quelli dell'associazione e quelli inseriti dal coordinamento (org_id vuoto).
  const stopLogsNight = stopLogs.filter(
    (g) => g.date === night && (g.org_id === myOrg || !g.org_id)
  );

  const found = rows
    .filter((r) => r.found)
    .reduce((acc, r) => acc + (r.users_found ?? (r.found ? 1 : 0)), 0);
  const notFound = rows.filter((r) => !r.found).length;

  const sname = (id?: string) =>
    id ? stops.find((s) => s.id === id)?.name || "Tappa eliminata" : "Senza tappa";

  // Riepilogo per tappa: contatti, persone trovate, esito tappa e beni.
  const stopIds = [
    ...new Set([...rows.map((r) => r.stop || ""), ...stopLogsNight.map((g) => g.stop_id)]),
  ];
  const perStop = stopIds
    .map((sid) => {
      const rs = rows.filter((r) => (r.stop || "") === sid);
      const g = stopLogsNight.find((x) => x.stop_id === sid);
      return {
        sid,
        name: sname(sid),
        contacts: rs.length,
        people: rs.filter((r) => r.found).reduce((a, r) => a + (r.users_found ?? 1), 0),
        served: g ? (g.served ? "servita" : "da servire") : "-",
        sacchi: g?.sacchi_a_pelo ?? 0,
        coperte: g?.coperte ?? 0,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  const totSacchi = perStop.reduce((a, s) => a + s.sacchi, 0);
  const totCoperte = perStop.reduce((a, s) => a + s.coperte, 0);

  const kpi = (v: string | number, l: string) => (
    <div className="kpi">
      <b>{v}</b>
      <span>{l}</span>
    </div>
  );

  async function downloadXlsx() {
    setBusyXlsx(true);
    try {
      await downloadExcel(
        rows,
        orgs,
        fmtShort(night),
        reportFileName(`report_${myOrg}`, night),
        stops,
        stopLogsNight,
        { extras: true }
      );
    } finally {
      setBusyXlsx(false);
    }
  }

  return (
    <div className="detail stack">
      <PanelHeader
        title="Il tuo report"
        subtitle={
          <>
            Tutte le attività svolte da <strong>{orgName(myOrg, orgs)}</strong> in una sera di
            uscita: utenti regolari, proposte verificate e tappe.
          </>
        }
      />
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
        {kpi(rows.length, "contatti (utenti visitati)")}
        {kpi(found, "persone trovate")}
        {kpi(notFound, "non trovati")}
        {kpi(perStop.length, "tappe")}
        {kpi(totSacchi, "sacchi a pelo")}
        {kpi(totCoperte, "coperte")}
      </div>

      <div className="stack">
        <h3>Esporta</h3>
        <p className="notice">
          Il file Excel contiene una riga per ogni esito della sera, con tappa, esito tappa e beni
          forniti (sacchi a pelo e coperte compaiono solo sulla prima riga di ogni tappa, così le
          somme in Excel non sono doppie). Si scarica direttamente nel browser: su telefono finisce
          in Download/File.
        </p>
        <button className="btn btn-primary" type="button" onClick={downloadXlsx} disabled={busyXlsx}>
          {busyXlsx ? "Genero…" : "Scarica report della sera in Excel (.xlsx)"}
        </button>
      </div>
    </div>
  );
}