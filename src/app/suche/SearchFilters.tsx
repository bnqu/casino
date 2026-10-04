"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { SearchQuery } from "@/lib/listings/search";

const FEATURES: [string, string][] = [
  ["balcony", "Balkon"], ["terrace", "Terrasse"], ["garden", "Garten"], ["elevator", "Aufzug"], ["parking", "Stellplatz"], ["garage", "Garage"],
  ["basement", "Keller"], ["kitchen", "Einbauküche"], ["barrier_free", "Barrierefrei"], ["furnished", "Möbliert"],
];
const TYPES: [string, string][] = [["apartment", "Wohnung"], ["house", "Haus"], ["maisonette", "Maisonette"], ["penthouse", "Penthouse"], ["land", "Grundstück"], ["wg_room", "WG"], ["other", "Sonstige"]];

export function SearchFilters({ q, rateKnown, rateFromUser }: { q: SearchQuery; rateKnown: boolean; rateFromUser: boolean }) {
  const router = useRouter();
  const [s, setS] = useState({
    tx: q.tx, city: q.city ?? "", maxPrice: q.maxPrice?.toString() ?? "", monthly: q.monthly?.toString() ?? "", equity: q.equity?.toString() ?? "", maxWarm: q.maxWarm?.toString() ?? "",
    rooms: q.minRooms?.toString() ?? "", area: q.minArea?.toString() ?? "", types: q.types ?? [], features: q.features ?? [], pets: !!q.pets, commissionFree: !!q.commissionFree,
    newBuild: !!q.newBuild, noRenovation: !!q.noRenovation, energyMax: q.energyMax ?? "", rate: "", sort: q.sort ?? "newest", budgetMode: q.monthly ? "monthly" : "price",
  });
  const [more, setMore] = useState(false);
  const apply = (next = s) => {
    const p = new URLSearchParams();
    p.set("tx", next.tx);
    const add = (k: string, v: string | boolean | string[]) => {
      if (Array.isArray(v)) v.length && p.set(k, v.join(","));
      else if (v === true) p.set(k, "1");
      else if (v) p.set(k, v);
    };
    add("city", next.city);
    if (next.tx === "buy") {
      if (next.budgetMode === "price") add("maxPrice", next.maxPrice);
      else (add("monthly", next.monthly), add("equity", next.equity), add("rate", next.rate));
    } else add("maxWarm", next.maxWarm);
    add("rooms", next.rooms); add("area", next.area); add("types", next.types); add("features", next.features); add("pets", next.pets);
    add("commissionFree", next.commissionFree); add("newBuild", next.newBuild); add("noRenovation", next.noRenovation); add("energyMax", next.energyMax);
    if (next.sort !== "newest") p.set("sort", next.sort);
    router.push(`/suche?${p}`);
  };
  const toggle = (key: "features" | "types", v: string) => setS({ ...s, [key]: s[key].includes(v) ? s[key].filter((x) => x !== v) : [...s[key], v] });
  return (
    <form className="card space-y-3" onSubmit={(e) => (e.preventDefault(), apply())}>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex overflow-hidden rounded-lg border border-line">
          {(["buy", "rent"] as const).map((t) => (
            <button type="button" key={t} onClick={() => setS({ ...s, tx: t })} className={`px-4 py-2 text-sm font-medium ${s.tx === t ? "bg-brand text-white" : "bg-white"}`}>
              {t === "buy" ? "Kaufen" : "Mieten"}
            </button>
          ))}
        </div>
        <input className="input w-48" placeholder="Ort oder PLZ" value={s.city} onChange={(e) => setS({ ...s, city: e.target.value })} />
        {s.tx === "buy" ? (
          <>
            <select className="input w-40" value={s.budgetMode} onChange={(e) => setS({ ...s, budgetMode: e.target.value })} aria-label="Budget-Art">
              <option value="price">Kaufpreis bis</option>
              <option value="monthly">Monatsrate bis</option>
            </select>
            {s.budgetMode === "price" ? (
              <input className="input w-36" inputMode="numeric" placeholder="€ max." value={s.maxPrice} onChange={(e) => setS({ ...s, maxPrice: e.target.value })} />
            ) : (
              <>
                <input className="input w-32" inputMode="numeric" placeholder="€ / Monat" value={s.monthly} onChange={(e) => setS({ ...s, monthly: e.target.value })} />
                <input className="input w-32" inputMode="numeric" placeholder="Eigenkapital €" value={s.equity} onChange={(e) => setS({ ...s, equity: e.target.value })} />
                {(!rateKnown || rateFromUser) && <input className="input w-24" inputMode="decimal" placeholder="Zins %" value={s.rate} onChange={(e) => setS({ ...s, rate: e.target.value })} />}
              </>
            )}
          </>
        ) : (
          <input className="input w-40" inputMode="numeric" placeholder="Warmmiete max. €" value={s.maxWarm} onChange={(e) => setS({ ...s, maxWarm: e.target.value })} />
        )}
        <input className="input w-24" inputMode="numeric" placeholder="Zimmer ab" value={s.rooms} onChange={(e) => setS({ ...s, rooms: e.target.value })} />
        <input className="input w-24" inputMode="numeric" placeholder="m² ab" value={s.area} onChange={(e) => setS({ ...s, area: e.target.value })} />
        <select className="input w-40" value={s.sort} onChange={(e) => setS({ ...s, sort: e.target.value as typeof s.sort })} aria-label="Sortierung">
          <option value="newest">Neueste</option>
          <option value="price_asc">Preis aufsteigend</option>
          <option value="price_desc">Preis absteigend</option>
          <option value="ppsqm">€/m²</option>
        </select>
        <button type="button" className="btn-ghost" onClick={() => setMore(!more)}>Mehr Filter</button>
        <button className="btn">Suchen</button>
      </div>
      {more && (
        <div className="space-y-2 border-t border-line pt-3 text-sm">
          <div className="flex flex-wrap gap-1">
            {TYPES.map(([k, l]) => (
              <button type="button" key={k} onClick={() => toggle("types", k)} className={`chip ${s.types.includes(k) ? "border-brand bg-brand-soft" : ""}`}>{l}</button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1">
            {FEATURES.map(([k, l]) => (
              <button type="button" key={k} onClick={() => toggle("features", k)} className={`chip ${s.features.includes(k) ? "border-brand bg-brand-soft" : ""}`}>{l}</button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-1"><input type="checkbox" checked={s.pets} onChange={(e) => setS({ ...s, pets: e.target.checked })} /> Haustiere erlaubt</label>
            <label className="flex items-center gap-1"><input type="checkbox" checked={s.commissionFree} onChange={(e) => setS({ ...s, commissionFree: e.target.checked })} /> Provisionsfrei</label>
            <label className="flex items-center gap-1"><input type="checkbox" checked={s.newBuild} onChange={(e) => setS({ ...s, newBuild: e.target.checked })} /> Neubau</label>
            <label className="flex items-center gap-1"><input type="checkbox" checked={s.noRenovation} onChange={(e) => setS({ ...s, noRenovation: e.target.checked })} /> Ohne Renovierungsbedarf</label>
            <label className="flex items-center gap-1">
              Energieklasse bis
              <select className="input w-20" value={s.energyMax} onChange={(e) => setS({ ...s, energyMax: e.target.value })}>
                <option value="">egal</option>
                {["A+", "A", "B", "C", "D", "E", "F", "G"].map((c) => <option key={c}>{c}</option>)}
              </select>
            </label>
          </div>
          <p className="text-xs text-muted">Pendelzeit-, Schul- und Lärmfilter werden aktiviert, sobald ein Routing- bzw. Umgebungsdaten-Provider konfiguriert ist.</p>
        </div>
      )}
    </form>
  );
}
