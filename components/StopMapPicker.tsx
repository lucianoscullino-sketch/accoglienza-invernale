"use client";

import { useEffect, useRef, useState } from "react";
import type { Map as LeafletMap, Marker } from "leaflet";
import "leaflet/dist/leaflet.css";

type LeafletModule = typeof import("leaflet");

interface StopMapPickerProps {
  lat: number;
  lng: number;
  onChange: (lat: number, lng: number) => void;
  label?: string;
  height?: string;
}

const CENTER_LAT = Number(process.env.NEXT_PUBLIC_MAP_CENTER_LAT ?? 44.6475);
const CENTER_LNG = Number(process.env.NEXT_PUBLIC_MAP_CENTER_LNG ?? 10.924);
const CENTER_ZOOM = Number(process.env.NEXT_PUBLIC_MAP_CENTER_ZOOM ?? 14);

export default function StopMapPicker({
  lat,
  lng,
  onChange,
  label = "Trascina il segnaposto per spostare la tappa",
  height = "300px",
}: StopMapPickerProps) {
  const holderRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const Lref = useRef<LeafletModule | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let dead = false;
    (async () => {
      const L = await import("leaflet");
      if (dead || !holderRef.current) return;
      Lref.current = L;
      const map = L.map(holderRef.current, {
        zoomControl: false,
        attributionControl: false,
      }).setView([lat, lng], CENTER_ZOOM);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);

      // Marker default di Leaflet: l'icona standard ha già l'anchor
      // posizionato sulla punta del palloncino, quindi anche
      // cambiando zoom resta ancorata alle coordinate assegnate.
      const marker = L.marker([lat, lng], { draggable: true }).addTo(map);
      markerRef.current = marker;

      marker.on("dragend", (e: any) => {
        const pos = e.target.getLatLng();
        onChange(pos.lat, pos.lng);
      });

      map.on("click", (e: { latlng: { lat: number; lng: number } }) => {
        marker.setLatLng([e.latlng.lat, e.latlng.lng]);
        onChange(e.latlng.lat, e.latlng.lng);
      });

      mapRef.current = map;
      setReady(true);
      setTimeout(() => map.invalidateSize(), 50);
    })();

    return () => {
      dead = true;
      mapRef.current?.remove();
      mapRef.current = null;
      Lref.current = null;
    };
  }, []);

  // Riposiziona il marker se le coordinate cambiano dall'esterno (input di testo)
  useEffect(() => {
    const L = Lref.current;
    const map = mapRef.current;
    const marker = markerRef.current;
    if (!ready || !L || !map || !marker) return;
    marker.setLatLng([lat, lng]);
    map.setView([lat, lng], map.getZoom());
  }, [lat, lng, ready]);

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height,
        border: "1px solid var(--line)",
        borderRadius: "8px",
        overflow: "hidden",
        marginBottom: 12,
      }}
    >
      <div
        ref={holderRef}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
        className="leaflet-container"
        role="group"
        aria-label="Posiziona la tappa sulla mappa"
      />
      {label && (
        <div
          style={{
            position: "absolute",
            top: 8,
            left: 8,
            right: 8,
            zIndex: 1000,
            background: "rgba(255,255,255,0.92)",
            padding: "6px 10px",
            borderRadius: "6px",
            fontSize: 12,
            color: "#333",
            pointerEvents: "none",
            boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
          }}
        >
          {label}
        </div>
      )}
    </div>
  );
}
