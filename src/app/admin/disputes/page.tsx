import Link from "next/link";
import { db } from "@/lib/db";
import { Card } from "@/components/ui";
import { GenericBadge } from "@/components/dashboard/status";
import { ActionButton } from "@/components/admin/ui";
import { resolveDisputeAdmin } from "@/app/actions/admin";
import { disputeMessageAction } from "@/app/actions/trade";
import { formatMoney, type CurrencyCode } from "@/lib/money";

export default async function AdminDisputes() {
  const disputes = await db.dispute.findMany({
    where: { status: { in: ["OPEN", "UNDER_REVIEW"] } },
    include: {
      openedBy: { select: { displayName: true, id: true } },
      deal: { include: { listing: { select: { title: true } }, buyer: { select: { displayName: true } }, seller: { select: { displayName: true } }, checklist: true } },
      messages: { include: { author: { select: { displayName: true } }, file: { select: { id: true, filename: true } } }, orderBy: { createdAt: "asc" } },
    },
    orderBy: { createdAt: "asc" },
  });
  const closed = await db.dispute.findMany({ where: { status: { notIn: ["OPEN", "UNDER_REVIEW"] } }, include: { deal: { select: { reference: true, listing: { select: { title: true } } } } }, orderBy: { resolvedAt: "desc" }, take: 20 });

  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl font-semibold text-white">Disputes</h1>
      {disputes.length === 0 && <p className="glass rounded-2xl p-8 text-center text-sm text-slate-500">No open disputes.</p>}
      {disputes.map((d) => {
        const deal = d.deal;
        const c = deal.currency as CurrencyCode;
        return (
          <Card key={d.id} className="p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2"><Link href={`/dashboard/deals/${deal.id}`} className="font-mono text-electric-400 hover:underline">{deal.reference}</Link><GenericBadge status={d.status} /></div>
                <div className="mt-1 font-semibold text-white">{deal.listing.title} · {formatMoney(deal.amount, c)}</div>
                <div className="text-sm text-slate-400">Opened by {d.openedBy.displayName} ({d.openedBy.id === deal.buyerId ? "buyer" : "seller"}) · {d.reason} · {d.createdAt.toLocaleString()}</div>
                <p className="mt-3 max-w-3xl whitespace-pre-line text-sm text-slate-300">{d.description}</p>
                <div className="mt-3 text-xs text-slate-500">Checklist: {deal.checklist.filter((i) => i.sellerDone).length}/{deal.checklist.length} delivered · {deal.checklist.filter((i) => i.buyerVerified).length}/{deal.checklist.length} verified by buyer</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <ActionButton label="Refund buyer" variant="danger" prompt promptLabel="Decision and reasoning (shared with both parties)" confirm="Refunds the buyer via the payment provider, reverses the commission and withdraws the listing." action={resolveDisputeAdmin.bind(null, d.id, "BUYER")} />
                <ActionButton label="Release to seller" variant="primary" prompt promptLabel="Decision and reasoning (shared with both parties)" confirm="Records the handover as confirmed and approves the release of funds to the seller." action={resolveDisputeAdmin.bind(null, d.id, "SELLER")} />
                <ActionButton label="Message parties" prompt promptLabel="Message visible to buyer and seller" action={disputeMessageAction.bind(null, d.id)} />
              </div>
            </div>
            {d.messages.length > 0 && (
              <div className="mt-4 space-y-2 border-t border-white/5 pt-4">
                {d.messages.map((m) => (
                  <div key={m.id} className="rounded-lg bg-white/[0.03] px-3 py-2 text-sm">
                    <span className="text-xs text-slate-500">{m.author.displayName} · {m.createdAt.toLocaleString()}</span>
                    <div className="whitespace-pre-line text-slate-200">{m.body}</div>
                    {m.file && <a href={`/api/files/${m.file.id}`} target="_blank" className="text-xs text-electric-400">{m.file.filename}</a>}
                  </div>
                ))}
              </div>
            )}
          </Card>
        );
      })}
      {closed.length > 0 && (
        <Card className="p-5">
          <div className="mb-3 font-semibold text-white">Recently resolved</div>
          {closed.map((d) => <div key={d.id} className="flex justify-between border-t border-white/5 py-2 text-sm"><span className="text-slate-300">{d.deal.reference} · {d.deal.listing.title}</span><GenericBadge status={d.status} /></div>)}
        </Card>
      )}
    </div>
  );
}
