import "server-only";
import { UserError } from "../errors";
import { db, type Tx } from "../db";
import { antiSnipe, maskName, minimumNextBid, resolveBid } from "./engine";
import { getRates } from "../rates";
import { getSettings } from "../settings";
import { createDeal } from "../deals";
import { notify, kickEmails } from "../notify";
import { publish } from "../realtime";
import { audit } from "../audit";
import { formatMoney, toUsd, type CurrencyCode } from "../money";

export class BidError extends UserError {
  constructor(message: string, public minRequired?: number) {
    super(message);
  }
}

async function lockAuction(tx: Tx, auctionId: string) {
  // Row lock serializes every bid / settlement on this auction across all instances.
  await tx.$queryRaw`SELECT id FROM "Auction" WHERE id = ${auctionId} FOR UPDATE`;
  const auction = await tx.auction.findUnique({
    where: { id: auctionId },
    include: { listing: { select: { id: true, slug: true, title: true, sellerId: true, status: true, currency: true, market: true, websiteUrl: true, sourceCodeIncluded: true, assetsIncluded: true, category: true } } },
  });
  if (!auction) throw new BidError("Auction not found");
  return auction;
}

const link = (slug: string) => `/listing/${slug}`;

export async function placeBid(auctionId: string, bidderId: string, amount: number, maxAmount?: number | null) {
  const [{ rates }, settings] = await Promise.all([getRates(), getSettings()]);
  const now = new Date();

  const outcome = await db.$transaction(async (tx) => {
    const a = await lockAuction(tx, auctionId);
    const L = a.listing;
    if (a.status !== "LIVE" || L.status !== "ACTIVE") throw new BidError("This auction is not accepting bids");
    if (!a.endsAt) throw new BidError("This auction hasn't started yet");
    if (a.endsAt <= now) throw new BidError("This auction has ended");
    if (L.sellerId === bidderId) throw new BidError("Sellers cannot bid on their own listings");

    const autoBids = await tx.autoBid.findMany({ where: { auctionId, active: true }, select: { bidderId: true, maxAmount: true } });
    const r = resolveBid(
      { startingBid: a.startingBid, minIncrement: a.minIncrement, reservePrice: a.reservePrice, currentBid: a.currentBid, currentBidderId: a.currentBidderId, autoBids },
      { bidderId, amount, maxAmount },
    );
    if (!r.ok) throw new BidError(r.error, r.minRequired);

    // Persist bids in order with distinct timestamps for a clean history.
    let t = now.getTime();
    for (const b of r.bids) {
      await tx.bid.create({ data: { auctionId, bidderId: b.bidderId, amount: b.amount, isAuto: b.isAuto, createdAt: new Date(t++) } });
    }
    if (r.autoBidMax) {
      await tx.autoBid.upsert({
        where: { auctionId_bidderId: { auctionId, bidderId } },
        create: { auctionId, bidderId, maxAmount: r.autoBidMax },
        update: { maxAmount: r.autoBidMax, active: true },
      });
    }

    const placedSomething = r.bids.length > 0;
    const snipe = placedSomething ? antiSnipe(a.endsAt, now, settings.antiSnipeWindowMinutes, settings.antiSnipeExtensionMinutes) : { endsAt: a.endsAt, extended: false };
    const reserveMet = a.reservePrice === null || r.currentBid >= a.reservePrice;

    const updated = await tx.auction.update({
      where: { id: auctionId },
      data: {
        currentBid: r.currentBid,
        currentBidderId: r.leaderId,
        bidCount: { increment: r.bids.length },
        reserveMet,
        endsAt: snipe.endsAt,
        extensions: snipe.extended ? { increment: 1 } : undefined,
      },
    });
    await tx.listing.update({ where: { id: L.id }, data: { priceUsd: toUsd(r.currentBid, L.currency as CurrencyCode, rates) } });

    const amountStr = formatMoney(r.currentBid, L.currency as CurrencyCode);
    if (placedSomething) {
      await notify(L.sellerId, "NEW_BID", { listing: L.title, amount: amountStr }, link(L.slug), tx);
    }
    if (r.outbidUserId) await notify(r.outbidUserId, "OUTBID", { listing: L.title, amount: amountStr }, link(L.slug), tx);
    if (r.bidderOutbid) await notify(bidderId, "OUTBID", { listing: L.title, amount: amountStr }, link(L.slug), tx);
    // Watchers get "new bid" activity too.
    const watchers = await tx.watchlistItem.findMany({ where: { listingId: L.id, userId: { notIn: [bidderId, L.sellerId, r.leaderId, r.outbidUserId ?? ""] } }, select: { userId: true }, take: 200 });
    for (const w of watchers) await notify(w.userId, "NEW_BID", { listing: L.title, amount: amountStr }, link(L.slug), tx);

    const bidders = await tx.user.findMany({ where: { id: { in: r.bids.map((b) => b.bidderId) } }, select: { id: true, username: true } });
    const names = new Map(bidders.map((u) => [u.id, maskName(u.username)]));
    await publish(`auction:${auctionId}`, {
      type: "bid",
      currentBid: updated.currentBid,
      bidCount: updated.bidCount,
      leaderId: updated.currentBidderId,
      endsAt: updated.endsAt?.toISOString(),
      extended: snipe.extended,
      reserveMet,
      minNext: minimumNextBid(updated),
      bids: r.bids.map((b, i) => ({ bidder: names.get(b.bidderId) ?? "•••", bidderId: b.bidderId, amount: b.amount, isAuto: b.isAuto, at: new Date(now.getTime() + i).toISOString() })),
    }, tx);
    await audit({ actorId: bidderId, action: "auction.bid", entityType: "Auction", entityId: auctionId, data: { amount, maxAmount, result: r.currentBid, leader: r.leaderId, extended: snipe.extended } }, tx);

    return { result: r, auction: updated, extended: snipe.extended };
  });
  kickEmails();
  return outcome;
}

/** Closes an auction whose end time has passed. Idempotent; safe to call from anywhere. */
export async function settleAuction(auctionId: string) {
  const [{ rates }, settings] = await Promise.all([getRates(), getSettings()]);
  const res = await db.$transaction(async (tx) => {
    const a = await lockAuction(tx, auctionId);
    if (a.status !== "LIVE" || !a.endsAt || a.endsAt > new Date()) return null;
    const L = a.listing;
    const hasWinner = a.currentBidderId !== null && a.currentBid !== null && (a.reservePrice === null || a.currentBid >= a.reservePrice);

    await tx.auction.update({ where: { id: auctionId }, data: { status: "ENDED", endedAt: new Date(), winnerId: hasWinner ? a.currentBidderId : null } });
    await tx.autoBid.updateMany({ where: { auctionId }, data: { active: false } });
    const amountStr = a.currentBid !== null ? formatMoney(a.currentBid, L.currency as CurrencyCode) : "";

    let dealId: string | null = null;
    if (hasWinner) {
      const deal = await createDeal(
        tx,
        { listing: L, buyerId: a.currentBidderId!, amount: a.currentBid!, source: "AUCTION", paymentHours: settings.auctionPaymentHours },
        rates,
        settings,
      );
      dealId = deal.id;
      await notify(a.currentBidderId!, "AUCTION_WON", { listing: L.title, amount: amountStr, hours: settings.auctionPaymentHours }, `/dashboard/deals/${deal.id}`, tx);
      await notify(L.sellerId, "AUCTION_ENDED", { listing: L.title, outcome: `Sold for ${amountStr}. The buyer has ${settings.auctionPaymentHours} hours to pay. Funds are released only after verified payment and a confirmed handover.` }, `/dashboard/deals/${deal.id}`, tx);
    } else {
      await tx.listing.update({ where: { id: L.id }, data: { status: "EXPIRED" } });
      const outcome = a.currentBid === null ? "The auction ended without bids. You can relist it from your dashboard." : `The reserve price was not met (highest bid ${amountStr}). You can relist or contact the highest bidder.`;
      await notify(L.sellerId, "AUCTION_ENDED", { listing: L.title, outcome }, "/dashboard/listings", tx);
    }
    const losers = await tx.bid.findMany({ where: { auctionId, bidderId: { not: hasWinner ? a.currentBidderId! : "" } }, distinct: ["bidderId"], select: { bidderId: true } });
    for (const l of losers) await notify(l.bidderId, "AUCTION_LOST", { listing: L.title }, link(L.slug), tx);

    await audit({ action: "auction.settled", entityType: "Auction", entityId: auctionId, data: { winner: hasWinner ? a.currentBidderId : null, amount: a.currentBid, reserveMet: a.reserveMet, dealId } }, tx);
    await publish(`auction:${auctionId}`, { type: "ended", winnerId: hasWinner ? a.currentBidderId : null, currentBid: a.currentBid, sold: hasWinner }, tx);
    return { sold: hasWinner, dealId };
  });
  kickEmails();
  return res;
}

export async function buyNow(auctionId: string, buyerId: string) {
  const [{ rates }, settings] = await Promise.all([getRates(), getSettings()]);
  const deal = await db.$transaction(async (tx) => {
    const a = await lockAuction(tx, auctionId);
    const L = a.listing;
    if (a.status !== "LIVE" || L.status !== "ACTIVE" || !a.endsAt || a.endsAt <= new Date()) throw new BidError("This auction is not active");
    if (!a.buyNowPrice) throw new BidError("Buy Now is not available for this auction");
    if (a.currentBid !== null && a.currentBid >= a.buyNowPrice) throw new BidError("Bidding has passed the Buy Now price");
    if (L.sellerId === buyerId) throw new BidError("Sellers cannot buy their own listings");

    await tx.auction.update({ where: { id: auctionId }, data: { status: "ENDED", endedAt: new Date(), winnerId: buyerId, currentBid: a.buyNowPrice, currentBidderId: buyerId } });
    await tx.autoBid.updateMany({ where: { auctionId }, data: { active: false } });
    const deal = await createDeal(tx, { listing: L, buyerId, amount: a.buyNowPrice, source: "BUY_NOW", paymentMinutes: settings.checkoutHoldMinutes }, rates, settings);
    const amountStr = formatMoney(a.buyNowPrice, L.currency as CurrencyCode);
    await notify(L.sellerId, "AUCTION_ENDED", { listing: L.title, outcome: `A buyer used Buy Now at ${amountStr}. Awaiting verified payment.` }, `/dashboard/deals/${deal.id}`, tx);
    const others = await tx.bid.findMany({ where: { auctionId, bidderId: { not: buyerId } }, distinct: ["bidderId"], select: { bidderId: true } });
    for (const o of others) await notify(o.bidderId, "AUCTION_LOST", { listing: L.title }, link(L.slug), tx);
    await audit({ actorId: buyerId, action: "auction.buy_now", entityType: "Auction", entityId: auctionId, data: { amount: a.buyNowPrice, dealId: deal.id } }, tx);
    await publish(`auction:${auctionId}`, { type: "ended", winnerId: buyerId, currentBid: a.buyNowPrice, sold: true, buyNow: true }, tx);
    return deal;
  });
  kickEmails();
  return deal;
}

/**
 * Starts the clock of an auction that is awaiting start (LIVE, no end time, listing ACTIVE).
 * Ends `durationHours` from now; the duration is stored for reference.
 */
export async function startAuction(auctionId: string, durationHours: number, actorId: string | null) {
  await db.$transaction(async (tx) => {
    const a = await lockAuction(tx, auctionId);
    if (a.status !== "LIVE" || a.endsAt) throw new UserError("This auction has already started or is closed");
    if (a.listing.status !== "ACTIVE") throw new UserError("The listing must be approved (active) before its auction can start");
    const now = new Date();
    const endsAt = new Date(now.getTime() + durationHours * 3600_000);
    await tx.auction.update({ where: { id: auctionId }, data: { startsAt: now, endsAt, originalEndsAt: endsAt, durationHours: Math.max(1, Math.round(durationHours)), endingSoonNotified: false } });
    await notify(a.listing.sellerId, "SYSTEM", { title: "Your auction is live", detail: `Bidding on ${a.listing.title} is open until ${endsAt.toUTCString()}.` }, link(a.listing.slug), tx);
    const watchers = await tx.watchlistItem.findMany({ where: { listingId: a.listingId }, select: { userId: true } });
    for (const w of watchers) await notify(w.userId, "SYSTEM", { title: "Auction started", detail: `Bidding on ${a.listing.title} is now open.` }, link(a.listing.slug), tx);
    await audit({ actorId, action: "auction.started", entityType: "Auction", entityId: auctionId, data: { durationHours, endsAt } }, tx);
    await publish(`auction:${auctionId}`, { type: "started", endsAt: endsAt.toISOString() }, tx);
  });
  kickEmails();
}

/** Starts auctions an admin scheduled (startsAt reached, clock not yet running). */
export async function startScheduledAuctions() {
  const due = await db.auction.findMany({ where: { status: "LIVE", endsAt: null, startsAt: { lte: new Date() }, listing: { status: "ACTIVE" } }, select: { id: true, durationHours: true }, take: 100 });
  for (const a of due) await startAuction(a.id, a.durationHours, null).catch((e) => console.error("[auction] scheduled start", a.id, e));
  return due.length;
}

/** Moves the end time of a running auction (extend or shorten). */
export async function setAuctionEnd(auctionId: string, endsAt: Date, actorId: string) {
  await db.$transaction(async (tx) => {
    const a = await lockAuction(tx, auctionId);
    if (a.status !== "LIVE" || !a.endsAt) throw new UserError("Auction is not running");
    if (endsAt.getTime() <= Date.now() + 60_000) throw new UserError("The new end time must be at least a minute in the future (use “End now” to close it)");
    await tx.auction.update({ where: { id: auctionId }, data: { endsAt, endingSoonNotified: endsAt.getTime() - Date.now() <= 3600_000 ? a.endingSoonNotified : false } });
    await audit({ actorId, action: "auction.end_changed", entityType: "Auction", entityId: auctionId, data: { from: a.endsAt, to: endsAt } }, tx);
    await publish(`auction:${auctionId}`, { type: "started", endsAt: endsAt.toISOString() }, tx);
  });
}

/** Closes a running auction immediately: the highest bid wins if the reserve is met. */
export async function endAuctionNow(auctionId: string, actorId: string) {
  await db.$transaction(async (tx) => {
    const a = await lockAuction(tx, auctionId);
    if (a.status !== "LIVE" || !a.endsAt) throw new UserError("Auction is not running");
    await tx.auction.update({ where: { id: auctionId }, data: { endsAt: new Date() } });
    await audit({ actorId, action: "auction.ended_early", entityType: "Auction", entityId: auctionId, data: { scheduledEnd: a.endsAt } }, tx);
  });
  return settleAuction(auctionId);
}

/**
 * Puts a closed auction (ended without a sale, or cancelled) back to "awaiting start":
 * previous bids are cleared and the listing becomes active again.
 */
export async function resetAuction(auctionId: string, actorId: string) {
  await db.$transaction(async (tx) => {
    const a = await lockAuction(tx, auctionId);
    if (a.status === "LIVE") throw new UserError("Auction is still open");
    const openDeal = await tx.deal.findFirst({ where: { listingId: a.listingId, status: { notIn: ["CANCELLED", "REFUNDED"] } }, select: { reference: true } });
    if (openDeal) throw new UserError(`The listing has a transaction (${openDeal.reference}) — it can't be re-auctioned`);
    if (["SOLD", "REMOVED"].includes(a.listing.status)) throw new UserError(`The listing is ${a.listing.status.toLowerCase()}`);
    await tx.bid.deleteMany({ where: { auctionId } });
    await tx.autoBid.deleteMany({ where: { auctionId } });
    await tx.auction.update({ where: { id: auctionId }, data: { status: "LIVE", startsAt: null, endsAt: null, originalEndsAt: null, endedAt: null, extensions: 0, currentBid: null, currentBidderId: null, bidCount: 0, reserveMet: false, winnerId: null, endingSoonNotified: false } });
    const { rates } = await getRates();
    await tx.listing.update({ where: { id: a.listingId }, data: { status: "ACTIVE", priceUsd: toUsd(a.startingBid, a.listing.currency as CurrencyCode, rates) } });
    await audit({ actorId, action: "auction.reset", entityType: "Auction", entityId: auctionId }, tx);
  });
}

export async function settleDueAuctions() {
  const due = await db.auction.findMany({ where: { status: "LIVE", endsAt: { lte: new Date() } }, select: { id: true }, take: 100 });
  for (const a of due) await settleAuction(a.id).catch((e) => console.error("[auction] settle", a.id, e));
  return due.length;
}

export async function notifyEndingSoon() {
  const soon = await db.auction.findMany({
    where: { status: "LIVE", endingSoonNotified: false, endsAt: { gt: new Date(), lte: new Date(Date.now() + 3600_000) } },
    include: { listing: { select: { title: true, slug: true, currency: true, watchers: { select: { userId: true } } } }, bids: { distinct: ["bidderId"], select: { bidderId: true } } },
  });
  for (const a of soon) {
    const claimed = await db.auction.updateMany({ where: { id: a.id, endingSoonNotified: false }, data: { endingSoonNotified: true } });
    if (!claimed.count) continue;
    const users = new Set([...a.listing.watchers.map((w) => w.userId), ...a.bids.map((b) => b.bidderId)]);
    const amount = formatMoney(a.currentBid ?? a.startingBid, a.listing.currency as CurrencyCode);
    for (const uid of users) await notify(uid, "AUCTION_ENDING_SOON", { listing: a.listing.title, amount }, link(a.listing.slug));
  }
  if (soon.length) kickEmails();
  return soon.length;
}
