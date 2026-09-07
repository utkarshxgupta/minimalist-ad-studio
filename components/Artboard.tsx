"use client";

import { forwardRef } from "react";
import type { AdCopy, ProductFacts } from "@/lib/types";
import type { Placement } from "@/lib/generator/placements";

/**
 * The creative, at whatever size the placement asks for.
 *
 * Composed in HTML and CSS over the real product photograph. Invariant 5: the
 * pack, the label and the printed concentration are photographic. A generated
 * label would be a fabricated fact about a real product, which is the same
 * offence as a fabricated claim, only harder to spot.
 *
 * Three layout families rather than one design stretched. A 9:16 Story and an
 * 11:16 listing image are not the same picture at different heights: one is
 * glanced at and one is studied, so the copy sits in a different place and the
 * product takes a different share of the frame.
 *
 * The photograph is loaded through our own image proxy. A cross-origin image
 * taints the canvas and the PNG export comes out with a hole where the product
 * should be.
 */

export interface ArtboardProps {
  copy: AdCopy;
  facts: ProductFacts;
  placement: Placement;
  /** Generated backdrop as a data URI. Absent means the plain composed surface. */
  background?: string;
  /** Preview width in CSS pixels. The captured node is always full size. */
  previewWidth?: number;
}

const INK = "#16130f";
const MUTED = "#4a423a";

export const Artboard = forwardRef<HTMLDivElement, ArtboardProps>(function Artboard(
  { copy, facts, placement, background, previewWidth = 380 },
  ref
) {
  const { width: W, height: H, layout } = placement;
  const scale = previewWidth / W;

  const hero = facts.heroImageUrl ? `/api/image-proxy?url=${encodeURIComponent(facts.heroImageUrl)}` : null;
  const active = facts.actives[0];

  // Type scales with canvas width, so an 1100px listing image and a 1080px
  // story share one design rather than two hand-tuned ones.
  const u = W / 1080;
  const pad = Math.round(76 * u);

  const productBox: React.CSSProperties =
    layout === "split"
      ? {
          right: 0,
          top: 0,
          height: H,
          width: Math.round(W * 0.44),
          maskImage: "linear-gradient(to right, transparent 0%, #000 26%)",
          WebkitMaskImage: "linear-gradient(to right, transparent 0%, #000 26%)",
        }
      : layout === "tall"
        ? {
            left: 0,
            bottom: 0,
            width: W,
            height: Math.round(H * 0.6),
            maskImage: "linear-gradient(to bottom, transparent 0%, #000 22%)",
            WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, #000 22%)",
          }
        : {
            left: 0,
            top: 0,
            width: W,
            height: Math.round(H * 0.5),
            maskImage: "linear-gradient(to bottom, #000 74%, transparent 100%)",
            WebkitMaskImage: "linear-gradient(to bottom, #000 74%, transparent 100%)",
          };

  const copyBox: React.CSSProperties =
    layout === "split"
      ? { inset: 0, padding: pad, width: Math.round(W * 0.6) }
      : layout === "tall"
        ? { left: 0, top: 0, width: W, padding: pad, height: Math.round(H * 0.46) }
        : { left: 0, bottom: 0, width: W, padding: pad, height: Math.round(H * 0.54) };

  const scrim: React.CSSProperties =
    layout === "split"
      ? {
          inset: 0,
          background:
            "linear-gradient(90deg, rgba(255,252,247,0.92) 0%, rgba(255,252,247,0.55) 52%, rgba(255,252,247,0) 78%)",
        }
      : layout === "tall"
        ? {
            left: 0,
            top: 0,
            right: 0,
            height: Math.round(H * 0.54),
            background:
              "linear-gradient(180deg, rgba(255,252,247,0.94) 0%, rgba(255,252,247,0.6) 62%, rgba(255,252,247,0) 100%)",
          }
        : {
            left: 0,
            bottom: 0,
            right: 0,
            height: Math.round(H * 0.62),
            background:
              "linear-gradient(0deg, rgba(255,252,247,0.96) 0%, rgba(255,252,247,0.74) 58%, rgba(255,252,247,0) 100%)",
          };

  const headlineSize = Math.round((layout === "tall" ? 84 : 62) * u);

  // On a tall format the product occupies the bottom 60 percent, so a footnote
  // pinned to the canvas bottom lands on the bottle and is unreadable. It rides
  // with the copy instead. The disclaimer has to be legible to count.
  const footnoteInFlow = layout === "tall";

  const footnoteStyle: React.CSSProperties = {
    fontSize: Math.round(15 * u),
    lineHeight: 1.35,
    color: "#6b6459",
  };

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
            background: "#efe9e0",
            fontFamily: "var(--font-geist-sans), system-ui, sans-serif",
            color: INK,
          }}
        >
          {background ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={background}
              alt=""
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
            />
          ) : (
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: "linear-gradient(170deg, #f7f3ec 0%, #efe7db 62%, #e6dccd 100%)",
              }}
            />
          )}

          {hero && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={hero}
              alt={facts.name}
              crossOrigin="anonymous"
              style={{ position: "absolute", objectFit: "cover", objectPosition: "center", ...productBox }}
            />
          )}

          {/* A scrim behind the copy only, oriented to wherever the copy sits.
              Copy has to stay legible over a backdrop the marketer has not seen
              yet, and unreadable copy is a broken deliverable even when every
              claim in it is compliant. */}
          <div style={{ position: "absolute", ...scrim }} />

          <div
            style={{
              position: "absolute",
              top: pad,
              left: pad,
              fontSize: Math.round(21 * u),
              letterSpacing: "0.34em",
              fontWeight: 600,
            }}
          >
            MINIMALIST
          </div>

          <div
            style={{
              position: "absolute",
              display: "flex",
              flexDirection: "column",
              justifyContent: layout === "split" ? "center" : "flex-end",
              ...copyBox,
            }}
          >
            <h1
              style={{
                fontSize: headlineSize,
                lineHeight: 1.08,
                letterSpacing: "-0.025em",
                fontWeight: 600,
                maxWidth: layout === "split" ? Math.round(W * 0.5) : "100%",
              }}
            >
              {copy.headline}
            </h1>

            {copy.subhead && (
              <p
                style={{
                  marginTop: Math.round(20 * u),
                  fontSize: Math.round(27 * u),
                  lineHeight: 1.34,
                  color: MUTED,
                  maxWidth: layout === "split" ? Math.round(W * 0.46) : "92%",
                }}
              >
                {copy.subhead}
              </p>
            )}

            {active && (
              <div
                style={{
                  alignSelf: "flex-start",
                  marginTop: Math.round(22 * u),
                  padding: `${Math.round(9 * u)}px ${Math.round(16 * u)}px`,
                  border: "1px solid rgba(22,19,15,0.28)",
                  borderRadius: 999,
                  fontSize: Math.round(20 * u),
                }}
              >
                {active.ingredient} {active.concentration}
              </div>
            )}

            {copy.body && (
              <p
                style={{
                  marginTop: Math.round(20 * u),
                  fontSize: Math.round(23 * u),
                  lineHeight: 1.5,
                  color: "#3b342c",
                  maxWidth: "94%",
                }}
              >
                {copy.body}
              </p>
            )}

            {copy.cta && (
              <div
                style={{
                  alignSelf: "flex-start",
                  marginTop: Math.round(26 * u),
                  padding: `${Math.round(16 * u)}px ${Math.round(32 * u)}px`,
                  background: INK,
                  color: "#fbf9f5",
                  borderRadius: 4,
                  fontSize: Math.round(22 * u),
                  fontWeight: 500,
                }}
              >
                {copy.cta}
              </div>
            )}

            {footnoteInFlow && copy.footnote && (
              <div style={{ ...footnoteStyle, marginTop: Math.round(20 * u), maxWidth: "94%" }}>
                {copy.footnote}
              </div>
            )}
          </div>

          {/* The substantiation footnote. Fine print, but it has to be legible:
              a claim whose evidence the reader cannot read is not substantiated
              to the reader. */}
          {!footnoteInFlow && copy.footnote && (
            <div style={{ position: "absolute", left: pad, right: pad, bottom: Math.round(24 * u), ...footnoteStyle }}>
              {copy.footnote}
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
