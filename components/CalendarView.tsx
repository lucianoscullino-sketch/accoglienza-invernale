"use client";

// Tab "Calendario": regola fissa settimanale, sabati a turno, prossime sere
// con eccezioni per singola sera e caricamento da file (solo amministratore).

import { useState, type ReactNode } from "react";
import type { CalendarOverride, Org, Settings } from "@/lib/types";
import { baseDutyId, effDutyId } from "@/lib/duty";
import { WD_IT, WK_ORDER, addDaysKey, fmtShort, orgName, today } from "@/lib/format";

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export default function CalendarView({
  orgs,
  settings,
  overrides,
  isAdmin,
  myOrg,
  calAll,
  setCalAll,
  calMsg,
  onSetOverride,
  onSaveSettings,
  onApplyText,
}: {
  orgs: Org[];
  settings: Settings | null;
  overrides: CalendarOverride[];
  isAdmin: boolean;
  myOrg: string | null;
  calAll: boolean;
  setCalAll: (v: boolean) => void;
  calMsg: string;
  onSetOverride: (dateKey: string, val: string | null | undefined) => Promise<void>;
  onSaveSettings: (patch: Partial<Pick<Settings, "weekly" | "sat">>) => Promise<void>;
  onApplyText: (text: string) => Promise<void>;
}) {
  const [text, setText] = useState("");
  const [applied, setApplied] = useState(false);
  const adm = isAdmin;

  if (!settings)
    return (
      <div className="detail stack">
        <h2>Calendario delle uscite</h2>
        <p className="notice">
          Configurazione del calendario non trovata: chiedi all&apos;amministratore di eseguire lo
          script di inizializzazione (seed.sql) su Supabase.
        </p>
      </div>
    );

  const orgOpts = (first: ReactNode) => (
    <>
      {first}
      {orgs.map((o) => (
        <option key={o.id} value={o.id}>
          {o.name}
        </option>
      ))}
    </>
  );

  const weeklyRows = WK_ORDER.map((w) => {
    let cell: ReactNode;
    if (w === 6) cell = <span>A rotazione (vedi sotto)</span>;
    else {
      const id = settings.weekly[String(w)] || "";
      cell = adm ? (
        <select
          aria-label={`Associazione del ${WD_IT[w].toLowerCase()}`}
          value={id}
          onChange={(e) =>
            onSaveSettings({ weekly: { ...settings.weekly, [String(w)]: e.target.value } })
          }
        >
          <option value="">Nessuna uscita</option>
          {orgs.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      ) : id ? (
        <span className={id === myOrg ? "calme" : ""}>{orgName(id, orgs)}</span>
      ) : (
        <span className="calnone">Nessuna uscita</span>
      );
    }
    return (
      <li className="calrow" key={w}>
        <span className="caldate">{WD_IT[w]}</span>
        {cell}
      </li>
    );
  });

  const sat = settings.sat;
  const rotRows = (sat.order || []).map((id, i) => (
    <li className="calrow" key={`rot-${i}`}>
      <span className="caldate">Turno {i + 1}</span>
      {adm ? (
        <select
          aria-label={`Associazione del turno ${i + 1}`}
          value={id}
          onChange={(e) => {
            const order = [...(sat.order || [])];
            const v = e.target.value;
            const j = order.indexOf(v);
            if (j >= 0 && j !== i) {
              order[j] = order[i];
              order[i] = v;
            }
            onSaveSettings({ sat: { ...sat, order } });
          }}
        >
          {orgOpts(null)}
        </select>
      ) : (
        <span className={id === myOrg ? "calme" : ""}>{orgName(id, orgs)}</span>
      )}
    </li>
  ));

  const nextSats: string[] = [];
  for (let i = 0; i < 60 && nextSats.length < 4; i++) {
    const k = addDaysKey(i);
    if (new Date(k + "T12:00:00").getDay() === 6) nextSats.push(`${fmtShort(k)}: ${orgName(baseDutyId(settings, k), orgs)}`);
  }


  const n = calAll ? 90 : 28;
  const days = Array.from({ length: n }, (_, i) => addDaysKey(i));
  const rows = days.map((k) => {
    const ov = overrides.find((o) => o.date === k);
    const id = effDutyId(settings, overrides, k) || "";
    const org = orgs.find((o) => o.id === id);
    const isT = k === today();
    const mineN = !adm && !!id && id === myOrg;
    const tag = <span className="calov">eccezione</span>;
    const bn = baseDutyId(settings, k);
    const bl = bn
      ? `come da calendario fisso: ${orgName(bn, orgs)}`
      : "come da calendario fisso: nessuna uscita";
    const cell = adm ? (
      <select
        aria-label={`Associazione del ${fmtShort(k)}`}
        value={ov ? ov.org_id || "-" : ""}
        onChange={(e) => {
          const v = e.target.value;
          onSetOverride(k, v === "" ? undefined : v === "-" ? null : v);
        }}
      >
        <option value="">{cap(bl)}</option>
        <option value="-">Nessuna uscita (eccezione)</option>
        {orgs.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
            {o.id === bn && !ov ? "" : " (eccezione)"}
          </option>
        ))}
      </select>
    ) : (
      <span className={mineN ? "calme" : ""}>
        {org ? (
          <>
            {org.name}
            {mineN ? " · tocca a voi" : ""}
          </>
        ) : (
          <span className="calnone">Nessuna uscita</span>
        )}
        {ov ? " " : null}
        {ov ? tag : null}
      </span>
    );
    return (
      <li className={`calrow${isT ? " caltoday" : ""}`} key={k}>
        <span className="mono caldate">
          {fmtShort(k)}
          {isT ? " · oggi" : ""}
          {adm && ov ? " " : null}
          {adm && ov ? tag : null}
        </span>
        {cell}
      </li>
    );
  });

  let mineTxt = "";
  if (!adm) {
    const ds = WK_ORDER.filter((w) => w !== 6 && settings.weekly[String(w)] === myOrg).map((w) =>
      WD_IT[w].toLowerCase()
    );
    const ti = (sat.order || []).indexOf(myOrg || "");
    mineTxt =
      ds.length || ti >= 0
        ? `La vostra associazione esce: ${ds.length ? "ogni " + ds.join(", ogni ") : ""}${
            ds.length && ti >= 0 ? ", e " : ""
          }${ti >= 0 ? `a turno il sabato (turno ${ti + 1} di ${(sat.order || []).length})` : ""}.`
        : "La vostra associazione non ha giorni fissi.";
  }

  const tools = adm ? (
    <details className="caltools" open={!!calMsg}>
      <summary>Carica eccezioni da file</summary>
      <div className="stack" style={{ marginTop: 8 }}>
        <p className="notice">
          Una riga per sera, con data e associazione separate da punto e virgola, per esempio
          2026-11-03;Croce Rossa oppure 03/11/2026;Agesci. Scrivi &quot;nessuna&quot; per una sera
          senza uscita, &quot;regola&quot; per tornare al calendario fisso. Le sere non indicate
          restano come sono.
        </p>
        <div>
          <label className="lb" htmlFor="cal-file">
            Da file (CSV o testo)
          </label>
          <input
            id="cal-file"
            type="file"
            accept=".csv,.txt,text/csv,text/plain"
            onChange={(e) => {
              const f = e.target.files && e.target.files[0];
              if (!f) return;
              const fr = new FileReader();
              fr.onload = () => setText(String(fr.result || ""));
              fr.readAsText(f);
            }}
          />
        </div>
        <div>
          <label className="lb" htmlFor="cal-text">
            Oppure incolla le righe
          </label>
          <textarea
            id="cal-text"
            rows={5}
            placeholder="2026-11-03;Croce Rossa"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </div>
        <button
          className="btn btn-primary"
          type="button"
          onClick={() => {
            onApplyText(text);
            setApplied(true);
            setText("");
          }}
        >
          Applica al calendario
        </button>
        {applied && calMsg ? <p className="signed">{calMsg}</p> : null}
      </div>
    </details>
  ) : null;

  return (
    <div className="detail stack">
      <div>
        <h2>Calendario delle uscite</h2>
        <p className="pgtxt" style={{ margin: "4px 0 0" }}>
          {adm
            ? "Il calendario fisso vale ogni settimana. Qui sotto puoi cambiare una singola sera quando serve."
            : "Le sere in cui esce la tua associazione sono evidenziate."}
        </p>
      </div>

      <details className="caltools wkbox" open>
        <summary>Calendario settimanale fisso</summary>
        <div className="stack" style={{ marginTop: 8 }}>
          {!adm ? <p className="notice">{mineTxt}</p> : null}
          <ul className="list" style={{ gap: 0 }}>
            {weeklyRows}
          </ul>
          <p className="pgtxt" style={{ margin: "8px 0 0" }}>
            <strong>Sabati a turno</strong>: a ogni sabato esce la successiva dell&apos;elenco, poi
            si ricomincia.
          </p>
          <ul className="list" style={{ gap: 0 }}>
            {rotRows}
          </ul>
          {adm ? (
            <div className="calrow">
              <label className="caldate" htmlFor="rot-start">
                Il turno 1 cade il sabato
              </label>
              <input
                id="rot-start"
                type="date"
                value={sat.start}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v && new Date(v + "T12:00:00").getDay() === 6)
                    onSaveSettings({ sat: { ...sat, start: v } });
                }}
              />
            </div>
          ) : null}
          <p className="pgtxt pgnote">Prossimi sabati: {nextSats.join(" · ")}</p>
        </div>
      </details>

      <h3 className="pgtxt" style={{ margin: 0 }}>
        <strong>Prossime sere</strong>
      </h3>
      <ul className="list" style={{ gap: 0 }}>
        {rows}
      </ul>
      {!calAll ? (
        <button className="btn btn-sm" type="button" onClick={() => setCalAll(true)}>
          Mostra altre settimane
        </button>
      ) : null}
      {tools}
    </div>
  );
}



