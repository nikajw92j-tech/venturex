import type { Metadata } from "next";
import { ContentPage } from "@/components/content-page";

export const metadata: Metadata = { title: "About us", alternates: { canonical: "/about" } };

export default function AboutPage() {
  return (
    <ContentPage title="About VENTUREX" subtitle="We make buying and selling digital businesses transparent, protected and fast.">
      <p>Thousands of profitable websites, apps and side projects change owners every year — yet most deals still happen over email, with unverifiable numbers and money sent on trust. VENTUREX exists to fix that.</p>
      <h2>What we believe</h2>
      <ul>
        <li><b>Transparency over hype.</b> Every figure is labelled as seller-reported or verified. Trust scores come only from verifiable platform data. Promoted listings are always marked as ads.</li>
        <li><b>Protected money.</b> Payments run through licensed providers and escrow partners. Sellers are paid only after a confirmed handover.</li>
        <li><b>A market for every stage.</b> From established SaaS companies to brand-new MVPs in the Starter Market, every builder deserves a fair exit.</li>
      </ul>
      <h2>How we earn</h2>
      <p>Listing is free. We earn a success commission only when a sale completes, plus optional seller plans and promotions. Our incentives are aligned with yours: completed, happy transactions.</p>
    </ContentPage>
  );
}
