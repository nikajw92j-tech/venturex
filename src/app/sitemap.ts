import type { MetadataRoute } from "next";
import { db } from "@/lib/db";
import { env } from "@/lib/env";

// Rendered on request so builds never need database access.
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = env.appUrl;
  const statics = ["", "/marketplace", "/auctions", "/starter", "/valuation", "/pricing", "/how-it-works", "/about", "/contact", "/help", "/faq", "/terms", "/privacy", "/refund-policy"].map((p) => ({
    url: `${base}${p}`,
    changeFrequency: (p === "" || p === "/marketplace" || p === "/auctions" ? "hourly" : "monthly") as "hourly" | "monthly",
    priority: p === "" ? 1 : p.match(/marketplace|auctions|starter/) ? 0.9 : 0.5,
  }));
  const listings = await db.listing.findMany({ where: { status: "ACTIVE" }, select: { slug: true, updatedAt: true }, take: 45000, orderBy: { publishedAt: "desc" } });
  const sellers = await db.user.findMany({ where: { status: "ACTIVE", listings: { some: { status: "ACTIVE" } } }, select: { username: true, updatedAt: true }, take: 5000 });
  return [
    ...statics,
    ...listings.map((l) => ({ url: `${base}/listing/${l.slug}`, lastModified: l.updatedAt, changeFrequency: "daily" as const, priority: 0.8 })),
    ...sellers.map((u) => ({ url: `${base}/u/${u.username}`, lastModified: u.updatedAt, changeFrequency: "weekly" as const, priority: 0.4 })),
  ];
}
