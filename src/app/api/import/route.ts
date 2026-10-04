import { normalize, parseCsv, type IngestIssue } from "@/lib/listings/ingest";
import { upsertListings } from "@/lib/listings/store";
import type { Listing } from "@/lib/listings/types";

/**
 * CSV import for licensed/partner feeds and agent uploads. Protected by
 * IMPORT_TOKEN — never expose an unauthenticated write endpoint.
 */
export async function POST(req: Request) {
  const token = process.env.IMPORT_TOKEN;
  if (!token) return Response.json({ error: "Import disabled: set IMPORT_TOKEN" }, { status: 503 });
  if (req.headers.get("authorization") !== `Bearer ${token}`) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const form = await req.formData();
  const file = form.get("file");
  const sourceName = String(form.get("sourceName") ?? "").trim();
  const licence = String(form.get("licence") ?? "").trim();
  if (!(file instanceof File) || !sourceName || !licence) return Response.json({ error: "file, sourceName and licence/permission note are required" }, { status: 400 });
  if (file.size > 10 * 1024 * 1024) return Response.json({ error: "File too large (10 MB max)" }, { status: 413 });
  const slug = sourceName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const source = { id: `csv:${slug}`, kind: "csv_import" as const, name: sourceName, licence };
  const rows = parseCsv(await file.text());
  const issues: IngestIssue[] = [];
  const listings: Listing[] = [];
  rows.forEach((r, i) => {
    const out = normalize(r, source, i + 2);
    issues.push(...out.issues);
    if (out.listing) listings.push(out.listing);
  });
  const result = listings.length ? await upsertListings(listings) : { created: 0, updated: 0, properties: 0 };
  return Response.json({ rows: rows.length, accepted: listings.length, ...result, issues: issues.slice(0, 200) });
}
