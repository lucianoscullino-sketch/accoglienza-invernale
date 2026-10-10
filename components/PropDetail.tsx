"use client";

// Scheda di una proposta in attesa: visite in campo firmate, form dell'esito
// di stasera per l'associazione in uscita e azioni di validazione per l'admin.

import { useRef, useState } from "react";
import { EntryFields, entryFrom, type EntryValues } from "@/components/EntryFields";
import type { Org, Proposal, ProposalVerification } from "@/lib/types";
import { fmtDM, fmtShort, orgName, today } from "@/lib/format";

export default function PropDetail({
  p,
  orgs,
  isAdmin,
  expired,
  canVerify,
  verifyMsg,
  onSaveVer,
  onValidate,
  onReject,
  onDelete,
  canDelete,
  myOrg,
  onUpdateProp,
  onUpdateVer,
}: {
  p: Proposal;
  orgs: Org[];
  isAdmin: boolean;
  expired: boolean;
  canVerify: boolean;
  verifyMsg: string;
  onSaveVer: (v: EntryValues) => Promise<void>;
  onValidate: () => Promise<void>;
  onReject: () => Promise<void>;
  onDelete: (() => Promise<void>) | null;
  canDelete: boolean;
  myOrg: string | null;
  onUpdateProp: (patch: { name: string; description: string }) => Promise<void>;
  onUpdateVer: (v: ProposalVerification, vals: EntryValues) => Promise<void>;
}) {
  const [busy, setBusy] = useState<"save" | "val" | "rej" | "del" | "prop" | "ver" | "">("");
  const [confirmDel, setConfirmDel] = useState(false);
  // Modifica nome/descrizione della proposta (coordinamento o proponente).
  const [editProp, setEditProp] = useState(false);
  const [edName, setEdName] = useState(p.name);
  const [edDesc, setEdDesc] = useState(p.description);
  // Modifica di una visita già registrata: id (o data) della riga in modifica.
  const [editVerId, setEditVerId] = useState<string | null>(null);
  const verRef = useRef<EntryValues>(entryFrom(null));
  const vs = p.verifications || [];
  const mine = vs.find((v) => v.date === today()) || null;
  const vref = useRef<EntryValues>(entryFrom(mine));

  // Nome/descrizione: il Coordinamento su tutte, l'associazione solo su quelle
  // che ha proposto. Le visite: il Coordinamento su tutte, l'associazione solo
  // su quelle firmate con il proprio org_id (è quanto consentono le RLS).
  const canEditProp = isAdmin || (!!myOrg && p.proposed_by === myOrg);
  const canEditVer = (v: ProposalVerification) => isAdmin || (!!myOrg && v.org_id === myOrg);

  const list = vs.length ? (
    <ul className="hist">
      {[...vs].reverse().map((v: ProposalVerification) => {
        const vid = v.id || `d:${v.date}`;
        const editing = editVerId === vid;
        if (editing) {
          return (
            <li key={vid}>
              <form
                className="stack"
                onSubmit={(e) => {
                  e.preventDefault();
                  setBusy("ver");
                  onUpdateVer(v, verRef.current).finally(() => {
                    setBusy("");
                    setEditVerId(null);
                  });
                }}
              >
                <div className="h-top">
                  <span className="mono">{fmtShort(v.date)}</span>
                  <span className="h-org">{orgName(v.org_id, orgs)}</span>
                </div>
                <EntryFields
                  initial={entryFrom(v)}
                  idPrefix={`ve-${vid}`}
                  onValues={(vals) => (verRef.current = vals)}
                />
                <div className="actions" style={{ padding: 0 }}>
                  <button
                    className="btn btn-primary btn-sm"
                    type="submit"
                    disabled={busy === "ver"}
                  >
                    {busy === "ver" ? "Salvo…" : "Salva correzione"}
                  </button>
                  <button
                    className="btn btn-sm"
                    type="button"
                    disabled={busy === "ver"}
                    onClick={() => setEditVerId(null)}
                  >
                    Annulla
                  </button>
                </div>
              </form>
            </li>
          );
        }
        return (
          <li key={vid}>
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
            {canEditVer(v) ? (
              <div className="actions" style={{ padding: 0 }}>
                <button
                  className="btn btn-sm"
                  type="button"
                  onClick={() => {
                    verRef.current = entryFrom(v);
                    setEditVerId(vid);
                  }}
                >
                  Modifica
                </button>
              </div>
            ) : null}
          </li>
        );
      })}
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
      <div className="detail stack">
        <div>
          <h2>{p.name}</h2>
        </div>
        <p className="desc">{p.description || "Nessuna descrizione."}</p>
        {!isAdmin && (
          <>
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
          </>
        )}
        <p className="signed">
          Proposto da <strong>{orgName(p.proposed_by, orgs)}</strong> il {fmtDM(p.created_at)}.
        </p>
        <div className="stack">
          <h3>Visite in campo</h3>
          {list}
          {form}
        </div>
        {canEditProp ? (
          editProp ? (
            <form
              className="stack"
              onSubmit={(e) => {
                e.preventDefault();
                if (!edName.trim()) return;
                setBusy("prop");
                onUpdateProp({ name: edName.trim(), description: edDesc }).finally(() => {
                  setBusy("");
                  setEditProp(false);
                });
              }}
            >
              <div>
                <label className="lb" htmlFor="prop-edit-name">
                  Nickname (come vuole essere chiamato)
                </label>
                <input
                  id="prop-edit-name"
                  type="text"
                  autoComplete="off"
                  value={edName}
                  onChange={(e) => setEdName(e.target.value)}
                />
              </div>
              <div>
                <label className="lb" htmlFor="prop-edit-desc">
                  Descrizione e punto in cui dorme
                </label>
                <textarea
                  id="prop-edit-desc"
                  rows={4}
                  value={edDesc}
                  onChange={(e) => setEdDesc(e.target.value)}
                />
              </div>
              <div className="actions" style={{ padding: 0 }}>
                <button
                  className="btn btn-primary btn-sm"
                  type="submit"
                  disabled={busy === "prop" || !edName.trim()}
                >
                  {busy === "prop" ? "Salvo…" : "Salva correzione"}
                </button>
                <button
                  className="btn btn-sm"
                  type="button"
                  disabled={busy === "prop"}
                  onClick={() => {
                    setEdName(p.name);
                    setEdDesc(p.description);
                    setEditProp(false);
                  }}
                >
                  Annulla
                </button>
              </div>
            </form>
          ) : (
            <div className="actions" style={{ padding: 0 }}>
              <button
                className="btn btn-sm"
                type="button"
                onClick={() => {
                  setEdName(p.name);
                  setEdDesc(p.description);
                  setEditProp(true);
                }}
              >
                Modifica
              </button>
            </div>
          )
        ) : null}
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
        {canDelete && onDelete ? (
          <div className="stack">
            <h3>La tua proposta</h3>
            <p className="notice">
              L&apos;hai proposta tu
              {p.proposed_by && myOrg && p.proposed_by === myOrg
                ? ` (${orgName(p.proposed_by, orgs)})`
                : ""}
              . Se è stata creata per errore puoi cancellarla definitivamente: sparirà dalla mappa
              e dall&apos;elenco.
            </p>
            {!confirmDel ? (
              <button className="btn btn-sm" type="button" onClick={() => setConfirmDel(true)}>
                Cancella questa proposta
              </button>
            ) : (
              <div className="actions" style={{ padding: 0 }}>
                <button
                  className="btn btn-sm"
                  type="button"
                  disabled={busy === "del"}
                  onClick={() => {
                    setBusy("del");
                    onDelete().finally(() => {
                      setBusy("");
                      setConfirmDel(false);
                    });
                  }}
                >
                  {busy === "del" ? "Cancello…" : "Sì, cancella definitivamente"}
                </button>
                <button className="btn btn-sm" type="button" onClick={() => setConfirmDel(false)}>
                  Annulla
                </button>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </>
  );
}
