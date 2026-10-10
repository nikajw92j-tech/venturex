import Link from "next/link";
import type { DealStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { escrowConfigured } from "@/lib/payments/escrow";
import { Badge, Card } from "@/components/ui";
import { DealStatusBadge } from "@/components/dashboard/status";
import { ActionButton } from "@/components/admin/ui";
import { approveReleaseAdmin, cancelDealAdmin, recordEscrowAdmin } from "@/app/actions/admin";
import { formatMoney, type CurrencyCode } from "@/lib/money";
import { cn } from "@/lib/utils";

const FILTERS = ["attention", "PENDING_PAYMENT", "PAID", "IN_TRANSFER", "BUYER_REVIEW", "RELEASE_PENDING", "DISPUTED", "COMPLETED", "CANCELLED", "REFUNDED"] as const;

export default async function AdminTransactions({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const sp = await searchParams;
  const filter = (FILTERS as readonly string[]).includes(sp.status ?? "") ? sp.status! : "attention";
  const settings = await getSettings();
  const deals = await db.deal.findMany({
    where:
      filter === "attention"
        ? { OR: [{ status: "RELEASE_PENDING" }, { status: "DISPUTED" }, { payoutStatus: "FAILED" }, { escrowRequired: true, status: "PENDING_PAYMENT" }] }
        : { status: filter as DealStatus },
    include: { listing: { select: { title: true } }, buyer: { select: { displayName: true, email: true } }, seller: { select: { displayName: true, email: true, payoutsEnabled: true } }, commission: true },
    orderBy: { updatedAt: "desc" },
    take: 100,
  });
  const manualEscrow = !escrowConfigured();

  return (
    <div className="space-y-5">
      <h1 className="font-display text-3xl font-semibold text-white">Transactions</h1>
      <div className="flex flex-wrap gap-1 rounded-xl bg-white/5 p-1">
        {FILTERS.map((f) => <Link key={f} href={`/admin/transactions?status=${f}`} className={cn("rounded-lg px-3 py-1.5 text-xs font-semibold", f === filter ? "bg-brand text-white" : "text-slate-400 hover:text-white")}>{f.replace(/_/g, " ").toLowerCase()}</Link>)}
      </div>
      {deals.length === 0 && <p className="glass rounded-2xl p-8 text-center text-sm text-slate-500">Nothing needs attention.</p>}
      <div className="space-y-3">
        {deals.map((d) => {
          const c = d.currency as CurrencyCode;
          const needsAdmin = d.status === "RELEASE_PENDING" && !d.releaseApprovedAt && !d.escrowRequired && d.amountUsd >= settings.adminReleaseThresholdUsd;
          return (
            <Card key={d.id} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/dashboard/deals/${d.id}`} className="font-mono text-electric-400 hover:underline">{d.reference}</Link>
                    <span className="font-medium text-white">{d.listing.title}</span>
                    <DealStatusBadge status={d.status} />
                    {d.escrowRequired && <Badge tone="cyan">escrow {d.escrowStatus ?? ""}</Badge>}
                    {d.payoutStatus !== "NOT_STARTED" && <Badge tone={d.payoutStatus === "FAILED" ? "red" : "neutral"}>payout {d.payoutStatus.replace(/_/g, " ").toLowerCase()}</Badge>}
                  </div>
                  <div className="mt-1 text-sm text-slate-400">{formatMoney(d.amount, c, { cents: true })} · commission {d.commissionRateBps / 100}% = {formatMoney(d.commissionAmount, c, { cents: true })} ({d.commission?.status.toLowerCase()}) · seller net {formatMoney(d.sellerNetAmount, c, { cents: true })}</div>
                  <div className="text-xs text-slate-500">Buyer {d.buyer.displayName} ({d.buyer.email}) · Seller {d.seller.displayName} ({d.seller.email}) {d.seller.payoutsEnabled ? "· payouts ready" : "· payouts not connected"}</div>
                  <div className="text-xs text-slate-500">Paid {d.paidAt?.toLocaleString() ?? "—"} · buyer confirmed {d.buyerConfirmedAt ? "✓" : "—"} · seller confirmed {d.sellerConfirmedAt ? "✓" : "—"}</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {needsAdmin && <ActionButton label="Approve release" variant="primary" confirm="Approves the payout to the seller. Payment is verified and both parties confirmed the handover. This is recorded in the audit log." action={approveReleaseAdmin.bind(null, d.id)} success="Release approved" />}
                  {d.status === "RELEASE_PENDING" && d.releaseApprovedAt && d.payoutStatus === "FAILED" && <ActionButton label="Retry payout" action={approveReleaseAdmin.bind(null, d.id)} />}
                  {manualEscrow && d.escrowRequired && d.status === "PENDING_PAYMENT" && <ActionButton label="Record escrow funded" prompt promptLabel="Escrow transaction reference (verified with the escrow provider)" action={recordEscrowAdmin.bind(null, d.id, "funded")} />}
                  {manualEscrow && d.escrowRequired && d.status === "RELEASE_PENDING" && <ActionButton label="Record escrow released" prompt promptLabel="Escrow release reference" action={recordEscrowAdmin.bind(null, d.id, "released")} />}
                  {d.status === "PENDING_PAYMENT" && <ActionButton label="Cancel" variant="danger" prompt action={cancelDealAdmin.bind(null, d.id)} />}
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
