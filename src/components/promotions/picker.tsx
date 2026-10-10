"use client";

import { useState, useTransition } from "react";
import { motion } from "framer-motion";
import { Check, Crown, Megaphone, Rocket, Sparkles } from "lucide-react";
import { Button } from "../ui";
import { Modal } from "../modal";
import { useToast } from "../toast";
import { useLocale, useT } from "@/i18n/client";
import { buyPromotionAction } from "@/app/actions/promotions";
import { formatMoney, type CurrencyCode } from "@/lib/money";
import { cn } from "@/lib/utils";

export type PackageView = { code: string; name: string; price: number; currency: string; durationDays: number; features: string[]; border: "HIGHLIGHT" | "ANIMATED" | "GOLDEN" };

const ICON = { HIGHLIGHT: Rocket, ANIMATED: Sparkles, GOLDEN: Crown };

export function PackageCards({ packages, selected, onSelect, compact }: { packages: PackageView[]; selected?: string; onSelect?: (code: string) => void; compact?: boolean }) {
  const t = useT();
  const locale = useLocale();
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {packages.map((p, i) => {
        const Icon = ICON[p.border];
        const active = selected === p.code;
        return (
          <motion.button
            type="button"
            key={p.code}
            onClick={() => onSelect?.(p.code)}
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: active ? 1.03 : 1 }}
            whileHover={{ y: -6 }}
            transition={{ delay: i * 0.08, type: "spring", stiffness: 300, damping: 24 }}
            className={cn(
              "glass relative flex flex-col rounded-2xl p-5 text-left transition-shadow",
              p.border === "HIGHLIGHT" && "border-highlight",
              p.border === "ANIMATED" && "border-animated",
              p.border === "GOLDEN" && "border-animated border-golden",
              active && (p.border === "GOLDEN" ? "shadow-[0_0_60px_-10px_rgba(245,196,81,0.7)]" : "shadow-[0_0_60px_-10px_rgba(99,102,241,0.8)]"),
              !onSelect && "cursor-default",
            )}
          >
            {p.border === "ANIMATED" && <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-brand px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">Popular</span>}
            <span className={cn("grid h-10 w-10 place-items-center rounded-xl ring-1", p.border === "GOLDEN" ? "bg-amber-400/15 text-amber-300 ring-amber-300/40" : "bg-electric/15 text-electric-400 ring-electric/30")}><Icon className="h-5 w-5" /></span>
            <div className={cn("mt-4 font-display text-lg font-semibold", p.border === "GOLDEN" ? "text-amber-200" : "text-white")}>{p.name}</div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="font-display text-3xl font-semibold text-white">{formatMoney(p.price, p.currency as CurrencyCode, { locale })}</span>
              <span className="text-sm text-slate-400">· {t("promo.days", { days: p.durationDays })}</span>
            </div>
            {!compact && (
              <ul className="mt-4 space-y-2 text-sm text-slate-300">
                {p.features.map((f) => <li key={f} className="flex gap-2"><Check className={cn("mt-0.5 h-4 w-4 shrink-0", p.border === "GOLDEN" ? "text-amber-300" : "text-emerald-400")} /> {f}</li>)}
              </ul>
            )}
            {active && <motion.span layoutId="pkg-check" className="absolute top-4 right-4 grid h-6 w-6 place-items-center rounded-full bg-brand"><Check className="h-4 w-4 text-white" /></motion.span>}
          </motion.button>
        );
      })}
    </div>
  );
}

export function PromotionPicker({ listings, packages, initialListing }: { listings: { id: string; title: string }[]; packages: PackageView[]; initialListing?: string }) {
  const t = useT();
  const toast = useToast();
  const [open, setOpen] = useState(Boolean(initialListing));
  const [listing, setListing] = useState(initialListing ?? listings[0]?.id ?? "");
  const [pkg, setPkg] = useState(packages[1]?.code ?? packages[0]?.code);
  const [pending, start] = useTransition();
  const chosen = packages.find((p) => p.code === pkg);
  return (
    <>
      <Button variant="gold" onClick={() => setOpen(true)} disabled={!listings.length}><Megaphone className="h-4 w-4" /> {t("promo.title")}</Button>
      <Modal open={open} onClose={() => setOpen(false)} title={t("promo.title")} wide>
        <p className="-mt-2 mb-5 text-sm text-slate-400">{t("promo.subtitle")}</p>
        <label className="label">Listing</label>
        <select className="input mb-6" value={listing} onChange={(e) => setListing(e.target.value)}>
          {listings.map((l) => <option key={l.id} value={l.id}>{l.title}</option>)}
        </select>
        <PackageCards packages={packages} selected={pkg} onSelect={setPkg} />
        <p className="mt-5 text-xs text-slate-500">Promoted listings are always labelled as advertisements. Promotions start only after the payment provider verifies your payment and end automatically.</p>
        <Button
          size="lg"
          variant={chosen?.border === "GOLDEN" ? "gold" : "primary"}
          className="mt-5 w-full"
          loading={pending}
          disabled={!listing || !chosen}
          onClick={() => start(async () => {
            const r = await buyPromotionAction(listing, pkg!);
            if (!r.ok) return toast.error(r.error);
            window.location.href = r.data!.url;
          })}
        >
          {chosen ? t("promo.buy", { price: formatMoney(chosen.price, chosen.currency as CurrencyCode) }) : ""}
        </Button>
      </Modal>
    </>
  );
}
