import "server-only";
import { UserError } from "./errors";
import type { Currency, Deal, DealSource, HandoverStage, Listing, Prisma } from "@prisma/client";
import { db, type Tx } from "./db";
import { computeCommission, DEFAULT_TIERS, type Tier } from "./commission";
import { formatMoney, toUsd, type CurrencyCode, type Rates } from "./money";
import { getSettings, type SiteSettings } from "./settings";
import { notify, kickEmails } from "./notify";
import { audit } from "./audit";
import { publish } from "./realtime";
import { paymentProvider } from "./payments";
import { env } from "./env";
import { randomSuffix } from "./utils";
import { createEscrowTransaction, escrowConfigured, escrowDashboardUrl, ESCROW_CURRENCIES } from "./payments/escrow";
import { getRates } from "./rates";

export const STAGES: HandoverStage[] = [
  "PAYMENT_VERIFIED",
  "SELLER_PREPARING",
  "DOMAIN_HOSTING",
  "CODE_AND_ASSETS",
  "BUYER_REVIEW",
  "CONFIRMATION",
  "FUNDS_RELEASE",
  "COMPLETE",
];

export const OPEN_DEAL_STATUSES = ["PENDING_PAYMENT", "PAID", "IN_TRANSFER", "BUYER_REVIEW", "RELEASE_PENDING", "DISPUTED"] as const;

export class DealError extends UserError {}

export async function getTiers(tx: Tx = db): Promise<Tier[]> {
  const rows = await tx.commissionTier.findMany({ orderBy: { minUsd: "asc" } });
  return rows.length ? rows : DEFAULT_TIERS;
}

function defaultChecklist(listing: Pick<Listing, "market" | "websiteUrl" | "sourceCodeIncluded" | "assetsIncluded" | "category">) {
  const items: string[] = [];
  if (listing.websiteUrl || listing.category === "DOMAIN") items.push("Domain transferred to buyer's registrar account");
  if (listing.category !== "DOMAIN") items.push("Hosting / server access transferred or migrated");
  if (listing.sourceCodeIncluded || listing.market === "STARTER" || ["SAAS", "SOFTWARE", "MOBILE_APP", "AI_STARTUP"].includes(listing.category)) {
    items.push("Source code repository ownership transferred");
    items.push("Build & deployment instructions delivered");
    items.push("Environment variables / third-party API keys rotated and handed over");
  }
  items.push("Admin credentials for all business accounts handed over");
  for (const a of listing.assetsIncluded.slice(0, 12)) items.push(`Asset delivered: ${a}`);
  items.push("Buyer confirmed everything works as described");
  return items;
}

/** Creates a pending purchase. Must run inside the caller's transaction. */
export async function createDeal(
  tx: Tx,
  input: {
    listing: Pick<Listing, "id" | "title" | "sellerId" | "currency" | "market" | "websiteUrl" | "sourceCodeIncluded" | "assetsIncluded" | "category">;
    buyerId: string;
    amount: number;
    source: DealSource;
    offerId?: string;
    paymentHours?: number;
    paymentMinutes?: number;
  },
  rates: Rates,
  settings: SiteSettings,
) {
  if (input.buyerId === input.listing.sellerId) throw new DealError("Sellers cannot buy their own listing");
  const currency = input.listing.currency as CurrencyCode;
  const amountUsd = toUsd(input.amount, currency, rates);
  const tiers = await getTiers(tx);
  const { rateBps, commission, sellerNet } = computeCommission(input.amount, amountUsd, tiers);
  const dueMs = input.paymentMinutes ? input.paymentMinutes * 60_000 : (input.paymentHours ?? 72) * 3600_000;
  const deal = await tx.deal.create({
    data: {
      reference: `VX-${randomSuffix(6).toUpperCase()}`,
      listingId: input.listing.id,
      buyerId: input.buyerId,
      sellerId: input.listing.sellerId,
      source: input.source,
      offerId: input.offerId,
      currency,
      amount: input.amount,
      amountUsd,
      commissionRateBps: rateBps,
      commissionAmount: commission,
      sellerNetAmount: sellerNet,
      escrowRequired: amountUsd >= settings.escrowThresholdUsd,
      paymentDueAt: new Date(Date.now() + dueMs),
      stages: { create: STAGES.map((stage) => ({ stage })) },
      checklist: { create: defaultChecklist(input.listing).map((label, i) => ({ label, sortOrder: i })) },
      commission: { create: { currency, amount: commission, amountUsd: Math.round((commission * amountUsd) / Math.max(1, input.amount)), rateBps, status: "PENDING" } },
    },
  });
  await tx.listing.update({ where: { id: input.listing.id }, data: { status: "PENDING_SALE" } });
  await audit({ actorId: input.buyerId, action: "deal.created", entityType: "Deal", entityId: deal.id, data: { source: input.source, amount: input.amount, currency, rateBps, commission } }, tx);
  return deal;
}

function money(d: Pick<Deal, "amount" | "currency">) {
  return formatMoney(d.amount, d.currency as CurrencyCode);
}

async function setStage(tx: Tx, dealId: string, stage: HandoverStage, status: "IN_PROGRESS" | "DONE" | "SKIPPED", actorId: string | null, note?: string) {
  await tx.handoverStep.update({
    where: { dealId_stage: { dealId, stage } },
    data: {
      status,
      note: note ?? undefined,
      completedAt: status === "DONE" || status === "SKIPPED" ? new Date() : null,
      completedById: status === "DONE" || status === "SKIPPED" ? actorId : null,
    },
  });
}

async function lockDeal(tx: Tx, dealId: string) {
  await tx.$queryRaw`SELECT id FROM "Deal" WHERE id = ${dealId} FOR UPDATE`;
  const deal = await tx.deal.findUnique({ where: { id: dealId }, include: { listing: { select: { title: true, slug: true } } } });
  if (!deal) throw new DealError("Transaction not found");
  return deal;
}

const dealLink = (id: string) => `/dashboard/deals/${id}`;

// ───────────────────────────── Checkout ─────────────────────────────

/** Starts (or resumes) the buyer's payment for a deal. Returns a redirect URL. */
export async function startDealCheckout(dealId: string, userId: string) {
  const deal = await db.deal.findUnique({
    where: { id: dealId },
    include: { listing: true, buyer: true, seller: true, payments: { where: { status: { in: ["CREATED", "PROCESSING"] } } } },
  });
  if (!deal || deal.buyerId !== userId) throw new DealError("Transaction not found");
  if (deal.status !== "PENDING_PAYMENT") throw new DealError("This transaction is not awaiting payment");
  if (deal.paymentDueAt < new Date()) throw new DealError("The payment window for this transaction has expired");

  if (deal.escrowRequired) {
    if (deal.escrowReference) return escrowDashboardUrl(deal.escrowReference);
    const settings = await getSettings();
    if (!escrowConfigured() || !(ESCROW_CURRENCIES as readonly string[]).includes(deal.currency)) {
      throw new DealError(
        "This high-value purchase requires escrow. Our team has been notified and will contact both parties to set up a protected escrow transaction.",
      );
    }
    const tx = await createEscrowTransaction({
      dealReference: deal.reference,
      title: deal.listing.title,
      description: deal.listing.tagline ?? deal.listing.description,
      currency: deal.currency as "USD" | "EUR",
      amount: deal.amount,
      commission: deal.commissionAmount,
      buyerEmail: deal.buyer.email,
      sellerEmail: deal.seller.email,
      inspectionHours: settings.inspectionHours,
      isDomain: deal.listing.category === "DOMAIN",
    });
    await db.deal.update({ where: { id: deal.id }, data: { escrowReference: tx.id, escrowStatus: "awaiting_payment" } });
    await audit({ actorId: userId, action: "deal.escrow_created", entityType: "Deal", entityId: deal.id, data: { escrowId: tx.id } });
    return escrowDashboardUrl(tx.id);
  }

  const existing = deal.payments.find((p) => p.checkoutUrl);
  if (existing && existing.createdAt.getTime() > Date.now() - 50 * 60_000) return existing.checkoutUrl!;

  const provider = paymentProvider();
  const payment = await db.payment.create({
    data: { userId, purpose: "LISTING_PURCHASE", provider: provider.name, currency: deal.currency, amount: deal.amount, dealId: deal.id },
  });
  const { url, providerRef } = await provider.createCheckout({
    paymentId: payment.id,
    amount: deal.amount,
    currency: deal.currency as CurrencyCode,
    description: `${deal.reference} — ${deal.listing.title}`,
    customerEmail: deal.buyer.email,
    successUrl: `${env.appUrl}${dealLink(deal.id)}?checkout=success`,
    cancelUrl: `${env.appUrl}${dealLink(deal.id)}?checkout=cancelled`,
  });
  await db.payment.update({ where: { id: payment.id }, data: { providerRef, checkoutUrl: url, status: "PROCESSING" } });
  return url;
}

// ───────────────────────────── Payment verified ─────────────────────────────

/** Called only from verified payment-provider events (webhook / escrow status / sandbox). */
export async function markDealPaid(tx: Tx, dealId: string, source: string) {
  const deal = await lockDeal(tx, dealId);
  if (deal.status !== "PENDING_PAYMENT") return { deal, alreadyHandled: true, needsRefund: deal.status === "CANCELLED" };
  const updated = await tx.deal.update({ where: { id: dealId }, data: { status: "PAID", paidAt: new Date() } });
  await setStage(tx, dealId, "PAYMENT_VERIFIED", "DONE", null, `Verified by ${source}`);
  await setStage(tx, dealId, "SELLER_PREPARING", "IN_PROGRESS", null);
  await audit({ action: "deal.paid", entityType: "Deal", entityId: dealId, data: { source } }, tx);
  const params = { listing: deal.listing.title, amount: money(deal) };
  await notify(deal.buyerId, "PAYMENT_SUCCEEDED", params, dealLink(dealId), tx);
  await notify(deal.sellerId, "TRANSFER_UPDATE", { listing: deal.listing.title, detail: "The buyer's payment is verified. Please begin preparing the business assets for handover." }, dealLink(dealId), tx);
  await publish(`deal:${dealId}`, { type: "deal", status: "PAID" }, tx);
  return { deal: updated, alreadyHandled: false, needsRefund: false };
}

// ───────────────────────────── Handover ─────────────────────────────

export type HandoverAction =
  | { kind: "seller_prepared"; note?: string }
  | { kind: "domain_done"; note?: string; skip?: boolean }
  | { kind: "assets_delivered"; note?: string }
  | { kind: "confirm" }
  | { kind: "checklist"; itemId: string; field: "sellerDone" | "buyerVerified"; value: boolean };

export async function handoverAction(dealId: string, userId: string, action: HandoverAction) {
  const settings = await getSettings();
  const result = await db.$transaction(async (tx) => {
    const deal = await lockDeal(tx, dealId);
    const isSeller = deal.sellerId === userId;
    const isBuyer = deal.buyerId === userId;
    if (!isSeller && !isBuyer) throw new DealError("Not a party to this transaction");
    const title = deal.listing.title;

    switch (action.kind) {
      case "checklist": {
        if (action.field === "sellerDone" && !isSeller) throw new DealError("Only the seller can mark items delivered");
        if (action.field === "buyerVerified" && !isBuyer) throw new DealError("Only the buyer can verify items");
        if (!["PAID", "IN_TRANSFER", "BUYER_REVIEW"].includes(deal.status)) throw new DealError("Checklist is locked");
        await tx.checklistItem.updateMany({ where: { id: action.itemId, dealId }, data: { [action.field]: action.value } });
        break;
      }
      case "seller_prepared": {
        if (!isSeller || deal.status !== "PAID") throw new DealError("Not allowed at this stage");
        await tx.deal.update({ where: { id: dealId }, data: { status: "IN_TRANSFER" } });
        await setStage(tx, dealId, "SELLER_PREPARING", "DONE", userId, action.note);
        await setStage(tx, dealId, "DOMAIN_HOSTING", "IN_PROGRESS", null);
        await notify(deal.buyerId, "TRANSFER_UPDATE", { listing: title, detail: "The seller has prepared the assets. Domain and hosting transfer is starting." }, dealLink(dealId), tx);
        break;
      }
      case "domain_done": {
        if (!isSeller || deal.status !== "IN_TRANSFER") throw new DealError("Not allowed at this stage");
        await setStage(tx, dealId, "DOMAIN_HOSTING", action.skip ? "SKIPPED" : "DONE", userId, action.note);
        await setStage(tx, dealId, "CODE_AND_ASSETS", "IN_PROGRESS", null);
        await notify(deal.buyerId, "TRANSFER_UPDATE", { listing: title, detail: action.skip ? "Domain/hosting transfer marked not applicable. Source code and assets are next." : "The seller reports the domain and hosting transfer is complete. Please verify you have access." }, dealLink(dealId), tx);
        break;
      }
      case "assets_delivered": {
        if (!isSeller || deal.status !== "IN_TRANSFER") throw new DealError("Not allowed at this stage");
        const step = await tx.handoverStep.findUnique({ where: { dealId_stage: { dealId, stage: "CODE_AND_ASSETS" } } });
        if (step?.status !== "IN_PROGRESS") throw new DealError("Complete the domain & hosting step first");
        await tx.deal.update({ where: { id: dealId }, data: { status: "BUYER_REVIEW", inspectionEndsAt: new Date(Date.now() + settings.inspectionHours * 3600_000) } });
        await setStage(tx, dealId, "CODE_AND_ASSETS", "DONE", userId, action.note);
        await setStage(tx, dealId, "BUYER_REVIEW", "IN_PROGRESS", null);
        await notify(deal.buyerId, "TRANSFER_UPDATE", { listing: title, detail: `All assets have been delivered. You have ${settings.inspectionHours} hours to review them, then confirm the handover or open a dispute.` }, dealLink(dealId), tx);
        break;
      }
      case "confirm": {
        if (deal.status !== "BUYER_REVIEW") throw new DealError("Handover can be confirmed once all assets are delivered");
        if (isBuyer) {
          if (deal.buyerConfirmedAt) throw new DealError("Already confirmed");
          const pending = await tx.checklistItem.count({ where: { dealId, buyerVerified: false } });
          if (pending > 0) throw new DealError("Verify every checklist item before confirming the handover");
          await tx.deal.update({ where: { id: dealId }, data: { buyerConfirmedAt: new Date() } });
          await setStage(tx, dealId, "BUYER_REVIEW", "DONE", userId);
        } else {
          if (deal.sellerConfirmedAt) throw new DealError("Already confirmed");
          await tx.deal.update({ where: { id: dealId }, data: { sellerConfirmedAt: new Date() } });
        }
        const fresh = await tx.deal.findUniqueOrThrow({ where: { id: dealId } });
        const other = isBuyer ? deal.sellerId : deal.buyerId;
        if (fresh.buyerConfirmedAt && fresh.sellerConfirmedAt) {
          await setStage(tx, dealId, "CONFIRMATION", "DONE", null, "Both parties confirmed the handover");
          await setStage(tx, dealId, "FUNDS_RELEASE", "IN_PROGRESS", null);
          await tx.deal.update({ where: { id: dealId }, data: { status: "RELEASE_PENDING" } });
          for (const uid of [deal.buyerId, deal.sellerId]) {
            await notify(uid, "TRANSFER_UPDATE", { listing: title, detail: "Both parties confirmed the handover. Funds release is now being processed." }, dealLink(dealId), tx);
          }
        } else {
          await setStage(tx, dealId, "CONFIRMATION", "IN_PROGRESS", null);
          await notify(other, "TRANSFER_UPDATE", { listing: title, detail: `The ${isBuyer ? "buyer" : "seller"} confirmed the handover. Your confirmation is needed.` }, dealLink(dealId), tx);
        }
        break;
      }
    }
    await audit({ actorId: userId, action: `deal.${action.kind}`, entityType: "Deal", entityId: dealId, data: action }, tx);
    await publish(`deal:${dealId}`, { type: "deal", action: action.kind }, tx);
    return tx.deal.findUniqueOrThrow({ where: { id: dealId } });
  });
  kickEmails();
  if (result.status === "RELEASE_PENDING") await processRelease(dealId).catch((e) => console.error("[release]", e));
  return result;
}

// ───────────────────────────── Release & payout ─────────────────────────────

/**
 * Release rules — funds go to the seller only when ALL hold:
 *  1. payment status was verified by the provider (deal.paidAt set from a webhook),
 *  2. both parties confirmed the handover,
 *  3. no open dispute,
 *  4. release approval is documented: automatic (below the admin threshold, recorded
 *     in the audit log with the reasons) or by an administrator,
 *  5. the payout provider accepts the transfer.
 * Escrow deals are released by the escrow partner and synchronized via its status.
 */
export async function processRelease(dealId: string, adminId?: string) {
  const settings = await getSettings();
  const deal = await db.deal.findUnique({ where: { id: dealId }, include: { seller: true, listing: true, payments: true, disputes: { where: { status: { in: ["OPEN", "UNDER_REVIEW"] } } } } });
  if (!deal || deal.status !== "RELEASE_PENDING") return deal;
  if (!deal.paidAt || !deal.buyerConfirmedAt || !deal.sellerConfirmedAt || deal.disputes.length) return deal;
  if (deal.escrowRequired) return deal; // escrow partner releases funds

  if (!deal.releaseApprovedAt) {
    if (deal.amountUsd >= settings.adminReleaseThresholdUsd && !adminId) return deal; // waits for an admin
    await db.deal.update({ where: { id: dealId }, data: { releaseApprovedAt: new Date(), releaseApprovedById: adminId ?? null } });
    await audit({
      actorId: adminId ?? null,
      action: adminId ? "deal.release_approved" : "deal.release_auto_approved",
      entityType: "Deal",
      entityId: dealId,
      data: { reasons: ["payment verified by provider", "buyer confirmed", "seller confirmed", "no open disputes"], amountUsd: deal.amountUsd, threshold: settings.adminReleaseThresholdUsd },
    });
  }

  const provider = paymentProvider();
  if (!deal.seller.payoutAccountId || !deal.seller.payoutsEnabled) {
    if (deal.seller.payoutAccountId && (await provider.accountPayoutsEnabled(deal.seller.payoutAccountId).catch(() => false))) {
      await db.user.update({ where: { id: deal.sellerId }, data: { payoutsEnabled: true } });
    } else {
      if (deal.payoutStatus !== "AWAITING_SELLER_ONBOARDING") {
        await db.deal.update({ where: { id: dealId }, data: { payoutStatus: "AWAITING_SELLER_ONBOARDING" } });
        await notify(deal.sellerId, "TRANSFER_UPDATE", { listing: deal.listing.title, detail: "Your payout is approved. Connect a payout account in Dashboard → Payouts to receive the funds." }, "/dashboard/payouts");
        kickEmails();
      }
      return deal;
    }
  }

  const charge = deal.payments.find((p) => p.status === "SUCCEEDED");
  try {
    const { reference } = await provider.payout({
      dealId,
      destinationAccountId: deal.seller.payoutAccountId!,
      amount: deal.sellerNetAmount,
      currency: deal.currency as CurrencyCode,
      sourceChargeRef: charge?.providerChargeRef ?? null,
    });
    await completeDeal(dealId, { payoutReference: reference });
  } catch (e) {
    console.error("[payout] failed", dealId, e);
    await db.deal.update({ where: { id: dealId }, data: { payoutStatus: "FAILED" } });
    await audit({ action: "deal.payout_failed", entityType: "Deal", entityId: dealId, data: { error: String(e) } });
  }
  return db.deal.findUnique({ where: { id: dealId } });
}

/** Final state: funds released, ownership transferred, commission becomes revenue. */
export async function completeDeal(dealId: string, opts: { payoutReference?: string; escrow?: boolean } = {}) {
  await db.$transaction(async (tx) => {
    const deal = await lockDeal(tx, dealId);
    if (deal.status === "COMPLETED") return;
    const now = new Date();
    await tx.deal.update({
      where: { id: dealId },
      data: { status: "COMPLETED", completedAt: now, payoutStatus: "SENT", payoutReference: opts.payoutReference ?? (opts.escrow ? `escrow:${deal.escrowReference}` : null) },
    });
    await tx.commission.update({ where: { dealId }, data: { status: "EARNED", earnedAt: now } });
    await tx.listing.update({ where: { id: deal.listingId }, data: { status: "SOLD" } });
    for (const s of ["CONFIRMATION", "FUNDS_RELEASE", "COMPLETE"] as const) {
      await tx.handoverStep.updateMany({ where: { dealId, stage: s, status: { in: ["PENDING", "IN_PROGRESS"] } }, data: { status: "DONE", completedAt: now } });
    }
    await audit({ action: "deal.completed", entityType: "Deal", entityId: dealId, data: opts }, tx);
    for (const uid of [deal.buyerId, deal.sellerId]) {
      await notify(uid, "TRANSFER_UPDATE", { listing: deal.listing.title, detail: uid === deal.sellerId ? `Funds of ${formatMoney(deal.sellerNetAmount, deal.currency as CurrencyCode)} have been released to your payout account. Congratulations on the sale!` : "The transaction is complete. Congratulations on your acquisition!" }, dealLink(dealId), tx);
    }
    await publish(`deal:${dealId}`, { type: "deal", status: "COMPLETED" }, tx);
  });
  kickEmails();
}

// ───────────────────────────── Cancellation & expiry ─────────────────────────────

export async function cancelUnpaidDeal(dealId: string, reason: string, actorId: string | null) {
  await db.$transaction(async (tx) => {
    const deal = await lockDeal(tx, dealId);
    if (deal.status !== "PENDING_PAYMENT") throw new DealError("Only unpaid transactions can be cancelled");
    await tx.deal.update({ where: { id: dealId }, data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: reason } });
    // No success commission on cancelled transactions.
    await tx.commission.update({ where: { dealId }, data: { status: "REVERSED", reversedAt: new Date() } });
    await tx.payment.updateMany({ where: { dealId, status: { in: ["CREATED", "PROCESSING"] } }, data: { status: "CANCELED" } });
    const listing = await tx.listing.findUniqueOrThrow({ where: { id: deal.listingId }, include: { auction: true } });
    // Fixed-price listings return to the market; ended auctions need to be relisted by the seller.
    await tx.listing.update({ where: { id: listing.id }, data: { status: listing.saleType === "AUCTION" && listing.auction?.status !== "LIVE" ? "EXPIRED" : "ACTIVE" } });
    if (deal.offerId) await tx.offer.update({ where: { id: deal.offerId }, data: { status: "EXPIRED" } });
    await audit({ actorId, action: "deal.cancelled", entityType: "Deal", entityId: dealId, data: { reason } }, tx);
    for (const uid of [deal.buyerId, deal.sellerId]) {
      await notify(uid, "TRANSFER_UPDATE", { listing: deal.listing.title, detail: `The pending purchase was cancelled: ${reason}` }, dealLink(dealId), tx);
    }
  });
  kickEmails();
}

export async function expireUnpaidDeals() {
  const overdue = await db.deal.findMany({ where: { status: "PENDING_PAYMENT", paymentDueAt: { lt: new Date() }, escrowReference: null }, select: { id: true } });
  for (const d of overdue) {
    await cancelUnpaidDeal(d.id, "Payment was not completed before the deadline.", null).catch((e) => console.error("[deals] expire", d.id, e));
  }
  return overdue.length;
}

// ───────────────────────────── Disputes ─────────────────────────────

export async function openDispute(dealId: string, userId: string, reason: string, description: string) {
  await db.$transaction(async (tx) => {
    const deal = await lockDeal(tx, dealId);
    if (deal.buyerId !== userId && deal.sellerId !== userId) throw new DealError("Not a party to this transaction");
    if (!["PAID", "IN_TRANSFER", "BUYER_REVIEW", "RELEASE_PENDING"].includes(deal.status)) throw new DealError("A dispute cannot be opened at this stage");
    await tx.dispute.create({ data: { dealId, openedById: userId, reason, description } });
    await tx.deal.update({ where: { id: dealId }, data: { status: "DISPUTED", statusBeforeDispute: deal.status } });
    await audit({ actorId: userId, action: "deal.dispute_opened", entityType: "Deal", entityId: dealId, data: { reason } }, tx);
    const other = deal.buyerId === userId ? deal.sellerId : deal.buyerId;
    await notify(other, "DISPUTE_UPDATE", { detail: `A dispute was opened on ${deal.reference} (${deal.listing.title}). Funds are frozen until an administrator resolves it.` }, dealLink(dealId), tx);
  });
  kickEmails();
}

export async function resolveDispute(disputeId: string, adminId: string, outcome: "BUYER" | "SELLER", resolution: string) {
  const dispute = await db.dispute.findUnique({ where: { id: disputeId }, include: { deal: { include: { payments: true, listing: true } } } });
  if (!dispute || !["OPEN", "UNDER_REVIEW"].includes(dispute.status)) throw new DealError("Dispute is not open");
  const deal = dispute.deal;

  if (outcome === "BUYER") {
    // Refund through the provider first; state changes only after the provider accepts.
    const paid = deal.payments.find((p) => p.status === "SUCCEEDED");
    let refundRef: string | null = null;
    if (paid?.providerRef) refundRef = (await paymentProvider().refund(paid.providerRef)).reference;
    await db.$transaction(async (tx) => {
      await tx.dispute.update({ where: { id: disputeId }, data: { status: "RESOLVED_BUYER", resolution, resolvedById: adminId, resolvedAt: new Date() } });
      await tx.deal.update({ where: { id: deal.id }, data: { status: "REFUNDED", cancelledAt: new Date(), cancelReason: `Dispute resolved for buyer: ${resolution}` } });
      if (paid) await tx.payment.update({ where: { id: paid.id }, data: { status: "REFUNDED", refundedAmount: paid.amount } });
      await tx.commission.update({ where: { dealId: deal.id }, data: { status: "REVERSED", reversedAt: new Date() } });
      await tx.listing.update({ where: { id: deal.listingId }, data: { status: "WITHDRAWN" } });
      await audit({ actorId: adminId, action: "dispute.resolved_buyer", entityType: "Dispute", entityId: disputeId, data: { resolution, refundRef, escrow: deal.escrowReference } }, tx);
      for (const uid of [deal.buyerId, deal.sellerId]) {
        await notify(uid, "DISPUTE_UPDATE", { detail: `Dispute on ${deal.reference} resolved in favour of the buyer. ${deal.escrowRequired ? "The escrow partner will return the funds." : "The payment has been refunded."} ${resolution}` }, dealLink(deal.id), tx);
      }
    });
  } else {
    await db.$transaction(async (tx) => {
      await tx.dispute.update({ where: { id: disputeId }, data: { status: "RESOLVED_SELLER", resolution, resolvedById: adminId, resolvedAt: new Date() } });
      // Admin decision documents both the handover confirmation and the release approval.
      const now = new Date();
      await tx.deal.update({
        where: { id: deal.id },
        data: { status: "RELEASE_PENDING", buyerConfirmedAt: deal.buyerConfirmedAt ?? now, sellerConfirmedAt: deal.sellerConfirmedAt ?? now, releaseApprovedAt: now, releaseApprovedById: adminId },
      });
      await tx.handoverStep.updateMany({ where: { dealId: deal.id, stage: { in: ["SELLER_PREPARING", "DOMAIN_HOSTING", "CODE_AND_ASSETS", "BUYER_REVIEW", "CONFIRMATION"] }, status: { in: ["PENDING", "IN_PROGRESS"] } }, data: { status: "DONE", completedAt: now, note: "Resolved by administrator" } });
      await tx.handoverStep.update({ where: { dealId_stage: { dealId: deal.id, stage: "FUNDS_RELEASE" } }, data: { status: "IN_PROGRESS" } });
      await audit({ actorId: adminId, action: "dispute.resolved_seller", entityType: "Dispute", entityId: disputeId, data: { resolution } }, tx);
      for (const uid of [deal.buyerId, deal.sellerId]) {
        await notify(uid, "DISPUTE_UPDATE", { detail: `Dispute on ${deal.reference} resolved in favour of the seller. ${resolution}` }, dealLink(deal.id), tx);
      }
    });
    await processRelease(deal.id, adminId);
  }
  kickEmails();
}

export type DealWithRelations = Prisma.DealGetPayload<{ include: { listing: true; stages: true; checklist: true } }>;
export type { Currency };

/** Shared helper so callers can get rates+settings in one go. */
export async function dealContext() {
  const [{ rates }, settings] = await Promise.all([getRates(), getSettings()]);
  return { rates, settings };
}
