// Platform commission calculation. Pure functions — easy to unit test.

export type Tier = { minUsd: number; maxUsd: number | null; rateBps: number };

/** Default tiers (USD cents). Editable by admins at runtime via the CommissionTier table. */
export const DEFAULT_TIERS: Tier[] = [
  { minUsd: 0, maxUsd: 50000, rateBps: 1000 }, // $0–$499.99 → 10%
  { minUsd: 50000, maxUsd: 200000, rateBps: 800 }, // $500–$1,999.99 → 8%
  { minUsd: 200000, maxUsd: 1000000, rateBps: 600 }, // $2,000–$9,999.99 → 6%
  { minUsd: 1000000, maxUsd: null, rateBps: 400 }, // $10,000+ → 4%
];

export function pickTier(amountUsd: number, tiers: Tier[]): Tier {
  const sorted = [...tiers].sort((a, b) => a.minUsd - b.minUsd);
  for (const t of sorted) {
    if (amountUsd >= t.minUsd && (t.maxUsd === null || amountUsd < t.maxUsd)) return t;
  }
  // Fall back to the highest tier for amounts above every bound, lowest otherwise.
  return amountUsd >= (sorted.at(-1)?.minUsd ?? 0) ? sorted.at(-1)! : sorted[0];
}

/**
 * @param amount   final sale amount in minor units of the deal currency
 * @param amountUsd the same amount normalized to USD cents (for tier selection only)
 */
export function computeCommission(amount: number, amountUsd: number, tiers: Tier[] = DEFAULT_TIERS) {
  if (!Number.isInteger(amount) || amount < 0) throw new Error("Invalid amount");
  const tier = pickTier(amountUsd, tiers.length ? tiers : DEFAULT_TIERS);
  const commission = Math.round((amount * tier.rateBps) / 10000);
  return { rateBps: tier.rateBps, commission, sellerNet: amount - commission };
}

export function validateTiers(tiers: Tier[]): string | null {
  if (!tiers.length) return "At least one tier is required";
  const sorted = [...tiers].sort((a, b) => a.minUsd - b.minUsd);
  if (sorted[0].minUsd !== 0) return "The first tier must start at 0";
  for (let i = 0; i < sorted.length; i++) {
    const t = sorted[i];
    if (t.rateBps < 0 || t.rateBps > 5000) return "Rates must be between 0% and 50%";
    const next = sorted[i + 1];
    if (next) {
      if (t.maxUsd === null || t.maxUsd !== next.minUsd) return "Tiers must be contiguous with no gaps or overlaps";
    } else if (t.maxUsd !== null) return "The last tier must have no upper limit";
  }
  return null;
}
