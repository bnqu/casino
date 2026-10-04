/**
 * Listing repository. Development storage is a JSON file under DATA_DIR (default
 * ./data, gitignored). Production replaces this with the Postgres schema in
 * db/schema.sql behind the same functions.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { clusterListings } from "./dedup";
import { mergeUpdate } from "./ingest";
import type { Listing, PropertyEntity } from "./types";

interface StoreShape {
  listings: Listing[];
  properties: PropertyEntity[];
  events: { at: string; listingId: string; kind: "created" | "updated" | "price_changed" | "removed" }[];
}

const file = () => path.join(process.env.DATA_DIR ?? path.join(process.cwd(), "data"), "listings.json");

async function load(): Promise<StoreShape> {
  try {
    return JSON.parse(await fs.readFile(file(), "utf8"));
  } catch {
    return { listings: [], properties: [], events: [] };
  }
}

async function save(s: StoreShape) {
  await fs.mkdir(path.dirname(file()), { recursive: true });
  const tmp = `${file()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(s));
  await fs.rename(tmp, file());
}

export async function upsertListings(incoming: Listing[]) {
  const s = await load();
  const byId = new Map(s.listings.map((l) => [l.id, l]));
  let created = 0, updated = 0;
  for (const l of incoming) {
    const prev = byId.get(l.id);
    if (prev) {
      const merged = mergeUpdate(prev, l);
      if (prev.price !== merged.price) s.events.push({ at: l.lastUpdatedAt, listingId: l.id, kind: "price_changed" });
      byId.set(l.id, merged);
      updated++;
    } else {
      byId.set(l.id, l);
      s.events.push({ at: l.firstSeenAt, listingId: l.id, kind: "created" });
      created++;
    }
  }
  s.listings = [...byId.values()];
  s.properties = clusterListings(s.listings.filter((l) => l.status === "active"));
  const propOf = new Map(s.properties.flatMap((p) => p.listingIds.map((id) => [id, p.id] as const)));
  s.listings = s.listings.map((l) => ({ ...l, propertyId: propOf.get(l.id) }));
  await save(s);
  return { created, updated, properties: s.properties.length };
}

export interface PropertyView {
  property: PropertyEntity;
  listing: Listing; // canonical
  providers: Listing[];
}

export async function listProperties(): Promise<PropertyView[]> {
  const s = await load();
  const byId = new Map(s.listings.map((l) => [l.id, l]));
  return s.properties
    .map((p) => ({ property: p, listing: byId.get(p.canonicalListingId)!, providers: p.listingIds.map((id) => byId.get(id)!).filter(Boolean) }))
    .filter((v) => v.listing);
}

export async function getProperty(id: string): Promise<PropertyView | null> {
  return (await listProperties()).find((p) => p.property.id === id) ?? null;
}
