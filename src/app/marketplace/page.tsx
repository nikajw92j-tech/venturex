import type { Metadata } from "next";
import { Suspense } from "react";
import { Megaphone, Sparkles } from "lucide-react";
import { getI18n, getDisplayCurrency } from "@/i18n/server";
import { getRates } from "@/lib/rates";
import { parseFilters, searchListings } from "@/lib/listings";
import { recommendFor } from "@/lib/recommendations";
import { getCurrentUser } from "@/lib/auth/session";
import { FilterPanel, Pagination, SearchBar, SortSelect } from "@/components/market/filters";
import { ListingGrid } from "@/components/listing-card";
import { EmptyState, LinkButton } from "@/components/ui";
import { categoryLabel } from "@/lib/categories";

type SP = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({ searchParams }: { searchParams: SP }): Promise<Metadata> {
  const sp = await searchParams;
  const cat = typeof sp.category === "string" ? categoryLabel(sp.category) : null;
  return {
    title: cat ? `${cat} for sale` : "Marketplace — Digital businesses for sale",
    description: "Browse websites, SaaS, e-commerce stores, apps and startups for sale. Filter by revenue, profit, price and more.",
    alternates: { canonical: "/marketplace" },
  };
}

export default async function MarketplacePage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const { t } = await getI18n();
  const [display, { rates }, user] = await Promise.all([getDisplayCurrency(), getRates(), getCurrentUser()]);
  const filters = { ...parseFilters(sp), market: "MAIN" as const };
  const result = await searchListings(filters, display, rates);
  const recs = user && result.page === 1 && !filters.q ? await recommendFor(user.id, 4) : [];
  const pre = filters.preRevenue;

  return (
    <div className="container-x py-10">
      <div className="mb-8">
        <h1 className="font-display text-3xl font-semibold text-white sm:text-4xl">{t("market.title")}</h1>
        <p className="mt-2 text-slate-400">{t("market.subtitle")}</p>
      </div>

      {/* Established vs pre-revenue are kept clearly separate */}
      <div className="mb-6 flex flex-wrap gap-2">
        {[
          { v: undefined, label: t("market.all") },
          { v: "established", label: t("market.established") },
          { v: "pre", label: t("market.preRevenue") },
        ].map((o) => {
          const p = new URLSearchParams(Object.entries(sp).filter(([k, v]) => typeof v === "string" && k !== "stage" && k !== "page") as [string, string][]);
          if (o.v) p.set("stage", o.v);
          const active = (o.v === "pre" && pre === "only") || (o.v === "established" && pre === "exclude") || (!o.v && !pre);
          return (
            <LinkButton key={o.label} href={`/marketplace?${p}`} variant={active ? "primary" : "secondary"} size="sm">
              {o.label}
            </LinkButton>
          );
        })}
      </div>

      <div className="grid gap-8 lg:grid-cols-[280px_1fr]">
        <Suspense>
          <FilterPanel loggedIn={Boolean(user)} />
        </Suspense>
        <div className="min-w-0">
          <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Suspense>
              <SearchBar />
              <SortSelect />
            </Suspense>
          </div>
          <div className="mb-4 text-sm text-slate-400">{t("market.results", { count: result.total })}</div>

          {result.pinned.length > 0 && (
            <div className="mb-8">
              <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-violet-400">
                <Megaphone className="h-3.5 w-3.5" /> {t("common.promoted")} · {t("common.ad")}
              </div>
              <ListingGrid items={result.pinned} className="xl:grid-cols-3" />
            </div>
          )}

          {result.items.length ? (
            <ListingGrid items={result.items} className="xl:grid-cols-3" />
          ) : result.pinned.length === 0 ? (
            <EmptyState title={t("common.noResults")} body={t("home.empty")} action={<LinkButton href="/marketplace" variant="secondary">{t("common.reset")}</LinkButton>} />
          ) : null}
          <Suspense>
            <Pagination page={result.page} pages={result.pages} />
          </Suspense>

          {recs.length > 0 && (
            <section className="mt-16">
              <div className="mb-1 flex items-center gap-2 font-display text-xl font-semibold text-white">
                <Sparkles className="h-5 w-5 text-violet-400" /> {t("market.recommended")}
              </div>
              <p className="mb-5 text-sm text-slate-400">{t("market.recommendedSub")}</p>
              <ListingGrid items={recs} className="xl:grid-cols-4" />
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
