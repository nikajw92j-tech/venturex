import { NextRequest, NextResponse } from "next/server";
import { generateCodeVerifier, generateState } from "arctic";
import { google } from "@/lib/auth/google";
import { googleEnabled, isProd } from "@/lib/env";

export async function GET(req: NextRequest) {
  if (!googleEnabled()) return NextResponse.redirect(new URL("/login", req.url));
  const state = generateState();
  const verifier = generateCodeVerifier();
  const url = google().createAuthorizationURL(state, verifier, ["openid", "profile", "email"]);
  const next = req.nextUrl.searchParams.get("next");
  const res = NextResponse.redirect(url);
  const opts = { httpOnly: true, secure: isProd, sameSite: "lax" as const, path: "/", maxAge: 600 };
  res.cookies.set("g_state", state, opts);
  res.cookies.set("g_verifier", verifier, opts);
  if (next?.startsWith("/") && !next.startsWith("//")) res.cookies.set("g_next", next, opts);
  return res;
}
