"use client";
import { useState } from "react";

type Result = { rows: number; accepted: number; created: number; updated: number; properties: number; issues: { row: number; field?: string; message: string; severity: string }[] } | { error: string };

export function ImportForm() {
  const [res, setRes] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="card space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const token = String(fd.get("token"));
        fd.delete("token");
        setBusy(true);
        const r = await fetch("/api/import", { method: "POST", body: fd, headers: { authorization: `Bearer ${token}` } });
        setRes(await r.json());
        setBusy(false);
      }}
    >
      <input className="input" name="sourceName" placeholder="Quelle (z. B. Musterimmobilien GmbH)" required />
      <input className="input" name="licence" placeholder="Rechtsgrundlage / Lizenz (z. B. Partnervertrag vom …)" required />
      <input className="input" name="token" type="password" placeholder="Import-Token" required />
      <input name="file" type="file" accept=".csv,text/csv" required />
      <button className="btn" disabled={busy}>{busy ? "Importiere…" : "Importieren"}</button>
      {res && "error" in res && <p className="text-risk">{res.error}</p>}
      {res && !("error" in res) && (
        <div className="text-sm">
          <p>{res.rows} Zeilen · {res.accepted} übernommen · {res.created} neu · {res.updated} aktualisiert · {res.properties} Immobilien gesamt</p>
          {res.issues.length > 0 && (
            <ul className="mt-2 max-h-64 overflow-auto text-xs">
              {res.issues.map((i, k) => <li key={k} className={i.severity === "error" ? "text-risk" : "text-warn"}>Zeile {i.row}{i.field && ` (${i.field})`}: {i.message}</li>)}
            </ul>
          )}
        </div>
      )}
    </form>
  );
}
