import type { CurrencyCode } from "../money";

export type CheckoutRequest = {
  paymentId: string;
  amount: number; // minor units
  currency: CurrencyCode;
  description: string;
  customerEmail: string;
  successUrl: string;
  cancelUrl: string;
};

export type SubscriptionCheckoutRequest = CheckoutRequest & {
  planCode: string;
  planName: string;
  userId: string;
  customerId?: string | null;
};

export type PayoutRequest = {
  dealId: string;
  destinationAccountId: string;
  amount: number;
  currency: CurrencyCode;
  sourceChargeRef: string | null;
};

export interface PaymentProvider {
  readonly name: "stripe" | "sandbox";
  /** Real-money provider? (sandbox = false) */
  readonly live: boolean;
  createCheckout(req: CheckoutRequest): Promise<{ url: string; providerRef: string }>;
  createSubscriptionCheckout(req: SubscriptionCheckoutRequest): Promise<{ url: string; providerRef: string }>;
  cancelSubscription(providerSubscriptionId: string): Promise<void>;
  refund(providerRef: string, amount?: number): Promise<{ reference: string }>;
  payout(req: PayoutRequest): Promise<{ reference: string }>;
  /** Seller onboarding for payouts (KYC handled by the provider). */
  onboardingLink(opts: { userId: string; email: string; country: string | null; existingAccountId: string | null; returnUrl: string }): Promise<{ url: string; accountId: string }>;
  accountPayoutsEnabled(accountId: string): Promise<boolean>;
}
