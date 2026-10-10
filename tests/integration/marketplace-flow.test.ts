import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { buyNow, placeBid, settleAuction } from "@/lib/auction/service";
import { handlePaymentSucceeded } from "@/lib/payments/handlers";
import { handoverAction, startDealCheckout, expireUnpaidDeals, openDispute, resolveDispute } from "@/lib/deals";
import { activatePromotion, expirePromotions } from "@/lib/promotions";

const tag = `it${Date.now().toString(36)}`;
const ids: { seller: string; buyer: string; buyer2: string; admin: string } = { seller: "", buyer: "", buyer2: "", admin: "" };

async function mkUser(name: string, extra: Record<string, unknown> = {}) {
  const u = await db.user.create({ data: { email: `${name}-${tag}@test.local`, username: `${name}_${tag}`.slice(0, 24), displayName: name, emailVerifiedAt: new Date(), ...extra } });
  return u.id;
}

async function mkListing(opts: { auction?: { start: number; inc: number; reserve?: number; buyNow?: number; endsInMs: number }; price?: number; currency?: "USD" | "GEL" }) {
  const l = await db.listing.create({
    data: {
      slug: `test-${tag}-${Math.random().toString(36).slice(2, 8)}`,
      sellerId: ids.seller,
      status: "ACTIVE",
      saleType: opts.auction ? "AUCTION" : "FIXED",
      title: "Integration Test Business",
      category: "SAAS",
      description: "x".repeat(100),
      currency: opts.currency ?? "USD",
      askingPrice: opts.price ?? null,
      assetsIncluded: ["Domain", "Code"],
      publishedAt: new Date(),
    },
  });
  if (opts.auction) {
    const endsAt = new Date(Date.now() + opts.auction.endsInMs);
    await db.auction.create({ data: { listingId: l.id, status: "LIVE", startingBid: opts.auction.start, minIncrement: opts.auction.inc, reservePrice: opts.auction.reserve ?? null, buyNowPrice: opts.auction.buyNow ?? null, durationHours: 24, startsAt: new Date(), endsAt, originalEndsAt: endsAt } });
  }
  return db.listing.findUniqueOrThrow({ where: { id: l.id }, include: { auction: true } });
}

async function payDeal(dealId: string, userId: string) {
  await startDealCheckout(dealId, userId);
  const p = await db.payment.findFirstOrThrow({ where: { dealId, status: "PROCESSING" } });
  await handlePaymentSucceeded(p.id, { chargeRef: "sbx_ch_test", source: "test" });
  return p;
}

async function completeHandover(dealId: string) {
  await handoverAction(dealId, ids.seller, { kind: "seller_prepared" });
  await handoverAction(dealId, ids.seller, { kind: "domain_done" });
  await handoverAction(dealId, ids.seller, { kind: "assets_delivered" });
  const items = await db.checklistItem.findMany({ where: { dealId } });
  for (const i of items) await handoverAction(dealId, ids.buyer, { kind: "checklist", itemId: i.id, field: "buyerVerified", value: true });
  await handoverAction(dealId, ids.buyer, { kind: "confirm" });
  await handoverAction(dealId, ids.seller, { kind: "confirm" });
}

beforeAll(async () => {
  ids.seller = await mkUser("seller", { payoutAccountId: `sbx_acct_seller_${tag}`, payoutsEnabled: true });
  ids.buyer = await mkUser("buyer");
  ids.buyer2 = await mkUser("buyer2");
  ids.admin = await mkUser("admin", { role: "ADMIN" });
  if ((await db.commissionTier.count()) === 0) {
    await db.commissionTier.createMany({ data: [{ minUsd: 0, maxUsd: 50000, rateBps: 1000 }, { minUsd: 50000, maxUsd: 200000, rateBps: 800 }, { minUsd: 200000, maxUsd: 1000000, rateBps: 600 }, { minUsd: 1000000, maxUsd: null, rateBps: 400 }] });
  }
  // Pin exchange rates so results are deterministic.
  for (const [currency, perUsd] of [["USD", 1], ["GEL", 2.7], ["EUR", 0.9], ["RUB", 90]] as const) {
    await db.exchangeRate.upsert({ where: { currency }, create: { currency, perUsd, source: "test", fetchedAt: new Date() }, update: { perUsd, fetchedAt: new Date() } });
  }
});

afterAll(async () => {
  const users = { email: { endsWith: `-${tag}@test.local` } };
  const userIds = (await db.user.findMany({ where: users, select: { id: true } })).map((u) => u.id);
  // Financial records don't cascade from users on purpose; remove them explicitly for test data.
  await db.payment.deleteMany({ where: { userId: { in: userIds } } });
  await db.dispute.deleteMany({ where: { deal: { sellerId: { in: userIds } } } });
  await db.deal.deleteMany({ where: { sellerId: { in: userIds } } });
  await db.listing.deleteMany({ where: { sellerId: { in: userIds } } });
  await db.auditLog.deleteMany({ where: { actorId: { in: userIds } } });
  await db.user.deleteMany({ where: users });
  await db.$disconnect();
});

describe("auctions", () => {
  it("serializes concurrent bids — no lost updates, consistent bid count", async () => {
    const l = await mkListing({ auction: { start: 10000, inc: 1000, endsInMs: 3600_000 } });
    const a = l.auction!;
    // 10 simultaneous bids from two users at increasing amounts
    const amounts = Array.from({ length: 10 }, (_, i) => 10000 + i * 1000);
    const results = await Promise.allSettled(amounts.map((amt, i) => placeBid(a.id, i % 2 ? ids.buyer : ids.buyer2, amt)));
    const after = await db.auction.findUniqueOrThrow({ where: { id: a.id } });
    const bids = await db.bid.count({ where: { auctionId: a.id } });
    expect(after.bidCount).toBe(bids);
    // Highest accepted bid is the current price and is >= every recorded bid
    const max = await db.bid.aggregate({ where: { auctionId: a.id }, _max: { amount: true } });
    expect(after.currentBid).toBe(max._max.amount);
    expect(results.some((r) => r.status === "fulfilled")).toBe(true);
  });

  it("blocks sellers from bidding on their own auction", async () => {
    const l = await mkListing({ auction: { start: 10000, inc: 1000, endsInMs: 3600_000 } });
    await expect(placeBid(l.auction!.id, ids.seller, 10000)).rejects.toThrow(/own/);
  });

  it("extends the auction when a bid arrives in the final 2 minutes", async () => {
    const l = await mkListing({ auction: { start: 10000, inc: 1000, endsInMs: 60_000 } });
    const before = l.auction!.endsAt!.getTime();
    const r = await placeBid(l.auction!.id, ids.buyer, 10000);
    expect(r.extended).toBe(true);
    expect(r.auction.endsAt!.getTime()).toBe(before + 120_000);
  });

  it("settles with a winner, creates a pending purchase and does not sell below reserve", async () => {
    const sold = await mkListing({ auction: { start: 10000, inc: 1000, endsInMs: 3000 } });
    await placeBid(sold.auction!.id, ids.buyer, 12000);
    const unsold = await mkListing({ auction: { start: 10000, inc: 1000, reserve: 50000, endsInMs: 3000 } });
    await placeBid(unsold.auction!.id, ids.buyer, 10000);
    // Make both auctions due without waiting for the anti-sniping extension.
    await db.auction.updateMany({ where: { id: { in: [sold.auction!.id, unsold.auction!.id] } }, data: { endsAt: new Date(Date.now() - 1000) } });

    expect(await settleAuction(sold.auction!.id)).toMatchObject({ sold: true });
    expect(await settleAuction(unsold.auction!.id)).toMatchObject({ sold: false });
    expect(await settleAuction(sold.auction!.id)).toBeNull(); // idempotent

    const deal = await db.deal.findFirstOrThrow({ where: { listingId: sold.id } });
    expect(deal).toMatchObject({ status: "PENDING_PAYMENT", amount: 12000, buyerId: ids.buyer, commissionRateBps: 1000, commissionAmount: 1200, sellerNetAmount: 10800 });
    expect((await db.listing.findUniqueOrThrow({ where: { id: unsold.id } })).status).toBe("EXPIRED");
  });

  it("Buy Now ends the auction and creates a purchase", async () => {
    const l = await mkListing({ auction: { start: 10000, inc: 1000, buyNow: 80000, endsInMs: 3600_000 } });
    const deal = await buyNow(l.auction!.id, ids.buyer2);
    expect(deal.amount).toBe(80000);
    expect((await db.auction.findUniqueOrThrow({ where: { id: l.auction!.id } })).status).toBe("ENDED");
    await expect(placeBid(l.auction!.id, ids.buyer, 90000)).rejects.toThrow();
  });
});

describe("transactions, handover and commission", () => {
  it("commission is pending until the sale completes, then earned exactly once", async () => {
    const l = await mkListing({ price: 100000 }); // $1,000
    const { createDeal, dealContext } = await import("@/lib/deals");
    const { rates, settings } = await dealContext();
    const deal = await db.$transaction((tx) => createDeal(tx, { listing: l, buyerId: ids.buyer, amount: 100000, source: "FIXED_PRICE", paymentMinutes: 60 }, rates, settings));
    expect(deal).toMatchObject({ commissionRateBps: 800, commissionAmount: 8000, sellerNetAmount: 92000 });
    expect((await db.commission.findUniqueOrThrow({ where: { dealId: deal.id } })).status).toBe("PENDING");

    // Seller cannot advance before verified payment
    await expect(handoverAction(deal.id, ids.seller, { kind: "seller_prepared" })).rejects.toThrow();

    const payment = await payDeal(deal.id, ids.buyer);
    await handlePaymentSucceeded(payment.id, { source: "duplicate-webhook" }); // idempotent
    expect((await db.deal.findUniqueOrThrow({ where: { id: deal.id } })).status).toBe("PAID");

    // Buyer cannot confirm until every checklist item is verified
    await handoverAction(deal.id, ids.seller, { kind: "seller_prepared" });
    await handoverAction(deal.id, ids.seller, { kind: "domain_done", skip: true });
    await handoverAction(deal.id, ids.seller, { kind: "assets_delivered" });
    await expect(handoverAction(deal.id, ids.buyer, { kind: "confirm" })).rejects.toThrow(/checklist/);
    const items = await db.checklistItem.findMany({ where: { dealId: deal.id } });
    for (const i of items) await handoverAction(deal.id, ids.buyer, { kind: "checklist", itemId: i.id, field: "buyerVerified", value: true });
    await handoverAction(deal.id, ids.buyer, { kind: "confirm" });
    expect((await db.deal.findUniqueOrThrow({ where: { id: deal.id } })).status).toBe("BUYER_REVIEW"); // seller hasn't confirmed
    await handoverAction(deal.id, ids.seller, { kind: "confirm" });

    const done = await db.deal.findUniqueOrThrow({ where: { id: deal.id }, include: { commission: true, listing: true } });
    expect(done.status).toBe("COMPLETED");
    expect(done.payoutStatus).toBe("SENT");
    expect(done.releaseApprovedAt).not.toBeNull();
    expect(done.commission!.status).toBe("EARNED");
    expect(done.listing.status).toBe("SOLD");
    const log = await db.auditLog.findFirst({ where: { entityId: deal.id, action: "deal.release_auto_approved" } });
    expect(log).not.toBeNull();
  });

  it("large sales wait for an administrator before release", async () => {
    const l = await mkListing({ price: 500000 }); // $5,000 (above $2,000 admin threshold, below escrow)
    const { createDeal, dealContext, processRelease } = await import("@/lib/deals");
    const { rates, settings } = await dealContext();
    const deal = await db.$transaction((tx) => createDeal(tx, { listing: l, buyerId: ids.buyer, amount: 500000, source: "FIXED_PRICE", paymentMinutes: 60 }, rates, settings));
    expect(deal.escrowRequired).toBe(false);
    await payDeal(deal.id, ids.buyer);
    await completeHandover(deal.id);
    let d = await db.deal.findUniqueOrThrow({ where: { id: deal.id } });
    expect(d.status).toBe("RELEASE_PENDING");
    expect(d.releaseApprovedAt).toBeNull();
    await processRelease(deal.id, ids.admin);
    d = await db.deal.findUniqueOrThrow({ where: { id: deal.id } });
    expect(d.status).toBe("COMPLETED");
    expect(d.releaseApprovedById).toBe(ids.admin);
  });

  it("no commission on cancelled or refunded transactions", async () => {
    const { createDeal, dealContext } = await import("@/lib/deals");
    const { rates, settings } = await dealContext();

    // Unpaid → expires
    const l1 = await mkListing({ price: 30000 });
    const d1 = await db.$transaction((tx) => createDeal(tx, { listing: l1, buyerId: ids.buyer, amount: 30000, source: "FIXED_PRICE", paymentMinutes: 60 }, rates, settings));
    await db.deal.update({ where: { id: d1.id }, data: { paymentDueAt: new Date(Date.now() - 1000) } });
    await expireUnpaidDeals();
    const c1 = await db.deal.findUniqueOrThrow({ where: { id: d1.id }, include: { commission: true, listing: true } });
    expect(c1.status).toBe("CANCELLED");
    expect(c1.commission!.status).toBe("REVERSED");
    expect(c1.listing.status).toBe("ACTIVE"); // back on the market

    // Paid → dispute → refunded
    const l2 = await mkListing({ price: 30000 });
    const d2 = await db.$transaction((tx) => createDeal(tx, { listing: l2, buyerId: ids.buyer, amount: 30000, source: "FIXED_PRICE", paymentMinutes: 60 }, rates, settings));
    await payDeal(d2.id, ids.buyer);
    await openDispute(d2.id, ids.buyer, "Assets not delivered", "The seller never transferred the domain or the repository.");
    const dispute = await db.dispute.findFirstOrThrow({ where: { dealId: d2.id } });
    await expect(handoverAction(d2.id, ids.seller, { kind: "seller_prepared" })).rejects.toThrow();
    await resolveDispute(dispute.id, ids.admin, "BUYER", "No evidence of transfer was provided by the seller.");
    const c2 = await db.deal.findUniqueOrThrow({ where: { id: d2.id }, include: { commission: true } });
    expect(c2.status).toBe("REFUNDED");
    expect(c2.commission!.status).toBe("REVERSED");
  });

  it("GEL sales pick the tier by USD value and charge in GEL", async () => {
    const l = await mkListing({ price: 270000, currency: "GEL" }); // 2,700 GEL ≈ $1,000
    const { createDeal, dealContext } = await import("@/lib/deals");
    const { rates, settings } = await dealContext();
    const deal = await db.$transaction((tx) => createDeal(tx, { listing: l, buyerId: ids.buyer, amount: 270000, source: "FIXED_PRICE", paymentMinutes: 60 }, rates, settings));
    expect(deal).toMatchObject({ currency: "GEL", amountUsd: 100000, commissionRateBps: 800, commissionAmount: 21600 });
  });
});

describe("promotions", () => {
  it("activates only after payment and expires automatically", async () => {
    const l = await mkListing({ price: 10000 });
    const pkg = await db.promotionPackage.findFirst({ where: { code: "STARTER" } });
    if (!pkg) return; // base seed not applied
    const promo = await db.promotion.create({ data: { listingId: l.id, sellerId: ids.seller, packageCode: pkg.code, price: pkg.price, currency: pkg.currency, durationDays: pkg.durationDays, homepage: pkg.homepage, premiumHomepage: pkg.premiumHomepage, featuredAuctions: pkg.featuredAuctions, searchBoost: pkg.searchBoost, border: pkg.border, analytics: pkg.analytics } });
    expect(promo.status).toBe("PENDING_PAYMENT");
    await db.$transaction((tx) => activatePromotion(tx, promo.id));
    const active = await db.promotion.findUniqueOrThrow({ where: { id: promo.id } });
    expect(active.status).toBe("ACTIVE");
    expect(active.endsAt!.getTime() - active.startsAt!.getTime()).toBe(pkg.durationDays * 86400_000);
    await db.promotion.update({ where: { id: promo.id }, data: { endsAt: new Date(Date.now() - 1000) } });
    await expirePromotions();
    expect((await db.promotion.findUniqueOrThrow({ where: { id: promo.id } })).status).toBe("EXPIRED");
  });
});
