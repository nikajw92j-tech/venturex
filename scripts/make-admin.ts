// Grants the ADMIN role to an existing account:  npm run make-admin -- someone@example.com
import { PrismaClient } from "@prisma/client";

const email = process.argv[2]?.toLowerCase();
if (!email) {
  console.error("Usage: npm run make-admin -- <email>");
  process.exit(1);
}
const db = new PrismaClient();
db.user
  .update({ where: { email }, data: { role: "ADMIN" } })
  .then((u) => console.log(`✓ ${u.email} is now an administrator`))
  .catch(() => {
    console.error(`✗ No user with email ${email}`);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
