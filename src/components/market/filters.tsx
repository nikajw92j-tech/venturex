"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { BookmarkPlus, Search, SlidersHorizontal, X } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { useLocale, useT, useDisplayCurrency } from "@/i18n/client";
import { COUNTRIES, MAIN_CATEGORIES, STARTER_CATEGORIES } from "@/lib/categories";
import { CURRENCY_SYMBOL } from "@/lib/money";
import { Button } from "../ui";
import { saveSearchAction } from "@/app/actions/engagement";
import { useToast } from "../toast";
import { cn } from "@/lib/utils";

type Props = { market?: "MAIN" | "STARTER"; showSaleType?: boolean; loggedIn: boolean; lockedType?: "AUCTION" };

export function useQueryUpdater() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pending, start] = useTransition();
  const set = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "") p.delete(k);
      else p.set(k, v);
    }
    if (!("page" in patch)) p.delete("page");
    start(() => router.push(`${pathname}?${p.toString()}`, { scroll: false }));
  };
  return { sp, set, pending };
}

export function SortSelect({ ending = true }: { ending?: boolean }) {
  const t = useT();
  const { sp, set } = useQueryUpdater();
  return (
    <select aria-label={t("market.sort")} className="input w-auto py-2" value={sp.get("sort") ?? "newest"} onChange={(e) => set({ sort: e.target.value === "newest" ? null : e.target.value })}>
      <option value="newest">{t("market.sort.newest")}</option>
      <option value="priceAsc">{t("market.sort.priceAsc")}</option>
      <option value="priceDesc">{t("market.sort.priceDesc")}</option>
      <option value="revenue">{t("market.sort.revenue")}</option>
      <option value="popular">{t("market.sort.popular")}</option>
      {ending && <option value="ending">{t("market.sort.ending")}</option>}
    </select>
  );
}

export function SearchBar() {
  const t = useT();
  const { sp, set } = useQueryUpdater();
  const [q, setQ] = useState(sp.get("q") ?? "");
  useEffect(() => setQ(sp.get("q") ?? ""), [sp]);
  return (
    <form onSubmit={(e) => { e.preventDefault(); set({ q: q.trim() || null }); }} className="relative flex-1">
      <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-slate-500" />
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("market.searchPlaceholder")} className="input h-11 pl-10" aria-label={t("common.search")} />
    </form>
  );
}

export function FilterPanel({ market = "MAIN", showSaleType = true, loggedIn, lockedType }: Props) {
  const t = useT();
  const locale = useLocale();
  const toast = useToast();
  const { currency } = useDisplayCurrency();
  const { sp, set, pending } = useQueryUpdater();
  const [open, setOpen] = useState(false);
  const cats = market === "STARTER" ? STARTER_CATEGORIES : MAIN_CATEGORIES;
  const sym = CURRENCY_SYMBOL[currency];
  const active = [...sp.keys()].filter((k) => !["sort", "page", "q"].includes(k)).length;

  const num = (k: string, label: string) => (
    <input type="number" min={0} inputMode="numeric" placeholder={label} defaultValue={sp.get(k) ?? ""} key={`${k}-${sp.get(k)}`} onBlur={(e) => e.target.value !== (sp.get(k) ?? "") && set({ [k]: e.target.value || null })} onKeyDown={(e) => e.key === "Enter" && set({ [k]: (e.target as HTMLInputElement).value || null })} className="input py-2" />
  );
  const toggle = (k: string, label: string) => (
    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg px-1 py-1.5 text-sm text-slate-300">
      {label}
      <button type="button" role="switch" aria-checked={sp.get(k) === "1"} onClick={() => set({ [k]: sp.get(k) === "1" ? null : "1" })} className={cn("relative h-5 w-9 rounded-full transition", sp.get(k) === "1" ? "bg-brand" : "bg-white/10")}>
        <motion.span layout className={cn("absolute top-0.5 h-4 w-4 rounded-full bg-white shadow", sp.get(k) === "1" ? "right-0.5" : "left-0.5")} />
      </button>
    </label>
  );

  const body = (
    <div className={cn("space-y-6 transition-opacity", pending && "opacity-60")}>
      <div>
        <div className="label">{t("common.category")}</div>
        <div className="flex flex-wrap gap-1.5">
          <button onClick={() => set({ category: null })} className={cn("rounded-full px-3 py-1 text-xs font-medium transition", !sp.get("category") ? "bg-brand text-white" : "bg-white/5 text-slate-300 hover:bg-white/10")}>{t("market.all")}</button>
          {cats.map((c) => (
            <button key={c.key} onClick={() => set({ category: sp.get("category") === c.key ? null : c.key })} className={cn("rounded-full px-3 py-1 text-xs font-medium transition", sp.get("category") === c.key ? "bg-brand text-white" : "bg-white/5 text-slate-300 hover:bg-white/10")}>
              {c.label[locale]}
            </button>
          ))}
        </div>
      </div>
      {showSaleType && !lockedType && (
        <div>
          <div className="label">{t("market.saleType")}</div>
          <div className="grid grid-cols-3 gap-1 rounded-xl bg-white/5 p-1">
            {[["", t("market.all")], ["FIXED", t("common.fixedPrice")], ["AUCTION", t("common.auction")]].map(([v, l]) => (
              <button key={v} onClick={() => set({ type: v || null })} className={cn("relative rounded-lg py-1.5 text-xs font-semibold transition", (sp.get("type") ?? "") === v ? "text-white" : "text-slate-400")}>
                {(sp.get("type") ?? "") === v && <motion.span layoutId={`saletype-${market}`} className="absolute inset-0 -z-0 rounded-lg bg-brand" />}
                <span className="relative">{l}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      <div>
        <div className="label">{t("market.price")} ({sym})</div>
        <div className="grid grid-cols-2 gap-2">{num("priceMin", t("market.min"))}{num("priceMax", t("market.max"))}</div>
      </div>
      {market === "MAIN" && (
        <>
          <div>
            <div className="label">{t("market.revenue")} ({sym})</div>
            {num("revenueMin", t("market.min"))}
          </div>
          <div>
            <div className="label">{t("market.profit")} ({sym})</div>
            {num("profitMin", t("market.min"))}
          </div>
          <div>
            <div className="label">{t("market.ageMin")}</div>
            {num("ageMin", "0")}
          </div>
        </>
      )}
      <div>
        <div className="label">{t("common.country")}</div>
        <select className="input py-2" value={sp.get("country") ?? ""} onChange={(e) => set({ country: e.target.value || null })}>
          <option value="">{t("market.all")}</option>
          {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
        </select>
      </div>
      <div>
        <div className="label">{t("market.tech")}</div>
        <input className="input py-2" placeholder="Next.js, Shopify, Python…" defaultValue={sp.get("tech") ?? ""} key={`tech-${sp.get("tech")}`} onBlur={(e) => e.target.value !== (sp.get("tech") ?? "") && set({ tech: e.target.value || null })} />
      </div>
      <div className="space-y-1">
        {market === "MAIN" && toggle("verified", t("market.verifiedOnly"))}
        {toggle("recent", t("market.recent"))}
        {(showSaleType || lockedType) && toggle("ending", t("market.endingSoon"))}
      </div>
      <div className="flex gap-2">
        <Button variant="secondary" size="sm" className="flex-1" onClick={() => set(Object.fromEntries([...sp.keys()].map((k) => [k, null])))}>{t("common.reset")}</Button>
        {loggedIn && (
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={async () => {
              const r = await saveSearchAction(Object.fromEntries(sp.entries()), market);
              if (r.ok) toast.success(t("market.searchSaved"));
              else toast.error(r.error);
            }}
          >
            <BookmarkPlus className="h-3.5 w-3.5" /> {t("market.saveSearch")}
          </Button>
        )}
      </div>
    </div>
  );

  return (
    <>
      <Button variant="secondary" className="lg:hidden" onClick={() => setOpen(true)}>
        <SlidersHorizontal className="h-4 w-4" /> {t("common.filters")} {active > 0 && <span className="rounded-full bg-brand px-1.5 text-[10px]">{active}</span>}
      </Button>
      <aside className="glass sticky top-20 hidden max-h-[calc(100vh-6rem)] overflow-y-auto rounded-2xl p-5 lg:block">{body}</aside>
      <AnimatePresence>
        {open && (
          <motion.div className="fixed inset-0 z-50 lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
            <motion.div initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ type: "spring", damping: 30, stiffness: 300 }} className="glass-strong absolute top-0 right-0 bottom-0 w-[88%] max-w-sm overflow-y-auto p-5">
              <div className="mb-5 flex items-center justify-between">
                <span className="font-display text-lg font-semibold text-white">{t("common.filters")}</span>
                <button onClick={() => setOpen(false)} aria-label={t("common.close")} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-white/5"><X className="h-5 w-5" /></button>
              </div>
              {body}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

export function Pagination({ page, pages }: { page: number; pages: number }) {
  const { set } = useQueryUpdater();
  if (pages <= 1) return null;
  const nums = Array.from({ length: pages }, (_, i) => i + 1).filter((n) => n === 1 || n === pages || Math.abs(n - page) <= 2);
  return (
    <nav className="mt-10 flex flex-wrap items-center justify-center gap-1.5" aria-label="Pagination">
      {nums.map((n, i) => (
        <span key={n} className="flex items-center gap-1.5">
          {i > 0 && nums[i - 1] !== n - 1 && <span className="px-1 text-slate-600">…</span>}
          <button onClick={() => set({ page: n === 1 ? null : String(n) })} className={cn("h-9 min-w-9 rounded-lg px-2 text-sm font-semibold transition", n === page ? "bg-brand text-white" : "glass text-slate-300 hover:text-white")} aria-current={n === page ? "page" : undefined}>
            {n}
          </button>
        </span>
      ))}
    </nav>
  );
}
