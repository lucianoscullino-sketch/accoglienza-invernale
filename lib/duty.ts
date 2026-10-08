// Calendario perpetuo delle uscite.
// Regola fissa: giorni fissi della settimana (weekly: 0=dom ... 5=ven -> id associazione)
// e sabati a turno (sat.order = ordine dei turni, sat.start = sabato in cui tocca al primo).
// Le eccezioni per singola sera (calendar_overrides) prevalgono sulla regola.

import type { CalendarOverride, Settings } from "@/lib/types";
import { DAY } from "@/lib/format";

export function baseDutyId(cfg: Settings, k: string): string {
  const dt = new Date(k + "T12:00:00");
  const w = dt.getDay();
  if (w === 6) {
    const r = cfg.sat;
    const n = r?.order?.length || 0;
    if (!n) return "";
    const wk = Math.round((dt.getTime() - new Date(r.start + "T12:00:00").getTime()) / (7 * DAY));
    return r.order[((wk % n) + n) % n];
  }
  return (cfg.weekly && cfg.weekly[String(w)]) || "";
}

// "" = nessuna uscita; null/undefined = nessuna eccezione, vale la regola fissa
export function effDutyId(
  cfg: Settings | null,
  overrides: CalendarOverride[],
  k: string
): string | null {
  if (!cfg) return null;
  const row = overrides.find((o) => o.date === k);
  if (row) return row.org_id || "";
  return baseDutyId(cfg, k);
}
