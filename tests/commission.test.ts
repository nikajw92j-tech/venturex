import { describe, expect, it } from "vitest";
import { computeCommission, DEFAULT_TIERS, pickTier, validateTiers } from "@/lib/commission";

describe("commission tiers", () => {
  it("matches the spec example: $1,000 sale → $80 commission, $920 to seller", () => {
    const r = computeCommission(100000, 100000);
    expect(r).toEqual({ rateBps: 800, commission: 8000, sellerNet: 92000 });
  });

  it.each([
    [0, 1000],
    [49999, 1000], // $499.99
    [50000, 800], // $500
    [199999, 800], // $1,999.99
    [200000, 600], // $2,000
    [999999, 600], // $9,999.99
    [1000000, 400], // $10,000
    [500000000, 400],
  ])("amount %i cents → %i bps", (usd, bps) => {
    expect(pickTier(usd, DEFAULT_TIERS).rateBps).toBe(bps);
  });

  it("chooses the tier by USD value but charges in the deal currency", () => {
    // 2,700 GEL ≈ $1,000 → 8% of 2,700 GEL = 216 GEL
    const r = computeCommission(270000, 100000);
    expect(r.commission).toBe(21600);
    expect(r.sellerNet).toBe(248400);
  });

  it("commission + net always equals the sale amount", () => {
    for (const amount of [1, 333, 12345, 999999, 123456789]) {
      const r = computeCommission(amount, amount);
      expect(r.commission + r.sellerNet).toBe(amount);
    }
  });

  it("rejects invalid tier configurations", () => {
    expect(validateTiers(DEFAULT_TIERS)).toBeNull();
    expect(validateTiers([])).not.toBeNull();
    expect(validateTiers([{ minUsd: 100, maxUsd: null, rateBps: 500 }])).toMatch(/start at 0/);
    expect(validateTiers([{ minUsd: 0, maxUsd: 1000, rateBps: 500 }, { minUsd: 2000, maxUsd: null, rateBps: 400 }])).toMatch(/contiguous/);
    expect(validateTiers([{ minUsd: 0, maxUsd: 1000, rateBps: 500 }])).toMatch(/no upper limit/);
    expect(validateTiers([{ minUsd: 0, maxUsd: null, rateBps: 9000 }])).toMatch(/between/);
  });
});
