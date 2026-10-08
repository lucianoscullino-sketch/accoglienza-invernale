"use client";

// Modulo "Proponi un nuovo utente": nickname, descrizione, punto sulla mappa
// (si sceglie toccando la mappa) e, per le associazioni, l'esito della prima visita.

import { useRef, useState } from "react";
import { EntryFields, emptyEntry, type EntryValues } from "@/components/EntryFields";

export interface ProposeDraft {
  name: string;
  desc: string;
}

export default function ProposeForm({
  pos,
  isAdmin,
  onCancel,
  onSubmit,
}: {
  pos: { lat: number; lng: number } | null;
  isAdmin: boolean;
  onCancel: () => void;
  onSubmit: (v: { name: string; desc: string; entry: EntryValues }) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const entryRef = useRef<EntryValues>(emptyEntry());

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setErr("Scrivi il nickname dell'utente.");
      return;
    }
    if (!pos) {
      setErr("Tocca la mappa per indicare il punto in cui dorme.");
      return;
    }
    setErr("");
    setBusy(true);
    try {
      await onSubmit({ name: name.trim(), desc: desc.trim(), entry: entryRef.current });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button className="back" type="button" onClick={onCancel}>
        &larr; Annulla
      </button>
      <form className="detail stack" onSubmit={submit}>
      <h2>Proponi un nuovo utente</h2>
      <p className="signed" id="posline">
        {pos
          ? `Posizione scelta: ${pos.lat.toFixed(5)}, ${pos.lng.toFixed(5)}. Tocca di nuovo la mappa per spostarla.`
          : "Tocca la mappa nel punto in cui l'utente dorme di solito."}
      </p>
      {err && <p className="err">{err}</p>}
      <div>
        <label className="lb" htmlFor="p-name">
          Nickname (come vuole essere chiamato)
        </label>
        <input
          id="p-name"
          type="text"
          autoComplete="off"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div>
        <label className="lb" htmlFor="p-desc">
          Descrizione e punto in cui dorme
        </label>
        <textarea id="p-desc" rows={4} value={desc} onChange={(e) => setDesc(e.target.value)} />
      </div>
      {!isAdmin && (
        <>
          <h3>Servizio svolto stasera</h3>
          <p className="pgtxt" style={{ margin: "-6px 0 0" }}>
            L&apos;utente risulta trovato. Il servizio viene registrato come prima visita della
            proposta, che poi va ripetuta ogni sera finché non viene validata.
          </p>
          <EntryFields
            initial={emptyEntry()}
            idPrefix="p"
            legend="Cosa è stato fornito"
            noteLabel="Note per le prossime uscite"
            onValues={(v) => (entryRef.current = v)}
          />
        </>
      )}
      <p className="notice">
        {isAdmin
          ? "La proposta resta sulla mappa per 7 giorni e va servita ogni sera dalle associazioni. La puoi validare o rifiutare dalla sua scheda; se non viene validata, scompare dalla mappa."
          : "La proposta resta sulla mappa per 7 giorni e va servita ogni sera finché l'amministratore non la valida o la rifiuta; se non viene validata, scompare dalla mappa."}
      </p>
      <button className="btn btn-primary" type="submit" disabled={busy}>
        {busy ? "Invio…" : "Invia proposta"}
      </button>
      </form>
    </>
  );
}
