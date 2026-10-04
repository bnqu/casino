import type { Listing } from "./types";

export interface QualityCheck {
  key: string;
  label: string;
  weight: number;
  passed: boolean;
  hint?: string;
}

/** Listing Quality Score: how complete and consistent is the information? */
export function listingQuality(l: Listing) {
  const isBuy = l.transaction === "buy";
  const checks: QualityCheck[] = [
    { key: "photos", label: "At least 5 photos", weight: 8, passed: l.images.filter((i) => !i.isFloorplan).length >= 5 },
    { key: "floorplan", label: "Floorplan", weight: 8, passed: l.images.some((i) => i.isFloorplan) },
    { key: "address", label: "Precise address", weight: 6, passed: l.address.precision === "exact" || l.address.precision === "street" },
    { key: "description", label: "Detailed description", weight: 5, passed: (l.description?.length ?? 0) >= 300 },
    { key: "energy", label: "Energy certificate data", weight: 10, passed: !!l.energy?.class || !!l.energy?.kwhPerSqmYear },
    { key: "price", label: isBuy ? "Purchase price" : "Cold & warm rent", weight: 12, passed: isBuy ? !!l.price : !!l.coldRent && !!l.warmRent },
    { key: "area", label: "Living area", weight: 10, passed: !!l.livingArea },
    { key: "year", label: "Construction year", weight: 6, passed: !!l.yearBuilt },
    { key: "heating", label: "Heating type", weight: 6, passed: !!l.energy?.heating },
    ...(isBuy && (l.type === "apartment" || l.type === "maisonette" || l.type === "penthouse")
      ? [{ key: "hausgeld", label: "Hausgeld", weight: 8, passed: l.hausgeld != null }]
      : []),
    { key: "commission", label: "Commission information", weight: 5, passed: !!l.commission },
    { key: "availability", label: "Availability date", weight: 4, passed: !!l.availableFrom },
    { key: "contact", label: "Complete contact", weight: 4, passed: !!l.contact?.name && (!!l.contact.email || !!l.contact.phone) },
    { key: "documents", label: "Documents available", weight: 4, passed: l.documents.length > 0 },
  ];
  const inconsistencies = findInconsistencies(l);
  const total = checks.reduce((s, c) => s + c.weight, 0);
  const got = checks.filter((c) => c.passed).reduce((s, c) => s + c.weight, 0);
  const score = Math.max(0, Math.round((got / total) * 100) - inconsistencies.length * 5);
  const missing = checks.filter((c) => !c.passed);
  const importantMissing = missing.filter((c) => c.weight >= 8);
  return {
    score,
    checks,
    missing,
    inconsistencies,
    badge: importantMissing.length ? "Important information missing" : `Listing completeness: ${score}%`,
  };
}

export function findInconsistencies(l: Listing): string[] {
  const out: string[] = [];
  if (l.coldRent && l.warmRent && l.warmRent < l.coldRent) out.push("Warm rent is lower than cold rent");
  if (l.livingArea && l.rooms && l.livingArea / l.rooms < 8) out.push("Very small area per room — check living area or room count");
  if (l.yearBuilt && (l.yearBuilt < 1500 || l.yearBuilt > new Date().getFullYear() + 5)) out.push("Implausible construction year");
  if (l.bedrooms && l.rooms && l.bedrooms > l.rooms) out.push("More bedrooms than rooms");
  if (l.price && l.livingArea) {
    const ppsqm = l.price / l.livingArea;
    if (ppsqm < 300 || ppsqm > 40_000) out.push("Implausible price per m²");
  }
  return out;
}

export type FreshnessLabel = { label: string; tone: "new" | "recent" | "normal" | "maybe_stale" };

/**
 * Freshness from evidence only: we say "may be stale" only if the source has not
 * re-confirmed the listing for a long time — never purely from listing age.
 */
export function listingFreshness(l: Listing, now = new Date()): FreshnessLabel {
  const hours = (iso: string) => (now.getTime() - Date.parse(iso)) / 3_600_000;
  const first = hours(l.firstSeenAt);
  const upd = hours(l.lastUpdatedAt);
  const verified = l.lastVerifiedAt ? hours(l.lastVerifiedAt) : null;
  if (verified !== null && verified > 24 * 21) return { label: `Not confirmed by source for ${Math.floor(verified / 24)} days — may be stale`, tone: "maybe_stale" };
  if (first < 24 && now.toDateString() === new Date(l.firstSeenAt).toDateString()) return { label: "New today", tone: "new" };
  if (upd < 1) return { label: "Updated just now", tone: "recent" };
  if (upd < 24) return { label: `Updated ${Math.floor(upd)} hours ago`, tone: "recent" };
  const d = Math.floor(upd / 24);
  return { label: `Updated ${d} day${d === 1 ? "" : "s"} ago`, tone: "normal" };
}
