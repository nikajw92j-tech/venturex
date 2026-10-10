import { db } from "@/lib/db";
import { getTiers } from "@/lib/deals";
import { Card } from "@/components/ui";
import { CommissionEditor } from "@/components/admin/editors";
import { GenericBadge } from "@/components/dashboard/status";
import { formatMoney, type CurrencyCode } from "@/lib/money";

export default async function AdminCommissions() {
  const [tiers, recent] = await Promise.all([
    getTiers(),
    db.commission.findMany({ include: { deal: { select: { reference: true, amount: true, listing: { select: { title: true } } } } }, orderBy: { createdAt: "desc" }, take: 40 }),
  ]);
  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl font-semibold text-white">Platform commission</h1>
      <Card className="p-6"><CommissionEditor initial={tiers} /></Card>
      <Card className="overflow-hidden">
        <div className="border-b border-white/5 px-5 py-3 font-semibold text-white">Commission ledger</div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-slate-500"><tr><th className="px-4 py-2">Deal</th><th className="px-4 py-2 text-right">Sale</th><th className="px-4 py-2 text-right">Rate</th><th className="px-4 py-2 text-right">Commission</th><th className="px-4 py-2">Status</th></tr></thead>
            <tbody>
              {recent.map((c) => (
                <tr key={c.id} className="border-t border-white/5">
                  <td className="px-4 py-2.5"><span className="font-mono text-xs text-slate-400">{c.deal.reference}</span> <span className="text-white">{c.deal.listing.title}</span></td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-300">{formatMoney(c.deal.amount, c.currency as CurrencyCode)}</td>
                  <td className="px-4 py-2.5 text-right text-slate-300">{c.rateBps / 100}%</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-white">{formatMoney(c.amount, c.currency as CurrencyCode, { cents: true })}</td>
                  <td className="px-4 py-2.5"><GenericBadge status={c.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
