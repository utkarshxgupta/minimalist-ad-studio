"use client";

import { useRef, useState } from "react";
import { toPng } from "html-to-image";
import { Artboard } from "@/components/Artboard";
import { FindingList, HighlightedCopy } from "@/components/Findings";
import { ScorePanel, VerdictBadge } from "@/components/Verdict";
import { CATALOGUE, productUrl } from "@/lib/generator/catalogue";
import { DEFAULT_PLACEMENT, PLACEMENT_LIST, type PlacementId } from "@/lib/generator/placements";
import type { GenerationRun, PlacementRun } from "@/lib/generator";
import { decide } from "@/lib/generator/gate";
import { logOverride, readOverrides, type OverrideEntry } from "@/lib/overrides";

function adText(copy: { headline: string; subhead: string; body: string; cta: string; footnote: string; caption: string }): string {
  return [copy.headline, copy.subhead, copy.body, copy.cta, copy.footnote, copy.caption].filter(Boolean).join("\n");
}

export default function GeneratePage() {
  const [url, setUrl] = useState(productUrl(CATALOGUE[1].handle));
  const [angle, setAngle] = useState("");
  const [audience, setAudience] = useState("");
  const [placements, setPlacements] = useState<PlacementId[]>([DEFAULT_PLACEMENT]);
  const [backgroundMode, setBackgroundMode] = useState<"generated" | "plain">("generated");
  const [hint, setHint] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [run, setRun] = useState<GenerationRun | null>(null);
  const [active, setActive] = useState(0);
  const [shown, setShown] = useState(0);
  const [reason, setReason] = useState("");
  const [overrides, setOverrides] = useState<OverrideEntry[]>([]);

  const board = useRef<HTMLDivElement>(null);

  function togglePlacement(id: PlacementId) {
    setPlacements((prev) =>
      prev.includes(id) ? (prev.length === 1 ? prev : prev.filter((p) => p !== id)) : [...prev, id]
    );
  }

  async function generate() {
    setBusy(true);
    setError(null);
    setRun(null);
    setReason("");
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url, angle, audience, placements, background: backgroundMode, backgroundHint: hint }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Generation failed");
      const next = data as GenerationRun;
      setRun(next);
      setActive(0);
      setShown(next.placements[0]?.chosen ?? 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const current: PlacementRun | undefined = run?.placements[active];
  const attempt = current?.attempts[shown];
  const background = current?.background
    ? `data:${current.background.mimeType};base64,${current.background.data}`
    : undefined;

  // Recomputed for the attempt actually on screen, not taken from the run. The
  // marketer can page back to an earlier attempt, and a gate that describes a
  // different creative than the one being looked at is worse than no gate.
  const decision = attempt ? decide(attempt) : null;
  const canExport =
    decision?.export === "free" || (decision?.export === "override" && reason.trim().length >= 12);

  async function exportPng() {
    if (!board.current || !run || !current || !attempt) return;

    if (decision?.export === "override") {
      logOverride({
        at: new Date().toISOString(),
        product: `${run.facts.name} (${current.placement.label})`,
        verdict: attempt.score.verdict,
        rules: attempt.score.findings.map((f) => f.ruleId),
        reason,
        copy: adText(attempt.copy),
      });
      setOverrides(readOverrides());
    }

    const png = await toPng(board.current, {
      width: current.placement.width,
      height: current.placement.height,
      pixelRatio: 1,
      cacheBust: true,
    });
    const a = document.createElement("a");
    a.href = png;
    a.download = `${run.facts.name.replace(/\W+/g, "-").toLowerCase()}-${current.placement.id}.png`;
    a.click();
  }

  return (
    <div className="mx-auto grid max-w-[1500px] gap-8 px-6 py-8 lg:grid-cols-[360px_1fr]">
      <section className="space-y-4">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Generate</h1>
          <p className="mt-1 text-sm text-muted">
            A product URL in, scored creatives out. Every claim traces to the product page, and each
            placement is written and scored on its own rather than rescaled from one master.
          </p>
        </div>

        <div>
          <label className="label" htmlFor="url">
            Product URL
          </label>
          <input id="url" className="field mt-1" value={url} onChange={(e) => setUrl(e.target.value)} />
          <div className="mt-2 flex flex-wrap gap-1">
            {CATALOGUE.map((p) => (
              <button
                key={p.handle}
                onClick={() => setUrl(productUrl(p.handle))}
                className="border border-line bg-card px-2 py-1 text-[11px] hover:border-ink"
              >
                {p.name.replace(" Face Serum", "").replace(" Sunscreen", "")}
              </button>
            ))}
          </div>
        </div>

        <fieldset className="border border-line bg-card p-3">
          <legend className="label px-1">Placements</legend>
          <div className="space-y-1.5">
            {PLACEMENT_LIST.map((p) => (
              <label key={p.id} className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={placements.includes(p.id)}
                  onChange={() => togglePlacement(p.id)}
                />
                <span>
                  {p.label}
                  <span className="block font-mono text-[10px] text-muted">
                    {p.width}x{p.height} · {p.channel} · under {p.canvasWordLimit} words on canvas
                    {p.hasCaption ? " + caption" : ""}
                  </span>
                </span>
              </label>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted">
            A feed ad is scrolled past and a listing image is studied, so they get different copy, not
            the same copy at a different size. Substantiation takes words, which makes the short
            formats the ones where evidence gets squeezed out.
          </p>
        </fieldset>

        <div className="grid gap-3">
          <div>
            <label className="label" htmlFor="angle">
              Angle (optional)
            </label>
            <input
              id="angle"
              className="field mt-1"
              placeholder="monsoon breakouts"
              value={angle}
              onChange={(e) => setAngle(e.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="audience">
              Audience (optional)
            </label>
            <input
              id="audience"
              className="field mt-1"
              placeholder="first-time actives buyers, 22 to 30"
              value={audience}
              onChange={(e) => setAudience(e.target.value)}
            />
          </div>
        </div>

        <fieldset className="border border-line bg-card p-3">
          <legend className="label px-1">Background</legend>
          <div className="flex gap-4 text-sm">
            {(["generated", "plain"] as const).map((mode) => (
              <label key={mode} className="flex items-center gap-1.5">
                <input type="radio" checked={backgroundMode === mode} onChange={() => setBackgroundMode(mode)} />
                {mode}
              </label>
            ))}
          </div>
          {backgroundMode === "generated" && (
            <>
              <input
                className="field mt-2"
                placeholder="warm terracotta ledge, morning light"
                value={hint}
                onChange={(e) => setHint(e.target.value)}
              />
              <p className="mt-2 text-xs text-muted">
                The product photograph is never generated. Only the environment behind it is, at each
                placement&apos;s own aspect ratio, and the result is scored: a backdrop of dewy glowing
                skin is an efficacy claim made in pixels.
              </p>
            </>
          )}
        </fieldset>

        <button
          onClick={generate}
          disabled={busy}
          className="w-full bg-ink px-4 py-2.5 text-sm font-medium text-paper disabled:opacity-50"
        >
          {busy ? `Generating ${placements.length} placement${placements.length === 1 ? "" : "s"}...` : "Generate"}
        </button>

        {error && <p className="border-l-2 border-block pl-3 text-sm text-block">{error}</p>}

        {run && (
          <div className="border border-line bg-card p-3">
            <div className="label">Facts</div>
            <p className="mt-1 text-sm">
              {run.factsSource === "live" ? (
                <>Read live from the product page.</>
              ) : (
                <>
                  <span className="text-warn">Committed snapshot</span>, captured{" "}
                  {new Date(run.fetchedAt).toLocaleDateString()}. {run.fallbackReason}
                </>
              )}
            </p>
            <ul className="mt-2 space-y-0.5 font-mono text-[11px] text-muted">
              {run.facts.actives.map((a) => (
                <li key={a.ingredient}>
                  {a.ingredient} {a.concentration}
                </li>
              ))}
              <li>{run.facts.statedBenefits.length} stated benefits</li>
            </ul>
            {run.factWarnings.map((w) => (
              <p key={w} className="mt-2 text-xs text-warn">
                {w}
              </p>
            ))}
          </div>
        )}

        {overrides.length > 0 && <OverrideLog entries={overrides} />}
      </section>

      <section className="space-y-6">
        {!run && !busy && (
          <div className="flex h-72 items-center justify-center border border-dashed border-line text-sm text-muted">
            Nothing generated yet.
          </div>
        )}

        {run && current && attempt && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              {run.placements.map((p, i) => (
                <button
                  key={p.placement.id}
                  onClick={() => {
                    setActive(i);
                    setShown(p.chosen);
                    setReason("");
                  }}
                  className={`flex items-center gap-2 border px-2.5 py-1.5 text-xs ${
                    i === active ? "border-ink bg-card" : "border-line"
                  }`}
                >
                  {p.placement.label}
                  <VerdictBadge verdict={p.attempts[p.chosen].score.verdict} size="sm" />
                </button>
              ))}
              <span className="ml-auto font-mono text-[11px] text-muted">
                {run.summary.free} clean · {run.summary.override} need an override · {run.summary.blocked} blocked
              </span>
            </div>

            <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
              <div>
                {decision?.render ? (
                  <Artboard
                    ref={board}
                    copy={attempt.copy}
                    facts={run.facts}
                    placement={current.placement}
                    background={background}
                    previewWidth={380}
                  />
                ) : (
                  <BlockedPanel attempt={attempt} />
                )}

                <div className="mt-3 flex items-center gap-3">
                  <button
                    onClick={exportPng}
                    disabled={!canExport}
                    className="bg-ink px-3 py-2 text-sm text-paper disabled:opacity-40"
                  >
                    Export PNG
                  </button>
                  <span className="text-xs text-muted">
                    {decision?.export === "blocked" && "Export disabled. This escalates to a human."}
                    {decision?.export === "override" && "Export requires a logged reason."}
                    {decision?.export === "free" && "Clean. Exports freely."}
                  </span>
                </div>

                {decision?.export === "override" && (
                  <textarea
                    className="field mt-2"
                    rows={2}
                    placeholder="Why are you overriding? This is logged against the ad."
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                )}

                {attempt.copy.caption && (
                  <div className="mt-4 border border-line bg-card p-3">
                    <div className="label">Post caption, not on the image</div>
                    <p className="mt-1 whitespace-pre-wrap text-sm">{attempt.copy.caption}</p>
                  </div>
                )}
              </div>

              <div className="space-y-4">
                <ScorePanel score={attempt.score} />

                {current.attempts.length > 1 && (
                  <div>
                    <div className="label">Attempts</div>
                    <div className="mt-1 flex gap-2">
                      {current.attempts.map((a, i) => (
                        <button
                          key={i}
                          onClick={() => setShown(i)}
                          className={`flex items-center gap-1.5 border px-2 py-1 text-xs ${
                            i === shown ? "border-ink" : "border-line"
                          }`}
                        >
                          {i + 1}
                          <VerdictBadge verdict={a.score.verdict} size="sm" />
                          {i === current.chosen && <span className="text-[10px] text-muted">shown</span>}
                        </button>
                      ))}
                    </div>
                    <p className="mt-1.5 text-xs text-muted">
                      WARN findings are looped, capped at two retries. A retry is told what was wrong,
                      never shown the rejected sentence. BLOCK findings are never looped at all.
                    </p>
                  </div>
                )}

                <div>
                  <div className="label">Findings</div>
                  <div className="mt-2">
                    <FindingList findings={attempt.score.findings} />
                  </div>
                </div>

                {attempt.ungrounded.length > 0 && (
                  <div className="border border-warn/40 bg-warn/5 p-3">
                    <div className="label">Ungrounded claims</div>
                    <p className="mt-1 text-xs text-muted">
                      The generator could not point at supporting text for these. Not a rule violation,
                      so not a finding, but a human should look.
                    </p>
                    <ul className="mt-2 space-y-1 text-sm">
                      {attempt.ungrounded.map((u, i) => (
                        <li key={i}>&quot;{u.claim}&quot;</li>
                      ))}
                    </ul>
                  </div>
                )}

                {attempt.overLength.length > 0 && (
                  <div>
                    <div className="label">Layout notes</div>
                    <ul className="mt-1 space-y-0.5 text-xs text-muted">
                      {attempt.overLength.map((o, i) => (
                        <li key={i}>{o}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {current.backgroundError && (
                  <p className="text-xs text-warn">Background generation failed: {current.backgroundError}</p>
                )}
                {current.background && current.background.hint.rejected.length > 0 && (
                  <div>
                    <div className="label">Background hint, rejected terms</div>
                    <ul className="mt-1 space-y-0.5 text-xs text-muted">
                      {current.background.hint.rejected.map((r, i) => (
                        <li key={i}>
                          <span className="font-mono">{r.phrase}</span> {r.why}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>

            <ClaimTracePanel attempt={attempt} />
          </>
        )}
      </section>
    </div>
  );
}

/**
 * A BLOCK does not get a finished-looking creative. A composed artboard that
 * merely carries a warning is halfway to published: somebody screenshots it,
 * somebody else asks why not, and the argument the standard was written to end
 * starts again.
 */
function BlockedPanel({ attempt }: { attempt: PlacementRun["attempts"][number] }) {
  return (
    <div className="border border-block/40 bg-block/5 p-5" style={{ width: 380, minHeight: 360 }}>
      <VerdictBadge verdict="BLOCK" />
      <h2 className="mt-3 text-base font-semibold">Not rendered as a finished creative.</h2>
      <p className="mt-1 text-sm text-muted">
        The copy below broke a BLOCK rule, so it is shown as text with the flagged spans marked. It is not
        composed, and it cannot be exported. The fix for a BLOCK is to drop the claim, not to rephrase it.
      </p>
      <div className="mt-4 border border-line bg-card p-3">
        <HighlightedCopy
          text={[
            attempt.copy.headline,
            attempt.copy.subhead,
            attempt.copy.body,
            attempt.copy.cta,
            attempt.copy.footnote,
            attempt.copy.caption,
          ]
            .filter(Boolean)
            .join("\n")}
          findings={attempt.score.findings}
        />
      </div>
    </div>
  );
}

function ClaimTracePanel({ attempt }: { attempt: PlacementRun["attempts"][number] }) {
  if (attempt.copy.claimTrace.length === 0) return null;
  return (
    <div>
      <div className="label">Claim trace</div>
      <p className="mt-1 text-xs text-muted">
        Every claim the generator made, and the product-page text it came from. Verified in code: the
        supporting text must appear verbatim in the facts.
      </p>
      <table className="mt-2 w-full border-collapse text-sm">
        <tbody>
          {attempt.copy.claimTrace.map((t, i) => {
            const bad = attempt.ungrounded.some((u) => u.claim === t.claim);
            return (
              <tr key={i} className="border-t border-line align-top">
                <td className="w-1/3 py-2 pr-4">{bad ? <span className="text-block">{t.claim}</span> : t.claim}</td>
                <td className="py-2 text-muted">{t.supportedBy}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function OverrideLog({ entries }: { entries: OverrideEntry[] }) {
  return (
    <div className="border border-line bg-card p-3">
      <div className="label">Override log</div>
      <p className="mt-1 text-xs text-muted">
        The artefact that replaces the Slack thread. Stored in this browser for the prototype.
      </p>
      <ul className="mt-2 space-y-2">
        {entries.slice(0, 5).map((e, i) => (
          <li key={i} className="border-t border-line pt-2 text-xs">
            <div className="flex items-center gap-2">
              <VerdictBadge verdict={e.verdict} size="sm" />
              <span className="font-mono text-[10px] text-muted">{e.rules.join(", ") || "no rules"}</span>
            </div>
            <p className="mt-1">{e.reason}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
