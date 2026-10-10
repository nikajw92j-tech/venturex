/**
 * Seeds platform configuration (plans, promotion packages, commission tiers).
 * Safe to run in every environment — it only creates rows that don't exist.
 *
 * No users, listings or auctions are ever created here — the marketplace only
 * contains what real users publish.
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function base() {
  const plans = [
    { code: "FREE", name: "Free", priceMonthly: 0, maxActiveListings: 2, analyticsLevel: 0, storefront: false, teamSeats: 0, priorityReview: false, sortOrder: 0, features: ["2 active listings", "Standard marketplace visibility", "Standard listing analytics", "Standard commission rates"] },
    { code: "PRO", name: "Pro Seller", priceMonthly: 1900, maxActiveListings: 10, analyticsLevel: 1, storefront: true, teamSeats: 0, priorityReview: true, sortOrder: 1, features: ["10 active listings", "Enhanced analytics", "Featured listing opportunities", "Custom seller storefront", "Advanced buyer insights", "Faster listing review"] },
    { code: "BUSINESS", name: "Business Seller", priceMonthly: 4900, maxActiveListings: 50, analyticsLevel: 2, storefront: true, teamSeats: 5, priorityReview: true, sortOrder: 2, features: ["Up to 50 active listings", "Advanced analytics dashboard", "Team account access", "Priority support", "Custom storefront branding", "Additional promotional tools"] },
  ];
  for (const p of plans) await db.plan.upsert({ where: { code: p.code }, create: p, update: {} });

  const packages = [
    { code: "STARTER", name: "Starter Boost", price: 1000, durationDays: 3, homepage: false, premiumHomepage: false, featuredAuctions: false, searchBoost: 1, border: "HIGHLIGHT" as const, analytics: 0, sortOrder: 0, features: ["Featured placement for 3 days", "Highlighted listing card", "\"Promoted\" badge", "Increased marketplace visibility"] },
    { code: "PREMIUM", name: "Premium Boost", price: 2000, durationDays: 7, homepage: true, premiumHomepage: false, featuredAuctions: false, searchBoost: 2, border: "ANIMATED" as const, analytics: 1, sortOrder: 1, features: ["Featured placement for 7 days", "Homepage promotion", "Priority placement in search results", "Animated premium listing border", "Promotion analytics"] },
    { code: "ULTIMATE", name: "Ultimate Boost", price: 3000, durationDays: 14, homepage: true, premiumHomepage: true, featuredAuctions: true, searchBoost: 3, border: "GOLDEN" as const, analytics: 2, sortOrder: 2, features: ["Featured placement for 14 days", "Premium homepage placement", "Featured Auctions section", "Animated golden border", "Detailed promotion statistics"] },
  ];
  for (const p of packages) await db.promotionPackage.upsert({ where: { code: p.code }, create: { ...p, currency: "GEL" }, update: {} });

  if ((await db.commissionTier.count()) === 0) {
    await db.commissionTier.createMany({
      data: [
        { minUsd: 0, maxUsd: 50000, rateBps: 1000 },
        { minUsd: 50000, maxUsd: 200000, rateBps: 800 },
        { minUsd: 200000, maxUsd: 1000000, rateBps: 600 },
        { minUsd: 1000000, maxUsd: null, rateBps: 400 },
      ],
    });
  }
  console.log("✓ Base configuration seeded (plans, promotion packages, commission tiers)");
}

base()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
