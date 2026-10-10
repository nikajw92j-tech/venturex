"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronLeft, ChevronRight, Eye, Gavel, Plus, Rocket, Save, Store, Tag, Trash2 } from "lucide-react";
import { Button, Field } from "../ui";
import { Uploader, type Uploaded } from "../uploader";
import { useToast } from "../toast";
import { ListingCard } from "../listing-card";
import { Modal } from "../modal";
import { celebrate } from "../confetti";
import { useLocale, useT } from "@/i18n/client";
import { COUNTRIES, DEV_STATUSES, MAIN_CATEGORIES, STARTER_CATEGORIES } from "@/lib/categories";
import { computeCommission, type Tier } from "@/lib/commission";
import { formatMoney, toUsd, type Rates } from "@/lib/money";
import { AUCTION_DURATIONS_HOURS } from "@/lib/auction/engine";
import { saveListingAction, type ListingInput } from "@/app/actions/listings";
import type { ListingCardData } from "@/lib/listings";
import { cn } from "@/lib/utils";

type MediaFile = Uploaded & { kind: "LOGO" | "SCREENSHOT" | "REVENUE_EVIDENCE" | "TRAFFIC_EVIDENCE" | "DOCUMENT" };

export type WizardInitial = {
  id: string;
  status: string;
  slug: string;
  market: "MAIN" | "STARTER";
  title: string;
  tagline: string;
  category: string;
  websiteUrl: string;
  description: string;
  businessAgeMonths: string;
  country: string;
  techStack: string;
  currency: "USD" | "GEL" | "EUR";
  monthlyRevenue: string;
  monthlyExpenses: string;
  monthlyTraffic: string;
  customers: string;
  revenueHistory: { month: string; revenue: string; profit: string }[];
  trafficHistory: { month: string; visitors: string }[];
  reasonForSale: string;
  assetsIncluded: string;
  growthOpportunities: string;
  riskDisclosures: string;
  demoUrl: string;
  repositoryUrl: string;
  developmentStatus: string;
  featuresIncluded: string;
  sourceCodeIncluded: boolean;
  saleType: "FIXED" | "AUCTION";
  askingPrice: string;
  startingBid: string;
  minIncrement: string;
  durationHours: string;
  reservePrice: string;
  buyNowPrice: string;
  media: MediaFile[];
};

const blank = (market: "MAIN" | "STARTER"): Omit<WizardInitial, "id" | "status" | "slug"> => ({
  market,
  title: "",
  tagline: "",
  category: market === "STARTER" ? "SAAS_MVP" : "SAAS",
  websiteUrl: "",
  description: "",
  businessAgeMonths: "0",
  country: "",
  techStack: "",
  currency: market === "STARTER" ? "GEL" : "USD",
  monthlyRevenue: "0",
  monthlyExpenses: "0",
  monthlyTraffic: "0",
  customers: "0",
  revenueHistory: [],
  trafficHistory: [],
  reasonForSale: "",
  assetsIncluded: "",
  growthOpportunities: "",
  riskDisclosures: "",
  demoUrl: "",
  repositoryUrl: "",
  developmentStatus: market === "STARTER" ? "MVP" : "",
  featuresIncluded: "",
  sourceCodeIncluded: market === "STARTER",
  saleType: "FIXED",
  askingPrice: "",
  startingBid: "",
  minIncrement: "",
  durationHours: "168",
  reservePrice: "",
  buyNowPrice: "",
  media: [],
});

const DURATION_LABEL: Record<number, string> = { 24: "24 hours", 72: "3 days", 168: "7 days", 336: "14 days", 720: "30 days" };

function lastMonths(n: number) {
  const out: string[] = [];
  const d = new Date();
  for (let i = n; i >= 1; i--) {
    const x = new Date(d.getFullYear(), d.getMonth() - i, 1);
    out.push(`${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

export function SellWizard({ initial, defaultMarket, tiers, rates, sellerName }: { initial: WizardInitial | null; defaultMarket: "MAIN" | "STARTER"; tiers: Tier[]; rates: Rates; sellerName: string }) {
  const t = useT();
  const locale = useLocale();
  const toast = useToast();
  const router = useRouter();
  const [f, setF] = useState(() => initial ?? { ...blank(defaultMarket), id: undefined as string | undefined, status: "DRAFT", slug: "" });
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const [preview, setPreview] = useState(false);
  const isStarter = f.market === "STARTER";
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const locked = f.status === "ACTIVE" && initial?.saleType === "AUCTION";

  const steps = [t("sell.step.basics"), t("sell.step.financials"), t("sell.step.details"), t("sell.step.media"), t("sell.step.pricing"), t("sell.step.review")];
  const cats = isStarter ? STARTER_CATEGORIES : MAIN_CATEGORIES;

  const mediaOf = (kind: MediaFile["kind"]) => f.media.filter((m) => m.kind === kind);
  const setMedia = (kind: MediaFile["kind"], files: Uploaded[]) => set("media", [...f.media.filter((m) => m.kind !== kind), ...files.map((x) => ({ ...x, kind }))]);

  const profit = (Number(f.monthlyRevenue) || 0) - (Number(f.monthlyExpenses) || 0);
  const headline = f.saleType === "FIXED" ? Number(f.askingPrice) || 0 : Number(f.reservePrice) || Number(f.startingBid) || 0;
  const commission = useMemo(() => {
    const amount = Math.round(headline * 100);
    if (!amount) return null;
    return computeCommission(amount, toUsd(amount, f.currency, rates), tiers);
  }, [headline, f.currency, rates, tiers]);

  function toInput(): ListingInput {
    const split = (s: string, sep: RegExp) => s.split(sep).map((x) => x.trim()).filter(Boolean);
    const n = (s: string) => Number(s) || 0;
    const opt = (s: string): number | "" => (s.trim() === "" ? "" : Number(s));
    return {
      id: f.id,
      market: f.market,
      title: f.title,
      tagline: f.tagline,
      category: f.category,
      websiteUrl: f.websiteUrl,
      description: f.description,
      businessAgeMonths: n(f.businessAgeMonths),
      country: f.country,
      techStack: split(f.techStack, /,/),
      currency: f.currency,
      monthlyRevenue: n(f.monthlyRevenue),
      monthlyExpenses: n(f.monthlyExpenses),
      monthlyTraffic: n(f.monthlyTraffic),
      customers: n(f.customers),
      revenueHistory: f.revenueHistory.filter((r) => r.revenue !== "").map((r) => ({ month: r.month, revenue: n(r.revenue), profit: n(r.profit) })),
      trafficHistory: f.trafficHistory.filter((r) => r.visitors !== "").map((r) => ({ month: r.month, visitors: n(r.visitors) })),
      reasonForSale: f.reasonForSale,
      assetsIncluded: split(f.assetsIncluded, /\n/),
      growthOpportunities: f.growthOpportunities,
      riskDisclosures: f.riskDisclosures,
      demoUrl: f.demoUrl,
      repositoryUrl: f.repositoryUrl,
      developmentStatus: f.developmentStatus,
      featuresIncluded: split(f.featuresIncluded, /\n/),
      sourceCodeIncluded: f.sourceCodeIncluded,
      saleType: f.saleType,
      askingPrice: opt(f.askingPrice),
      startingBid: opt(f.startingBid),
      minIncrement: opt(f.minIncrement),
      durationHours: n(f.durationHours),
      reservePrice: opt(f.reservePrice),
      buyNowPrice: opt(f.buyNowPrice),
      media: f.media.map((m) => ({ fileId: m.id, kind: m.kind, caption: m.kind === "SCREENSHOT" || m.kind === "LOGO" ? undefined : m.name.slice(0, 120) })),
    };
  }

  function save(submit: boolean) {
    start(async () => {
      const r = await saveListingAction(toInput(), submit);
      if (!r.ok) {
        setErrors(r.fieldErrors ?? {});
        toast.error(r.error);
        // jump to the step containing the first error
        const first = Object.keys(r.fieldErrors ?? {})[0] ?? "";
        const map: Record<string, number> = { title: 0, category: 0, description: 0, websiteUrl: 0, businessAgeMonths: 0, monthlyRevenue: 1, monthlyExpenses: 1, riskDisclosures: 2, demoUrl: 2, repositoryUrl: 2, askingPrice: 4, startingBid: 4, minIncrement: 4, durationHours: 4, reservePrice: 4, buyNowPrice: 4 };
        if (first.split(".")[0] in map) go(map[first.split(".")[0]]);
        return;
      }
      setErrors({});
      setF((x) => ({ ...x, id: r.data!.id, slug: r.data!.slug, status: r.data!.status }));
      if (submit) {
        celebrate();
        toast.success(r.data!.status === "ACTIVE" ? "Your listing is live!" : t("sell.submitted"));
        router.push(r.data!.status === "ACTIVE" ? `/listing/${r.data!.slug}` : "/dashboard/listings");
      } else {
        toast.success(t("sell.saved"));
        if (!f.id) router.replace(`/sell?edit=${r.data!.id}`, { scroll: false });
      }
    });
  }

  function go(n: number) {
    setDir(n > step ? 1 : -1);
    setStep(Math.max(0, Math.min(steps.length - 1, n)));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const err = (k: string) => errors[k];
  const previewCard: ListingCardData = {
    id: "preview",
    slug: f.slug || "preview",
    title: f.title || "Your business",
    tagline: f.tagline || null,
    category: f.category as ListingCardData["category"],
    market: f.market,
    saleType: f.saleType,
    status: "ACTIVE",
    currency: f.currency,
    price: Math.round((f.saleType === "FIXED" ? Number(f.askingPrice) : Number(f.startingBid)) * 100) || 0,
    monthlyRevenue: Math.round(Number(f.monthlyRevenue) * 100) || 0,
    monthlyProfit: Math.round(profit * 100),
    isPreRevenue: !Number(f.monthlyRevenue),
    logoUrl: mediaOf("LOGO")[0]?.url ?? null,
    coverUrl: mediaOf("SCREENSHOT")[0]?.url ?? null,
    sellerName,
    sellerVerified: false,
    financialsVerified: false,
    techStack: f.techStack.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 4),
    demoUrl: f.demoUrl || null,
    demoVerified: false,
    developmentStatus: f.developmentStatus || null,
    sourceCodeIncluded: f.sourceCodeIncluded,
    qualityScore: null,
    auction: f.saleType === "AUCTION" ? { endsAt: new Date(Date.now() + Number(f.durationHours) * 3600_000).toISOString(), bidCount: 0, hasBids: false, reserveMet: false, hasReserve: Boolean(f.reservePrice), live: true } : null,
    promotion: null,
    watchers: 0,
    views: 0,
    createdAt: new Date().toISOString(),
  };

  return (
    <div>
      {/* Stepper */}
      <ol className="mb-8 flex gap-1.5 overflow-x-auto pb-1">
        {steps.map((s, i) => (
          <li key={s} className="flex-1">
            <button onClick={() => go(i)} className={cn("group flex w-full min-w-24 flex-col gap-2 text-left text-xs font-semibold transition", i === step ? "text-white" : i < step ? "text-electric-400" : "text-slate-500")}>
              <span className="h-1 w-full overflow-hidden rounded-full bg-white/5">
                <motion.span className="block h-full bg-brand" initial={false} animate={{ width: i <= step ? "100%" : "0%" }} transition={{ duration: 0.4 }} />
              </span>
              <span className="flex items-center gap-1">{i < step && <Check className="h-3 w-3" />}{s}</span>
            </button>
          </li>
        ))}
      </ol>

      <div className="glass card-shadow relative overflow-hidden rounded-3xl p-6 sm:p-8">
        <AnimatePresence mode="wait" custom={dir}>
          <motion.div key={step} custom={dir} initial={{ opacity: 0, x: dir * 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: dir * -40 }} transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }} className="space-y-6">
            {step === 0 && (
              <>
                <div>
                  <div className="label">{t("sell.market")}</div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {(["MAIN", "STARTER"] as const).map((m) => (
                      <button key={m} type="button" disabled={Boolean(f.id) && f.status !== "DRAFT"} onClick={() => setF((x) => ({ ...x, market: m, category: m === "STARTER" ? "SAAS_MVP" : "SAAS", sourceCodeIncluded: m === "STARTER" ? true : x.sourceCodeIncluded, developmentStatus: m === "STARTER" ? x.developmentStatus || "MVP" : "" }))} className={cn("rounded-2xl p-4 text-left ring-1 transition", f.market === m ? "bg-electric/10 ring-electric/50" : "bg-white/[0.02] ring-white/10 hover:ring-white/20")}>
                        <div className="flex items-center gap-2 font-semibold text-white">{m === "MAIN" ? <Store className="h-4 w-4 text-electric-400" /> : <Rocket className="h-4 w-4 text-cyan" />} {m === "MAIN" ? t("sell.market.main") : t("sell.market.starter")}</div>
                        <div className="mt-1 text-sm text-slate-400">{m === "MAIN" ? t("sell.market.mainHelp") : t("sell.market.starterHelp")}</div>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field label={t("sell.name")} error={err("title")}><input className="input" value={f.title} onChange={(e) => set("title", e.target.value)} maxLength={90} /></Field>
                  <Field label={t("sell.category")} error={err("category")}>
                    <select className="input" value={f.category} onChange={(e) => set("category", e.target.value)}>
                      {cats.map((c) => <option key={c.key} value={c.key}>{c.label[locale]}</option>)}
                    </select>
                  </Field>
                </div>
                <Field label={t("sell.tagline")}><input className="input" value={f.tagline} onChange={(e) => set("tagline", e.target.value)} maxLength={160} /></Field>
                <Field label={t("sell.url")} error={err("websiteUrl")}><input className="input" type="url" placeholder="https://" value={f.websiteUrl} onChange={(e) => set("websiteUrl", e.target.value)} /></Field>
                <Field label={t("sell.description")} error={err("description")} hint={`${f.description.length}/15000`}>
                  <textarea className="input min-h-48" value={f.description} onChange={(e) => set("description", e.target.value)} />
                </Field>
                <div className="grid gap-5 sm:grid-cols-3">
                  <Field label={t("sell.age")} error={err("businessAgeMonths")}><input className="input" type="number" min={0} value={f.businessAgeMonths} onChange={(e) => set("businessAgeMonths", e.target.value)} /></Field>
                  <Field label={t("sell.country")}>
                    <select className="input" value={f.country} onChange={(e) => set("country", e.target.value)}>
                      <option value="">—</option>
                      {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
                    </select>
                  </Field>
                  <Field label={t("sell.tech")}><input className="input" placeholder="Next.js, Stripe, PostgreSQL" value={f.techStack} onChange={(e) => set("techStack", e.target.value)} /></Field>
                </div>
              </>
            )}

            {step === 1 && (
              <>
                <Field label={t("sell.currency")}>
                  <div className="grid grid-cols-3 gap-2 sm:max-w-sm">
                    {(["USD", "GEL", "EUR"] as const).map((c) => (
                      <button key={c} type="button" disabled={locked} onClick={() => set("currency", c)} className={cn("rounded-xl py-2 text-sm font-semibold ring-1 transition", f.currency === c ? "bg-brand text-white ring-transparent" : "text-slate-300 ring-white/10 hover:ring-white/20")}>{c}</button>
                    ))}
                  </div>
                </Field>
                <div className="grid gap-5 sm:grid-cols-3">
                  <Field label={`${t("sell.revenue")} (${f.currency})`} error={err("monthlyRevenue")}><input className="input" type="number" min={0} value={f.monthlyRevenue} onChange={(e) => set("monthlyRevenue", e.target.value)} /></Field>
                  <Field label={`${t("sell.expenses")} (${f.currency})`} error={err("monthlyExpenses")}><input className="input" type="number" min={0} value={f.monthlyExpenses} onChange={(e) => set("monthlyExpenses", e.target.value)} /></Field>
                  <Field label={`${t("sell.profit")} (${f.currency})`} hint="Revenue − expenses"><input className="input" value={profit.toFixed(2)} readOnly /></Field>
                  <Field label={t("sell.traffic")}><input className="input" type="number" min={0} value={f.monthlyTraffic} onChange={(e) => set("monthlyTraffic", e.target.value)} /></Field>
                  <Field label={t("sell.customers")}><input className="input" type="number" min={0} value={f.customers} onChange={(e) => set("customers", e.target.value)} /></Field>
                </div>
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <div className="label mb-0">{t("sell.revenueHistory")}</div>
                    {f.revenueHistory.length === 0 ? (
                      <Button type="button" variant="secondary" size="sm" onClick={() => { const months = lastMonths(12); setF((x) => ({ ...x, revenueHistory: months.map((m) => ({ month: m, revenue: "", profit: "" })), trafficHistory: months.map((m) => ({ month: m, visitors: "" })) })); }}><Plus className="h-3.5 w-3.5" /> 12 months</Button>
                    ) : (
                      <Button type="button" variant="ghost" size="sm" onClick={() => setF((x) => ({ ...x, revenueHistory: [], trafficHistory: [] }))}><Trash2 className="h-3.5 w-3.5" /> {t("common.reset")}</Button>
                    )}
                  </div>
                  {f.revenueHistory.length > 0 && (
                    <div className="overflow-x-auto rounded-xl ring-1 ring-white/10">
                      <table className="w-full min-w-[520px] text-sm">
                        <thead className="bg-white/5 text-left text-xs text-slate-400"><tr><th className="px-3 py-2">Month</th><th className="px-3 py-2">{t("sell.revenue")}</th><th className="px-3 py-2">{t("sell.profit")}</th><th className="px-3 py-2">{t("sell.traffic")}</th></tr></thead>
                        <tbody>
                          {f.revenueHistory.map((r, i) => (
                            <tr key={r.month} className="border-t border-white/5">
                              <td className="px-3 py-1.5 text-slate-400">{r.month}</td>
                              {(["revenue", "profit"] as const).map((k) => (
                                <td key={k} className="px-2 py-1"><input className="input py-1.5" type="number" value={r[k]} onChange={(e) => { const v = [...f.revenueHistory]; v[i] = { ...v[i], [k]: e.target.value }; set("revenueHistory", v); }} /></td>
                              ))}
                              <td className="px-2 py-1"><input className="input py-1.5" type="number" min={0} value={f.trafficHistory[i]?.visitors ?? ""} onChange={(e) => { const v = [...f.trafficHistory]; v[i] = { month: r.month, visitors: e.target.value }; set("trafficHistory", v); }} /></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </>
            )}

            {step === 2 && (
              <>
                {isStarter && (
                  <div className="grid gap-5 rounded-2xl bg-cyan/[0.04] p-5 ring-1 ring-cyan/20 sm:grid-cols-2">
                    <Field label={t("sell.demoUrl")} error={err("demoUrl")}><input className="input" type="url" placeholder="https://" value={f.demoUrl} onChange={(e) => set("demoUrl", e.target.value)} /></Field>
                    <Field label={t("sell.repoUrl")} error={err("repositoryUrl")}><input className="input" type="url" placeholder="https://github.com/…" value={f.repositoryUrl} onChange={(e) => set("repositoryUrl", e.target.value)} /></Field>
                    <Field label={t("sell.devStatus")}>
                      <select className="input" value={f.developmentStatus} onChange={(e) => set("developmentStatus", e.target.value)}>
                        {DEV_STATUSES.map((d) => <option key={d.key} value={d.key}>{d.label[locale]}</option>)}
                      </select>
                    </Field>
                    <label className="flex items-center gap-3 self-end pb-2.5 text-sm text-slate-200">
                      <input type="checkbox" className="h-4 w-4 accent-blue-500" checked={f.sourceCodeIncluded} onChange={(e) => set("sourceCodeIncluded", e.target.checked)} /> {t("sell.sourceIncluded")}
                    </label>
                    <Field label={t("sell.features")} className="sm:col-span-2"><textarea className="input min-h-28" value={f.featuresIncluded} onChange={(e) => set("featuresIncluded", e.target.value)} placeholder={"User authentication\nStripe billing\nAdmin dashboard"} /></Field>
                  </div>
                )}
                {!isStarter && (
                  <label className="flex items-center gap-3 text-sm text-slate-200">
                    <input type="checkbox" className="h-4 w-4 accent-blue-500" checked={f.sourceCodeIncluded} onChange={(e) => set("sourceCodeIncluded", e.target.checked)} /> {t("sell.sourceIncluded")}
                  </label>
                )}
                <Field label={t("sell.assets")}><textarea className="input min-h-32" value={f.assetsIncluded} onChange={(e) => set("assetsIncluded", e.target.value)} placeholder={"Domain name\nSource code\nSocial media accounts\nEmail list (4,200 subscribers)"} /></Field>
                <Field label={isStarter ? t("sell.futureOps") : t("sell.growth")}><textarea className="input min-h-28" value={f.growthOpportunities} onChange={(e) => set("growthOpportunities", e.target.value)} /></Field>
                <Field label={t("sell.reason")}><textarea className="input min-h-24" value={f.reasonForSale} onChange={(e) => set("reasonForSale", e.target.value)} /></Field>
                <Field label={t("sell.risks")} error={err("riskDisclosures")}><textarea className="input min-h-24" value={f.riskDisclosures} onChange={(e) => set("riskDisclosures", e.target.value)} placeholder="Platform dependency, seasonality, key-person risk…" /></Field>
              </>
            )}

            {step === 3 && (
              <>
                <Uploader label={t("sell.logo")} purpose="listing-image" multiple={false} max={1} files={mediaOf("LOGO")} onChange={(x) => setMedia("LOGO", x)} onError={toast.error} />
                <Uploader label={t("sell.screenshots")} purpose="listing-image" max={12} files={mediaOf("SCREENSHOT")} onChange={(x) => setMedia("SCREENSHOT", x)} onError={toast.error} />
                <div className="rounded-2xl bg-emerald-500/[0.04] p-5 ring-1 ring-emerald-500/20">
                  <p className="mb-5 text-sm text-emerald-200">{t("sell.privateNote")}</p>
                  <div className="grid gap-6 md:grid-cols-3">
                    <Uploader label={t("sell.revenueEvidence")} purpose="evidence" files={mediaOf("REVENUE_EVIDENCE")} onChange={(x) => setMedia("REVENUE_EVIDENCE", x)} onError={toast.error} />
                    <Uploader label={t("sell.trafficEvidence")} purpose="evidence" files={mediaOf("TRAFFIC_EVIDENCE")} onChange={(x) => setMedia("TRAFFIC_EVIDENCE", x)} onError={toast.error} />
                    <Uploader label={t("sell.documents")} purpose="evidence" files={mediaOf("DOCUMENT")} onChange={(x) => setMedia("DOCUMENT", x)} onError={toast.error} />
                  </div>
                </div>
              </>
            )}

            {step === 4 && (
              <>
                <div>
                  <div className="label">{t("sell.saleType")}</div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {(["FIXED", "AUCTION"] as const).map((s) => (
                      <button key={s} type="button" disabled={locked} onClick={() => set("saleType", s)} className={cn("rounded-2xl p-4 text-left ring-1 transition", f.saleType === s ? "bg-electric/10 ring-electric/50" : "bg-white/[0.02] ring-white/10 hover:ring-white/20")}>
                        <div className="flex items-center gap-2 font-semibold text-white">{s === "FIXED" ? <Tag className="h-4 w-4 text-electric-400" /> : <Gavel className="h-4 w-4 text-violet-400" />} {s === "FIXED" ? t("common.fixedPrice") : t("common.auction")}</div>
                        <div className="mt-1 text-sm text-slate-400">{s === "FIXED" ? "Buy now, offers and negotiation" : "Real-time bidding with reserve and Buy Now options"}</div>
                      </button>
                    ))}
                  </div>
                  {locked && <p className="mt-2 text-xs text-amber-300">Auction terms can&apos;t be changed while the auction is live.</p>}
                </div>
                {f.saleType === "FIXED" ? (
                  <Field label={`${t("sell.asking")} (${f.currency})`} error={err("askingPrice")} className="sm:max-w-xs"><input className="input h-12 text-lg font-semibold" type="number" min={0} value={f.askingPrice} onChange={(e) => set("askingPrice", e.target.value)} /></Field>
                ) : (
                  <div className="grid gap-5 sm:grid-cols-2">
                    <Field label={`${t("sell.startingBid")} (${f.currency})`} error={err("startingBid")}><input className="input" type="number" min={0} disabled={locked} value={f.startingBid} onChange={(e) => set("startingBid", e.target.value)} /></Field>
                    <Field label={`${t("sell.increment")} (${f.currency})`} error={err("minIncrement")}><input className="input" type="number" min={0} disabled={locked} value={f.minIncrement} onChange={(e) => set("minIncrement", e.target.value)} /></Field>
                    <Field label={t("sell.duration")} error={err("durationHours")}>
                      <select className="input" disabled={locked} value={f.durationHours} onChange={(e) => set("durationHours", e.target.value)}>
                        {AUCTION_DURATIONS_HOURS.map((h) => <option key={h} value={h}>{DURATION_LABEL[h]}</option>)}
                      </select>
                    </Field>
                    <div />
                    <Field label={`${t("sell.reserve")} (${t("common.optional")})`} error={err("reservePrice")} hint="Hidden from buyers. The item sells only if bidding reaches it."><input className="input" type="number" min={0} disabled={locked} value={f.reservePrice} onChange={(e) => set("reservePrice", e.target.value)} /></Field>
                    <Field label={`${t("sell.buyNow")} (${t("common.optional")})`} error={err("buyNowPrice")}><input className="input" type="number" min={0} disabled={locked} value={f.buyNowPrice} onChange={(e) => set("buyNowPrice", e.target.value)} /></Field>
                  </div>
                )}
                {commission && (
                  <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl bg-white/[0.03] p-4 text-sm text-slate-300 ring-1 ring-white/10">
                    {t("sell.commissionPreview", { rate: `${commission.rateBps / 100}%`, amount: formatMoney(commission.commission, f.currency, { locale, cents: true }), net: formatMoney(commission.sellerNet, f.currency, { locale, cents: true }) })}
                    {f.saleType === "AUCTION" && <div className="mt-1 text-xs text-slate-500">Calculated on {f.reservePrice ? "your reserve" : "the starting bid"}; the final commission uses the winning bid.</div>}
                  </motion.div>
                )}
              </>
            )}

            {step === 5 && (
              <div className="grid gap-8 md:grid-cols-[320px_1fr]">
                <div>
                  <div className="label">{t("sell.preview")}</div>
                  <div className="pointer-events-none"><ListingCard l={previewCard} /></div>
                </div>
                <div className="space-y-3 text-sm">
                  {[
                    [t("sell.name"), f.title || "—"],
                    [t("sell.category"), cats.find((c) => c.key === f.category)?.label[locale] ?? f.category],
                    [t("sell.revenue"), `${f.monthlyRevenue || 0} ${f.currency}`],
                    [t("sell.profit"), `${profit.toFixed(2)} ${f.currency}`],
                    [t("sell.saleType"), f.saleType === "FIXED" ? `${t("common.fixedPrice")} · ${f.askingPrice || "—"} ${f.currency}` : `${t("common.auction")} · ${f.startingBid || "—"} ${f.currency} · ${DURATION_LABEL[Number(f.durationHours)]}`],
                    [t("sell.screenshots"), String(mediaOf("SCREENSHOT").length)],
                    [t("sell.privateNote").split(".")[0], String(mediaOf("REVENUE_EVIDENCE").length + mediaOf("TRAFFIC_EVIDENCE").length + mediaOf("DOCUMENT").length)],
                  ].map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-4 border-b border-white/5 pb-2"><span className="text-slate-400">{k}</span><span className="text-right text-white">{v}</span></div>
                  ))}
                  <Button type="button" variant="outline" size="sm" onClick={() => setPreview(true)}><Eye className="h-4 w-4" /> {t("sell.preview")}</Button>
                  <p className="pt-2 text-xs text-slate-500">By submitting you confirm the information is accurate and you own or control every asset included in the sale. Misrepresentation leads to removal and account suspension.</p>
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" onClick={() => go(step - 1)} disabled={step === 0}><ChevronLeft className="h-4 w-4" /> {t("common.back")}</Button>
        <div className="flex gap-2">
          {f.status !== "ACTIVE" && <Button variant="secondary" onClick={() => save(false)} loading={pending}><Save className="h-4 w-4" /> {t("sell.saveDraft")}</Button>}
          {step < steps.length - 1 ? (
            <Button onClick={() => go(step + 1)}>{t("common.next")} <ChevronRight className="h-4 w-4" /></Button>
          ) : (
            <Button onClick={() => save(true)} loading={pending}>{f.status === "ACTIVE" ? t("common.save") : t("sell.submit")}</Button>
          )}
        </div>
      </div>

      <Modal open={preview} onClose={() => setPreview(false)} title={t("sell.preview")} wide>
        <div className="space-y-4">
          <div className="text-xs uppercase tracking-wider text-electric-400">{cats.find((c) => c.key === f.category)?.label[locale]}</div>
          <h2 className="font-display text-3xl font-semibold text-white">{f.title || "—"}</h2>
          {f.tagline && <p className="text-slate-400">{f.tagline}</p>}
          {mediaOf("SCREENSHOT")[0] && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={mediaOf("SCREENSHOT")[0].url} alt="" className="aspect-video w-full rounded-xl object-cover" />
          )}
          <p className="whitespace-pre-line text-slate-300">{f.description}</p>
          {f.id && f.slug && <a href={`/listing/${f.slug}`} target="_blank" className="text-sm text-electric-400 underline">Open the full listing preview (saved draft) ↗</a>}
        </div>
      </Modal>
    </div>
  );
}
