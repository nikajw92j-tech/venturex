import Link from "next/link";
import * as Icons from "lucide-react";
import { ArrowRight, Quote, Rocket } from "lucide-react";
import { db } from "@/lib/db";
import { getI18n } from "@/i18n/server";
import { listingCards } from "@/lib/listings";
import { activePromotionWhere } from "@/lib/promotions";
import { MAIN_CATEGORIES, categoryLabel } from "@/lib/categories";
import { Hero, type HeroCard } from "@/components/home/hero";
import { Faq } from "@/components/home/faq";
import { ListingGrid } from "@/components/listing-card";
import { CountUp, Reveal, Stagger, StaggerItem } from "@/components/motion";
import { EmptyState, LinkButton, SectionHeading } from "@/components/ui";
import { FAQ } from "@/content/faq";
import type { ListingCardData } from "@/lib/listings";

function Section({ title, sub, href, items, empty }: { title: string; sub: string; href: string; items: ListingCardData[]; empty: string }) {
  return (
    <section className="container-x py-14">
      <Reveal>
        <SectionHeading title={title} subtitle={sub} action={<LinkButton href={href} variant="ghost" size="sm">View all <ArrowRight className="h-4 w-4" /></LinkButton>} />
      </Reveal>
      {items.length ? <ListingGrid items={items} /> : <p className="glass rounded-2xl px-6 py-10 text-center text-sm text-slate-400">{empty}</p>}
    </section>
  );
}

export default async function HomePage() {
  const { t, locale } = await getI18n();
  const now = new Date();

  const [listed, activeAuctions, completed, buyers, volume, featured, live, startups, under1k, highRevenue, endingSoon, catCounts, stories] = await Promise.all([
    db.listing.count({ where: { status: "ACTIVE" } }),
    db.auction.count({ where: { status: "LIVE", endsAt: { gt: now }, listing: { status: "ACTIVE" } } }),
    db.deal.count({ where: { status: "COMPLETED" } }),
    db.user.count({ where: { status: "ACTIVE" } }),
    db.deal.aggregate({ where: { status: "COMPLETED" }, _sum: { amountUsd: true } }),
    // Featured = admin-curated + homepage promotions (labelled as ads on the card)
    listingCards({ OR: [{ featured: true }, { promotions: { some: { ...activePromotionWhere(now), homepage: true } } }] }, [{ featuredRank: "desc" }, { publishedAt: "desc" }], 8),
    listingCards({ saleType: "AUCTION", auction: { status: "LIVE", endsAt: { gt: now } } }, [{ auction: { bidCount: "desc" } }], 4),
    listingCards({ isPreRevenue: true }, [{ publishedAt: "desc" }], 4),
    listingCards({ priceUsd: { lt: 100000 } }, [{ publishedAt: "desc" }], 4),
    listingCards({ isPreRevenue: false, revenueUsd: { gt: 0 } }, [{ revenueUsd: "desc" }], 4),
    listingCards({ auction: { status: "LIVE", endsAt: { gt: now, lte: new Date(now.getTime() + 2 * 86400_000) } } }, [{ auction: { endsAt: "asc" } }], 4),
    db.listing.groupBy({ by: ["category"], where: { status: "ACTIVE", market: "MAIN" }, _count: true }),
    db.testimonial.findMany({ where: { status: "APPROVED", deal: { status: "COMPLETED" } }, include: { user: { select: { displayName: true, country: true } }, deal: { select: { listing: { select: { title: true, category: true } } } } }, take: 6, orderBy: { createdAt: "desc" } }),
  ]);

  // Premium homepage placement: Ultimate promotions are shown first among featured.
  const premium = await listingCards({ promotions: { some: { ...activePromotionWhere(now), premiumHomepage: true } } }, [{ publishedAt: "desc" }], 4);
  const featuredMerged = [...premium, ...featured.filter((f) => !premium.some((p) => p.id === f.id))].slice(0, 8);

  const heroSource = [...live, ...featuredMerged].filter((v, i, a) => a.findIndex((x) => x.id === v.id) === i).slice(0, 3);
  // Only real listings — the hero shows nothing until something is published.
  const heroCards: HeroCard[] = heroSource.map((l) => ({ slug: l.slug, title: l.title, category: categoryLabel(l.category, locale), price: l.price, revenue: l.monthlyRevenue, currency: l.currency, endsAt: l.auction?.endsAt ?? null, isAuction: l.saleType === "AUCTION" }));

  const counts = new Map(catCounts.map((c) => [c.category, c._count]));
  const stats = [
    { label: t("home.stats.listed"), value: listed },
    { label: t("home.stats.auctions"), value: activeAuctions },
    { label: t("home.stats.sales"), value: completed },
    { label: t("home.stats.buyers"), value: buyers },
    { label: t("home.stats.volume"), value: Math.round((volume._sum.amountUsd ?? 0) / 100), usd: true },
  ];

  const steps = [1, 2, 3, 4].map((n) => ({ title: t(`home.how.${n}.title` as never), body: t(`home.how.${n}.body` as never) }));

  return (
    <>
      <Hero cards={heroCards} />

      {/* Live statistics — real database values */}
      <section className="container-x -mt-6 relative z-10">
        <Stagger className="glass card-shadow grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-white/5 sm:grid-cols-3 lg:grid-cols-5">
          {stats.map((s) => (
            <StaggerItem key={s.label} className="bg-ink-900/80 px-5 py-6 text-center">
              <div className="font-display text-2xl font-semibold text-white sm:text-3xl">
                <CountUp value={s.value} format={s.usd ? "usd" : "number"} />
              </div>
              <div className="mt-1 text-xs uppercase tracking-wider text-slate-500">{s.label}</div>
            </StaggerItem>
          ))}
        </Stagger>
      </section>

      <Section title={t("home.featured")} sub={t("home.featuredSub")} href="/marketplace" items={featuredMerged} empty={t("home.empty")} />
      <Section title={t("home.live")} sub={t("home.liveSub")} href="/auctions" items={live} empty={t("home.empty")} />
      <Section title={t("home.newStartups")} sub={t("home.newStartupsSub")} href="/marketplace?stage=pre" items={startups} empty={t("home.empty")} />

      {/* Starter Market teaser */}
      <section className="container-x py-6">
        <Reveal>
          <Link href="/starter" className="group relative block overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-electric/20 via-violet/15 to-cyan/10 p-8 sm:p-12">
            <div className="grid-bg absolute inset-0 opacity-60" />
            <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold text-cyan"><Rocket className="h-4 w-4" /> {t("home.starterTeaser")}</div>
                <div className="mt-2 max-w-xl font-display text-2xl font-semibold text-white sm:text-3xl">{t("home.starterTeaserSub")}</div>
              </div>
              <span className="inline-flex items-center gap-2 font-semibold text-white">{t("common.viewAll")} <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" /></span>
            </div>
          </Link>
        </Reveal>
      </section>

      <Section title={t("home.under1k")} sub={t("home.under1kSub")} href="/marketplace?priceMax=1000&sort=priceAsc" items={under1k} empty={t("home.empty")} />
      <Section title={t("home.highRevenue")} sub={t("home.highRevenueSub")} href="/marketplace?sort=revenue&stage=established" items={highRevenue} empty={t("home.empty")} />
      <Section title={t("home.endingSoon")} sub={t("home.endingSoonSub")} href="/auctions?sort=ending" items={endingSoon} empty={t("home.empty")} />

      {/* Popular categories */}
      <section className="container-x py-14">
        <Reveal><SectionHeading title={t("home.categories")} /></Reveal>
        <Stagger className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-7">
          {MAIN_CATEGORIES.map((c) => {
            const Icon = (Icons as unknown as Record<string, Icons.LucideIcon>)[c.icon] ?? Icons.Box;
            return (
              <StaggerItem key={c.key}>
                <Link href={`/marketplace?category=${c.key}`} className="group glass flex h-full flex-col items-start gap-3 rounded-2xl p-4 transition hover:-translate-y-1 hover:border-electric/40 hover:bg-electric/[0.06]">
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-electric/25 to-violet/25 text-electric-400 ring-1 ring-white/10 transition group-hover:scale-110">
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="text-sm font-medium text-white">{c.label[locale]}</span>
                  <span className="text-xs text-slate-500">{counts.get(c.key) ?? 0}</span>
                </Link>
              </StaggerItem>
            );
          })}
        </Stagger>
      </section>

      {/* How it works */}
      <section className="container-x py-14">
        <Reveal><SectionHeading title={t("home.how")} action={<LinkButton href="/how-it-works" variant="ghost" size="sm">{t("nav.howItWorks")} <ArrowRight className="h-4 w-4" /></LinkButton>} /></Reveal>
        <Stagger className="grid gap-4 md:grid-cols-4">
          {steps.map((s, i) => (
            <StaggerItem key={i}>
              <div className="glass relative h-full overflow-hidden rounded-2xl p-6">
                <div className="absolute -top-6 -right-2 font-display text-[7rem] leading-none font-bold text-white/[0.03]">{i + 1}</div>
                <div className="grid h-9 w-9 place-items-center rounded-lg bg-brand font-display text-sm font-bold text-white">{i + 1}</div>
                <h3 className="mt-4 font-display text-lg font-semibold text-white">{s.title}</h3>
                <p className="mt-2 text-sm text-slate-400">{s.body}</p>
              </div>
            </StaggerItem>
          ))}
        </Stagger>
      </section>

      {/* Verified success stories only */}
      <section className="container-x py-14">
        <Reveal><SectionHeading title={t("home.stories")} subtitle={t("home.storiesSub")} /></Reveal>
        {stories.length ? (
          <div className="grid gap-4 md:grid-cols-3">
            {stories.map((s) => (
              <Reveal key={s.id}>
                <figure className="glass h-full rounded-2xl p-6">
                  <Quote className="h-6 w-6 text-violet-400" />
                  <blockquote className="mt-3 text-slate-200">“{s.quote}”</blockquote>
                  <figcaption className="mt-4 text-sm text-slate-400">
                    <span className="font-semibold text-white">{s.user.displayName}</span> · sold {s.deal.listing.title} ({categoryLabel(s.deal.listing.category, locale)})
                    <div className="mt-1 text-xs text-emerald-300">✓ Verified completed sale</div>
                  </figcaption>
                </figure>
              </Reveal>
            ))}
          </div>
        ) : (
          <EmptyState title={t("home.stories")} body={t("home.storiesEmpty")} />
        )}
      </section>

      <section className="container-x py-14">
        <div className="grid gap-10 lg:grid-cols-[1fr_1.4fr]">
          <Reveal><SectionHeading title={t("home.faq")} action={<LinkButton href="/faq" variant="ghost" size="sm">{t("common.viewAll")}</LinkButton>} /></Reveal>
          <Reveal delay={0.1}><Faq items={FAQ[locale].slice(0, 6)} /></Reveal>
        </div>
      </section>

      <section className="container-x py-10">
        <Reveal>
          <div className="relative overflow-hidden rounded-3xl bg-brand p-10 text-center sm:p-16">
            <div className="grid-bg absolute inset-0 opacity-40" />
            <div className="relative">
              <h2 className="font-display text-3xl font-semibold text-white sm:text-4xl">{t("home.cta.title")}</h2>
              <p className="mx-auto mt-3 max-w-xl text-white/80">{t("home.cta.body")}</p>
              <LinkButton href="/sell" variant="secondary" size="lg" className="mt-8 bg-white/15">{t("home.cta.button")} <ArrowRight className="h-4 w-4" /></LinkButton>
            </div>
          </div>
        </Reveal>
      </section>
    </>
  );
}
