import "server-only";
import { env } from "../env";

/**
 * Escrow.com integration for high-value sales (platform acts as broker; the
 * platform commission is collected as a broker fee paid by the seller).
 *
 * Escrow.com only settles in a few currencies (USD, EUR, GBP, AUD, CAD). For
 * other currencies — or when credentials are not configured — high-value deals
 * fall back to the manual escrow workflow in the admin panel, where an
 * administrator records the verified escrow reference. Nothing is ever marked
 * paid without either a verified provider status or that documented record.
 */

export const ESCROW_CURRENCIES = ["USD", "EUR"] as const;

export function escrowConfigured() {
  return Boolean(env.escrow.email && env.escrow.apiKey);
}

function authHeader() {
  return "Basic " + Buffer.from(`${env.escrow.email}:${env.escrow.apiKey}`).toString("base64");
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${env.escrow.apiUrl}${path}`, {
    ...init,
    headers: { Authorization: authHeader(), "Content-Type": "application/json", ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Escrow API ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return (await res.json()) as T;
}

export async function createEscrowTransaction(opts: {
  dealReference: string;
  title: string;
  description: string;
  currency: "USD" | "EUR";
  amount: number; // minor units
  commission: number; // minor units
  buyerEmail: string;
  sellerEmail: string;
  inspectionHours: number;
  isDomain: boolean;
}) {
  const major = (m: number) => (m / 100).toFixed(2);
  const body = {
    parties: [
      { role: "buyer", customer: opts.buyerEmail },
      { role: "seller", customer: opts.sellerEmail },
      { role: "broker", customer: "me" },
    ],
    currency: opts.currency.toLowerCase(),
    description: `${opts.dealReference} — ${opts.title}`.slice(0, 250),
    items: [
      {
        title: opts.title.slice(0, 120),
        description: opts.description.slice(0, 500),
        type: opts.isDomain ? "domain_name" : "general_merchandise",
        inspection_period: opts.inspectionHours * 3600,
        quantity: 1,
        schedule: [{ amount: major(opts.amount), payer_customer: opts.buyerEmail, beneficiary_customer: opts.sellerEmail }],
      },
      {
        type: "broker_fee",
        schedule: [{ amount: major(opts.commission), payer_customer: opts.sellerEmail, beneficiary_customer: "me" }],
      },
    ],
  };
  const tx = await call<{ id: number }>("/transaction", { method: "POST", body: JSON.stringify(body) });
  return { id: String(tx.id) };
}

export type EscrowState = "awaiting_payment" | "funded" | "released" | "cancelled" | "unknown";

/** Re-fetches status from the API — webhook payloads are never trusted on their own. */
export async function fetchEscrowState(id: string): Promise<EscrowState> {
  const tx = await call<{ items?: { status?: Record<string, boolean> }[] }>(`/transaction/${encodeURIComponent(id)}`);
  const s = tx.items?.[0]?.status ?? {};
  if (s.canceled || s.cancelled || s.rejected) return "cancelled";
  if (s.released || s.completed) return "released";
  if (s.secured) return "funded";
  return "awaiting_payment";
}

export function escrowDashboardUrl(id: string) {
  const host = env.escrow.apiUrl.includes("sandbox") ? "https://www.escrow-sandbox.com" : "https://www.escrow.com";
  return `${host}/transactions/${encodeURIComponent(id)}`;
}
