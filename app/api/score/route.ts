import { NextResponse } from "next/server";
import { z } from "zod";
import { scoreAd } from "@/lib/scorer";

/**
 * The review surface's endpoint. Same scorer the generator gates itself with,
 * called the same way. One standard, applied twice.
 */

export const runtime = "nodejs";
export const maxDuration = 60;

const Body = z.object({
  text: z.string().min(1, "Paste some ad copy first."),
  /**
   * Optional. Facts-dependent rules are withheld when this is absent, rather
   * than being run with an instruction not to guess. Asking a model politely to
   * skip a check is not a control.
   */
  factsContext: z.string().optional(),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Bad request" }, { status: 400 });
  }

  try {
    const result = await scoreAd(parsed.data.text, { factsContext: parsed.data.factsContext });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
