"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { actionUser } from "@/lib/auth/session";
import { run, UserError } from "@/lib/action";
import { enforceRateLimit } from "@/lib/ratelimit";
import { paymentProvider } from "@/lib/payments";
import { env } from "@/lib/env";
import { audit } from "@/lib/audit";
import { userPlan } from "@/lib/listing-service";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { destroyAllSessions, createSession } from "@/lib/auth/session";
import type { CurrencyCode } from "@/lib/money";

const profileSchema = z.object({
  displayName: z.string().trim().min(2).max(60),
  bio: z.string().trim().max(1000).optional(),
  country: z.string().max(2).optional(),
  githubUrl: z.union([z.literal(""), z.string().url().max(200)]).optional(),
  websiteUrl: z.union([z.literal(""), z.string().url().max(200)]).optional(),
  skills: z.string().max(300).optional(),
  storefrontTitle: z.string().trim().max(80).optional(),
  storefrontAccent: z.union([z.literal(""), z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a hex color like #3b82f6")]).optional(),
});

export async function updateProfileAction(input: z.input<typeof profileSchema>) {
  return run(async () => {
    const user = await actionUser();
    const v = profileSchema.parse(input);
    const plan = await userPlan(user.id);
    await db.user.update({
      where: { id: user.id },
      data: {
        displayName: v.displayName,
        bio: v.bio || null,
        country: v.country || null,
        githubUrl: v.githubUrl || null,
        websiteUrl: v.websiteUrl || null,
        skills: (v.skills ?? "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 15),
        // Storefront customization is a Pro/Business feature.
        ...(plan.storefront ? { storefrontTitle: v.storefrontTitle || null, storefrontAccent: plan.code === "BUSINESS" ? v.storefrontAccent || null : null } : {}),
      },
    });
    revalidatePath("/dashboard/settings");
    revalidatePath(`/u/${user.username}`);
  });
}

export async function changePasswordAction(current: string, next: string) {
  return run(async () => {
    const user = await actionUser();
    await enforceRateLimit(`pw-change:${user.id}`, 5, 3600);
    const row = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    if (row.passwordHash && !(await verifyPassword(current, row.passwordHash))) throw new UserError("Current password is incorrect");
    const pw = z.string().min(10).max(128).refine((p) => /[a-zA-Z]/.test(p) && /\d/.test(p), "Use letters and at least one number").parse(next);
    await db.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(pw) } });
    await destroyAllSessions(user.id);
    await createSession(user.id);
    await audit({ actorId: user.id, action: "user.password_changed", entityType: "User", entityId: user.id });
  });
}

// ───────────────────────────── Payouts ─────────────────────────────

export async function startPayoutOnboardingAction() {
  return run(async () => {
    const user = await actionUser({ verified: true });
    await enforceRateLimit(`onboard:${user.id}`, 10, 3600);
    const { url, accountId } = await paymentProvider().onboardingLink({
      userId: user.id,
      email: user.email,
      country: user.country,
      existingAccountId: user.payoutAccountId,
      returnUrl: `${env.appUrl}/dashboard/payouts?return=1`,
    });
    if (accountId !== user.payoutAccountId && paymentProvider().live) {
      await db.user.update({ where: { id: user.id }, data: { payoutAccountId: accountId } });
    }
    return { url };
  });
}

// ───────────────────────────── Subscriptions ─────────────────────────────

export async function subscribeAction(planCode: string) {
  return run(async () => {
    const user = await actionUser({ verified: true });
    await enforceRateLimit(`subscribe:${user.id}`, 10, 3600);
    const plan = await db.plan.findUnique({ where: { code: planCode } });
    if (!plan || !plan.active || plan.priceMonthly <= 0) throw new UserError("This plan is not available");
    const current = await db.subscription.findUnique({ where: { userId: user.id } });
    if (current && current.status === "ACTIVE" && current.planCode === planCode) throw new UserError("You're already on this plan");
    if (current?.status === "ACTIVE" && current.providerSubscriptionId && paymentProvider().live) {
      throw new UserError("Cancel your current plan first; you can switch once it ends.");
    }
    const provider = paymentProvider();
    const payment = await db.payment.create({ data: { userId: user.id, purpose: "SUBSCRIPTION", provider: provider.name, currency: plan.currency, amount: plan.priceMonthly, planCode } });
    const full = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { billingCustomerId: true } });
    const { url, providerRef } = await provider.createSubscriptionCheckout({
      paymentId: payment.id,
      amount: plan.priceMonthly,
      currency: plan.currency as CurrencyCode,
      description: plan.name,
      planCode: plan.code,
      planName: plan.name,
      userId: user.id,
      customerId: full.billingCustomerId,
      customerEmail: user.email,
      successUrl: `${env.appUrl}/dashboard/subscription?paid=1`,
      cancelUrl: `${env.appUrl}/pricing`,
    });
    await db.payment.update({ where: { id: payment.id }, data: { providerRef, checkoutUrl: url, status: "PROCESSING" } });
    return { url };
  });
}

export async function cancelSubscriptionAction() {
  return run(async () => {
    const user = await actionUser();
    const sub = await db.subscription.findUnique({ where: { userId: user.id } });
    if (!sub || sub.status !== "ACTIVE") throw new UserError("No active subscription");
    if (sub.providerSubscriptionId && paymentProvider().live) await paymentProvider().cancelSubscription(sub.providerSubscriptionId);
    await db.subscription.update({ where: { id: sub.id }, data: { cancelAtPeriodEnd: true } });
    await audit({ actorId: user.id, action: "subscription.cancel_requested", entityType: "Subscription", entityId: sub.id });
    revalidatePath("/dashboard/subscription");
  });
}

// ───────────────────────────── Team (Business plan) ─────────────────────────────

export async function addTeamMemberAction(email: string) {
  return run(async () => {
    const user = await actionUser();
    const plan = await userPlan(user.id);
    if (plan.teamSeats <= 0) throw new UserError("Team access is available on the Business Seller plan");
    const count = await db.teamMember.count({ where: { ownerId: user.id } });
    if (count >= plan.teamSeats) throw new UserError(`Your plan includes ${plan.teamSeats} team seats`);
    const member = await db.user.findUnique({ where: { email: z.string().email().parse(email.trim().toLowerCase()) } });
    if (!member) throw new UserError("No VENTUREX account uses that email. Ask your colleague to register first.");
    if (member.id === user.id) throw new UserError("You can't add yourself");
    await db.teamMember.upsert({ where: { ownerId_memberId: { ownerId: user.id, memberId: member.id } }, create: { ownerId: user.id, memberId: member.id }, update: {} });
    await audit({ actorId: user.id, action: "team.member_added", entityType: "User", entityId: member.id });
    revalidatePath("/dashboard/team");
  });
}

export async function removeTeamMemberAction(id: string) {
  return run(async () => {
    const user = await actionUser();
    await db.teamMember.deleteMany({ where: { id, ownerId: user.id } });
    revalidatePath("/dashboard/team");
  });
}

// ───────────────────────────── Verification ─────────────────────────────

export async function submitVerificationAction(type: "IDENTITY" | "BUSINESS" | "FINANCIALS" | "TRAFFIC", fileIds: string[], notes: string, listingId?: string) {
  return run(async () => {
    const user = await actionUser({ verified: true });
    await enforceRateLimit(`verify-req:${user.id}`, 10, 86400);
    if (!fileIds.length) throw new UserError("Attach at least one document");
    const files = await db.storedFile.findMany({ where: { id: { in: fileIds }, ownerId: user.id, visibility: "PRIVATE" } });
    if (files.length !== fileIds.length) throw new UserError("Invalid documents");
    if (listingId) {
      const l = await db.listing.findUnique({ where: { id: listingId } });
      if (!l || l.sellerId !== user.id) throw new UserError("Listing not found");
    }
    if ((type === "FINANCIALS" || type === "TRAFFIC") && !listingId) throw new UserError("Choose the listing to verify");
    const pending = await db.verificationRequest.findFirst({ where: { userId: user.id, type, listingId: listingId ?? null, status: "PENDING" } });
    if (pending) throw new UserError("You already have a pending request of this type");
    const req = await db.verificationRequest.create({ data: { userId: user.id, type, listingId: listingId ?? null, notes: notes.slice(0, 2000) || null, documents: { create: fileIds.map((fileId) => ({ fileId })) } } });
    await audit({ actorId: user.id, action: "verification.submitted", entityType: "VerificationRequest", entityId: req.id, data: { type } });
    revalidatePath("/dashboard/verification");
  });
}
