"use client";

import { useRef, useState } from "react";
import { toPng } from "html-to-image";
import { Artboard } from "@/components/Artboard";
import { FindingList, HighlightedCopy } from "@/components/Findings";
import { ScorePanel, VerdictBadge } from "@/components/Verdict";
import { CATALOGUE, productUrl } from "@/lib/generator/catalogue";
import { DEFAULT_PLACEMENT, PLACEMENT_LIST, type PlacementId } from "@/lib/generator/placements";
import { ARCHETYPES, DEFAULT_ARCHETYPE, tooWordyFor, type Archetype } from "@/lib/generator/archetypes";
// The scorer's own definition of the ad text, not a second one written for the
// browser. The local copy this replaced had already fallen behind: it did not
// know about the checklist, so a finding quoting a checklist bullet found
// nothing to highlight and rendered as unmarked text.
import { adText } from "@/lib/generator/ad-text";
import type { GenerationRun, Mode, PlacementRun } from "@/lib/generator";
import { decide } from "@/lib/generator/gate";
import { logOverride, readOverrides, type OverrideEntry } from "@/lib/overrides";

export default function GeneratePage() {
  const [url, setUrl] = useState(productUrl(CATALOGUE[1].handle));
  const [angle, setAngle] = useState("");
  const [audience, setAudience] = useState("");
  const [placements, setPlacements] = useState<PlacementId[]>([DEFAULT_PLACEMENT]);
  const [mode, setMode] = useState<Mode>("photographic");
  const [archetype, setArchetype] = useState<Archetype>(DEFAULT_ARCHETYPE);
  const [hint, setHint] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [run, setRun] = useState<GenerationRun | null>(null);
  const [active, setActive] = useState(0);
  const [shown, setShown] = useState(0);
  const [reason, setReason] = useState("");
  const [overrides, setOverrides] = useState<OverrideEntry[]>([]);

  const board = useRef<HTMLDivElement>(null);

  const tightForArchetype =
    mode === "creative"
      ? PLACEMENT_LIST.filter((p) => placements.includes(p.id) && tooWordyFor(archetype, p.canvasWordLimit))
      : [];

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
        body: JSON.stringify({ url, angle, audience, placements, mode, archetype, propHint: hint }),
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
  // The frame belongs to the placement, not the run: each aspect gets its own
  // composition, so paging between placements changes the picture too.
  const scene = current?.scene;
  const sceneImage = scene ? `data:${scene.mimeType};base64,${scene.data}` : undefined;

  // Recomputed for the attempt actually on screen, not taken from the run. The
  // marketer can page back to an earlier attempt, and a gate that describes a
  // different creative than the one being looked at is worse than no gate.
  const decision = attempt ? decide(attempt) : null;
  const canExport = decision?.export === "free" || (decision?.export === "override" && reason.trim().length >= 12);

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

    // html-to-image clones the DOM for capture before webfonts are guaranteed
    // ready, which once let the export compute a different text width than the
    // live preview and wrap a badge that was one line on screen. Waiting here
    // closes that race; nowrap on single-line elements in the Artboard closes
    // it a second way, so the two do not depend on each other to be enough.
    await document.fonts.ready;

    // And wait for the product photograph, for the same class of reason. The
    // artboard reads the photo's own backdrop colour once the image has
    // decoded and repaints the canvas to match; capture before that lands and
    // the exported PNG has the fallback canvas behind a product photograph
    // that does not sit on it, which is the visible rectangle all over again.
    // Observed while screenshotting the artboard headlessly, where the capture
    // really was that fast. A person clicking Export rarely is, but "rarely"
    // is how the last export-only defect got shipped.
    // addEventListener, not `img.onload =`. Assigning the property replaces
    // whatever handler is already there, and the artboard's own load handler
    // is what reads the photograph's backdrop and divides it out. The first
    // version of this guard clobbered it, so on a slow image the packshot
    // silently kept its studio sweep: a wait added to make the export more
    // faithful was quietly making it less so.
    //
    // The timeout matters as much. A load event that already fired leaves a
    // listener that never runs, and an export that hangs forever is worse than
    // one that occasionally captures a frame early.
    const photos = Array.from(board.current.querySelectorAll("img"));
    await Promise.all(
      photos.map(
        (img) =>
          new Promise((done) => {
            if (img.complete) return done(null);
            const finish = () => done(null);
            img.addEventListener("load", finish, { once: true });
            img.addEventListener("error", finish, { once: true });
            setTimeout(finish, 3000);
          })
      )
    );
    // Two frames, so React has flushed the state the load handler set.
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);

    // No cacheBust. It appends a query string to every URL html-to-image
    // inlines, which is harmless on the image proxy and corrupting on a
    // `data:` URL, and the packshot is now a data URL whenever its studio
    // sweep has been divided out. With it on, the export simply never
    // finished: no error, no timeout, just a promise that never settled.
    const png = await toPng(board.current, {
      width: current.placement.width,
      height: current.placement.height,
      pixelRatio: 1,
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
          <legend className="label px-1">Mode</legend>
          <div className="flex gap-4 text-sm">
            {(["photographic", "creative"] as const).map((m) => (
              <label key={m} className="flex items-center gap-1.5">
                <input type="radio" checked={mode === m} onChange={() => setMode(m)} />
                {m}
              </label>
            ))}
          </div>

          {mode === "photographic" ? (
            <p className="mt-2 text-xs text-muted">
              The real product photo, on a canvas taken from the photograph&apos;s own studio ground so
              there is no seam, with the copy typeset over it. No image model touches the picture, so
              nothing in the frame can be a fact the product page did not state.
            </p>
          ) : (
            <>
              <div className="label mt-3">Content block</div>
              <select
                className="field mt-1"
                value={archetype}
                onChange={(e) => setArchetype(e.target.value as Archetype)}
              >
                {ARCHETYPES.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                  </option>
                ))}
              </select>
              <p className="mt-2 text-xs text-muted">
                {ARCHETYPES.find((a) => a.id === archetype)?.note}
              </p>

              {tightForArchetype.length > 0 && (
                // Said before the call, not after. The generator reports the
                // overflow either way, as a layout note that does not gate
                // export, but a marketer should not spend a minute of model
                // time to learn something the word budgets already knew.
                <p className="mt-2 border-l-2 border-warn pl-2 text-xs text-muted">
                  This block runs long, and {tightForArchetype.map((p) => p.label).join(", ")} will come
                  back flagged as over-length. It belongs on the PDP listing image, which has the room.
                </p>
              )}

              <div className="label mt-3">Art direction</div>
              <input
                className="field mt-1"
                placeholder="glass droplets, molecular motif..."
                value={hint}
                onChange={(e) => setHint(e.target.value)}
              />
              <p className="mt-2 text-xs text-muted">
                The real product photo goes to the image model, which composes a finished frame with the
                product inside a scene, one per placement at its own aspect ratio. The copy is still
                typeset over it here, never drawn by the image model, so every word is still scored.
              </p>
              <p className="mt-2 border-l-2 border-warn pl-2 text-xs text-muted">
                The pack in this mode is redrawn by a model, not photographed, so it can alter a label
                or a concentration in a way that looks entirely normal. A frame carrying invented text
                is discarded outright, and what survives can never export freely: creative mode always
                costs a logged human override. Photographic mode is the default for that reason.
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
            {current?.sceneError && (
              <p className="mt-2 text-xs text-warn">Generated frame: {current.sceneError}</p>
            )}
            {scene && (current?.sceneAttempts ?? 1) > 1 && (
              <p className="mt-2 text-xs text-muted">
                {current?.sceneAttempts} frames were generated for this placement. The earlier ones
                misspelled text printed on the real pack and were discarded.
              </p>
            )}
            {scene && scene.hint.rejected.length > 0 && (
              <div className="mt-2">
                <div className="label">Art direction, rejected terms</div>
                <ul className="mt-1 space-y-0.5 text-xs text-muted">
                  {scene.hint.rejected.map((r, i) => (
                    <li key={i}>
                      <span className="font-mono">{r.phrase}</span> {r.why}
                    </li>
                  ))}
                </ul>
              </div>
            )}
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
                    sceneImage={sceneImage}
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

                {(attempt.copy.caption || attempt.copy.cta) && (
                  <div className="mt-4 border border-line bg-card p-3">
                    <div className="label">Ad fields, not on the image</div>
                    {attempt.copy.caption && (
                      <p className="mt-1 whitespace-pre-wrap text-sm">{attempt.copy.caption}</p>
                    )}
                    {attempt.copy.cta && (
                      <p className="mt-2 text-sm">
                        <span className="text-muted">Call-to-action button: </span>
                        <span className="font-medium">{attempt.copy.cta}</span>
                      </p>
                    )}
                    <p className="mt-2 text-xs text-muted">
                      Meta draws the call-to-action button itself, under the image, from its own fixed
                      list. It is set in Ads Manager alongside the caption, so it is not painted onto
                      the creative and does not spend the canvas word budget.
                    </p>
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
