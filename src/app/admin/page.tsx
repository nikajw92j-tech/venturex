import Link from "next/link";
import { db } from "@/lib/db";
import { getRates } from "@/lib/rates";
import { toUsd, formatMoney, type CurrencyCode } from "@/lib/money";
import { Card } from "@/components/ui";
import { MiniArea } from "@/components/charts";
import { cn } from "@/lib/utils";

const RANGES = { "30d": 30, "90d": 90, "365d": 365, all: null } as const;

export default async function AdminAnalytics({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const sp = await searchParams;
  const key = (sp.range && sp.range in RANGES ? sp.range : "90d") as keyof typeof RANGES;
  const days = RANGES[key];
  const since = days ? new Date(Date.now() - days * 86400_000) : new Date(0);
  const { rates } = await getRates();

  const [completed, earned, pending, reversed, refunded, otherPayments, monthly, users, listings, liveAuctions] = await Promise.all([
    db.deal.aggregate({ where: { status: "COMPLETED", completedAt: { gte: since } }, _sum: { amountUsd: true }, _count: true }),
    db.commission.aggregate({ where: { status: "EARNED", earnedAt: { gte: since } }, _sum: { amountUsd: true }, _count: true }),
    // Pending ≠ revenue: commission on transactions that haven't completed yet.
    db.commission.aggregate({ where: { status: "PENDING", deal: { status: { in: ["PAID", "IN_TRANSFER", "BUYER_REVIEW", "RELEASE_PENDING", "DISPUTED"] } } }, _sum: { amountUsd: true }, _count: true }),
    db.commission.aggregate({ where: { status: "REVERSED", reversedAt: { gte: since }, deal: { paidAt: { not: null } } }, _sum: { amountUsd: true }, _count: true }),
    db.deal.aggregate({ where: { status: "REFUNDED", cancelledAt: { gte: since } }, _sum: { amountUsd: true }, _count: true }),
    db.payment.findMany({ where: { status: "SUCCEEDED", purpose: { in: ["PROMOTION", "SUBSCRIPTION"] }, updatedAt: { gte: since } }, select: { purpose: true, amount: true, currency: true, refundedAmount: true } }),
    db.$queryRaw<{ month: Date; total: bigint }[]>`
      SELECT date_trunc('month', "earnedAt") AS month, SUM("amountUsd")::bigint AS total
      FROM "Commission" WHERE "status" = 'EARNED' AND "earnedAt" >= NOW() - INTERVAL '12 months'
      GROUP BY 1 ORDER BY 1`,
    db.user.count(),
    db.listing.count({ where: { status: "ACTIVE" } }),
    db.auction.count({ where: { status: "LIVE", endsAt: { gt: new Date() } } }),
  ]);
  const promoUsd = otherPayments.filter((p) => p.purpose === "PROMOTION").reduce((s, p) => s + toUsd(p.amount - p.refundedAmount, p.currency as CurrencyCode, rates), 0);
  const subUsd = otherPayments.filter((p) => p.purpose === "SUBSCRIPTION").reduce((s, p) => s + toUsd(p.amount - p.refundedAmount, p.currency as CurrencyCode, rates), 0);
  const usd = (n: number | null | undefined) => formatMoney(n ?? 0, "USD");

  const months: { month: string; commission: number }[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(new Date().getFullYear(), new Date().getMonth() - i, 1);
    const row = monthly.find((m) => m.month.getUTCFullYear() === d.getFullYear() && m.month.getUTCMonth() === d.getMonth());
    months.push({ month: d.toLocaleDateString("en", { month: "short", year: "2-digit" }), commission: Number(row?.total ?? 0) });
  }

  const tiles = [
    { label: "Gross marketplace sales", value: usd(completed._sum.amountUsd), hint: `${completed._count} completed transactions` },
    { label: "Platform commission revenue", value: usd(earned._sum.amountUsd), hint: "Earned on completed sales only", accent: true },
    { label: "Pending commissions", value: usd(pending._sum.amountUsd), hint: `${pending._count} paid deals in handover — not revenue yet` },
    { label: "Refunds & reversals", value: usd(refunded._sum.amountUsd), hint: `${refunded._count} refunded deals · ${reversed._count} commissions reversed` },
    { label: "Completed transactions", value: completed._count.toLocaleString(), hint: "In selected range" },
    { label: "Average sale value", value: usd(completed._count ? Math.round((completed._sum.amountUsd ?? 0) / completed._count) : 0) },
    { label: "Promotion revenue (≈ USD)", value: usd(promoUsd), hint: "Verified payments, net of refunds" },
    { label: "Subscription revenue (≈ USD)", value: usd(subUsd), hint: "Verified payments, net of refunds" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold text-white">Financial analytics</h1>
          <p className="mt-1 text-sm text-slate-400">{users} users · {listings} live listings · {liveAuctions} live auctions. All amounts normalized to USD at transaction time.</p>
        </div>
        <div className="flex gap-1 rounded-xl bg-white/5 p-1">
          {(Object.keys(RANGES) as (keyof typeof RANGES)[]).map((r) => (
            <Link key={r} href={`/admin?range=${r}`} className={cn("rounded-lg px-3 py-1.5 text-xs font-semibold transition", r === key ? "bg-brand text-white" : "text-slate-400 hover:text-white")}>{r}</Link>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {tiles.map((t) => (
          <Card key={t.label} className={cn("p-5", t.accent && "border-violet/40")}>
            <div className="text-xs font-medium uppercase tracking-wider text-slate-400">{t.label}</div>
            <div className={cn("mt-2 font-display text-2xl font-semibold", t.accent ? "text-gradient" : "text-white")}>{t.value}</div>
            {t.hint && <div className="mt-1 text-xs text-slate-500">{t.hint}</div>}
          </Card>
        ))}
      </div>
      <Card className="p-6">
        <h2 className="mb-4 font-display font-semibold text-white">Commission revenue by month (earned, USD)</h2>
        <div className="h-72"><MiniArea data={months} xKey="month" yKey="commission" name="Commission earned" format="money-usd" /></div>
      </Card>
    </div>
  );
}
