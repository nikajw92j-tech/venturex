import { NextRequest, NextResponse } from "next/server";
import { decodeIdToken } from "arctic";
import { google } from "@/lib/auth/google";
import { db } from "@/lib/db";
import { createSession } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { randomSuffix } from "@/lib/utils";

type Claims = { sub: string; email?: string; email_verified?: boolean; name?: string; picture?: string };

export async function GET(req: NextRequest) {
  const fail = () => NextResponse.redirect(new URL("/login?error=google", req.url));
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const savedState = req.cookies.get("g_state")?.value;
  const verifier = req.cookies.get("g_verifier")?.value;
  if (!code || !state || !savedState || state !== savedState || !verifier) return fail();

  let claims: Claims;
  try {
    const tokens = await google().validateAuthorizationCode(code, verifier);
    claims = decodeIdToken(tokens.idToken()) as Claims;
  } catch (e) {
    console.error("[google] token exchange failed", e);
    return fail();
  }
  if (!claims.email || !claims.email_verified) return fail();
  const email = claims.email.toLowerCase();

  let user = await db.user.findUnique({ where: { googleId: claims.sub } });
  if (!user) {
    const byEmail = await db.user.findUnique({ where: { email } });
    if (byEmail) {
      // Google verified this address, so linking is safe.
      user = await db.user.update({ where: { id: byEmail.id }, data: { googleId: claims.sub, emailVerifiedAt: byEmail.emailVerifiedAt ?? new Date() } });
    } else {
      const base = email.split("@")[0].toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 16) || "user";
      const taken = await db.user.findUnique({ where: { username: base } });
      user = await db.user.create({
        data: {
          email,
          googleId: claims.sub,
          emailVerifiedAt: new Date(),
          username: taken ? `${base}_${randomSuffix(4)}` : base,
          displayName: claims.name?.slice(0, 60) || base,
          avatarUrl: claims.picture ?? null,
        },
      });
      await audit({ actorId: user.id, action: "user.registered_google", entityType: "User", entityId: user.id });
    }
  }
  if (user.status === "SUSPENDED") return NextResponse.redirect(new URL("/login?error=google", req.url));

  await createSession(user.id);
  const next = req.cookies.get("g_next")?.value ?? "/dashboard";
  const res = NextResponse.redirect(new URL(next, req.url));
  for (const c of ["g_state", "g_verifier", "g_next"]) res.cookies.delete(c);
  return res;
}
