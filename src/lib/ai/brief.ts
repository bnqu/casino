/**
 * Grounding for the AI assistant: every statement about a property is tagged with
 * its epistemic category. The assistant may only answer from this brief; anything
 * not in it is an "unknown" and must be said to be unknown.
 */
import { listingQuality } from "../listings/quality";
import type { Listing } from "../listings/types";

export type Category = "fact" | "estimate" | "external" | "assumption" | "unknown";
export interface Statement {
  category: Category;
  text: string;
  source?: string;
}

export function propertyBrief(l: Listing): Statement[] {
  const src = `Listing ${l.id} (${l.source.name}), updated ${l.lastUpdatedAt.slice(0, 10)}`;
  const s: Statement[] = [];
  const fact = (text: string) => s.push({ category: "fact", text, source: src });
  const unknown = (text: string) => s.push({ category: "unknown", text });
  fact(`${l.transaction === "buy" ? "For sale" : "For rent"}: ${l.type} in ${[l.address.postcode, l.address.city].filter(Boolean).join(" ")} (address precision: ${l.address.precision}).`);
  if (l.price) fact(`Asking price €${l.price.toLocaleString("de-DE")}.`);
  if (l.coldRent) fact(`Cold rent €${l.coldRent}.`);
  if (l.warmRent) fact(`Warm rent €${l.warmRent}.`);
  l.livingArea ? fact(`Living area ${l.livingArea} m².`) : unknown("Living area");
  l.rooms ? fact(`${l.rooms} rooms.`) : unknown("Number of rooms");
  l.yearBuilt ? fact(`Built ${l.yearBuilt}.`) : unknown("Construction year");
  l.energy?.class ? fact(`Energy class ${l.energy.class}${l.energy.certificateType ? ` (${l.energy.certificateType} certificate)` : ""}.`) : unknown("Energy class");
  l.energy?.heating ? fact(`Heating: ${l.energy.heating}${l.energy.heatingYear ? `, installed ${l.energy.heatingYear}` : ""}.`) : unknown("Heating type");
  if (l.energy?.heating && !l.energy.heatingYear) unknown("Age of the heating system");
  if (l.transaction === "buy" && ["apartment", "maisonette", "penthouse"].includes(l.type)) l.hausgeld != null ? fact(`Hausgeld €${l.hausgeld}/month.`) : unknown("Hausgeld");
  if (l.features.length) fact(`Features: ${l.features.join(", ")}.`);
  if (l.condition && l.condition !== "unknown") fact(`Condition stated as ${l.condition}.`);
  if (l.commission) fact(l.commission.commissionFree ? "Stated as commission-free for the buyer/tenant." : `Buyer commission ${l.commission.buyerPct ?? "?"}%.`);
  else unknown("Commission arrangement");
  for (const i of listingQuality(l).inconsistencies) s.push({ category: "unknown", text: `Inconsistency: ${i}` });
  return s;
}

/** Questions to ask the seller/agent, derived purely from what is missing. */
export function questionsToAsk(l: Listing): string[] {
  const q: string[] = [];
  const apt = ["apartment", "maisonette", "penthouse"].includes(l.type);
  if (!l.energy?.class) q.push("Can you send the energy certificate (Energieausweis)?");
  if (l.energy?.heating && !l.energy.heatingYear) q.push("When was the heating system installed, and is replacement planned?");
  if (["gas", "oil"].includes(l.energy?.heating ?? "")) q.push("What were the actual heating costs in the last two years?");
  if (apt && l.transaction === "buy") {
    q.push("Please share the last three owners' meeting minutes (Protokolle der Eigentümerversammlung).");
    q.push("How large is the maintenance reserve (Erhaltungsrücklage), and are special levies (Sonderumlagen) planned?");
    if (l.hausgeld == null) q.push("How much is the Hausgeld, and which part is non-recoverable?");
    q.push("Please share the current Wirtschaftsplan and Hausgeldabrechnung.");
  }
  if (!l.images.some((i) => i.isFloorplan)) q.push("Is a floorplan available?");
  if (!l.yearBuilt) q.push("What year was the building constructed?");
  if (!l.commission) q.push("Is there a broker commission, and how is it split?");
  if (l.transaction === "rent") q.push("How are operating costs (Nebenkosten) calculated, and what was the last statement?");
  return q;
}
