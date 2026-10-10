import type { Metadata } from "next";
import { Suspense } from "react";
import { Crown, Gavel, Megaphone } from "lucide-react";
import { getI18n, getDisplayCurrency } from "@/i18n/server";
import { getRates } from "@/lib/rates";
import { listingCards, parseFilters, searchListings } from "@/lib/listings";
import { activePromotionWhere } from "@/lib/promotions";
import { getCurrentUser } from "@/lib/auth/session";
import { FilterPanel, Pagination, SearchBar, SortSelect } from "@/components/market/filters";
import { ListingGrid } from "@/components/listing-card";
import { EmptyState, LinkButton } from "@/components/ui";
import { db } from "@/lib/db";

export const metadata: Metadata = {
  title: "Live Auctions",
  description: "Bid on digital businesses in real time. Automatic bidding, reserve prices and anti-sniping protection.",
  alternates: { canonical: "/auctions" },
};

type SP = Promise<Record<string, string | string[] | undefined>>;

export default async function AuctionsPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const { t } = await getI18n();
  const [display, { rates }, user] = await Promise.all([getDisplayCurrency(), getRates(), getCurrentUser()]);
  const filters = { ...parseFilters(sp), saleType: "AUCTION" as const, sort: parseFilters(sp).sort ?? ("ending" as const) };
  const now = new Date();
  const [result, featured, liveCount, bidsToday] = await Promise.all([
    searchListings(filters, display, rates),
    listingCards({ saleType: "AUCTION", auction: { status: "LIVE", endsAt: { gt: now } }, promotions: { some: { ...activePromotionWhere(now), featuredAuctions: true } } }, [{ auction: { endsAt: "asc" } }], 4),
    db.auction.count({ where: { status: "LIVE", endsAt: { gt: now }, listing: { status: "ACTIVE" } } }),
    db.bid.count({ where: { createdAt: { gte: new Date(now.getTime() - 86400_000) } } }),
  ]);

  return (
    <div className="container-x py-10">
      <div className="relative mb-10 overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-red-500/10 via-violet/10 to-electric/10 p-8 sm:p-10">
        <div className="grid-bg absolute inset-0 opacity-50" />
        <div className="relative flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-red-300">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
              </span>
              LIVE
            </div>
            <h1 className="mt-2 font-display text-3xl font-semibold text-white sm:text-4xl">{t("auctions.title")}</h1>
            <p className="mt-2 max-w-2xl text-slate-400">{t("auctions.subtitle")}</p>
          </div>
          <div className="flex gap-3">
            <div className="glass rounded-2xl px-5 py-3 text-center">
              <div className="font-display text-2xl font-semibold text-white">{liveCount}</div>
              <div className="text-[11px] uppercase tracking-wider text-slate-500">{t("home.stats.auctions")}</div>
            </div>
            <div className="glass rounded-2xl px-5 py-3 text-center">
              <div className="flex items-center justify-center gap-1 font-display text-2xl font-semibold text-white"><Gavel className="h-5 w-5 text-violet-400" />{bidsToday}</div>
              <div className="text-[11px] uppercase tracking-wider text-slate-500">bids · 24h</div>
            </div>
          </div>
        </div>
      </div>

      {featured.length > 0 && (
        <section className="mb-12">
          <div className="mb-4 flex items-center gap-2 font-display text-xl font-semibold text-white">
            <Crown className="h-5 w-5 text-amber-300" /> {t("auctions.featured")}
            <span className="ml-2 flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-violet-400"><Megaphone className="h-3 w-3" /> {t("common.ad")}</span>
          </div>
          <ListingGrid items={featured} />
        </section>
      )}

      <div className="grid gap-8 lg:grid-cols-[280px_1fr]">
        <Suspense>
          <FilterPanel loggedIn={Boolean(user)} lockedType="AUCTION" showSaleType={false} />
        </Suspense>
        <div className="min-w-0">
          <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Suspense>
              <SearchBar />
              <SortSelect />
            </Suspense>
          </div>
          {result.pinned.length > 0 && (
            <div className="mb-8">
              <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-violet-400"><Megaphone className="h-3.5 w-3.5" /> {t("common.promoted")} · {t("common.ad")}</div>
              <ListingGrid items={result.pinned} className="xl:grid-cols-3" />
            </div>
          )}
          {result.items.length ? (
            <ListingGrid items={result.items} className="xl:grid-cols-3" />
          ) : result.pinned.length === 0 ? (
            <EmptyState title={t("common.noResults")} action={<LinkButton href="/marketplace">{t("nav.marketplace")}</LinkButton>} />
          ) : null}
          <Suspense>
            <Pagination page={result.page} pages={result.pages} />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
