import type { Metadata } from "next";
import { ContentPage } from "@/components/content-page";
import { getI18n } from "@/i18n/server";
import { LEGAL_NOTICE } from "@/content/legal-notice";

export const metadata: Metadata = { title: "Refund & Dispute Policy", alternates: { canonical: "/refund-policy" } };

export default async function RefundPolicyPage() {
  const { locale } = await getI18n();
  return (
    <ContentPage title="Refund & Dispute Policy" updated="October 2026" notice={LEGAL_NOTICE[locale]}>
      <h2>Business purchases</h2>
      <ul>
        <li>Your payment is held by our payment provider (or a licensed escrow partner for high-value sales) and is not released to the seller until the handover is confirmed by both parties or decided by an administrator.</li>
        <li>If you have not yet paid, you can cancel a pending purchase at no cost.</li>
        <li>After assets are delivered you have an inspection window to verify every checklist item. If something is missing or materially different from the listing, open a dispute before confirming.</li>
        <li>Once you confirm the handover and funds are released, the sale is final except in cases of fraud.</li>
      </ul>
      <h2>Disputes</h2>
      <ul>
        <li>Either party can open a dispute from the transaction page while funds are held. Funds are frozen immediately.</li>
        <li>Both parties can submit messages and evidence. An administrator reviews the evidence and the full audit log of the handover.</li>
        <li>If resolved in the buyer&apos;s favour, the payment is refunded through the original payment method and no commission is charged. If resolved in the seller&apos;s favour, the release proceeds.</li>
        <li>We aim to resolve disputes within 10 business days.</li>
      </ul>
      <h2>Commission</h2>
      <p>The success commission is charged only on completed sales. It is never charged on cancelled, refunded or unsuccessful transactions.</p>
      <h2>Subscriptions</h2>
      <p>Seller plans renew monthly. You can cancel anytime; the plan stays active until the end of the paid period. Partial months are not refunded unless required by law.</p>
      <h2>Promotions</h2>
      <p>Promotion packages activate after verified payment and are non-refundable once active. If a promotion cannot run because we remove a listing for reasons unrelated to a policy violation, we refund the unused portion.</p>
    </ContentPage>
  );
}
