"use client";

import { useState, useTransition } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Bot, Calculator, Info, ListChecks } from "lucide-react";
import { Alert, Button, Field, LinkButton } from "../ui";
import { useToast } from "../toast";
import { useLocale, useT } from "@/i18n/client";
import { ALL_CATEGORIES } from "@/lib/categories";
import { valuationAction } from "@/app/actions/valuation";
import { CountUp } from "../motion";
import { cn } from "@/lib/utils";

type Result = { low: number; mid: number; high: number; method: string; multiple: { low: number; high: number } | null; assumptions: string[]; analysis: string | null };

export function ValuationForm({ aiEnabled }: { aiEnabled: boolean }) {
  const t = useT();
  const locale = useLocale();
  const toast = useToast();
  const [f, setF] = useState({ category: "SAAS", monthlyRevenue: "5000", monthlyProfit: "3000", ageMonths: "24", growth: "growing" as "declining" | "flat" | "growing" | "fast", monthlyTraffic: "20000", retention: "" });
  const [res, setRes] = useState<Result | null>(null);
  const [pending, start] = useTransition();
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_1.1fr]">
      <form
        className="glass card-shadow space-y-5 rounded-3xl p-6 sm:p-8"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const r = await valuationAction({ ...f, monthlyRevenue: Number(f.monthlyRevenue) || 0, monthlyProfit: Number(f.monthlyProfit) || 0, ageMonths: Number(f.ageMonths) || 0, monthlyTraffic: Number(f.monthlyTraffic) || 0, retention: f.retention === "" ? "" : Number(f.retention) });
            if (!r.ok) return toast.error(r.error);
            setRes(r.data!);
          });
        }}
      >
        <Field label={t("common.category")}>
          <select className="input" value={f.category} onChange={(e) => set("category", e.target.value)}>
            {ALL_CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label[locale]}</option>)}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label={`${t("common.monthlyRevenue")} (USD)`}><input className="input" type="number" min={0} value={f.monthlyRevenue} onChange={(e) => set("monthlyRevenue", e.target.value)} /></Field>
          <Field label={`${t("common.monthlyProfit")} (USD)`}><input className="input" type="number" value={f.monthlyProfit} onChange={(e) => set("monthlyProfit", e.target.value)} /></Field>
          <Field label={t("sell.age")}><input className="input" type="number" min={0} value={f.ageMonths} onChange={(e) => set("ageMonths", e.target.value)} /></Field>
          <Field label={t("common.monthlyTraffic")}><input className="input" type="number" min={0} value={f.monthlyTraffic} onChange={(e) => set("monthlyTraffic", e.target.value)} /></Field>
        </div>
        <div>
          <div className="label">{t("valuation.growth")}</div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(["declining", "flat", "growing", "fast"] as const).map((g) => (
              <button type="button" key={g} onClick={() => setF((x) => ({ ...x, growth: g }))} className={cn("rounded-xl py-2 text-xs font-semibold ring-1 transition", f.growth === g ? "bg-brand text-white ring-transparent" : "text-slate-300 ring-white/10 hover:ring-white/20")}>
                {t(`valuation.growth.${g}` as never)}
              </button>
            ))}
          </div>
        </div>
        <Field label={`${t("valuation.retention")} — ${t("common.optional")}`}><input className="input" type="number" min={0} max={100} value={f.retention} onChange={(e) => set("retention", e.target.value)} placeholder="e.g. 92" /></Field>
        <Button type="submit" size="lg" className="w-full" loading={pending}><Calculator className="h-4 w-4" /> {t("valuation.calculate")}</Button>
        <p className="flex gap-2 text-xs text-slate-500"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {t("valuation.disclaimer")}</p>
      </form>

      <div>
        <AnimatePresence mode="wait">
          {!res ? (
            <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="glass grid h-full min-h-80 place-items-center rounded-3xl p-8 text-center">
              <div>
                <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-2xl bg-brand"><Calculator className="h-8 w-8 text-white" /></div>
                <p className="max-w-sm text-slate-400">{t("valuation.subtitle")}</p>
              </div>
            </motion.div>
          ) : (
            <motion.div key={`${res.low}-${res.high}`} initial={{ opacity: 0, y: 20, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: "spring", stiffness: 200, damping: 24 }} className="space-y-5">
              <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-electric/25 via-violet/20 to-cyan/10 p-8 ring-1 ring-white/10">
                <div className="grid-bg absolute inset-0 opacity-50" />
                <div className="relative">
                  <div className="text-xs font-semibold uppercase tracking-[0.2em] text-electric-400">{t("valuation.range")}</div>
                  <div className="mt-3 font-display text-4xl font-semibold text-white sm:text-5xl">
                    <CountUp value={res.low} format="usd" /> – <CountUp value={res.high} format="usd" />
                  </div>
                  <div className="mt-2 text-sm text-slate-300">
                    {res.method === "profit-multiple" && res.multiple && `${res.multiple.low}×–${res.multiple.high}× annual profit`}
                    {res.method === "revenue-multiple" && res.multiple && `${res.multiple.low}×–${res.multiple.high}× annual revenue`}
                    {res.method === "asset-value" && "Asset-based estimate (pre-revenue)"}
                  </div>
                  {/* Range bar */}
                  <div className="mt-6 h-2 rounded-full bg-white/10">
                    <motion.div initial={{ width: 0 }} animate={{ width: "100%" }} transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }} className="h-full rounded-full bg-gradient-to-r from-electric via-violet to-cyan" />
                  </div>
                </div>
              </div>
              <div className="glass rounded-3xl p-6">
                <div className="mb-3 flex items-center gap-2 font-display font-semibold text-white"><ListChecks className="h-5 w-5 text-electric-400" /> {t("valuation.assumptions")}</div>
                <ul className="space-y-2 text-sm text-slate-300">{res.assumptions.map((a) => <li key={a} className="flex gap-2"><span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-electric-400" />{a}</li>)}</ul>
              </div>
              {res.analysis ? (
                <div className="glass rounded-3xl p-6">
                  <div className="mb-3 flex items-center gap-2 font-display font-semibold text-white"><Bot className="h-5 w-5 text-violet-400" /> {t("valuation.aiAnalysis")}</div>
                  <p className="whitespace-pre-line text-sm leading-relaxed text-slate-300">{res.analysis}</p>
                  <p className="mt-3 text-xs text-slate-500">AI-generated commentary. It may contain mistakes and is not financial advice.</p>
                </div>
              ) : !aiEnabled ? null : <Alert tone="amber">AI analysis is temporarily unavailable — the model-based estimate above is still valid.</Alert>}
              <Alert tone="blue">{t("valuation.disclaimer")}</Alert>
              <LinkButton href="/sell" className="w-full" size="lg">{t("valuation.listIt")}</LinkButton>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
