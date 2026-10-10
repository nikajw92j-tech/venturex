"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { actionUser } from "@/lib/auth/session";
import { run, UserError } from "@/lib/action";
import { enforceRateLimit } from "@/lib/ratelimit";
import { placeBid, buyNow } from "@/lib/auction/service";
import { cancelUnpaidDeal, createDeal, dealContext, handoverAction, openDispute, startDealCheckout, type HandoverAction } from "@/lib/deals";
import { getOrCreateConversation, postMessage } from "@/lib/messaging";
import { notify, kickEmails } from "@/lib/notify";
import { audit } from "@/lib/audit";
import { formatMoney, toMinor, type CurrencyCode } from "@/lib/money";

const amountMajor = z.coerce.number().positive("Enter an amount").max(20_000_000, "Amount too large");

// ───────────────────────────── Auctions ─────────────────────────────

export async function placeBidAction(auctionId: string, amount: number, maxAmount: number | null) {
  return run(async () => {
    const user = await actionUser({ verified: true });
    await enforceRateLimit(`bid:${user.id}`, 30, 60);
    const a = toMinor(amountMajor.parse(amount));
    const m = maxAmount ? toMinor(amountMajor.parse(maxAmount)) : null;
    const res = await placeBid(auctionId, user.id, a, m);
    return { leading: res.result.ok && res.result.leaderId === user.id, currentBid: res.auction.currentBid, extended: res.extended };
  });
}

export async function auctionBuyNowAction(auctionId: string) {
  return run(async () => {
    const user = await actionUser({ verified: true });
    await enforceRateLimit(`buy:${user.id}`, 10, 3600);
    const deal = await buyNow(auctionId, user.id);
    return { dealId: deal.id };
  });
}

// ───────────────────────────── Fixed price ─────────────────────────────

export async function buyFixedAction(listingId: string) {
  return run(async () => {
    const user = await actionUser({ verified: true });
    await enforceRateLimit(`buy:${user.id}`, 10, 3600);
    const { rates, settings } = await dealContext();
    const deal = await db.$transaction(async (tx) => {
      // Row lock: only one buyer can reserve a listing at a time.
      await tx.$queryRaw`SELECT id FROM "Listing" WHERE id = ${listingId} FOR UPDATE`;
      const listing = await tx.listing.findUnique({ where: { id: listingId } });
      if (!listing || listing.status !== "ACTIVE") throw new UserError("This business is no longer available");
      if (listing.saleType !== "FIXED" || !listing.askingPrice) throw new UserError("This listing is not sold at a fixed price");
      if (listing.sellerId === user.id) throw new UserError("You can't buy your own listing");
      const d = await createDeal(tx, { listing, buyerId: user.id, amount: listing.askingPrice, source: "FIXED_PRICE", paymentMinutes: settings.checkoutHoldMinutes }, rates, settings);
      await notify(listing.sellerId, "TRANSFER_UPDATE", { listing: listing.title, detail: `A buyer started checkout at ${formatMoney(listing.askingPrice, listing.currency as CurrencyCode)}. The listing is reserved for ${settings.checkoutHoldMinutes} minutes while payment is verified.` }, `/dashboard/deals/${d.id}`, tx);
      return d;
    });
    kickEmails();
    return { dealId: deal.id };
  });
}

export async function payDealAction(dealId: string) {
  return run(async () => {
    const user = await actionUser({ verified: true });
    return { url: await startDealCheckout(dealId, user.id) };
  });
}

export async function cancelDealAction(dealId: string) {
  return run(async () => {
    const user = await actionUser();
    const deal = await db.deal.findUnique({ where: { id: dealId } });
    if (!deal || deal.buyerId !== user.id) throw new UserError("Transaction not found");
    await cancelUnpaidDeal(dealId, "Cancelled by the buyer before payment.", user.id);
    revalidatePath(`/dashboard/deals/${dealId}`);
  });
}

// ───────────────────────────── Offers ─────────────────────────────

export async function makeOfferAction(listingId: string, amount: number, message: string) {
  return run(async () => {
    const user = await actionUser({ verified: true });
    await enforceRateLimit(`offer:${user.id}`, 10, 3600);
    const amt = toMinor(amountMajor.parse(amount));
    const msg = z.string().max(2000).parse(message ?? "");
    const listing = await db.listing.findUnique({ where: { id: listingId } });
    if (!listing || listing.status !== "ACTIVE") throw new UserError("This business is not accepting offers");
    if (listing.saleType !== "FIXED") throw new UserError("Offers are only available on fixed-price listings");
    if (listing.sellerId === user.id) throw new UserError("You can't make an offer on your own listing");
    const pending = await db.offer.count({ where: { listingId, buyerId: user.id, status: "PENDING" } });
    if (pending) throw new UserError("You already have a pending offer on this listing");

    await db.$transaction(async (tx) => {
      const offer = await tx.offer.create({
        data: { listingId, buyerId: user.id, sellerId: listing.sellerId, amount: amt, currency: listing.currency, message: msg || null, expiresAt: new Date(Date.now() + 72 * 3600_000) },
      });
      const convo = await getOrCreateConversation(user.id, listing.sellerId, listing.id, tx);
      await postMessage(tx, { conversationId: convo.id, senderId: user.id, kind: "OFFER", offerId: offer.id, body: `Offer: ${formatMoney(amt, listing.currency as CurrencyCode)}${msg ? `\n\n${msg}` : ""}` });
      await notify(listing.sellerId, "OFFER_RECEIVED", { listing: listing.title, amount: formatMoney(amt, listing.currency as CurrencyCode) }, "/dashboard/offers", tx);
      await audit({ actorId: user.id, action: "offer.created", entityType: "Offer", entityId: offer.id, data: { amount: amt } }, tx);
    });
    kickEmails();
    revalidatePath("/dashboard/offers");
  });
}

export async function respondOfferAction(offerId: string, decision: "accept" | "reject" | "counter" | "withdraw", counterAmount?: number) {
  return run(async () => {
    const user = await actionUser({ verified: true });
    const { rates, settings } = await dealContext();
    const result = await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Offer" WHERE id = ${offerId} FOR UPDATE`;
      const offer = await tx.offer.findUnique({ where: { id: offerId }, include: { listing: true } });
      if (!offer) throw new UserError("Offer not found");
      if (offer.status !== "PENDING") throw new UserError("This offer is no longer open");
      if (offer.expiresAt < new Date()) {
        await tx.offer.update({ where: { id: offerId }, data: { status: "EXPIRED" } });
        throw new UserError("This offer has expired");
      }
      // The party who did NOT make this offer responds; the maker may withdraw.
      const maker = offer.fromSeller ? offer.sellerId : offer.buyerId;
      const responder = offer.fromSeller ? offer.buyerId : offer.sellerId;
      const L = offer.listing;
      const amountStr = formatMoney(offer.amount, offer.currency as CurrencyCode);
      const convo = await getOrCreateConversation(offer.buyerId, offer.sellerId, L.id, tx);

      if (decision === "withdraw") {
        if (user.id !== maker) throw new UserError("Not allowed");
        await tx.offer.update({ where: { id: offerId }, data: { status: "WITHDRAWN", respondedAt: new Date() } });
        await postMessage(tx, { conversationId: convo.id, senderId: user.id, kind: "SYSTEM", body: `Offer of ${amountStr} withdrawn.` });
        return null;
      }
      if (user.id !== responder) throw new UserError("Not allowed");

      if (decision === "reject") {
        await tx.offer.update({ where: { id: offerId }, data: { status: "REJECTED", respondedAt: new Date() } });
        await postMessage(tx, { conversationId: convo.id, senderId: user.id, kind: "SYSTEM", body: `Offer of ${amountStr} declined.` });
        await notify(maker, "OFFER_REJECTED", { listing: L.title, amount: amountStr }, `/listing/${L.slug}`, tx);
        return null;
      }

      if (decision === "counter") {
        const amt = toMinor(amountMajor.parse(counterAmount));
        await tx.offer.update({ where: { id: offerId }, data: { status: "COUNTERED", respondedAt: new Date() } });
        const counter = await tx.offer.create({
          data: { listingId: L.id, buyerId: offer.buyerId, sellerId: offer.sellerId, amount: amt, currency: offer.currency, fromSeller: user.id === offer.sellerId, parentOfferId: offer.id, expiresAt: new Date(Date.now() + 72 * 3600_000) },
        });
        const cStr = formatMoney(amt, offer.currency as CurrencyCode);
        await postMessage(tx, { conversationId: convo.id, senderId: user.id, kind: "OFFER", offerId: counter.id, body: `Counter-offer: ${cStr}` });
        await notify(maker, "OFFER_COUNTERED", { listing: L.title, amount: cStr }, `/messages/${convo.id}`, tx);
        return null;
      }

      // accept
      await tx.$queryRaw`SELECT id FROM "Listing" WHERE id = ${L.id} FOR UPDATE`;
      const fresh = await tx.listing.findUniqueOrThrow({ where: { id: L.id } });
      if (fresh.status !== "ACTIVE") throw new UserError("This business is no longer available");
      await tx.offer.update({ where: { id: offerId }, data: { status: "ACCEPTED", respondedAt: new Date() } });
      await tx.offer.updateMany({ where: { listingId: L.id, status: "PENDING", id: { not: offerId } }, data: { status: "EXPIRED" } });
      const deal = await createDeal(tx, { listing: fresh, buyerId: offer.buyerId, amount: offer.amount, source: "OFFER", offerId: offer.id, paymentHours: 72 }, rates, settings);
      await postMessage(tx, { conversationId: convo.id, senderId: user.id, kind: "SYSTEM", body: `Offer of ${amountStr} accepted. The buyer can now complete payment.` });
      await notify(maker, "OFFER_ACCEPTED", { listing: L.title, amount: amountStr }, `/dashboard/deals/${deal.id}`, tx);
      return deal.id;
    });
    kickEmails();
    revalidatePath("/dashboard/offers");
    return { dealId: result };
  });
}

// ───────────────────────────── Handover & disputes ─────────────────────────────

const handoverSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("seller_prepared"), note: z.string().max(2000).optional() }),
  z.object({ kind: z.literal("domain_done"), note: z.string().max(2000).optional(), skip: z.boolean().optional() }),
  z.object({ kind: z.literal("assets_delivered"), note: z.string().max(2000).optional() }),
  z.object({ kind: z.literal("confirm") }),
  z.object({ kind: z.literal("checklist"), itemId: z.string(), field: z.enum(["sellerDone", "buyerVerified"]), value: z.boolean() }),
]);

export async function handoverActionServer(dealId: string, action: HandoverAction) {
  return run(async () => {
    const user = await actionUser();
    await handoverAction(dealId, user.id, handoverSchema.parse(action));
    revalidatePath(`/dashboard/deals/${dealId}`);
  });
}

export async function openDisputeAction(dealId: string, reason: string, description: string) {
  return run(async () => {
    const user = await actionUser();
    await enforceRateLimit(`dispute:${user.id}`, 5, 3600);
    await openDispute(dealId, user.id, z.string().min(3).max(120).parse(reason), z.string().min(20, "Describe the problem in at least 20 characters").max(5000).parse(description));
    revalidatePath(`/dashboard/deals/${dealId}`);
  });
}

export async function disputeMessageAction(disputeId: string, body: string, fileId: string | null = null) {
  return run(async () => {
    const user = await actionUser();
    const d = await db.dispute.findUnique({ where: { id: disputeId }, include: { deal: true } });
    if (!d || (d.deal.buyerId !== user.id && d.deal.sellerId !== user.id && user.role !== "ADMIN")) throw new UserError("Not allowed");
    if (fileId) {
      const f = await db.storedFile.findUnique({ where: { id: fileId } });
      if (!f || f.ownerId !== user.id) throw new UserError("Invalid attachment");
    }
    await db.disputeMessage.create({ data: { disputeId, authorId: user.id, body: z.string().min(1).max(5000).parse(body), fileId } });
    if (d.status === "OPEN" && user.role === "ADMIN") await db.dispute.update({ where: { id: disputeId }, data: { status: "UNDER_REVIEW" } });
    revalidatePath(`/dashboard/deals/${d.dealId}`);
  });
}

export async function reviewSellerAction(dealId: string, rating: number, comment: string) {
  return run(async () => {
    const user = await actionUser();
    const deal = await db.deal.findUnique({ where: { id: dealId } });
    // Reviews only from buyers of completed deals — never fabricated.
    if (!deal || deal.buyerId !== user.id || deal.status !== "COMPLETED") throw new UserError("Only buyers of completed transactions can leave a review");
    const r = z.number().int().min(1).max(5).parse(rating);
    await db.sellerReview.upsert({
      where: { dealId },
      create: { dealId, authorId: user.id, sellerId: deal.sellerId, rating: r, comment: comment.slice(0, 2000) || null },
      update: { rating: r, comment: comment.slice(0, 2000) || null },
    });
    revalidatePath(`/dashboard/deals/${dealId}`);
  });
}

export async function submitTestimonialAction(dealId: string, quote: string) {
  return run(async () => {
    const user = await actionUser();
    const deal = await db.deal.findUnique({ where: { id: dealId } });
    if (!deal || deal.sellerId !== user.id || deal.status !== "COMPLETED") throw new UserError("Only sellers with a completed sale can share a success story");
    const q = z.string().trim().min(20).max(600).parse(quote);
    await db.testimonial.upsert({ where: { dealId }, create: { dealId, userId: user.id, quote: q }, update: { quote: q, status: "PENDING" } });
  });
}
