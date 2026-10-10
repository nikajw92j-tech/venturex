import "server-only";
import { UserError } from "../errors";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { createHash, randomBytes } from "node:crypto";
import { db } from "../db";
import { isProd } from "../env";

export const SESSION_COOKIE = "vx_session";
const SESSION_DAYS = 30;
const RENEW_THRESHOLD_MS = 15 * 24 * 60 * 60 * 1000;

export function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function randomToken(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}

export async function createSession(userId: string) {
  const token = randomToken();
  const h = await headers();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400_000);
  await db.session.create({
    data: {
      id: sha256(token),
      userId,
      expiresAt,
      userAgent: h.get("user-agent")?.slice(0, 300) ?? null,
      ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    },
  });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.session.deleteMany({ where: { id: sha256(token) } });
  jar.delete(SESSION_COOKIE);
}

export async function destroyAllSessions(userId: string) {
  await db.session.deleteMany({ where: { userId } });
}

const userSelect = {
  id: true,
  email: true,
  emailVerifiedAt: true,
  username: true,
  displayName: true,
  avatarUrl: true,
  country: true,
  role: true,
  status: true,
  identityVerified: true,
  businessVerified: true,
  preferredLocale: true,
  preferredCurrency: true,
  payoutsEnabled: true,
  payoutAccountId: true,
  createdAt: true,
} as const;

export type SessionUser = NonNullable<Awaited<ReturnType<typeof loadUser>>>;

async function loadUser(token: string) {
  const session = await db.session.findUnique({
    where: { id: sha256(token) },
    include: { user: { select: userSelect } },
  });
  if (!session) return null;
  if (session.expiresAt < new Date()) {
    await db.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }
  if (session.expiresAt.getTime() - Date.now() < RENEW_THRESHOLD_MS) {
    await db.session
      .update({ where: { id: session.id }, data: { expiresAt: new Date(Date.now() + SESSION_DAYS * 86400_000) } })
      .catch(() => {});
  }
  return session.user;
}

/** Returns the signed-in, non-suspended user or null. Cached per request. */
export const getCurrentUser = cache(async () => {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const user = await loadUser(token);
  if (!user || user.status !== "ACTIVE") return null;
  return user;
});

export async function requireUser(nextPath?: string) {
  const user = await getCurrentUser();
  if (!user) redirect(`/login${nextPath ? `?next=${encodeURIComponent(nextPath)}` : ""}`);
  return user;
}

export async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") redirect("/");
  return user;
}

export class AuthError extends UserError {
  constructor(message = "Please sign in to continue.") {
    super(message);
  }
}

/** For server actions: throws instead of redirecting. */
export async function actionUser(opts: { verified?: boolean; admin?: boolean } = {}) {
  const user = await getCurrentUser();
  if (!user) throw new AuthError();
  if (opts.admin && user.role !== "ADMIN") throw new AuthError("Administrator access required.");
  if (opts.verified && !user.emailVerifiedAt) throw new AuthError("Please verify your email address first.");
  return user;
}
