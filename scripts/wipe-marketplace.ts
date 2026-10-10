// Deletes ALL marketplace content — listings, auctions, bids, offers, deals, payments,
// messages, notifications, reports — and every non-admin account. Admin accounts and the
// platform configuration (plans, promotion packages, commission tiers, settings) are kept.
//
//   npm run db:wipe -- --yes
import { PrismaClient } from "@prisma/client";

if (!process.argv.includes("--yes")) {
  console.error("This permanently deletes all listings, auctions, deals and non-admin users.\nRe-run with:  npm run db:wipe -- --yes");
  process.exit(1);
}

const db = new PrismaClient();
(async () => {
  const removed: Record<string, number> = {};
  const del = async (name: string, fn: () => Promise<{ count: number }>) => (removed[name] = (await fn()).count);

  await db.$transaction(async (tx) => {
    await del("testimonials", () => tx.testimonial.deleteMany());
    await del("reviews", () => tx.sellerReview.deleteMany());
    await del("disputes", () => tx.dispute.deleteMany());
    await del("commissions", () => tx.commission.deleteMany());
    await del("payments", () => tx.payment.deleteMany());
    await del("deals", () => tx.deal.deleteMany());
    await del("conversations", () => tx.conversation.deleteMany());
    await del("offers", () => tx.offer.deleteMany());
    await del("bids", () => tx.bid.deleteMany());
    await del("auctions", () => tx.auction.deleteMany());
    await del("promotions", () => tx.promotion.deleteMany());
    await del("verifications", () => tx.verificationRequest.deleteMany());
    await del("listings", () => tx.listing.deleteMany());
    await del("files", () => tx.storedFile.deleteMany());
    await del("notifications", () => tx.notification.deleteMany());
    await del("reports", () => tx.report.deleteMany());
    await del("valuations", () => tx.valuation.deleteMany());
    await del("contactMessages", () => tx.contactMessage.deleteMany());
    await del("auditLog", () => tx.auditLog.deleteMany());
    await del("users", () => tx.user.deleteMany({ where: { role: { not: "ADMIN" } } }));
  }, { timeout: 60_000 });

  const admins = await db.user.findMany({ where: { role: "ADMIN" }, select: { email: true } });
  console.log("✓ Marketplace wiped:", removed);
  console.log(`  Kept admin accounts: ${admins.map((a) => a.email).join(", ") || "none — create one with npm run make-admin"}`);
  await db.$disconnect();
})().catch(async (e) => {
  console.error(e);
  await db.$disconnect();
  process.exit(1);
});
