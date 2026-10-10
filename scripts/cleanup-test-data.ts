// Removes data created by the integration tests (users with @test.local emails).
//   npx tsx scripts/cleanup-test-data.ts
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
(async () => {
  const ids = (await db.user.findMany({ where: { email: { endsWith: "@test.local" } }, select: { id: true } })).map((u) => u.id);
  await db.payment.deleteMany({ where: { userId: { in: ids } } });
  await db.dispute.deleteMany({ where: { deal: { sellerId: { in: ids } } } });
  await db.deal.deleteMany({ where: { sellerId: { in: ids } } });
  await db.listing.deleteMany({ where: { sellerId: { in: ids } } });
  await db.auditLog.deleteMany({ where: { actorId: { in: ids } } });
  const r = await db.user.deleteMany({ where: { id: { in: ids } } });
  console.log(`removed ${r.count} test users`);
  await db.$disconnect();
})();
