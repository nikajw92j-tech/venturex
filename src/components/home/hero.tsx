"use client";

import Link from "next/link";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { ArrowRight, Gavel, ShieldCheck, Sparkles, TrendingUp } from "lucide-react";
import { useEffect, useRef } from "react";
import gsap from "gsap";
import { buttonClass } from "../ui";
import { useT } from "@/i18n/client";
import { InlineCountdown } from "../countdown";
import { Money } from "../listing-card";
import type { CurrencyCode } from "@/lib/money";

export type HeroCard = {
  slug: string;
  title: string;
  category: string;
  price: number;
  revenue: number;
  currency: CurrencyCode;
  endsAt: string | null;
  isAuction: boolean;
};

function AnimatedBackground() {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!root.current) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const ctx = gsap.context(() => {
      gsap.utils.toArray<HTMLElement>(".orb").forEach((el, i) => {
        gsap.to(el, {
          x: () => gsap.utils.random(-120, 120),
          y: () => gsap.utils.random(-80, 80),
          scale: () => gsap.utils.random(0.85, 1.25),
          duration: gsap.utils.random(8, 14),
          ease: "sine.inOut",
          repeat: -1,
          yoyo: true,
          repeatRefresh: true,
          delay: i * 0.4,
        });
      });
      gsap.fromTo(".beam", { xPercent: -100, opacity: 0 }, { xPercent: 100, opacity: 0.8, duration: 6, ease: "power1.inOut", repeat: -1, repeatDelay: 3, stagger: 2 });
    }, root);
    return () => ctx.revert();
  }, []);
  return (
    <div ref={root} className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <div className="grid-bg absolute inset-0" />
      <div className="orb absolute top-[-10%] left-[10%] h-[520px] w-[520px] rounded-full bg-electric/25 blur-[120px]" />
      <div className="orb absolute top-[10%] right-[5%] h-[460px] w-[460px] rounded-full bg-violet/25 blur-[120px]" />
      <div className="orb absolute bottom-[-20%] left-[35%] h-[420px] w-[420px] rounded-full bg-cyan/15 blur-[120px]" />
      <div className="beam absolute top-[30%] left-0 h-px w-1/2 bg-gradient-to-r from-transparent via-electric-400 to-transparent" />
      <div className="beam absolute top-[62%] left-0 h-px w-1/2 bg-gradient-to-r from-transparent via-violet-400 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-ink-950 to-transparent" />
    </div>
  );
}

function FloatingCard({ card, i, mx, my }: { card: HeroCard; i: number; mx: ReturnType<typeof useSpring>; my: ReturnType<typeof useSpring> }) {
  const depth = [26, -18, 14][i] ?? 10;
  const x = useTransform(mx, (v) => v * depth);
  const y = useTransform(my, (v) => v * depth);
  const rot = [-6, 5, -2][i] ?? 0;
  const pos = ["top-0 left-0", "top-40 right-0 sm:top-36", "bottom-0 left-6 sm:left-16"][i];
  const body = (
    <div className="glass-strong card-shadow w-[250px] rounded-2xl p-4 sm:w-[270px]" style={{ ["--r" as string]: `${rot}deg` }}>
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-electric-400">{card.category}</span>
        {card.isAuction ? (
          <span className="flex items-center gap-1 rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] font-bold text-red-300">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-400" /> LIVE
          </span>
        ) : (
          <ShieldCheck className="h-4 w-4 text-emerald-400" />
        )}
      </div>
      <div className="mt-2 font-display text-base font-semibold text-white">{card.title}</div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-lg bg-white/[0.04] px-2.5 py-2">
          <div className="text-slate-500">MRR</div>
          <div className="flex items-center gap-1 font-semibold text-emerald-300">
            <TrendingUp className="h-3 w-3" />
            <Money amount={card.revenue} currency={card.currency} compact />
          </div>
        </div>
        <div className="rounded-lg bg-white/[0.04] px-2.5 py-2">
          <div className="text-slate-500">{card.isAuction ? "Bid" : "Price"}</div>
          <Money amount={card.price} currency={card.currency} compact className="font-semibold text-white" />
        </div>
      </div>
      {card.isAuction && (
        <div className="mt-2.5 flex items-center justify-between rounded-lg bg-gradient-to-r from-electric/15 to-violet/15 px-2.5 py-1.5 text-xs">
          <span className="flex items-center gap-1 text-slate-300"><Gavel className="h-3 w-3" /> Ends in</span>
          <InlineCountdown endsAt={card.endsAt} className="font-semibold" />
        </div>
      )}
    </div>
  );
  return (
    <motion.div
      className={`absolute ${pos}`}
      style={{ x, y }}
      initial={{ opacity: 0, y: 60, rotateX: 25, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, rotateX: 0, scale: 1 }}
      transition={{ duration: 1.1, delay: 0.5 + i * 0.18, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="animate-float" style={{ animationDelay: `${i * 1.3}s`, ["--r" as string]: `${rot}deg` }}>
        <Link href={`/listing/${card.slug}`}>{body}</Link>
      </div>
    </motion.div>
  );
}

export function Hero({ cards }: { cards: HeroCard[] }) {
  const t = useT();
  const mxRaw = useMotionValue(0);
  const myRaw = useMotionValue(0);
  const mx = useSpring(mxRaw, { stiffness: 60, damping: 20 });
  const my = useSpring(myRaw, { stiffness: 60, damping: 20 });

  const words = t("home.title").split(" ");

  return (
    <section
      className="relative isolate overflow-hidden"
      onMouseMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        mxRaw.set((e.clientX - r.left) / r.width - 0.5);
        myRaw.set((e.clientY - r.top) / r.height - 0.5);
      }}
    >
      <AnimatedBackground />
      <div className="container-x relative grid items-center gap-12 pt-16 pb-20 sm:pt-24 lg:grid-cols-[1.15fr_1fr] lg:pb-28">
        <div>
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="glass mb-6 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs text-slate-300">
            <Sparkles className="h-3.5 w-3.5 text-violet-400" /> {t("home.badge")}
          </motion.div>
          <h1 className="font-display text-4xl leading-[1.05] font-semibold tracking-tight text-white sm:text-5xl lg:text-6xl xl:text-[4.2rem]">
            {words.map((w, i) => (
              <motion.span
                key={i}
                className={`mr-[0.25em] inline-block ${i >= words.length - 3 ? "text-gradient" : ""}`}
                initial={{ opacity: 0, y: 40, filter: "blur(12px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                transition={{ duration: 0.9, delay: 0.1 + i * 0.07, ease: [0.16, 1, 0.3, 1] }}
              >
                {w}
              </motion.span>
            ))}
          </h1>
          <motion.p initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.7 }} className="mt-6 max-w-xl text-lg text-slate-400">
            {t("home.subtitle")}
          </motion.p>
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.85 }} className="mt-9 flex flex-wrap gap-3">
            <Link href="/marketplace" className={buttonClass("primary", "lg", "group")}>
              {t("home.explore")} <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
            </Link>
            <Link href="/sell" className={buttonClass("secondary", "lg")}>
              {t("home.sellYours")}
            </Link>
            <Link href="/auctions" className={buttonClass("outline", "lg")}>
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
              </span>
              {t("home.liveAuctions")}
            </Link>
          </motion.div>
        </div>

        <div className="relative mx-auto h-[420px] w-full max-w-[520px] [perspective:1200px] sm:h-[460px]">
          {cards.slice(0, 3).map((c, i) => (
            <FloatingCard key={i} card={c} i={i} mx={mx} my={my} />
          ))}
        </div>
      </div>
    </section>
  );
}
