import "server-only";
import type { BusinessCategory } from "@prisma/client";
import { db } from "./db";
import { cardInclude, toCard, type ListingCardData } from "./listings";

/**
 * Smart matching: recommends live listings from signals the user gave us —
 * preferred categories, budget, saved searches, watchlist and recently viewed.
 * Every signal is explicit user behaviour; nothing is inferred from other users.
 */
export async function recommendFor(userId: string, take = 8): Promise<ListingCardData[]> {
  const [user, searches, views, watched] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { preferredCategories: true, budgetMaxUsd: true } }),
    db.savedSearch.findMany({ where: { userId }, select: { query: true }, take: 20 }),
    db.recentView.findMany({ where: { userId }, orderBy: { viewedAt: "desc" }, take: 20, select: { listingId: true, listing: { select: { category: true, priceUsd: true } } } }),
    db.watchlistItem.findMany({ where: { userId }, select: { listingId: true, listing: { select: { category: true, priceUsd: true } } } }),
  ]);
  if (!user) return [];

  const weight = new Map<BusinessCategory, number>();
  const bump = (c: BusinessCategory | undefined, w: number) => c && weight.set(c, (weight.get(c) ?? 0) + w);
  user.preferredCategories.forEach((c) => bump(c, 4));
  for (const s of searches) bump((s.query as Record<string, string>)?.category as BusinessCategory | undefined, 3);
  watched.forEach((w) => bump(w.listing.category, 2));
  views.forEach((v) => bump(v.listing.category, 1));

  // Budget: explicit preference, otherwise ~1.5× the median price the user looked at.
  const seenPrices = [...views, ...watched].map((v) => v.listing.priceUsd).filter((p) => p > 0).sort((a, b) => a - b);
  const budget = user.budgetMaxUsd ?? (seenPrices.length ? Math.round(seenPrices[Math.floor(seenPrices.length / 2)] * 1.5) : null);

  const exclude = new Set([...views.map((v) => v.listingId), ...watched.map((w) => w.listingId)]);
  const cats = [...weight.keys()];
  if (!cats.length && !budget) return [];

  const candidates = await db.listing.findMany({
    where: {
      status: "ACTIVE",
      sellerId: { not: userId },
      id: { notIn: [...exclude] },
      OR: [...(cats.length ? [{ category: { in: cats } }] : []), ...(budget ? [{ priceUsd: { lte: budget } }] : [])],
    },
    include: cardInclude,
    orderBy: { publishedAt: "desc" },
    take: 60,
  });

  const fresh = Date.now() - 14 * 86400_000;
  return candidates
    .map((l) => ({
      l,
      score: (weight.get(l.category) ?? 0) * 2 + (budget && l.priceUsd <= budget ? 3 : 0) + ((l.publishedAt?.getTime() ?? 0) > fresh ? 1 : 0) + (l.financialsVerified ? 1 : 0),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, take)
    .map((x) => toCard(x.l));
}
