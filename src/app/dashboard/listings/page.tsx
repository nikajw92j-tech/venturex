import Link from "next/link";
import { Lock, Megaphone, Sparkles } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { getI18n } from "@/i18n/server";
import { userPlan, COUNTED_STATUSES } from "@/lib/listing-service";
import { activePromotionWhere } from "@/lib/promotions";
import { Card, EmptyState, LinkButton, Alert } from "@/components/ui";
import { ListingStatusBadge } from "@/components/dashboard/status";
import { AccessDecision, ListingRowActions } from "@/components/dashboard/listing-actions";
import { formatMoney, type CurrencyCode } from "@/lib/money";
import { countryName } from "@/lib/categories";

export default async function MyListingsPage() {
  const user = await requireUser("/dashboard/listings");
  const { t, locale } = await getI18n();
  const [listings, plan, requests] = await Promise.all([
    db.listing.findMany({
      where: { sellerId: user.id },
      include: {
        auction: { select: { currentBid: true, startingBid: true, bidCount: true, endsAt: true, status: true } },
        promotions: { where: activePromotionWhere(), select: { id: true } },
        _count: { select: { watchers: true, offers: true, questions: true, deals: true } },
      },
      orderBy: { updatedAt: "desc" },
    }),
    userPlan(user.id),
    db.documentAccess.findMany({ where: { listing: { sellerId: user.id }, status: "REQUESTED" }, include: { buyer: { select: { displayName: true, username: true, country: true, identityVerified: true } }, listing: { select: { title: true } } } }),
  ]);
  const counted = listings.filter((l) => (COUNTED_STATUSES as readonly string[]).includes(l.status)).length;

  // Advanced buyer insights (Pro/Business): where interested buyers come from.
  const insights =
    plan.analyticsLevel >= 1
      ? await db.user.groupBy({
          by: ["country"],
          where: { OR: [{ watchlist: { some: { listing: { sellerId: user.id } } } }, { offersMade: { some: { sellerId: user.id } } }, { bids: { some: { auction: { listing: { sellerId: user.id } } } } }] },
          _count: true,
          orderBy: { _count: { country: "desc" } },
          take: 8,
        })
      : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold text-white">{t("dash.listings")}</h1>
          <p className="mt-1 text-sm text-slate-400">{counted}/{plan.maxActiveListings} active listing slots · {plan.name} plan</p>
        </div>
        <LinkButton href="/sell">{t("dash.newListing")}</LinkButton>
      </div>

      {requests.length > 0 && (
        <Card className="p-5">
          <h2 className="mb-3 flex items-center gap-2 font-display font-semibold text-white"><Lock className="h-4 w-4 text-emerald-400" /> Document room access requests</h2>
          <div className="space-y-2">
            {requests.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white/[0.03] px-4 py-3 ring-1 ring-white/5">
                <div className="min-w-0 text-sm">
                  <div className="text-white"><Link href={`/u/${r.buyer.username}`} className="font-semibold hover:underline">{r.buyer.displayName}</Link> {r.buyer.identityVerified && <span className="text-xs text-emerald-300">· ID verified</span>} → {r.listing.title}</div>
                  {r.message && <div className="truncate text-slate-400">“{r.message}”</div>}
                  <div className="text-xs text-slate-500">NDA accepted {r.ndaAcceptedAt?.toLocaleDateString(locale)}</div>
                </div>
                <AccessDecision id={r.id} />
              </div>
            ))}
          </div>
        </Card>
      )}

      {listings.length === 0 ? (
        <EmptyState title={t("common.noResults")} body={t("sell.subtitle")} action={<LinkButton href="/sell">{t("dash.newListing")}</LinkButton>} />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="bg-white/[0.03] text-left text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-3">Listing</th>
                  <th className="px-4 py-3">{t("common.status")}</th>
                  <th className="px-4 py-3 text-right">Price</th>
                  <th className="px-4 py-3 text-right">{t("common.views")}</th>
                  <th className="px-4 py-3 text-right">{t("common.watchers")}</th>
                  <th className="px-4 py-3 text-right">{plan.analyticsLevel >= 1 ? "Offers / Bids" : "Offers"}</th>
                  {plan.analyticsLevel >= 1 && <th className="px-4 py-3 text-right">Watch rate</th>}
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {listings.map((l) => {
                  const price = l.saleType === "AUCTION" && l.auction ? (l.auction.currentBid ?? l.auction.startingBid) : (l.askingPrice ?? 0);
                  return (
                    <tr key={l.id} className="border-t border-white/5 hover:bg-white/[0.02]">
                      <td className="max-w-64 px-4 py-3">
                        <div className="flex items-center gap-2 truncate font-medium text-white">{l.title} {l.promotions.length > 0 && <Megaphone className="h-3.5 w-3.5 shrink-0 text-amber-300" />}</div>
                        <div className="text-xs text-slate-500">{l.market === "STARTER" ? "Starter Market" : "Marketplace"} · {l.saleType === "AUCTION" ? "Auction" : "Fixed price"}</div>
                        {l.status === "REJECTED" && l.rejectionReason && <div className="mt-1 text-xs text-red-300">{l.rejectionReason}</div>}
                      </td>
                      <td className="px-4 py-3"><ListingStatusBadge status={l.status} /></td>
                      <td className="px-4 py-3 text-right tabular-nums text-white">{formatMoney(price, l.currency as CurrencyCode, { locale })}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-300">{l.viewCount.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-300">{l._count.watchers}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-300">{l._count.offers}{plan.analyticsLevel >= 1 && l.auction ? ` / ${l.auction.bidCount}` : ""}</td>
                      {plan.analyticsLevel >= 1 && <td className="px-4 py-3 text-right tabular-nums text-slate-300">{l.viewCount ? `${((l._count.watchers / l.viewCount) * 100).toFixed(1)}%` : "—"}</td>}
                      <td className="px-4 py-3"><ListingRowActions id={l.id} slug={l.slug} status={l.status} hasDemo={Boolean(l.demoUrl)} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {plan.analyticsLevel >= 1 ? (
        <Card className="p-5">
          <h2 className="mb-3 flex items-center gap-2 font-display font-semibold text-white"><Sparkles className="h-4 w-4 text-violet-400" /> Buyer insights</h2>
          <p className="mb-4 text-sm text-slate-500">Countries of users who watched, bid on, or made offers on your listings.</p>
          {insights.length ? (
            <div className="space-y-2">
              {insights.map((i) => {
                const max = insights[0]._count;
                return (
                  <div key={i.country ?? "unknown"} className="flex items-center gap-3 text-sm">
                    <span className="w-36 truncate text-slate-300">{countryName(i.country)}</span>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-white/5"><span className="block h-full rounded-full bg-[#3b82f6]" style={{ width: `${(i._count / max) * 100}%` }} /></span>
                    <span className="w-8 text-right tabular-nums text-slate-400">{i._count}</span>
                  </div>
                );
              })}
            </div>
          ) : <p className="text-sm text-slate-500">{t("common.noResults")}</p>}
        </Card>
      ) : (
        <Alert tone="blue">Upgrade to <Link href="/pricing" className="font-semibold underline">Pro Seller</Link> for enhanced analytics: watch rates, bid activity and advanced buyer insights.</Alert>
      )}
    </div>
  );
}
