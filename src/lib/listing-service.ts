import "server-only";
import type { Listing } from "@prisma/client";
import { db, type Tx } from "./db";
import { notify, kickEmails } from "./notify";
import { audit } from "./audit";
import { getRates } from "./rates";
import { getSettings } from "./settings";
import { normalizedFields } from "./listings";
import { UserError } from "./errors";
import type { CurrencyCode } from "./money";

export const COUNTED_STATUSES = ["PENDING_REVIEW", "ACTIVE", "PENDING_SALE"] as const;

export async function userPlan(userId: string) {
  const sub = await db.subscription.findUnique({ where: { userId }, include: { plan: true } });
  const active = sub && (sub.status === "ACTIVE" || (sub.status === "PAST_DUE" && sub.currentPeriodEnd && sub.currentPeriodEnd > new Date()));
  if (active) return sub.plan;
  return (await db.plan.findUnique({ where: { code: "FREE" } })) ?? { code: "FREE", name: "Free", maxActiveListings: 2, analyticsLevel: 0, storefront: false, teamSeats: 0, priorityReview: false, priceMonthly: 0, currency: "USD" as const, features: [], sortOrder: 0, active: true, updatedAt: new Date() };
}

export async function assertListingCapacity(userId: string, excludeListingId?: string) {
  const plan = await userPlan(userId);
  const count = await db.listing.count({ where: { sellerId: userId, status: { in: [...COUNTED_STATUSES] }, ...(excludeListingId ? { id: { not: excludeListingId } } : {}) } });
  if (count >= plan.maxActiveListings) {
    throw new UserError(`You've reached the ${plan.maxActiveListings} active listing limit of the ${plan.name} plan. Upgrade your plan to list more.`);
  }
}

/**
 * Makes a listing live: sets publish time and, when auto-start is enabled, starts its auction clock.
 * Otherwise the auction stays LIVE with no end time ("awaiting start") until an admin starts it.
 */
export async function goLive(tx: Tx, listing: Listing) {
  const now = new Date();
  const [{ rates }, settings] = await Promise.all([getRates(), getSettings()]);
  let headline = listing.askingPrice ?? 0;
  if (listing.saleType === "AUCTION") {
    const a = await tx.auction.findUnique({ where: { listingId: listing.id } });
    if (!a) throw new UserError("Auction settings missing");
    const endsAt = settings.autoStartAuctions ? new Date(now.getTime() + a.durationHours * 3600_000) : null;
    await tx.auction.update({ where: { id: a.id }, data: { status: "LIVE", startsAt: endsAt ? now : null, endsAt, originalEndsAt: endsAt } });
    headline = a.currentBid ?? a.startingBid;
  }
  await tx.listing.update({
    where: { id: listing.id },
    data: { status: "ACTIVE", publishedAt: listing.publishedAt ?? now, rejectionReason: null, ...normalizedFields({ ...listing, currency: listing.currency as CurrencyCode }, headline, rates) },
  });
}

export async function notifyInterestedBuyers(listingId: string) {
  const l = await db.listing.findUnique({ where: { id: listingId }, select: { id: true, title: true, slug: true, category: true, sellerId: true, market: true, priceUsd: true } });
  if (!l) return;
  const since = new Date(Date.now() - 6 * 3600_000);
  // Saved searches whose category (or no category) and market match.
  const searches = await db.savedSearch.findMany({ where: { notify: true, userId: { not: l.sellerId } }, select: { id: true, userId: true, query: true, lastNotifiedAt: true }, take: 2000 });
  const targets = new Set<string>();
  for (const s of searches) {
    const q = (s.query ?? {}) as Record<string, string>;
    if (q.market && q.market !== l.market) continue;
    if (q.category && q.category !== l.category) continue;
    if (!q.category && !q.q) continue; // avoid notifying "everything" searches on every listing
    if (s.lastNotifiedAt && s.lastNotifiedAt > since) continue;
    targets.add(s.userId);
    await db.savedSearch.update({ where: { id: s.id }, data: { lastNotifiedAt: new Date() } });
  }
  // Watchers of similar listings (same category)
  const watchers = await db.watchlistItem.findMany({ where: { listing: { category: l.category }, userId: { not: l.sellerId } }, distinct: ["userId"], select: { userId: true }, take: 500 });
  for (const w of watchers) targets.add(w.userId);
  for (const uid of targets) await notify(uid, "SIMILAR_LISTING", { listing: l.title }, `/listing/${l.slug}`);
  kickEmails();
}

export async function approveListing(listingId: string, adminId: string | null) {
  await db.$transaction(async (tx) => {
    const l = await tx.listing.findUnique({ where: { id: listingId } });
    if (!l || l.status !== "PENDING_REVIEW") throw new UserError("Listing is not awaiting review");
    await goLive(tx, l);
    await audit({ actorId: adminId, action: "listing.approved", entityType: "Listing", entityId: listingId }, tx);
    await notify(l.sellerId, "LISTING_APPROVED", { listing: l.title }, `/listing/${l.slug}`, tx);
  });
  await notifyInterestedBuyers(listingId).catch((e) => console.error("[listing] notify interested", e));
  kickEmails();
}

export async function rejectListing(listingId: string, adminId: string, reason: string) {
  await db.$transaction(async (tx) => {
    const l = await tx.listing.findUnique({ where: { id: listingId } });
    if (!l || l.status !== "PENDING_REVIEW") throw new UserError("Listing is not awaiting review");
    await tx.listing.update({ where: { id: listingId }, data: { status: "REJECTED", rejectionReason: reason } });
    await audit({ actorId: adminId, action: "listing.rejected", entityType: "Listing", entityId: listingId, data: { reason } }, tx);
    await notify(l.sellerId, "LISTING_REJECTED", { listing: l.title, reason }, `/sell?edit=${l.id}`, tx);
  });
  kickEmails();
}

/** Checks a Starter Market demo URL responds; stores the verification timestamp. */
export async function verifyDemo(listingId: string) {
  const l = await db.listing.findUnique({ where: { id: listingId }, select: { demoUrl: true } });
  if (!l?.demoUrl) return false;
  let ok = false;
  try {
    const u = new URL(l.demoUrl);
    // Never probe private/internal hosts (SSRF protection).
    if (!/^https?:$/.test(u.protocol) || /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.|169\.254\.|\[?::1)/i.test(u.hostname)) throw new Error("blocked host");
    const res = await fetch(u, { method: "GET", redirect: "follow", signal: AbortSignal.timeout(8000), headers: { "User-Agent": "VENTUREX-DemoCheck/1.0" } });
    ok = res.status >= 200 && res.status < 400;
  } catch {
    ok = false;
  }
  await db.listing.update({ where: { id: listingId }, data: { demoCheckedAt: new Date(), demoVerifiedAt: ok ? new Date() : null } });
  return ok;
}
