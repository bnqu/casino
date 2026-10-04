/**
 * Deterministic parser for free-text property requests (DE/EN). Extracts only what
 * is literally stated; everything else stays undefined. An LLM can be layered on
 * top later, but this parser is the auditable baseline.
 */
export interface ParsedIntent {
  transaction?: "buy" | "rent";
  savings?: number;
  netMonthlyIncome?: number;
  maxMonthly?: number;
  maxWarmRent?: number;
  maxPrice?: number;
  minRooms?: number;
  maxRooms?: number;
  bedrooms?: number;
  location?: string;
  commuteMaxMin?: number;
  commuteTo?: string;
  features: string[];
  pets: boolean;
  quiet: boolean;
  type?: "apartment" | "house";
  unparsed: string[];
}

const money = (s: string) => {
  const m = s.replace(/\s/g, "").match(/([\d.,]+)(k|tsd|tausend)?/i);
  if (!m) return undefined;
  let n = Number(m[1].replace(/\.(?=\d{3}\b)/g, "").replace(/,(?=\d{3}\b)/g, "").replace(",", "."));
  if (m[2]) n *= 1000;
  return Number.isFinite(n) ? n : undefined;
};

const AMOUNT = "€?\\s?([\\d.,]+\\s?(?:k|tsd|tausend)?)\\s?(?:€|eur|euro)?";

const FEATURES: [RegExp, string][] = [
  [/balcon|balkon/i, "balcony"],
  [/terrace|terrasse/i, "terrace"],
  [/garden|garten/i, "garden"],
  [/elevator|lift|aufzug|fahrstuhl/i, "elevator"],
  [/parking|stellplatz/i, "parking"],
  [/garage/i, "garage"],
  [/basement|keller/i, "basement"],
  [/kitchen|einbauküche|ebk/i, "kitchen"],
  [/barrier|barrierefrei/i, "barrier_free"],
  [/furnished|möbliert/i, "furnished"],
];

export function parseIntent(text: string): ParsedIntent {
  const t = text.toLowerCase();
  const r: ParsedIntent = { features: [], pets: false, quiet: false, unparsed: [] };
  if (/\b(rent|mieten|miete|warm rent|warmmiete|kaltmiete)\b/.test(t)) r.transaction = "rent";
  if (/\b(buy|kaufen|kauf|purchase|eigentum)\b/.test(t)) r.transaction = r.transaction ?? "buy";

  const grab = (re: RegExp) => {
    const m = t.match(re);
    return m ? money(m[1]) : undefined;
  };
  r.savings = grab(new RegExp(`${AMOUNT}\\s*(?:in\\s+)?(?:savings|erspar|eigenkapital|equity)`)) ?? grab(new RegExp(`(?:savings|ersparnisse|eigenkapital|equity)\\D{0,15}${AMOUNT}`));
  r.netMonthlyIncome = grab(new RegExp(`(?:earn|verdiene|income|einkommen)\\D{0,10}${AMOUNT}\\s*(?:net|netto)?`));
  r.maxWarmRent = grab(new RegExp(`(?:warm rent|warmmiete|warm)\\D{0,12}${AMOUNT}`)) ?? grab(new RegExp(`${AMOUNT}\\s*warm`));
  r.maxMonthly = grab(new RegExp(`(?:more than|max(?:imum)?|höchstens|bis)\\s*${AMOUNT}\\s*(?:per|pro|a|im|/)\\s*(?:month|monat)`));
  r.maxPrice = grab(new RegExp(`(?:budget|kaufpreis|price|bis)\\D{0,10}${AMOUNT}(?!\\s*(?:per|pro|/|warm|a month|im monat))`));
  if (r.maxPrice && r.maxPrice < 20_000) r.maxPrice = undefined;
  if (r.maxWarmRent) r.maxMonthly = undefined;

  const rooms = t.match(/(\d)(?:\s*[–-]\s*(\d))?\s*(?:-?\s*)?(rooms?|zimmer|zi\b)/);
  if (rooms) {
    r.minRooms = Number(rooms[1]);
    if (rooms[2]) r.maxRooms = Number(rooms[2]);
  }
  const bed = t.match(/(\d)\s*-?\s*(bedroom|schlafzimmer)/);
  if (bed) {
    r.bedrooms = Number(bed[1]);
    r.minRooms = r.minRooms ?? r.bedrooms + 1;
  }
  const commute = t.match(/(?:within\s+)?(\d{1,3})\s*(?:min(?:utes|uten)?)\s*(?:of|from|von|zu[mr]?|to|nach)\s+([a-zäöüß .-]+?)(?:,|\.|$| and | und )/);
  if (commute) {
    r.commuteMaxMin = Number(commute[1]);
    r.commuteTo = commute[2].trim();
  }
  const loc = t.match(/(?:around|near|in|um|bei|nahe)\s+([a-zäöüß-]+(?:\s[a-zäöüß-]+)?)/);
  const stop = new Set(["the", "a", "my", "der", "die", "das", "einer", "minutes", "germany"]);
  if (loc && !stop.has(loc[1].split(" ")[0])) r.location = cap(loc[1].split(" ")[0]);
  if (!r.location && r.commuteTo) r.location = cap(r.commuteTo.split(" ")[0]);
  for (const [re, f] of FEATURES) if (re.test(t)) r.features.push(f);
  r.pets = /\b(dog|hund|cat|katze|pet|haustier)/.test(t);
  r.quiet = /\b(quiet|ruhig)/.test(t);
  if (/\b(house|haus|einfamilienhaus)\b/.test(t)) r.type = "house";
  else if (/\b(apartment|flat|wohnung)\b/.test(t)) r.type = "apartment";
  if (!r.transaction) r.unparsed.push("buy or rent");
  return r;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
