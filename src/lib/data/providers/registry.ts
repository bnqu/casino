/**
 * Composition root for data providers. Swap implementations here (driven by env)
 * without touching business logic or UI.
 */
import type { ProviderResult } from "../provenance";
import { transferTaxRule, type StateCode } from "../regulatory/transferTax";
import { StaticCatalogueProgramProvider } from "./governmentPrograms";
import { BundesbankMortgageRateProvider, ChainedMortgageRateProvider, PartnerQuoteProvider } from "./mortgageRates";
import { StraightLineTravelProvider } from "./travel";
import type {
  MarketPriceProvider,
  MortgageRateProvider,
  NeighborhoodDataProvider,
  RentalRegulationProvider,
  TransferTaxProvider,
  TravelTimeProvider,
  GovernmentProgramProvider,
} from "./types";

function parseSeries(): Record<string, string> {
  try {
    return JSON.parse(process.env.BUNDESBANK_MORTGAGE_SERIES ?? "{}");
  } catch {
    return {};
  }
}

const unavailable = (provider: string, reason: string) => ({ ok: false as const, provider, reason });

export const transferTaxProvider: TransferTaxProvider = {
  async getRate(state: StateCode, on?: Date): Promise<ProviderResult<number>> {
    const r = transferTaxRule(state, on);
    return {
      ok: true,
      value: r.value,
      provenance: { sourceName: r.sourceName, sourceUrl: r.sourceUrl, kind: "official_law", observedAt: r.effectiveFrom, retrievedAt: r.lastVerifiedAt, confidence: r.verificationStatus === "verified_official" ? "high" : "medium" },
      freshness: "fresh",
    };
  },
};

export const mortgageRateProvider: MortgageRateProvider = new ChainedMortgageRateProvider([
  new PartnerQuoteProvider(),
  new BundesbankMortgageRateProvider(parseSeries()),
]);

export const governmentProgramProvider: GovernmentProgramProvider = new StaticCatalogueProgramProvider();

export const travelTimeProvider: TravelTimeProvider = new StraightLineTravelProvider();

export const marketPriceProvider: MarketPriceProvider = {
  async comparables() {
    return unavailable("market", "No licensed market-price dataset configured");
  },
};

export const neighborhoodProvider: NeighborhoodDataProvider = {
  async amenitiesNear() {
    return unavailable("neighborhood", "No amenity dataset configured (e.g. OpenStreetMap extract with ODbL attribution)");
  },
  async metrics() {
    return unavailable("neighborhood", "No neighbourhood statistics configured");
  },
};

export const rentalRegulationProvider: RentalRegulationProvider = {
  async rentCapStatus() {
    return unavailable("rental-regulation", "No municipal rent-cap / Mietspiegel dataset configured");
  },
};
