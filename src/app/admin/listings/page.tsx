import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { Badge, Card } from "@/components/ui";
import { ListingStatusBadge } from "@/components/dashboard/status";
import { ActionButton, AdminSearch } from "@/components/admin/ui";
import { approveListingAdmin, deleteListingAdmin, rejectListingAdmin, removeListingAdmin, setFeaturedAdmin, setListingVerificationAdmin } from "@/app/actions/admin";
import { formatMoney, type CurrencyCode } from "@/lib/money";
import { categoryLabel } from "@/lib/categories";
import { cn } from "@/lib/utils";

const TABS = ["PENDING_REVIEW", "ACTIVE", "PENDING_SALE", "DRAFT", "EXPIRED", "WITHDRAWN", "REJECTED", "REMOVED", "SOLD", "ALL"] as const;

export default async function AdminListings({ searchParams }: { searchParams: Promise<{ status?: string; q?: string }> }) {
  const sp = await searchParams;
  const status = (TABS as readonly string[]).includes(sp.status ?? "") ? (sp.status as (typeof TABS)[number]) : sp.q ? "ALL" : "PENDING_REVIEW";
  const where: Prisma.ListingWhereInput = { ...(status === "ALL" ? {} : { status }), ...(sp.q ? { OR: [{ title: { contains: sp.q, mode: "insensitive" } }, { seller: { email: { contains: sp.q, mode: "insensitive" } } }] } : {}) };
  const rows = await db.listing.findMany({
    where,
    include: {
      seller: { select: { displayName: true, email: true, identityVerified: true, subscription: { select: { status: true, plan: { select: { priorityReview: true, name: true } } } }, _count: { select: { reports: true } } } },
      auction: { select: { startingBid: true, currentBid: true, reservePrice: true, bidCount: true, status: true, endsAt: true } },
      _count: { select: { deals: true } },
      media: { where: { kind: { in: ["REVENUE_EVIDENCE", "TRAFFIC_EVIDENCE", "DOCUMENT"] } }, select: { fileId: true, kind: true, file: { select: { filename: true } } } },
    },
    orderBy: [{ updatedAt: "asc" }],
    take: 100,
  });
  // Faster review for Pro/Business sellers.
  if (status === "PENDING_REVIEW") rows.sort((a, b) => Number(Boolean(b.seller.subscription?.status === "ACTIVE" && b.seller.subscription.plan.priorityReview)) - Number(Boolean(a.seller.subscription?.status === "ACTIVE" && a.seller.subscription.plan.priorityReview)));
  const byStatus = await db.listing.groupBy({ by: ["status"], _count: true });
  const counts: Record<string, number> = Object.fromEntries(byStatus.map((g) => [g.status, g._count]));
  counts.ALL = byStatus.reduce((n, g) => n + g._count, 0);
  const reportCounts = await db.report.groupBy({ by: ["targetId"], where: { targetType: "LISTING", targetId: { in: rows.map((r) => r.id) }, status: "OPEN" }, _count: true });

  return (
    <div className="space-y-5">
      <h1 className="font-display text-3xl font-semibold text-white">Listings</h1>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-1 rounded-xl bg-white/5 p-1">
          {TABS.map((t) => <Link key={t} href={`/admin/listings?status=${t}`} className={cn("rounded-lg px-3 py-1.5 text-xs font-semibold", t === status ? "bg-brand text-white" : "text-slate-400 hover:text-white")}>{t.replace("_", " ").toLowerCase()}{counts[t] ? ` (${counts[t]})` : ""}</Link>)}
        </div>
        <AdminSearch placeholder="Search title or seller email" />
      </div>
      {rows.length === 0 && <p className="glass rounded-2xl p-8 text-center text-sm text-slate-500">Nothing here.</p>}
      <div className="space-y-3">
        {rows.map((l) => {
          const price = l.saleType === "AUCTION" && l.auction ? (l.auction.currentBid ?? l.auction.startingBid) : (l.askingPrice ?? 0);
          const c = l.currency as CurrencyCode;
          const priority = l.seller.subscription?.status === "ACTIVE" && l.seller.subscription.plan.priorityReview;
          const reports = reportCounts.find((r) => r.targetId === l.id)?._count ?? 0;
          return (
            <Card key={l.id} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/listing/${l.slug}`} target="_blank" className="font-semibold text-white hover:underline">{l.title}</Link>
                    <ListingStatusBadge status={l.status} />
                    {priority && <Badge tone="violet">Priority review · {l.seller.subscription!.plan.name}</Badge>}
                    {l.market === "STARTER" && <Badge tone="cyan">Starter</Badge>}
                    {l.featured && <Badge tone="gold">Featured #{l.featuredRank}</Badge>}
                    {reports > 0 && <Badge tone="red">{reports} open reports</Badge>}
                  </div>
                  <div className="mt-1 text-sm text-slate-400">{categoryLabel(l.category)} · {l.saleType === "AUCTION" ? `Auction from ${formatMoney(price, c)}${l.auction?.reservePrice ? ` · reserve ${formatMoney(l.auction.reservePrice, c)}` : ""}` : formatMoney(price, c)} · revenue {formatMoney(l.monthlyRevenue, c)}/mo · profit {formatMoney(l.monthlyProfit, c)}/mo</div>
                  <div className="text-xs text-slate-500">{l.seller.displayName} ({l.seller.email}) {l.seller.identityVerified && "· ID verified"} · updated {l.updatedAt.toLocaleString()}</div>
                  {l.media.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">{l.media.map((m) => <a key={m.fileId} href={`/api/files/${m.fileId}`} target="_blank" className="rounded-md bg-white/5 px-2 py-0.5 text-xs text-electric-400 ring-1 ring-white/10 hover:underline">{m.kind.toLowerCase()}: {m.file.filename}</a>)}</div>
                  )}
                  {l.rejectionReason && <div className="mt-2 text-xs text-red-300">{l.rejectionReason}</div>}
                </div>
                <div className="flex flex-wrap gap-2">
                  {l.status === "PENDING_REVIEW" && (
                    <>
                      <ActionButton label="Approve" variant="primary" action={approveListingAdmin.bind(null, l.id)} success="Listing is live" />
                      <ActionButton label="Reject" variant="danger" prompt promptLabel="What should the seller change?" action={rejectListingAdmin.bind(null, l.id)} />
                    </>
                  )}
                  {l.status === "ACTIVE" && (
                    <>
                      <ActionButton label={l.featured ? "Unfeature" : "Feature on homepage"} variant="gold" action={setFeaturedAdmin.bind(null, l.id, !l.featured, 10)} />
                      <ActionButton label={l.financialsVerified ? "Unverify financials" : "Mark financials verified"} action={setListingVerificationAdmin.bind(null, l.id, "financialsVerified", !l.financialsVerified)} />
                      <ActionButton label={l.trafficVerified ? "Unverify traffic" : "Mark traffic verified"} action={setListingVerificationAdmin.bind(null, l.id, "trafficVerified", !l.trafficVerified)} />
                    </>
                  )}
                  {!["REMOVED", "SOLD"].includes(l.status) && <ActionButton label="Remove (fraud/policy)" variant="danger" prompt confirm="The listing is taken down, its auction cancelled and the seller notified." action={removeListingAdmin.bind(null, l.id)} />}
                  {l.saleType === "AUCTION" && <Link href="/admin/auctions" className="rounded-lg bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-200 ring-1 ring-white/10 hover:bg-white/10">{l.auction?.status === "LIVE" && !l.auction.endsAt ? "Start auction →" : "Manage auction →"}</Link>}
                  {l._count.deals === 0 && <ActionButton label="Delete permanently" variant="danger" confirm="Deletes the listing, its auction, bids, offers and files for good. This can't be undone." action={deleteListingAdmin.bind(null, l.id)} success="Listing deleted" />}
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
