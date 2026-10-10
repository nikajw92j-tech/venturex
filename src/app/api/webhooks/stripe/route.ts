import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import type { SubscriptionStatus } from "@prisma/client";
import { stripe } from "@/lib/payments/stripe";
import { env } from "@/lib/env";
import { db } from "@/lib/db";
import { handlePaymentFailed, handlePaymentSucceeded, handleRefund, handleSubscriptionChange } from "@/lib/payments/handlers";

export const runtime = "nodejs";

const SUB_STATUS: Record<string, SubscriptionStatus> = {
  active: "ACTIVE",
  trialing: "ACTIVE",
  past_due: "PAST_DUE",
  unpaid: "PAST_DUE",
  canceled: "CANCELED",
  incomplete: "INCOMPLETE",
  incomplete_expired: "CANCELED",
  paused: "PAST_DUE",
};

function periodEndOf(sub: Stripe.Subscription) {
  const legacy = (sub as unknown as { current_period_end?: number }).current_period_end;
  const item = (sub.items?.data?.[0] as unknown as { current_period_end?: number } | undefined)?.current_period_end;
  const end = legacy ?? item;
  return end ? new Date(end * 1000) : null;
}

/** Stripe webhook — every event is signature-verified and processed at most once. */
export async function POST(req: NextRequest) {
  if (!env.stripe.webhookSecret) return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  const sig = req.headers.get("stripe-signature");
  const raw = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(raw, sig ?? "", env.stripe.webhookSecret);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  // Idempotency: ignore events we've already processed.
  if (await db.webhookEvent.findUnique({ where: { id: event.id } })) return NextResponse.json({ received: true, duplicate: true });

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const s = event.data.object as Stripe.Checkout.Session;
        const paymentId = s.metadata?.paymentId ?? s.client_reference_id;
        if (!paymentId) break;
        // Only a PAID session counts; delayed methods arrive later as async_payment_succeeded.
        if (s.payment_status !== "paid") break;
        let chargeRef: string | null = null;
        if (s.payment_intent) {
          const pi = await stripe().paymentIntents.retrieve(typeof s.payment_intent === "string" ? s.payment_intent : s.payment_intent.id);
          chargeRef = typeof pi.latest_charge === "string" ? pi.latest_charge : (pi.latest_charge?.id ?? null);
        }
        let periodEnd: Date | null = null;
        const subId = typeof s.subscription === "string" ? s.subscription : (s.subscription?.id ?? null);
        if (subId) {
          const sub = await stripe().subscriptions.retrieve(subId);
          if (sub.status !== "active" && sub.status !== "trialing") break;
          periodEnd = periodEndOf(sub);
        }
        await handlePaymentSucceeded(paymentId, {
          chargeRef,
          subscriptionId: subId,
          customerId: typeof s.customer === "string" ? s.customer : (s.customer?.id ?? null),
          periodEnd,
          source: `stripe:${event.type}`,
        });
        break;
      }
      case "checkout.session.async_payment_failed":
      case "checkout.session.expired": {
        const s = event.data.object as Stripe.Checkout.Session;
        const paymentId = s.metadata?.paymentId ?? s.client_reference_id;
        if (paymentId) await handlePaymentFailed(paymentId, event.type === "checkout.session.expired" ? "expired" : "async payment failed");
        break;
      }
      case "charge.refunded": {
        const c = event.data.object as Stripe.Charge;
        const p = await db.payment.findFirst({ where: { providerChargeRef: c.id } });
        if (p?.providerRef) await handleRefund(p.providerRef, c.amount_refunded);
        break;
      }
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        await handleSubscriptionChange(
          sub.id,
          event.type === "customer.subscription.deleted" ? "CANCELED" : (SUB_STATUS[sub.status] ?? "PAST_DUE"),
          periodEndOf(sub),
          sub.cancel_at_period_end,
        );
        break;
      }
      case "account.updated": {
        const a = event.data.object as Stripe.Account;
        await db.user.updateMany({ where: { payoutAccountId: a.id }, data: { payoutsEnabled: Boolean(a.payouts_enabled && a.capabilities?.transfers === "active") } });
        break;
      }
    }
    await db.webhookEvent.create({ data: { id: event.id, provider: "stripe", type: event.type } });
  } catch (e) {
    console.error("[stripe webhook]", event.type, e);
    // A non-2xx response makes Stripe retry the event later.
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
  return NextResponse.json({ received: true });
}
