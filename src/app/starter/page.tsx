import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Code2, Flame, Megaphone, Rocket, Sparkles, Users } from "lucide-react";
import { getI18n, getDisplayCurrency } from "@/i18n/server";
import { getRates } from "@/lib/rates";
import { listingCards, parseFilters, searchListings } from "@/lib/listings";
import { activePromotionWhere } from "@/lib/promotions";
import { getCurrentUser } from "@/lib/auth/session";
import { STARTER_BRACKETS } from "@/lib/categories";
import { FilterPanel, Pagination, SearchBar, SortSelect } from "@/components/market/filters";
import { ListingGrid } from "@/components/listing-card";
import { EmptyState, LinkButton } from "@/components/ui";
import { Reveal } from "@/components/motion";
import { Avatar } from "@/components/layout/navbar";
import { db } from "@/lib/db";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Starter Market — Buy & sell new digital projects",
  description: "Websites, AI tools, SaaS MVPs, apps, templates and source code from developers and founders. Zero revenue welcome.",
  alternates: { canonical: "/starter" },
};

type SP = Promise<Record<string, string | string[] | undefined>>;

export default async function StarterPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const { t } = await getI18n();
  const [display, { rates }, user] = await Promise.all([getDisplayCurrency(), getRates(), getCurrentUser()]);
  const filters = { ...parseFilters(sp), market: "STARTER" as const };
  const now = new Date();
  const browsing = Object.keys(sp).some((k) => k !== "page");

  const [result, featured, arrivals, trending, devs] = await Promise.all([
    searchListings(filters, display, rates),
    listingCards({ market: "STARTER", OR: [{ featured: true }, { promotions: { some: activePromotionWhere(now) } }] }, [{ featuredRank: "desc" }, { publishedAt: "desc" }], 4),
    listingCards({ market: "STARTER", publishedAt: { gte: new Date(now.getTime() - 14 * 86400_000) } }, [{ publishedAt: "desc" }], 4),
    // Trending: most watched / viewed among recent starter projects
    listingCards({ market: "STARTER" }, [{ watchers: { _count: "desc" } }, { viewCount: "desc" }], 4),
    db.user.findMany({
      where: { status: "ACTIVE", listings: { some: { market: "STARTER", status: { in: ["ACTIVE", "SOLD"] } } } },
      select: { username: true, displayName: true, avatarUrl: true, skills: true, githubUrl: true, _count: { select: { listings: { where: { market: "STARTER", status: { in: ["ACTIVE", "SOLD"] } } } } } },
      take: 6,
      orderBy: { listings: { _count: "desc" } },
    }),
  ]);

  const bracketLink = (key: string | null) => {
    const p = new URLSearchParams(Object.entries(sp).filter(([k, v]) => typeof v === "string" && k !== "bracket" && k !== "page") as [string, string][]);
    if (key) p.set("bracket", key);
    return `/starter?${p}`;
  };

  return (
    <div>
      {/* Tech-focused hero */}
      <section className="relative overflow-hidden border-b border-white/5">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-40 left-1/4 h-[480px] w-[480px] rounded-full bg-cyan/20 blur-[120px]" />
          <div className="absolute -bottom-40 right-1/4 h-[420px] w-[420px] rounded-full bg-violet/25 blur-[120px]" />
          <div className="grid-bg absolute inset-0" />
          <div className="absolute inset-0 font-mono text-[11px] leading-5 text-cyan/[0.07] [mask-image:linear-gradient(to_bottom,black,transparent)]" aria-hidden>
            {Array.from({ length: 18 }).map((_, i) => (
              <div key={i} className="whitespace-nowrap">{"const project = await venturex.list({ market: 'starter', revenue: 0, sourceCode: true, demo: verified }); ".repeat(6)}</div>
            ))}
          </div>
        </div>
        <div className="container-x relative py-16 sm:py-20">
          <Reveal>
            <div className="glass inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs text-cyan"><Rocket className="h-3.5 w-3.5" /> {t("nav.starter")}</div>
            <h1 className="mt-5 max-w-3xl font-display text-4xl font-semibold tracking-tight text-white sm:text-5xl">
              {t("starter.title").split(" ")[0]} <span className="text-gradient">{t("starter.title").split(" ").slice(1).join(" ")}</span>
            </h1>
            <p className="mt-4 max-w-2xl text-lg text-slate-400">{t("starter.subtitle")}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <LinkButton href="/sell?market=STARTER" size="lg"><Code2 className="h-4 w-4" /> {t("starter.sell")}</LinkButton>
              <LinkButton href="#projects" variant="secondary" size="lg">{t("starter.allProjects")}</LinkButton>
            </div>
          </Reveal>
          {/* GEL price brackets */}
          <div className="mt-10 flex flex-wrap gap-2">
            <Link href={bracketLink(null)} className={cn("rounded-xl px-4 py-2 text-sm font-semibold transition", !sp.bracket ? "bg-brand text-white" : "glass text-slate-300 hover:text-white")}>{t("market.all")}</Link>
            {STARTER_BRACKETS.map((b) => (
              <Link key={b.key} href={bracketLink(b.key)} className={cn("rounded-xl px-4 py-2 text-sm font-semibold transition", sp.bracket === b.key ? "bg-brand text-white" : "glass text-slate-300 hover:text-white", b.key === "premium" && sp.bracket !== b.key && "text-amber-200")}>
                {t(b.labelKey)}
              </Link>
            ))}
          </div>
        </div>
      </section>

      <div className="container-x">
        {!browsing && (
          <>
            {featured.length > 0 && (
              <section className="pt-12">
                <div className="mb-4 flex items-center gap-2 font-display text-xl font-semibold text-white"><Sparkles className="h-5 w-5 text-violet-400" /> {t("starter.featured")}
                  <span className="ml-1 flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-violet-400"><Megaphone className="h-3 w-3" /> {t("common.promoted")}</span>
                </div>
                <ListingGrid items={featured} />
              </section>
            )}
            <div className="grid gap-12 pt-12 xl:grid-cols-2">
              <section>
                <div className="mb-4 flex items-center gap-2 font-display text-xl font-semibold text-white"><Rocket className="h-5 w-5 text-cyan" /> {t("starter.newArrivals")}</div>
                {arrivals.length ? <ListingGrid items={arrivals} className="lg:grid-cols-2 xl:grid-cols-2" /> : <p className="glass rounded-2xl p-8 text-center text-sm text-slate-400">{t("home.empty")}</p>}
              </section>
              <section>
                <div className="mb-4 flex items-center gap-2 font-display text-xl font-semibold text-white"><Flame className="h-5 w-5 text-orange-400" /> {t("starter.trending")}</div>
                {trending.length ? <ListingGrid items={trending} className="lg:grid-cols-2 xl:grid-cols-2" /> : <p className="glass rounded-2xl p-8 text-center text-sm text-slate-400">{t("home.empty")}</p>}
              </section>
            </div>
          </>
        )}

        <section id="projects" className="scroll-mt-20 pt-14">
          <div className="grid gap-8 lg:grid-cols-[280px_1fr]">
            <Suspense>
              <FilterPanel market="STARTER" loggedIn={Boolean(user)} />
            </Suspense>
            <div className="min-w-0">
              <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
                <Suspense>
                  <SearchBar />
                  <SortSelect />
                </Suspense>
              </div>
              <div className="mb-4 text-sm text-slate-400">{t("market.results", { count: result.total })}</div>
              {result.pinned.length > 0 && <ListingGrid items={result.pinned} className="mb-6 xl:grid-cols-3" />}
              {result.items.length ? (
                <ListingGrid items={result.items} className="xl:grid-cols-3" />
              ) : result.pinned.length === 0 ? (
                <EmptyState title={t("common.noResults")} action={<LinkButton href="/sell?market=STARTER">{t("starter.sell")}</LinkButton>} />
              ) : null}
              <Suspense>
                <Pagination page={result.page} pages={result.pages} />
              </Suspense>
            </div>
          </div>
        </section>

        {devs.length > 0 && (
          <section className="pt-16">
            <div className="mb-4 flex items-center gap-2 font-display text-xl font-semibold text-white"><Users className="h-5 w-5 text-electric-400" /> {t("starter.developers")}</div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {devs.map((d) => (
                <Link key={d.username} href={`/u/${d.username}`} className="glass flex items-center gap-3 rounded-2xl p-4 transition hover:-translate-y-0.5 hover:border-electric/40">
                  <Avatar name={d.displayName} src={d.avatarUrl} size={44} />
                  <div className="min-w-0">
                    <div className="truncate font-semibold text-white">{d.displayName}</div>
                    <div className="truncate text-xs text-slate-400">{d.skills.slice(0, 4).join(" · ") || `@${d.username}`}</div>
                    <div className="text-xs text-slate-500">{d._count.listings} projects</div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
