import type { Metadata } from "next";
import { ContentPage } from "@/components/content-page";
import { getI18n } from "@/i18n/server";
import { LEGAL_NOTICE } from "@/content/legal-notice";

export const metadata: Metadata = { title: "Privacy Policy", alternates: { canonical: "/privacy" } };

export default async function PrivacyPage() {
  const { locale } = await getI18n();
  return (
    <ContentPage title="Privacy Policy" updated="October 2026" notice={LEGAL_NOTICE[locale]}>
      <p>This policy explains what personal data VENTUREX collects, why, and the choices you have.</p>
      <h2>Data we collect</h2>
      <ul>
        <li><b>Account data:</b> name, username, email, country, profile picture, and a hashed password (or your Google account identifier if you use Google sign-in).</li>
        <li><b>Marketplace data:</b> listings, offers, bids, messages, questions, watchlists and saved searches.</li>
        <li><b>Verification documents:</b> identity and business documents you choose to upload. These are stored privately and visible only to you and authorised reviewers.</li>
        <li><b>Transaction data:</b> amounts, statuses and references from our payment and escrow providers. We never receive or store full card numbers or bank credentials — those are handled by the payment provider.</li>
        <li><b>Technical data:</b> IP address, browser type and security logs used for fraud prevention and rate limiting.</li>
      </ul>
      <h2>How we use it</h2>
      <ul>
        <li>To operate the marketplace, process transactions and run the handover workflow.</li>
        <li>To send transactional notifications (bids, offers, payments, handover updates).</li>
        <li>To prevent fraud, enforce our Terms and keep an audit log of transaction steps.</li>
        <li>To recommend listings based on your saved searches, preferences and recently viewed listings.</li>
      </ul>
      <h2>Sharing</h2>
      <p>We share data with service providers that help us run VENTUREX (hosting, file storage, email, payment and escrow providers, and — for the optional valuation analysis — an AI model provider that receives only the business metrics you enter). We share limited information between buyer and seller as needed to complete a transaction. We do not sell personal data.</p>
      <h2>Confidential documents</h2>
      <p>Financial evidence attached to listings is private by default. A buyer sees it only after the seller grants access and the buyer accepts confidentiality terms.</p>
      <h2>Retention</h2>
      <p>We keep transaction and audit records for as long as required for legal, tax and dispute purposes. You can delete your account once no transactions are open; some records may be retained as required by law.</p>
      <h2>Your rights</h2>
      <p>Depending on where you live, you may have the right to access, correct, export or delete your data, and to object to certain processing. Contact us to exercise these rights.</p>
      <h2>Cookies</h2>
      <p>We use essential cookies for sign-in sessions and to remember your language and display-currency preferences. We do not use third-party advertising cookies.</p>
    </ContentPage>
  );
}
