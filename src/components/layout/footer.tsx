import Link from "next/link";
import { Logo } from "./logo";
import { getI18n } from "@/i18n/server";

export async function Footer() {
  const { t } = await getI18n();
  const cols = [
    {
      title: t("footer.marketplace"),
      links: [
        { href: "/marketplace", label: t("nav.marketplace") },
        { href: "/auctions", label: t("nav.auctions") },
        { href: "/starter", label: t("nav.starter") },
        { href: "/sell", label: t("nav.sell") },
        { href: "/valuation", label: t("nav.valuation") },
      ],
    },
    {
      title: t("footer.company"),
      links: [
        { href: "/about", label: t("footer.about") },
        { href: "/how-it-works", label: t("nav.howItWorks") },
        { href: "/pricing", label: t("nav.pricing") },
        { href: "/contact", label: t("footer.contact") },
      ],
    },
    {
      title: t("footer.support"),
      links: [
        { href: "/help", label: t("footer.help") },
        { href: "/faq", label: t("footer.faq") },
      ],
    },
    {
      title: t("footer.legal"),
      links: [
        { href: "/terms", label: t("footer.terms") },
        { href: "/privacy", label: t("footer.privacy") },
        { href: "/refund-policy", label: t("footer.refunds") },
      ],
    },
  ];
  return (
    <footer className="relative mt-24 border-t border-white/5 bg-ink-950">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-electric/50 to-transparent" />
      <div className="container-x grid gap-10 py-14 md:grid-cols-6">
        <div className="md:col-span-2">
          <Logo />
          <p className="mt-4 max-w-xs text-sm text-slate-400">{t("footer.tagline")}</p>
        </div>
        {cols.map((c) => (
          <div key={c.title}>
            <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">{c.title}</div>
            <ul className="space-y-2">
              {c.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-sm text-slate-400 transition hover:text-white">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="container-x flex flex-col gap-2 border-t border-white/5 py-6 text-xs text-slate-500 sm:flex-row sm:justify-between">
        <span>© {new Date().getFullYear()} VENTUREX. {t("footer.rights")}</span>
        <span className="max-w-xl sm:text-right">{t("footer.ratesNote")}</span>
      </div>
    </footer>
  );
}
