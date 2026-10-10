"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { actionUser } from "@/lib/auth/session";
import { isSandbox } from "@/lib/payments";
import { isProd } from "@/lib/env";
import { handlePaymentFailed, handlePaymentSucceeded } from "@/lib/payments/handlers";
import { processRelease } from "@/lib/deals";
import { randomSuffix } from "@/lib/utils";

/**
 * DEVELOPMENT ONLY. These actions stand in for the payment provider's webhook
 * so the full flow can be exercised locally. They refuse to run in production
 * or when a real provider is configured — no real-money success is ever faked.
 */
function guard() {
  if (isProd || !isSandbox()) throw new Error("Sandbox payments are disabled");
}

function returnUrl(p: { purpose: string; dealId: string | null; promotionId: string | null }) {
  if (p.purpose === "LISTING_PURCHASE" && p.dealId) return `/dashboard/deals/${p.dealId}?checkout=success`;
  if (p.purpose === "PROMOTION") return `/dashboard/promotions?paid=${p.promotionId}`;
  return "/dashboard/subscription?paid=1";
}

export async function sandboxPayAction(paymentId: string, outcome: "success" | "fail") {
  guard();
  const user = await actionUser();
  const p = await db.payment.findUnique({ where: { id: paymentId } });
  if (!p || p.userId !== user.id) throw new Error("Payment not found");
  if (outcome === "success") {
    await handlePaymentSucceeded(paymentId, {
      chargeRef: `sbx_ch_${randomSuffix(10)}`,
      subscriptionId: p.purpose === "SUBSCRIPTION" ? `sbx_sub_${randomSuffix(10)}` : null,
      periodEnd: p.purpose === "SUBSCRIPTION" ? new Date(Date.now() + 30 * 86400_000) : null,
      source: "sandbox",
    });
    redirect(returnUrl(p));
  }
  await handlePaymentFailed(paymentId, "Sandbox: simulated card decline");
  redirect(p.dealId ? `/dashboard/deals/${p.dealId}?checkout=cancelled` : "/dashboard");
}

export async function sandboxOnboardAction(accountId: string) {
  guard();
  const user = await actionUser();
  if (accountId !== `sbx_acct_${user.id}`) throw new Error("Invalid sandbox account");
  await db.user.update({ where: { id: user.id }, data: { payoutAccountId: accountId, payoutsEnabled: true } });
  const waiting = await db.deal.findMany({ where: { sellerId: user.id, status: "RELEASE_PENDING" }, select: { id: true } });
  for (const d of waiting) await processRelease(d.id);
  redirect("/dashboard/payouts?onboarded=1");
}
