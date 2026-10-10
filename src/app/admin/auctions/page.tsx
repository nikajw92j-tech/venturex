import Link from "next/link";
import { db } from "@/lib/db";
import { Badge, Card } from "@/components/ui";
import { ActionButton } from "@/components/admin/ui";
import { InlineCountdown } from "@/components/countdown";
import { cancelAuctionAdmin, settleAuctionAdmin } from "@/app/actions/admin";
import { formatMoney, type CurrencyCode } from "@/lib/money";

export default async function AdminAuctions() {
  const [live, recent] = await Promise.all([
    db.auction.findMany({ where: { status: "LIVE", endsAt: { not: null } }, include: { listing: { select: { title: true, slug: true, currency: true, status: true, seller: { select: { displayName: true } } } }, currentBidder: { select: { username: true } } }, orderBy: { endsAt: "asc" } }),
    db.auction.findMany({ where: { status: { in: ["ENDED", "CANCELLED"] } }, include: { listing: { select: { title: true, slug: true, currency: true } }, winner: { select: { username: true } } }, orderBy: { endedAt: "desc" }, take: 30 }),
  ]);
  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl font-semibold text-white">Auctions</h1>
      <Card className="overflow-hidden">
        <div className="border-b border-white/5 px-5 py-3 font-semibold text-white">Live ({live.length})</div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-slate-500"><tr><th className="px-4 py-2">Listing</th><th className="px-4 py-2 text-right">Current</th><th className="px-4 py-2">Bids</th><th className="px-4 py-2">Leader</th><th className="px-4 py-2">Ends</th><th className="px-4 py-2" /></tr></thead>
            <tbody>
              {live.map((a) => {
                const c = a.listing.currency as CurrencyCode;
                const overdue = a.endsAt! <= new Date();
                return (
                  <tr key={a.id} className="border-t border-white/5">
                    <td className="px-4 py-3"><Link href={`/listing/${a.listing.slug}`} className="text-white hover:underline">{a.listing.title}</Link><div className="text-xs text-slate-500">{a.listing.seller.displayName} {a.listing.status !== "ACTIVE" && `· listing ${a.listing.status.toLowerCase()}`}</div></td>
                    <td className="px-4 py-3 text-right tabular-nums text-white">{formatMoney(a.currentBid ?? a.startingBid, c)}{a.reservePrice !== null && <div className="text-xs text-slate-500">{a.reserveMet ? "reserve met" : `reserve ${formatMoney(a.reservePrice, c)}`}</div>}</td>
                    <td className="px-4 py-3 text-slate-300">{a.bidCount}{a.extensions > 0 && <span className="text-xs text-amber-300"> · +{a.extensions} ext</span>}</td>
                    <td className="px-4 py-3 text-slate-300">{a.currentBidder?.username ?? "—"}</td>
                    <td className="px-4 py-3">{overdue ? <Badge tone="amber">awaiting settlement</Badge> : <InlineCountdown endsAt={a.endsAt!.toISOString()} />}</td>
                    <td className="px-4 py-3"><div className="flex justify-end gap-1.5">{overdue && <ActionButton label="Settle now" variant="primary" action={settleAuctionAdmin.bind(null, a.id)} />}<ActionButton label="Cancel" variant="danger" prompt confirm="Cancels the auction; bidders and the seller are notified." action={cancelAuctionAdmin.bind(null, a.id)} /></div></td>
                  </tr>
                );
              })}
              {live.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-500">No live auctions</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
      <Card className="overflow-hidden">
        <div className="border-b border-white/5 px-5 py-3 font-semibold text-white">Recently ended</div>
        <table className="w-full text-sm">
          <tbody>
            {recent.map((a) => (
              <tr key={a.id} className="border-t border-white/5">
                <td className="px-4 py-2.5"><Link href={`/listing/${a.listing.slug}`} className="text-white hover:underline">{a.listing.title}</Link></td>
                <td className="px-4 py-2.5"><Badge tone={a.status === "CANCELLED" ? "red" : a.winnerId ? "green" : "neutral"}>{a.status === "CANCELLED" ? "cancelled" : a.winnerId ? "sold" : "no sale"}</Badge></td>
                <td className="px-4 py-2.5 text-right tabular-nums text-slate-300">{a.currentBid ? formatMoney(a.currentBid, a.listing.currency as CurrencyCode) : "—"}</td>
                <td className="px-4 py-2.5 text-slate-400">{a.winner?.username ?? ""}</td>
                <td className="px-4 py-2.5 text-xs text-slate-500">{a.endedAt?.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
