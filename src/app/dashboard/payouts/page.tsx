import { CheckCircle2, Clock, Wallet } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { getI18n } from "@/i18n/server";
import { paymentProvider, isSandbox } from "@/lib/payments";
import { Alert, Card } from "@/components/ui";
import { PayoutConnectButton } from "@/components/dashboard/misc";
import { DealStatusBadge } from "@/components/dashboard/status";
import { formatMoney, type CurrencyCode } from "@/lib/money";

export default async function PayoutsPage({ searchParams }: { searchParams: Promise<{ return?: string; onboarded?: string }> }) {
  const sp = await searchParams;
  let user = await requireUser("/dashboard/payouts");
  const { t, locale } = await getI18n();

  // Returning from provider onboarding: refresh the account status.
  if (sp.return && user.payoutAccountId && !user.payoutsEnabled) {
    const enabled = await paymentProvider().accountPayoutsEnabled(user.payoutAccountId).catch(() => false);
    if (enabled) {
      await db.user.update({ where: { id: user.id }, data: { payoutsEnabled: true } });
      user = { ...user, payoutsEnabled: true };
    }
  }

  const deals = await db.deal.findMany({
    where: { sellerId: user.id, status: { in: ["PAID", "IN_TRANSFER", "BUYER_REVIEW", "RELEASE_PENDING", "COMPLETED", "DISPUTED"] } },
    include: { listing: { select: { title: true } } },
    orderBy: { updatedAt: "desc" },
  });
  const sum = (filter: (d: (typeof deals)[number]) => boolean) =>
    deals.filter(filter).reduce((s, d) => s + Math.round((d.sellerNetAmount * d.amountUsd) / Math.max(1, d.amount)), 0);

  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl font-semibold text-white">{t("dash.payouts")}</h1>
      {sp.onboarded && <Alert tone="green">Payout account connected.</Alert>}
      <Card className="flex flex-wrap items-center justify-between gap-4 p-6">
        <div className="flex items-center gap-4">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-electric/25 to-violet/25 text-electric-400 ring-1 ring-white/10"><Wallet className="h-6 w-6" /></span>
          <div>
            <div className="font-semibold text-white">Payout account</div>
            <div className="text-sm text-slate-400">
              {user.payoutsEnabled ? <span className="flex items-center gap-1 text-emerald-300"><CheckCircle2 className="h-4 w-4" /> Connected and verified by the payment provider</span> : user.payoutAccountId ? <span className="flex items-center gap-1 text-amber-300"><Clock className="h-4 w-4" /> Onboarding incomplete</span> : "Not connected"}
            </div>
          </div>
        </div>
        <PayoutConnectButton connected={Boolean(user.payoutAccountId)} />
      </Card>
      <p className="text-sm text-slate-500">
        Identity checks, bank details and tax information are collected and stored by our payment provider{isSandbox() ? " (sandbox mode in this environment)" : ""} — VENTUREX never stores bank or card numbers. Funds are paid out only after verified payment, confirmed handover and documented release approval.
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-5"><div className="text-xs uppercase tracking-wider text-slate-500">Paid out (USD equiv.)</div><div className="mt-2 font-display text-2xl font-semibold text-white">{formatMoney(sum((d) => d.status === "COMPLETED"), "USD")}</div></Card>
        <Card className="p-5"><div className="text-xs uppercase tracking-wider text-slate-500">In handover (held)</div><div className="mt-2 font-display text-2xl font-semibold text-white">{formatMoney(sum((d) => ["PAID", "IN_TRANSFER", "BUYER_REVIEW", "DISPUTED"].includes(d.status)), "USD")}</div></Card>
        <Card className="p-5"><div className="text-xs uppercase tracking-wider text-slate-500">Awaiting release</div><div className="mt-2 font-display text-2xl font-semibold text-white">{formatMoney(sum((d) => d.status === "RELEASE_PENDING"), "USD")}</div></Card>
      </div>
      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-white/[0.03] text-left text-xs uppercase tracking-wider text-slate-500"><tr><th className="px-4 py-3">Sale</th><th className="px-4 py-3">{t("common.status")}</th><th className="px-4 py-3 text-right">Net</th><th className="px-4 py-3">Payout ref.</th></tr></thead>
          <tbody>
            {deals.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-500">{t("common.noResults")}</td></tr>}
            {deals.map((d) => (
              <tr key={d.id} className="border-t border-white/5">
                <td className="px-4 py-3"><a href={`/dashboard/deals/${d.id}`} className="text-white hover:underline">{d.listing.title}</a><div className="font-mono text-xs text-slate-500">{d.reference}</div></td>
                <td className="px-4 py-3"><DealStatusBadge status={d.status} /></td>
                <td className="px-4 py-3 text-right tabular-nums text-white">{formatMoney(d.sellerNetAmount, d.currency as CurrencyCode, { locale, cents: true })}</td>
                <td className="px-4 py-3 font-mono text-xs text-slate-500">{d.payoutReference ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
