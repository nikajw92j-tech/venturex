"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Bell, ChevronDown, Globe2, Heart, LayoutDashboard, LogOut, Menu, MessageSquare, Shield, User, X } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { Logo } from "./logo";
import { buttonClass } from "../ui";
import { useLocale, useT, useDisplayCurrency } from "@/i18n/client";
import { LOCALES, LOCALE_LABELS } from "@/i18n/config";
import { CURRENCIES, CURRENCY_SYMBOL } from "@/lib/money";
import { setCurrencyAction, setLocaleAction } from "@/app/actions/preferences";
import { logoutAction } from "@/app/actions/auth";
import { recentNotificationsAction, markAllReadAction } from "@/app/actions/notifications";
import { useRealtime } from "../realtime";
import { cn, timeAgo } from "@/lib/utils";

type NavUser = { id: string; displayName: string; username: string; avatarUrl: string | null; role: string } | null;
type Notif = { id: string; title: string; body: string; link: string | null; readAt: string | null; createdAt: string };

function useOutside(ref: React.RefObject<HTMLElement | null>, onOut: () => void) {
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onOut();
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [ref, onOut]);
}

export function Avatar({ name, src, size = 32 }: { name: string; src?: string | null; size?: number }) {
  const initials = name.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" width={size} height={size} className="rounded-full object-cover ring-1 ring-white/15" style={{ width: size, height: size }} />
  ) : (
    <span className="grid place-items-center rounded-full bg-gradient-to-br from-electric to-violet font-semibold text-white ring-1 ring-white/15" style={{ width: size, height: size, fontSize: size * 0.38 }}>
      {initials || "?"}
    </span>
  );
}

function PrefsMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useOutside(ref, () => setOpen(false));
  const locale = useLocale();
  const { currency } = useDisplayCurrency();
  const t = useT();
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} className="flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-slate-300 transition hover:bg-white/5 hover:text-white" aria-label={t("nav.language")} aria-expanded={open}>
        <Globe2 className="h-4 w-4" />
        {LOCALE_LABELS[locale].short} · {CURRENCY_SYMBOL[currency]}
        <ChevronDown className="h-3 w-3 opacity-60" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: -6, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6, scale: 0.98 }} transition={{ duration: 0.15 }} className="glass-strong absolute right-0 z-50 mt-2 w-56 rounded-xl p-2 shadow-2xl">
            <div className="px-2 pt-1 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{t("nav.language")}</div>
            {LOCALES.map((l) => (
              <button key={l} disabled={pending} onClick={() => start(async () => { await setLocaleAction(l); router.refresh(); })} className={cn("flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-sm transition hover:bg-white/5", l === locale ? "text-white" : "text-slate-400")}>
                {LOCALE_LABELS[l].name}
                {l === locale && <span className="h-1.5 w-1.5 rounded-full bg-electric-400" />}
              </button>
            ))}
            <div className="mt-2 border-t border-white/5 px-2 pt-2.5 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{t("nav.currency")}</div>
            <div className="grid grid-cols-4 gap-1 px-1 pb-1">
              {CURRENCIES.map((c) => (
                <button key={c} disabled={pending} onClick={() => start(async () => { await setCurrencyAction(c); router.refresh(); })} className={cn("rounded-lg py-1.5 text-xs font-semibold transition", c === currency ? "bg-brand text-white" : "text-slate-400 hover:bg-white/5")}>
                  {CURRENCY_SYMBOL[c]} {c}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function NotificationBell({ userId, initialUnread }: { userId: string; initialUnread: number }) {
  const [unread, setUnread] = useState(initialUnread);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notif[] | null>(null);
  const [pulse, setPulse] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useOutside(ref, () => setOpen(false));
  const t = useT();
  const locale = useLocale();

  useRealtime([`user:${userId}`], (m) => {
    if (m.event.type === "notification") {
      setUnread((u) => u + 1);
      setPulse(true);
      setTimeout(() => setPulse(false), 1500);
      setItems((prev) => (prev ? [{ id: String(m.event.id), title: String(m.event.title), body: String(m.event.body), link: (m.event.link as string) ?? null, readAt: null, createdAt: new Date().toISOString() }, ...prev].slice(0, 12) : prev));
    }
  });

  async function toggle() {
    setOpen((o) => !o);
    if (!items) {
      const r = await recentNotificationsAction();
      setItems(r.items);
      setUnread(r.unread);
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button onClick={toggle} className="relative grid h-9 w-9 place-items-center rounded-lg text-slate-300 transition hover:bg-white/5 hover:text-white" aria-label={`${t("nav.notifications")} (${unread})`}>
        <Bell className={cn("h-[18px] w-[18px]", pulse && "animate-[wiggle_0.6s_ease-in-out]")} />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-gradient-to-r from-electric to-violet px-1 text-[10px] font-bold text-white">
            {unread > 99 ? "99+" : unread}
            {pulse && <span className="absolute inset-0 animate-pulse-ring rounded-full bg-violet" />}
          </span>
        )}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: -6, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6, scale: 0.98 }} transition={{ duration: 0.15 }} className="glass-strong absolute right-0 z-50 mt-2 w-[min(92vw,380px)] overflow-hidden rounded-xl shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
              <span className="text-sm font-semibold text-white">{t("notif.title")}</span>
              <button className="text-xs text-electric-400 hover:underline" onClick={async () => { await markAllReadAction(); setUnread(0); setItems((i) => i?.map((n) => ({ ...n, readAt: new Date().toISOString() })) ?? null); }}>
                {t("notif.markAll")}
              </button>
            </div>
            <div className="max-h-96 overflow-y-auto">
              {!items ? (
                <div className="space-y-2 p-4">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-12 rounded-lg" />)}</div>
              ) : items.length === 0 ? (
                <div className="px-4 py-10 text-center text-sm text-slate-400">{t("notif.empty")}</div>
              ) : (
                items.map((n) => (
                  <Link key={n.id} href={n.link ?? "/notifications"} onClick={() => setOpen(false)} className={cn("block border-b border-white/5 px-4 py-3 transition hover:bg-white/[0.04]", !n.readAt && "bg-electric/[0.06]")}>
                    <div className="flex items-start gap-2">
                      {!n.readAt && <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-electric-400" />}
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-white">{n.title}</div>
                        <div className="line-clamp-2 text-xs text-slate-400">{n.body}</div>
                        <div className="mt-1 text-[11px] text-slate-500">{timeAgo(n.createdAt, locale)}</div>
                      </div>
                    </div>
                  </Link>
                ))
              )}
            </div>
            <Link href="/notifications" onClick={() => setOpen(false)} className="block px-4 py-2.5 text-center text-xs font-semibold text-slate-300 hover:bg-white/5">
              {t("common.viewAll")}
            </Link>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function UserMenu({ user }: { user: NonNullable<NavUser> }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useOutside(ref, () => setOpen(false));
  const t = useT();
  const items = [
    { href: "/dashboard", label: t("nav.dashboard"), icon: LayoutDashboard },
    { href: "/messages", label: t("nav.messages"), icon: MessageSquare },
    { href: "/watchlist", label: t("nav.watchlist"), icon: Heart },
    { href: `/u/${user.username}`, label: t("nav.profile"), icon: User },
    ...(user.role === "ADMIN" ? [{ href: "/admin", label: t("nav.admin"), icon: Shield }] : []),
  ];
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 rounded-full p-0.5 pr-2 transition hover:bg-white/5" aria-expanded={open} aria-label="Account menu">
        <Avatar name={user.displayName} src={user.avatarUrl} />
        <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: -6, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6, scale: 0.98 }} transition={{ duration: 0.15 }} className="glass-strong absolute right-0 z-50 mt-2 w-60 rounded-xl p-2 shadow-2xl">
            <div className="px-3 py-2">
              <div className="truncate text-sm font-semibold text-white">{user.displayName}</div>
              <div className="truncate text-xs text-slate-400">@{user.username}</div>
            </div>
            <div className="my-1 border-t border-white/5" />
            {items.map((i) => (
              <Link key={i.href} href={i.href} onClick={() => setOpen(false)} className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-slate-300 transition hover:bg-white/5 hover:text-white">
                <i.icon className="h-4 w-4" /> {i.label}
              </Link>
            ))}
            <div className="my-1 border-t border-white/5" />
            <form action={logoutAction}>
              <button className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-slate-300 transition hover:bg-white/5 hover:text-white">
                <LogOut className="h-4 w-4" /> {t("nav.logout")}
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function Navbar({ user, unread }: { user: NavUser; unread: number }) {
  const t = useT();
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [mobile, setMobile] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  useEffect(() => setMobile(false), [pathname]);

  const links = [
    { href: "/marketplace", label: t("nav.marketplace") },
    { href: "/auctions", label: t("nav.auctions"), live: true },
    { href: "/starter", label: t("nav.starter") },
    { href: "/valuation", label: t("nav.valuation") },
    { href: "/pricing", label: t("nav.pricing") },
  ];

  return (
    <header className={cn("sticky top-0 z-40 transition-all duration-300", scrolled ? "glass-strong border-x-0 border-t-0 shadow-[0_10px_40px_-20px_rgba(0,0,0,0.8)]" : "border-b border-transparent bg-transparent")}>
      <nav className="container-x flex h-16 items-center justify-between gap-4">
        <div className="flex items-center gap-8">
          <Logo />
          <div className="hidden items-center gap-1 lg:flex">
            {links.map((l) => {
              const active = pathname.startsWith(l.href);
              return (
                <Link key={l.href} href={l.href} className={cn("relative rounded-lg px-3 py-2 text-sm font-medium transition", active ? "text-white" : "text-slate-400 hover:text-white")}>
                  {active && <motion.span layoutId="nav-active" className="absolute inset-0 -z-10 rounded-lg bg-white/[0.06]" transition={{ type: "spring", stiffness: 500, damping: 40 }} />}
                  <span className="flex items-center gap-1.5">
                    {l.live && (
                      <span className="relative flex h-1.5 w-1.5">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-red-500" />
                      </span>
                    )}
                    {l.label}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <div className="hidden sm:block">
            <PrefsMenu />
          </div>
          {user ? (
            <>
              <Link href="/messages" className="hidden h-9 w-9 place-items-center rounded-lg text-slate-300 transition hover:bg-white/5 hover:text-white sm:grid" aria-label={t("nav.messages")}>
                <MessageSquare className="h-[18px] w-[18px]" />
              </Link>
              <NotificationBell userId={user.id} initialUnread={unread} />
              <Link href="/sell" className={buttonClass("primary", "sm", "ml-1 hidden md:inline-flex")}>
                {t("nav.sell")}
              </Link>
              <div className="ml-1 hidden lg:block">
                <UserMenu user={user} />
              </div>
            </>
          ) : (
            <div className="hidden items-center gap-1.5 lg:flex">
              <Link href="/login" className={buttonClass("ghost", "sm")}>
                {t("nav.login")}
              </Link>
              <Link href="/register" className={buttonClass("primary", "sm")}>
                {t("nav.register")}
              </Link>
            </div>
          )}
          <button className="grid h-9 w-9 place-items-center rounded-lg text-slate-200 hover:bg-white/5 lg:hidden" onClick={() => setMobile((m) => !m)} aria-label={t("nav.menu")} aria-expanded={mobile}>
            {mobile ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </nav>

      <AnimatePresence>
        {mobile && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }} className="glass-strong overflow-hidden border-x-0 lg:hidden">
            <div className="container-x space-y-1 py-4">
              {links.map((l) => (
                <Link key={l.href} href={l.href} className="block rounded-lg px-3 py-2.5 text-base font-medium text-slate-200 hover:bg-white/5">
                  {l.label}
                </Link>
              ))}
              <Link href="/sell" className="block rounded-lg px-3 py-2.5 text-base font-medium text-slate-200 hover:bg-white/5">{t("nav.sell")}</Link>
              <div className="my-2 border-t border-white/5" />
              {user ? (
                <>
                  <Link href="/dashboard" className="block rounded-lg px-3 py-2.5 text-slate-300 hover:bg-white/5">{t("nav.dashboard")}</Link>
                  <Link href="/messages" className="block rounded-lg px-3 py-2.5 text-slate-300 hover:bg-white/5">{t("nav.messages")}</Link>
                  <Link href="/watchlist" className="block rounded-lg px-3 py-2.5 text-slate-300 hover:bg-white/5">{t("nav.watchlist")}</Link>
                  {user.role === "ADMIN" && <Link href="/admin" className="block rounded-lg px-3 py-2.5 text-slate-300 hover:bg-white/5">{t("nav.admin")}</Link>}
                  <form action={logoutAction}>
                    <button className="block w-full rounded-lg px-3 py-2.5 text-left text-slate-300 hover:bg-white/5">{t("nav.logout")}</button>
                  </form>
                </>
              ) : (
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <Link href="/login" className={buttonClass("secondary", "md")}>{t("nav.login")}</Link>
                  <Link href="/register" className={buttonClass("primary", "md")}>{t("nav.register")}</Link>
                </div>
              )}
              <div className="pt-3 sm:hidden">
                <PrefsMenu />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
