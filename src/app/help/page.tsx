import type { Metadata } from "next";
import Link from "next/link";
import { Gavel, HandCoins, LifeBuoy, Lock, ShieldAlert, Store, Wallet } from "lucide-react";
import { Card } from "@/components/ui";
import { Reveal } from "@/components/motion";

export const metadata: Metadata = { title: "Help Center", alternates: { canonical: "/help" } };

const TOPICS = [
  { icon: Store, title: "Selling", items: [
    ["How do I list a business?", "Go to Sell, complete the 6-step form and submit for review. Drafts are saved and you can preview before publishing."],
    ["How many listings can I have?", "Free: 2 active listings, Pro: 10, Business: 50. Drafts don't count."],
    ["How do I prove my revenue?", "Upload payment-processor exports as private evidence and request financial verification from Dashboard → Verification."],
  ] },
  { icon: Gavel, title: "Auctions", items: [
    ["What is automatic bidding?", "Set a maximum and we'll bid the minimum increment needed to keep you in the lead, up to that maximum. Your maximum is never shown to others."],
    ["Why did the auction end later than expected?", "A valid bid in the final 2 minutes extends the auction by 2 minutes so everyone has a fair chance to respond."],
    ["What is a reserve price?", "A hidden minimum. If bidding doesn't reach it, the item doesn't sell. The listing shows whether the reserve has been met."],
  ] },
  { icon: HandCoins, title: "Offers & buying", items: [
    ["Is an accepted offer binding?", "Yes — accepting an offer creates a pending purchase that the buyer must pay for within the payment window."],
    ["Can I cancel?", "Buyers can cancel a purchase before paying. After payment, use the dispute process if something is wrong."],
  ] },
  { icon: Wallet, title: "Payments & payouts", items: [
    ["When do sellers get paid?", "After verified payment, a confirmed handover and release approval. Large transactions need administrator approval or use escrow."],
    ["How do I receive payouts?", "Connect a payout account in Dashboard → Payouts. Identity and bank checks are handled by the payment provider."],
  ] },
  { icon: ShieldAlert, title: "Safety", items: [
    ["Someone asked me to pay outside VENTUREX", "Don't. Report the conversation. Off-platform payments are not protected and violate our Terms."],
    ["How do I report a listing?", "Use the Report button on the listing page. Our trust & safety team reviews every report."],
  ] },
  { icon: Lock, title: "Account", items: [
    ["I didn't receive the verification email", "Check spam, then use “Resend verification email” in the banner at the top of the site."],
    ["How do I change my language or currency?", "Use the globe menu in the navigation bar. Converted prices are for display only."],
  ] },
];

export default function HelpPage() {
  return (
    <div className="container-x py-16">
      <Reveal>
        <div className="flex items-center gap-3"><LifeBuoy className="h-8 w-8 text-electric-400" /><h1 className="font-display text-4xl font-semibold text-white sm:text-5xl">Help Center</h1></div>
        <p className="mt-3 text-slate-400">Can&apos;t find an answer? <Link href="/contact" className="text-electric-400 hover:underline">Contact support</Link>.</p>
      </Reveal>
      <div className="mt-10 grid gap-5 md:grid-cols-2">
        {TOPICS.map((t) => (
          <Reveal key={t.title}>
            <Card className="h-full p-6">
              <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-white"><t.icon className="h-5 w-5 text-electric-400" /> {t.title}</h2>
              <div className="mt-4 space-y-4">
                {t.items.map(([q, a]) => (
                  <div key={q}><div className="font-medium text-slate-200">{q}</div><p className="mt-1 text-sm text-slate-400">{a}</p></div>
                ))}
              </div>
            </Card>
          </Reveal>
        ))}
      </div>
    </div>
  );
}
