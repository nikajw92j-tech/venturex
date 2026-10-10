"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { run, UserError, type ActionResult } from "@/lib/action";
import { createSession, destroyAllSessions, destroySession, getCurrentUser } from "@/lib/auth/session";
import { fakeVerify, hashPassword, verifyPassword } from "@/lib/auth/password";
import { consumeToken, issueToken } from "@/lib/auth/tokens";
import { sendVerificationEmail } from "@/lib/auth/verify";
import { emailLayout, sendEmail } from "@/lib/email";
import { env } from "@/lib/env";
import { clientIp, audit } from "@/lib/audit";
import { enforceRateLimit } from "@/lib/ratelimit";
import { getLocale } from "@/i18n/server";

const password = z
  .string()
  .min(10, "Password must be at least 10 characters")
  .max(128)
  .refine((p) => /[a-zA-Z]/.test(p) && /\d/.test(p), "Use letters and at least one number");

const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password,
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9_]{3,24}$/, "3–24 characters: letters, numbers and underscores"),
  displayName: z.string().trim().min(2, "Enter your name").max(60),
  country: z.string().trim().length(2).optional().or(z.literal("")),
});

function safeNext(next: unknown) {
  return typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
}

export async function registerAction(_: unknown, form: FormData): Promise<ActionResult> {
  const res = await run(async () => {
    await enforceRateLimit(`register:${await clientIp()}`, 8, 3600);
    const data = registerSchema.parse(Object.fromEntries(form));
    const exists = await db.user.findFirst({ where: { OR: [{ email: data.email }, { username: data.username }] }, select: { email: true } });
    if (exists) throw new UserError(exists.email === data.email ? "An account with this email already exists" : "This username is taken");
    const user = await db.user.create({
      data: {
        email: data.email,
        passwordHash: await hashPassword(data.password),
        username: data.username,
        displayName: data.displayName,
        country: data.country || null,
        preferredLocale: await getLocale(),
      },
    });
    await audit({ actorId: user.id, action: "user.registered", entityType: "User", entityId: user.id });
    await sendVerificationEmail(user.id, user.email);
    await createSession(user.id);
  });
  if (!res.ok) return res;
  redirect("/verify-email?sent=1");
}

export async function loginAction(_: unknown, form: FormData): Promise<ActionResult> {
  const next = safeNext(form.get("next"));
  const res = await run(async () => {
    const email = z.string().trim().toLowerCase().email("Enter a valid email").parse(form.get("email"));
    const pw = z.string().min(1, "Enter your password").parse(form.get("password"));
    await enforceRateLimit(`login:${await clientIp()}`, 20, 900);
    await enforceRateLimit(`login-email:${email}`, 8, 900);
    const user = await db.user.findUnique({ where: { email } });
    if (!user?.passwordHash) {
      await fakeVerify();
      throw new UserError("Invalid email or password");
    }
    if (!(await verifyPassword(pw, user.passwordHash))) throw new UserError("Invalid email or password");
    if (user.status === "SUSPENDED") throw new UserError("This account is suspended. Contact support for help.");
    await createSession(user.id);
    await db.user.update({ where: { id: user.id }, data: { lastActiveAt: new Date() } });
  });
  if (!res.ok) return res;
  redirect(next);
}

export async function logoutAction() {
  await destroySession();
  redirect("/");
}

export async function resendVerificationAction(): Promise<ActionResult> {
  return run(async () => {
    const user = await getCurrentUser();
    if (!user) throw new UserError("Please sign in first");
    if (user.emailVerifiedAt) throw new UserError("Your email is already verified");
    await enforceRateLimit(`verify-resend:${user.id}`, 3, 3600);
    await sendVerificationEmail(user.id, user.email);
  });
}

export async function requestPasswordResetAction(_: unknown, form: FormData): Promise<ActionResult> {
  return run(async () => {
    const email = z.string().trim().toLowerCase().email("Enter a valid email").parse(form.get("email"));
    await enforceRateLimit(`reset:${await clientIp()}`, 5, 3600);
    await enforceRateLimit(`reset-email:${email}`, 3, 3600);
    const user = await db.user.findUnique({ where: { email } });
    // Same response whether or not the account exists (no account enumeration).
    if (user && user.status === "ACTIVE") {
      const token = await issueToken(user.id, "PASSWORD_RESET");
      const url = `${env.appUrl}/reset-password?token=${token}`;
      await sendEmail(
        email,
        "Reset your VENTUREX password",
        emailLayout({ title: "Password reset", body: "Someone requested a password reset for your account. The link expires in 1 hour. If this wasn't you, ignore this email.", cta: { label: "Choose a new password", url } }),
        `Reset your password: ${url}`,
      );
    }
  });
}

export async function resetPasswordAction(_: unknown, form: FormData): Promise<ActionResult> {
  const res = await run(async () => {
    const token = z.string().min(10).parse(form.get("token"));
    const pw = password.parse(form.get("password"));
    const userId = await consumeToken(token, "PASSWORD_RESET");
    if (!userId) throw new UserError("This reset link is invalid or has expired");
    await db.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(pw), emailVerifiedAt: new Date() } });
    await destroyAllSessions(userId);
    await audit({ actorId: userId, action: "user.password_reset", entityType: "User", entityId: userId });
  });
  if (!res.ok) return res;
  redirect("/login?reset=1");
}
