import "server-only";
import type { BusinessCategory, Market, Prisma, PromotionBorder } from "@prisma/client";
import { db } from "./db";
import { activePromotionWhere } from "./promotions";
import { convert, toUsd, type CurrencyCode, type Rates } from "./money";
import { STARTER_BRACKETS } from "./categories";

export const fileUrl = (fileId: string) => `/api/files/${fileId}`;

export const cardInclude = {
  seller: { select: { username: true, displayName: true, identityVerified: true, businessVerified: true } },
  auction: { select: { id: true, status: true, currentBid: true, startingBid: true, endsAt: true, bidCount: true, reserveMet: true, reservePrice: true, buyNowPrice: true } },
  media: { where: { kind: { in: ["LOGO", "SCREENSHOT"] } }, orderBy: { sortOrder: "asc" }, take: 3, select: { kind: true, fileId: true } },
  promotions: { where: activePromotionWhere(), orderBy: { searchBoost: "desc" }, take: 1, select: { id: true, border: true, searchBoost: true } },
  _count: { select: { watchers: true } },
} satisfies Prisma.ListingInclude;

type CardRow = Prisma.ListingGetPayload<{ include: typeof cardInclude }>;

export type ListingCardData = {
  id: string;
  slug: string;
  title: string;
  tagline: string | null;
  category: BusinessCategory;
  market: Market;
  saleType: "FIXED" | "AUCTION";
  status: string;
  currency: CurrencyCode;
  price: number; // asking price or current/starting bid (minor units)
  monthlyRevenue: number;
  monthlyProfit: number;
  isPreRevenue: boolean;
  logoUrl: string | null;
  coverUrl: string | null;
  sellerName: string;
  sellerVerified: boolean;
  financialsVerified: boolean;
  techStack: string[];
  demoUrl: string | null;
  demoVerified: boolean;
  developmentStatus: string | null;
  sourceCodeIncluded: boolean;
  qualityScore: number | null;
  auction: { endsAt: string | null; bidCount: number; hasBids: boolean; reserveMet: boolean; hasReserve: boolean; live: boolean } | null;
  promotion: { id: string; border: PromotionBorder } | null;
  watchers: number;
  views: number;
  createdAt: string;
};

/** Transparent project quality indicator for Starter Market (each point is a verifiable fact). */
export function starterQuality(l: Pick<CardRow, "demoVerifiedAt" | "repositoryUrl" | "sourceCodeIncluded" | "featuresIncluded" | "techStack" | "description" | "developmentStatus"> & { screenshotCount: number }) {
  let s = 0;
  if (l.demoVerifiedAt) s += 25;
  if (l.repositoryUrl) s += 10;
  if (l.sourceCodeIncluded) s += 20;
  if (l.screenshotCount >= 3) s += 15;
  else if (l.screenshotCount >= 1) s += 8;
  if (l.featuresIncluded.length >= 5) s += 10;
  else if (l.featuresIncluded.length >= 2) s += 5;
  if (l.techStack.length >= 2) s += 5;
  if (l.description.length >= 600) s += 10;
  else if (l.description.length >= 250) s += 5;
  if (l.developmentStatus && ["MVP", "BETA", "LAUNCHED"].includes(l.developmentStatus)) s += 5;
  return Math.min(100, s);
}

export function toCard(l: CardRow): ListingCardData {
  const logo = l.media.find((m) => m.kind === "LOGO");
  const shot = l.media.find((m) => m.kind === "SCREENSHOT");
  const a = l.auction;
  const price = l.saleType === "AUCTION" && a ? (a.currentBid ?? a.startingBid) : (l.askingPrice ?? 0);
  return {
    id: l.id,
    slug: l.slug,
    title: l.title,
    tagline: l.tagline,
    category: l.category,
    market: l.market,
    saleType: l.saleType,
    status: l.status,
    currency: l.currency as CurrencyCode,
    price,
    monthlyRevenue: l.monthlyRevenue,
    monthlyProfit: l.monthlyProfit,
    isPreRevenue: l.isPreRevenue,
    logoUrl: logo ? fileUrl(logo.fileId) : null,
    coverUrl: shot ? fileUrl(shot.fileId) : null,
    sellerName: l.seller.displayName,
    sellerVerified: l.seller.identityVerified || l.seller.businessVerified,
    financialsVerified: l.financialsVerified,
    techStack: l.techStack.slice(0, 4),
    demoUrl: l.demoUrl,
    demoVerified: Boolean(l.demoVerifiedAt),
    developmentStatus: l.developmentStatus,
    sourceCodeIncluded: l.sourceCodeIncluded,
    qualityScore: l.market === "STARTER" ? starterQuality({ ...l, screenshotCount: l.media.filter((m) => m.kind === "SCREENSHOT").length }) : null,
    auction: a
      ? { endsAt: a.endsAt?.toISOString() ?? null, bidCount: a.bidCount, hasBids: a.currentBid !== null, reserveMet: a.reserveMet, hasReserve: a.reservePrice !== null, live: a.status === "LIVE" }
      : null,
    promotion: l.promotions[0] ? { id: l.promotions[0].id, border: l.promotions[0].border } : null,
    watchers: l._count.watchers,
    views: l.viewCount,
    createdAt: l.createdAt.toISOString(),
  };
}

export type ListingFilters = {
  q?: string;
  category?: string;
  market?: Market;
  saleType?: "FIXED" | "AUCTION";
  priceMin?: number; // major units in display currency
  priceMax?: number;
  revenueMin?: number;
  profitMin?: number;
  country?: string;
  ageMin?: number;
  tech?: string;
  verified?: boolean;
  recent?: boolean;
  endingSoon?: boolean;
  preRevenue?: "only" | "exclude";
  bracket?: string; // Starter Market GEL brackets
  sort?: "newest" | "priceAsc" | "priceDesc" | "revenue" | "popular" | "ending";
  page?: number;
};

export function parseFilters(sp: Record<string, string | string[] | undefined>): ListingFilters {
  const s = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string).trim() : undefined) || undefined;
  const n = (k: string) => {
    const v = s(k);
    const x = v ? Number(v) : NaN;
    return Number.isFinite(x) && x >= 0 ? x : undefined;
  };
  const sorts = ["newest", "priceAsc", "priceDesc", "revenue", "popular", "ending"] as const;
  return {
    q: s("q")?.slice(0, 100),
    category: s("category"),
    saleType: s("type") === "AUCTION" ? "AUCTION" : s("type") === "FIXED" ? "FIXED" : undefined,
    priceMin: n("priceMin"),
    priceMax: n("priceMax"),
    revenueMin: n("revenueMin"),
    profitMin: n("profitMin"),
    country: s("country")?.slice(0, 2),
    ageMin: n("ageMin"),
    tech: s("tech")?.slice(0, 40),
    verified: s("verified") === "1",
    recent: s("recent") === "1",
    endingSoon: s("ending") === "1",
    preRevenue: s("stage") === "pre" ? "only" : s("stage") === "established" ? "exclude" : undefined,
    bracket: s("bracket"),
    sort: (sorts as readonly string[]).includes(s("sort") ?? "") ? (s("sort") as ListingFilters["sort"]) : undefined,
    page: Math.max(1, Math.min(500, Math.floor(n("page") ?? 1))),
  };
}

function buildWhere(f: ListingFilters, display: CurrencyCode, rates: Rates): Prisma.ListingWhereInput {
  const toUsdCents = (major: number) => toUsd(Math.round(major * 100), display, rates);
  const and: Prisma.ListingWhereInput[] = [{ status: "ACTIVE" }];
  if (f.market) and.push({ market: f.market });
  if (f.q) {
    and.push({
      OR: [
        { title: { contains: f.q, mode: "insensitive" } },
        { tagline: { contains: f.q, mode: "insensitive" } },
        { description: { contains: f.q, mode: "insensitive" } },
        { techStack: { has: f.q } },
      ],
    });
  }
  if (f.category) and.push({ category: f.category as BusinessCategory });
  if (f.saleType) and.push({ saleType: f.saleType });
  if (f.priceMin !== undefined) and.push({ priceUsd: { gte: toUsdCents(f.priceMin) } });
  if (f.priceMax !== undefined) and.push({ priceUsd: { lte: toUsdCents(f.priceMax) } });
  if (f.revenueMin !== undefined) and.push({ revenueUsd: { gte: toUsdCents(f.revenueMin) } });
  if (f.profitMin !== undefined) and.push({ profitUsd: { gte: toUsdCents(f.profitMin) } });
  if (f.country) and.push({ country: f.country.toUpperCase() });
  if (f.ageMin !== undefined) and.push({ businessAgeMonths: { gte: f.ageMin } });
  if (f.tech) and.push({ techStack: { hasSome: [f.tech, f.tech.toLowerCase(), f.tech[0].toUpperCase() + f.tech.slice(1)] } });
  if (f.verified) and.push({ OR: [{ financialsVerified: true }, { seller: { identityVerified: true } }, { seller: { businessVerified: true } }] });
  if (f.recent) and.push({ publishedAt: { gte: new Date(Date.now() - 7 * 86400_000) } });
  if (f.endingSoon) and.push({ auction: { status: "LIVE", endsAt: { lte: new Date(Date.now() + 86400_000), gt: new Date() } } });
  if (f.preRevenue === "only") and.push({ isPreRevenue: true });
  if (f.preRevenue === "exclude") and.push({ isPreRevenue: false });
  if (f.bracket) {
    const b = STARTER_BRACKETS.find((x) => x.key === f.bracket);
    if (b) {
      and.push({ priceUsd: { gte: convert(b.minGel, "GEL", "USD", rates) } });
      if (b.maxGel !== null) and.push({ priceUsd: { lt: convert(b.maxGel, "GEL", "USD", rates) } });
    }
  }
  return { AND: and };
}

function buildOrder(sort: ListingFilters["sort"]): Prisma.ListingOrderByWithRelationInput[] {
  switch (sort) {
    case "priceAsc":
      return [{ priceUsd: "asc" }, { id: "asc" }];
    case "priceDesc":
      return [{ priceUsd: "desc" }, { id: "asc" }];
    case "revenue":
      return [{ revenueUsd: "desc" }, { id: "asc" }];
    case "popular":
      return [{ watchers: { _count: "desc" } }, { viewCount: "desc" }, { id: "asc" }];
    case "ending":
      return [{ auction: { endsAt: "asc" } }, { id: "asc" }];
    default:
      return [{ publishedAt: "desc" }, { id: "asc" }];
  }
}

export const PAGE_SIZE = 24;

/**
 * Marketplace search. Listings with an active Premium/Ultimate promotion that
 * match the filters are pinned to the top (clearly labelled as ads); they are
 * excluded from the organic results so they never appear twice.
 */
export async function searchListings(f: ListingFilters, display: CurrencyCode, rates: Rates) {
  const where = buildWhere(f, display, rates);
  if (f.sort === "ending") (where.AND as Prisma.ListingWhereInput[]).push({ auction: { status: "LIVE" } });
  const pinnedRows = await db.listing.findMany({
    where: { AND: [where, { promotions: { some: { ...activePromotionWhere(), searchBoost: { gte: 2 } } } }] },
    include: cardInclude,
    take: 12,
  });
  // Rotate pinned ads fairly; highest boost first.
  const pinned = pinnedRows
    .map((r) => ({ r, k: (r.promotions[0]?.searchBoost ?? 0) * 1000 + Math.random() * 999 }))
    .sort((a, b) => b.k - a.k)
    .slice(0, 4)
    .map((x) => x.r);
  const organicWhere: Prisma.ListingWhereInput = { AND: [where, { id: { notIn: pinned.map((p) => p.id) } }] };
  const page = f.page ?? 1;
  const [rows, total] = await Promise.all([
    db.listing.findMany({ where: organicWhere, include: cardInclude, orderBy: buildOrder(f.sort), skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    db.listing.count({ where: organicWhere }),
  ]);
  return {
    pinned: page === 1 ? pinned.map(toCard) : [],
    items: rows.map(toCard),
    total: total + pinned.length,
    pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    page,
  };
}

export async function listingCards(where: Prisma.ListingWhereInput, orderBy: Prisma.ListingOrderByWithRelationInput[] = [{ publishedAt: "desc" }], take = 8) {
  const rows = await db.listing.findMany({ where: { status: "ACTIVE", ...where }, include: cardInclude, orderBy, take });
  return rows.map(toCard);
}

/** Recomputes USD-normalized sort keys (call when exchange rates change or prices change). */
export function normalizedFields(
  l: { currency: CurrencyCode; askingPrice: number | null; monthlyRevenue: number; monthlyProfit: number },
  headlinePrice: number,
  rates: Rates,
) {
  return {
    priceUsd: toUsd(headlinePrice, l.currency, rates),
    revenueUsd: toUsd(l.monthlyRevenue, l.currency, rates),
    profitUsd: toUsd(l.monthlyProfit, l.currency, rates),
  };
}

export async function renormalizeAll(rates: Rates) {
  const rows = await db.listing.findMany({
    where: { currency: { not: "USD" }, status: { in: ["ACTIVE", "PENDING_REVIEW", "PENDING_SALE"] } },
    select: { id: true, currency: true, askingPrice: true, monthlyRevenue: true, monthlyProfit: true, saleType: true, auction: { select: { currentBid: true, startingBid: true } } },
  });
  for (const l of rows) {
    const headline = l.saleType === "AUCTION" && l.auction ? (l.auction.currentBid ?? l.auction.startingBid) : (l.askingPrice ?? 0);
    await db.listing.update({ where: { id: l.id }, data: normalizedFields({ ...l, currency: l.currency as CurrencyCode }, headline, rates) });
  }
  return rows.length;
}
