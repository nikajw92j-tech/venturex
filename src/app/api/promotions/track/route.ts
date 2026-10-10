import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { trackPromotion } from "@/lib/promotions";
import { rateLimit } from "@/lib/ratelimit";

const schema = z.object({ listingIds: z.array(z.string().max(40)).max(60), kind: z.enum(["impression", "click"]) });

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  // Basic abuse protection so counters can't be trivially inflated.
  if (!(await rateLimit(`promo-track:${ip}`, 120, 60))) return NextResponse.json({ ok: false }, { status: 429 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false }, { status: 400 });
  await trackPromotion([...new Set(parsed.data.listingIds)], parsed.data.kind);
  return NextResponse.json({ ok: true });
}
