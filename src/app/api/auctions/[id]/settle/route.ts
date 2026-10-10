import { NextResponse } from "next/server";
import { settleAuction } from "@/lib/auction/service";
import { rateLimit } from "@/lib/ratelimit";

/**
 * Lets clients nudge settlement the moment an auction's clock hits zero.
 * Safe for anyone to call: settlement is idempotent and only acts once the
 * server-side end time has actually passed.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (!(await rateLimit(`settle:${ip}`, 30, 60))) return NextResponse.json({ ok: false }, { status: 429 });
  const r = await settleAuction(id).catch(() => null);
  return NextResponse.json({ ok: true, settled: Boolean(r) });
}
