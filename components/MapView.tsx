"use client";

// Mappa reale con Leaflet + OpenStreetMap, sostituisce lo SVG schematica del prototipo.
// I marker sono pin colorati: arancio = da servire, verde = servito, grigio = non trovato,
// viola tratteggiato = proposta. In modalità "proposta" un clic sulla mappa posiziona il nuovo utente.

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Map as LeafletMap, LayerGroup, Marker } from "leaflet";
import type { Status } from "@/lib/types";
import "leaflet/dist/leaflet.css";

type LeafletModule = typeof import("leaflet");

export interface MapItem {
  kind: "user" | "prop" | "stop" | "draft";
  id: string;
  lat: number;
  lng: number;
  st: Status | "prop";
  name: string;
  ver?: "ok" | "no" | "none";
  tip?: string;
  // Utente sospeso o eliminato mostrato con il flag del coordinamento:
  // pin con glifo e stile propri (barra diagonale / X).
  inactive?: "susp" | "del";
  // Tappa di appartenenza (solo per utenti/proposte): usata per raggruppare
  // visivamente i pin dentro la tappa.
  stop_id?: string | null;
}

export interface Selection {
  kind: "user" | "prop" | "stop";
  id: string;
}

const CENTER_LAT = Number(process.env.NEXT_PUBLIC_MAP_CENTER_LAT ?? 44.6475);
const CENTER_LNG = Number(process.env.NEXT_PUBLIC_MAP_CENTER_LNG ?? 10.924);
const CENTER_ZOOM = Number(process.env.NEXT_PUBLIC_MAP_CENTER_ZOOM ?? 14);

const PIN = "M0 0C-5 -9 -17 -15 -17 -27a17 17 0 1 1 34 0C17 -15 5 -9 0 0Z";
const CHK = '<path class="mk-g" d="M-6.5 -27l4.5 5 9 -11"/>';
const DASH = '<path class="mk-g" d="M-6 -27H6"/>';
// Glifi per utenze sospese (barra diagonale) ed eliminate (X): ben
// distinti dal check e dalla barra orizzontale del "non trovato".
const SLASH = '<path class="mk-g" d="M-7 -21L7 -33"/>';
const CROSS = '<path class="mk-g" d="M-6 -22L6 -33M6 -22L-6 -33"/>';

function esc(s: string) {
  return String(s ?? "").replace(/[&<>"]/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&quot;"
  );
}

function pinHtml(it: MapItem, sel: boolean) {
  let glyph: string;
  if (it.inactive === "susp") glyph = SLASH;
  else if (it.inactive === "del") glyph = CROSS;
  else if (it.st === "done") glyph = CHK;
  else if (it.st === "missing") glyph = DASH;
  else if (it.kind === "stop")
    glyph =
      '<text class="mk-t" y="-21.5" text-anchor="middle">' +
      esc((it.name || "?").trim().charAt(0).toUpperCase()) +
      "</text>";
  else
    glyph =
      '<text class="mk-t" y="-21.5" text-anchor="middle">' +
      esc(
        it.kind === "prop" || it.kind === "draft"
          ? "?"
          : (it.name || "?").trim().charAt(0).toUpperCase()
      ) +
      "</text>";
  let badge = "";
  if (it.ver) {
    const b =
      it.ver === "ok"
        ? '<path class="mk-gb" d="M9.5 -40l2.5 3 5 -6"/>'
        : it.ver === "no"
          ? '<path class="mk-gb" d="M9 -40H18"/>'
          : '<text class="mk-tb" x="13.5" y="-36.2" text-anchor="middle">?</text>';
    badge = '<circle class="mk-b" cx="13.5" cy="-40" r="8.5"/>' + b;
  }
  // Le proposte usano un pin ancora più piccolo per non coprire gli utenti ordinari
  const small = it.kind === "prop" || it.kind === "draft";
  const isStop = it.kind === "stop";
  const w = small ? 28 : 46;
  const h = small ? 30 : 48;
  return (
    '<svg width="' +
    w +
    '" height="' +
    h +
    '" viewBox="-18 -46 46 48" aria-hidden="true">' +
    '<g class="mk st-' +
    it.st +
    (it.inactive ? " in-" + it.inactive : "") +
    (it.kind === "prop" || it.kind === "draft" ? " pr" : "") +
    (isStop ? " stp" : "") +
    (sel ? " sel" : "") +
    '"><title>' +
    esc(it.name) +
    (it.tip ? " (" + esc(it.tip) + ")" : "") +
    "</title>" +
    '<ellipse class="mk-s" rx="6" ry="2.6"/><path class="mk-c" d="' +
    PIN +
    '"/>' +
    glyph +
    badge +
    "</g></svg>"
  );
}

export default function MapView({
  items,
  selected,
  placing,
  focusTo,
  onSelect,
  onPlace,
  onMove,
  draggableId,
  overlays,
}: {
  items: MapItem[];
  selected: Selection | null;
  placing: boolean;
  focusTo: { lat: number; lng: number; n: number } | null;
  onSelect: (kind: "user" | "prop" | "stop", id: string, fromMap: boolean) => void;
  onPlace: (lat: number, lng: number) => void;
  onMove?: (kind: "user" | "prop" | "stop", id: string, lat: number, lng: number) => void;
  // Id dell'elemento attualmente trascinabile (solo in fase di creazione/modifica).
  // Se omesso o null, nessun pin è trascinabile.
  draggableId?: string | null;
  overlays?: ReactNode;
}) {
  const holderRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const fittedRef = useRef(false);
  const lgRef = useRef<LayerGroup | null>(null);
  const Lref = useRef<LeafletModule | null>(null);
  const cbRef = useRef({ onSelect, onPlace, placing, onMove, draggableId });
  const myDraggableIdRef = useRef<string | null>(null);
  myDraggableIdRef.current = draggableId ?? null;
  useEffect(() => {
    cbRef.current = { onSelect, onPlace, placing, onMove, draggableId };
  });
  const [ready, setReady] = useState(false);

  // Init una tantum (import dinamico: Leaflet richiede window)
  useEffect(() => {
    let dead = false;
    (async () => {
      const L = await import("leaflet");
      if (dead || !holderRef.current) return;
      Lref.current = L;
      const map = L.map(holderRef.current, {
        zoomControl: false,
        attributionControl: true,
      }).setView([CENTER_LAT, CENTER_LNG], CENTER_ZOOM);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);
      const lg = L.layerGroup().addTo(map);
      map.on("click", (e: { latlng: { lat: number; lng: number } }) => {
        if (cbRef.current.placing) cbRef.current.onPlace(e.latlng.lat, e.latlng.lng);
      });
      mapRef.current = map;
      lgRef.current = lg;
      setReady(true);
      setTimeout(() => map.invalidateSize(), 50);
    })();
    return () => {
      dead = true;
      mapRef.current?.remove();
      mapRef.current = null;
      lgRef.current = null;
      Lref.current = null;
	  fittedRef.current = false;
    };
  }, []);

  // Ridisegna i marker quando cambiano dati o selezione
  useEffect(() => {
    const L = Lref.current;
    const lg = lgRef.current;
    if (!ready || !L || !lg) return;
    lg.clearLayers();
    const sorted = [...items].sort(
      (a, b) => (a.kind === "user" ? 0 : 1) - (b.kind === "user" ? 0 : 1)
    );
    sorted.forEach((it) => {
      const sel = !!selected && selected.kind === it.kind && selected.id === it.id;
      const small = it.kind === "prop" || it.kind === "draft";
      // Le tappe hanno un pin grande e visibile anche se vuote.
      // iconAnchor punta in basso al centro (spigolo del palloncino): così,
      // anche cambiando zoom, il punto che resta fermo sulla mappa è la punta
      // del pin, non il centro dell'icona.
      const isDraggable = it.id === myDraggableIdRef.current;
      // Pin a goccia con bordo bianco e interno colorato per stato
      // (suggerimento utente): iconSize [30, 42], iconAnchor [15, 42] sulla punta.
      const colore = it.st === "done" ? "#10b981" : it.st === "todo" ? "#ef4444" : it.st === "missing" ? "#9ca3af" : "#6b7280";
const iniziale = (it.name || "?").trim().charAt(0).toUpperCase();
// Stesso identico pin a goccia rovesciata per tutti,
// ma proposte più piccole (20x28) con bordo tratteggiato,
// altri elementi 30x42 con bordo solido
const isProp = it.kind === "prop" || it.kind === "draft";
const w = isProp ? 20 : 30;
const h = isProp ? 28 : 42;
const y = isProp ? 13 : 19;
const fontSize = isProp ? 8 : 12;
const strokeDash = isProp ? "4 2" : "";
const markerIcon = L.divIcon({
  className: "",
  html: `
    <svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">
      <path d="M${w/2} ${h-1}C${w/2} ${h-1} 1 ${h/2+1.5} 1 ${h/2+5.5}C${w/2-2} ${h/2+9.5-w/2} 7.3 2 ${w/2} 2s${w/2-1-7.3} 3.5 ${w/2-1} ${h-3}s${-1} ${h-3} ${w/2} ${h-1}z"
            fill="${colore}" stroke="#fff" stroke-width="2" stroke-dasharray="${strokeDash}"/>
      <text x="${w/2}" y="${y}" text-anchor="middle" font-size="${fontSize}"
            font-weight="bold" fill="#fff" font-family="sans-serif">${iniziale}</text>
    </svg>`,
  iconSize: [w, h],
  iconAnchor: [w/2, h],
  popupAnchor: [0, -38]
      });
      const marker: Marker = L.marker([it.lat, it.lng], {
        icon: markerIcon,
        draggable: isDraggable,
        title: it.name,
        riseOnHover: false,
      });
      marker.on("click", () => {
        if (it.kind === "draft") return;
        cbRef.current.onSelect(it.kind as "user" | "prop" | "stop", it.id, true);
      });
      const onMove = cbRef.current.onMove;
      if (isDraggable && onMove) {
        marker.on("dragend", (e: any) => {
          const pos = e.target.getLatLng();
          onMove(it.kind as "user" | "prop" | "stop", it.id, pos.lat, pos.lng);
        });
      }
      marker.addTo(lg);
    });
	    if (!fittedRef.current && items.length > 0) {
      const b = L.latLngBounds(items.map((i) => [i.lat, i.lng] as [number, number]));
      mapRef.current?.fitBounds(b.pad(0.25), { maxZoom: 17 });
      fittedRef.current = true;
    }
  }, [items, selected, ready]);

  // Centra la mappa quando la selezione arriva dall'elenco
  useEffect(() => {
    if (!focusTo || !mapRef.current) return;
    const map = mapRef.current;
    map.setView([focusTo.lat, focusTo.lng], Math.max(map.getZoom(), 16), { animate: true });
  }, [focusTo?.n]); // eslint-disable-line react-hooks/exhaustive-deps

  function zoomBy(f: number) {
    const map = mapRef.current;
    if (map) map.setZoom(map.getZoom() + f);
  }

  return (
    <section className="mapcard" aria-label="Mappa degli utenti">
      <div
        ref={holderRef}
        className="leaflet-container"
        role="group"
        aria-label="Mappa con gli utenti da assistere"
      />
      <div className="zoom">
        <button type="button" aria-label="Ingrandisci" onClick={() => zoomBy(1)}>
          +
        </button>
        <button type="button" aria-label="Riduci" onClick={() => zoomBy(-1)}>
          &minus;
        </button>
      </div>
      {overlays}
    </section>
  );
}

