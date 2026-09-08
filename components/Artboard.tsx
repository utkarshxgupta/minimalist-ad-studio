"use client";

import { forwardRef } from "react";
import type { AdCopy, ProductFacts } from "@/lib/types";
import type { Placement } from "@/lib/generator/placements";
import { geometryFor, propAccentFor, type Box } from "@/lib/generator/artboard-geometry";

/**
 * The creative, at whatever size the placement asks for.
 *
 * Composed in HTML and CSS over the real product photograph. Invariant 5: the
 * pack, the label and the printed concentration are photographic. A generated
 * label would be a fabricated fact about a real product, which is the same
 * offence as a fabricated claim, only harder to spot.
 *
 * The canvas is a flat brand token, not a generated scene. An earlier version
 * generated a full photoreal backdrop and composited the product over it with
 * a feathered edge; the two photographs never shared a light source or colour
 * temperature, which read as a visible seam no amount of feathering fixed. The
 * brand's own banners are, on inspection, close to flat: a near-white or
 * near-black canvas, the product fully contained with margin, a soft contact
 * shadow. A flat colour cannot have a seam, so this composites onto one by
 * construction rather than by tuning.
 *
 * The product photo uses `object-fit: contain`, never `cover`. The previous
 * version forced a 1100x1600 portrait bottle into a short landscape strip and
 * cropped whatever did not fit, which is what "the cap is missing" was. A
 * contained image cannot be clipped; the geometry in `artboard-geometry.ts` is
 * sized so contain never has to shrink it much, and that module is what the
 * layout tests assert against.
 *
 * The photograph is loaded through our own image proxy. A cross-origin image
 * taints the canvas and the PNG export comes out with a hole where the product
 * should be.
 */

export interface ArtboardProps {
  copy: AdCopy;
  facts: ProductFacts;
  placement: Placement;
  /** Optional creative-mode prop graphic, as a data URI. Never the product itself. */
  propImage?: string;
  /** Preview width in CSS pixels. The captured node is always full size. */
  previewWidth?: number;
}

const INK = "#16130f";
const MUTED = "#4a423a";
/** Near-white, matching the brand's own canvas token observed on beminimalist.co. */
const CANVAS = "#f6f5f2";
/** One hairline weight for every rule drawn on the canvas. */
const HAIRLINE = "rgba(22,19,15,0.18)";

/**
 * The audience grid's cells, in render order. The label text is ours. Every
 * value is verbatim from the product page, filled in by `copy.ts` rather than
 * written by the model, so this component only decides where each one sits.
 */
const AUDIENCE_FIELDS: { key: keyof AdCopy["audienceGrid"]; label: string }[] = [
  { key: "concerns", label: "Concerns" },
  { key: "skinType", label: "Suitable for" },
  { key: "howToUse", label: "How to use" },
  { key: "timing", label: "When" },
];

function px(box: Box, W: number, H: number) {
  return {
    left: Math.round(box.x * W),
    top: Math.round(box.y * H),
    width: Math.round(box.w * W),
    height: Math.round(box.h * H),
  };
}

export const Artboard = forwardRef<HTMLDivElement, ArtboardProps>(function Artboard(
  { copy, facts, placement, propImage, previewWidth = 380 },
  ref
) {
  const { width: W, height: H, layout } = placement;
  const scale = previewWidth / W;
  const geo = geometryFor(placement);

  const hero = facts.heroImageUrl ? `/api/image-proxy?url=${encodeURIComponent(facts.heroImageUrl)}` : null;
  const active = facts.actives[0];

  // Type scales with canvas width, so an 1100px listing image and a 1080px
  // story share one design rather than two hand-tuned ones.
  const u = W / 1080;
  const pad = Math.round(48 * u);

  const productPx = px(geo.product, W, H);
  const propPx = px(propAccentFor(placement), W, H);
  const copyPx = px(geo.copy, W, H);
  const headlineSize = Math.round((layout === "tall" ? 74 : 56) * u);

  // On a tall format the copy column sits above the product, so a footnote
  // anchored to the canvas bottom would land on the bottle and be unreadable.
  // It rides with the copy instead. The disclaimer has to be legible to count.
  const footnoteInFlow = layout === "tall" || layout === "stacked";

  const footnoteStyle: React.CSSProperties = {
    fontSize: Math.round(14 * u),
    lineHeight: 1.35,
    color: "#6b6459",
  };

  // Single-line elements are pinned with nowrap rather than trusted to fit.
  // html-to-image clones the DOM for capture before webfonts are guaranteed
  // ready, so the export can compute a different natural width than the live
  // preview did and wrap a badge that was one line on screen. Verified by
  // decoding an actual export: the SPF pill wrapped "50" onto its own line
  // below the border in the PNG while the browser preview stayed on one line.
  const nowrap: React.CSSProperties = { whiteSpace: "nowrap" };

  // Only the fields the page actually stated get a cell, so a product whose
  // page states three of the four renders three cells rather than an empty
  // box captioned with a label. An odd count is padded with one blank cell so
  // the grid keeps all four of its edges.
  const statedAudience = AUDIENCE_FIELDS.map((f) => ({
    label: f.label,
    value: copy.audienceGrid?.[f.key] ?? "",
  })).filter((c) => c.value.trim().length > 0);
  const audienceCells =
    statedAudience.length > 1 && statedAudience.length % 2 === 1
      ? [...statedAudience, { label: "", value: "" }]
      : statedAudience;

  return (
    // The display scale lives on the middle box, never on the captured one:
    // html-to-image clones the node it is given along with its own transform,
    // so a scale on the ref exports the creative shrunk into a corner.
    <div style={{ width: W * scale, height: H * scale, overflow: "hidden" }}>
      <div style={{ transform: `scale(${scale})`, transformOrigin: "top left", width: W, height: H }}>
        <div
          ref={ref}
          style={{
            width: W,
            height: H,
            position: "relative",
            overflow: "hidden",
            background: CANVAS,
            fontFamily: "var(--font-geist-sans), system-ui, sans-serif",
            color: INK,
          }}
        >
          <div
            style={{
              position: "absolute",
              top: pad,
              left: pad,
              fontSize: Math.round(19 * u),
              letterSpacing: "0.28em",
              fontWeight: 600,
              ...nowrap,
            }}
          >
            MINIMALIST
          </div>

          {propImage && (
            // A small generated graphic, never the product. Positioned as a
            // prop near the product rather than as a full-bleed backdrop, the
            // same relationship the brand's own banners use: a molecule motif
            // woven through hair, a scattering of glass droplets, never a
            // painted environment behind the whole frame.
            //
            // Rendered by the model on a flat white background and blended
            // with multiply rather than composited with opacity: white
            // disappears under multiply regardless of the canvas's exact
            // tone, so this cannot reproduce the colour-temperature seam a
            // full generated backdrop had. Coherent by construction, the same
            // fix as the flat canvas itself.
            //
            // Sized and placed as a corner accent, not centred behind the
            // product. The product box fills up to 82 percent of the canvas
            // on some layouts, so a prop sized and centred to "surround" it,
            // the first version of this, put the prop's own graphic directly
            // underneath the opaque product photo: invisible, because it was
            // sitting behind an opaque photo, with only its blank white
            // margin showing elsewhere, which multiplies away to nothing.
            // Caught by looking at the actual render, not by reasoning about
            // the layout math.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={propImage}
              alt=""
              style={{
                position: "absolute",
                ...propPx,
                objectFit: "contain",
                mixBlendMode: "multiply",
                zIndex: 0,
              }}
            />
          )}

          {hero && (
            <div
              style={{
                position: "absolute",
                ...productPx,
                filter: "drop-shadow(0 18px 26px rgba(30,24,16,0.16))",
                zIndex: 1,
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={hero}
                alt={facts.name}
                crossOrigin="anonymous"
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "contain",
                  objectPosition: layout === "split" ? "center" : "bottom",
                }}
              />
            </div>
          )}

          <div
            style={{
              position: "absolute",
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-start",
              justifyContent: geo.align === "center" ? "center" : "flex-start",
              zIndex: 2,
              ...copyPx,
            }}
          >
            <h1
              style={{
                fontSize: headlineSize,
                lineHeight: 1.1,
                letterSpacing: "-0.02em",
                fontWeight: 600,
                maxWidth: "100%",
              }}
            >
              {copy.headline}
            </h1>

            {copy.subhead && (
              <p
                style={{
                  marginTop: Math.round(16 * u),
                  fontSize: Math.round(24 * u),
                  lineHeight: 1.34,
                  color: MUTED,
                  maxWidth: "100%",
                }}
              >
                {copy.subhead}
              </p>
            )}

            {copy.checklist.length > 0 && (
              <div style={{ marginTop: Math.round(18 * u), display: "flex", flexDirection: "column", gap: Math.round(8 * u) }}>
                {copy.checklist.map((item, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: Math.round(8 * u) }}>
                    <span style={{ fontSize: Math.round(19 * u), lineHeight: 1.3, color: INK, ...nowrap }}>✓</span>
                    <span style={{ fontSize: Math.round(19 * u), lineHeight: 1.3, color: "#3b342c" }}>{item}</span>
                  </div>
                ))}
              </div>
            )}

            {copy.benefitBreakdown.length > 0 && (
              // The mechanism-of-action block. The verb is set as a label and
              // the mechanism as the sentence under it, which is the corpus
              // pattern: "FIGHTS ACNE: provides potent anti-microbial activity
              // against p-acne bacteria." Two weights, one line of hierarchy,
              // no decoration.
              <div
                style={{
                  marginTop: Math.round(18 * u),
                  display: "flex",
                  flexDirection: "column",
                  gap: Math.round(14 * u),
                  maxWidth: "100%",
                }}
              >
                {copy.benefitBreakdown.map((b, i) => (
                  <div key={i}>
                    <div
                      style={{
                        fontSize: Math.round(17 * u),
                        fontWeight: 700,
                        letterSpacing: "0.07em",
                        textTransform: "uppercase",
                      }}
                    >
                      {b.verb}
                    </div>
                    <div
                      style={{
                        marginTop: Math.round(4 * u),
                        fontSize: Math.round(18 * u),
                        lineHeight: 1.4,
                        color: "#3b342c",
                      }}
                    >
                      {b.mechanism}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {copy.ingredientSynergy.length > 0 && (
              // The ingredient-synergy block: which named ingredient does what.
              // Every ingredient that reaches this render has already been
              // checked against the product page's own per-ingredient tab by
              // verifyIngredientSynergy, so the layout does not need to defend
              // against a name the product does not contain.
              <div
                style={{
                  marginTop: Math.round(18 * u),
                  display: "flex",
                  flexDirection: "column",
                  gap: Math.round(12 * u),
                  maxWidth: "100%",
                }}
              >
                {copy.ingredientSynergy.map((s, i) => (
                  <div
                    key={i}
                    style={{
                      borderLeft: `2px solid ${HAIRLINE}`,
                      paddingLeft: Math.round(14 * u),
                      fontSize: Math.round(18 * u),
                      lineHeight: 1.4,
                    }}
                  >
                    <span style={{ fontWeight: 600 }}>{s.ingredient}</span>
                    <span style={{ color: MUTED }}>: {s.role}</span>
                  </div>
                ))}
              </div>
            )}

            {audienceCells.length > 0 && (
              // The audience-qualification block, as a bordered grid rather
              // than prose. This content is a set of labelled key/value pairs
              // on the product page itself, and flattening it into a sentence
              // would be a rewrite of structured facts; a grid is the shape the
              // data already has.
              //
              // Hairlines are drawn once each: the container owns the top and
              // left edges, every cell owns its right and bottom. That is why
              // an odd cell count is padded with a blank cell below, since a
              // half-empty final row would leave the grid missing an edge.
              <div
                style={{
                  marginTop: Math.round(18 * u),
                  width: "100%",
                  display: "grid",
                  gridTemplateColumns: audienceCells.length === 1 ? "1fr" : "1fr 1fr",
                  borderTop: `1px solid ${HAIRLINE}`,
                  borderLeft: `1px solid ${HAIRLINE}`,
                }}
              >
                {audienceCells.map((c, i) => (
                  <div
                    key={i}
                    style={{
                      padding: `${Math.round(12 * u)}px ${Math.round(14 * u)}px`,
                      borderRight: `1px solid ${HAIRLINE}`,
                      borderBottom: `1px solid ${HAIRLINE}`,
                      minHeight: Math.round(64 * u),
                    }}
                  >
                    {c.label && (
                      <div
                        style={{
                          fontSize: Math.round(12 * u),
                          letterSpacing: "0.16em",
                          textTransform: "uppercase",
                          color: MUTED,
                          ...nowrap,
                        }}
                      >
                        {c.label}
                      </div>
                    )}
                    {c.value && (
                      <div style={{ marginTop: Math.round(6 * u), fontSize: Math.round(17 * u), lineHeight: 1.3 }}>
                        {c.value}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {active && (
              <div
                style={{
                  alignSelf: "flex-start",
                  marginTop: Math.round(18 * u),
                  padding: `${Math.round(8 * u)}px ${Math.round(14 * u)}px`,
                  border: "1px solid rgba(22,19,15,0.28)",
                  borderRadius: 999,
                  fontSize: Math.round(17 * u),
                  ...nowrap,
                }}
              >
                {active.ingredient} {active.concentration}
              </div>
            )}

            {(copy.statBadge?.value || copy.statBadge?.label) && (
              <div
                style={{
                  alignSelf: "flex-start",
                  marginTop: Math.round(16 * u),
                  padding: `${Math.round(10 * u)}px ${Math.round(16 * u)}px`,
                  border: "1px solid rgba(22,19,15,0.2)",
                  borderRadius: 6,
                }}
              >
                {copy.statBadge.value && (
                  <div style={{ fontSize: Math.round(24 * u), fontWeight: 700, ...nowrap }}>{copy.statBadge.value}</div>
                )}
                {copy.statBadge.label && (
                  <div style={{ fontSize: Math.round(14 * u), color: MUTED, ...nowrap }}>{copy.statBadge.label}</div>
                )}
              </div>
            )}

            {copy.body && (
              <p
                style={{
                  marginTop: Math.round(16 * u),
                  fontSize: Math.round(20 * u),
                  lineHeight: 1.48,
                  color: "#3b342c",
                  maxWidth: "100%",
                }}
              >
                {copy.body}
              </p>
            )}

            {copy.cta && (
              <div
                style={{
                  alignSelf: "flex-start",
                  marginTop: Math.round(22 * u),
                  padding: `${Math.round(14 * u)}px ${Math.round(28 * u)}px`,
                  background: INK,
                  color: "#fbf9f5",
                  borderRadius: 4,
                  fontSize: Math.round(19 * u),
                  fontWeight: 500,
                  ...nowrap,
                }}
              >
                {copy.cta}
              </div>
            )}

            {footnoteInFlow && copy.footnote && (
              <div style={{ ...footnoteStyle, marginTop: Math.round(16 * u), maxWidth: "100%" }}>{copy.footnote}</div>
            )}
          </div>

          {/* The substantiation footnote. Fine print, but it has to be legible:
              a claim whose evidence the reader cannot read is not substantiated
              to the reader. */}
          {!footnoteInFlow && copy.footnote && (
            <div style={{ position: "absolute", left: pad, right: pad, bottom: Math.round(20 * u), ...footnoteStyle }}>
              {copy.footnote}
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
