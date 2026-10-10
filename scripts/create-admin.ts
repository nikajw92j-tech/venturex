// Creates (or updates) a verified administrator account:
//   ADMIN_PASSWORD=... npx tsx scripts/create-admin.ts someone@example.com
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const email = process.argv[2]?.toLowerCase();
const password = process.env.ADMIN_PASSWORD;
if (!email || !password) {
  console.error("Usage: ADMIN_PASSWORD=<password> npx tsx scripts/create-admin.ts <email>");
  process.exit(1);
}

const db = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash(password!, 12);
  let username = email!.split("@")[0].replace(/[^a-z0-9_]/g, "");
  if (await db.user.findFirst({ where: { username, NOT: { email } } })) username += Date.now().toString().slice(-4);
  const u = await db.user.upsert({
    where: { email },
    update: { role: "ADMIN", passwordHash, emailVerifiedAt: new Date() },
    create: { email: email!, username, displayName: username, passwordHash, role: "ADMIN", emailVerifiedAt: new Date() },
  });
  console.log(`✓ ${u.email} (${u.username}) is an administrator`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
