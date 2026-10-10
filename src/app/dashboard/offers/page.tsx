import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { getI18n } from "@/i18n/server";
import { Card, EmptyState } from "@/components/ui";
import { GenericBadge } from "@/components/dashboard/status";
import { OfferResponse } from "@/components/dashboard/listing-actions";
import { formatMoney, type CurrencyCode } from "@/lib/money";
import { timeAgo } from "@/lib/utils";

export default async function OffersPage() {
  const user = await requireUser("/dashboard/offers");
  const { t, locale } = await getI18n();
  const offers = await db.offer.findMany({
    where: { OR: [{ sellerId: user.id }, { buyerId: user.id }] },
    include: { listing: { select: { title: true, slug: true, askingPrice: true, currency: true } }, buyer: { select: { displayName: true } }, seller: { select: { displayName: true } }, deal: { select: { id: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  const Section = ({ title, items }: { title: string; items: typeof offers }) => (
    <section>
      <h2 className="mb-3 font-display text-lg font-semibold text-white">{title}</h2>
      {items.length === 0 ? <p className="glass rounded-2xl p-6 text-sm text-slate-500">{t("common.noResults")}</p> : (
        <div className="space-y-3">
          {items.map((o) => {
            const maker = o.fromSeller ? o.sellerId : o.buyerId;
            const open = o.status === "PENDING" && o.expiresAt > new Date();
            const c = o.currency as CurrencyCode;
            const pct = o.listing.askingPrice ? Math.round((o.amount / o.listing.askingPrice) * 100) : null;
            return (
              <Card key={o.id} className="flex flex-wrap items-center justify-between gap-4 p-4">
                <div className="min-w-0">
                  <Link href={`/listing/${o.listing.slug}`} className="font-medium text-white hover:underline">{o.listing.title}</Link>
                  <div className="mt-0.5 text-sm text-slate-400">
                    {o.fromSeller ? "Counter-offer from seller" : `Offer from ${o.buyer.displayName}`} · <span className="font-semibold text-white">{formatMoney(o.amount, c, { locale })}</span>
                    {pct !== null && <span className="text-slate-500"> ({pct}% of asking)</span>}
                  </div>
                  {o.message && <div className="mt-1 max-w-xl truncate text-sm text-slate-500">“{o.message}”</div>}
                  <div className="mt-1 text-xs text-slate-600">{timeAgo(o.createdAt, locale)}{open && ` · expires ${timeAgo(o.expiresAt, locale)}`}</div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <GenericBadge status={open || o.status !== "PENDING" ? o.status : "EXPIRED"} />
                  {o.deal && <Link href={`/dashboard/deals/${o.deal.id}`} className="text-xs text-electric-400 hover:underline">View transaction →</Link>}
                  {open && <OfferResponse id={o.id} currency={c} canRespond={maker !== user.id} canWithdraw={maker === user.id} />}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </section>
  );
  if (!offers.length) return (<div><h1 className="mb-6 font-display text-3xl font-semibold text-white">{t("dash.offers")}</h1><EmptyState title={t("common.noResults")} /></div>);
  return (
    <div className="space-y-10">
      <h1 className="font-display text-3xl font-semibold text-white">{t("dash.offers")}</h1>
      <Section title="Received on my listings" items={offers.filter((o) => o.sellerId === user.id)} />
      <Section title="Offers I made" items={offers.filter((o) => o.buyerId === user.id)} />
    </div>
  );
}
