import "server-only";
import Stripe from "stripe";
import { env } from "../env";
import type { PaymentProvider } from "./types";

let client: Stripe | null = null;
export function stripe() {
  if (!env.stripe.secretKey) throw new Error("STRIPE_SECRET_KEY is not configured");
  client ??= new Stripe(env.stripe.secretKey);
  return client;
}

/**
 * Stripe Connect using "separate charges and transfers":
 *  - buyers pay the platform (funds held in the platform balance),
 *  - the seller's share is transferred to their connected account only after
 *    the handover is confirmed and the release is approved,
 *  - the platform commission is simply the amount that is not transferred.
 * Availability depends on the platform's and sellers' countries — check
 * https://stripe.com/global and Stripe Connect cross-border rules before launch.
 */
export const stripeProvider: PaymentProvider = {
  name: "stripe",
  live: true,

  async createCheckout(req) {
    const session = await stripe().checkout.sessions.create({
      mode: "payment",
      customer_email: req.customerEmail,
      client_reference_id: req.paymentId,
      metadata: { paymentId: req.paymentId },
      payment_intent_data: { metadata: { paymentId: req.paymentId }, transfer_group: req.paymentId },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: req.currency.toLowerCase(),
            unit_amount: req.amount,
            product_data: { name: req.description.slice(0, 250) },
          },
        },
      ],
      success_url: req.successUrl,
      cancel_url: req.cancelUrl,
      expires_at: Math.floor(Date.now() / 1000) + 60 * 60,
    });
    return { url: session.url!, providerRef: session.id };
  },

  async createSubscriptionCheckout(req) {
    const session = await stripe().checkout.sessions.create({
      mode: "subscription",
      ...(req.customerId ? { customer: req.customerId } : { customer_email: req.customerEmail }),
      client_reference_id: req.paymentId,
      metadata: { paymentId: req.paymentId, planCode: req.planCode, userId: req.userId },
      subscription_data: { metadata: { planCode: req.planCode, userId: req.userId } },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: req.currency.toLowerCase(),
            unit_amount: req.amount,
            recurring: { interval: "month" },
            product_data: { name: `VENTUREX ${req.planName}` },
          },
        },
      ],
      success_url: req.successUrl,
      cancel_url: req.cancelUrl,
    });
    return { url: session.url!, providerRef: session.id };
  },

  async cancelSubscription(id) {
    await stripe().subscriptions.update(id, { cancel_at_period_end: true });
  },

  async refund(providerRef, amount) {
    const session = await stripe().checkout.sessions.retrieve(providerRef);
    const pi = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
    if (!pi) throw new Error("No payment intent to refund");
    const r = await stripe().refunds.create({ payment_intent: pi, ...(amount ? { amount } : {}) });
    return { reference: r.id };
  },

  async payout(req) {
    const t = await stripe().transfers.create(
      {
        amount: req.amount,
        currency: req.currency.toLowerCase(),
        destination: req.destinationAccountId,
        transfer_group: req.dealId,
        ...(req.sourceChargeRef ? { source_transaction: req.sourceChargeRef } : {}),
        metadata: { dealId: req.dealId },
      },
      { idempotencyKey: `payout-${req.dealId}` },
    );
    return { reference: t.id };
  },

  async onboardingLink({ userId, email, country, existingAccountId, returnUrl }) {
    let accountId = existingAccountId;
    if (!accountId) {
      const acct = await stripe().accounts.create({
        type: "express",
        email,
        country: country ?? env.stripe.connectCountry,
        capabilities: { transfers: { requested: true } },
        metadata: { userId },
      });
      accountId = acct.id;
    }
    const link = await stripe().accountLinks.create({
      account: accountId,
      type: "account_onboarding",
      refresh_url: returnUrl,
      return_url: returnUrl,
    });
    return { url: link.url, accountId };
  },

  async accountPayoutsEnabled(accountId) {
    const acct = await stripe().accounts.retrieve(accountId);
    return Boolean(acct.payouts_enabled && acct.capabilities?.transfers === "active");
  },
};
