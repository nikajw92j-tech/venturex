"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import type { BusinessCategory } from "@prisma/client";
import { db } from "@/lib/db";
import { actionUser } from "@/lib/auth/session";
import { run, UserError } from "@/lib/action";
import { enforceRateLimit } from "@/lib/ratelimit";
import { notify, kickEmails } from "@/lib/notify";
import { audit } from "@/lib/audit";
import { ALL_CATEGORIES } from "@/lib/categories";

const ALLOWED_QUERY_KEYS = ["q", "category", "type", "priceMin", "priceMax", "revenueMin", "profitMin", "country", "ageMin", "tech", "verified", "recent", "ending", "stage", "bracket", "sort"];

export async function saveSearchAction(query: Record<string, string>, market: "MAIN" | "STARTER") {
  return run(async () => {
    const user = await actionUser();
    const clean: Record<string, string> = { market };
    for (const k of ALLOWED_QUERY_KEYS) if (query[k]) clean[k] = String(query[k]).slice(0, 80);
    const count = await db.savedSearch.count({ where: { userId: user.id } });
    if (count >= 25) throw new UserError("You can keep up to 25 saved searches");
    const name = [clean.q, clean.category, clean.type].filter(Boolean).join(" · ") || (market === "STARTER" ? "Starter Market" : "All businesses");
    await db.savedSearch.create({ data: { userId: user.id, name, query: clean } });
    revalidatePath("/dashboard/saved");
  });
}

export async function deleteSavedSearchAction(id: string) {
  return run(async () => {
    const user = await actionUser();
    await db.savedSearch.deleteMany({ where: { id, userId: user.id } });
    revalidatePath("/dashboard/saved");
  });
}

export async function toggleWatchAction(listingId: string) {
  return run(async () => {
    const user = await actionUser();
    const existing = await db.watchlistItem.findUnique({ where: { userId_listingId: { userId: user.id, listingId } } });
    if (existing) {
      await db.watchlistItem.delete({ where: { id: existing.id } });
      revalidatePath("/watchlist");
      return { watching: false };
    }
    const listing = await db.listing.findUnique({ where: { id: listingId }, select: { askingPrice: true, sellerId: true } });
    if (!listing) throw new UserError("Listing not found");
    await db.watchlistItem.create({ data: { userId: user.id, listingId, lastKnownPrice: listing.askingPrice } });
    revalidatePath("/watchlist");
    return { watching: true };
  });
}

const reportSchema = z.object({
  targetType: z.enum(["LISTING", "CONVERSATION", "USER"]),
  targetId: z.string().min(1).max(40),
  reason: z.string().min(3).max(80),
  details: z.string().max(2000).optional(),
});

export async function reportAction(input: z.infer<typeof reportSchema>) {
  return run(async () => {
    const user = await actionUser();
    await enforceRateLimit(`report:${user.id}`, 10, 3600);
    const data = reportSchema.parse(input);
    await db.report.create({ data: { ...data, reporterId: user.id } });
    await audit({ actorId: user.id, action: "report.created", entityType: data.targetType, entityId: data.targetId, data: { reason: data.reason } });
  });
}

export async function askQuestionAction(listingId: string, question: string) {
  return run(async () => {
    const user = await actionUser({ verified: true });
    await enforceRateLimit(`question:${user.id}`, 10, 3600);
    const q = z.string().trim().min(5, "Question is too short").max(1000).parse(question);
    const listing = await db.listing.findUnique({ where: { id: listingId }, select: { sellerId: true, title: true, slug: true } });
    if (!listing) throw new UserError("Listing not found");
    if (listing.sellerId === user.id) throw new UserError("You can't ask questions on your own listing");
    await db.listingQuestion.create({ data: { listingId, askerId: user.id, question: q } });
    await notify(listing.sellerId, "SYSTEM", { title: `New question on ${listing.title}`, detail: q.slice(0, 200) }, `/listing/${listing.slug}#questions`);
    kickEmails();
    revalidatePath(`/listing/${listing.slug}`);
  });
}

export async function answerQuestionAction(questionId: string, answer: string) {
  return run(async () => {
    const user = await actionUser();
    const a = z.string().trim().min(1).max(2000).parse(answer);
    const q = await db.listingQuestion.findUnique({ where: { id: questionId }, include: { listing: { select: { sellerId: true, slug: true, title: true } } } });
    if (!q || q.listing.sellerId !== user.id) throw new UserError("Not allowed");
    await db.listingQuestion.update({ where: { id: questionId }, data: { answer: a, answeredAt: new Date() } });
    await notify(q.askerId, "SYSTEM", { title: `Your question was answered`, detail: `${q.listing.title}: ${a.slice(0, 200)}` }, `/listing/${q.listing.slug}#questions`);
    kickEmails();
    revalidatePath(`/listing/${q.listing.slug}`);
  });
}

export async function requestDocumentAccessAction(listingId: string, message: string, ndaAccepted: boolean) {
  return run(async () => {
    const user = await actionUser({ verified: true });
    if (!ndaAccepted) throw new UserError("Please accept the confidentiality terms");
    const listing = await db.listing.findUnique({ where: { id: listingId }, select: { sellerId: true, title: true } });
    if (!listing) throw new UserError("Listing not found");
    if (listing.sellerId === user.id) throw new UserError("This is your listing");
    await db.documentAccess.upsert({
      where: { listingId_buyerId: { listingId, buyerId: user.id } },
      create: { listingId, buyerId: user.id, message: message.slice(0, 1000), ndaAcceptedAt: new Date() },
      update: { status: "REQUESTED", message: message.slice(0, 1000), ndaAcceptedAt: new Date() },
    });
    await notify(listing.sellerId, "SYSTEM", { title: "Document access requested", detail: `${user.displayName} requested access to the confidential documents for ${listing.title}.` }, "/dashboard/listings");
    await audit({ actorId: user.id, action: "documents.requested", entityType: "Listing", entityId: listingId });
    kickEmails();
  });
}

export async function decideDocumentAccessAction(accessId: string, grant: boolean) {
  return run(async () => {
    const user = await actionUser();
    const access = await db.documentAccess.findUnique({ where: { id: accessId }, include: { listing: { select: { sellerId: true, title: true, slug: true } } } });
    if (!access || access.listing.sellerId !== user.id) throw new UserError("Not allowed");
    await db.documentAccess.update({ where: { id: accessId }, data: { status: grant ? "GRANTED" : "DENIED", decidedAt: new Date() } });
    await notify(access.buyerId, "SYSTEM", { title: grant ? "Document access granted" : "Document access declined", detail: `${access.listing.title}` }, `/listing/${access.listing.slug}`);
    await audit({ actorId: user.id, action: grant ? "documents.granted" : "documents.denied", entityType: "Listing", entityId: access.listingId, data: { buyerId: access.buyerId } });
    kickEmails();
    revalidatePath("/dashboard/listings");
  });
}

export async function updateMatchingPrefsAction(categories: string[], budgetMaxUsd: number | null) {
  return run(async () => {
    const user = await actionUser();
    const valid = categories.filter((c) => ALL_CATEGORIES.some((x) => x.key === c)) as BusinessCategory[];
    await db.user.update({ where: { id: user.id }, data: { preferredCategories: valid.slice(0, 10), budgetMaxUsd: budgetMaxUsd && budgetMaxUsd > 0 ? Math.round(budgetMaxUsd * 100) : null } });
    revalidatePath("/dashboard/settings");
  });
}
