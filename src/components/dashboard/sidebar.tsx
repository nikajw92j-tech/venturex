"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { BadgeCheck, Bookmark, CreditCard, Gavel, HandCoins, LayoutDashboard, ListChecks, Megaphone, Repeat, Settings, Store, Users, Wallet } from "lucide-react";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";

export function DashboardNav({ counts }: { counts: { offers: number; deals: number } }) {
  const t = useT();
  const path = usePathname();
  const groups = [
    { items: [{ href: "/dashboard", label: t("dash.overview"), icon: LayoutDashboard }] },
    {
      title: t("dash.seller"),
      items: [
        { href: "/dashboard/listings", label: t("dash.listings"), icon: Store },
        { href: "/dashboard/offers", label: t("dash.offers"), icon: HandCoins, badge: counts.offers },
        { href: "/dashboard/promotions", label: t("dash.promotions"), icon: Megaphone },
        { href: "/dashboard/payouts", label: t("dash.payouts"), icon: Wallet },
        { href: "/dashboard/subscription", label: t("dash.subscription"), icon: CreditCard },
        { href: "/dashboard/team", label: t("dash.team"), icon: Users },
      ],
    },
    {
      title: t("dash.buyer"),
      items: [
        { href: "/dashboard/bids", label: t("dash.bids"), icon: Gavel },
        { href: "/dashboard/saved", label: t("dash.saved"), icon: Bookmark },
      ],
    },
    {
      items: [
        { href: "/dashboard/deals", label: t("dash.deals"), icon: Repeat, badge: counts.deals },
        { href: "/dashboard/verification", label: t("dash.verification"), icon: BadgeCheck },
        { href: "/dashboard/settings", label: t("dash.settings"), icon: Settings },
      ],
    },
  ];
  return (
    <nav className="glass flex gap-1 overflow-x-auto rounded-2xl p-2 lg:sticky lg:top-20 lg:flex-col lg:overflow-visible lg:p-3">
      {groups.map((g, gi) => (
        <div key={gi} className="flex gap-1 lg:block lg:space-y-0.5">
          {g.title && <div className="hidden px-3 pt-4 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500 lg:block">{g.title}</div>}
          {g.items.map((i) => {
            const active = i.href === "/dashboard" ? path === "/dashboard" : path.startsWith(i.href);
            return (
              <Link key={i.href} href={i.href} className={cn("relative flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium whitespace-nowrap transition", active ? "text-white" : "text-slate-400 hover:text-white")}>
                {active && <motion.span layoutId="dash-active" className="absolute inset-0 -z-10 rounded-xl bg-gradient-to-r from-electric/20 to-violet/15 ring-1 ring-electric/30" transition={{ type: "spring", stiffness: 500, damping: 40 }} />}
                <i.icon className="h-4 w-4" />
                {i.label}
                {"badge" in i && i.badge ? <span className="ml-auto rounded-full bg-brand px-1.5 text-[10px] font-bold text-white">{i.badge}</span> : null}
              </Link>
            );
          })}
        </div>
      ))}
      <div className="hidden lg:block lg:pt-3">
        <Link href="/sell" className="flex items-center justify-center gap-2 rounded-xl bg-brand px-3 py-2.5 text-sm font-semibold text-white">
          <ListChecks className="h-4 w-4" /> {t("dash.newListing")}
        </Link>
      </div>
    </nav>
  );
}
