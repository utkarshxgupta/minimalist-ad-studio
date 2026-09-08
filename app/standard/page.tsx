import Link from "next/link";
import { loadRulebook } from "@/lib/standard/loader";
import { RuleCard } from "@/components/RuleCard";
import type { Dimension } from "@/lib/types";

/**
 * The rulebook, readable.
 *
 * The navbar has printed "rulebook 1.1.0 · 18 rules" since the first version
 * of this app, as a plain span with nowhere to click. That was defensible
 * right up until someone asked what the point of printing it was, and there
 * was no answer, because a reviewer who wants to read POLICY-003 in full, or
 * see the 17 rules that did not fire on a given ad, has always had to open
 * `standard/claims.rules.yaml` in the repo. For a tool whose entire thesis is
 * that the standard is the product and not a second opinion, a standard only
 * legible in a YAML file is not legible to the person the standard is for.
 *
 * This page is that file, rendered. Nothing here is computed beyond grouping
 * and sorting: every field is read straight off the same `Rule` objects the
 * scorer and the generator both run against, so this cannot drift from what
 * actually executes the way a written description could.
 */

const DIMENSION_ORDER: Dimension[] = ["policy", "tone", "language"];

const DIMENSION_LABEL: Record<Dimension, string> = {
  policy: "Policy — legal and platform claims",
  tone: "Tone — brand voice",
  language: "Language — translation and localisation",
};

export default function StandardPage() {
  const book = loadRulebook();

  return (
    <div className="mx-auto max-w-[900px] px-6 py-8">
      <div className="flex items-baseline justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">The standard</h1>
          <p className="mt-1 text-sm text-muted">
            Every rule the generator writes to and the reviewer scores against. One standard, in
            version control, applied at both surfaces — that is the whole premise of this project,
            so it has to be readable somewhere other than the YAML.
          </p>
        </div>
        <span className="whitespace-nowrap font-mono text-xs text-muted">
          v{book.version} · {book.active.length} active
          {book.unverified.length > 0 ? ` · ${book.unverified.length} inert` : ""}
        </span>
      </div>

      {book.unverified.length > 0 && (
        <div className="mt-4 border-l-2 border-warn pl-3 text-sm text-muted">
          {book.unverified.length} rule{book.unverified.length === 1 ? "" : "s"} loaded but not shown
          here: claiming external authority without a human having checked the source text against
          `standard/SOURCES.md` is exactly the failure this project exists to prevent, so they do not
          run and are not presented as if they did.
        </div>
      )}

      <div className="mt-8 space-y-10">
        {DIMENSION_ORDER.map((dim) => {
          const rules = book.active
            .filter((r) => r.dimension === dim)
            .sort((a, b) => a.id.localeCompare(b.id));
          if (rules.length === 0) return null;

          return (
            <section key={dim}>
              <h2 className="label">{DIMENSION_LABEL[dim]}</h2>
              <div className="mt-3 space-y-3">
                {rules.map((r) => (
                  <RuleCard key={r.id} rule={r} />
                ))}
              </div>
            </section>
          );
        })}
      </div>

      <p className="mt-10 text-xs text-muted">
        Sourced from <code className="font-mono">standard/claims.rules.yaml</code>. Regulatory
        citations are checked against original text before shipping — see{" "}
        <code className="font-mono">standard/SOURCES.md</code>. Substantiation for a specific
        product&apos;s stat claims lives separately, in{" "}
        <code className="font-mono">standard/claims-registry.yaml</code>, keyed to that product
        rather than to a rule.
      </p>

      <p className="mt-4 text-xs text-muted">
        <Link href="/" className="hover:underline underline-offset-4">
          ← Back to Generate
        </Link>
      </p>
    </div>
  );
}
