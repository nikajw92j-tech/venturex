import type { Metadata } from "next";
import Link from "next/link";
import { ContentPage } from "@/components/content-page";
import { getI18n } from "@/i18n/server";
import { LEGAL_NOTICE } from "@/content/legal-notice";

export const metadata: Metadata = { title: "Terms of Service", alternates: { canonical: "/terms" } };

export default async function TermsPage() {
  const { locale } = await getI18n();
  return (
    <ContentPage title="Terms of Service" updated="October 2026" notice={LEGAL_NOTICE[locale]}>
      <p>These Terms govern your use of VENTUREX (the “Platform”), a marketplace that connects people who buy and sell digital businesses, websites, applications, domains and related assets. By creating an account or using the Platform you agree to these Terms.</p>
      <h2>1. Accounts</h2>
      <ul>
        <li>You must be at least 18 years old and able to enter into binding contracts.</li>
        <li>You are responsible for your account credentials and all activity on your account.</li>
        <li>We may require identity or business verification before you can complete higher-value transactions.</li>
      </ul>
      <h2>2. The role of VENTUREX</h2>
      <p>VENTUREX provides the venue, tools and a structured handover workflow. Unless explicitly stated, VENTUREX is not a party to the sale contract between buyer and seller, does not own the businesses listed and does not guarantee any listing&apos;s accuracy, performance or legality. Payments are processed by licensed third-party payment and escrow providers.</p>
      <h2>3. Listings</h2>
      <ul>
        <li>Sellers must own or control every asset they list and have the right to transfer it.</li>
        <li>All figures must be accurate and supported by evidence on request. Figures are displayed as “seller-reported” unless VENTUREX has reviewed evidence and marked them “verified”.</li>
        <li>We may review, reject, edit for formatting, or remove listings that breach these Terms or our policies.</li>
        <li>Promoted listings are paid advertisements and are always labelled as such.</li>
      </ul>
      <h2>4. Offers and auctions</h2>
      <ul>
        <li>Accepted offers, winning bids and Buy Now purchases are binding commitments to complete the transaction.</li>
        <li>Sellers may not bid on their own listings or use others to do so (shill bidding). Bids placed in the final minutes of an auction extend it to prevent sniping.</li>
        <li>An auction win creates a pending purchase. The buyer must pay within the stated payment window or the purchase may be cancelled.</li>
      </ul>
      <h2>5. Payments, handover and fees</h2>
      <ul>
        <li>Buyers pay through the Platform&apos;s payment provider; never pay a seller directly.</li>
        <li>Seller funds are released only after verified payment, a confirmed handover (or an administrator&apos;s dispute decision) and documented release approval.</li>
        <li>VENTUREX charges sellers a success commission on completed sales, calculated automatically from the final sale price according to the rates on the <Link href="/pricing">Pricing</Link> page. No commission is charged on cancelled or unsuccessful transactions.</li>
        <li>Optional subscriptions and promotion packages are billed in advance and are non-refundable except as described in our <Link href="/refund-policy">Refund & Dispute Policy</Link> or as required by law.</li>
      </ul>
      <h2>6. Prohibited conduct</h2>
      <p>You may not list stolen, infringing or illegal assets; misrepresent traffic or revenue; circumvent the Platform&apos;s payment flow; harass other users; scrape the Platform; or attempt to interfere with its security.</p>
      <h2>7. Disclaimers and liability</h2>
      <p>The Platform is provided “as is”. Valuation estimates are automated and are not appraisals or investment advice. To the extent permitted by law, VENTUREX is not liable for indirect or consequential losses, and our total liability for any claim is limited to the fees you paid us in the 12 months before the claim.</p>
      <h2>8. Suspension and termination</h2>
      <p>We may suspend or close accounts involved in fraud, policy violations or legal risk. You may close your account at any time once open transactions are complete.</p>
      <h2>9. Changes and governing law</h2>
      <p>We may update these Terms and will notify you of material changes. The governing law and jurisdiction are those of the country where the VENTUREX operating entity is registered. Contact us via the <Link href="/contact">Contact</Link> page.</p>
    </ContentPage>
  );
}
