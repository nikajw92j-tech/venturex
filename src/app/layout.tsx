import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Inter, Sora, Noto_Sans_Georgian } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { VerifyBanner } from "@/components/layout/verify-banner";
import { getI18n, getDisplayCurrency } from "@/i18n/server";
import { getRates } from "@/lib/rates";
import { getCurrentUser } from "@/lib/auth/session";
import { getSettings } from "@/lib/settings";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { Maintenance } from "@/components/layout/maintenance";

const inter = Inter({ subsets: ["latin", "cyrillic"], variable: "--font-inter", display: "swap" });
const sora = Sora({ subsets: ["latin"], variable: "--font-sora", display: "swap" });
const georgian = Noto_Sans_Georgian({ subsets: ["georgian"], variable: "--font-georgian", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(env.appUrl),
  title: { default: "VENTUREX — Buy, Sell & Auction Digital Businesses", template: "%s · VENTUREX" },
  description:
    "VENTUREX is the premium marketplace to buy, sell and auction websites, SaaS, e-commerce stores, apps, domains and startups — with verified listings, live auctions and protected payments.",
  openGraph: { type: "website", siteName: "VENTUREX" },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = { themeColor: "#03050b", width: "device-width", initialScale: 1 };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [{ locale, dict }, currency, rateInfo, user, settings] = await Promise.all([
    getI18n(),
    getDisplayCurrency(),
    getRates(),
    getCurrentUser(),
    getSettings(),
  ]);
  const pathname = (await headers()).get("x-pathname") ?? "/";
  const unread = user ? await db.notification.count({ where: { userId: user.id, readAt: null } }) : 0;

  return (
    <html lang={locale} className={`${inter.variable} ${sora.variable} ${georgian.variable}`}>
      <body className="min-h-screen antialiased">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[200] focus:rounded-lg focus:bg-white focus:px-3 focus:py-2 focus:text-black">
          Skip to content
        </a>
        <Providers locale={locale} dict={dict} currency={currency} rates={rateInfo.rates} ratesApproximate={rateInfo.approximate}>
          {settings.announcement && (
            <div className="bg-brand px-4 py-2 text-center text-xs font-medium text-white">{settings.announcement}</div>
          )}
          <Navbar
            user={user ? { id: user.id, displayName: user.displayName, username: user.username, avatarUrl: user.avatarUrl, role: user.role } : null}
            unread={unread}
          />
          {user && !user.emailVerifiedAt && <VerifyBanner />}
          <main id="main" className="relative">
            {settings.maintenanceMode && user?.role !== "ADMIN" && !pathname.startsWith("/login") ? <Maintenance /> : children}
          </main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
