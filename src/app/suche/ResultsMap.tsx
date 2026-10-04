"use client";
import { useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import "leaflet/dist/leaflet.css";

export interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  label: string;
  title: string;
}

/**
 * Leaflet map with price markers and "search this area". Tiles: OpenStreetMap
 * (attribution required; swap TILE_URL for a commercial tile provider at scale).
 */
const TILE_URL = process.env.NEXT_PUBLIC_MAP_TILE_URL ?? "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

export function ResultsMap({ markers }: { markers: MapMarker[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const sp = useSearchParams();
  useEffect(() => {
    let map: import("leaflet").Map | undefined;
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !ref.current) return;
      map = L.map(ref.current, { zoomControl: true }).setView([51.1, 10.4], 6);
      L.tileLayer(TILE_URL, { maxZoom: 19, attribution: "© OpenStreetMap contributors" }).addTo(map);
      const group = L.featureGroup();
      for (const m of markers) {
        const icon = L.divIcon({ className: "", html: `<div style="background:#0f766e;color:#fff;font:600 12px system-ui;padding:2px 6px;border-radius:9999px;white-space:nowrap;box-shadow:0 1px 3px rgba(0,0,0,.3);transform:translate(-50%,-50%)">${escapeHtml(m.label)}</div>` });
        L.marker([m.lat, m.lng], { icon, title: m.title }).on("click", () => router.push(`/immobilie/${encodeURIComponent(m.id)}`)).addTo(group);
      }
      group.addTo(map);
      if (markers.length) map.fitBounds(group.getBounds().pad(0.2), { maxZoom: 14 });
      const Btn = L.Control.extend({
        onAdd() {
          const b = L.DomUtil.create("button", "");
          b.textContent = "In diesem Bereich suchen";
          b.style.cssText = "background:#fff;border:1px solid #cbd5e1;border-radius:8px;padding:6px 10px;font:500 13px system-ui;cursor:pointer";
          L.DomEvent.on(b, "click", (e) => {
            L.DomEvent.stop(e);
            const bb = map!.getBounds();
            const p = new URLSearchParams(sp.toString());
            p.set("bounds", [bb.getSouth(), bb.getWest(), bb.getNorth(), bb.getEast()].map((x) => x.toFixed(5)).join(","));
            router.push(`/suche?${p}`);
          });
          return b;
        },
      });
      new Btn({ position: "topright" }).addTo(map);
    })();
    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [markers, router, sp]);
  return <div ref={ref} className="h-[60vh] w-full overflow-hidden rounded-2xl border border-line lg:h-full" />;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
