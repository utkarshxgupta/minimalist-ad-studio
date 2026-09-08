"use client";

import { forwardRef, useEffect, useRef, useState } from "react";
import type { AdCopy, ProductFacts } from "@/lib/types";
import type { Placement } from "@/lib/generator/placements";
import {
  geometryFor,
  scrimFor,
  needsWordmarkBand,
  scrimStrengthFor,
  type Box,
} from "@/lib/generator/artboard-geometry";
import { sampleBackdrop, type HeroGround } from "@/lib/generator/hero-backdrop";
import { backdropDividedDataUrl } from "@/lib/generator/cutout";

/**
 * The creative, at whatever size the placement asks for.
 *
 * No call-to-action button is drawn here, deliberately. On a Meta placement the
 * platform renders its own, in the grey link strip beneath the image, chosen
 * from a fixed list in Ads Manager; an earlier version painted a second one
 * onto the canvas, which ships an ad showing two. On a PDP listing image the
 * reader is already on the product page. `Placement.ctaSurface` is where that
 * decision lives.
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
  /**
   * Creative mode's generated frame, as a data URI: a finished art-directed
   * scene with the product already in it. When present it is the whole
   * picture, so the packshot layer is not drawn on top of it.
   */
  sceneImage?: string;
  /**
   * How pale and quiet the generated frame's copy area measured. Absent means
   * unmeasured, and the scrim falls back to covering the worst case.
   */
  sceneTone?: { copyLuminance: number; copyContrast: number };
  /** Preview width in CSS pixels. The captured node is always full size. */
  previewWidth?: number;
}

/**
 * The brand face first, so a machine with the Proxima Nova licence installed
 * renders and exports the real thing. Figtree is the committed stand-in; see
 * the note in `app/layout.tsx`.
 */
const BRAND_STACK =
  '"Proxima Nova", ProximaNovaRegular, var(--font-brand), var(--font-geist-sans), system-ui, sans-serif';

/**
 * The lab monospace, for concentrations and pH.
 *
 * The brand's own spec reserves a monospace face for "concentrations, pH
 * levels, vehicle types and sub-labels", and it is the detail that makes a
 * skincare ad read as a datasheet rather than a cosmetics ad. Setting "10%" in
 * the same face as the headline throws that away.
 */
const MONO_STACK = '"SF Mono", Monaco, var(--font-geist-mono), ui-monospace, monospace';

const INK = "#16130f";
const MUTED = "#4a423a";
/**
 * Near-white, matching the brand's own canvas token observed on
 * beminimalist.co. Used when the product photograph has no flat backdrop of
 * its own to match; see `hero-backdrop.ts` for why matching is preferred.
 */
const CANVAS = "#f6f5f2";

/**
 * A very quiet vertical gradient for the canvas.
 *
 * Only safe now that the packshot's own backdrop is divided out. While the
 * canvas had to match a flat photographic sweep exactly, any gradient
 * guaranteed a visible seam somewhere along the product's edge, so the ground
 * had to be one flat colour. With nothing behind the product there is no edge
 * to mismatch, so the ground can be designed rather than dictated by whatever
 * sweep the photographer used.
 *
 * Kept within four levels end to end. This is the same page that once carried
 * a generated photoreal backdrop and read as a "milky smudge"; the lesson from
 * that was not that gradients are wrong, it was that a gradient competing with
 * a photograph is.
 */
const CANVAS_GRADIENT = "linear-gradient(180deg, #f8f7f4 0%, #f4f3ee 100%)";
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
  { copy, facts, placement, sceneImage, sceneTone, previewWidth = 380 },
  ref
) {
  const { width: W, height: H, layout } = placement;
  const scale = previewWidth / W;
  const geo = geometryFor(placement);

  // The photograph's own studio backdrop, once it has loaded and been read.
  // Null until then, and null forever for a cut-out or dark-ground image, so
  // the brand canvas is both the starting value and the fallback.
  const [heroGround, setHeroGround] = useState<HeroGround | null>(null);
  // The packshot with its studio sweep divided out, composited with multiply.
  // Null until the photo has decoded, and null for any photo whose backdrop
  // cannot be read, in which case the raw photograph is drawn as before.
  const [divided, setDivided] = useState<string | null>(null);

  // A generated frame is full-bleed, so it is its own ground and the sampled
  // packshot colour is irrelevant.
  // With the backdrop divided out the canvas is free again, so it is the brand
  // ground rather than whatever colour the photographer's sweep happened to be.
  // The sampled colour is still used when division was not possible, because
  // matching the sweep is better than sitting a grey rectangle on cream.
  const ground = sceneImage || divided ? CANVAS_GRADIENT : heroGround?.color ?? CANVAS;

  // The synthetic shadow is drawn only for a cut-out. `drop-shadow` follows an
  // image's alpha silhouette, so on a transparent PNG it traces the bottle,
  // which is what it was for. The brand's packshots have no alpha at all, so
  // it traced the image's four edges instead and drew a soft box around the
  // photograph: the outline that made a colour-matched packshot still read as
  // a rectangle pasted onto the canvas. The photography already carries its
  // own studio shadow under the bottle, so there was never anything to add.
  const shadow = heroGround?.opaque === false ? "drop-shadow(0 18px 26px rgba(30,24,16,0.16))" : undefined;

  function readGround(img: HTMLImageElement) {
    // The divided image is swapped into this same element, so its own load
    // event lands here too. Without this guard it would be sampled (backdrop
    // now pure white), divided again, and written back to `src`, firing load
    // again forever.
    if (divided) return;

    const g = sampleBackdrop(img);
    setHeroGround(g);
    setDivided(g.color && g.opaque ? backdropDividedDataUrl(img, g.color) : null);
  }

  const hero = facts.heroImageUrl ? `/api/image-proxy?url=${encodeURIComponent(facts.heroImageUrl)}` : null;
  const active = facts.actives[0];

  const heroRef = useRef<HTMLImageElement>(null);

  // A cached photograph is already `complete` by the time React mounts this,
  // so its load event never fires and `onLoad` alone never runs. That is not a
  // rare path: it is what happens on every render after the first, which is
  // most of them. The packshot then kept its studio sweep and the ad showed
  // the grey rectangle again, intermittently and therefore confusingly.
  useEffect(() => {
    const img = heroRef.current;
    if (img?.complete && img.naturalWidth > 0) readGround(img);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hero]);


  // Type scales with canvas width, so an 1100px listing image and a 1080px
  // story share one design rather than two hand-tuned ones.
  // The type unit, from the geometric mean of the canvas rather than its width.
  //
  // This was `W / 1080`, and every placement here is between 1080 and 1100
  // wide, so every format got identical type sizes no matter how tall it was.
  // On a 9:16 Story that put the mechanism block at 18px on a 1920px canvas,
  // 0.94 percent of the height against 1.67 on the square, which is the
  // unreadable small print in a Story viewed full screen on a phone. Width
  // alone was never the right basis: a Story is not a wide square, it is a
  // bigger canvas, and its type has to grow with it.
  const u = Math.sqrt(W * H) / 1080;
  const pad = Math.round(48 * u);

  const productPx = px(geo.product, W, H);
  const copyPx = px(geo.copy, W, H);

  const scrim = scrimFor(geo, layout);
  // Only as strong as this particular frame needs. See `scrimStrengthFor`.
  const scrimStrength = scrimStrengthFor(sceneTone);
  const copyScrimPx = px(scrim.box, W, H);
  // The tall base comes down because `u` now carries the format's size: 74 was
  // compensating by hand for a unit that ignored height, and keeping both
  // would overflow the copy box.
  const headlineSize = Math.round((layout === "tall" ? 58 : 56) * u);

  // On a tall format the copy column sits above the product, so a footnote
  // anchored to the canvas bottom would land on the bottle and be unreadable.
  // It rides with the copy instead. The disclaimer has to be legible to count.
  //
  // A generated frame forces the same choice for a different reason: the scrim
  // that keeps the copy readable covers the copy column, and a footnote pinned
  // to the canvas edge sits outside it, over whatever the scene happens to put
  // there. On the first composite that was pale concrete, and the disclaimer
  // was effectively invisible. A claim whose evidence the reader cannot read
  // is not substantiated to the reader, so it rides with the copy instead.
  const footnoteInFlow = layout === "tall" || layout === "stacked" || Boolean(sceneImage);

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
            background: ground,
            fontFamily: BRAND_STACK,
            color: INK,
          }}
        >
          {/*
            The wordmark, set the way the brand actually sets it.

            This rendered "M I N I M A L I S T" at 0.28em tracking, which the
            creative audit flagged and which the brand's own spec contradicts
            outright: the mark is tight, at -0.01em. Looking at the live site
            settles it, because the logo is sentence-case "Minimalist" in a
            heavy geometric cut, not letterspaced caps.

            It was worse than a styling slip. The product photograph in the
            same frame carries the real logotype on the label, so every ad
            this tool produced showed the brand's wordmark twice, two
            different ways, a few hundred pixels apart.
          */}
          <div
            style={{
              position: "absolute",
              top: pad,
              left: pad,
              fontSize: Math.round(30 * u),
              letterSpacing: "-0.01em",
              fontWeight: 700,
              // Above the scene. Without this the wordmark is `position:
              // absolute` with no z-index, sitting first in the DOM, so the
              // full-bleed generated frame at z-index 0 paints straight over
              // it: creative mode was producing ads with no brand mark on them
              // at all. Photographic mode never showed the bug because it has
              // no scene layer to be buried under.
              zIndex: 3,
              ...nowrap,
            }}
          >
            Minimalist
          </div>

          {sceneImage && (
            // The generated frame, full-bleed. It is the entire picture: the
            // scene, the light, and the product, composed together by the
            // image model from the real photograph, at this placement's own
            // aspect ratio so nothing has to be cropped to fit.
            //
            // The packshot layer below is skipped when this is present. There
            // is exactly one product in the frame and it is this one, which is
            // the whole reason the gate makes a human sign for it.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={sceneImage}
              alt=""
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", zIndex: 0 }}
            />
          )}

          {sceneImage && (
            // A legibility scrim behind the copy column only, not the whole
            // frame. The scene is prompted to leave this area calm, and this
            // is what makes the type readable when it does not. Weak enough
            // to keep the photograph looking like a photograph.
            <div
              style={{
                position: "absolute",
                ...copyScrimPx,
                zIndex: 1,
                // Held flat across the whole copy region, then dropped. The
                // stops come from `scrimFor`, so the fade can only ever start
                // past the last word rather than through it.
                background: `linear-gradient(${scrim.angle}deg, rgba(246,245,242,${scrimStrength}) 0%, rgba(246,245,242,${scrimStrength}) ${(scrim.hold * 100).toFixed(1)}%, rgba(246,245,242,0) 100%)`,
              }}
            />
          )}

          {sceneImage && needsWordmarkBand(scrim) && (
            // The stacked layouts put the product at the top and the copy at
            // the bottom, so the main scrim starts below the product and the
            // wordmark is left sitting on bare photograph. Measured at zero
            // opacity behind it, which is exactly as legible as it sounds.
            <div
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                width: "100%",
                height: Math.round(H * 0.16),
                zIndex: 1,
                background: `linear-gradient(180deg, rgba(246,245,242,${scrimStrength}) 0%, rgba(246,245,242,0) 100%)`,
              }}
            />
          )}

          {!sceneImage && hero && (
            <div
              style={{
                position: "absolute",
                ...productPx,
                filter: shadow,
                zIndex: 2,
                // The blend lives on this wrapper, not on the <img> inside it.
                // A positioned element with a z-index opens its own stacking
                // context, and a blend mode only sees backdrop painted inside
                // that context, which for the image is nothing at all: it
                // rendered completely unblended, pure white where the sweep
                // should have vanished. On the wrapper the backdrop is the
                // canvas, which is what it needs to multiply against.
                //
                // White is the identity under multiply, so the divided-out
                // sweep disappears onto the canvas and only the product and
                // its own real shadow remain.
                mixBlendMode: divided ? "multiply" : undefined,
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                ref={heroRef}
                src={divided ?? hero}
                alt={facts.name}
                crossOrigin="anonymous"
                onLoad={(e) => readGround(e.currentTarget)}
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
              justifyContent:
                geo.align === "center" ? "center" : geo.align === "end" ? "flex-end" : "flex-start",
              zIndex: 3,
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
                  fontFamily: MONO_STACK,
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
                  <div
                    style={{ fontSize: Math.round(26 * u), fontWeight: 700, fontFamily: MONO_STACK, ...nowrap }}
                  >
                    {copy.statBadge.value}
                  </div>
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
