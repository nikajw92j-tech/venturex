import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { getI18n } from "@/i18n/server";
import { Card, EmptyState, LinkButton } from "@/components/ui";
import { DealStatusBadge } from "@/components/dashboard/status";
import { formatMoney, type CurrencyCode } from "@/lib/money";

export default async function DealsPage() {
  const user = await requireUser("/dashboard/deals");
  const { t, locale } = await getI18n();
  const deals = await db.deal.findMany({
    where: { OR: [{ buyerId: user.id }, { sellerId: user.id }] },
    include: { listing: { select: { title: true, slug: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return (
    <div>
      <h1 className="mb-6 font-display text-3xl font-semibold text-white">{t("dash.history")}</h1>
      {deals.length === 0 ? (
        <EmptyState title={t("common.noResults")} action={<LinkButton href="/marketplace">{t("nav.marketplace")}</LinkButton>} />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-white/[0.03] text-left text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-3">Reference</th>
                  <th className="px-4 py-3">Business</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3 text-right">{t("common.amount")}</th>
                  <th className="px-4 py-3 text-right">Commission / Net</th>
                  <th className="px-4 py-3">{t("common.status")}</th>
                  <th className="px-4 py-3">{t("common.date")}</th>
                </tr>
              </thead>
              <tbody>
                {deals.map((d) => {
                  const c = d.currency as CurrencyCode;
                  const selling = d.sellerId === user.id;
                  return (
                    <tr key={d.id} className="border-t border-white/5 transition hover:bg-white/[0.02]">
                      <td className="px-4 py-3"><Link href={`/dashboard/deals/${d.id}`} className="font-mono text-electric-400 hover:underline">{d.reference}</Link></td>
                      <td className="max-w-56 truncate px-4 py-3 text-white">{d.listing.title}</td>
                      <td className="px-4 py-3 text-slate-400">{selling ? "Seller" : "Buyer"}</td>
                      <td className="px-4 py-3 text-right font-semibold text-white tabular-nums">{formatMoney(d.amount, c, { locale })}</td>
                      <td className="px-4 py-3 text-right text-slate-400 tabular-nums">{selling ? `−${formatMoney(d.commissionAmount, c, { locale, cents: true })} / ${formatMoney(d.sellerNetAmount, c, { locale, cents: true })}` : "—"}</td>
                      <td className="px-4 py-3"><DealStatusBadge status={d.status} /></td>
                      <td className="px-4 py-3 text-slate-500">{d.createdAt.toLocaleDateString(locale)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
