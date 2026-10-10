import { NextRequest, NextResponse } from "next/server";
import { syncEscrowDeal } from "@/lib/escrow-sync";
import { db } from "@/lib/db";
import { escrowConfigured } from "@/lib/payments/escrow";
import { rateLimit } from "@/lib/ratelimit";

export const runtime = "nodejs";

/**
 * Escrow.com webhook. The payload is only a hint: the transaction status is
 * re-fetched from the Escrow API before anything changes.
 */
export async function POST(req: NextRequest) {
  if (!escrowConfigured()) return NextResponse.json({ ok: false }, { status: 404 });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (!(await rateLimit(`escrow-hook:${ip}`, 60, 60))) return NextResponse.json({ ok: false }, { status: 429 });
  const body = (await req.json().catch(() => ({}))) as { transaction_id?: number | string };
  const id = body.transaction_id ? String(body.transaction_id) : null;
  if (!id) return NextResponse.json({ ok: false }, { status: 400 });
  const deal = await db.deal.findFirst({ where: { escrowReference: id } });
  if (deal) await syncEscrowDeal(deal.id);
  return NextResponse.json({ ok: true });
}
