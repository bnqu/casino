import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "ImmoKnauer — Finde die richtige Immobilie und wisse, ob sie passt",
  description: "Property search with financial reality: true monthly costs, affordability, financing and transparent property intelligence for Germany.",
};

const NAV = [
  ["/suche", "Suche"],
  ["/finanzierung", "Finanzierung"],
  ["/mieten-oder-kaufen", "Mieten vs. Kaufen"],
  ["/investor", "Investor"],
  ["/datenquellen", "Datenquellen"],
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body className="min-h-screen antialiased">
        <header className="sticky top-0 z-[1000] border-b border-line bg-white/90 backdrop-blur">
          <div className="mx-auto flex max-w-7xl items-center gap-6 px-4 py-3">
            <Link href="/" className="text-lg font-bold tracking-tight">
              immo<span className="text-brand">knauer</span>
            </Link>
            <nav className="flex gap-4 overflow-x-auto text-sm text-muted">
              {NAV.map(([href, label]) => (
                <Link key={href} href={href} className="whitespace-nowrap hover:text-ink">
                  {label}
                </Link>
              ))}
            </nav>
          </div>
        </header>
        <main>{children}</main>
        <footer className="mx-auto max-w-7xl px-4 py-10 text-xs text-muted">
          Alle Berechnungen sind unverbindliche Schätzungen — keine Kreditentscheidung, keine Rechts- oder Steuerberatung. Datenquellen und
          Stand siehe <Link href="/datenquellen" className="underline">Datenquellen</Link>.
        </footer>
      </body>
    </html>
  );
}
