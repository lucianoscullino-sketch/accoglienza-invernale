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
  // "Note uscita": annotazione libera, separata da "Note importanti" (note).
  extra: string;
  users_found?: number;
}

export const emptyEntry = (): EntryValues => ({
  found: true,
  provided: [],
  requested: "",
  note: "",
  extra: "",
});

export const entryFrom = (e?: {
  found?: boolean;
  provided?: string[];
  requested?: string;
  note?: string;
  extra?: string;
} | null): EntryValues => ({
  found: e ? !!e.found : true,
  provided: e?.provided ? [...e.provided] : [],
  requested: e?.requested ?? "",
  note: e?.note ?? "",
  extra: e?.extra ?? "",
});

const isItem = (x: string) => (ITEMS as readonly string[]).includes(x);

// Campi condivisi dell'esito. Non include il <form>: lo incapsula il genitore.
export function EntryFields({
  initial,
  idPrefix,
  legend = "Cosa è stato fornito o lasciato sul posto",
  noteLabel = "Note importanti (vengono riportate al Coordinamento)",
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
  // Il tasto "Altro" apre il campo di testo; aperto in partenza se c'è già un valore.
  const [otherOpen, setOtherOpen] = useState(initial.provided.some((p) => !isItem(p)));
  const [extra, setExtra] = useState(initial.extra);
  const [requested, setRequested] = useState(initial.requested);
  const [note, setNote] = useState(initial.note);
  const cbRef = useRef(onValues);
  useEffect(() => {
    cbRef.current = onValues;
  }, [onValues]);

  const emit = (n: {
    found?: boolean;
    checked?: string[];
    other?: string;
    otherOpen?: boolean;
    requested?: string;
    note?: string;
    extra?: string;
  }) => {
    const f = n.found ?? found;
    const c = n.checked ?? checked;
    const open = n.otherOpen ?? otherOpen;
    // Con "Altro" chiuso il testo resta in memoria ma non viene registrato.
    const o = open ? (n.other ?? other) : "";
    const r = n.requested ?? requested;
    const nt = n.note ?? note;
    const ex = n.extra ?? extra;
    cbRef.current?.({
      found: f,
      provided: [...c, ...o.split(",").map((s) => s.trim()).filter(Boolean)],
      requested: r,
      note: nt,
      extra: ex,
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
      <div>
        <label className="lb" htmlFor={`${idPrefix}-extra`}>
          Note uscita
        </label>
        <input
          id={`${idPrefix}-extra`}
          type="text"
          autoComplete="off"
          value={extra}
          onChange={(e) => {
            setExtra(e.target.value);
            emit({ extra: e.target.value });
          }}
        />
      </div>
      <fieldset>
        <legend>{legend}</legend>
        <div className="chips">
          {ITEMS.map((it) => (
            <label className="chip" key={it} style={{ fontSize: "0.8rem" }}>
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
          <label className="chip" style={{ fontSize: "0.8rem" }}>
            <input
              type="checkbox"
              checked={otherOpen}
              onChange={(e) => {
                setOtherOpen(e.target.checked);
                emit({ otherOpen: e.target.checked });
              }}
            />
            <span>Altro</span>
          </label>
        </div>
        {otherOpen && (
          <div>
            <label className="lb" htmlFor={`${idPrefix}-other`}>
              Altro (separa più voci con la virgola)
            </label>
            <input
              id={`${idPrefix}-other`}
              type="text"
              autoComplete="off"
              autoFocus={!other}
              value={other}
              onChange={(e) => {
                setOther(e.target.value);
                emit({ other: e.target.value });
              }}
            />
          </div>
        )}
      </fieldset>
      <div>
        <label
          className="lb"
          htmlFor={`${idPrefix}-note`}
          style={{ color: "#dc2626", fontWeight: 600 }}
        >
          {noteLabel}
        </label>
        <textarea
          id={`${idPrefix}-note`}
          rows={2}
          style={{ borderColor: "#dc2626" }}
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
