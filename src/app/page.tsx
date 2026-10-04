import Link from "next/link";
import { IntentBox } from "./IntentBox";

const PILLARS = [
  ["Finanzielle Realität", "Kaufnebenkosten je Bundesland, echte Monatskosten, Anschlussfinanzierung und dein empfohlenes Budget — nicht nur ein Kaufpreis."],
  ["Transparente Bewertung", "Jeder Score lässt sich aufklappen. Fehlende Daten werden benannt, nicht erraten."],
  ["Belegte Daten", "Jede Marktzahl hat Quelle, Stand und Methodik. Ohne Quelle zeigen wir keinen Wert."],
];

export default function Home() {
  return (
    <div>
      <section className="bg-gradient-to-b from-brand-soft/60 to-transparent">
        <div className="mx-auto max-w-4xl px-4 pb-12 pt-16 text-center">
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            Finde die richtige Immobilie — <span className="text-brand">und wisse, ob du sie dir leisten kannst.</span>
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-muted">Beschreibe in eigenen Worten, was du suchst und wie deine finanzielle Situation aussieht.</p>
          <IntentBox />
        </div>
      </section>
      <section className="mx-auto grid max-w-6xl gap-4 px-4 py-10 sm:grid-cols-3">
        {PILLARS.map(([t, d]) => (
          <div key={t} className="card">
            <h3 className="font-semibold">{t}</h3>
            <p className="mt-1 text-sm text-muted">{d}</p>
          </div>
        ))}
      </section>
      <section className="mx-auto flex max-w-6xl flex-wrap gap-3 px-4 pb-16">
        <Link href="/finanzierung" className="btn">Finanzierung rechnen</Link>
        <Link href="/suche?tx=buy" className="btn-ghost">Kaufen</Link>
        <Link href="/suche?tx=rent" className="btn-ghost">Mieten</Link>
        <Link href="/mieten-oder-kaufen" className="btn-ghost">Mieten oder kaufen?</Link>
      </section>
    </div>
  );
}
