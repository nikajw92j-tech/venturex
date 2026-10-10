"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import type { BusinessCategory, DevelopmentStatus, MediaKind } from "@prisma/client";
import { db } from "@/lib/db";
import { actionUser } from "@/lib/auth/session";
import { run, UserError } from "@/lib/action";
import { enforceRateLimit } from "@/lib/ratelimit";
import { ALL_CATEGORIES, DEV_STATUSES } from "@/lib/categories";
import { AUCTION_DURATIONS_HOURS } from "@/lib/auction/engine";
import { assertListingCapacity, goLive, notifyInterestedBuyers, verifyDemo } from "@/lib/listing-service";
import { getSettings } from "@/lib/settings";
import { getRates } from "@/lib/rates";
import { normalizedFields } from "@/lib/listings";
import { audit } from "@/lib/audit";
import { notify, kickEmails } from "@/lib/notify";
import { formatMoney, toMinor, type CurrencyCode } from "@/lib/money";
import { randomSuffix, slugify } from "@/lib/utils";

const money = z.coerce.number().min(0).max(20_000_000);
const optMoney = z.union([z.literal(""), z.null(), z.undefined(), z.coerce.number().min(0).max(20_000_000)]).transform((v) => (v === "" || v == null ? null : v));
const url = z.union([z.literal(""), z.string().trim().url("Enter a full URL starting with https://").max(300)]).optional();
const lines = z.array(z.string().trim().min(1).max(200)).max(40);

const schema = z
  .object({
    id: z.string().optional(),
    market: z.enum(["MAIN", "STARTER"]),
    title: z.string().trim().min(3, "Business name is too short").max(90),
    tagline: z.string().trim().max(160).optional(),
    category: z.string().refine((c) => ALL_CATEGORIES.some((x) => x.key === c), "Choose a category"),
    websiteUrl: url,
    description: z.string().trim().min(80, "Describe the business in at least 80 characters").max(15000),
    businessAgeMonths: z.coerce.number().int().min(0).max(600),
    country: z.string().max(2).optional(),
    techStack: z.array(z.string().trim().min(1).max(40)).max(20),
    currency: z.enum(["USD", "GEL", "EUR"]),
    monthlyRevenue: money,
    monthlyExpenses: money,
    monthlyTraffic: z.coerce.number().int().min(0).max(2_000_000_000),
    customers: z.coerce.number().int().min(0).max(100_000_000),
    revenueHistory: z.array(z.object({ month: z.string().regex(/^\d{4}-\d{2}$/), revenue: money, profit: z.coerce.number().min(-20_000_000).max(20_000_000) })).max(36),
    trafficHistory: z.array(z.object({ month: z.string().regex(/^\d{4}-\d{2}$/), visitors: z.coerce.number().int().min(0) })).max(36),
    reasonForSale: z.string().trim().max(3000).optional(),
    assetsIncluded: lines,
    growthOpportunities: z.string().trim().max(5000).optional(),
    riskDisclosures: z.string().trim().max(5000).optional(),
    // Starter Market
    demoUrl: url,
    repositoryUrl: url,
    developmentStatus: z.string().optional(),
    featuresIncluded: lines,
    sourceCodeIncluded: z.boolean(),
    // Selling method
    saleType: z.enum(["FIXED", "AUCTION"]),
    askingPrice: optMoney,
    startingBid: optMoney,
    minIncrement: optMoney,
    durationHours: z.coerce.number().int().optional(),
    reservePrice: optMoney,
    buyNowPrice: optMoney,
    media: z.array(z.object({ fileId: z.string(), kind: z.enum(["LOGO", "SCREENSHOT", "REVENUE_EVIDENCE", "TRAFFIC_EVIDENCE", "DOCUMENT"]), caption: z.string().max(120).optional() })).max(30),
  })
  .superRefine((v, ctx) => {
    if (v.saleType === "FIXED" && (!v.askingPrice || v.askingPrice <= 0)) ctx.addIssue({ code: "custom", path: ["askingPrice"], message: "Set an asking price" });
    if (v.saleType === "AUCTION") {
      if (!v.startingBid || v.startingBid <= 0) ctx.addIssue({ code: "custom", path: ["startingBid"], message: "Set a starting bid" });
      if (!v.minIncrement || v.minIncrement <= 0) ctx.addIssue({ code: "custom", path: ["minIncrement"], message: "Set a minimum bid increment" });
      if (!AUCTION_DURATIONS_HOURS.includes(v.durationHours as (typeof AUCTION_DURATIONS_HOURS)[number])) ctx.addIssue({ code: "custom", path: ["durationHours"], message: "Choose a duration" });
      if (v.reservePrice && v.startingBid && v.reservePrice < v.startingBid) ctx.addIssue({ code: "custom", path: ["reservePrice"], message: "Reserve must be at least the starting bid" });
      if (v.buyNowPrice && v.startingBid && v.buyNowPrice <= v.startingBid) ctx.addIssue({ code: "custom", path: ["buyNowPrice"], message: "Buy Now price must be above the starting bid" });
      if (v.buyNowPrice && v.reservePrice && v.buyNowPrice < v.reservePrice) ctx.addIssue({ code: "custom", path: ["buyNowPrice"], message: "Buy Now price must be at least the reserve" });
    }
    if (v.monthlyExpenses > v.monthlyRevenue && v.monthlyRevenue > 0 && v.market === "MAIN") {
      // allowed (loss-making) but must be disclosed
      if (!v.riskDisclosures) ctx.addIssue({ code: "custom", path: ["riskDisclosures"], message: "Expenses exceed revenue — please explain in the risk disclosures" });
    }
    if (v.market === "STARTER" && v.developmentStatus && !DEV_STATUSES.some((d) => d.key === v.developmentStatus)) ctx.addIssue({ code: "custom", path: ["developmentStatus"], message: "Invalid status" });
  });

export type ListingInput = z.input<typeof schema>;

export async function saveListingAction(input: ListingInput, submit: boolean) {
  return run(async () => {
    const user = await actionUser({ verified: submit });
    await enforceRateLimit(`listing-save:${user.id}`, 60, 3600);
    const v = schema.parse(input);
    const settings = await getSettings();

    const existing = v.id ? await db.listing.findUnique({ where: { id: v.id }, include: { auction: true } }) : null;
    if (v.id && (!existing || existing.sellerId !== user.id)) throw new UserError("Listing not found");
    if (existing && !["DRAFT", "REJECTED", "PENDING_REVIEW", "ACTIVE", "EXPIRED", "WITHDRAWN"].includes(existing.status)) {
      throw new UserError("This listing can't be edited while a sale is in progress");
    }
    const liveAuctionLocked = existing?.status === "ACTIVE" && existing.saleType === "AUCTION";

    // Media ownership & visibility checks
    const files = await db.storedFile.findMany({ where: { id: { in: v.media.map((m) => m.fileId) } } });
    for (const m of v.media) {
      const f = files.find((x) => x.id === m.fileId);
      if (!f || f.ownerId !== user.id) throw new UserError("One of the uploaded files is invalid");
      const mustBePublic = m.kind === "LOGO" || m.kind === "SCREENSHOT";
      if (mustBePublic !== (f.visibility === "PUBLIC")) throw new UserError("Evidence files must be uploaded as private documents");
    }

    const isStarter = v.market === "STARTER";
    const revenue = toMinor(v.monthlyRevenue);
    const expenses = toMinor(v.monthlyExpenses);
    const data = {
      market: v.market,
      title: v.title,
      tagline: v.tagline || null,
      category: v.category as BusinessCategory,
      websiteUrl: v.websiteUrl || null,
      description: v.description,
      businessAgeMonths: v.businessAgeMonths,
      country: v.country || null,
      techStack: [...new Set(v.techStack)],
      currency: v.currency,
      monthlyRevenue: revenue,
      monthlyExpenses: expenses,
      monthlyProfit: revenue - expenses,
      monthlyTraffic: v.monthlyTraffic,
      customers: v.customers,
      isPreRevenue: revenue === 0 || v.category === "PRE_REVENUE",
      revenueHistory: v.revenueHistory.map((r) => ({ month: r.month, revenue: toMinor(r.revenue), profit: toMinor(r.profit) })),
      trafficHistory: v.trafficHistory,
      reasonForSale: v.reasonForSale || null,
      assetsIncluded: v.assetsIncluded,
      growthOpportunities: v.growthOpportunities || null,
      riskDisclosures: v.riskDisclosures || null,
      demoUrl: isStarter ? v.demoUrl || null : null,
      repositoryUrl: isStarter ? v.repositoryUrl || null : null,
      developmentStatus: isStarter && v.developmentStatus ? (v.developmentStatus as DevelopmentStatus) : null,
      featuresIncluded: isStarter ? v.featuresIncluded : [],
      sourceCodeIncluded: v.sourceCodeIncluded,
      saleType: v.saleType,
      askingPrice: v.saleType === "FIXED" ? toMinor(v.askingPrice!) : null,
    };

    const { rates } = await getRates();
    const result = await db.$transaction(async (tx) => {
      let listing;
      if (existing) {
        const priceChanged = existing.saleType === "FIXED" && data.askingPrice !== null && existing.askingPrice !== data.askingPrice;
        const financialsChanged = existing.monthlyRevenue !== data.monthlyRevenue || existing.monthlyExpenses !== data.monthlyExpenses;
        if (liveAuctionLocked && (data.saleType !== "AUCTION" || data.currency !== existing.currency)) throw new UserError("Selling method and currency can't change while the auction is live");
        listing = await tx.listing.update({
          where: { id: existing.id },
          data: {
            ...data,
            ...(liveAuctionLocked ? { saleType: "AUCTION" as const, currency: existing.currency } : {}),
            // Changing figures removes the verified badge until re-verified.
            ...(financialsChanged ? { financialsVerified: false } : {}),
            ...(data.demoUrl !== existing.demoUrl ? { demoVerifiedAt: null } : {}),
          },
        });
        if (priceChanged && existing.status === "ACTIVE") {
          const watchers = await tx.watchlistItem.findMany({ where: { listingId: existing.id }, select: { userId: true } });
          for (const w of watchers) {
            await notify(w.userId, "PRICE_CHANGE", { listing: listing.title, old: formatMoney(existing.askingPrice ?? 0, existing.currency as CurrencyCode), amount: formatMoney(data.askingPrice!, data.currency as CurrencyCode) }, `/listing/${listing.slug}`, tx);
          }
          await tx.watchlistItem.updateMany({ where: { listingId: existing.id }, data: { lastKnownPrice: data.askingPrice } });
        }
      } else {
        listing = await tx.listing.create({ data: { ...data, sellerId: user.id, slug: `${slugify(v.title) || "listing"}-${randomSuffix(5)}`, status: "DRAFT" } });
      }

      // Auction terms (immutable once the auction is live)
      if (v.saleType === "AUCTION" && !liveAuctionLocked) {
        const terms = {
          startingBid: toMinor(v.startingBid!),
          minIncrement: toMinor(v.minIncrement!),
          reservePrice: v.reservePrice ? toMinor(v.reservePrice) : null,
          buyNowPrice: v.buyNowPrice ? toMinor(v.buyNowPrice) : null,
          durationHours: v.durationHours!,
        };
        if (existing?.auction) {
          // Relisting after an ended/cancelled auction starts with a clean bid history.
          await tx.bid.deleteMany({ where: { auctionId: existing.auction.id } });
          await tx.autoBid.deleteMany({ where: { auctionId: existing.auction.id } });
        }
        await tx.auction.upsert({ where: { listingId: listing.id }, create: { listingId: listing.id, ...terms, status: "LIVE", currentBid: null }, update: { ...terms, status: "LIVE", currentBid: null, currentBidderId: null, bidCount: 0, reserveMet: false, winnerId: null, endedAt: null, extensions: 0, endingSoonNotified: false } });
      } else if (v.saleType === "FIXED" && existing?.auction && !liveAuctionLocked) {
        await tx.auction.delete({ where: { listingId: listing.id } });
      }

      // Replace media set
      await tx.listingMedia.deleteMany({ where: { listingId: listing.id } });
      if (v.media.length) {
        await tx.listingMedia.createMany({ data: v.media.map((m, i) => ({ listingId: listing.id, fileId: m.fileId, kind: m.kind as MediaKind, caption: m.caption ?? null, sortOrder: i })) });
      }

      const headline = liveAuctionLocked
        ? (existing!.auction!.currentBid ?? existing!.auction!.startingBid)
        : v.saleType === "AUCTION" ? toMinor(v.startingBid!) : (data.askingPrice ?? 0);
      const currencyNow = (liveAuctionLocked ? existing!.currency : data.currency) as CurrencyCode;
      await tx.listing.update({ where: { id: listing.id }, data: normalizedFields({ ...data, currency: currencyNow }, headline, rates) });

      let status = listing.status;
      if (submit && ["DRAFT", "REJECTED", "EXPIRED", "WITHDRAWN"].includes(listing.status)) {
        await assertListingCapacity(user.id, listing.id);
        if (settings.requireListingApproval && user.role !== "ADMIN") {
          await tx.listing.update({ where: { id: listing.id }, data: { status: "PENDING_REVIEW", rejectionReason: null } });
          status = "PENDING_REVIEW";
        } else {
          await goLive(tx, await tx.listing.findUniqueOrThrow({ where: { id: listing.id } }));
          status = "ACTIVE";
        }
      }
      await audit({ actorId: user.id, action: existing ? "listing.updated" : "listing.created", entityType: "Listing", entityId: listing.id, data: { submit, status } }, tx);
      return { id: listing.id, slug: listing.slug, status };
    });

    if (result.status === "ACTIVE" && submit && existing?.status !== "ACTIVE") await notifyInterestedBuyers(result.id).catch(() => {});
    if (data.demoUrl) verifyDemo(result.id).catch(() => {});
    kickEmails();
    revalidatePath("/dashboard/listings");
    revalidatePath(`/listing/${result.slug}`);
    return result;
  });
}

export async function withdrawListingAction(listingId: string) {
  return run(async () => {
    const user = await actionUser();
    const l = await db.listing.findUnique({ where: { id: listingId }, include: { auction: true } });
    if (!l || l.sellerId !== user.id) throw new UserError("Listing not found");
    if (l.status === "PENDING_SALE" || l.status === "SOLD") throw new UserError("A sale is in progress for this listing");
    if (l.auction?.status === "LIVE" && l.auction.bidCount > 0 && l.status === "ACTIVE") throw new UserError("Auctions with bids can't be withdrawn. Contact support if there is a problem.");
    await db.$transaction(async (tx) => {
      await tx.listing.update({ where: { id: listingId }, data: { status: "WITHDRAWN" } });
      if (l.auction?.status === "LIVE") await tx.auction.update({ where: { id: l.auction.id }, data: { status: "CANCELLED", endedAt: new Date() } });
      await tx.offer.updateMany({ where: { listingId, status: "PENDING" }, data: { status: "EXPIRED" } });
      await audit({ actorId: user.id, action: "listing.withdrawn", entityType: "Listing", entityId: listingId }, tx);
    });
    revalidatePath("/dashboard/listings");
  });
}

export async function deleteDraftAction(listingId: string) {
  return run(async () => {
    const user = await actionUser();
    const l = await db.listing.findUnique({ where: { id: listingId }, include: { _count: { select: { deals: true } } } });
    if (!l || l.sellerId !== user.id) throw new UserError("Listing not found");
    if (!["DRAFT", "REJECTED", "WITHDRAWN", "EXPIRED"].includes(l.status) || l._count.deals > 0) throw new UserError("Only drafts and inactive listings without transactions can be deleted");
    await db.listing.delete({ where: { id: listingId } });
    revalidatePath("/dashboard/listings");
  });
}

export async function recheckDemoAction(listingId: string) {
  return run(async () => {
    const user = await actionUser();
    const l = await db.listing.findUnique({ where: { id: listingId } });
    if (!l || (l.sellerId !== user.id && user.role !== "ADMIN")) throw new UserError("Listing not found");
    await enforceRateLimit(`demo-check:${listingId}`, 5, 3600);
    return { ok: await verifyDemo(listingId) };
  });
}
