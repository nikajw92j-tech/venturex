import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import { db } from "@/lib/db";
import { notifyEndingSoon, settleDueAuctions, startScheduledAuctions } from "@/lib/auction/service";
import { expireUnpaidDeals, processRelease } from "@/lib/deals";
import { expirePromotions } from "@/lib/promotions";
import { flushEmails } from "@/lib/notify";
import { getRates, refreshRates } from "@/lib/rates";
import { renormalizeAll } from "@/lib/listings";
import { syncAllEscrow } from "@/lib/escrow-sync";
import { escrowConfigured } from "@/lib/payments/escrow";
import { verifyDemo } from "@/lib/listing-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(req: NextRequest) {
  const got = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!env.cronSecret || !got) return false;
  const a = Buffer.from(got);
  const b = Buffer.from(env.cronSecret);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Time-based lock so overlapping ticks (several workers/instances) don't duplicate work. */
async function acquire(name: string, seconds: number) {
  const until = new Date(Date.now() + seconds * 1000).toISOString();
  const rows = await db.$queryRaw<{ key: string }[]>`
    INSERT INTO "SiteSetting" ("key", "value", "updatedAt") VALUES (${`lock:${name}`}, to_jsonb(${until}::text), NOW())
    ON CONFLICT ("key") DO UPDATE SET "value" = EXCLUDED."value", "updatedAt" = NOW()
    WHERE ("SiteSetting"."value" #>> '{}')::timestamptz < NOW()
    RETURNING "key"`;
  return rows.length > 0;
}

async function handle(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await acquire("tick", 20))) return NextResponse.json({ ok: true, skipped: "another tick is running" });

  const result: Record<string, number | string> = {};
  const step = async (name: string, fn: () => Promise<number>) => {
    try {
      result[name] = await fn();
    } catch (e) {
      console.error(`[cron] ${name}`, e);
      result[name] = "error";
    }
  };

  await step("auctionsStarted", startScheduledAuctions);
  await step("auctionsSettled", settleDueAuctions);
  await step("endingSoon", notifyEndingSoon);
  await step("unpaidExpired", expireUnpaidDeals);
  await step("promotionsExpired", expirePromotions);
  await step("offersExpired", async () => (await db.offer.updateMany({ where: { status: "PENDING", expiresAt: { lt: new Date() } }, data: { status: "EXPIRED" } })).count);
  await step("releasesRetried", async () => {
    const waiting = await db.deal.findMany({ where: { status: "RELEASE_PENDING", payoutStatus: { in: ["AWAITING_SELLER_ONBOARDING", "NOT_STARTED"] }, releaseApprovedAt: { not: null } }, select: { id: true }, take: 20 });
    for (const d of waiting) await processRelease(d.id);
    return waiting.length;
  });
  if (escrowConfigured() && (await acquire("escrow", 120))) await step("escrowSynced", syncAllEscrow);
  if (await acquire("rates", 6 * 3600)) {
    await step("ratesRefreshed", async () => ((await refreshRates()) ? 1 : 0));
    await step("pricesRenormalized", async () => renormalizeAll((await getRates()).rates));
  }
  if (await acquire("demos", 24 * 3600)) {
    await step("demosChecked", async () => {
      const ls = await db.listing.findMany({ where: { status: "ACTIVE", demoUrl: { not: null } }, select: { id: true }, take: 200 });
      for (const l of ls) await verifyDemo(l.id);
      return ls.length;
    });
  }
  await step("emailOutbox", async () => {
    await flushEmails(100);
    return 0;
  });
  return NextResponse.json({ ok: true, result });
}

export const POST = handle;
// Vercel Cron sends GET with the Authorization header.
export const GET = handle;
