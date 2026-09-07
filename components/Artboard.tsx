"use client";

import { forwardRef } from "react";
import type { AdCopy, ProductFacts } from "@/lib/types";

/**
 * The 1080x1080 creative.
 *
 * Composed in HTML and CSS over the real product photograph. Invariant 5: the
 * pack, the label and the printed concentration are photographic. A generated
 * label would be a fabricated fact about a real product, which is the same
 * offence as a fabricated claim, only harder to spot.
 *
 * The photograph is loaded through our own image proxy. A cross-origin image
 * taints the canvas and the PNG export comes out with a hole where the product
 * should be.
 */

export interface ArtboardProps {
  copy: AdCopy;
  facts: ProductFacts;
  /** Generated backdrop as a data URI. Absent means the plain composed surface. */
  background?: string;
  /** Display scale. The captured node is always 1080x1080 regardless. */
  scale?: number;
}

export const SIZE = 1080;

export const Artboard = forwardRef<HTMLDivElement, ArtboardProps>(function Artboard(
  { copy, facts, background, scale = 0.5 },
  ref
) {
  const hero = facts.heroImageUrl ? `/api/image-proxy?url=${encodeURIComponent(facts.heroImageUrl)}` : null;
  const active = facts.actives[0];

  return (
    // Three boxes, and the nesting is load-bearing. The display scale lives on
    // the middle one, never on the captured one: html-to-image clones the node
    // it is given along with its own transform, so a scale on the ref exported
    // a 1080x1080 PNG with the creative shrunk into the top-left corner and two
    // thirds of the canvas blank. Found by decoding an actual export.
    <div style={{ width: SIZE * scale, height: SIZE * scale, overflow: "hidden" }}>
      <div style={{ transform: `scale(${scale})`, transformOrigin: "top left", width: SIZE, height: SIZE }}>
        <div
          ref={ref}
          style={{
            width: SIZE,
            height: SIZE,
            position: "relative",
            overflow: "hidden",
            background: "#efe9e0",
            fontFamily: "var(--font-geist-sans), system-ui, sans-serif",
            color: "#16130f",
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

        {/* A soft scrim. Copy has to stay legible over a backdrop the marketer
            has not seen yet, and unreadable copy is a broken deliverable even
            when every claim in it is compliant. */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(180deg, rgba(255,252,247,0.86) 0%, rgba(255,252,247,0.45) 46%, rgba(255,252,247,0) 70%)",
          }}
        />

        {hero && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={hero}
            alt={facts.name}
            crossOrigin="anonymous"
            style={{
              position: "absolute",
              right: 0,
              top: 0,
              // Height is set explicitly. On a replaced element, top plus bottom
              // does not stretch the box, so the image sat at its intrinsic
              // ratio and left a hard horizontal seam two thirds down.
              height: SIZE,
              width: 470,
              objectFit: "cover",
              objectPosition: "center",
              // The product photograph is not a cut-out: it arrives with its own
              // studio background. Composited as a rectangle it reads as a
              // sticker, so it is bled off three edges and the fourth is faded
              // into the backdrop.
              maskImage: "linear-gradient(to right, transparent 0%, #000 26%)",
              WebkitMaskImage: "linear-gradient(to right, transparent 0%, #000 26%)",
            }}
          />
        )}

        <div style={{ position: "absolute", inset: 0, padding: 84, display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 22, letterSpacing: "0.34em", fontWeight: 600 }}>MINIMALIST</div>

          <h1
            style={{
              marginTop: 64,
              maxWidth: 540,
              fontSize: 62,
              lineHeight: 1.1,
              letterSpacing: "-0.025em",
              fontWeight: 600,
            }}
          >
            {copy.headline}
          </h1>

          {copy.subhead && (
            <p style={{ marginTop: 24, maxWidth: 500, fontSize: 27, lineHeight: 1.34, color: "#4a423a" }}>
              {copy.subhead}
            </p>
          )}

          <div style={{ marginTop: "auto", maxWidth: 560 }}>
            {active && (
              <div
                style={{
                  display: "inline-block",
                  marginBottom: 22,
                  padding: "9px 16px",
                  border: "1px solid rgba(22,19,15,0.28)",
                  borderRadius: 999,
                  fontSize: 20,
                  letterSpacing: "0.02em",
                }}
              >
                {active.ingredient} {active.concentration}
              </div>
            )}

            {copy.body && (
              <p style={{ fontSize: 23, lineHeight: 1.45, color: "#3b342c" }}>{copy.body}</p>
            )}

            {copy.cta && (
              <div
                style={{
                  display: "inline-block",
                  marginTop: 30,
                  padding: "17px 34px",
                  background: "#16130f",
                  color: "#fbf9f5",
                  borderRadius: 4,
                  fontSize: 22,
                  fontWeight: 500,
                }}
              >
                {copy.cta}
              </div>
            )}
          </div>
          </div>
        </div>
      </div>
    </div>
  );
});