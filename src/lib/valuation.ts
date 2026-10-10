// Deterministic, transparent valuation model (shared by client & server).
// Values are an ESTIMATE based on typical small-business marketplace multiples.

export type ValuationInput = {
  category: string;
  monthlyRevenue: number; // USD, major units
  monthlyProfit: number;
  ageMonths: number;
  growth: "declining" | "flat" | "growing" | "fast";
  monthlyTraffic: number;
  retention: number | null; // % of customers retained month over month
};

export type ValuationResult = {
  low: number;
  mid: number;
  high: number;
  method: "profit-multiple" | "revenue-multiple" | "asset-value";
  multiple: { low: number; high: number } | null;
  assumptions: string[];
};

/** Base annual-profit multiples by category (typical sub-$5M online business ranges). */
const BASE: Record<string, [number, number]> = {
  SAAS: [3.5, 5.0], SAAS_MVP: [3.5, 5.0], AI_STARTUP: [3.0, 4.8], AI_TOOL: [3.0, 4.5], SUBSCRIPTION: [3.2, 4.5],
  ECOMMERCE: [2.4, 3.4], SHOPIFY: [2.4, 3.4], ECOMMERCE_PROJECT: [2.2, 3.2],
  BLOG: [2.6, 3.6], AFFILIATE: [2.5, 3.5], YOUTUBE: [2.0, 3.0], NEW_WEBSITE: [2.4, 3.2],
  MOBILE_APP: [2.5, 3.8], SOFTWARE: [2.8, 4.0], SOURCE_CODE: [2.0, 3.0], AUTOMATION_TOOL: [2.8, 4.0], TEMPLATE: [2.0, 3.0],
  ONLINE_SERVICE: [1.8, 2.8], AGENCY: [1.2, 2.2], DOMAIN: [1.0, 2.0], STARTUP_MVP: [2.5, 3.8], UNLAUNCHED_PRODUCT: [2.0, 3.0], PRE_REVENUE: [2.0, 3.0],
};

const round = (n: number) => {
  if (n < 1000) return Math.round(n / 10) * 10;
  if (n < 10000) return Math.round(n / 100) * 100;
  return Math.round(n / 1000) * 1000;
};

export function estimateValue(v: ValuationInput): ValuationResult {
  const assumptions: string[] = [];
  const [bLow, bHigh] = BASE[v.category] ?? [2.0, 3.2];
  let adj = 0;

  if (v.ageMonths < 6) { adj -= 0.8; assumptions.push("Under 6 months old: short track record lowers the multiple (−0.8×)."); }
  else if (v.ageMonths < 12) { adj -= 0.5; assumptions.push("Under 12 months old: limited history (−0.5×)."); }
  else if (v.ageMonths >= 36) { adj += 0.4; assumptions.push("3+ years of operating history (+0.4×)."); }
  else assumptions.push("1–3 years of history: neutral age adjustment.");

  const g = { declining: -0.8, flat: 0, growing: 0.4, fast: 0.9 }[v.growth];
  adj += g;
  assumptions.push(`Growth trend "${v.growth}" (${g >= 0 ? "+" : ""}${g}×).`);

  if (v.retention !== null) {
    if (v.retention >= 95) { adj += 0.4; assumptions.push(`Strong retention (${v.retention}%) supports recurring revenue (+0.4×).`); }
    else if (v.retention < 80) { adj -= 0.5; assumptions.push(`Retention below 80% (${v.retention}%) signals churn risk (−0.5×).`); }
    else assumptions.push(`Retention of ${v.retention}% is within a normal range.`);
  }

  if (v.monthlyTraffic >= 100_000) { adj += 0.2; assumptions.push("Large organic audience (100k+ monthly visitors) (+0.2×)."); }

  const margin = v.monthlyRevenue > 0 ? v.monthlyProfit / v.monthlyRevenue : 0;
  if (v.monthlyRevenue > 0 && margin >= 0.6) { adj += 0.2; assumptions.push(`High profit margin (${Math.round(margin * 100)}%) (+0.2×).`); }

  const low = Math.max(0.5, bLow + adj);
  const high = Math.max(low + 0.3, bHigh + adj);

  if (v.monthlyProfit > 0) {
    const annual = v.monthlyProfit * 12;
    assumptions.unshift(`Valued on annual profit of $${annual.toLocaleString("en-US")} (12 × monthly profit) at a base ${bLow}–${bHigh}× multiple for this category.`);
    const lo = round(annual * low);
    const hi = round(annual * high);
    return { low: lo, high: hi, mid: round((lo + hi) / 2), method: "profit-multiple", multiple: { low: +low.toFixed(1), high: +high.toFixed(1) }, assumptions };
  }

  if (v.monthlyRevenue > 0) {
    // Unprofitable but revenue-generating: revenue multiple, discounted.
    const annualRev = v.monthlyRevenue * 12;
    const rLow = Math.max(0.3, 0.5 + adj * 0.25);
    const rHigh = Math.max(rLow + 0.2, 1.2 + adj * 0.3);
    assumptions.unshift(`Not yet profitable: valued at ${rLow.toFixed(1)}–${rHigh.toFixed(1)}× annual revenue of $${annualRev.toLocaleString("en-US")}.`);
    const lo = round(annualRev * rLow);
    const hi = round(annualRev * rHigh);
    return { low: lo, high: hi, mid: round((lo + hi) / 2), method: "revenue-multiple", multiple: { low: +rLow.toFixed(1), high: +rHigh.toFixed(1) }, assumptions };
  }

  // Pre-revenue: value of the assets (build cost proxy) adjusted by traction signals.
  const base = { SAAS_MVP: 1500, AI_TOOL: 1200, STARTUP_MVP: 1500, MOBILE_APP: 1200, SOFTWARE: 1000, TEMPLATE: 150, SOURCE_CODE: 500, DOMAIN: 300 }[v.category] ?? 600;
  const traction = Math.min(3, 1 + v.monthlyTraffic / 5000);
  const lo = round(base * traction * 0.6);
  const hi = round(base * traction * 1.8);
  assumptions.unshift("Pre-revenue: valued as a digital asset (approximate cost to rebuild), adjusted for existing traffic — not on earnings.");
  return { low: lo, high: hi, mid: round((lo + hi) / 2), method: "asset-value", multiple: null, assumptions };
}
