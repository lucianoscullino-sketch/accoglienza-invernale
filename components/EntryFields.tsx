"use client";

// Moduli di inserimento: esito serale (trovato / fornito / richiesto / note)
// e proposta di un nuovo utente da posizionare sulla mappa.

import { useEffect, useRef, useState } from "react";
import { ITEMS } from "@/lib/format";
export interface EntryValues {
  found: boolean;
  provided: string[];
  requested: string;
  note: string;
}

export const emptyEntry = (): EntryValues => ({
  found: true,
  provided: [],
  requested: "",
  note: "",
});

export const entryFrom = (e?: {
  found?: boolean;
  provided?: string[];
  requested?: string;
  note?: string;
} | null): EntryValues => ({
  found: e ? !!e.found : true,
  provided: e?.provided ? [...e.provided] : [],
  requested: e?.requested ?? "",
  note: e?.note ?? "",
});

const isItem = (x: string) => (ITEMS as readonly string[]).includes(x);

// Campi condivisi dell'esito. Non include il <form>: lo incapsula il genitore.
export function EntryFields({
  initial,
  idPrefix,
  legend = "Cosa è stato fornito o lasciato sul posto",
  noteLabel = "Note per le prossime uscite",
  onValues,
}: {
  initial: EntryValues;
  idPrefix: string;
  legend?: string;
  noteLabel?: string;
  onValues?: (v: EntryValues) => void;
}) {
  const [found, setFound] = useState(initial.found);
  const [checked, setChecked] = useState<string[]>(initial.provided.filter(isItem));
  const [other, setOther] = useState(initial.provided.filter((p) => !isItem(p)).join(", "));
  const [requested, setRequested] = useState(initial.requested);
  const [note, setNote] = useState(initial.note);
  const cbRef = useRef(onValues);
  useEffect(() => {
    cbRef.current = onValues;
  }, [onValues]);

  const emit = (n: { found?: boolean; checked?: string[]; other?: string; requested?: string; note?: string }) => {
    const f = n.found ?? found;
    const c = n.checked ?? checked;
    const o = n.other ?? other;
    const r = n.requested ?? requested;
    const nt = n.note ?? note;
    cbRef.current?.({
      found: f,
      provided: [...c, ...o.split(",").map((s) => s.trim()).filter(Boolean)],
      requested: r,
      note: nt,
    });
  };

  return (
    <>
      <label className="check">
        <input
          type="checkbox"
          checked={found}
          onChange={(e) => {
            setFound(e.target.checked);
            emit({ found: e.target.checked });
          }}
        />{" "}
        Utente trovato
      </label>
      <fieldset>
        <legend>{legend}</legend>
        <div className="chips">
          {ITEMS.map((it) => (
            <label className="chip" key={it}>
              <input
                type="checkbox"
                checked={checked.includes(it)}
                onChange={(e) => {
                  const c = e.target.checked ? [...checked, it] : checked.filter((x) => x !== it);
                  setChecked(c);
                  emit({ checked: c });
                }}
              />
              <span>{it}</span>
            </label>
          ))}
        </div>
        <div>
          <label className="lb" htmlFor={`${idPrefix}-other`}>
            Altro
          </label>
          <input
            id={`${idPrefix}-other`}
            type="text"
            autoComplete="off"
            value={other}
            onChange={(e) => {
              setOther(e.target.value);
              emit({ other: e.target.value });
            }}
          />
        </div>
      </fieldset>
      <div>
        <label className="lb" htmlFor={`${idPrefix}-req`}>
          Cosa chiede
        </label>
        <textarea
          id={`${idPrefix}-req`}
          rows={2}
          value={requested}
          onChange={(e) => {
            setRequested(e.target.value);
            emit({ requested: e.target.value });
          }}
        />
      </div>
      <div>
        <label className="lb" htmlFor={`${idPrefix}-note`}>
          {noteLabel}
        </label>
        <textarea
          id={`${idPrefix}-note`}
          rows={2}
          value={note}
          onChange={(e) => {
            setNote(e.target.value);
            emit({ note: e.target.value });
          }}
        />
      </div>
    </>
  );
}
