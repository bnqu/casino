"use client";
import { useState } from "react";

type Resp = { mode: "ai"; answer: string } | { mode: "brief"; brief: { category: string; text: string }[]; questions: string[]; note: string } | { error: string };

const SUGGESTIONS = ["Was sind versteckte Kosten?", "Welche Unterlagen sollte ich anfordern?", "Könnte die Heizung teuer werden?", "Was sollte ich verhandeln?"];

export function Assistant({ propertyId }: { propertyId: string }) {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<Resp | null>(null);
  const ask = async (question: string) => {
    setQ(question);
    setBusy(true);
    try {
      const r = await fetch("/api/assistant", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ propertyId, question }) });
      setRes(await r.json());
    } catch {
      setRes({ error: "Netzwerkfehler" });
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="card space-y-3 text-sm">
      <h2 className="font-semibold">Frag den Assistenten</h2>
      <form onSubmit={(e) => (e.preventDefault(), q.trim() && ask(q))} className="flex gap-2">
        <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ist die Wohnung gut für eine Familie?" />
        <button className="btn" disabled={busy}>{busy ? "…" : "Fragen"}</button>
      </form>
      <div className="flex flex-wrap gap-1">{SUGGESTIONS.map((s) => <button key={s} className="chip hover:bg-slate-50" onClick={() => ask(s)}>{s}</button>)}</div>
      {res && "error" in res && <p className="text-risk">{res.error}</p>}
      {res && "mode" in res && res.mode === "ai" && <div className="whitespace-pre-wrap">{res.answer}</div>}
      {res && "mode" in res && res.mode === "brief" && (
        <div className="space-y-2">
          <p className="text-xs text-muted">{res.note}</p>
          <ul className="list-disc pl-5">{res.brief.map((b) => <li key={b.text}><span className="text-muted">[{b.category}]</span> {b.text}</li>)}</ul>
        </div>
      )}
      <p className="text-xs text-muted">Antwortet nur aus den strukturierten Angebotsdaten und trennt Fakten, Schätzungen und Unbekanntes.</p>
    </section>
  );
}
