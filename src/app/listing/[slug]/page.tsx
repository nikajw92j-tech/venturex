import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { cache } from "react";
import { AlertTriangle, BadgeCheck, Calendar, CheckCircle2, Code2, ExternalLink, GitBranch, Globe, Info, Layers, Megaphone, MapPin, ShieldCheck, Sparkles, Users } from "lucide-react";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { getI18n } from "@/i18n/server";
import { settleAuction } from "@/lib/auction/service";
import { maskName, minimumNextBid } from "@/lib/auction/engine";
import { activePromotionWhere } from "@/lib/promotions";
import { fileUrl, listingCards } from "@/lib/listings";
import { trustScore } from "@/lib/trust";
import { categoryLabel, countryName, devStatusLabel } from "@/lib/categories";
import { formatMoney, type CurrencyCode } from "@/lib/money";
import { formatAge, formatNumber } from "@/lib/utils";
import { env } from "@/lib/env";
import { Badge, Card, LinkButton } from "@/components/ui";
import { Avatar } from "@/components/layout/navbar";
import { AuctionPanel } from "@/components/listing/auction-panel";
import { DemoPreview, DocumentRoom, FixedPricePanel, Gallery, ListingActions, Questions } from "@/components/listing/panels";
import { RevenueChart, TrafficChart } from "@/components/charts";
import { ListingGrid, Money } from "@/components/listing-card";
import { Reveal } from "@/components/motion";

const PUBLIC_STATUSES = ["ACTIVE", "PENDING_SALE", "SOLD", "EXPIRED"];

const load = cache(async (slug: string) =>
  db.listing.findUnique({
    where: { slug },
    include: {
      seller: { select: { id: true, username: true, displayName: true, avatarUrl: true, country: true, createdAt: true, identityVerified: true, businessVerified: true } },
      media: { orderBy: { sortOrder: "asc" }, include: { file: { select: { id: true, filename: true } } } },
      auction: true,
      questions: { where: { isPublic: true }, orderBy: { createdAt: "desc" }, take: 30 },
      promotions: { where: activePromotionWhere(), take: 1 },
      _count: { select: { watchers: true } },
    },
  }),
);

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const l = await load(slug);
  if (!l || !PUBLIC_STATUSES.includes(l.status)) return { title: "Listing", robots: { index: false } };
  const description = (l.tagline ?? l.description).slice(0, 160);
  return {
    title: `${l.title} — ${categoryLabel(l.category)} for sale`,
    description,
    alternates: { canonical: `/listing/${l.slug}` },
    openGraph: { title: l.title, description, type: "website", url: `/listing/${l.slug}` },
    robots: l.status === "ACTIVE" ? undefined : { index: false },
  };
}

function Metric({ label, children, note }: { label: string; children: React.ReactNode; note?: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-white/[0.03] p-4 ring-1 ring-white/5">
      <div className="text-[11px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className="mt-1 font-display text-xl font-semibold text-white">{children}</div>
      {note && <div className="mt-0.5 text-[11px]">{note}</div>}
    </div>
  );
}

function SectionCard({ id, title, icon, children }: { id?: string; title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <Reveal>
      <Card id={id} className="scroll-mt-24 p-6">
        <h2 className="mb-4 flex items-center gap-2 font-display text-lg font-semibold text-white">{icon}{title}</h2>
        {children}
      </Card>
    </Reveal>
  );
}

export default async function ListingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [{ t, locale }, user] = await Promise.all([getI18n(), getCurrentUser()]);
  let l = await load(slug);
  if (!l) notFound();
  const isSeller = user?.id === l.sellerId;
  const isAdmin = user?.role === "ADMIN";
  if (!PUBLIC_STATUSES.includes(l.status) && !isSeller && !isAdmin) notFound();

  // Lazy settlement: never show a "live" auction whose clock already ran out.
  if (l.auction?.status === "LIVE" && l.auction.endsAt && l.auction.endsAt <= new Date()) {
    await settleAuction(l.auction.id).catch(() => null);
    l = (await db.listing.findUnique({ where: { slug }, include: { seller: { select: { id: true, username: true, displayName: true, avatarUrl: true, country: true, createdAt: true, identityVerified: true, businessVerified: true } }, media: { orderBy: { sortOrder: "asc" }, include: { file: { select: { id: true, filename: true } } } }, auction: true, questions: { where: { isPublic: true }, orderBy: { createdAt: "desc" }, take: 30 }, promotions: { where: activePromotionWhere(), take: 1 }, _count: { select: { watchers: true } } } }))!;
  }

  // View tracking (not counting the seller's own views)
  if (!isSeller && l.status === "ACTIVE") {
    await db.listing.update({ where: { id: l.id }, data: { viewCount: { increment: 1 } } });
    if (user) await db.recentView.upsert({ where: { userId_listingId: { userId: user.id, listingId: l.id } }, create: { userId: user.id, listingId: l.id }, update: { viewedAt: new Date() } });
  }

  const currency = l.currency as CurrencyCode;
  const [trust, bids, access, watching, myDeal, similar] = await Promise.all([
    trustScore(l.sellerId),
    l.auction ? db.bid.findMany({ where: { auctionId: l.auction.id }, orderBy: { createdAt: "desc" }, take: 50, include: { bidder: { select: { username: true } } } }) : Promise.resolve([]),
    user && !isSeller ? db.documentAccess.findUnique({ where: { listingId_buyerId: { listingId: l.id, buyerId: user.id } } }) : Promise.resolve(null),
    user ? db.watchlistItem.findUnique({ where: { userId_listingId: { userId: user.id, listingId: l.id } } }) : Promise.resolve(null),
    user ? db.deal.findFirst({ where: { listingId: l.id, buyerId: user.id, status: { notIn: ["CANCELLED"] } }, orderBy: { createdAt: "desc" }, select: { id: true } }) : Promise.resolve(null),
    listingCards({ category: l.category, id: { not: l.id } }, [{ publishedAt: "desc" }], 4),
  ]);

  const screenshots = l.media.filter((m) => m.kind === "SCREENSHOT").map((m) => fileUrl(m.fileId));
  const logo = l.media.find((m) => m.kind === "LOGO");
  const privateDocs = l.media.filter((m) => ["REVENUE_EVIDENCE", "TRAFFIC_EVIDENCE", "DOCUMENT"].includes(m.kind));
  const canSeeDocs = isSeller || isAdmin || (access?.status === "GRANTED" && access.ndaAcceptedAt);
  const revenueHistory = Array.isArray(l.revenueHistory) ? (l.revenueHistory as { month: string; revenue: number; profit: number }[]) : [];
  const trafficHistory = Array.isArray(l.trafficHistory) ? (l.trafficHistory as { month: string; visitors: number }[]) : [];
  const annualProfit = l.monthlyProfit * 12;
  const headline = l.saleType === "AUCTION" && l.auction ? (l.auction.currentBid ?? l.auction.startingBid) : (l.askingPrice ?? 0);
  const multiple = annualProfit > 0 ? (headline / annualProfit).toFixed(1) : null;
  const promo = l.promotions[0];
  const reported = (verified: boolean) => verified ? <span className="flex items-center gap-1 text-emerald-300"><ShieldCheck className="h-3 w-3" /> {t("common.independentlyVerified")}</span> : <span className="text-slate-500">{t("common.sellerReported")}</span>;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: l.title,
    description: (l.tagline ?? l.description).slice(0, 300),
    category: categoryLabel(l.category),
    url: `${env.appUrl}/listing/${l.slug}`,
    ...(screenshots[0] ? { image: `${env.appUrl}${screenshots[0]}` } : {}),
    offers: {
      "@type": "Offer",
      priceCurrency: currency,
      price: (headline / 100).toFixed(2),
      availability: l.status === "ACTIVE" ? "https://schema.org/InStock" : "https://schema.org/SoldOut",
      seller: { "@type": "Person", name: l.seller.displayName },
    },
  };

  return (
    <div className="container-x py-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />

      {(l.status === "DRAFT" || l.status === "PENDING_REVIEW" || l.status === "REJECTED") && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-electric/30 bg-electric/10 px-4 py-3 text-sm text-blue-200">
          <span><Info className="mr-1 inline h-4 w-4" /> {t("listing.previewBanner")} ({l.status.replace("_", " ").toLowerCase()})</span>
          {isSeller && <LinkButton href={`/sell?edit=${l.id}`} size="sm" variant="secondary">{t("common.edit")}</LinkButton>}
        </div>
      )}
      {l.rejectionReason && isSeller && l.status === "REJECTED" && <div className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{l.rejectionReason}</div>}
      {l.status === "SOLD" && <div className="mb-6 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{t("listing.sold")}</div>}
      {promo && (
        <div className="mb-4 flex items-center gap-2 text-xs text-violet-300"><Megaphone className="h-3.5 w-3.5" /> {t("listing.adLabel")}</div>
      )}

      {/* Header */}
      <div className="mb-8 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div className="flex items-start gap-4">
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={fileUrl(logo.fileId)} alt="" className="h-16 w-16 rounded-2xl object-cover ring-1 ring-white/15" />
          ) : (
            <div className="grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-electric to-violet font-display text-xl font-bold text-white">{l.title.slice(0, 2).toUpperCase()}</div>
          )}
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Link href={`/${l.market === "STARTER" ? "starter" : "marketplace"}?category=${l.category}`} className="text-xs font-semibold uppercase tracking-wider text-electric-400 hover:underline">{categoryLabel(l.category, locale)}</Link>
              {l.market === "STARTER" && <Badge tone="cyan">{t("nav.starter")}</Badge>}
              {l.isPreRevenue && <Badge tone="cyan">{t("common.preRevenue")}</Badge>}
              {l.financialsVerified && <Badge tone="green"><ShieldCheck className="h-3 w-3" /> {t("common.verified")}</Badge>}
            </div>
            <h1 className="mt-1 font-display text-3xl font-semibold text-white sm:text-4xl">{l.title}</h1>
            {l.tagline && <p className="mt-1 max-w-2xl text-slate-400">{l.tagline}</p>}
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500">
              {l.websiteUrl && <a href={l.websiteUrl} target="_blank" rel="noopener noreferrer nofollow" className="flex items-center gap-1 hover:text-white"><Globe className="h-3.5 w-3.5" /> {l.websiteUrl.replace(/^https?:\/\//, "")}</a>}
              {l.country && <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {countryName(l.country)}</span>}
              <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" /> {formatAge(l.businessAgeMonths)}</span>
              <span>{formatNumber(l.viewCount)} {t("common.views")} · {l._count.watchers} {t("common.watchers")}</span>
            </div>
          </div>
        </div>
        <ListingActions listingId={l.id} watching={Boolean(watching)} userId={user?.id ?? null} isSeller={isSeller} />
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
        <div className="min-w-0 space-y-6">
          <Reveal><Gallery images={screenshots} title={l.title} /></Reveal>

          {l.market === "STARTER" && l.demoUrl && <Reveal><DemoPreview url={l.demoUrl} verified={Boolean(l.demoVerifiedAt)} /></Reveal>}

          <SectionCard title={t("listing.overview")}>
            <div className="prose-vx whitespace-pre-line">{l.description}</div>
            {l.market === "STARTER" && (
              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                <Metric label={t("listing.devStatus")}>{devStatusLabel(l.developmentStatus, locale)}</Metric>
                <Metric label={t("listing.sourceCode")}>{l.sourceCodeIncluded ? t("common.yes") : t("common.no")}</Metric>
                <Metric label={t("listing.repository")}>
                  {l.repositoryUrl ? <a href={l.repositoryUrl} target="_blank" rel="noopener noreferrer nofollow" className="flex items-center gap-1.5 text-base text-electric-400 hover:underline"><GitBranch className="h-4 w-4" /> GitHub</a> : "—"}
                </Metric>
              </div>
            )}
          </SectionCard>

          {l.market === "STARTER" && l.featuresIncluded.length > 0 && (
            <SectionCard title={t("listing.features")} icon={<Sparkles className="h-5 w-5 text-violet-400" />}>
              <ul className="grid gap-2 sm:grid-cols-2">
                {l.featuresIncluded.map((f) => <li key={f} className="flex items-start gap-2 text-sm text-slate-300"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" /> {f}</li>)}
              </ul>
            </SectionCard>
          )}

          {(l.market === "MAIN" || l.monthlyRevenue > 0) && (
            <SectionCard title={t("listing.financials")}>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                <Metric label={t("common.monthlyRevenue")} note={reported(l.financialsVerified)}><Money amount={l.monthlyRevenue} currency={currency} /></Metric>
                <Metric label={t("listing.expenses")} note={reported(l.financialsVerified)}><Money amount={l.monthlyExpenses} currency={currency} /></Metric>
                <Metric label={t("common.monthlyProfit")} note={reported(l.financialsVerified)}><Money amount={l.monthlyProfit} currency={currency} /></Metric>
                <Metric label={t("common.monthlyTraffic")} note={reported(l.trafficVerified)}>{formatNumber(l.monthlyTraffic)}</Metric>
                <Metric label={t("listing.customers")} note={reported(l.financialsVerified)}>{formatNumber(l.customers)}</Metric>
                <Metric label={t("listing.multiple")} note={<span className="text-slate-500">price ÷ annual profit</span>}>{multiple ? `${multiple}×` : "—"}</Metric>
              </div>
              {revenueHistory.length > 1 && (
                <div className="mt-8">
                  <RevenueChart data={revenueHistory} currency={currency} labels={{ title: t("listing.revenueHistory"), revenue: t("common.monthlyRevenue"), profit: t("common.monthlyProfit") }} />
                </div>
              )}
              {trafficHistory.length > 1 && (
                <div className="mt-8">
                  <TrafficChart data={trafficHistory} title={t("listing.trafficHistory")} label={t("common.monthlyTraffic")} />
                </div>
              )}
              <p className="mt-6 flex items-start gap-2 text-xs text-slate-500"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {t("listing.disclaimer")}</p>
            </SectionCard>
          )}

          <div className="grid gap-6 md:grid-cols-2">
            <SectionCard title={t("listing.assets")} icon={<Layers className="h-5 w-5 text-electric-400" />}>
              {l.assetsIncluded.length ? (
                <ul className="space-y-2">{l.assetsIncluded.map((a) => <li key={a} className="flex items-start gap-2 text-sm text-slate-300"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" /> {a}</li>)}</ul>
              ) : <p className="text-sm text-slate-500">—</p>}
            </SectionCard>
            <SectionCard title={t("listing.tech")} icon={<Code2 className="h-5 w-5 text-electric-400" />}>
              <div className="flex flex-wrap gap-2">{l.techStack.length ? l.techStack.map((s) => <span key={s} className="rounded-lg bg-white/5 px-2.5 py-1 text-sm text-slate-200 ring-1 ring-white/10">{s}</span>) : <span className="text-sm text-slate-500">—</span>}</div>
            </SectionCard>
          </div>

          {l.growthOpportunities && <SectionCard title={t("listing.growth")} icon={<Sparkles className="h-5 w-5 text-violet-400" />}><p className="prose-vx whitespace-pre-line">{l.growthOpportunities}</p></SectionCard>}
          {l.reasonForSale && <SectionCard title={t("listing.reason")}><p className="prose-vx whitespace-pre-line">{l.reasonForSale}</p></SectionCard>}

          <SectionCard title={t("listing.risks")} icon={<AlertTriangle className="h-5 w-5 text-amber-400" />}>
            {l.riskDisclosures && <p className="prose-vx mb-4 whitespace-pre-line">{l.riskDisclosures}</p>}
            <ul className="space-y-1.5 text-sm text-slate-400">
              <li>• {l.financialsVerified ? "Financials were reviewed by VENTUREX against submitted evidence." : "Financial figures are seller-reported and have not been independently verified."}</li>
              <li>• Past performance does not guarantee future results. Revenue can depend on platforms, algorithms and suppliers outside the seller&apos;s control.</li>
              <li>• Confirm ownership of domains, code and accounts during the handover before confirming.</li>
            </ul>
          </SectionCard>

          <SectionCard title={t("listing.documents")} icon={<ShieldCheck className="h-5 w-5 text-emerald-400" />}>
            <DocumentRoom
              listingId={l.id}
              status={(access?.status as "REQUESTED" | "GRANTED" | "DENIED" | "REVOKED") ?? "NONE"}
              docs={canSeeDocs ? privateDocs.map((d) => ({ id: d.fileId, name: d.caption ?? d.file.filename, kind: d.kind })) : null}
              isSeller={isSeller}
              userId={user?.id ?? null}
            />
          </SectionCard>

          <SectionCard id="questions" title={t("listing.questions")}>
            <Questions listingId={l.id} items={l.questions.map((q) => ({ id: q.id, question: q.question, answer: q.answer, createdAt: q.createdAt.toISOString() }))} isSeller={isSeller} userId={user?.id ?? null} />
          </SectionCard>
        </div>

        {/* Sidebar */}
        <aside className="space-y-6 lg:sticky lg:top-20 lg:self-start">
          {l.saleType === "AUCTION" && l.auction ? (
            <AuctionPanel
              auctionId={l.auction.id}
              currency={currency}
              status={l.auction.status}
              startingBid={l.auction.startingBid}
              currentBid={l.auction.currentBid}
              minNext={minimumNextBid(l.auction)}
              minIncrement={l.auction.minIncrement}
              bidCount={l.auction.bidCount}
              leaderId={l.auction.currentBidderId}
              winnerId={l.auction.winnerId}
              endsAt={l.auction.endsAt?.toISOString() ?? null}
              extensions={l.auction.extensions}
              hasReserve={l.auction.reservePrice !== null}
              reserveMet={l.auction.reserveMet}
              buyNowPrice={l.auction.buyNowPrice}
              bids={bids.map((b) => ({ bidder: maskName(b.bidder.username), bidderId: b.bidderId === user?.id ? b.bidderId : "", amount: b.amount, isAuto: b.isAuto, at: b.createdAt.toISOString() }))}
              userId={user?.id ?? null}
              isSeller={isSeller}
              emailVerified={Boolean(user?.emailVerifiedAt)}
              serverTime={new Date().toISOString()}
              myDealId={myDeal?.id ?? null}
            />
          ) : (
            <FixedPricePanel listingId={l.id} slug={l.slug} price={l.askingPrice ?? 0} currency={currency} available={l.status === "ACTIVE"} isSeller={isSeller} userId={user?.id ?? null} emailVerified={Boolean(user?.emailVerifiedAt)} />
          )}

          {myDeal && l.saleType === "FIXED" && <LinkButton href={`/dashboard/deals/${myDeal.id}`} variant="outline" className="w-full">{t("dash.transferProgress")}</LinkButton>}

          <Card className="p-5">
            <div className="mb-3 text-xs uppercase tracking-wider text-slate-500">{t("listing.seller")}</div>
            <Link href={`/u/${l.seller.username}`} className="flex items-center gap-3">
              <Avatar name={l.seller.displayName} src={l.seller.avatarUrl} size={44} />
              <div className="min-w-0">
                <div className="flex items-center gap-1 font-semibold text-white">{l.seller.displayName} {(l.seller.identityVerified || l.seller.businessVerified) && <BadgeCheck className="h-4 w-4 text-electric-400" />}</div>
                <div className="text-xs text-slate-500">{t("listing.memberSince", { date: l.seller.createdAt.toLocaleDateString(locale, { month: "short", year: "numeric" }) })}</div>
              </div>
            </Link>
            {trust && (
              <div className="mt-5">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-400">{t("listing.trustScore")}</span>
                  <span className="font-display text-lg font-semibold text-white">{trust.score}<span className="text-xs text-slate-500">/100</span></span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/5"><div className="h-full rounded-full bg-brand" style={{ width: `${trust.score}%` }} /></div>
                <details className="mt-3 text-xs text-slate-400">
                  <summary className="cursor-pointer text-slate-500 hover:text-slate-300">How is this calculated?</summary>
                  <ul className="mt-2 space-y-1">
                    {trust.factors.map((f) => <li key={f.label} className="flex justify-between gap-2"><span>{f.label}</span><span className={f.points < 0 ? "text-red-300" : "text-slate-300"}>{f.points > 0 ? "+" : ""}{f.points}{f.max ? `/${f.max}` : ""}</span></li>)}
                  </ul>
                </details>
                <div className="mt-4 grid grid-cols-2 gap-2 text-center text-xs">
                  <div className="rounded-lg bg-white/[0.03] py-2 ring-1 ring-white/5"><div className="font-semibold text-white">{trust.completedSales}</div><div className="text-slate-500">{t("dash.completedSales")}</div></div>
                  <div className="rounded-lg bg-white/[0.03] py-2 ring-1 ring-white/5"><div className="font-semibold text-white">{trust.rating ?? "—"}</div><div className="text-slate-500">{trust.reviewCount ? `${trust.reviewCount} reviews` : t("listing.noRating")}</div></div>
                </div>
              </div>
            )}
          </Card>

          <Card className="p-5">
            <div className="mb-3 text-xs uppercase tracking-wider text-slate-500">{t("listing.verification")}</div>
            <ul className="space-y-2 text-sm">
              {[
                [t("common.monthlyRevenue"), l.financialsVerified],
                [t("common.monthlyTraffic"), l.trafficVerified],
                ["Identity", l.seller.identityVerified],
                ["Business documents", l.seller.businessVerified],
                ...(l.market === "STARTER" && l.demoUrl ? [[t("listing.demo"), Boolean(l.demoVerifiedAt)] as const] : []),
              ].map(([label, ok]) => (
                <li key={String(label)} className="flex items-center justify-between">
                  <span className="text-slate-400">{label}</span>
                  {ok ? <span className="flex items-center gap-1 text-emerald-300"><CheckCircle2 className="h-4 w-4" /> {t("common.verified")}</span> : <span className="text-slate-500">{t("common.sellerReported")}</span>}
                </li>
              ))}
            </ul>
          </Card>

          {isSeller && l.status === "ACTIVE" && (
            <LinkButton href={`/dashboard/promotions?listing=${l.id}`} variant="gold" className="w-full"><Megaphone className="h-4 w-4" /> {t("listing.promote")}</LinkButton>
          )}
          {l.saleType === "FIXED" && l.askingPrice && <p className="px-1 text-xs text-slate-500"><Users className="mr-1 inline h-3.5 w-3.5" />{formatMoney(l.askingPrice, currency, { locale })} · {t("footer.ratesNote")}</p>}
          {l.websiteUrl && <a href={l.websiteUrl} target="_blank" rel="noopener noreferrer nofollow" className="flex items-center gap-1.5 px-1 text-xs text-slate-500 hover:text-white"><ExternalLink className="h-3.5 w-3.5" /> {l.websiteUrl}</a>}
        </aside>
      </div>

      {similar.length > 0 && (
        <section className="mt-16">
          <h2 className="mb-5 font-display text-2xl font-semibold text-white">{t("listing.similar")}</h2>
          <ListingGrid items={similar} />
        </section>
      )}
    </div>
  );
}
