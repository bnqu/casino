import type { ProviderResult } from "../provenance";
import type { GeoPoint, TravelMode, TravelTime, TravelTimeProvider } from "./types";

export function haversineKm(a: GeoPoint, b: GeoPoint) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/**
 * Fallback when no routing provider is configured. Clearly labelled as a
 * straight-line estimate with low confidence; the UI must show the method.
 */
const SPEED_KMH: Record<TravelMode, number> = { walking: 4.8, cycling: 15, driving: 30, transit: 20 };
const DETOUR = 1.3;

export class StraightLineTravelProvider implements TravelTimeProvider {
  id = "straight-line";
  async travelTime(from: GeoPoint, to: GeoPoint, mode: TravelMode): Promise<ProviderResult<TravelTime>> {
    const km = haversineKm(from, to) * DETOUR;
    return {
      ok: true,
      value: { minutes: (km / SPEED_KMH[mode]) * 60 + (mode === "transit" ? 8 : 0), distanceKm: km, mode, method: "straight_line_estimate" },
      provenance: {
        sourceName: "Straight-line estimate",
        kind: "calculation",
        methodology: `Great-circle distance × ${DETOUR} detour factor at an assumed average ${SPEED_KMH[mode]} km/h${mode === "transit" ? " plus 8 min access/wait" : ""}. Not routed.`,
        confidence: "low",
        disclaimer: "Rough estimate — configure a routing provider for real travel times.",
      },
      freshness: "unknown",
    };
  }
}

/** Real routing slot (e.g. a GTFS-based router, OSRM, or a commercial API). */
export class UnconfiguredRoutingProvider implements TravelTimeProvider {
  id = "routing";
  async travelTime(): Promise<ProviderResult<TravelTime>> {
    return { ok: false, provider: this.id, reason: "No routing provider configured (set TRAVEL_PROVIDER)" };
  }
}
