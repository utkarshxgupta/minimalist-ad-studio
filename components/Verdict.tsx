import type { ScoreResult, Verdict } from "@/lib/types";

const STYLE: Record<Verdict, string> = {
  BLOCK: "bg-block text-white",
  WARN: "bg-warn text-white",
  PASS: "bg-pass text-white",
};

export function VerdictBadge({ verdict, size = "md" }: { verdict: Verdict; size?: "sm" | "md" }) {
  return (
    <span
      className={`inline-flex items-center rounded-sm font-mono font-medium tracking-wide ${STYLE[verdict]} ${
        size === "sm" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-1 text-xs"
      }`}
    >
      {verdict}
    </span>
  );
}

/**
 * Scores are shown next to the findings and never alone. A single number tells
 * a marketer nothing actionable and invites arguing with the number instead of
 * with the rule, which is the failure this tool exists to end.
 */
export function ScorePanel({ score }: { score: ScoreResult }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <VerdictBadge verdict={score.verdict} />
        <div className="flex gap-4 font-mono text-xs text-muted">
          {(["policy", "tone", "language"] as const).map((d) => (
            <span key={d}>
              {d} {score.dimensionScores[d] ?? 100}
            </span>
          ))}
        </div>
      </div>

      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 font-mono text-[11px] text-muted">
        <dt>rulebook</dt>
        <dd>{score.meta.rulebookVersion}</dd>
        <dt>model</dt>
        <dd>{score.meta.model}</dd>
        {score.meta.droppedFindings > 0 && (
          <>
            <dt>dropped</dt>
            <dd>
              {score.meta.droppedFindings} model finding{score.meta.droppedFindings === 1 ? "" : "s"} quoted
              text that was not in the ad
            </dd>
          </>
        )}
        {score.meta.unverifiedRulesApplied > 0 && (
          <>
            <dt>inert</dt>
            <dd>{score.meta.unverifiedRulesApplied} rules await source verification and did not run</dd>
          </>
        )}
      </dl>

      {score.meta.dimensionsFailed.length > 0 && (
        <p className="border-l-2 border-block pl-3 text-sm text-block">
          The {score.meta.dimensionsFailed.join(" and ")} check did not run. The verdict is forced to BLOCK:
          an unrun compliance check must never read as a pass.
        </p>
      )}
    </div>
  );
}
