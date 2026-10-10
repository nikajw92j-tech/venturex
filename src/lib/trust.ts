import "server-only";
import { db } from "./db";

export type TrustFactor = { label: string; points: number; max: number };

/**
 * Transparent seller trust score (0–100) computed only from verifiable platform
 * data. Each factor is shown to buyers, so nothing about it is opaque.
 */
export async function trustScore(userId: string) {
  const [user, completed, lostDisputes, reviews] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { createdAt: true, emailVerifiedAt: true, identityVerified: true, businessVerified: true } }),
    db.deal.count({ where: { sellerId: userId, status: "COMPLETED" } }),
    db.dispute.count({ where: { status: "RESOLVED_BUYER", deal: { sellerId: userId } } }),
    db.sellerReview.aggregate({ where: { sellerId: userId }, _avg: { rating: true }, _count: true }),
  ]);
  if (!user) return null;
  const months = (Date.now() - user.createdAt.getTime()) / (30 * 86400_000);
  const factors: TrustFactor[] = [
    { label: "Completed sales on VENTUREX", points: Math.min(30, completed * 6), max: 30 },
    { label: "Identity verified", points: user.identityVerified ? 20 : 0, max: 20 },
    { label: "Business documents verified", points: user.businessVerified ? 10 : 0, max: 10 },
    { label: "Account history", points: Math.min(15, Math.floor(months * 1.25)), max: 15 },
    { label: "Email verified", points: user.emailVerifiedAt ? 5 : 0, max: 5 },
    { label: "Buyer ratings (completed deals only)", points: reviews._count ? Math.round(((reviews._avg.rating ?? 0) / 5) * 20) : 0, max: 20 },
  ];
  const penalty = lostDisputes * 15;
  if (penalty) factors.push({ label: "Disputes resolved against seller", points: -penalty, max: 0 });
  const score = Math.max(0, Math.min(100, factors.reduce((s, f) => s + f.points, 0)));
  return {
    score,
    factors,
    completedSales: completed,
    rating: reviews._count ? Number((reviews._avg.rating ?? 0).toFixed(1)) : null,
    reviewCount: reviews._count,
  };
}
