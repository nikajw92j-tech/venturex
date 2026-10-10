import type { Metadata } from "next";
import { Check, Percent } from "lucide-react";
import { db } from "@/lib/db";
import { getI18n } from "@/i18n/server";
import { getCurrentUser } from "@/lib/auth/session";
import { userPlan } from "@/lib/listing-service";
import { getTiers } from "@/lib/deals";
import { formatMoney, type CurrencyCode } from "@/lib/money";
import { Badge, Card, LinkButton } from "@/components/ui";
import { SubscribeButton } from "@/components/dashboard/misc";
import { PackageCards } from "@/components/promotions/picker";
import { Reveal, Stagger, StaggerItem } from "@/components/motion";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Pricing", description: "Free listings, transparent success commission, optional seller plans and promotion packages.", alternates: { canonical: "/pricing" } };

export default async function PricingPage() {
  const { t, locale } = await getI18n();
  const user = await getCurrentUser();
  const [plans, tiers, packages, current] = await Promise.all([
    db.plan.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    getTiers(),
    db.promotionPackage.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    user ? userPlan(user.id) : Promise.resolve(null),
  ]);
  const usd = (c: number) => formatMoney(c, "USD", { locale });

  return (
    <div className="container-x py-16">
      <Reveal>
        <div className="mx-auto max-w-2xl text-center">
          <h1 className="font-display text-4xl font-semibold text-white sm:text-5xl">{t("pricing.title")}</h1>
          <p className="mt-4 text-lg text-slate-400">{t("pricing.subtitle")}</p>
        </div>
      </Reveal>

      <Reveal>
        <Card className="mx-auto mt-14 max-w-4xl p-8">
          <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-brand"><Percent className="h-5 w-5 text-white" /></span><h2 className="font-display text-2xl font-semibold text-white">{t("pricing.commission")}</h2></div>
          <p className="mt-3 text-slate-400">{t("pricing.commissionSub")}</p>
          <div className="mt-6 grid gap-3 sm:grid-cols-4">
            {tiers.map((tier) => (
              <div key={tier.minUsd} className="rounded-2xl bg-white/[0.03] p-5 text-center ring-1 ring-white/10">
                <div className="font-display text-3xl font-semibold text-gradient">{tier.rateBps / 100}%</div>
                <div className="mt-1 text-sm text-slate-400">{tier.maxUsd === null ? `${usd(tier.minUsd)}+` : `${usd(tier.minUsd)} – ${usd(tier.maxUsd - 100)}`}</div>
              </div>
            ))}
          </div>
          <div className="mt-6 rounded-xl bg-electric/[0.06] p-4 text-sm text-slate-300 ring-1 ring-electric/20">
            <b className="text-white">Example:</b> a business sells for $1,000 → buyer pays $1,000 · commission 8% = $80 · seller receives $920.
          </div>
        </Card>
      </Reveal>

      <section className="mt-20">
        <h2 className="mb-8 text-center font-display text-3xl font-semibold text-white">{t("pricing.plans")}</h2>
        <Stagger className="grid gap-5 md:grid-cols-3">
          {plans.map((p, i) => {
            const isCurrent = current?.code === p.code;
            const highlight = i === 1;
            return (
              <StaggerItem key={p.code}>
                <Card className={cn("relative flex h-full flex-col p-7", highlight && "border-animated")}>
                  {highlight && <Badge tone="violet" className="absolute -top-2.5 left-7">Most popular</Badge>}
                  <div className="font-display text-xl font-semibold text-white">{p.name}</div>
                  <div className="mt-3 font-display text-4xl font-semibold text-white">{p.priceMonthly ? formatMoney(p.priceMonthly, p.currency as CurrencyCode, { locale }) : formatMoney(0, "USD")}<span className="text-base font-normal text-slate-500">/{t("pricing.month")}</span></div>
                  <ul className="mt-6 flex-1 space-y-2.5 text-sm text-slate-300">{p.features.map((f) => <li key={f} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" /> {f}</li>)}</ul>
                  <div className="mt-8">
                    {isCurrent ? <Badge tone="blue">{t("pricing.current")}</Badge> : p.priceMonthly === 0 ? <LinkButton href={user ? "/sell" : "/register"} variant="secondary" className="w-full">{t("home.cta.button")}</LinkButton> : user ? <SubscribeButton code={p.code} label={t("pricing.choose")} variant={highlight ? "primary" : "secondary"} /> : <LinkButton href="/register" className="w-full" variant={highlight ? "primary" : "secondary"}>{t("pricing.choose")}</LinkButton>}
                  </div>
                </Card>
              </StaggerItem>
            );
          })}
        </Stagger>
        <p className="mt-6 text-center text-sm text-slate-500">{t("pricing.sameCommission")}</p>
      </section>

      <section className="mt-20">
        <h2 className="text-center font-display text-3xl font-semibold text-white">{t("pricing.promotions")}</h2>
        <p className="mx-auto mt-3 mb-8 max-w-2xl text-center text-slate-400">{t("pricing.promotionsSub")}</p>
        <PackageCards packages={packages.map((p) => ({ code: p.code, name: p.name, price: p.price, currency: p.currency, durationDays: p.durationDays, features: p.features, border: p.border }))} />
        <div className="mt-8 text-center"><LinkButton href="/dashboard/promotions" variant="gold">{t("promo.title")}</LinkButton></div>
      </section>
    </div>
  );
}
