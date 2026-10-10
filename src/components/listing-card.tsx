"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { BadgeCheck, Clock, Code2, ExternalLink, Gavel, Megaphone, ShieldCheck, Star, TrendingUp } from "lucide-react";
import { useEffect, useRef } from "react";
import type { ListingCardData } from "@/lib/listings";
import { categoryLabel } from "@/lib/categories";
import { useLocale, useMoney, useT } from "@/i18n/client";
import { InlineCountdown } from "./countdown";
import { Badge } from "./ui";
import { cn } from "@/lib/utils";

const seen = new Set<string>();
let queue: string[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

function track(listingIds: string[], kind: "impression" | "click") {
  const body = JSON.stringify({ listingIds, kind });
  if (kind === "click" && navigator.sendBeacon) {
    navigator.sendBeacon("/api/promotions/track", new Blob([body], { type: "application/json" }));
  } else {
    fetch("/api/promotions/track", { method: "POST", body, headers: { "Content-Type": "application/json" }, keepalive: true }).catch(() => {});
  }
}

function queueImpression(id: string) {
  if (seen.has(id)) return;
  seen.add(id);
  queue.push(id);
  timer ??= setTimeout(() => {
    track(queue, "impression");
    queue = [];
    timer = null;
  }, 1500);
}

function Monogram({ title }: { title: string }) {
  const letters = title.replace(/[^A-Za-z0-9ა-ჰА-я ]/g, "").split(" ").filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  return (
    <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-electric/80 via-violet/80 to-cyan/60 font-display text-sm font-bold text-white ring-1 ring-white/20">
      {letters || "VX"}
    </div>
  );
}

export function Money({ amount, currency, className, compact }: { amount: number; currency: ListingCardData["currency"]; className?: string; compact?: boolean }) {
  const money = useMoney();
  const m = money(amount, currency, { compact });
  return (
    <span className={className} title={m.converted ? `${m.original} (contract currency)` : undefined}>
      {m.primary}
    </span>
  );
}

export function ListingCard({ l, index = 0 }: { l: ListingCardData; index?: number }) {
  const t = useT();
  const locale = useLocale();
  const ref = useRef<HTMLAnchorElement>(null);
  const isAuction = l.saleType === "AUCTION" && l.auction;
  const promo = l.promotion;

  useEffect(() => {
    if (!promo || !ref.current) return;
    const el = ref.current;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          queueImpression(l.id);
          io.disconnect();
        }
      },
      { threshold: 0.5 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [promo, l.id]);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.5, delay: Math.min(index, 8) * 0.05, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -6 }}
      className="h-full"
    >
      <Link
        ref={ref}
        href={`/listing/${l.slug}`}
        onClick={() => promo && track([l.id], "click")}
        className={cn(
          "group glass card-shadow relative flex h-full flex-col overflow-hidden rounded-2xl transition-shadow duration-300 hover:shadow-[0_30px_60px_-20px_rgba(59,130,246,0.35)]",
          promo?.border === "HIGHLIGHT" && "border-highlight",
          promo?.border === "ANIMATED" && "border-animated",
          promo?.border === "GOLDEN" && "border-animated border-golden",
        )}
      >
        {/* Cover */}
        <div className="relative aspect-[16/9] overflow-hidden bg-ink-850">
          {l.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={l.coverUrl} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover transition duration-700 group-hover:scale-105" />
          ) : (
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(59,130,246,0.35),transparent_50%),radial-gradient(circle_at_80%_80%,rgba(139,92,246,0.35),transparent_50%)]">
              <div className="grid-bg absolute inset-0 opacity-60" />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-ink-950/90 via-ink-950/10 to-transparent" />
          <div className="absolute top-3 left-3 flex flex-wrap gap-1.5">
            {promo && (
              <Badge tone={promo.border === "GOLDEN" ? "gold" : "violet"} className="backdrop-blur">
                <Megaphone className="h-3 w-3" /> {t("common.promoted")} · {t("common.ad")}
              </Badge>
            )}
            {isAuction && l.auction!.live && (
              <Badge tone="red" className="backdrop-blur">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-red-500" />
                </span>
                LIVE
              </Badge>
            )}
            {l.isPreRevenue && <Badge tone="cyan">{t("common.preRevenue")}</Badge>}
          </div>
          {l.qualityScore !== null && (
            <div className="absolute top-3 right-3 rounded-full bg-ink-950/70 px-2 py-0.5 text-[11px] font-semibold text-emerald-300 ring-1 ring-emerald-400/30 backdrop-blur" title="Project quality indicator">
              <Star className="mr-0.5 inline h-3 w-3" />
              {l.qualityScore}
            </div>
          )}
        </div>

        {/* Body */}
        <div className="relative -mt-8 flex flex-1 flex-col p-4">
          <div className="flex items-end gap-3">
            {l.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={l.logoUrl} alt="" loading="lazy" className="h-11 w-11 shrink-0 rounded-xl bg-ink-900 object-cover ring-1 ring-white/20" />
            ) : (
              <Monogram title={l.title} />
            )}
            <div className="min-w-0 pb-0.5">
              <div className="text-[11px] font-medium uppercase tracking-wider text-electric-400">{categoryLabel(l.category, locale)}</div>
            </div>
          </div>
          <h3 className="mt-3 line-clamp-1 font-display text-[17px] font-semibold text-white transition group-hover:text-gradient">{l.title}</h3>
          {l.tagline && <p className="mt-1 line-clamp-2 text-sm text-slate-400">{l.tagline}</p>}

          {l.market === "STARTER" ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {l.techStack.map((s) => (
                <span key={s} className="rounded-md bg-white/5 px-1.5 py-0.5 text-[11px] text-slate-300 ring-1 ring-white/10">{s}</span>
              ))}
              {l.sourceCodeIncluded && (
                <span className="flex items-center gap-1 rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[11px] text-emerald-300 ring-1 ring-emerald-500/20">
                  <Code2 className="h-3 w-3" /> Source
                </span>
              )}
              {l.demoVerified && (
                <span className="flex items-center gap-1 rounded-md bg-electric/10 px-1.5 py-0.5 text-[11px] text-electric-400 ring-1 ring-electric/20">
                  <ExternalLink className="h-3 w-3" /> Demo ✓
                </span>
              )}
            </div>
          ) : (
            <div className="mt-4 grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-white/[0.03] px-3 py-2 ring-1 ring-white/5">
                <div className="text-[10px] uppercase tracking-wider text-slate-500">{t("common.monthlyRevenue")}</div>
                <div className="mt-0.5 flex items-center gap-1 text-sm font-semibold text-slate-100">
                  <TrendingUp className="h-3 w-3 text-emerald-400" />
                  <Money amount={l.monthlyRevenue} currency={l.currency} compact />
                </div>
              </div>
              <div className="rounded-xl bg-white/[0.03] px-3 py-2 ring-1 ring-white/5">
                <div className="text-[10px] uppercase tracking-wider text-slate-500">{t("common.monthlyProfit")}</div>
                <div className="mt-0.5 text-sm font-semibold text-slate-100">
                  <Money amount={l.monthlyProfit} currency={l.currency} compact />
                </div>
              </div>
            </div>
          )}

          <div className="mt-auto flex items-end justify-between gap-2 pt-4">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-slate-500">
                {isAuction ? (l.auction!.hasBids ? t("common.currentBid") : t("common.startingBid")) : t("common.askingPrice")}
              </div>
              <Money amount={l.price} currency={l.currency} className="font-display text-xl font-semibold text-white" />
            </div>
            {isAuction ? (
              <div className="text-right text-xs">
                <div className="flex items-center justify-end gap-1 text-slate-500">
                  <Clock className="h-3 w-3" />
                  <InlineCountdown endsAt={l.auction!.endsAt} className="font-semibold" />
                </div>
                <div className="mt-0.5 flex items-center justify-end gap-1 text-slate-400">
                  <Gavel className="h-3 w-3" /> {l.auction!.bidCount} {t("common.bids")}
                </div>
              </div>
            ) : (
              <span className="text-xs text-slate-500">{t("common.fixedPrice")}</span>
            )}
          </div>

          <div className="mt-3 flex items-center justify-between border-t border-white/5 pt-3 text-xs text-slate-400">
            <span className="flex min-w-0 items-center gap-1 truncate">
              {l.sellerVerified ? <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-electric-400" /> : null}
              <span className="truncate">{l.sellerName}</span>
            </span>
            {l.financialsVerified && (
              <span className="flex items-center gap-1 text-emerald-300">
                <ShieldCheck className="h-3.5 w-3.5" /> {t("common.verified")}
              </span>
            )}
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

export function ListingGrid({ items, className }: { items: ListingCardData[]; className?: string }) {
  return (
    <div className={cn("grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4", className)}>
      {items.map((l, i) => (
        <ListingCard key={l.id} l={l} index={i} />
      ))}
    </div>
  );
}

export function ListingGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="glass overflow-hidden rounded-2xl">
          <div className="skeleton aspect-[16/9] rounded-none" />
          <div className="space-y-3 p-4">
            <div className="skeleton h-4 w-1/3" />
            <div className="skeleton h-5 w-2/3" />
            <div className="grid grid-cols-2 gap-2">
              <div className="skeleton h-12" />
              <div className="skeleton h-12" />
            </div>
            <div className="skeleton h-6 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}
