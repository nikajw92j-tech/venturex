import { Check } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { getI18n } from "@/i18n/server";
import { userPlan, COUNTED_STATUSES } from "@/lib/listing-service";
import { Alert, Badge, Card, LinkButton } from "@/components/ui";
import { CancelSubscriptionButton, SubscribeButton } from "@/components/dashboard/misc";
import { formatMoney, type CurrencyCode } from "@/lib/money";
import { cn } from "@/lib/utils";

export default async function SubscriptionPage({ searchParams }: { searchParams: Promise<{ paid?: string }> }) {
  const sp = await searchParams;
  const user = await requireUser("/dashboard/subscription");
  const { t, locale } = await getI18n();
  const [sub, plan, plans, used] = await Promise.all([
    db.subscription.findUnique({ where: { userId: user.id } }),
    userPlan(user.id),
    db.plan.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    db.listing.count({ where: { sellerId: user.id, status: { in: [...COUNTED_STATUSES] } } }),
  ]);
  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl font-semibold text-white">{t("dash.subscription")}</h1>
      {sp.paid && (sub?.status === "ACTIVE" ? <Alert tone="green">Your plan is active. Thank you!</Alert> : <Alert tone="blue">Payment received — activating your plan once the provider confirms it.</Alert>)}
      <Card className="flex flex-wrap items-center justify-between gap-4 p-6">
        <div>
          <div className="text-xs uppercase tracking-wider text-slate-500">{t("pricing.current")}</div>
          <div className="mt-1 font-display text-2xl font-semibold text-white">{plan.name}</div>
          <div className="mt-1 text-sm text-slate-400">{used}/{plan.maxActiveListings} active listings used</div>
          {sub?.status === "ACTIVE" && sub.currentPeriodEnd && <div className="mt-1 text-sm text-slate-500">{sub.cancelAtPeriodEnd ? "Ends" : "Renews"} {sub.currentPeriodEnd.toLocaleDateString(locale)}</div>}
          {sub?.status === "PAST_DUE" && <Badge tone="red" className="mt-2">Payment past due</Badge>}
        </div>
        {sub?.status === "ACTIVE" && !sub.cancelAtPeriodEnd && <CancelSubscriptionButton />}
      </Card>
      <div className="grid gap-4 md:grid-cols-3">
        {plans.map((p) => {
          const current = p.code === plan.code;
          return (
            <Card key={p.code} className={cn("flex flex-col p-6", current && "border-electric/50")}>
              <div className="font-display text-lg font-semibold text-white">{p.name}</div>
              <div className="mt-2 font-display text-3xl font-semibold text-white">{p.priceMonthly ? formatMoney(p.priceMonthly, p.currency as CurrencyCode, { locale }) : "0"}<span className="text-sm text-slate-500">/{t("pricing.month")}</span></div>
              <ul className="mt-4 flex-1 space-y-2 text-sm text-slate-300">{p.features.map((f) => <li key={f} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" /> {f}</li>)}</ul>
              <div className="mt-6">
                {current ? <Badge tone="blue">{t("pricing.current")}</Badge> : p.priceMonthly > 0 ? <SubscribeButton code={p.code} label={t("pricing.choose")} /> : null}
              </div>
            </Card>
          );
        })}
      </div>
      <p className="text-sm text-slate-500">{t("pricing.sameCommission")} <LinkButton href="/pricing" variant="ghost" size="sm">{t("nav.pricing")}</LinkButton></p>
    </div>
  );
}
