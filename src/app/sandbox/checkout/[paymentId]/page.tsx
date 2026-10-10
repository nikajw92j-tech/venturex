import { notFound } from "next/navigation";
import { FlaskConical } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { isSandbox } from "@/lib/payments";
import { isProd } from "@/lib/env";
import { formatMoney, type CurrencyCode } from "@/lib/money";
import { sandboxPayAction } from "@/app/actions/sandbox";
import { Alert, Button, Card } from "@/components/ui";

export const metadata = { title: "Sandbox checkout", robots: { index: false } };

export default async function SandboxCheckout({ params }: { params: Promise<{ paymentId: string }> }) {
  if (isProd || !isSandbox()) notFound();
  const { paymentId } = await params;
  const user = await requireUser();
  const p = await db.payment.findUnique({ where: { id: paymentId }, include: { deal: { include: { listing: true } }, promotion: { include: { listing: true } } } });
  if (!p || p.userId !== user.id) notFound();
  const description = p.deal ? `${p.deal.reference} — ${p.deal.listing.title}` : p.promotion ? `Promotion — ${p.promotion.listing.title}` : `Seller plan: ${p.planCode}`;

  return (
    <div className="container-x max-w-lg py-16">
      <div className="mb-6 flex items-center gap-3 rounded-2xl border-2 border-dashed border-amber-400/60 bg-amber-500/10 p-4 text-amber-100">
        <FlaskConical className="h-8 w-8 shrink-0" />
        <div className="text-sm">
          <div className="font-bold uppercase tracking-wider">Sandbox — test environment</div>
          No money moves. This page replaces the payment provider&apos;s checkout during development and is disabled in production.
        </div>
      </div>
      <Card className="p-6">
        <div className="text-xs uppercase tracking-wider text-slate-500">Paying</div>
        <div className="mt-1 font-semibold text-white">{description}</div>
        <div className="mt-4 font-display text-4xl font-semibold text-white">{formatMoney(p.amount, p.currency as CurrencyCode, { cents: true })}</div>
        <div className="mt-1 text-xs text-slate-500">Payment {p.id} · status {p.status}</div>
        {p.status === "SUCCEEDED" ? (
          <Alert tone="green" className="mt-6">This payment has already succeeded.</Alert>
        ) : (
          <div className="mt-6 grid gap-3">
            <form action={sandboxPayAction.bind(null, p.id, "success")}>
              <Button className="w-full" size="lg">Simulate successful payment</Button>
            </form>
            <form action={sandboxPayAction.bind(null, p.id, "fail")}>
              <Button variant="danger" className="w-full">Simulate declined card</Button>
            </form>
          </div>
        )}
      </Card>
    </div>
  );
}
