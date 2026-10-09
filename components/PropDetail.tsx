"use client";

// Scheda di una proposta in attesa: visite in campo firmate, form dell'esito
// di stasera per l'associazione in uscita e azioni di validazione per l'admin.

import { useRef, useState } from "react";
import { EntryFields, entryFrom, type EntryValues } from "@/components/EntryFields";
import type { Org, Proposal, ProposalVerification } from "@/lib/types";
import { VER_TXT, fmtDM, fmtShort, orgName, today } from "@/lib/format";

const propStatusTag = (p: Proposal) => {
  const vs = p.verifications || [];
  const last = vs.length ? vs[vs.length - 1] : null;
  if (!last) return <span className="tag">Mai verificata</span>;
  return last.found ? (
    <span className="tag tag-done">Ultima verifica: trovato</span>
  ) : (
    <span className="tag tag-muted">Ultima verifica: non trovato</span>
  );
};

const tonightTag = (p: Proposal) => {
  const v = (p.verifications || []).find((x) => x.date === today());
  const s = !v ? "todo" : v.found ? "done" : "missing";
  const cls = s === "done" ? "tag tag-done" : s === "todo" ? "tag tag-todo" : "tag tag-muted";
  const label = s === "todo" ? "Da servire stasera" : s === "done" ? "Servita stasera" : "Non trovata stasera";
  return <span className={cls}>{label}</span>;
};

export default function PropDetail({
  p,
  orgs,
  isAdmin,
  expired,
  canVerify,
  verifyMsg,
  expTime,
  onSaveVer,
  onValidate,
  onReject,
  onBack,
}: {
  p: Proposal;
  orgs: Org[];
  isAdmin: boolean;
  expired: boolean;
  canVerify: boolean;
  verifyMsg: string;
  expTime: number;
  onSaveVer: (v: EntryValues) => Promise<void>;
  onValidate: () => Promise<void>;
  onReject: () => Promise<void>;
  onBack: () => void;
}) {
  const [busy, setBusy] = useState<"save" | "val" | "rej" | "">("");
  const vs = p.verifications || [];
  const mine = vs.find((v) => v.date === today()) || null;
  const vref = useRef<EntryValues>(entryFrom(mine));

  const verStatus: "ok" | "no" | "none" = vs.length
    ? vs[vs.length - 1].found
      ? "ok"
      : "no"
    : "none";

  const list = vs.length ? (
    <ul className="hist">
      {[...vs].reverse().map((v: ProposalVerification, i) => (
        <li key={v.id || i}>
          <div className="h-top">
            <span className="mono">{fmtShort(v.date)}</span>
            <span className="h-org">{orgName(v.org_id, orgs)}</span>
            <span className={`tag ${v.found ? "tag-done" : "tag-muted"}`}>
              {v.found ? "Trovato" : "Non trovato"}
            </span>
          </div>
          {v.provided.length ? (
            <p>
              {v.found ? "Fornito" : "Lasciato sul posto"}: {v.provided.join(", ").toLowerCase()}
            </p>
          ) : null}
          {v.requested ? <p>Richiesto: {v.requested}</p> : null}
          {v.note ? <p className="h-note">{v.note}</p> : null}
        </li>
      ))}
    </ul>
  ) : (
    <p className="notice">
      Nessuna visita registrata. La proposta resta da servire ogni sera finché non viene validata,
      rifiutata o scade.
    </p>
  );

  const form =
    canVerify && !expired ? (
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          setBusy("save");
          onSaveVer(vref.current).finally(() => setBusy(""));
        }}
      >
        <h3>{mine ? "Aggiorna l'esito di stasera" : "Registra l'esito di stasera"}</h3>
        <EntryFields initial={entryFrom(mine)} idPrefix="v" onValues={(v) => (vref.current = v)} />
        <button className="btn btn-primary" type="submit" disabled={busy === "save"}>
          {busy === "save" ? "Salvo…" : mine ? "Aggiorna esito" : "Registra esito"}
        </button>
      </form>
    ) : !isAdmin ? (
      <p className="notice">{verifyMsg}</p>
    ) : null;

  return (
    <>
      <button className="back" type="button" onClick={onBack}>
        &larr; Torna all&apos;elenco
      </button>
      <div className="detail stack">
        <div>
          <h2>{p.name}</h2>
          <div className="meta">
            <span className="tag tag-prop">In attesa di validazione</span>
            {!expired && tonightTag(p)}
            {propStatusTag(p)}
          </div>
        </div>
        <p className="desc">{p.description || "Nessuna descrizione."}</p>
        <div className="actions" style={{ padding: 0 }}>
          <a
            className="btn btn-sm"
            href={`https://www.google.com/maps/dir/?api=1&origin=My+Location&destination=${p.lat},${p.lng}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Naviga con Maps
          </a>
        </div>
        <p className="pgtxt mono">
          Destinazione inviata a Maps: {Number(p.lat).toFixed(5)}, {Number(p.lng).toFixed(5)}
        </p>
        <p className="signed">
          Proposto da <strong>{orgName(p.proposed_by, orgs)}</strong> il {fmtDM(p.created_at)}.{" "}
          {expired
            ? `Scaduta il ${fmtDM(expTime)}: non è più visibile sulla mappa.`
            : `Visibile sulla mappa ancora fino al ${fmtDM(expTime)}.`}
          {" "}Ultima verifica: {VER_TXT[verStatus]}.
        </p>
        <div className="stack">
          <h3>Visite in campo</h3>
          {list}
          {form}
        </div>
        {isAdmin ? (
          <div className="actions" style={{ padding: 0 }}>
            <button
              className="btn btn-ok"
              type="button"
              disabled={busy === "val"}
              onClick={() => {
                setBusy("val");
                onValidate().finally(() => setBusy(""));
              }}
            >
              {busy === "val" ? "Valido…" : "Valida e aggiungi agli utenti"}
            </button>
            <button
              className="btn"
              type="button"
              disabled={busy === "rej"}
              onClick={() => {
                setBusy("rej");
                onReject().finally(() => setBusy(""));
              }}
            >
              {busy === "rej" ? "Rimuovo…" : "Rifiuta"}
            </button>
          </div>
        ) : (
          <p className="notice">
            Solo l&apos;amministratore può validare o rifiutare la proposta. Se non viene validata,
            sparisce dalla mappa alla scadenza.
          </p>
        )}
      </div>
    </>
  );
}
