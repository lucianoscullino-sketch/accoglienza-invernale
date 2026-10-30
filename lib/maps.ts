// Apre Google Maps in una nuova scheda (link esterno, nessuna API key,
// nessun costo). Su mobile apre l'app Google Maps se installata.
// directions = true => indicazioni stradali verso destinazione;
// directions = false => ricerca della posizione.
export function openGoogleMaps(
  lat: number,
  lng: number,
  label?: string,
  directions = true,
): void {
  const q = directions
    ? `destination=${lat},${lng}`
    : `query=${lat},${lng}${label ? `(${encodeURIComponent(label)})` : ""}`;
  const url = `https://www.google.com/maps/${directions ? "dir" : "search"}/?api=1&${q}`;
  window.open(url, "_blank");
}
