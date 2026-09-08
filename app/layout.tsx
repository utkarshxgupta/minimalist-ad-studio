import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono, Figtree } from "next/font/google";
import { loadRulebook } from "@/lib/standard/loader";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

/**
 * The face the creatives are set in.
 *
 * beminimalist.co sets everything in ProximaNovaRegular and ProximaNovaBold,
 * confirmed by reading the live stylesheet, not by guessing from a screenshot.
 * Proxima Nova is licensed commercially and cannot be redistributed in this
 * repo, so the artboard's stack names the real face first and falls back to
 * Figtree, the closest free geometric sans by x-height, aperture and weight
 * range. On a machine where the brand licence is installed, the creative and
 * the export both render in the actual brand font with no code change, because
 * html-to-image captures through the browser's own font stack.
 *
 * Recorded rather than silently substituted: a creative set in a stand-in face
 * is a creative a brand designer will reject, and they should be able to see
 * exactly which face they are looking at.
 */
const brand = Figtree({ variable: "--font-brand", subsets: ["latin"], weight: ["400", "500", "600", "700"] });

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
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} ${brand.variable} h-full antialiased`}>
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
