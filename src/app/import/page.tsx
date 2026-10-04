import { CSV_TEMPLATE_COLUMNS } from "@/lib/listings/ingest";
import { ImportForm } from "./ImportForm";

export const metadata = { title: "Angebote importieren — ImmoKnauer" };

export default function ImportPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <h1 className="text-3xl font-bold tracking-tight">Angebote importieren</h1>
      <div className="card space-y-2 text-sm">
        <p>Nur Daten, die du rechtmäßig verwenden darfst: eigene Angebote, Partner-Feeds, lizenzierte APIs. Kein Scraping fremder Portale.</p>
        <p>Pipeline: Rohdaten → Normalisierung → Validierung → Geodaten → Anreicherung → Dublettenerkennung → kanonische Immobilie → Suchindex.</p>
        <details>
          <summary className="cursor-pointer font-medium">CSV-Spalten ({CSV_TEMPLATE_COLUMNS.length})</summary>
          <code className="mt-2 block break-words text-xs">{CSV_TEMPLATE_COLUMNS.join(";")}</code>
          <p className="mt-2 text-xs text-muted">Trennzeichen ; oder , · Zahlen im deutschen Format erlaubt · Ausstattung als ja/nein · state als ISO-Code (z. B. DE-BY) · images mit | getrennt.</p>
        </details>
      </div>
      <ImportForm />
    </div>
  );
}
