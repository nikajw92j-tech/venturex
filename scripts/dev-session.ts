// DEV ONLY: prints a session cookie for a user so pages can be smoke-tested with curl.
//   npx tsx scripts/dev-session.ts admin@venturex.local
import { PrismaClient } from "@prisma/client";
import { createHash, randomBytes } from "node:crypto";

if (process.env.NODE_ENV === "production") throw new Error("dev only");
const db = new PrismaClient();
(async () => {
  const user = await db.user.findUniqueOrThrow({ where: { email: process.argv[2] } });
  const token = randomBytes(32).toString("base64url");
  await db.session.create({ data: { id: createHash("sha256").update(token).digest("hex"), userId: user.id, expiresAt: new Date(Date.now() + 3600_000) } });
  console.log(token);
  await db.$disconnect();
})();
