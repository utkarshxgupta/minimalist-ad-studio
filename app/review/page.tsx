"use client";

import { useState } from "react";
import { FindingList, HighlightedCopy } from "@/components/Findings";
import { ScorePanel } from "@/components/Verdict";
import type { ScoreResult } from "@/lib/types";

/**
 * The review surface. Paste an ad, get a verdict that cites rules.
 *
 * Same scorer, same rulebook, same call the generator gates itself with. The
 * point of the whole project is that these two surfaces cannot disagree,
 * because there is only one standard and it is in version control.
 */

const EXAMPLES: { label: string; text: string }[] = [
  {
    label: "Competitor, real",
    text: "10% Vitamin C + Glutathione Brightening Serum | Glow in 3 Days*",
  },
  {
    label: "Minimalist, real",
    text: "93% subjects saw significant reduction in active acne in 4 weeks",
  },
  {
    label: "Sounds risky, is fine",
    text: "Best used at night, after cleansing. Patch test before first use.",
  },
];

export default function ReviewPage() {
  const [text, setText] = useState("");
  const [facts, setFacts] = useState("");
  const [showFacts, setShowFacts] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ScoreResult | null>(null);

  async function score() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/score", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text, factsContext: facts.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Scoring failed");
      setResult(data as ScoreResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto grid max-w-[1400px] gap-8 px-6 py-8 lg:grid-cols-2">
      <section className="space-y-4">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Review</h1>
          <p className="mt-1 text-sm text-muted">
            Paste ad copy. Every finding cites a rule from the versioned standard, quotes the exact words
            it is objecting to, and says what to do instead.
          </p>
        </div>

        <textarea
          className="field font-mono"
          rows={10}
          placeholder="Paste the ad copy here."
          value={text}
          onChange={(e) => setText(e.target.value)}
        />

        <div className="flex flex-wrap gap-1">
          {EXAMPLES.map((e) => (
            <button
              key={e.label}
              onClick={() => setText(e.text)}
              className="border border-line bg-card px-2 py-1 text-[11px] hover:border-ink"
            >
              {e.label}
            </button>
          ))}
        </div>

        <div>
          <button className="label underline underline-offset-2" onClick={() => setShowFacts(!showFacts)}>
            {showFacts ? "Hide" : "Add"} product facts
          </button>
          {showFacts && (
            <>
              <textarea
                className="field mt-2 font-mono"
                rows={5}
                placeholder='{ "name": "Salicylic Acid 2% Face Serum", "actives": [...] }'
                value={facts}
                onChange={(e) => setFacts(e.target.value)}
              />
              <p className="mt-1 text-xs text-muted">
                Optional. Rules that need facts to be checkable are withheld from the prompt entirely when
                this is empty, rather than being run with an instruction not to guess. Asking a model
                politely to skip a check is not a control.
              </p>
            </>
          )}
        </div>

        <button
          onClick={score}
          disabled={busy || text.trim().length === 0}
          className="w-full bg-ink px-4 py-2.5 text-sm font-medium text-paper disabled:opacity-50"
        >
          {busy ? "Scoring..." : "Score against the standard"}
        </button>

        {error && <p className="border-l-2 border-block pl-3 text-sm text-block">{error}</p>}
      </section>

      <section className="space-y-5">
        {!result && !busy && (
          <div className="flex h-72 items-center justify-center border border-dashed border-line text-sm text-muted">
            Nothing scored yet.
          </div>
        )}

        {result && (
          <>
            <ScorePanel score={result} />

            <div className="border border-line bg-card p-3">
              <div className="label">The copy, with flagged spans marked</div>
              <div className="mt-2">
                <HighlightedCopy text={text} findings={result.findings} />
              </div>
            </div>

            <div>
              <div className="label">Findings</div>
              <div className="mt-2">
                <FindingList findings={result.findings} />
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
