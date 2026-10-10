import Link from "next/link";
import { ArrowRight, Eye, Gavel, Heart, HandCoins, PackageCheck, Store, Trophy, Truck, Wallet } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { getI18n } from "@/i18n/server";
import { Card, LinkButton } from "@/components/ui";
import { MiniArea } from "@/components/charts";
import { DealStatusBadge } from "@/components/dashboard/status";
import { formatMoney, type CurrencyCode } from "@/lib/money";
import { Reveal, Stagger, StaggerItem } from "@/components/motion";

const OPEN = ["PENDING_PAYMENT", "PAID", "IN_TRANSFER", "BUYER_REVIEW", "RELEASE_PENDING", "DISPUTED"] as const;

function StatCard({ icon: Icon, label, value, href }: { icon: typeof Eye; label: string; value: React.ReactNode; href?: string }) {
  const body = (
    <Card className="group h-full p-5 transition hover:border-electric/30">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wider text-slate-400">{label}</span>
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-electric/20 to-violet/20 text-electric-400 ring-1 ring-white/10 transition group-hover:scale-110"><Icon className="h-4 w-4" /></span>
      </div>
      <div className="mt-3 font-display text-2xl font-semibold text-white">{value}</div>
    </Card>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export default async function DashboardOverview() {
  const user = await requireUser("/dashboard");
  const { t } = await getI18n();
  const me = user.id;
  const sixMonthsAgo = new Date(new Date().getFullYear(), new Date().getMonth() - 5, 1);

  const [active, views, savedBy, offers, auctionBids, completedSales, pendingTransfers, earned, saved, myBidAuctions, won, purchases, pendingPay, openDeals] = await Promise.all([
    db.listing.count({ where: { sellerId: me, status: "ACTIVE" } }),
    db.listing.aggregate({ where: { sellerId: me }, _sum: { viewCount: true } }),
    db.watchlistItem.count({ where: { listing: { sellerId: me } } }),
    db.offer.count({ where: { sellerId: me, status: "PENDING", fromSeller: false } }),
    db.bid.count({ where: { auction: { listing: { sellerId: me } }, createdAt: { gte: new Date(Date.now() - 7 * 86400_000) } } }),
    db.deal.count({ where: { sellerId: me, status: "COMPLETED" } }),
    db.deal.count({ where: { sellerId: me, status: { in: ["PAID", "IN_TRANSFER", "BUYER_REVIEW", "RELEASE_PENDING"] } } }),
    db.deal.findMany({ where: { sellerId: me, status: "COMPLETED", completedAt: { gte: sixMonthsAgo } }, select: { completedAt: true, sellerNetAmount: true, amount: true, amountUsd: true } }),
    db.watchlistItem.count({ where: { userId: me } }),
    db.bid.findMany({ where: { bidderId: me }, distinct: ["auctionId"], select: { auction: { select: { status: true, currentBidderId: true } } } }),
    db.auction.count({ where: { winnerId: me } }),
    db.deal.count({ where: { buyerId: me, status: "COMPLETED" } }),
    db.deal.count({ where: { buyerId: me, status: "PENDING_PAYMENT" } }),
    db.deal.findMany({ where: { OR: [{ buyerId: me }, { sellerId: me }], status: { in: [...OPEN] } }, include: { listing: { select: { title: true } }, stages: true }, orderBy: { updatedAt: "desc" }, take: 6 }),
  ]);
  const allEarned = await db.deal.findMany({ where: { sellerId: me, status: "COMPLETED" }, select: { sellerNetAmount: true, amount: true, amountUsd: true } });
  // Net earnings normalized to USD at each deal's own rate (deals can be in different currencies).
  const toUsdNet = (d: { sellerNetAmount: number; amount: number; amountUsd: number }) => Math.round((d.sellerNetAmount * d.amountUsd) / Math.max(1, d.amount));
  const netUsd = allEarned.reduce((s, d) => s + toUsdNet(d), 0);
  const activeBids = myBidAuctions.filter((b) => b.auction.status === "LIVE").length;
  const leading = myBidAuctions.filter((b) => b.auction.status === "LIVE" && b.auction.currentBidderId === me).length;

  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(sixMonthsAgo.getFullYear(), sixMonthsAgo.getMonth() + i, 1);
    return { key: `${d.getFullYear()}-${d.getMonth()}`, label: d.toLocaleDateString("en", { month: "short" }), net: 0 };
  });
  for (const d of earned) {
    const k = `${d.completedAt!.getFullYear()}-${d.completedAt!.getMonth()}`;
    const m = months.find((x) => x.key === k);
    if (m) m.net += toUsdNet(d);
  }

  return (
    <div className="space-y-8">
      <Reveal>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-semibold text-white">{t("dash.welcome", { name: user.displayName.split(" ")[0] })}</h1>
            <p className="mt-1 text-slate-400">{t("dash.overview")}</p>
          </div>
          <LinkButton href="/sell">{t("dash.newListing")}</LinkButton>
        </div>
      </Reveal>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500">{t("dash.seller")}</h2>
        <Stagger className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StaggerItem><StatCard icon={Store} label={t("dash.activeListings")} value={active} href="/dashboard/listings" /></StaggerItem>
          <StaggerItem><StatCard icon={Eye} label={t("dash.totalViews")} value={(views._sum.viewCount ?? 0).toLocaleString()} /></StaggerItem>
          <StaggerItem><StatCard icon={Heart} label={t("dash.savedBy")} value={savedBy} /></StaggerItem>
          <StaggerItem><StatCard icon={HandCoins} label={t("dash.currentOffers")} value={offers} href="/dashboard/offers" /></StaggerItem>
          <StaggerItem><StatCard icon={Gavel} label={`${t("dash.auctionActivity")} · 7d`} value={`${auctionBids} ${t("common.bids")}`} /></StaggerItem>
          <StaggerItem><StatCard icon={PackageCheck} label={t("dash.completedSales")} value={completedSales} href="/dashboard/deals" /></StaggerItem>
          <StaggerItem><StatCard icon={Truck} label={t("dash.pendingTransfers")} value={pendingTransfers} href="/dashboard/deals" /></StaggerItem>
          <StaggerItem><StatCard icon={Wallet} label={t("dash.netEarnings")} value={formatMoney(netUsd, "USD")} href="/dashboard/payouts" /></StaggerItem>
        </Stagger>
      </section>

      <Card className="p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display font-semibold text-white">{t("dash.netEarnings")} · 6 months (USD)</h3>
        </div>
        <div className="h-56">
          {earned.length ? <MiniArea data={months.map((m) => ({ month: m.label, net: m.net }))} xKey="month" yKey="net" name={t("dash.netEarnings")} format="money-usd" /> : <div className="grid h-full place-items-center text-sm text-slate-500">{t("common.noResults")}</div>}
        </div>
      </Card>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500">{t("dash.buyer")}</h2>
        <Stagger className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <StaggerItem><StatCard icon={Heart} label={t("dash.savedBusinesses")} value={saved} href="/watchlist" /></StaggerItem>
          <StaggerItem><StatCard icon={Gavel} label={t("dash.activeBids")} value={`${activeBids}${activeBids ? ` · ${leading} ▲` : ""}`} href="/dashboard/bids" /></StaggerItem>
          <StaggerItem><StatCard icon={Gavel} label={t("dash.participated")} value={myBidAuctions.length} href="/dashboard/bids" /></StaggerItem>
          <StaggerItem><StatCard icon={Trophy} label={t("dash.won")} value={won} href="/dashboard/bids" /></StaggerItem>
          <StaggerItem><StatCard icon={PackageCheck} label={t("dash.purchases")} value={purchases} href="/dashboard/deals" /></StaggerItem>
          <StaggerItem><StatCard icon={Wallet} label={t("dash.pendingPayments")} value={pendingPay} href="/dashboard/deals" /></StaggerItem>
        </Stagger>
      </section>

      <Card className="p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display font-semibold text-white">{t("dash.transferProgress")}</h3>
          <LinkButton href="/dashboard/deals" variant="ghost" size="sm">{t("common.viewAll")} <ArrowRight className="h-4 w-4" /></LinkButton>
        </div>
        {openDeals.length === 0 ? (
          <p className="text-sm text-slate-500">{t("common.noResults")}</p>
        ) : (
          <div className="space-y-3">
            {openDeals.map((d) => {
              const done = d.stages.filter((s) => s.status === "DONE" || s.status === "SKIPPED").length;
              return (
                <Link key={d.id} href={`/dashboard/deals/${d.id}`} className="block rounded-xl bg-white/[0.03] p-4 ring-1 ring-white/5 transition hover:ring-electric/30">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate font-medium text-white">{d.listing.title}</div>
                      <div className="text-xs text-slate-500">{d.reference} · {d.buyerId === me ? "Buying" : "Selling"} · {formatMoney(d.amount, d.currency as CurrencyCode)}</div>
                    </div>
                    <DealStatusBadge status={d.status} />
                  </div>
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/5"><div className="h-full rounded-full bg-brand transition-all" style={{ width: `${(done / d.stages.length) * 100}%` }} /></div>
                </Link>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
