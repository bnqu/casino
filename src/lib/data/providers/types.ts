/**
 * Provider abstractions. Business logic depends only on these interfaces; concrete
 * implementations are chosen in `registry.ts` from configuration. Every method
 * returns `ProviderResult` so "no data" is explicit — never an invented number.
 */
import type { ProviderResult } from "../provenance";
import type { StateCode } from "../regulatory/transferTax";

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface RateQuery {
  fixedYears: number;
  loanAmount?: number;
  ltv?: number;
  propertyType?: "apartment" | "house";
  ownerOccupied?: boolean;
}
export interface IndicativeRate {
  annualRate: number; // nominal or effective, see `rateType`
  rateType: "effective" | "nominal";
  fixedYears: number;
  /** Description of what the benchmark actually measures. */
  benchmark: string;
  personalised: boolean;
}
export interface MortgageRateProvider {
  id: string;
  getCurrentRate(q: RateQuery): Promise<ProviderResult<IndicativeRate>>;
}

export interface TransferTaxProvider {
  getRate(state: StateCode, on?: Date): Promise<ProviderResult<number>>;
}

export interface PropertyTaxProvider {
  /** Yearly Grundsteuer estimate for a property, if municipal data is configured. */
  estimateYearly(input: { municipalityKey: string; livingArea: number; propertyType: string }): Promise<ProviderResult<number>>;
}

export interface GovernmentProgram {
  id: string;
  provider: string; // e.g. "KfW"
  code: string; // e.g. "300"
  name: string;
  purpose: string;
  eligibilitySummary: string[];
  maxAmountNote: string;
  rateInfo?: string;
  termNote?: string;
  fixedRateNote?: string;
  applicationRules: string[];
  combinable: string;
  sourceUrl: string;
  lastUpdated: string;
  verificationStatus: "verified_official" | "secondary_source" | "unverified";
  disclaimer: string;
  /** Machine-checkable hints used for "you may qualify" — never a determination. */
  matchHints: {
    ownerOccupiedOnly?: boolean;
    requiresChildren?: boolean;
    newBuildOnly?: boolean;
    existingOnly?: boolean;
    maxEnergyClass?: string; // e.g. "F" means F,G,H qualify (worst-class buyers)
    householdTaxableIncomeCap?: { base: number; perChild: number };
  };
}
export interface GovernmentProgramProvider {
  listPrograms(): Promise<ProviderResult<GovernmentProgram[]>>;
}

export type TravelMode = "transit" | "driving" | "cycling" | "walking";
export interface TravelTime {
  minutes: number;
  distanceKm: number;
  mode: TravelMode;
  method: "routed" | "straight_line_estimate";
}
export interface TravelTimeProvider {
  id: string;
  travelTime(from: GeoPoint, to: GeoPoint, mode: TravelMode): Promise<ProviderResult<TravelTime>>;
}

export interface Amenity {
  kind: "school" | "daycare" | "supermarket" | "doctor" | "hospital" | "park" | "transit_stop" | "pharmacy";
  name?: string;
  location: GeoPoint;
  distanceM: number;
}
export interface NeighborhoodMetric {
  key: string;
  label: string;
  value: number | string;
  unit?: string;
}
export interface NeighborhoodDataProvider {
  amenitiesNear(p: GeoPoint, radiusM: number): Promise<ProviderResult<Amenity[]>>;
  metrics(p: GeoPoint): Promise<ProviderResult<NeighborhoodMetric[]>>;
}

export interface MarketComparable {
  medianPricePerSqm: number;
  p25: number;
  p75: number;
  sampleSize: number;
  area: string;
}
export interface MarketPriceProvider {
  comparables(input: { location: GeoPoint; livingArea: number; type: string; transaction: "buy" | "rent" }): Promise<ProviderResult<MarketComparable>>;
}

export interface RentalRegulationProvider {
  /** Mietspiegel / rent-cap status for a municipality — only where configured from official data. */
  rentCapStatus(municipalityKey: string): Promise<ProviderResult<{ ordinanceInForce: boolean; validUntil?: string; referenceRentPerSqm?: { min: number; max: number } }>>;
}

export interface EnergyDataProvider {
  /** Energy price per kWh by carrier (gas, oil, electricity, district heating). */
  pricePerKwh(carrier: string): Promise<ProviderResult<number>>;
}

export interface GeocodingProvider {
  geocode(address: string): Promise<ProviderResult<GeoPoint & { precision: "rooftop" | "street" | "postcode" | "city" }>>;
}
