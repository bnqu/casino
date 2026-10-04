import { test } from "node:test";
import assert from "node:assert/strict";
import { normalize, parseCsv } from "../src/lib/listings/ingest";
import { clusterListings } from "../src/lib/listings/dedup";
import { listingFreshness, listingQuality } from "../src/lib/listings/quality";
import { parseIntent } from "../src/lib/intent/parse";
import { matchPrograms, PROGRAM_CATALOGUE } from "../src/lib/data/providers/governmentPrograms";
import { parseLastObservation } from "../src/lib/data/providers/mortgageRates";

const csv = `external_id;transaction;type;title;street;house_number;postcode;city;state;lat;lng;price;living_area;rooms;balcony;energy_class
a1;buy;apartment;Helle 3-Zimmer;Musterstr.;5;10115;Berlin;DE-BE;52.53;13.38;"549.000";82;3;ja;C
a2;buy;apartment;Bad row;;;;Berlin;;;;;;;;`;

test("CSV ingestion normalises German numbers and rejects invalid rows", () => {
  const rows = parseCsv(csv);
  assert.equal(rows.length, 2);
  const src = { id: "csv:test", kind: "csv_import" as const, name: "Test" };
  const ok = normalize(rows[0], src, 1);
  assert.equal(ok.listing?.price, 549_000);
  assert.deepEqual(ok.listing?.features, ["balcony"]);
  assert.equal(ok.listing?.address.precision, "exact");
  const bad = normalize(rows[1], src, 2);
  assert.equal(bad.listing, undefined);
  assert.ok(bad.issues.some((i) => i.severity === "error"));
});

test("dedup clusters the same flat across providers but not neighbours", () => {
  const src = (id: string) => ({ id, kind: "partner_feed" as const, name: id });
  const base = normalize(parseCsv(csv)[0], src("p1"), 1).listing!;
  const dup = { ...base, id: "p2:x", source: src("p2"), price: 545_000 };
  const other = { ...base, id: "p3:y", source: src("p3"), livingArea: 120, rooms: 4, address: { ...base.address, lat: 52.6, lng: 13.5, street: "Andere", houseNumber: "1" } };
  const props = clusterListings([base, dup, other]);
  assert.equal(props.length, 2);
  assert.ok(props.some((p) => p.listingIds.length === 2));
});

test("quality flags important missing info; freshness needs evidence", () => {
  const l = normalize(parseCsv(csv)[0], { id: "s", kind: "manual", name: "s" }, 1, new Date("2026-10-01T10:00:00Z")).listing!;
  const q = listingQuality(l);
  assert.equal(q.badge, "Important information missing"); // no floorplan, no Hausgeld
  assert.equal(listingFreshness(l, new Date("2026-10-03T10:00:00Z")).tone, "normal");
  assert.equal(listingFreshness(l, new Date("2026-11-01T10:00:00Z")).tone, "maybe_stale");
});

test("intent parser: buyer and renter examples", () => {
  const b = parseIntent("I have €80,000 savings, earn €5,500 net monthly, want a 3-bedroom apartment around Berlin, and don't want to spend more than €2,000 per month.");
  assert.equal(b.savings, 80_000);
  assert.equal(b.netMonthlyIncome, 5_500);
  assert.equal(b.bedrooms, 3);
  assert.equal(b.location, "Berlin");
  assert.equal(b.maxMonthly, 2_000);
  const r = parseIntent("I want a 2–3 room apartment within 35 minutes of Munich Hauptbahnhof, maximum warm rent €1,800, balcony, quiet neighborhood, and I have a dog.");
  assert.equal(r.transaction, "rent");
  assert.equal(r.minRooms, 2);
  assert.equal(r.maxRooms, 3);
  assert.equal(r.maxWarmRent, 1_800);
  assert.equal(r.commuteMaxMin, 35);
  assert.match(r.commuteTo ?? "", /munich hauptbahnhof/);
  assert.ok(r.pets && r.quiet && r.features.includes("balcony"));
});

test("program matching never matches without children for family programs", () => {
  const m = matchPrograms(PROGRAM_CATALOGUE, { ownerOccupied: true, children: 0, newBuild: false, energyClass: "G" });
  assert.deepEqual(m.map((x) => x.program.id), ["kfw-124"]);
  const f = matchPrograms(PROGRAM_CATALOGUE, { ownerOccupied: true, children: 2, newBuild: false, energyClass: "G" });
  assert.ok(f.find((x) => x.program.id === "kfw-308")?.unknowns.includes("Taxable household income not provided"));
});

test("Bundesbank SDMX CSV parsing", () => {
  assert.deepEqual(parseLastObservation('KEY,TIME_PERIOD,OBS_VALUE\n"X","2026-07","3.71"\n"X","2026-08","3.68"'), { period: "2026-08", value: 3.68 });
});
