/**
 * Deduplication: one real property can appear in several listings. We score pairs
 * on independent signals and cluster pairs above a threshold (union-find).
 */
import { haversineKm } from "../data/providers/travel";
import type { Listing, PropertyEntity } from "./types";

export interface MatchSignal {
  key: string;
  score: number; // 0..1
  weight: number;
}

function tokens(s?: string) {
  return new Set((s ?? "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9äöüß ]/g, " ").split(/\s+/).filter((t) => t.length > 3));
}

export function jaccard(a: Set<string>, b: Set<string>) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

const close = (a?: number, b?: number, tol = 0.03) => (a == null || b == null ? null : Math.abs(a - b) <= tol * Math.max(a, b) ? 1 : 0);

export function matchScore(a: Listing, b: Listing): { score: number; signals: MatchSignal[] } {
  if (a.transaction !== b.transaction) return { score: 0, signals: [] };
  const signals: MatchSignal[] = [];
  const push = (key: string, s: number | null, weight: number) => s != null && signals.push({ key, score: s, weight });

  if (a.address.lat != null && b.address.lat != null && a.address.lng != null && b.address.lng != null) {
    const m = haversineKm({ lat: a.address.lat, lng: a.address.lng }, { lat: b.address.lat, lng: b.address.lng }) * 1000;
    push("coordinates", m < 30 ? 1 : m < 150 ? 0.5 : 0, 3);
  }
  if (a.address.street && b.address.street && a.address.postcode === b.address.postcode)
    push("address", a.address.street.toLowerCase() === b.address.street.toLowerCase() && a.address.houseNumber === b.address.houseNumber ? 1 : 0.3, 3);
  push("living_area", close(a.livingArea, b.livingArea, 0.02), 2);
  push("rooms", a.rooms != null && b.rooms != null ? (a.rooms === b.rooms ? 1 : 0) : null, 1);
  push("price", close(a.price ?? a.coldRent, b.price ?? b.coldRent, 0.05), 1);
  push("year_built", a.yearBuilt && b.yearBuilt ? (a.yearBuilt === b.yearBuilt ? 1 : 0) : null, 1);
  push("floor", a.floor != null && b.floor != null ? (a.floor === b.floor ? 1 : 0) : null, 1);
  push("description", jaccard(tokens(a.description), tokens(b.description)), 2);
  const imgA = new Set(a.images.map((i) => i.url));
  push("images", a.images.length && b.images.length ? (b.images.some((i) => imgA.has(i.url)) ? 1 : 0) : null, 2);

  const w = signals.reduce((s, x) => s + x.weight, 0);
  // Require some location evidence; area/rooms alone are too common.
  const hasLocation = signals.some((s) => (s.key === "coordinates" || s.key === "address") && s.score > 0);
  const score = w && hasLocation ? signals.reduce((s, x) => s + x.score * x.weight, 0) / w : 0;
  return { score, signals };
}

export function clusterListings(listings: Listing[], threshold = 0.75): PropertyEntity[] {
  const parent = listings.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < listings.length; i++)
    for (let j = i + 1; j < listings.length; j++) {
      // Different listings from the same source with different IDs are distinct by assumption.
      if (listings[i].source.id === listings[j].source.id) continue;
      if (matchScore(listings[i], listings[j]).score >= threshold) parent[find(i)] = find(j);
    }
  const groups = new Map<number, Listing[]>();
  listings.forEach((l, i) => groups.set(find(i), [...(groups.get(find(i)) ?? []), l]));
  return [...groups.values()].map((g) => {
    const canonical = [...g].sort((x, y) => y.lastUpdatedAt.localeCompare(x.lastUpdatedAt))[0];
    return { id: `prop_${canonical.id}`, listingIds: g.map((l) => l.id), canonicalListingId: canonical.id };
  });
}
