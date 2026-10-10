"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import type { Currency } from "@prisma/client";
import { db } from "@/lib/db";
import { actionUser } from "@/lib/auth/session";
import { run, UserError } from "@/lib/action";
import { audit } from "@/lib/audit";
import { approveListing, rejectListing } from "@/lib/listing-service";
import { cancelUnpaidDeal, markDealPaid, processRelease, resolveDispute, completeDeal } from "@/lib/deals";
import { endAuctionNow, resetAuction, setAuctionEnd, settleAuction, startAuction } from "@/lib/auction/service";
import { validateTiers } from "@/lib/commission";
import { updateSettings, DEFAULT_SETTINGS, type SiteSettings } from "@/lib/settings";
import { notify, kickEmails } from "@/lib/notify";
import { publish } from "@/lib/realtime";

const admin = () => actionUser({ admin: true });
const reval = (...paths: string[]) => paths.forEach((p) => revalidatePath(p));

// ───────────────────────────── Listings ─────────────────────────────

export async function approveListingAdmin(id: string) {
  return run(async () => {
    const a = await admin();
    await approveListing(id, a.id);
    reval("/admin/listings", "/");
  });
}

export async function rejectListingAdmin(id: string, reason: string) {
  return run(async () => {
    const a = await admin();
    await rejectListing(id, a.id, z.string().trim().min(5, "Give the seller a reason").max(1000).parse(reason));
    reval("/admin/listings");
  });
}

export async function removeListingAdmin(id: string, reasonInput: string) {
  return run(async () => {
    const reason = reasonInput?.trim() || "Policy violation";
    const a = await admin();
    const l = await db.listing.findUnique({ where: { id }, include: { auction: true, deals: { where: { status: { in: ["PAID", "IN_TRANSFER", "BUYER_REVIEW", "RELEASE_PENDING", "DISPUTED"] } } } } });
    if (!l) throw new UserError("Listing not found");
    if (l.deals.length) throw new UserError("This listing has a paid transaction in progress — resolve it via Disputes first");
    await db.$transaction(async (tx) => {
      await tx.listing.update({ where: { id }, data: { status: "REMOVED", featured: false, rejectionReason: reason } });
      if (l.auction?.status === "LIVE") await tx.auction.update({ where: { id: l.auction.id }, data: { status: "CANCELLED", endedAt: new Date() } });
      await tx.offer.updateMany({ where: { listingId: id, status: "PENDING" }, data: { status: "EXPIRED" } });
      await tx.promotion.updateMany({ where: { listingId: id, status: { in: ["ACTIVE", "PENDING_PAYMENT"] } }, data: { status: "CANCELLED" } });
      await audit({ actorId: a.id, action: "listing.removed", entityType: "Listing", entityId: id, data: { reason } }, tx);
      await notify(l.sellerId, "LISTING_REJECTED", { listing: l.title, reason: `Removed by VENTUREX: ${reason}` }, "/dashboard/listings", tx);
      if (l.auction) await publish(`auction:${l.auction.id}`, { type: "ended", winnerId: null, currentBid: l.auction.currentBid, sold: false }, tx);
    });
    for (const d of await db.deal.findMany({ where: { listingId: id, status: "PENDING_PAYMENT" }, select: { id: true } })) {
      await cancelUnpaidDeal(d.id, "The listing was removed by VENTUREX.", a.id);
    }
    kickEmails();
    reval("/admin/listings");
  });
}

/** Permanently deletes a listing with everything attached to it. Not possible once a transaction exists. */
export async function deleteListingAdmin(id: string) {
  return run(async () => {
    const a = await admin();
    const l = await db.listing.findUnique({ where: { id }, include: { auction: { select: { id: true, status: true } }, _count: { select: { deals: true } } } });
    if (!l) throw new UserError("Listing not found");
    if (l._count.deals) throw new UserError("This listing has transactions on record — use “Remove” instead so the history is kept");
    await db.$transaction(async (tx) => {
      if (l.auction?.status === "LIVE") await publish(`auction:${l.auction.id}`, { type: "ended", winnerId: null, currentBid: null, sold: false }, tx);
      await tx.listing.delete({ where: { id } });
      await audit({ actorId: a.id, action: "listing.deleted", entityType: "Listing", entityId: id, data: { title: l.title, sellerId: l.sellerId } }, tx);
    });
    reval("/admin/listings", "/admin/auctions", "/", "/marketplace", "/auctions");
  });
}

export async function setFeaturedAdmin(id: string, featured: boolean, rank = 0) {
  return run(async () => {
    const a = await admin();
    await db.listing.update({ where: { id }, data: { featured, featuredRank: rank } });
    await audit({ actorId: a.id, action: featured ? "listing.featured" : "listing.unfeatured", entityType: "Listing", entityId: id, data: { rank } });
    reval("/admin/listings", "/");
  });
}

export async function setListingVerificationAdmin(id: string, field: "financialsVerified" | "trafficVerified", value: boolean) {
  return run(async () => {
    const a = await admin();
    await db.listing.update({ where: { id }, data: { [field]: value } });
    await audit({ actorId: a.id, action: `listing.${field}`, entityType: "Listing", entityId: id, data: { value } });
    reval("/admin/listings");
  });
}

// ───────────────────────────── Users ─────────────────────────────

export async function suspendUserAdmin(id: string, suspend: boolean, reasonInput: string) {
  return run(async () => {
    const reason = reasonInput?.trim() || (suspend ? "Policy violation" : "");
    const a = await admin();
    if (id === a.id) throw new UserError("You can't suspend yourself");
    await db.$transaction(async (tx) => {
      await tx.user.update({ where: { id }, data: { status: suspend ? "SUSPENDED" : "ACTIVE", suspendedReason: suspend ? reason : null } });
      if (suspend) {
        await tx.session.deleteMany({ where: { userId: id } });
        // Pull live listings from the market (in-progress paid transactions continue under admin oversight).
        await tx.listing.updateMany({ where: { sellerId: id, status: { in: ["ACTIVE", "PENDING_REVIEW"] } }, data: { status: "WITHDRAWN" } });
        await tx.auction.updateMany({ where: { listing: { sellerId: id }, status: "LIVE" }, data: { status: "CANCELLED", endedAt: new Date() } });
        await tx.autoBid.updateMany({ where: { bidderId: id }, data: { active: false } });
      }
      await audit({ actorId: a.id, action: suspend ? "user.suspended" : "user.unsuspended", entityType: "User", entityId: id, data: { reason } }, tx);
    });
    reval("/admin/users");
  });
}

export async function setUserFlagsAdmin(id: string, patch: { identityVerified?: boolean; businessVerified?: boolean; role?: "USER" | "ADMIN" }) {
  return run(async () => {
    const a = await admin();
    if (id === a.id && patch.role === "USER") throw new UserError("You can't remove your own admin role");
    await db.user.update({ where: { id }, data: patch });
    await audit({ actorId: a.id, action: "user.flags_updated", entityType: "User", entityId: id, data: patch });
    reval("/admin/users");
  });
}

// ───────────────────────────── Auctions ─────────────────────────────

export async function cancelAuctionAdmin(auctionId: string, reasonInput: string) {
  return run(async () => {
    const reason = reasonInput?.trim() || "Cancelled by VENTUREX.";
    const a = await admin();
    const auction = await db.auction.findUnique({ where: { id: auctionId }, include: { listing: true, bids: { distinct: ["bidderId"], select: { bidderId: true } } } });
    if (!auction || auction.status !== "LIVE") throw new UserError("Auction is not live");
    await db.$transaction(async (tx) => {
      await tx.auction.update({ where: { id: auctionId }, data: { status: "CANCELLED", endedAt: new Date() } });
      await tx.autoBid.updateMany({ where: { auctionId }, data: { active: false } });
      await tx.listing.update({ where: { id: auction.listingId }, data: { status: "WITHDRAWN" } });
      for (const b of auction.bids) await notify(b.bidderId, "SYSTEM", { title: "Auction cancelled", detail: `The auction for ${auction.listing.title} was cancelled by VENTUREX. ${reason}` }, `/listing/${auction.listing.slug}`, tx);
      await notify(auction.listing.sellerId, "SYSTEM", { title: "Auction cancelled", detail: `Your auction for ${auction.listing.title} was cancelled: ${reason}` }, "/dashboard/listings", tx);
      await audit({ actorId: a.id, action: "auction.cancelled", entityType: "Auction", entityId: auctionId, data: { reason } }, tx);
      await publish(`auction:${auctionId}`, { type: "ended", winnerId: null, currentBid: auction.currentBid, sold: false }, tx);
    });
    kickEmails();
    reval("/admin/auctions");
  });
}

export async function settleAuctionAdmin(auctionId: string) {
  return run(async () => {
    await admin();
    const r = await settleAuction(auctionId);
    if (!r) throw new UserError("Auction has not reached its end time");
    reval("/admin/auctions");
  });
}

const hoursSchema = z.coerce.number({ invalid_type_error: "Enter the duration in hours" }).min(0.1, "Duration must be positive").max(24 * 90, "At most 90 days");
const futureDate = (label: string) => z.string().min(1, `Choose the ${label}`).transform((s, ctx) => {
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) {
    ctx.addIssue({ code: "custom", message: `Invalid ${label}` });
    return z.NEVER;
  }
  return d;
});

async function reloadAuction(auctionId: string) {
  const a = await db.auction.findUnique({ where: { id: auctionId }, select: { listing: { select: { slug: true } } } });
  reval("/admin/auctions", "/auctions", "/");
  if (a) reval(`/listing/${a.listing.slug}`);
}

export async function startAuctionAdmin(auctionId: string, input: { hours: string }) {
  return run(async () => {
    const a = await admin();
    await startAuction(auctionId, hoursSchema.parse(input.hours), a.id);
    kickEmails();
    await reloadAuction(auctionId);
  });
}

/** Sets (or clears, with an empty date) the time an awaiting auction starts by itself. */
export async function scheduleAuctionAdmin(auctionId: string, input: { startsAt: string; hours: string }) {
  return run(async () => {
    const a = await admin();
    const hours = hoursSchema.parse(input.hours);
    const startsAt = input.startsAt ? futureDate("start time").parse(input.startsAt) : null;
    if (startsAt && startsAt.getTime() < Date.now()) throw new UserError("The start time is in the past — use “Start now”");
    const auction = await db.auction.findUnique({ where: { id: auctionId } });
    if (!auction || auction.status !== "LIVE" || auction.endsAt) throw new UserError("Only auctions awaiting start can be scheduled");
    await db.auction.update({ where: { id: auctionId }, data: { startsAt, durationHours: Math.round(hours) || 1 } });
    await audit({ actorId: a.id, action: startsAt ? "auction.scheduled" : "auction.unscheduled", entityType: "Auction", entityId: auctionId, data: { startsAt, hours } });
    await reloadAuction(auctionId);
  });
}

export async function extendAuctionAdmin(auctionId: string, input: { hours: string }) {
  return run(async () => {
    const a = await admin();
    const hours = z.coerce.number({ invalid_type_error: "Enter hours" }).min(-24 * 90).max(24 * 90).refine((h) => h !== 0, "Enter a non-zero number of hours").parse(input.hours);
    const auction = await db.auction.findUnique({ where: { id: auctionId } });
    if (!auction?.endsAt) throw new UserError("Auction is not running");
    await setAuctionEnd(auctionId, new Date(auction.endsAt.getTime() + hours * 3600_000), a.id);
    await reloadAuction(auctionId);
  });
}

export async function setAuctionEndAdmin(auctionId: string, input: { endsAt: string }) {
  return run(async () => {
    const a = await admin();
    await setAuctionEnd(auctionId, futureDate("end time").parse(input.endsAt), a.id);
    await reloadAuction(auctionId);
  });
}

export async function endAuctionNowAdmin(auctionId: string) {
  return run(async () => {
    const a = await admin();
    await endAuctionNow(auctionId, a.id);
    await reloadAuction(auctionId);
  });
}

const money = z.string().trim().transform((s, ctx) => {
  if (s === "") return null;
  const n = Number(s.replace(",", "."));
  if (!Number.isFinite(n) || n < 0) {
    ctx.addIssue({ code: "custom", message: `Invalid amount: ${s}` });
    return z.NEVER;
  }
  return Math.round(n * 100);
});

/** Edits auction terms. Amounts are in the listing currency's major units; empty reserve / buy-now removes them. */
export async function updateAuctionTermsAdmin(auctionId: string, input: { startingBid: string; minIncrement: string; reservePrice: string; buyNowPrice: string }) {
  return run(async () => {
    const a = await admin();
    const v = z.object({ startingBid: money, minIncrement: money, reservePrice: money, buyNowPrice: money }).parse(input);
    await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Auction" WHERE id = ${auctionId} FOR UPDATE`;
      const auction = await tx.auction.findUnique({ where: { id: auctionId } });
      if (!auction || auction.status !== "LIVE") throw new UserError("Only open auctions can be edited");
      const startingBid = v.startingBid ?? auction.startingBid;
      if (startingBid !== auction.startingBid && auction.bidCount > 0) throw new UserError("The starting bid can't change once bids exist");
      if (startingBid < 1) throw new UserError("Starting bid must be positive");
      const minIncrement = v.minIncrement ?? auction.minIncrement;
      if (minIncrement < 1) throw new UserError("Minimum increment must be positive");
      const price = auction.currentBid ?? startingBid;
      if (v.buyNowPrice !== null && v.buyNowPrice <= price) throw new UserError("Buy Now must be above the current price");
      if (v.reservePrice !== null && v.reservePrice < startingBid) throw new UserError("Reserve can't be below the starting bid");
      const data = { startingBid, minIncrement, reservePrice: v.reservePrice, buyNowPrice: v.buyNowPrice, reserveMet: auction.currentBid !== null && (v.reservePrice === null || auction.currentBid >= v.reservePrice) };
      await tx.auction.update({ where: { id: auctionId }, data });
      await audit({ actorId: a.id, action: "auction.terms_updated", entityType: "Auction", entityId: auctionId, data: { before: { startingBid: auction.startingBid, minIncrement: auction.minIncrement, reservePrice: auction.reservePrice, buyNowPrice: auction.buyNowPrice }, after: data } }, tx);
    });
    await reloadAuction(auctionId);
  });
}

export async function resetAuctionAdmin(auctionId: string) {
  return run(async () => {
    const a = await admin();
    await resetAuction(auctionId, a.id);
    await reloadAuction(auctionId);
  });
}

// ───────────────────────────── Transactions ─────────────────────────────

export async function approveReleaseAdmin(dealId: string) {
  return run(async () => {
    const a = await admin();
    const deal = await db.deal.findUnique({ where: { id: dealId } });
    if (!deal || deal.status !== "RELEASE_PENDING") throw new UserError("Transaction is not awaiting release");
    if (!deal.paidAt) throw new UserError("Payment has not been verified");
    if (deal.escrowRequired) throw new UserError("Escrow transactions are released by the escrow partner");
    await processRelease(dealId, a.id);
    reval("/admin/transactions");
  });
}

/**
 * Manual escrow workflow (used when the escrow API isn't configured or the
 * currency isn't supported). The admin records the verified escrow reference;
 * this is a documented, audited approval — never a buyer button click.
 */
export async function recordEscrowAdmin(dealId: string, step: "funded" | "released", reference: string) {
  return run(async () => {
    const a = await admin();
    const ref = z.string().trim().min(4, "Enter the escrow transaction reference").max(120).parse(reference);
    const deal = await db.deal.findUnique({ where: { id: dealId } });
    if (!deal?.escrowRequired) throw new UserError("Not an escrow transaction");
    if (step === "funded") {
      if (deal.status !== "PENDING_PAYMENT") throw new UserError("Transaction is not awaiting payment");
      await db.deal.update({ where: { id: dealId }, data: { escrowReference: ref, escrowStatus: "funded" } });
      await db.$transaction((tx) => markDealPaid(tx, dealId, `escrow (recorded by admin, ref ${ref})`));
    } else {
      if (deal.status !== "RELEASE_PENDING" || !deal.buyerConfirmedAt || !deal.sellerConfirmedAt) throw new UserError("Both parties must confirm the handover first");
      await db.deal.update({ where: { id: dealId }, data: { escrowStatus: "released", releaseApprovedAt: new Date(), releaseApprovedById: a.id } });
      await completeDeal(dealId, { escrow: true, payoutReference: `escrow:${ref}` });
    }
    await audit({ actorId: a.id, action: `deal.escrow_${step}_recorded`, entityType: "Deal", entityId: dealId, data: { reference: ref } });
    kickEmails();
    reval("/admin/transactions");
  });
}

export async function cancelDealAdmin(dealId: string, reason: string) {
  return run(async () => {
    const a = await admin();
    await cancelUnpaidDeal(dealId, reason?.trim().slice(0, 500) || "Cancelled by VENTUREX.", a.id);
    reval("/admin/transactions");
  });
}

// ───────────────────────────── Disputes ─────────────────────────────

export async function resolveDisputeAdmin(disputeId: string, outcome: "BUYER" | "SELLER", resolution: string) {
  return run(async () => {
    const a = await admin();
    await resolveDispute(disputeId, a.id, outcome, z.string().trim().min(10, "Explain the decision").max(3000).parse(resolution));
    reval("/admin/disputes");
  });
}

// ───────────────────────────── Reports & verification ─────────────────────────────

export async function resolveReportAdmin(id: string, status: "RESOLVED" | "DISMISSED", resolution: string) {
  return run(async () => {
    const a = await admin();
    await db.report.update({ where: { id }, data: { status, resolution: resolution.slice(0, 1000) || null, resolvedById: a.id, resolvedAt: new Date() } });
    await audit({ actorId: a.id, action: `report.${status.toLowerCase()}`, entityType: "Report", entityId: id });
    reval("/admin/reports");
  });
}

export async function reviewVerificationAdmin(id: string, approve: boolean, note: string) {
  return run(async () => {
    const a = await admin();
    const req = await db.verificationRequest.findUnique({ where: { id } });
    if (!req || req.status !== "PENDING") throw new UserError("Request is not pending");
    await db.$transaction(async (tx) => {
      await tx.verificationRequest.update({ where: { id }, data: { status: approve ? "APPROVED" : "REJECTED", reviewerNote: note.slice(0, 1000) || null, reviewedById: a.id, reviewedAt: new Date() } });
      if (approve) {
        if (req.type === "IDENTITY") await tx.user.update({ where: { id: req.userId }, data: { identityVerified: true } });
        if (req.type === "BUSINESS") await tx.user.update({ where: { id: req.userId }, data: { businessVerified: true } });
        if (req.type === "FINANCIALS" && req.listingId) await tx.listing.update({ where: { id: req.listingId }, data: { financialsVerified: true } });
        if (req.type === "TRAFFIC" && req.listingId) await tx.listing.update({ where: { id: req.listingId }, data: { trafficVerified: true } });
      }
      await audit({ actorId: a.id, action: approve ? "verification.approved" : "verification.rejected", entityType: "VerificationRequest", entityId: id, data: { type: req.type, note } }, tx);
      await notify(req.userId, "VERIFICATION_UPDATE", { detail: `Your ${req.type.toLowerCase()} verification was ${approve ? "approved" : "not approved"}.${note ? ` ${note}` : ""}` }, "/dashboard/verification", tx);
    });
    kickEmails();
    reval("/admin/verifications");
  });
}

export async function moderateTestimonialAdmin(id: string, approve: boolean) {
  return run(async () => {
    const a = await admin();
    await db.testimonial.update({ where: { id }, data: { status: approve ? "APPROVED" : "REJECTED" } });
    await audit({ actorId: a.id, action: approve ? "testimonial.approved" : "testimonial.rejected", entityType: "Testimonial", entityId: id });
    reval("/admin/settings", "/");
  });
}

// ───────────────────────────── Configuration ─────────────────────────────

const tierSchema = z.array(z.object({ minUsd: z.coerce.number().min(0), maxUsd: z.union([z.null(), z.coerce.number().positive()]), ratePct: z.coerce.number().min(0).max(50) })).min(1).max(10);

export async function saveCommissionTiersAdmin(input: z.input<typeof tierSchema>) {
  return run(async () => {
    const a = await admin();
    const tiers = tierSchema.parse(input).map((t) => ({ minUsd: Math.round(t.minUsd * 100), maxUsd: t.maxUsd === null ? null : Math.round(t.maxUsd * 100), rateBps: Math.round(t.ratePct * 100) }));
    const err = validateTiers(tiers);
    if (err) throw new UserError(err);
    const before = await db.commissionTier.findMany();
    await db.$transaction([db.commissionTier.deleteMany(), db.commissionTier.createMany({ data: tiers })]);
    // Existing deals keep the rate captured when they were created.
    await audit({ actorId: a.id, action: "commission.tiers_updated", entityType: "CommissionTier", entityId: "all", data: { before, after: tiers } });
    reval("/admin/commissions", "/pricing");
  });
}

const planSchema = z.object({ code: z.string(), name: z.string().min(2).max(40), price: z.coerce.number().min(0).max(10000), maxActiveListings: z.coerce.number().int().min(1).max(1000), features: z.string().max(3000), teamSeats: z.coerce.number().int().min(0).max(100), analyticsLevel: z.coerce.number().int().min(0).max(2), storefront: z.boolean(), priorityReview: z.boolean(), active: z.boolean() });

export async function savePlanAdmin(input: z.input<typeof planSchema>) {
  return run(async () => {
    const a = await admin();
    const v = planSchema.parse(input);
    if (v.code === "FREE" && v.price !== 0) throw new UserError("The Free plan must stay free");
    await db.plan.update({ where: { code: v.code }, data: { name: v.name, priceMonthly: Math.round(v.price * 100), maxActiveListings: v.maxActiveListings, features: v.features.split("\n").map((s) => s.trim()).filter(Boolean), teamSeats: v.teamSeats, analyticsLevel: v.analyticsLevel, storefront: v.storefront, priorityReview: v.priorityReview, active: v.code === "FREE" ? true : v.active } });
    await audit({ actorId: a.id, action: "plan.updated", entityType: "Plan", entityId: v.code, data: v });
    reval("/admin/plans", "/pricing");
  });
}

const packageSchema = z.object({ code: z.string(), name: z.string().min(2).max(40), price: z.coerce.number().min(0).max(100000), currency: z.enum(["USD", "GEL", "EUR"]), durationDays: z.coerce.number().int().min(1).max(365), features: z.string().max(3000), active: z.boolean() });

export async function savePackageAdmin(input: z.input<typeof packageSchema>) {
  return run(async () => {
    const a = await admin();
    const v = packageSchema.parse(input);
    // Paid promotions keep their purchase-time snapshot; edits apply to new purchases only.
    await db.promotionPackage.update({ where: { code: v.code }, data: { name: v.name, price: Math.round(v.price * 100), currency: v.currency as Currency, durationDays: v.durationDays, features: v.features.split("\n").map((s) => s.trim()).filter(Boolean), active: v.active } });
    await audit({ actorId: a.id, action: "promotion_package.updated", entityType: "PromotionPackage", entityId: v.code, data: v });
    reval("/admin/promotions", "/pricing");
  });
}

export async function cancelPromotionAdmin(id: string) {
  return run(async () => {
    const a = await admin();
    await db.promotion.update({ where: { id }, data: { status: "CANCELLED", endsAt: new Date() } });
    await audit({ actorId: a.id, action: "promotion.cancelled", entityType: "Promotion", entityId: id });
    reval("/admin/promotions");
  });
}

const settingsSchema = z.object({
  escrowThresholdUsd: z.coerce.number().min(0),
  adminReleaseThresholdUsd: z.coerce.number().min(0),
  inspectionHours: z.coerce.number().int().min(1).max(720),
  auctionPaymentHours: z.coerce.number().int().min(1).max(720),
  checkoutHoldMinutes: z.coerce.number().int().min(10).max(1440),
  antiSnipeWindowMinutes: z.coerce.number().int().min(0).max(60),
  antiSnipeExtensionMinutes: z.coerce.number().int().min(0).max(60),
  requireListingApproval: z.boolean(),
  autoStartAuctions: z.boolean(),
  announcement: z.string().max(300),
  maintenanceMode: z.boolean(),
  supportEmail: z.string().email(),
});

export async function saveSettingsAdmin(input: z.input<typeof settingsSchema>) {
  return run(async () => {
    const a = await admin();
    const v = settingsSchema.parse(input);
    const patch: Partial<SiteSettings> = { ...v, escrowThresholdUsd: Math.round(v.escrowThresholdUsd * 100), adminReleaseThresholdUsd: Math.round(v.adminReleaseThresholdUsd * 100) };
    for (const k of Object.keys(patch)) if (!(k in DEFAULT_SETTINGS)) delete (patch as Record<string, unknown>)[k];
    await updateSettings(patch);
    await audit({ actorId: a.id, action: "settings.updated", entityType: "SiteSetting", entityId: "site", data: patch });
    reval("/admin/settings", "/");
  });
}

export async function markContactHandledAdmin(id: string) {
  return run(async () => {
    await admin();
    await db.contactMessage.update({ where: { id }, data: { handled: true } });
    reval("/admin/settings");
  });
}
