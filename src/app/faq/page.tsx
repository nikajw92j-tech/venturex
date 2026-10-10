import type { Metadata } from "next";
import { getI18n } from "@/i18n/server";
import { FAQ } from "@/content/faq";
import { Faq } from "@/components/home/faq";
import { Reveal } from "@/components/motion";

export const metadata: Metadata = { title: "FAQ", alternates: { canonical: "/faq" } };

export default async function FaqPage() {
  const { t, locale } = await getI18n();
  const items = FAQ[locale];
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((i) => ({ "@type": "Question", name: i.q, acceptedAnswer: { "@type": "Answer", text: i.a } })),
  };
  return (
    <div className="container-x max-w-3xl py-16">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <Reveal><h1 className="mb-10 font-display text-4xl font-semibold text-white sm:text-5xl">{t("home.faq")}</h1></Reveal>
      <Reveal delay={0.1}><Faq items={items} /></Reveal>
    </div>
  );
}
