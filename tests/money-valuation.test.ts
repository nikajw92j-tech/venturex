import { describe, expect, it } from "vitest";
import { convert, displayMoney, formatMoney, type Rates } from "@/lib/money";
import { estimateValue } from "@/lib/valuation";

const rates: Rates = { USD: 1, GEL: 2.7, EUR: 0.9, RUB: 90 };

describe("money", () => {
  it("converts through USD", () => {
    expect(convert(27000, "GEL", "USD", rates)).toBe(10000);
    expect(convert(10000, "USD", "EUR", rates)).toBe(9000);
  });
  it("keeps the original contract amount visible when converting for display", () => {
    const m = displayMoney(270000, "GEL", "USD", rates);
    expect(m.converted).toBe(true);
    expect(m.primary).toContain("≈");
    expect(m.original).toBe(formatMoney(270000, "GEL"));
  });
});

describe("valuation model", () => {
  it("values profitable businesses on a profit multiple", () => {
    const r = estimateValue({ category: "SAAS", monthlyRevenue: 5000, monthlyProfit: 3000, ageMonths: 24, growth: "growing", monthlyTraffic: 1000, retention: null });
    expect(r.method).toBe("profit-multiple");
    expect(r.low).toBeGreaterThan(36000 * 3);
    expect(r.high).toBeGreaterThan(r.low);
  });
  it("lowers the range for declining young businesses", () => {
    const good = estimateValue({ category: "BLOG", monthlyRevenue: 1000, monthlyProfit: 800, ageMonths: 40, growth: "growing", monthlyTraffic: 0, retention: null });
    const bad = estimateValue({ category: "BLOG", monthlyRevenue: 1000, monthlyProfit: 800, ageMonths: 3, growth: "declining", monthlyTraffic: 0, retention: null });
    expect(bad.high).toBeLessThan(good.low);
  });
  it("uses asset value for pre-revenue projects", () => {
    expect(estimateValue({ category: "SAAS_MVP", monthlyRevenue: 0, monthlyProfit: 0, ageMonths: 2, growth: "flat", monthlyTraffic: 0, retention: null }).method).toBe("asset-value");
  });
});
