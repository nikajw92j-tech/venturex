import type { Metadata } from "next";
import { BadgeCheck, CreditCard, FileCheck2, Gavel, Handshake, Search, ShieldCheck, Store } from "lucide-react";
import { getI18n } from "@/i18n/server";
import { Card, LinkButton } from "@/components/ui";
import { Reveal, Stagger, StaggerItem } from "@/components/motion";

export const metadata: Metadata = { title: "How it works", alternates: { canonical: "/how-it-works" } };

export default async function HowItWorksPage() {
  const { t } = await getI18n();
  const sellers = [
    { icon: Store, title: "Create your listing", body: "Describe the business, add financials, screenshots and private evidence. Choose fixed price or auction." },
    { icon: BadgeCheck, title: "Review & verification", body: "Our team reviews every listing. Optionally verify your identity, business and financials to earn badges." },
    { icon: Gavel, title: "Receive offers and bids", body: "Negotiate privately or run a live auction with reserve and Buy Now options." },
    { icon: Handshake, title: "Hand over & get paid", body: "Transfer assets through the tracked checklist. Funds are released after both sides confirm." },
  ];
  const buyers = [
    { icon: Search, title: "Discover", body: "Filter by revenue, profit, category, age and technology. Save searches and get alerts." },
    { icon: FileCheck2, title: "Due diligence", body: "Ask questions, message the seller and request access to the confidential document room." },
    { icon: CreditCard, title: "Pay securely", body: "Pay through our payment provider or licensed escrow. Funds are held, never sent straight to the seller." },
    { icon: ShieldCheck, title: "Protected handover", body: "Verify each asset. If something is wrong, open a dispute before funds are released." },
  ];
  const Steps = ({ items }: { items: typeof sellers }) => (
    <Stagger className="grid gap-4 md:grid-cols-4">
      {items.map((s, i) => (
        <StaggerItem key={s.title}>
          <Card className="h-full p-6">
            <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-electric/25 to-violet/25 text-electric-400 ring-1 ring-white/10"><s.icon className="h-5 w-5" /></span><span className="font-display text-sm font-bold text-slate-500">0{i + 1}</span></div>
            <h3 className="mt-4 font-display text-lg font-semibold text-white">{s.title}</h3>
            <p className="mt-2 text-sm text-slate-400">{s.body}</p>
          </Card>
        </StaggerItem>
      ))}
    </Stagger>
  );
  return (
    <div className="container-x py-16">
      <Reveal><h1 className="font-display text-4xl font-semibold text-white sm:text-5xl">{t("home.how")}</h1></Reveal>
      <section className="mt-12">
        <h2 className="mb-5 font-display text-2xl font-semibold text-white">For sellers</h2>
        <Steps items={sellers} />
      </section>
      <section className="mt-14">
        <h2 className="mb-5 font-display text-2xl font-semibold text-white">For buyers</h2>
        <Steps items={buyers} />
      </section>
      <section className="mt-14">
        <Card className="p-8">
          <h2 className="font-display text-2xl font-semibold text-white">The 8-stage secure handover</h2>
          <ol className="mt-5 grid gap-3 text-sm text-slate-300 sm:grid-cols-2">
            {["Buyer completes verified payment", "Seller prepares the business assets", "Domain and hosting transfer begins", "Source code and required assets are delivered", "Buyer reviews the transferred assets", "Both parties confirm the handover or open a dispute", "The payment provider releases funds according to its rules", "Transaction is marked complete"].map((s, i) => (
              <li key={s} className="flex gap-3 rounded-xl bg-white/[0.03] p-3 ring-1 ring-white/5"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand text-xs font-bold text-white">{i + 1}</span>{s}</li>
            ))}
          </ol>
          <p className="mt-4 text-sm text-slate-500">Every step is recorded in an audit log visible to both parties.</p>
        </Card>
      </section>
      <div className="mt-12 flex flex-wrap gap-3">
        <LinkButton href="/marketplace" size="lg">{t("home.explore")}</LinkButton>
        <LinkButton href="/sell" variant="secondary" size="lg">{t("home.sellYours")}</LinkButton>
      </div>
    </div>
  );
}
