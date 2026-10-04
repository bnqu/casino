/**
 * Generic ingestion pipeline for lawfully obtained listings (partner feeds, agent
 * uploads, CSV/XML imports, manual entry). No scraping.
 *
 *   raw → normalize → validate → geocode → enrich → dedupe → canonical → index
 */
import { z } from "zod";
import { STATES, type StateCode } from "../data/regulatory/transferTax";
import type { Listing, ListingSourceRef } from "./types";

export type RawRecord = Record<string, string | undefined>;

export interface IngestIssue {
  row: number;
  field?: string;
  message: string;
  severity: "error" | "warning";
}

const num = (v?: string) => {
  if (v == null || v.trim() === "") return undefined;
  // Accept German formatting: "1.234,56"
  const s = v.trim().replace(/\s|€/g, "");
  const german = /,\d{1,2}$/.test(s) || /^-?\d{1,3}(\.\d{3})+$/.test(s);
  const n = Number(german ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, ""));
  return Number.isFinite(n) ? n : NaN;
};
const bool = (v?: string) => (v == null || v === "" ? undefined : /^(1|true|ja|yes|y|x)$/i.test(v.trim()));

const FEATURE_COLUMNS = ["balcony", "terrace", "garden", "elevator", "parking", "garage", "basement", "kitchen", "barrier_free", "pets_allowed", "furnished"];

const ListingSchema = z
  .object({
    transaction: z.enum(["buy", "rent"]),
    type: z.enum(["apartment", "house", "maisonette", "penthouse", "land", "wg_room", "other"]),
    title: z.string().min(3),
    city: z.string().min(2),
    price: z.number().positive().optional(),
    coldRent: z.number().positive().optional(),
    warmRent: z.number().positive().optional(),
    livingArea: z.number().positive().max(10_000).optional(),
    rooms: z.number().positive().max(100).optional(),
    lat: z.number().min(47).max(55.2).optional(),
    lng: z.number().min(5.8).max(15.1).optional(),
  })
  .refine((l) => (l.transaction === "buy" ? l.price != null || l.type === "land" : l.coldRent != null || l.warmRent != null), {
    message: "Buy listings need a price; rent listings need cold or warm rent",
  });

export function parseCsv(text: string): RawRecord[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  const sep = (text.split("\n")[0].match(/;/g)?.length ?? 0) > (text.split("\n")[0].match(/,/g)?.length ?? 0) ? ";" : ",";
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') (cell += '"'), i++;
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === sep) row.push(cell), (cell = "");
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell), rows.push(row), (row = []), (cell = "");
    } else cell += c;
  }
  if (cell || row.length) row.push(cell), rows.push(row);
  const [header, ...data] = rows.filter((r) => r.some((x) => x.trim() !== ""));
  if (!header) return [];
  const keys = header.map((h) => h.trim());
  return data.map((r) => Object.fromEntries(keys.map((k, i) => [k, r[i]?.trim()])));
}

export function normalize(raw: RawRecord, source: ListingSourceRef, row: number, now = new Date()): { listing?: Listing; issues: IngestIssue[] } {
  const issues: IngestIssue[] = [];
  const n = (k: string) => {
    const v = num(raw[k]);
    if (Number.isNaN(v)) issues.push({ row, field: k, message: `Not a number: "${raw[k]}"`, severity: "error" });
    return Number.isNaN(v) ? undefined : v;
  };
  const state = raw.state && raw.state in STATES ? (raw.state as StateCode) : undefined;
  if (raw.state && !state) issues.push({ row, field: "state", message: `Unknown state code "${raw.state}" (use e.g. DE-BY)`, severity: "warning" });
  const lat = n("lat");
  const lng = n("lng");
  const nowIso = now.toISOString();
  const candidate = {
    transaction: raw.transaction?.toLowerCase(),
    type: raw.type?.toLowerCase(),
    title: raw.title ?? "",
    city: raw.city ?? "",
    price: n("price"),
    coldRent: n("cold_rent"),
    warmRent: n("warm_rent"),
    livingArea: n("living_area"),
    rooms: n("rooms"),
    lat,
    lng,
  };
  const parsed = ListingSchema.safeParse(candidate);
  if (!parsed.success) {
    for (const e of parsed.error.issues) issues.push({ row, field: e.path.join("."), message: e.message, severity: "error" });
    return { issues };
  }
  const energyClass = raw.energy_class?.toUpperCase();
  const images = (raw.images ?? "").split("|").map((u) => u.trim()).filter(Boolean).map((url) => ({ url }));
  const floorplans = (raw.floorplans ?? "").split("|").map((u) => u.trim()).filter(Boolean).map((url) => ({ url, isFloorplan: true }));
  const precision = raw.street && raw.house_number ? "exact" : raw.street ? "street" : raw.postcode ? "postcode" : "city";
  const firstSeen = raw.first_seen_at && !Number.isNaN(Date.parse(raw.first_seen_at)) ? new Date(raw.first_seen_at).toISOString() : nowIso;
  const price = parsed.data.price;
  const listing: Listing = {
    id: `${source.id}:${raw.external_id || row}`,
    externalId: raw.external_id,
    source,
    transaction: parsed.data.transaction,
    type: parsed.data.type,
    title: parsed.data.title,
    description: raw.description,
    address: { street: raw.street, houseNumber: raw.house_number, postcode: raw.postcode, city: parsed.data.city, state, precision, lat, lng },
    price,
    coldRent: parsed.data.coldRent,
    warmRent: parsed.data.warmRent,
    utilities: n("utilities"),
    heatingCosts: n("heating_costs"),
    deposit: n("deposit"),
    hausgeld: n("hausgeld"),
    livingArea: parsed.data.livingArea,
    plotArea: n("plot_area"),
    rooms: parsed.data.rooms,
    bedrooms: n("bedrooms"),
    bathrooms: n("bathrooms"),
    yearBuilt: n("year_built"),
    floor: n("floor"),
    condition: (raw.condition as Listing["condition"]) || "unknown",
    newBuild: bool(raw.new_build),
    features: FEATURE_COLUMNS.filter((f) => bool(raw[f])),
    energy: {
      certificateType: raw.energy_certificate_type === "demand" || raw.energy_certificate_type === "consumption" ? raw.energy_certificate_type : undefined,
      class: energyClass && ["A+", "A", "B", "C", "D", "E", "F", "G", "H"].includes(energyClass) ? (energyClass as never) : undefined,
      kwhPerSqmYear: n("energy_kwh"),
      heating: raw.heating?.toLowerCase() || undefined,
      heatingYear: n("heating_year"),
    },
    commission: raw.commission_free != null || raw.buyer_commission_pct != null ? { commissionFree: bool(raw.commission_free), buyerPct: n("buyer_commission_pct") } : undefined,
    availableFrom: raw.available_from || undefined,
    images: [...images, ...floorplans],
    documents: [],
    contact: { name: raw.contact_name, agency: raw.agency, email: raw.contact_email, phone: raw.contact_phone, privateSeller: bool(raw.private_seller) },
    firstSeenAt: firstSeen,
    lastUpdatedAt: nowIso,
    lastVerifiedAt: nowIso,
    status: "active",
    priceHistory: price ? [{ at: nowIso, price }] : [],
  };
  if (lat == null || lng == null) issues.push({ row, field: "lat/lng", message: "No coordinates — listing will not appear on the map until geocoded", severity: "warning" });
  if (!state && parsed.data.transaction === "buy") issues.push({ row, field: "state", message: "No state — transfer tax cannot be computed", severity: "warning" });
  return { listing, issues };
}

/** Merge an incoming listing into an existing one, keeping history. */
export function mergeUpdate(existing: Listing, incoming: Listing): Listing {
  const priceHistory = [...existing.priceHistory];
  if (incoming.price && incoming.price !== existing.price) priceHistory.push({ at: incoming.lastUpdatedAt, price: incoming.price });
  return { ...incoming, firstSeenAt: existing.firstSeenAt, priceHistory };
}

export const CSV_TEMPLATE_COLUMNS = [
  "external_id", "transaction", "type", "title", "description", "street", "house_number", "postcode", "city", "state", "lat", "lng",
  "price", "cold_rent", "warm_rent", "utilities", "heating_costs", "deposit", "hausgeld", "living_area", "plot_area", "rooms", "bedrooms",
  "bathrooms", "year_built", "floor", "condition", "new_build", ...FEATURE_COLUMNS, "energy_certificate_type", "energy_class", "energy_kwh",
  "heating", "heating_year", "commission_free", "buyer_commission_pct", "available_from", "images", "floorplans", "contact_name", "agency",
  "contact_email", "contact_phone", "private_seller", "first_seen_at",
];
