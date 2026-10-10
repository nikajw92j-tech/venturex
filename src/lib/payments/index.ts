import "server-only";
import { env, isProd } from "../env";
import { sandboxProvider } from "./sandbox";
import { stripeProvider } from "./stripe";
import type { PaymentProvider } from "./types";

export function paymentProvider(): PaymentProvider {
  if (env.paymentProvider === "stripe") return stripeProvider;
  if (isProd) {
    throw new Error("No live payment provider configured. Set PAYMENT_PROVIDER=stripe and Stripe credentials.");
  }
  return sandboxProvider;
}

export function paymentsConfigured() {
  if (env.paymentProvider === "stripe") return Boolean(env.stripe.secretKey && env.stripe.webhookSecret);
  return !isProd;
}

export function isSandbox() {
  return env.paymentProvider !== "stripe" && !isProd;
}
