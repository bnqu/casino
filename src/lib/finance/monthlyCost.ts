/** "True monthly cost" breakdowns. Every non-input line is labelled as an estimate. */

export interface CostItem {
  key: string;
  label: string;
  amount: number;
  kind: "input" | "listing" | "estimate";
  note?: string;
}

export interface OwnerCostInput {
  mortgagePayment: number;
  hausgeld?: number; // from listing, if known
  livingArea: number;
  /** Grundsteuer per year, if known (municipal Hebesatz differs widely). */
  propertyTaxYearly?: number;
  insuranceYearly?: number;
  /** Maintenance reserve €/m²/year (assumption; Hausgeld often already includes a WEG reserve). */
  maintenancePerSqmYear?: number;
  /** Energy €/m²/year. */
  energyPerSqmYear?: number;
  propertyType: "apartment" | "house";
}

export function ownerMonthlyCost(i: OwnerCostInput) {
  const items: CostItem[] = [{ key: "mortgage", label: "Kreditrate", amount: i.mortgagePayment, kind: "input" }];
  if (i.propertyType === "apartment")
    items.push(
      i.hausgeld != null
        ? { key: "hausgeld", label: "Hausgeld", amount: i.hausgeld, kind: "listing", note: "From listing. Ask how much is non-recoverable and what the reserve contribution is." }
        : { key: "hausgeld", label: "Hausgeld (unknown)", amount: 0, kind: "estimate", note: "Not provided — ask the seller for the Wirtschaftsplan." },
    );
  items.push({
    key: "property_tax",
    label: "Grundsteuer",
    amount: (i.propertyTaxYearly ?? 0) / 12,
    kind: i.propertyTaxYearly != null ? "input" : "estimate",
    note: i.propertyTaxYearly != null ? undefined : "Unknown — depends on the municipal Hebesatz. Enter the amount from the seller's tax notice.",
  });
  if (i.propertyType === "house")
    items.push({ key: "insurance", label: "Gebäudeversicherung", amount: (i.insuranceYearly ?? i.livingArea * 3) / 12, kind: i.insuranceYearly != null ? "input" : "estimate", note: "Assumption €3/m²/yr if not entered." });
  const maint = i.maintenancePerSqmYear ?? (i.propertyType === "house" ? 12 : 6);
  items.push({ key: "maintenance", label: "Instandhaltungsrücklage", amount: (maint * i.livingArea) / 12, kind: "estimate", note: `Assumption €${maint}/m²/yr${i.propertyType === "apartment" ? " on top of Hausgeld reserve (for your own unit)" : ""}.` });
  const energy = i.energyPerSqmYear ?? 15;
  items.push({ key: "energy", label: "Energie (Heizung, Strom)", amount: (energy * i.livingArea) / 12, kind: "estimate", note: `Assumption €${energy}/m²/yr; depends heavily on energy class and usage.` });
  return { items, total: items.reduce((s, x) => s + x.amount, 0) };
}

export function renterMonthlyCost(coldRent: number, utilities?: number, heating?: number, warmRent?: number) {
  const items: CostItem[] = [{ key: "cold", label: "Kaltmiete", amount: coldRent, kind: "listing" }];
  if (utilities != null) items.push({ key: "utilities", label: "Nebenkosten", amount: utilities, kind: "listing" });
  if (heating != null) items.push({ key: "heating", label: "Heizkosten", amount: heating, kind: "listing" });
  const sum = items.reduce((s, x) => s + x.amount, 0);
  if (warmRent != null && Math.abs(warmRent - sum) > 1 && utilities == null)
    items.push({ key: "warm_rest", label: "Neben- & Heizkosten", amount: warmRent - coldRent, kind: "listing" });
  return { items, total: warmRent ?? items.reduce((s, x) => s + x.amount, 0) };
}

export function ltvInfo(loan: number, value: number) {
  const ltv = value > 0 ? loan / value : 0;
  return {
    loan,
    value,
    ltv,
    equityPct: 1 - ltv,
    band: ltv <= 0.6 ? "≤60%" : ltv <= 0.8 ? "≤80%" : ltv <= 0.9 ? "≤90%" : ltv <= 1 ? "≤100%" : ">100%",
    note: "Lower loan-to-value can often improve financing conditions; it does not guarantee a lower rate.",
  };
}
