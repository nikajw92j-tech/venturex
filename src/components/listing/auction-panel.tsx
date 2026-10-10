"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { Crown, Gavel, Info, ShieldAlert, Timer, TrendingUp, Zap } from "lucide-react";
import { useRealtime } from "../realtime";
import { Countdown, setServerTime, useCountdown } from "../countdown";
import { Button, Badge, buttonClass } from "../ui";
import { Modal } from "../modal";
import { useToast } from "../toast";
import { celebrate } from "../confetti";
import { useMoney, useT, useLocale } from "@/i18n/client";
import { auctionBuyNowAction, placeBidAction } from "@/app/actions/trade";
import { formatMoney, type CurrencyCode } from "@/lib/money";
import { cn, timeAgo } from "@/lib/utils";

export type BidRow = { bidder: string; bidderId: string; amount: number; isAuto: boolean; at: string };

type Props = {
  auctionId: string;
  currency: CurrencyCode;
  status: "LIVE" | "ENDED" | "CANCELLED";
  startingBid: number;
  currentBid: number | null;
  minNext: number;
  minIncrement: number;
  bidCount: number;
  leaderId: string | null;
  winnerId: string | null;
  endsAt: string | null;
  extensions: number;
  hasReserve: boolean;
  reserveMet: boolean;
  buyNowPrice: number | null;
  bids: BidRow[];
  userId: string | null;
  isSeller: boolean;
  emailVerified: boolean;
  serverTime: string;
  myDealId: string | null;
};

export function AuctionPanel(p: Props) {
  const t = useT();
  const locale = useLocale();
  const money = useMoney();
  const toast = useToast();
  const router = useRouter();
  const [s, setS] = useState({ currentBid: p.currentBid, minNext: p.minNext, bidCount: p.bidCount, leaderId: p.leaderId, endsAt: p.endsAt, reserveMet: p.reserveMet, status: p.status, winnerId: p.winnerId, extensions: p.extensions });
  const [bids, setBids] = useState<BidRow[]>(p.bids);
  const [flash, setFlash] = useState(0);
  const [extendedBanner, setExtendedBanner] = useState(false);
  const [amount, setAmount] = useState(String(p.minNext / 100));
  const [maxBid, setMaxBid] = useState("");
  const [confirm, setConfirm] = useState<null | "bid" | "buy">(null);
  const [pending, start] = useTransition();

  useEffect(() => setServerTime(p.serverTime), [p.serverTime]);

  useRealtime(
    [`auction:${p.auctionId}`],
    (m) => {
      const e = m.event as Record<string, unknown>;
      if (e.type === "bid") {
        const prevLeader = s.leaderId;
        setS((x) => ({ ...x, currentBid: e.currentBid as number, minNext: e.minNext as number, bidCount: e.bidCount as number, leaderId: e.leaderId as string, endsAt: e.endsAt as string, reserveMet: e.reserveMet as boolean, extensions: x.extensions + (e.extended ? 1 : 0) }));
        setBids((b) => [...((e.bids as BidRow[]) ?? []).slice().reverse(), ...b].slice(0, 50));
        setFlash((f) => f + 1);
        setAmount((a) => (Number(a) * 100 < (e.minNext as number) ? String((e.minNext as number) / 100) : a));
        if (e.extended) {
          setExtendedBanner(true);
          setTimeout(() => setExtendedBanner(false), 6000);
        }
        if (p.userId && prevLeader === p.userId && e.leaderId !== p.userId) toast.error(t("auction.outbid"));
      } else if (e.type === "ended") {
        setS((x) => ({ ...x, status: "ENDED", winnerId: (e.winnerId as string) ?? null, currentBid: (e.currentBid as number) ?? x.currentBid }));
        if (p.userId && e.winnerId === p.userId) {
          celebrate();
          router.refresh();
        }
      }
    },
    () => router.refresh(),
  );

  const left = useCountdown(s.endsAt);
  const ended = s.status !== "LIVE" || !s.endsAt || (left !== null && left <= 0);
  useEffect(() => {
    // When the clock runs out, ask the server to settle and pull the final state.
    if (s.status === "LIVE" && s.endsAt && left !== null && left <= 0) {
      const id = setTimeout(() => fetch(`/api/auctions/${p.auctionId}/settle`, { method: "POST" }).finally(() => router.refresh()), 1500);
      return () => clearTimeout(id);
    }
  }, [left !== null && left <= 0, s.status]); // eslint-disable-line react-hooks/exhaustive-deps
  const leading = Boolean(p.userId && s.leaderId === p.userId);
  const price = s.currentBid ?? p.startingBid;
  const m = money(price, p.currency);
  const quick = useMemo(() => [s.minNext, s.minNext + p.minIncrement * 2, s.minNext + p.minIncrement * 5], [s.minNext, p.minIncrement]);
  const buyNowAvailable = p.buyNowPrice !== null && (s.currentBid ?? 0) < p.buyNowPrice && !ended;

  function submitBid() {
    start(async () => {
      const r = await placeBidAction(p.auctionId, Number(amount), maxBid ? Number(maxBid) : null);
      setConfirm(null);
      if (!r.ok) return toast.error(r.error);
      if (r.data?.leading) toast.success(t("auction.leading"));
      else toast.error(t("auction.outbid"));
      setMaxBid("");
    });
  }

  function submitBuyNow() {
    start(async () => {
      const r = await auctionBuyNowAction(p.auctionId);
      setConfirm(null);
      if (!r.ok) return toast.error(r.error);
      celebrate();
      router.push(`/dashboard/deals/${r.data!.dealId}`);
    });
  }

  return (
    <div className="glass-strong card-shadow overflow-hidden rounded-2xl">
      <div className="relative border-b border-white/5 bg-gradient-to-br from-electric/10 via-transparent to-violet/10 p-5">
        <div className="mb-3 flex items-center justify-between">
          {ended ? (
            <Badge tone="neutral">{t("common.ended")}</Badge>
          ) : (
            <Badge tone="red">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-400" /> LIVE
            </Badge>
          )}
          <div className="flex items-center gap-2">
            {p.hasReserve ? <Badge tone={s.reserveMet ? "green" : "amber"}>{s.reserveMet ? t("common.reserveMet") : t("common.reserveNotMet")}</Badge> : <Badge tone="blue">{t("common.noReserve")}</Badge>}
          </div>
        </div>
        <div className="text-xs uppercase tracking-wider text-slate-400">{s.currentBid !== null ? t("common.currentBid") : t("common.startingBid")}</div>
        <motion.div key={flash} initial={flash ? { scale: 1.08, color: "#93c5fd" } : false} animate={{ scale: 1, color: "#ffffff" }} transition={{ duration: 0.6 }} className="font-display text-4xl font-semibold tabular-nums">
          {m.primary}
        </motion.div>
        {m.converted && <div className="text-xs text-slate-500">{t("common.originalPrice")}: {m.original}</div>}
        <div className="mt-2 flex items-center gap-3 text-sm text-slate-400">
          <span className="flex items-center gap-1"><Gavel className="h-4 w-4" /> {s.bidCount} {t("common.bids")}</span>
          {s.extensions > 0 && <span className="flex items-center gap-1 text-amber-300"><Timer className="h-4 w-4" /> {t("auction.extensions", { count: s.extensions })}</span>}
        </div>
      </div>

      <div className="space-y-5 p-5">
        <div>
          <div className="mb-2 text-xs uppercase tracking-wider text-slate-500">{ended ? t("common.ended") : t("common.endsIn")}</div>
          <Countdown endsAt={ended ? null : s.endsAt} big endedLabel={t("auction.ended")} />
          <AnimatePresence>
            {extendedBanner && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="mt-3 flex items-center gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-200 ring-1 ring-amber-500/30">
                <ShieldAlert className="h-4 w-4" /> {t("auction.extended")}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {ended ? (
          <div className="rounded-xl bg-white/[0.03] p-4 text-sm ring-1 ring-white/5">
            {s.winnerId && p.userId === s.winnerId ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 font-semibold text-emerald-300"><Crown className="h-4 w-4" /> {t("auction.won")}</div>
                {p.myDealId && <Link href={`/dashboard/deals/${p.myDealId}`} className={buttonClass("primary", "md", "w-full")}>{t("dash.pendingPayments")}</Link>}
              </div>
            ) : (
              <div className="text-slate-400">{t("auction.ended")}</div>
            )}
          </div>
        ) : p.isSeller ? (
          <div className="flex items-start gap-2 rounded-xl bg-white/[0.03] p-4 text-sm text-slate-400 ring-1 ring-white/5"><Info className="mt-0.5 h-4 w-4 shrink-0" /> {t("auction.sellerCannotBid")}</div>
        ) : !p.userId ? (
          <Link href={`/login?next=${encodeURIComponent(typeof window !== "undefined" ? window.location.pathname : "/")}`} className={buttonClass("primary", "lg", "w-full")}>{t("common.signInToContinue")}</Link>
        ) : (
          <div className="space-y-3">
            {leading && (
              <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-sm font-medium text-emerald-300 ring-1 ring-emerald-500/30">
                <TrendingUp className="h-4 w-4" /> {t("auction.leading")}
              </motion.div>
            )}
            <div>
              <label className="label" htmlFor="bid-amount">{t("auction.yourBid")} ({p.currency})</label>
              <input id="bid-amount" type="number" inputMode="decimal" step="any" min={s.minNext / 100} value={amount} onChange={(e) => setAmount(e.target.value)} className="input h-12 text-lg font-semibold" />
              <div className="mt-1 text-xs text-slate-500">{t("auction.minNext", { amount: formatMoney(s.minNext, p.currency, { locale }) })}</div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {quick.map((q) => (
                <button key={q} onClick={() => setAmount(String(q / 100))} className="rounded-lg bg-white/5 py-1.5 text-xs font-semibold text-slate-200 ring-1 ring-white/10 transition hover:bg-electric/15 hover:ring-electric/40">
                  {formatMoney(q, p.currency, { compact: true })}
                </button>
              ))}
            </div>
            <details className="group rounded-xl bg-white/[0.03] ring-1 ring-white/5">
              <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-sm text-slate-300"><Zap className="h-4 w-4 text-violet-400" /> {t("auction.maxBid")}</summary>
              <div className="px-3 pb-3">
                <input type="number" inputMode="decimal" step="any" placeholder={t("common.optional")} value={maxBid} onChange={(e) => setMaxBid(e.target.value)} className="input" />
                <p className="mt-1.5 text-xs text-slate-500">{t("auction.maxBidHelp")}</p>
              </div>
            </details>
            {!p.emailVerified && <p className="text-xs text-amber-300">{t("auth.verifyBanner")}</p>}
            <Button size="lg" className="w-full" onClick={() => setConfirm("bid")} disabled={!p.emailVerified || !amount}>
              <Gavel className="h-4 w-4" /> {t("auction.placeBid")}
            </Button>
            {buyNowAvailable && (
              <Button variant="gold" size="lg" className="w-full" onClick={() => setConfirm("buy")} disabled={!p.emailVerified}>
                {t("auction.buyNowFor", { amount: formatMoney(p.buyNowPrice!, p.currency, { locale }) })}
              </Button>
            )}
          </div>
        )}

        <div>
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="font-semibold text-white">{t("auction.history")}</span>
            <span className="flex items-center gap-1.5 text-xs text-slate-500">
              <span className="relative flex h-1.5 w-1.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" /><span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" /></span>
              {t("auction.liveActivity")}
            </span>
          </div>
          <div className="max-h-64 space-y-1 overflow-y-auto pr-1">
            {bids.length === 0 ? (
              <p className="py-4 text-center text-sm text-slate-500">{t("auction.noBids")}</p>
            ) : (
              <AnimatePresence initial={false}>
                {bids.map((b, i) => (
                  <motion.div key={`${b.at}-${b.amount}-${i}`} layout initial={{ opacity: 0, x: -16, backgroundColor: "rgba(59,130,246,0.25)" }} animate={{ opacity: 1, x: 0, backgroundColor: "rgba(255,255,255,0)" }} transition={{ duration: 0.8 }} className={cn("flex items-center justify-between rounded-lg px-2.5 py-1.5 text-sm", i === 0 && "ring-1 ring-electric/20")}>
                    <span className="flex items-center gap-2 text-slate-300">
                      {i === 0 && <Crown className="h-3.5 w-3.5 text-amber-300" />}
                      {b.bidderId === p.userId ? <span className="font-semibold text-electric-400">You</span> : b.bidder}
                      {b.isAuto && <span className="rounded bg-violet/15 px-1 text-[10px] text-violet-300">{t("auction.auto")}</span>}
                    </span>
                    <span className="flex items-center gap-3">
                      <span className="text-[11px] text-slate-500">{timeAgo(b.at, locale)}</span>
                      <span className="font-semibold tabular-nums text-white">{formatMoney(b.amount, p.currency, { locale })}</span>
                    </span>
                  </motion.div>
                ))}
              </AnimatePresence>
            )}
          </div>
        </div>
      </div>

      <Modal open={confirm !== null} onClose={() => setConfirm(null)} title={confirm === "buy" ? t("common.buyNow") : t("auction.placeBid")}>
        <p className="text-slate-300">
          {confirm === "buy"
            ? t("auction.confirmBuyNow", { amount: formatMoney(p.buyNowPrice ?? 0, p.currency, { locale }) })
            : t("auction.confirmBid", { amount: formatMoney(Math.round(Number(amount) * 100), p.currency, { locale, cents: true }) })}
        </p>
        {confirm === "bid" && maxBid && <p className="mt-2 text-sm text-slate-400">{t("auction.maxBid")}: {formatMoney(Math.round(Number(maxBid) * 100), p.currency, { locale })}</p>}
        <div className="mt-6 flex gap-3">
          <Button variant="secondary" className="flex-1" onClick={() => setConfirm(null)}>{t("common.cancel")}</Button>
          <Button variant={confirm === "buy" ? "gold" : "primary"} className="flex-1" loading={pending} onClick={confirm === "buy" ? submitBuyNow : submitBid}>{t("common.submit")}</Button>
        </div>
      </Modal>
    </div>
  );
}
