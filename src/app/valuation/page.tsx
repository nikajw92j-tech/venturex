import type { Metadata } from "next";
import { Sparkles } from "lucide-react";
import { getI18n } from "@/i18n/server";
import { aiEnabled } from "@/lib/ai";
import { ValuationForm } from "@/components/valuation/form";

export const metadata: Metadata = {
  title: "AI Business Valuation",
  description: "Estimate what your website, SaaS or online business is worth, with transparent assumptions.",
  alternates: { canonical: "/valuation" },
};

export default async function ValuationPage() {
  const { t } = await getI18n();
  return (
    <div className="relative overflow-hidden">
      <div className="pointer-events-none absolute -top-40 left-1/3 h-[480px] w-[480px] rounded-full bg-violet/20 blur-[120px]" />
      <div className="container-x relative py-14">
        <div className="mb-10 max-w-2xl">
          <div className="glass inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs text-violet-300"><Sparkles className="h-3.5 w-3.5" /> {t("nav.valuation")}</div>
          <h1 className="mt-4 font-display text-4xl font-semibold text-white sm:text-5xl">{t("valuation.title")}</h1>
          <p className="mt-3 text-lg text-slate-400">{t("valuation.subtitle")}</p>
        </div>
        <ValuationForm aiEnabled={aiEnabled()} />
      </div>
    </div>
  );
}
