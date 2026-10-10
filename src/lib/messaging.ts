import "server-only";
import type { MessageKind } from "@prisma/client";
import { db, type Tx } from "./db";
import { publish } from "./realtime";
import { notify } from "./notify";
import { UserError } from "./errors";

/** Finds or creates the 1:1 conversation between two users about a listing. */
export async function getOrCreateConversation(a: string, b: string, listingId: string | null, tx: Tx = db) {
  if (a === b) throw new UserError("You can't message yourself");
  const existing = await tx.conversation.findFirst({
    where: { listingId, AND: [{ participants: { some: { userId: a } } }, { participants: { some: { userId: b } } }] },
  });
  if (existing) return existing;
  return tx.conversation.create({ data: { listingId, participants: { create: [{ userId: a }, { userId: b }] } } });
}

// Light spam / safety heuristics: off-platform payment requests and link floods.
const RISKY = [/western\s*union/i, /moneygram/i, /\bwire\s+me\b/i, /pay\s+(me\s+)?(directly|outside)/i, /gift\s*card/i, /\bcrypto\s+only\b/i, /whats\s*app\s*me/i];

export function looksRisky(body: string) {
  const links = (body.match(/https?:\/\//g) ?? []).length;
  return links > 3 || RISKY.some((r) => r.test(body));
}

export async function postMessage(
  tx: Tx,
  opts: { conversationId: string; senderId: string; body: string; kind?: MessageKind; attachmentId?: string | null; offerId?: string | null },
) {
  const participants = await tx.conversationParticipant.findMany({ where: { conversationId: opts.conversationId }, include: { user: { select: { displayName: true } } } });
  const me = participants.find((p) => p.userId === opts.senderId);
  if (!me) throw new UserError("Conversation not found");
  if (participants.some((p) => p.blocked)) throw new UserError("This conversation has been closed");
  const msg = await tx.message.create({
    data: {
      conversationId: opts.conversationId,
      senderId: opts.senderId,
      body: opts.body,
      kind: opts.kind ?? "TEXT",
      attachmentId: opts.attachmentId ?? null,
      offerId: opts.offerId ?? null,
      flagged: looksRisky(opts.body),
    },
  });
  await tx.conversation.update({ where: { id: opts.conversationId }, data: { lastMessageAt: msg.createdAt } });
  await tx.conversationParticipant.update({ where: { id: me.id }, data: { lastReadAt: msg.createdAt } });
  await publish(`conversation:${opts.conversationId}`, { type: "message", id: msg.id }, tx);
  for (const p of participants) {
    if (p.userId === opts.senderId) continue;
    await notify(p.userId, "NEW_MESSAGE", { sender: me.user.displayName, preview: opts.body.slice(0, 140) }, `/messages/${opts.conversationId}`, tx);
  }
  return msg;
}
