import { NextResponse } from "next/server";

/**
 * Serves the product photograph from our own origin.
 *
 * Not a performance trick. PNG export rasterises the artboard in the browser,
 * and a cross-origin image taints the canvas, so the export silently produces a
 * creative with a hole where the product used to be. Proxying makes the image
 * same-origin and the export whole.
 *
 * Allowlisted for the same reason the page fetcher is: this is a server-side
 * fetch of a URL that arrives from the client.
 */

export const runtime = "nodejs";

const ALLOWED_HOSTS = new Set(["cdn.shopify.com", "beminimalist.co", "www.beminimalist.co"]);

export async function GET(req: Request) {
  const target = new URL(req.url).searchParams.get("url");
  if (!target) return new NextResponse("Missing url", { status: 400 });

  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    return new NextResponse("Not a URL", { status: 400 });
  }

  if (parsed.protocol !== "https:" || !ALLOWED_HOSTS.has(parsed.hostname)) {
    return new NextResponse(`Refusing to proxy ${parsed.hostname}`, { status: 403 });
  }

  const upstream = await fetch(parsed.toString(), {
    headers: { "user-agent": "MinimalistAdStudio/0.1 (internal prototype)" },
    signal: AbortSignal.timeout(15_000),
  });

  if (!upstream.ok) {
    return new NextResponse(`Upstream returned ${upstream.status}`, { status: 502 });
  }

  return new NextResponse(upstream.body, {
    headers: {
      "content-type": upstream.headers.get("content-type") ?? "image/png",
      "cache-control": "public, max-age=86400",
    },
  });
}
