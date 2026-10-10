import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { getI18n } from "@/i18n/server";
import { Alert, Card, EmptyState } from "@/components/ui";
import { GenericBadge } from "@/components/dashboard/status";
import { MiniArea } from "@/components/charts";
import { PromotionPicker } from "@/components/promotions/picker";
import { formatMoney, type CurrencyCode } from "@/lib/money";

export default async function PromotionsPage({ searchParams }: { searchParams: Promise<{ listing?: string; paid?: string; cancelled?: string }> }) {
  const sp = await searchParams;
  const user = await requireUser("/dashboard/promotions");
  const { t, locale } = await getI18n();
  const [listings, packages, promos] = await Promise.all([
    db.listing.findMany({ where: { sellerId: user.id, status: "ACTIVE" }, select: { id: true, title: true }, orderBy: { updatedAt: "desc" } }),
    db.promotionPackage.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    db.promotion.findMany({ where: { sellerId: user.id, status: { not: "CANCELLED" } }, include: { listing: { select: { title: true, slug: true } }, daily: { orderBy: { day: "asc" } } }, orderBy: { createdAt: "desc" } }),
  ]);
  const paid = sp.paid ? promos.find((p) => p.id === sp.paid) : null;
  const now = new Date();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold text-white">{t("dash.promotions")}</h1>
          <p className="mt-1 text-sm text-slate-400">{t("pricing.promotionsSub")}</p>
        </div>
        <PromotionPicker listings={listings} initialListing={sp.listing && listings.some((l) => l.id === sp.listing) ? sp.listing : undefined} packages={packages.map((p) => ({ code: p.code, name: p.name, price: p.price, currency: p.currency, durationDays: p.durationDays, features: p.features, border: p.border }))} />
      </div>
      {paid && (paid.status === "ACTIVE" ? <Alert tone="green">Promotion active until {paid.endsAt?.toLocaleString(locale)}.</Alert> : <Alert tone="blue">Payment received — your promotion activates as soon as the provider verifies it.</Alert>)}
      {sp.cancelled && <Alert tone="amber">Checkout cancelled. No promotion was purchased.</Alert>}
      {!listings.length && <Alert tone="blue">You need a live listing to purchase a promotion.</Alert>}

      {promos.length === 0 ? (
        <EmptyState title={t("promo.none")} />
      ) : (
        <div className="space-y-4">
          {promos.map((p) => {
            const running = p.status === "ACTIVE" && p.startsAt && p.startsAt <= now && p.endsAt && p.endsAt > now;
            const ctr = p.impressions ? ((p.clicks / p.impressions) * 100).toFixed(1) : "0.0";
            return (
              <Card key={p.id} className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <a href={`/listing/${p.listing.slug}`} className="font-medium text-white hover:underline">{p.listing.title}</a>
                    <div className="text-sm text-slate-400">{p.packageCode.toLowerCase()} · {formatMoney(p.price, p.currency as CurrencyCode, { locale })} · {t("promo.days", { days: p.durationDays })}</div>
                    {p.endsAt && <div className="text-xs text-slate-500">{p.startsAt && p.startsAt > now ? `Starts ${p.startsAt.toLocaleString(locale)} · ` : ""}{t("promo.endsAt", { date: p.endsAt.toLocaleString(locale) })}</div>}
                  </div>
                  <GenericBadge status={running ? "ACTIVE" : p.status === "ACTIVE" ? "SCHEDULED" : p.status} />
                </div>
                <div className="mt-4 grid grid-cols-3 gap-3 text-center">
                  <div className="rounded-xl bg-white/[0.03] py-3 ring-1 ring-white/5"><div className="font-display text-xl font-semibold text-white">{p.impressions.toLocaleString()}</div><div className="text-xs text-slate-500">{t("promo.impressions")}</div></div>
                  <div className="rounded-xl bg-white/[0.03] py-3 ring-1 ring-white/5"><div className="font-display text-xl font-semibold text-white">{p.clicks.toLocaleString()}</div><div className="text-xs text-slate-500">{t("promo.clicks")}</div></div>
                  <div className="rounded-xl bg-white/[0.03] py-3 ring-1 ring-white/5"><div className="font-display text-xl font-semibold text-white">{ctr}%</div><div className="text-xs text-slate-500">{t("promo.ctr")}</div></div>
                </div>
                {p.analytics >= 1 && p.daily.length > 1 && (
                  <div className="mt-4 h-40">
                    <MiniArea data={p.daily.map((d) => ({ day: d.day.toISOString().slice(5, 10), impressions: d.impressions }))} xKey="day" yKey="impressions" name={t("promo.impressions")} format="count" />
                  </div>
                )}
                {p.analytics >= 2 && p.daily.length > 0 && (
                  <details className="mt-3 text-sm">
                    <summary className="cursor-pointer text-slate-400">Detailed daily statistics</summary>
                    <table className="mt-2 w-full text-xs">
                      <thead className="text-left text-slate-500"><tr><th className="py-1">Day</th><th className="py-1 text-right">{t("promo.impressions")}</th><th className="py-1 text-right">{t("promo.clicks")}</th><th className="py-1 text-right">{t("promo.ctr")}</th></tr></thead>
                      <tbody>{p.daily.map((d) => <tr key={d.id} className="border-t border-white/5 text-slate-300"><td className="py-1">{d.day.toISOString().slice(0, 10)}</td><td className="py-1 text-right">{d.impressions}</td><td className="py-1 text-right">{d.clicks}</td><td className="py-1 text-right">{d.impressions ? ((d.clicks / d.impressions) * 100).toFixed(1) : "0.0"}%</td></tr>)}</tbody>
                    </table>
                  </details>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
