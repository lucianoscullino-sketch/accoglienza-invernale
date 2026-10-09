// Geocoding di un indirizzo testuale tramite Nominatim (OpenStreetMap).
// Servizio pubblico senza chiave API: va usato una ricerca per azione utente,
// non in automatico a ogni carattere digitato (limita le richieste).

export interface GeoResult {
  lat: number;
  lng: number;
  label: string;
}

// Restituisce la prima corrispondenza in Italia, oppure null se non trovata.
export async function geocodeAddress(query: string): Promise<GeoResult | null> {
  const q = query.trim();
  if (q.length < 3) return null;
  const url =
    "https://nominatim.openstreetmap.org/search" +
    "?format=jsonv2&limit=1&countrycodes=it&q=" +
    encodeURIComponent(q);
  const res = await fetch(url, { headers: { "Accept-Language": "it" } });
  if (!res.ok) throw new Error(`Servizio di geocoding non disponibile (${res.status})`);
  const data = (await res.json()) as Array<{ lat: string; lon: string; display_name: string }>;
  if (!data.length) return null;
  return { lat: Number(data[0].lat), lng: Number(data[0].lon), label: data[0].display_name };
}
