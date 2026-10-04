/** Domain model mirroring db/schema.sql (PropertyEntity ← Listing ← ListingSource). */
import type { StateCode } from "../data/regulatory/transferTax";

export type Transaction = "buy" | "rent";
export type PropertyType = "apartment" | "house" | "maisonette" | "penthouse" | "land" | "wg_room" | "other";
export type EnergyClass = "A+" | "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H";

export interface Address {
  street?: string;
  houseNumber?: string;
  postcode?: string;
  city: string;
  state?: StateCode;
  /** How precisely the location is known — listings often hide the exact address. */
  precision: "exact" | "street" | "postcode" | "city";
  lat?: number;
  lng?: number;
}

export interface ListingSourceRef {
  id: string; // e.g. "csv:agency-x", "partner:feedname"
  kind: "partner_feed" | "agent_upload" | "csv_import" | "xml_feed" | "manual";
  name: string;
  licence?: string;
}

export interface Listing {
  id: string;
  externalId?: string;
  source: ListingSourceRef;
  propertyId?: string; // canonical property after dedup
  transaction: Transaction;
  type: PropertyType;
  title: string;
  description?: string;
  address: Address;
  price?: number; // purchase price
  coldRent?: number;
  warmRent?: number;
  utilities?: number;
  heatingCosts?: number;
  deposit?: number;
  hausgeld?: number;
  livingArea?: number;
  plotArea?: number;
  rooms?: number;
  bedrooms?: number;
  bathrooms?: number;
  yearBuilt?: number;
  floor?: number;
  condition?: "first_occupancy" | "new" | "renovated" | "good" | "needs_renovation" | "unknown";
  newBuild?: boolean;
  features: string[]; // balcony, terrace, garden, elevator, parking, garage, basement, kitchen, barrier_free, pets_allowed, furnished
  energy?: {
    certificateType?: "consumption" | "demand";
    class?: EnergyClass;
    kwhPerSqmYear?: number;
    heating?: string; // gas, oil, heat_pump, district, pellets, electric
    heatingYear?: number;
    validUntil?: string;
  };
  commission?: { buyerPct?: number; note?: string; commissionFree?: boolean };
  availableFrom?: string;
  images: { url: string; caption?: string; isFloorplan?: boolean }[];
  documents: { kind: string; url: string }[];
  contact?: { name?: string; agency?: string; email?: string; phone?: string; privateSeller?: boolean };
  firstSeenAt: string;
  lastUpdatedAt: string;
  lastVerifiedAt?: string; // last time the source confirmed it is still active
  status: "active" | "reserved" | "removed";
  priceHistory: { at: string; price: number }[];
}

export interface PropertyEntity {
  id: string;
  listingIds: string[];
  canonicalListingId: string;
}
