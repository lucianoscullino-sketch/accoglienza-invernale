"use client";

import { useState, useEffect, useRef } from "react";
import Popup from "@/components/Popup";
import { supabase } from "@/lib/supabase";

// Scheda minimale "Proponi utente": nome tappa precaricato dalla posizione
// scelta sulla mappa + nome dell'utente riscontrato/servito.
export default function ProposeStopForm({
  organization_id,
  initialLat,
  initialLng,
  onSuccess,
  onClose,
}: {
  organization_id: string;
  initialLat?: number;
  initialLng?: number;
  onSuccess?: (stopId: string, stopName: string, userName: string, lat: number, lng: number) => void;
  onClose?: () => void;
}) {
  const [stopName, setStopName] = useState("");
  const [userName, setUserName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [geocoding, setGeocoding] = useState(false);
  // Il nome viene proposto una sola volta per posizione; se l'utente lo
  // modifica prima della risposta non lo sovrascriviamo.
  const touchedName = useRef(false);

  // Reverse geocoding OpenStreetMap Nominatim: via + civico come nome tappa
  useEffect(() => {
    if (initialLat === undefined || initialLng === undefined) return;
    let cancelled = false;
    (async () => {
      setGeocoding(true);
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${initialLat}&lon=${initialLng}&zoom=18&accept-language=it`
        );
        if (!res.ok) throw new Error("Geocodifica fallita");
        const data = await res.json();
        if (cancelled || touchedName.current) return;
        const a = data?.address || {};
        const road = a.road || a.pedestrian || a.footway || a.path || "";
        const label = road
          ? `${road}${a.house_number ? ", " + a.house_number : ""}`
          : String(data?.display_name || "").split(",")[0];
        if (label) setStopName(label.slice(0, 20));
      } catch {
        // ignorato: l'utente inserisce il nome a mano
      } finally {
        if (!cancelled) setGeocoding(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialLat, initialLng]);

  const isDirty = touchedName.current || userName.trim().length > 0;

  async function handleSubmit(e?: { preventDefault?: () => void }) {
    e?.preventDefault?.();
    if (loading) return;
    setLoading(true);
    setError("");

    try {
      const client = supabase();
      const {
        data: { user },
      } = await client.auth.getUser();
      if (!user) throw new Error("Non autenticato");

      const n = Number(initialLat);
      const g = Number(initialLng);
      if (!n || !g) throw new Error("Coordinate non valide");
      if (!userName.trim()) throw new Error("Inserisci il nome utente");

      // 1. Crea la tappa in stops (stato pending)
      const { data: stopData, error: stopError } = await client
        .from("stops")
        .insert({
          name: stopName.trim() || "Tappa proposta",
          lat: n,
          lng: g,
          status: "pending",
          organization_id,
          created_by: user.id,
        })
        .select()
        .single();
      if (stopError) throw stopError;

      // 2. Crea l'utente in service_users collegato alla tappa
      const { data: userData, error: userError } = await client
        .from("service_users")
        .insert({
          name: userName.trim(),
          description: "",
          lat: n,
          lng: g,
          stop_id: stopData.id,
          created_by_org: organization_id,
          multiple: false,
        })
        .select()
        .single();
      if (userError) throw userError;

      onSuccess?.(stopData.id, stopData.name, userData.name, n, g);
    } catch (err) {
      const m =
        err && typeof err === "object" && "message" in err
          ? String((err as { message: unknown }).message)
          : "";
      setError(m || "Errore durante la proposta.");
    } finally {
      setLoading(false);
    }
  }

  function requestClose() {
    if (isDirty && !window.confirm("Hai modifiche non salvate. Uscire senza salvare?")) return;
    onClose?.();
  }

  return (
    <Popup title="Proponi utente" onClose={requestClose}>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          void handleSubmit(e);
        }}
      >
        {error && <p className="err">{error}</p>}
        {geocoding && <p className="pgtxt">Rilevo il luogo…</p>}

        <label className="lb" htmlFor="ps-stop">
          Nome tappa (max 20 caratteri)
        </label>
        <input
          id="ps-stop"
          className="input"
          maxLength={20}
          value={stopName}
          onChange={(e) => {
            touchedName.current = true;
            setStopName(e.target.value);
          }}
          placeholder="Es: Via Roma, 12"
        />

        <label className="lb" htmlFor="ps-user">
          Nome utente riscontrato/servito
        </label>
        <input
          id="ps-user"
          className="input"
          value={userName}
          onChange={(e) => setUserName(e.target.value)}
          placeholder="Nome utente"
          autoFocus
        />

        <div className="actions" style={{ padding: 0 }}>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={loading || !stopName.trim() || !userName.trim()}
          >
            {loading ? "Invio…" : "Proponi utente"}
          </button>
          <button type="button" className="btn" onClick={requestClose}>
            Annulla
          </button>
        </div>
      </form>
    </Popup>
  );
}
