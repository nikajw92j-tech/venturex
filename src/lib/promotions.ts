import "server-only";
import { UserError } from "./errors";
import type { Prisma } from "@prisma/client";
import { db, type Tx } from "./db";
import { env } from "./env";
import { paymentProvider } from "./payments";
import { notify, kickEmails } from "./notify";
import { audit } from "./audit";
import type { CurrencyCode } from "./money";

export class PromotionError extends UserError {}

/** Listing statuses that can be promoted. */
const PROMOTABLE = ["ACTIVE"] as const;

/** Prisma filter: promotions that are currently running (expiry is enforced by time, not by a job). */
export function activePromotionWhere(now = new Date()): Prisma.PromotionWhereInput {
  return { status: "ACTIVE", startsAt: { lte: now }, endsAt: { gt: now } };
}

export async function purchasePromotion(userId: string, email: string, listingId: string, packageCode: string) {
  const [listing, pkg] = await Promise.all([
    db.listing.findUnique({ where: { id: listingId } }),
    db.promotionPackage.findUnique({ where: { code: packageCode } }),
  ]);
  if (!listing || listing.sellerId !== userId) throw new PromotionError("Listing not found");
  if (!(PROMOTABLE as readonly string[]).includes(listing.status)) throw new PromotionError("Only live listings can be promoted");
  if (!pkg || !pkg.active) throw new PromotionError("This promotion package is not available");
  if (pkg.featuredAuctions && listing.saleType !== "AUCTION") {
    // Ultimate still works for fixed listings; the auction slot simply doesn't apply.
  }

  const provider = paymentProvider();
  const promotion = await db.promotion.create({
    data: {
      listingId,
      sellerId: userId,
      packageCode: pkg.code,
      price: pkg.price,
      currency: pkg.currency,
      durationDays: pkg.durationDays,
      homepage: pkg.homepage,
      premiumHomepage: pkg.premiumHomepage,
      featuredAuctions: pkg.featuredAuctions,
      searchBoost: pkg.searchBoost,
      border: pkg.border,
      analytics: pkg.analytics,
    },
  });
  const payment = await db.payment.create({
    data: { userId, purpose: "PROMOTION", provider: provider.name, currency: pkg.currency, amount: pkg.price, promotionId: promotion.id },
  });
  const { url, providerRef } = await provider.createCheckout({
    paymentId: payment.id,
    amount: pkg.price,
    currency: pkg.currency as CurrencyCode,
    description: `${pkg.name} — ${listing.title} (${pkg.durationDays} days advertising)`,
    customerEmail: email,
    successUrl: `${env.appUrl}/dashboard/promotions?paid=${promotion.id}`,
    cancelUrl: `${env.appUrl}/dashboard/promotions?cancelled=${promotion.id}`,
  });
  await db.payment.update({ where: { id: payment.id }, data: { providerRef, checkoutUrl: url, status: "PROCESSING" } });
  await audit({ actorId: userId, action: "promotion.checkout", entityType: "Promotion", entityId: promotion.id, data: { packageCode, price: pkg.price, currency: pkg.currency } });
  return url;
}

/** Activates a promotion — called only after a verified payment. */
export async function activatePromotion(tx: Tx, promotionId: string) {
  const promo = await tx.promotion.findUnique({ where: { id: promotionId }, include: { listing: { select: { title: true } } } });
  if (!promo || promo.status !== "PENDING_PAYMENT") return;
  // Back-to-back purchases queue after the listing's current promotion instead of overlapping.
  const latest = await tx.promotion.findFirst({
    where: { listingId: promo.listingId, status: "ACTIVE", endsAt: { gt: new Date() } },
    orderBy: { endsAt: "desc" },
  });
  const startsAt = latest?.endsAt && latest.endsAt > new Date() ? latest.endsAt : new Date();
  const endsAt = new Date(startsAt.getTime() + promo.durationDays * 86400_000);
  await tx.promotion.update({ where: { id: promotionId }, data: { status: "ACTIVE", startsAt, endsAt } });
  await audit({ action: "promotion.activated", entityType: "Promotion", entityId: promotionId, data: { startsAt, endsAt } }, tx);
  await notify(
    promo.sellerId,
    "PROMOTION_UPDATE",
    { listing: promo.listing.title, detail: `Your promotion is active until ${endsAt.toUTCString()}.` },
    "/dashboard/promotions",
    tx,
  );
}

/** Marks promotions whose time has passed as EXPIRED (listing returns to normal placement). */
export async function expirePromotions() {
  const now = new Date();
  const expired = await db.promotion.findMany({ where: { status: "ACTIVE", endsAt: { lte: now } }, include: { listing: { select: { title: true } } } });
  for (const p of expired) {
    const res = await db.promotion.updateMany({ where: { id: p.id, status: "ACTIVE" }, data: { status: "EXPIRED" } });
    if (res.count) {
      await notify(p.sellerId, "PROMOTION_UPDATE", { listing: p.listing.title, detail: "Your promotion has ended. The listing is back to standard placement." }, "/dashboard/promotions");
    }
  }
  // Abandoned checkouts
  await db.promotion.updateMany({ where: { status: "PENDING_PAYMENT", createdAt: { lt: new Date(now.getTime() - 24 * 3600_000) } }, data: { status: "CANCELLED" } });
  if (expired.length) kickEmails();
  return expired.length;
}

/** Records impressions/clicks for promoted listings (used for promotion analytics). */
export async function trackPromotion(listingIds: string[], kind: "impression" | "click") {
  if (!listingIds.length) return;
  const now = new Date();
  const promos = await db.promotion.findMany({ where: { listingId: { in: listingIds.slice(0, 60) }, ...activePromotionWhere(now) }, select: { id: true } });
  if (!promos.length) return;
  const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const field = kind === "impression" ? "impressions" : "clicks";
  await db.$transaction([
    db.promotion.updateMany({ where: { id: { in: promos.map((p) => p.id) } }, data: { [field]: { increment: 1 } } }),
    ...promos.map((p) =>
      db.promotionDailyStat.upsert({
        where: { promotionId_day: { promotionId: p.id, day } },
        create: { promotionId: p.id, day, [field]: 1 },
        update: { [field]: { increment: 1 } },
      }),
    ),
  ]);
}
