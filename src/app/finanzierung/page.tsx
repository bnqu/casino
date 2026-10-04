import { mortgageRateProvider } from "@/lib/data/providers/registry";
import { FinancingCalculator } from "./FinancingCalculator";

export const metadata = { title: "Immobilienfinanzierung berechnen — ImmoKnauer" };

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const rate = await mortgageRateProvider.getCurrentRate({ fixedYears: 10 });
  const n = (k: string) => (sp[k] && Number.isFinite(Number(sp[k])) ? Number(sp[k]) : undefined);
  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <h1 className="text-3xl font-bold tracking-tight">Immobilienfinanzierung</h1>
      <p className="mt-1 max-w-2xl text-muted">
        Kaufnebenkosten, Kreditrate, Tilgungsplan, Anschlussfinanzierung und dein realistisches Budget — transparent gerechnet.
      </p>
      <FinancingCalculator
        rate={rate}
        initial={{ price: n("price"), savings: n("savings"), netIncome: n("income"), state: sp.state, monthlyBudget: n("monthly") }}
      />
    </div>
  );
}
