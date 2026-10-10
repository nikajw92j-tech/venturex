import { NextResponse, type NextRequest } from "next/server";

/**
 * CSRF protection for JSON/form API routes: state-changing requests must come
 * from our own origin. (Server Actions have Next.js' built-in origin check;
 * payment webhooks are exempt and verified by signature instead.)
 */
const EXEMPT = ["/api/webhooks/", "/api/cron/"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  // Expose the path to server components (used by maintenance mode).
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-pathname", pathname);
  const res = NextResponse.next({ request: { headers: requestHeaders } });

  if (pathname.startsWith("/api/") && !["GET", "HEAD", "OPTIONS"].includes(req.method) && !EXEMPT.some((p) => pathname.startsWith(p))) {
    const origin = req.headers.get("origin");
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    if (!origin || !host || new URL(origin).host !== host) {
      return NextResponse.json({ error: "Cross-site request blocked" }, { status: 403 });
    }
  }

  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
