import "server-only";
import { db } from "../db";
import { emailLayout, sendEmail } from "../email";
import { env } from "../env";
import { audit } from "../audit";
import { consumeToken, issueToken } from "./tokens";

export async function sendVerificationEmail(userId: string, email: string) {
  const token = await issueToken(userId, "EMAIL_VERIFY");
  const url = `${env.appUrl}/verify-email?token=${token}`;
  await sendEmail(
    email,
    "Verify your VENTUREX email",
    emailLayout({ title: "Confirm your email address", body: "Welcome to VENTUREX! Confirm your email to start buying, bidding and selling.", cta: { label: "Verify email", url } }),
    `Verify your email: ${url}`,
  );
}

export async function verifyEmailToken(token: string) {
  const userId = await consumeToken(token, "EMAIL_VERIFY");
  if (!userId) return false;
  await db.user.update({ where: { id: userId }, data: { emailVerifiedAt: new Date() } });
  await audit({ actorId: userId, action: "user.email_verified", entityType: "User", entityId: userId });
  return true;
}
