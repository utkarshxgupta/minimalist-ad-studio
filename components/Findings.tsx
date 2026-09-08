import Link from "next/link";
import type { Finding } from "@/lib/types";
import { VerdictBadge } from "./Verdict";

/**
 * Every finding shows four things a reviewer needs and a score cannot give
 * them: which rule, what exact words, why, and what to do instead. The layer
 * tag is there so they know how much to trust it. Layer 1 is a lexicon match
 * and reruns identically forever; layer 2 is a judgment.
 */
export function FindingList({ findings }: { findings: Finding[] }) {
  if (findings.length === 0) {
    return (
      <p className="text-sm text-muted">
        No findings. Every active rule ran and none matched.
      </p>
    );
  }

  const ordered = [...findings].sort((a, b) =>
    a.severity === b.severity ? 0 : a.severity === "BLOCK" ? -1 : 1
  );

  return (
    <ul className="space-y-3">
      {ordered.map((f, i) => (
        <li key={`${f.ruleId}-${i}`} className="border border-line bg-card p-3">
          <div className="flex flex-wrap items-center gap-2">
            <VerdictBadge verdict={f.severity} size="sm" />
            <Link
              href={`/standard#${f.ruleId}`}
              target="_blank"
              className="font-mono text-xs font-medium underline decoration-dotted underline-offset-2 hover:decoration-solid"
              title="Open this rule in the standard"
            >
              {f.ruleId}
            </Link>
            <span className="font-mono text-[10px] text-muted">
              {f.layer === "deterministic" ? "layer 1 · lexicon" : "layer 2 · judgment"}
              {f.target === "image" ? " · image" : ""}
            </span>
          </div>

          <p className="mt-2 text-sm">
            {f.target === "image" ? (
              <span className="text-muted">In the generated background: </span>
            ) : null}
            <span className={f.target === "image" ? "" : "bg-warn/15 px-1"}>
              {f.target === "image" ? f.span : `"${f.span}"`}
            </span>
          </p>

          <p className="mt-1.5 text-sm text-muted">{f.explanation}</p>
          <p className="mt-1.5 text-sm">
            <span className="label">fix</span> {f.suggestedFix}
          </p>
        </li>
      ))}
    </ul>
  );
}

/**
 * The copy with its flagged spans marked in place. Findings carry verified
 * offsets, so this is the same span the rule matched, not a second search that
 * could disagree with it.
 */
export function HighlightedCopy({ text, findings }: { text: string; findings: Finding[] }) {
  const spans = findings
    .filter((f) => f.target === "text" && f.start !== undefined && f.end !== undefined)
    .map((f) => ({ start: f.start!, end: f.end!, severity: f.severity }))
    .sort((a, b) => a.start - b.start);

  const pieces: React.ReactNode[] = [];
  let cursor = 0;

  for (const [i, s] of spans.entries()) {
    // Two rules can match overlapping words. Marking both would nest the
    // highlights and garble the text, so the first one wins.
    if (s.start < cursor) continue;
    if (s.start > cursor) pieces.push(text.slice(cursor, s.start));
    pieces.push(
      <mark
        key={i}
        className={`${s.severity === "BLOCK" ? "bg-block/20" : "bg-warn/20"} px-0.5 text-ink`}
      >
        {text.slice(s.start, s.end)}
      </mark>
    );
    cursor = s.end;
  }
  pieces.push(text.slice(cursor));

  return <p className="whitespace-pre-wrap text-sm leading-relaxed">{pieces}</p>;
}
