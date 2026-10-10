import "server-only";
import type { NotificationType } from "@prisma/client";
import { db, type Tx } from "./db";
import { emailLayout, sendEmail } from "./email";
import { env } from "./env";
import { publish } from "./realtime";
import { renderTemplate } from "./notification-templates";

/** Types that also go out by email (via the outbox processed in flushEmails). */
const EMAIL_TYPES = new Set<NotificationType>([
  "OUTBID",
  "AUCTION_WON",
  "AUCTION_ENDED",
  "AUCTION_ENDING_SOON",
  "OFFER_RECEIVED",
  "OFFER_ACCEPTED",
  "OFFER_COUNTERED",
  "PAYMENT_SUCCEEDED",
  "TRANSFER_UPDATE",
  "NEW_MESSAGE",
  "LISTING_APPROVED",
  "LISTING_REJECTED",
  "DISPUTE_UPDATE",
  "VERIFICATION_UPDATE",
  "PROMOTION_UPDATE",
]);

/**
 * Creates an in-app notification (localized to the recipient) and pushes it in
 * real time. Safe to call inside a transaction — the realtime event is only
 * delivered on commit and the email is sent later by the outbox.
 */
export async function notify(
  userId: string,
  type: NotificationType,
  params: Record<string, string | number>,
  link?: string,
  tx: Tx = db,
) {
  const user = await tx.user.findUnique({ where: { id: userId }, select: { preferredLocale: true } });
  if (!user) return;
  const { title, body } = renderTemplate(type, user.preferredLocale, params);
  const n = await tx.notification.create({
    data: { userId, type, title, body, link, emailedAt: EMAIL_TYPES.has(type) ? null : new Date(0) },
  });
  await publish(`user:${userId}`, { type: "notification", id: n.id, title, body, link: link ?? null }, tx);
}

/** Email outbox: sends notification emails that haven't gone out yet. */
export async function flushEmails(limit = 50) {
  const pending = await db.notification.findMany({
    where: { emailedAt: null, createdAt: { gt: new Date(Date.now() - 2 * 86400_000) } },
    include: { user: { select: { email: true, emailVerifiedAt: true, status: true } } },
    take: limit,
    orderBy: { createdAt: "asc" },
  });
  for (const n of pending) {
    // Claim the row first so concurrent workers never double-send.
    const claimed = await db.notification.updateMany({ where: { id: n.id, emailedAt: null }, data: { emailedAt: new Date() } });
    if (!claimed.count) continue;
    if (!n.user.emailVerifiedAt || n.user.status !== "ACTIVE") continue;
    try {
      await sendEmail(
        n.user.email,
        n.title,
        emailLayout({ title: n.title, body: n.body, cta: n.link ? { label: "Open VENTUREX", url: `${env.appUrl}${n.link}` } : undefined }),
        `${n.body}${n.link ? `\n\n${env.appUrl}${n.link}` : ""}`,
      );
    } catch (e) {
      console.error("[email] failed", n.id, e);
    }
  }
}

/** Fire-and-forget outbox flush after a request completes. */
export function kickEmails() {
  flushEmails().catch((e) => console.error("[email] flush failed", e));
}
