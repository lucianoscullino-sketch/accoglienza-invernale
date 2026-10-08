// Calcolo del report e del CSV, ripreso dal prototipo.

import type { DailyLog, Org, Proposal, ServiceUser } from "@/lib/types";
import { orgName } from "@/lib/format";

export interface Rec {
  date: string;
  org: string;
  uid: string;
  name: string;
  found: boolean;
  provided: string[];
  requested: string;
  note: string;
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
          name: p.name,
          found: v.found,
          provided: v.provided,
          requested: v.requested,
          note: v.note,
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

export function csvOf(rows: Rec[], orgs: Org[]): string {
  const q = (v: unknown) => '"' + String(v ?? "").replace(/"/g, '""') + '"';
  const head = ["Data", "Associazione", "Nickname", "Trovato", "Fornito", "Richiesto", "Note", "Proposta"];
  const lines = [head.map(q).join(";")];
  rows.forEach((r) =>
    lines.push(
      [r.date, orgName(r.org, orgs), r.name, r.found ? "sì" : "no", r.provided.join(" + "), r.requested, r.note, r.prop ? "sì" : "no"]
        .map(q)
        .join(";")
    )
  );
  return lines.join("\r\n");
}
