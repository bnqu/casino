import { priceFromMonthlyBudget } from "../finance/affordability";
import type { StateCode } from "../data/regulatory/transferTax";
import type { PropertyView } from "./store";
import type { Listing } from "./types";

export interface SearchQuery {
  tx: "buy" | "rent";
  city?: string;
  types?: string[];
  minPrice?: number;
  maxPrice?: number;
  maxWarm?: number;
  maxCold?: number;
  /** Buyers: monthly housing budget → translated into a price ceiling. */
  monthly?: number;
  equity?: number;
  minRooms?: number;
  minArea?: number;
  features?: string[];
  pets?: boolean;
  commissionFree?: boolean;
  newBuild?: boolean;
  noRenovation?: boolean;
  energyMax?: string; // worst acceptable class
  bounds?: [number, number, number, number]; // south, west, north, east
  sort?: "newest" | "price_asc" | "price_desc" | "ppsqm";
}

const CLASSES = ["A+", "A", "B", "C", "D", "E", "F", "G", "H"];

export function parseQuery(sp: Record<string, string | undefined>): SearchQuery {
  const n = (k: string) => (sp[k] && Number.isFinite(Number(sp[k])) ? Number(sp[k]) : undefined);
  const b = sp.bounds?.split(",").map(Number);
  return {
    tx: sp.tx === "rent" ? "rent" : "buy",
    city: sp.city || undefined,
    types: sp.types ? sp.types.split(",") : undefined,
    minPrice: n("minPrice"),
    maxPrice: n("maxPrice"),
    maxWarm: n("maxWarm"),
    maxCold: n("maxCold"),
    monthly: n("monthly"),
    equity: n("equity"),
    minRooms: n("rooms"),
    minArea: n("area"),
    features: sp.features ? sp.features.split(",").filter(Boolean) : [],
    pets: sp.pets === "1",
    commissionFree: sp.commissionFree === "1",
    newBuild: sp.newBuild === "1",
    noRenovation: sp.noRenovation === "1",
    energyMax: sp.energyMax || undefined,
    bounds: b && b.length === 4 && b.every(Number.isFinite) ? (b as [number, number, number, number]) : undefined,
    sort: (sp.sort as SearchQuery["sort"]) || "newest",
  };
}

/**
 * Monthly-budget search: derive a purchase-price ceiling per listing state.
 * Requires a rate — without one we cannot translate and say so.
 */
export function monthlyBudgetCeiling(q: SearchQuery, annualRate: number | undefined, state: StateCode) {
  if (!q.monthly || annualRate == null) return undefined;
  return priceFromMonthlyBudget(q.monthly, q.equity ?? 0, { annualRate, initialRepayment: 0.02, state, broker: { kind: "none" } }).price;
}

export function matches(l: Listing, q: SearchQuery, annualRate?: number): boolean {
  if (l.transaction !== q.tx || l.status !== "active") return false;
  if (q.city && !l.address.city.toLowerCase().includes(q.city.toLowerCase()) && !l.address.postcode?.startsWith(q.city)) return false;
  if (q.types?.length && !q.types.includes(l.type)) return false;
  if (q.tx === "buy") {
    if (q.maxPrice && (l.price ?? Infinity) > q.maxPrice) return false;
    if (q.minPrice && (l.price ?? 0) < q.minPrice) return false;
    const ceiling = monthlyBudgetCeiling(q, annualRate, l.address.state ?? "DE-NW");
    if (ceiling && (l.price ?? Infinity) > ceiling) return false;
  } else {
    const warm = l.warmRent ?? (l.coldRent != null && l.utilities != null ? l.coldRent + l.utilities + (l.heatingCosts ?? 0) : undefined);
    if (q.maxWarm && (warm == null || warm > q.maxWarm)) return false;
    if (q.maxCold && (l.coldRent ?? Infinity) > q.maxCold) return false;
  }
  if (q.minRooms && (l.rooms ?? 0) < q.minRooms) return false;
  if (q.minArea && (l.livingArea ?? 0) < q.minArea) return false;
  if (q.features?.some((f) => !l.features.includes(f))) return false;
  if (q.pets && !l.features.includes("pets_allowed")) return false;
  if (q.commissionFree && !l.commission?.commissionFree) return false;
  if (q.newBuild && !l.newBuild) return false;
  if (q.noRenovation && l.condition === "needs_renovation") return false;
  if (q.energyMax && (!l.energy?.class || CLASSES.indexOf(l.energy.class) > CLASSES.indexOf(q.energyMax))) return false;
  if (q.bounds) {
    const [s, w, n, e] = q.bounds;
    if (l.address.lat == null || l.address.lng == null || l.address.lat < s || l.address.lat > n || l.address.lng < w || l.address.lng > e) return false;
  }
  return true;
}

export function search(props: PropertyView[], q: SearchQuery, annualRate?: number) {
  const hits = props.filter((p) => matches(p.listing, q, annualRate));
  const price = (l: Listing) => (q.tx === "buy" ? l.price : l.warmRent ?? l.coldRent) ?? Infinity;
  const sorters: Record<NonNullable<SearchQuery["sort"]>, (a: PropertyView, b: PropertyView) => number> = {
    newest: (a, b) => b.listing.firstSeenAt.localeCompare(a.listing.firstSeenAt),
    price_asc: (a, b) => price(a.listing) - price(b.listing),
    price_desc: (a, b) => price(b.listing) - price(a.listing),
    ppsqm: (a, b) => price(a.listing) / (a.listing.livingArea ?? 1) - price(b.listing) / (b.listing.livingArea ?? 1),
  };
  return hits.sort(sorters[q.sort ?? "newest"]);
}
