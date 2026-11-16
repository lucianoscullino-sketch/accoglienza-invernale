// Calcolo del report e del CSV, ripreso dal prototipo.

import type { DailyLog, Org, Proposal, ServiceUser, Stop, StopLog } from "@/lib/types";
import { orgName } from "@/lib/format";

export interface Rec {
  date: string;
  org: string;
  uid: string;
  pid?: string; // id della proposta, solo per le visite sulle proposte (non validate)
  name: string;
  found: boolean;
  provided: string[];
  requested: string;
  note: string;
  extra?: string; // "Note uscita"
  stop?: string; // id tappa (per gli esiti utente: quella fissata al momento dell'esito)
  prop: boolean;
  at: string;
}

export function allRecs(users: ServiceUser[], logs: DailyLog[], proposals: Proposal[]): Rec[] {
  const uname = (id: string) => users.find((u) => u.id === id)?.name || "(utente rimosso)";
  const recs: Rec[] = logs.map((l) => ({
    date: l.date,
    org: l.org_id,
    uid: l.user_id,
    name: uname(l.user_id),
    found: l.found,
    provided: l.provided,
    requested: l.requested,
    note: l.note,
    extra: l.extra ?? "",
    // Esiti precedenti alla colonna stop_id: ricadiamo sulla tappa attuale dell'utente.
    stop: l.stop_id ?? users.find((u) => u.id === l.user_id)?.stop_id ?? "",
    prop: false,
    at: l.created_at || l.date,
  }));
  proposals
    .filter((p) => p.status !== "validated")
    .forEach((p) =>
      (p.verifications || []).forEach((v) =>
        recs.push({
          date: v.date,
          org: v.org_id,
          uid: "",
          pid: p.id,
          name: p.name,
          found: v.found,
          provided: v.provided,
          requested: v.requested,
          note: v.note,
          extra: v.extra ?? "",
          stop: p.stop_id ?? "",
          prop: true,
          at: v.created_at || v.date,
        })
      )
    );
  return recs;
}

export function filterRange(recs: Rec[], from: string, to: string): Rec[] {
  const f = from <= to ? from : to;
  const t = from <= to ? to : from;
  return recs.filter((r) => r.date >= f && r.date <= t).sort((a, b) => a.date.localeCompare(b.date) || a.at.localeCompare(b.at));
}

export const REPORT_HEAD = [
  "Data",
  "Associazione",
  "Tappa",
  "Esito tappa",
  "Sacchi a pelo",
  "Coperte",
  "Nickname",
  "Trovato",
  "Fornito",
  "Richiesto",
  "Note importanti",
  "Note uscita",
  "Proposta",
];

// Tabella di esportazione: una riga per esito utente, raggruppata per giorno e
// tappa. Esito tappa e beni (dal log di tappa) compaiono solo sulla prima riga
// del gruppo, così sommando le colonne in Excel non si conta due volte.
// Con extras si aggiungono le righe delle tappe che hanno un log (beni o esito)
// ma nessun esito utente nel periodo.
export function reportTable(
  rows: Rec[],
  orgs: Org[],
  stops: Stop[] = [],
  stopLogs: StopLog[] = [],
  opts: { extras?: boolean } = {}
): (string | number)[][] {
  const sname = (id?: string) => (id ? stops.find((s) => s.id === id)?.name || "Tappa eliminata" : "Senza tappa");
  const logOf = (stop: string | undefined, date: string) =>
    stop ? stopLogs.find((x) => x.stop_id === stop && x.date === date) : undefined;

  const sorted = [...rows].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      sname(a.stop).localeCompare(sname(b.stop)) ||
      a.at.localeCompare(b.at)
  );
  const out: (string | number)[][] = [];
  const seen = new Set<string>();
  const stopCols = (stop: string | undefined, date: string, first: boolean): (string | number)[] => {
    const g = first ? logOf(stop, date) : undefined;
    return g ? [g.served ? "servita" : "da servire", g.sacchi_a_pelo, g.coperte] : ["", "", ""];
  };
  sorted.forEach((r) => {
    const key = r.date + "|" + (r.stop || "");
    const first = !seen.has(key);
    seen.add(key);
    out.push([
      r.date,
      orgName(r.org, orgs),
      sname(r.stop),
      ...stopCols(r.stop, r.date, first),
      r.name,
      r.found ? "sì" : "no",
      r.provided.join(" + "),
      r.requested,
      r.note,
      r.extra ?? "",
      r.prop ? "sì" : "no",
    ]);
  });
  if (opts.extras) {
    stopLogs
      .filter((g) => !seen.has(g.date + "|" + g.stop_id) && (g.served || g.sacchi_a_pelo > 0 || g.coperte > 0))
      .sort((a, b) => a.date.localeCompare(b.date) || sname(a.stop_id).localeCompare(sname(b.stop_id)))
      .forEach((g) =>
        out.push([
          g.date,
          orgName(g.org_id, orgs),
          sname(g.stop_id),
          g.served ? "servita" : "da servire",
          g.sacchi_a_pelo,
          g.coperte,
          "",
          "",
          "",
          "",
          "",
          "",
          "no",
        ])
      );
    out.sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  }
  return out;
}

export function csvOf(
  rows: Rec[],
  orgs: Org[],
  stops: Stop[] = [],
  stopLogs: StopLog[] = [],
  opts: { extras?: boolean } = {}
): string {
  const q = (v: unknown) => '"' + String(v ?? "").replace(/"/g, '""') + '"';
  const lines = [REPORT_HEAD.map(q).join(";")];
  reportTable(rows, orgs, stops, stopLogs, opts).forEach((r) => lines.push(r.map(q).join(";")));
  return lines.join("\r\n");
}
