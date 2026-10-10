import type { MetadataRoute } from "next";
import { env } from "@/lib/env";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/admin", "/dashboard", "/messages", "/api/", "/sandbox", "/sell", "/watchlist", "/notifications"] }],
    sitemap: `${env.appUrl}/sitemap.xml`,
  };
}
