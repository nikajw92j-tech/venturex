"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";

function parts(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return { d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 };
}

/** Server time offset keeps every viewer's countdown in sync with the auction clock. */
let serverOffset = 0;
export function setServerTime(iso: string) {
  serverOffset = new Date(iso).getTime() - Date.now();
}
export const now = () => Date.now() + serverOffset;

export function useCountdown(endsAt: string | null) {
  // null until mounted so server and client render the same markup (no hydration mismatch)
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    if (!endsAt) return setLeft(0);
    const tick = () => setLeft(new Date(endsAt).getTime() - now());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [endsAt]);
  return left;
}

const Placeholder = ({ className }: { className?: string }) => <span className={cn("inline-block h-4 w-16 animate-pulse rounded bg-white/5 align-middle", className)} aria-hidden />;

function Digit({ value, label, big }: { value: number; label: string; big?: boolean }) {
  const str = String(value).padStart(2, "0");
  return (
    <div className="flex flex-col items-center">
      <div className={cn("relative overflow-hidden rounded-lg bg-ink-900/80 font-display font-semibold tabular-nums text-white ring-1 ring-white/10", big ? "h-14 w-14 text-2xl leading-[3.5rem]" : "h-9 w-9 text-base leading-9")}>
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span key={str} initial={{ y: "-100%", opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: "100%", opacity: 0 }} transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }} className="absolute inset-0 text-center">
            {str}
          </motion.span>
        </AnimatePresence>
      </div>
      <span className="mt-1 text-[10px] uppercase tracking-wider text-slate-500">{label}</span>
    </div>
  );
}

/** Large animated flip-style countdown for auction panels. */
export function Countdown({ endsAt, big, endedLabel = "Ended" }: { endsAt: string | null; big?: boolean; endedLabel?: string }) {
  const left = useCountdown(endsAt);
  if (left === null) return <Placeholder className="h-9 w-40" />;
  if (!endsAt || left <= 0) return <div className="font-display text-lg font-semibold text-slate-400">{endedLabel}</div>;
  const p = parts(left);
  const urgent = left < 5 * 60_000;
  return (
    <div className={cn("flex items-start gap-1.5", urgent && "[&_div.relative]:ring-red-500/50 [&_div.relative]:text-red-300")} role="timer" aria-live="off">
      {p.d > 0 && <Digit value={p.d} label="d" big={big} />}
      <Digit value={p.h} label="h" big={big} />
      <Digit value={p.m} label="m" big={big} />
      <Digit value={p.s} label="s" big={big} />
    </div>
  );
}

/** Compact inline countdown for cards. */
export function InlineCountdown({ endsAt, className }: { endsAt: string | null; className?: string }) {
  const left = useCountdown(endsAt);
  if (left === null) return <Placeholder />;
  if (!endsAt || left <= 0) return <span className={cn("text-slate-400", className)}>Ended</span>;
  const p = parts(left);
  const text = p.d > 0 ? `${p.d}d ${p.h}h ${p.m}m` : `${String(p.h).padStart(2, "0")}:${String(p.m).padStart(2, "0")}:${String(p.s).padStart(2, "0")}`;
  return <span className={cn("tabular-nums", left < 3600_000 ? "text-red-300" : "text-slate-200", className)}>{text}</span>;
}
