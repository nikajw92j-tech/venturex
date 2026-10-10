"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { actionUser } from "@/lib/auth/session";
import { run, UserError } from "@/lib/action";
import { enforceRateLimit } from "@/lib/ratelimit";
import { getOrCreateConversation, postMessage } from "@/lib/messaging";
import { kickEmails } from "@/lib/notify";
import { audit } from "@/lib/audit";

export async function contactSellerAction(listingId: string) {
  return run(async () => {
    const user = await actionUser({ verified: true });
    const listing = await db.listing.findUnique({ where: { id: listingId }, select: { sellerId: true } });
    if (!listing) throw new UserError("Listing not found");
    const c = await getOrCreateConversation(user.id, listing.sellerId, listingId);
    return { conversationId: c.id };
  });
}

export async function contactUserAction(username: string) {
  return run(async () => {
    const user = await actionUser({ verified: true });
    const other = await db.user.findUnique({ where: { username }, select: { id: true } });
    if (!other) throw new UserError("User not found");
    const c = await getOrCreateConversation(user.id, other.id, null);
    return { conversationId: c.id };
  });
}

export async function sendMessageAction(conversationId: string, body: string, attachmentId: string | null) {
  return run(async () => {
    const user = await actionUser({ verified: true });
    // Spam protection: per-user and per-conversation throttles.
    await enforceRateLimit(`msg:${user.id}`, 40, 60);
    await enforceRateLimit(`msg-day:${user.id}`, 600, 86400);
    const text = z.string().trim().max(5000).parse(body ?? "");
    if (!text && !attachmentId) throw new UserError("Message is empty");
    if (attachmentId) {
      const f = await db.storedFile.findUnique({ where: { id: attachmentId } });
      if (!f || f.ownerId !== user.id) throw new UserError("Invalid attachment");
    }
    const msg = await db.$transaction((tx) => postMessage(tx, { conversationId, senderId: user.id, body: text || "📎 Attachment", attachmentId }));
    kickEmails();
    return { id: msg.id, flagged: msg.flagged };
  });
}

export async function loadMessagesAction(conversationId: string, before?: string) {
  const user = await actionUser();
  const p = await db.conversationParticipant.findFirst({ where: { conversationId, userId: user.id } });
  if (!p) return [];
  const rows = await db.message.findMany({
    where: { conversationId, ...(before ? { createdAt: { lt: new Date(before) } } : {}) },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { attachment: { select: { id: true, filename: true, mimeType: true, size: true } }, offer: { select: { id: true, amount: true, currency: true, status: true, fromSeller: true, buyerId: true, sellerId: true } } },
  });
  await db.conversationParticipant.update({ where: { id: p.id }, data: { lastReadAt: new Date() } });
  return rows.reverse().map((m) => ({
    id: m.id,
    senderId: m.senderId,
    kind: m.kind,
    body: m.body,
    flagged: m.flagged,
    createdAt: m.createdAt.toISOString(),
    attachment: m.attachment,
    offer: m.offer,
  }));
}

export async function reportConversationAction(conversationId: string, reason: string) {
  return run(async () => {
    const user = await actionUser();
    const p = await db.conversationParticipant.findFirst({ where: { conversationId, userId: user.id } });
    if (!p) throw new UserError("Conversation not found");
    await db.report.create({ data: { reporterId: user.id, targetType: "CONVERSATION", targetId: conversationId, reason: z.string().min(3).max(120).parse(reason) } });
    await audit({ actorId: user.id, action: "conversation.reported", entityType: "Conversation", entityId: conversationId, data: { reason } });
  });
}

export async function blockConversationAction(conversationId: string) {
  return run(async () => {
    const user = await actionUser();
    const p = await db.conversationParticipant.findFirst({ where: { conversationId, userId: user.id } });
    if (!p) throw new UserError("Conversation not found");
    await db.conversationParticipant.update({ where: { id: p.id }, data: { blocked: true } });
    revalidatePath(`/messages/${conversationId}`);
  });
}
