import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { getI18n } from "@/i18n/server";
import { getTiers } from "@/lib/deals";
import { getRates } from "@/lib/rates";
import { userPlan, COUNTED_STATUSES } from "@/lib/listing-service";
import { SellWizard, type WizardInitial } from "@/components/sell/wizard";
import { fileUrl } from "@/lib/listings";
import { Alert, LinkButton } from "@/components/ui";

export const metadata: Metadata = { title: "Sell your business", robots: { index: false } };

export default async function SellPage({ searchParams }: { searchParams: Promise<{ edit?: string; market?: string }> }) {
  const sp = await searchParams;
  const user = await requireUser(`/sell${sp.edit ? `?edit=${sp.edit}` : ""}`);
  const { t } = await getI18n();
  const [tiers, { rates }, plan, activeCount] = await Promise.all([
    getTiers(),
    getRates(),
    userPlan(user.id),
    db.listing.count({ where: { sellerId: user.id, status: { in: [...COUNTED_STATUSES] } } }),
  ]);

  let initial: WizardInitial | null = null;
  if (sp.edit) {
    const l = await db.listing.findUnique({ where: { id: sp.edit }, include: { auction: true, media: { orderBy: { sortOrder: "asc" }, include: { file: true } } } });
    if (!l || l.sellerId !== user.id) notFound();
    const major = (n: number | null | undefined) => (n == null ? "" : String(n / 100));
    initial = {
      id: l.id,
      status: l.status,
      slug: l.slug,
      market: l.market,
      title: l.title,
      tagline: l.tagline ?? "",
      category: l.category,
      websiteUrl: l.websiteUrl ?? "",
      description: l.description,
      businessAgeMonths: String(l.businessAgeMonths),
      country: l.country ?? "",
      techStack: l.techStack.join(", "),
      currency: l.currency as "USD" | "GEL" | "EUR",
      monthlyRevenue: major(l.monthlyRevenue),
      monthlyExpenses: major(l.monthlyExpenses),
      monthlyTraffic: String(l.monthlyTraffic),
      customers: String(l.customers),
      revenueHistory: ((l.revenueHistory as { month: string; revenue: number; profit: number }[] | null) ?? []).map((r) => ({ month: r.month, revenue: major(r.revenue), profit: major(r.profit) })),
      trafficHistory: ((l.trafficHistory as { month: string; visitors: number }[] | null) ?? []).map((r) => ({ month: r.month, visitors: String(r.visitors) })),
      reasonForSale: l.reasonForSale ?? "",
      assetsIncluded: l.assetsIncluded.join("\n"),
      growthOpportunities: l.growthOpportunities ?? "",
      riskDisclosures: l.riskDisclosures ?? "",
      demoUrl: l.demoUrl ?? "",
      repositoryUrl: l.repositoryUrl ?? "",
      developmentStatus: l.developmentStatus ?? "",
      featuresIncluded: l.featuresIncluded.join("\n"),
      sourceCodeIncluded: l.sourceCodeIncluded,
      saleType: l.saleType,
      askingPrice: major(l.askingPrice),
      startingBid: major(l.auction?.startingBid),
      minIncrement: major(l.auction?.minIncrement),
      durationHours: String(l.auction?.durationHours ?? 168),
      reservePrice: major(l.auction?.reservePrice),
      buyNowPrice: major(l.auction?.buyNowPrice),
      media: l.media.map((m) => ({ id: m.fileId, url: fileUrl(m.fileId), name: m.caption ?? m.file.filename, mime: m.file.mimeType, kind: m.kind })),
    };
    if (["PENDING_SALE", "SOLD", "REMOVED"].includes(l.status)) {
      return (
        <div className="container-x max-w-2xl py-16">
          <Alert tone="amber">This listing can&apos;t be edited while a sale is in progress or after it has been sold/removed.</Alert>
          <LinkButton href="/dashboard/listings" className="mt-6">{t("dash.listings")}</LinkButton>
        </div>
      );
    }
  }

  const atLimit = !initial && activeCount >= plan.maxActiveListings;

  return (
    <div className="container-x max-w-5xl py-10">
      <h1 className="font-display text-3xl font-semibold text-white sm:text-4xl">{initial ? `${t("common.edit")}: ${initial.title}` : t("sell.title")}</h1>
      <p className="mt-2 text-slate-400">{t("sell.subtitle")}</p>
      {!user.emailVerifiedAt && <Alert tone="amber" className="mt-6">{t("auth.verifyBanner")}</Alert>}
      {atLimit && (
        <Alert tone="amber" className="mt-6">
          {t("sell.limitReached", { limit: plan.maxActiveListings })} <a href="/pricing" className="font-semibold underline">{t("nav.pricing")}</a>
        </Alert>
      )}
      <div className="mt-8">
        <SellWizard initial={initial} defaultMarket={sp.market === "STARTER" ? "STARTER" : "MAIN"} tiers={tiers} rates={rates} sellerName={user.displayName} />
      </div>
    </div>
  );
}
