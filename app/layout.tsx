import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import { loadRulebook } from "@/lib/standard/loader";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Minimalist Ad Studio",
  description: "One codified brand and legal standard, applied at generation time and at review time.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  // Read once, on the server. The rulebook version belongs in the chrome of
  // both surfaces: a verdict without a version is not reproducible, and
  // "which version of the rules said no" is the first question in any appeal.
  const book = loadRulebook();

  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <header className="border-b border-line">
          <div className="mx-auto flex max-w-[1400px] items-baseline gap-6 px-6 py-3">
            <span className="text-sm font-semibold tracking-tight">Minimalist Ad Studio</span>
            <nav className="flex gap-4 text-sm">
              <Link href="/" className="hover:underline underline-offset-4">
                Generate
              </Link>
              <Link href="/review" className="hover:underline underline-offset-4">
                Review
              </Link>
            </nav>
            <span className="ml-auto font-mono text-xs text-muted">
              rulebook {book.version} · {book.active.length} rules
              {book.unverified.length > 0 ? ` · ${book.unverified.length} inert` : ""}
            </span>
          </div>
        </header>
        <main className="flex-1">{children}</main>
      </body>
    </html>
  );
}
