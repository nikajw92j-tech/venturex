import "server-only";
import { env, isProd } from "../env";
import { randomSuffix } from "../utils";
import type { PaymentProvider } from "./types";

function guard() {
  if (isProd) {
    throw new Error("The sandbox payment provider cannot be used in production. Configure PAYMENT_PROVIDER=stripe.");
  }
}

/**
 * Development-only provider. Checkout redirects to /sandbox/checkout/<paymentId>,
 * a page clearly marked as a test environment where a developer chooses the
 * outcome. No money moves and it refuses to run when NODE_ENV=production.
 */
export const sandboxProvider: PaymentProvider = {
  name: "sandbox",
  live: false,

  async createCheckout(req) {
    guard();
    return { url: `${env.appUrl}/sandbox/checkout/${req.paymentId}`, providerRef: `sbx_cs_${req.paymentId}` };
  },

  async createSubscriptionCheckout(req) {
    guard();
    return { url: `${env.appUrl}/sandbox/checkout/${req.paymentId}`, providerRef: `sbx_cs_${req.paymentId}` };
  },

  async cancelSubscription() {
    guard();
  },

  async refund() {
    guard();
    return { reference: `sbx_re_${randomSuffix(10)}` };
  },

  async payout() {
    guard();
    return { reference: `sbx_tr_${randomSuffix(10)}` };
  },

  async onboardingLink({ userId, existingAccountId }) {
    guard();
    const accountId = existingAccountId ?? `sbx_acct_${userId}`;
    return { url: `${env.appUrl}/sandbox/onboarding?account=${encodeURIComponent(accountId)}`, accountId };
  },

  async accountPayoutsEnabled() {
    guard();
    return true;
  },
};
