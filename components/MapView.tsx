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
  kind: "user" | "prop" | "draft";
  id: string;
  lat: number;
  lng: number;
  st: Status | "prop";
  name: string;
  ver?: "ok" | "no" | "none";
  tip?: string;
}

export interface Selection {
  kind: "user" | "prop";
  id: string;
}

const CENTER_LAT = Number(process.env.NEXT_PUBLIC_MAP_CENTER_LAT ?? 44.4949);
const CENTER_LNG = Number(process.env.NEXT_PUBLIC_MAP_CENTER_LNG ?? 11.3426);
const CENTER_ZOOM = Number(process.env.NEXT_PUBLIC_MAP_CENTER_ZOOM ?? 14);

const PIN = "M0 0C-5 -9 -17 -15 -17 -27a17 17 0 1 1 34 0C17 -15 5 -9 0 0Z";
const CHK = '<path class="mk-g" d="M-6.5 -27l4.5 5 9 -11"/>';
const DASH = '<path class="mk-g" d="M-6 -27H6"/>';

function esc(s: string) {
  return String(s ?? "").replace(/[&<>"]/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&quot;"
  );
}

function pinHtml(it: MapItem, sel: boolean) {
  let glyph: string;
  if (it.st === "done") glyph = CHK;
  else if (it.st === "missing") glyph = DASH;
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
  // Le proposte usano un pin più piccolo per non coprire gli utenti ordinari
  const small = it.kind === "prop" || it.kind === "draft";
  const w = small ? 36 : 46;
  const h = small ? 38 : 48;
  return (
    '<svg width="' +
    w +
    '" height="' +
    h +
    '" viewBox="-18 -46 46 48" aria-hidden="true">' +
    '<g class="mk st-' +
    it.st +
    (it.kind === "prop" || it.kind === "draft" ? " pr" : "") +
    (sel ? " sel" : "") +
    '"><title>' +
    esc(it.name) +
    " (" +
    esc(it.tip || it.st) +
    ")</title>" +
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
  overlays,
}: {
  items: MapItem[];
  selected: Selection | null;
  placing: boolean;
  focusTo: { lat: number; lng: number; n: number } | null;
  onSelect: (kind: "user" | "prop", id: string, fromMap: boolean) => void;
  onPlace: (lat: number, lng: number) => void;
  overlays?: ReactNode;
}) {
  const holderRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const fittedRef = useRef(false);
  const lgRef = useRef<LayerGroup | null>(null);
  const Lref = useRef<LeafletModule | null>(null);
  const cbRef = useRef({ onSelect, onPlace, placing });
  useEffect(() => {
    cbRef.current = { onSelect, onPlace, placing };
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
      const marker: Marker = L.marker([it.lat, it.lng], {
        icon: L.divIcon({
          className: "mk-div",
          html: pinHtml(it, sel),
          iconSize: small ? [36, 38] : [46, 48],
          iconAnchor: small ? [14, 36] : [18, 46],
        }),
        title: it.name,
        riseOnHover: true,
      });
      marker.on("click", () => {
        if (it.kind === "draft") return;
        cbRef.current.onSelect(it.kind as "user" | "prop", it.id, true);
      });
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
  function fitAll() {
    const map = mapRef.current;
    const L = Lref.current;
    if (!map || !L || !items.length) return;
    const b = L.latLngBounds(items.map((i) => [i.lat, i.lng] as [number, number]));
    map.fitBounds(b.pad(0.25), { maxZoom: 17 });
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
        <button type="button" className="txt" aria-label="Mostra tutti gli utenti" onClick={fitAll}>
          Tutti
        </button>
      </div>
      {overlays}
    </section>
  );
}

