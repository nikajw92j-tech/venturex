import Link from "next/link";
import { db } from "@/lib/db";
import { Card } from "@/components/ui";
import { formatMoney, type CurrencyCode } from "@/lib/money";

/**
 * Heuristic signals for manual review. Nothing here takes automatic action —
 * it surfaces patterns an administrator should look at.
 */
export default async function AdminSuspicious() {
  const day = new Date(Date.now() - 86400_000);
  const week = new Date(Date.now() - 7 * 86400_000);
  const [flaggedMessages, reportedUsers, newHighBidders, failedPayments, rapidBidders, cancelledBuyers] = await Promise.all([
    db.message.findMany({ where: { flagged: true, createdAt: { gte: week } }, include: { sender: { select: { username: true, displayName: true } } }, orderBy: { createdAt: "desc" }, take: 30 }),
    db.report.groupBy({ by: ["targetId"], where: { targetType: { in: ["USER", "LISTING"] }, createdAt: { gte: week } }, _count: true, having: { targetId: { _count: { gte: 2 } } } }),
    // Accounts younger than 3 days currently leading an auction
    db.auction.findMany({ where: { status: "LIVE", currentBidder: { createdAt: { gte: new Date(Date.now() - 3 * 86400_000) } } }, include: { currentBidder: { select: { username: true, createdAt: true, emailVerifiedAt: true } }, listing: { select: { title: true, slug: true, currency: true } } } }),
    db.payment.groupBy({ by: ["userId"], where: { status: "FAILED", createdAt: { gte: week } }, _count: true, having: { userId: { _count: { gte: 3 } } } }),
    db.bid.groupBy({ by: ["bidderId"], where: { createdAt: { gte: day }, isAuto: false }, _count: true, having: { bidderId: { _count: { gte: 40 } } } }),
    // Buyers who repeatedly win/commit and then don't pay
    db.deal.groupBy({ by: ["buyerId"], where: { status: "CANCELLED", paidAt: null, createdAt: { gte: new Date(Date.now() - 30 * 86400_000) } }, _count: true, having: { buyerId: { _count: { gte: 2 } } } }),
  ]);
  const userIds = [...failedPayments.map((f) => f.userId), ...rapidBidders.map((r) => r.bidderId), ...cancelledBuyers.map((c) => c.buyerId)];
  const users = await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, username: true, displayName: true } });
  const name = (id: string) => users.find((u) => u.id === id);

  const Section = ({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) => (
    <Card className="p-5">
      <h2 className="font-display font-semibold text-white">{title}</h2>
      <p className="mb-3 text-xs text-slate-500">{hint}</p>
      {children}
    </Card>
  );
  const UserRow = ({ id, extra }: { id: string; extra: string }) => {
    const u = name(id);
    return <div className="flex justify-between border-t border-white/5 py-2 text-sm"><Link href={u ? `/admin/users?q=${u.username}` : "#"} className="text-white hover:underline">{u?.displayName ?? id}</Link><span className="text-slate-400">{extra}</span></div>;
  };

  return (
    <div className="space-y-5">
      <h1 className="font-display text-3xl font-semibold text-white">Suspicious activity</h1>
      <Section title="Flagged messages (7 days)" hint="Messages matching off-platform payment or link-spam patterns.">
        {flaggedMessages.length === 0 ? <p className="text-sm text-slate-500">None</p> : flaggedMessages.map((m) => <div key={m.id} className="border-t border-white/5 py-2 text-sm"><Link href={`/admin/users?q=${m.sender.username}`} className="font-medium text-white hover:underline">{m.sender.displayName}</Link> <span className="text-slate-400">— {m.body.slice(0, 160)}</span></div>)}
      </Section>
      <Section title="New accounts leading auctions" hint="Accounts under 3 days old that currently hold the top bid — possible shill or non-paying bidders.">
        {newHighBidders.length === 0 ? <p className="text-sm text-slate-500">None</p> : newHighBidders.map((a) => <div key={a.id} className="flex justify-between border-t border-white/5 py-2 text-sm"><span className="text-white">@{a.currentBidder?.username} {!a.currentBidder?.emailVerifiedAt && "(unverified)"}</span><Link href={`/listing/${a.listing.slug}`} className="text-slate-400 hover:underline">{a.listing.title} · {formatMoney(a.currentBid ?? 0, a.listing.currency as CurrencyCode)}</Link></div>)}
      </Section>
      <div className="grid gap-5 lg:grid-cols-3">
        <Section title="Rapid manual bidding" hint="40+ manual bids in 24 hours.">{rapidBidders.length === 0 ? <p className="text-sm text-slate-500">None</p> : rapidBidders.map((r) => <UserRow key={r.bidderId} id={r.bidderId} extra={`${r._count} bids`} />)}</Section>
        <Section title="Repeated failed payments" hint="3+ failed payments in 7 days.">{failedPayments.length === 0 ? <p className="text-sm text-slate-500">None</p> : failedPayments.map((f) => <UserRow key={f.userId} id={f.userId} extra={`${f._count} failures`} />)}</Section>
        <Section title="Non-paying buyers" hint="2+ unpaid cancelled purchases in 30 days.">{cancelledBuyers.length === 0 ? <p className="text-sm text-slate-500">None</p> : cancelledBuyers.map((c) => <UserRow key={c.buyerId} id={c.buyerId} extra={`${c._count} unpaid`} />)}</Section>
      </div>
      <Section title="Multiple reports (7 days)" hint="Users or listings reported 2+ times — see Reports.">
        {reportedUsers.length === 0 ? <p className="text-sm text-slate-500">None</p> : <Link href="/admin/reports" className="text-sm text-electric-400 hover:underline">{reportedUsers.length} targets with multiple reports →</Link>}
      </Section>
    </div>
  );
}
