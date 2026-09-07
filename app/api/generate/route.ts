import { NextResponse } from "next/server";
import { z } from "zod";
import { generateAd } from "@/lib/generator";

/**
 * The generator, over HTTP.
 *
 * Server-side by necessity, not by preference: fetching the product page from
 * the browser is the CORS problem the brief warns about, and the API key must
 * never reach the client.
 */

export const runtime = "nodejs";
export const maxDuration = 120;

const Body = z.object({
  url: z.string().min(1),
  angle: z.string().optional(),
  audience: z.string().optional(),
  background: z.enum(["generated", "plain"]).optional(),
  backgroundHint: z.string().optional(),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Send a JSON body with a product url." }, { status: 400 });
  }

  try {
    const run = await generateAd(parsed.data.url, parsed.data);
    return NextResponse.json(run);
  } catch (err) {
    // Surfaced with the real reason. A generic "something went wrong" here
    // would hide the two failures that actually happen: a URL this tool will
    // not fetch, and a missing API key.
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
