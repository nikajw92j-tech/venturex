import "server-only";
import type { SubscriptionStatus } from "@prisma/client";
import { db } from "../db";
import { markDealPaid } from "../deals";
import { activatePromotion } from "../promotions";
import { audit } from "../audit";
import { kickEmails, notify } from "../notify";
import { paymentProvider } from ".";

/**
 * Single entry point for a VERIFIED successful payment (signature-checked
 * webhook, or the dev-only sandbox). Idempotent.
 */
export async function handlePaymentSucceeded(
  paymentId: string,
  info: { chargeRef?: string | null; subscriptionId?: string | null; customerId?: string | null; periodEnd?: Date | null; source: string },
) {
  let refundNeeded: { providerRef: string; paymentId: string } | null = null;

  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Payment" WHERE id = ${paymentId} FOR UPDATE`;
    const payment = await tx.payment.findUnique({ where: { id: paymentId } });
    if (!payment) throw new Error(`Unknown payment ${paymentId}`);
    if (payment.status === "SUCCEEDED" || payment.status === "REFUNDED") return;

    await tx.payment.update({ where: { id: paymentId }, data: { status: "SUCCEEDED", providerChargeRef: info.chargeRef ?? undefined } });
    await audit({ action: "payment.succeeded", entityType: "Payment", entityId: paymentId, data: { source: info.source, purpose: payment.purpose } }, tx);

    if (payment.purpose === "LISTING_PURCHASE" && payment.dealId) {
      const r = await markDealPaid(tx, payment.dealId, info.source);
      // Paid after the deal was cancelled (e.g. payment window expired): refund automatically.
      if (r.needsRefund && payment.providerRef) refundNeeded = { providerRef: payment.providerRef, paymentId };
    } else if (payment.purpose === "PROMOTION" && payment.promotionId) {
      await activatePromotion(tx, payment.promotionId);
    } else if (payment.purpose === "SUBSCRIPTION" && payment.planCode) {
      await tx.subscription.upsert({
        where: { userId: payment.userId },
        create: {
          userId: payment.userId,
          planCode: payment.planCode,
          status: "ACTIVE",
          providerSubscriptionId: info.subscriptionId ?? null,
          currentPeriodEnd: info.periodEnd ?? new Date(Date.now() + 30 * 86400_000),
        },
        update: {
          planCode: payment.planCode,
          status: "ACTIVE",
          providerSubscriptionId: info.subscriptionId ?? undefined,
          currentPeriodEnd: info.periodEnd ?? new Date(Date.now() + 30 * 86400_000),
          cancelAtPeriodEnd: false,
        },
      });
      if (info.customerId) await tx.user.update({ where: { id: payment.userId }, data: { billingCustomerId: info.customerId } });
      await notify(payment.userId, "SYSTEM", { title: "Subscription active", detail: `Your ${payment.planCode} seller plan is now active.` }, "/dashboard/subscription", tx);
    }
  });

  if (refundNeeded) {
    const { providerRef, paymentId: pid } = refundNeeded;
    const { reference } = await paymentProvider().refund(providerRef);
    await db.payment.update({ where: { id: pid }, data: { status: "REFUNDED", failureReason: "Auto-refund: transaction was cancelled before payment arrived" } });
    await audit({ action: "payment.auto_refunded", entityType: "Payment", entityId: pid, data: { reference } });
  }
  kickEmails();
}

export async function handlePaymentFailed(paymentId: string, reason: string) {
  const payment = await db.payment.findUnique({ where: { id: paymentId } });
  if (!payment || payment.status === "SUCCEEDED" || payment.status === "REFUNDED") return;
  await db.payment.update({ where: { id: paymentId }, data: { status: reason === "expired" ? "CANCELED" : "FAILED", failureReason: reason } });
  await audit({ action: "payment.failed", entityType: "Payment", entityId: paymentId, data: { reason } });
}

export async function handleRefund(providerRef: string, amountRefunded: number) {
  const payment = await db.payment.findUnique({ where: { providerRef } });
  if (!payment) return;
  await db.payment.update({
    where: { id: payment.id },
    data: { refundedAmount: amountRefunded, status: amountRefunded >= payment.amount ? "REFUNDED" : payment.status },
  });
  if (payment.promotionId && amountRefunded >= payment.amount) {
    await db.promotion.update({ where: { id: payment.promotionId }, data: { status: "REFUNDED" } });
  }
  await audit({ action: "payment.refunded", entityType: "Payment", entityId: payment.id, data: { amountRefunded } });
}

export async function handleSubscriptionChange(
  providerSubscriptionId: string,
  status: SubscriptionStatus,
  periodEnd: Date | null,
  cancelAtPeriodEnd: boolean,
) {
  const sub = await db.subscription.findUnique({ where: { providerSubscriptionId } });
  if (!sub) return;
  await db.subscription.update({
    where: { id: sub.id },
    data: { status, currentPeriodEnd: periodEnd ?? undefined, cancelAtPeriodEnd },
  });
  if (status === "CANCELED") {
    await notify(sub.userId, "SYSTEM", { title: "Subscription ended", detail: "Your seller plan has ended. You are now on the Free plan." }, "/dashboard/subscription");
    kickEmails();
  }
}
