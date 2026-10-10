import { notFound } from "next/navigation";
import { FlaskConical } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { isSandbox } from "@/lib/payments";
import { isProd } from "@/lib/env";
import { sandboxOnboardAction } from "@/app/actions/sandbox";
import { Button, Card } from "@/components/ui";

export const metadata = { title: "Sandbox payout onboarding", robots: { index: false } };

export default async function SandboxOnboarding({ searchParams }: { searchParams: Promise<{ account?: string }> }) {
  if (isProd || !isSandbox()) notFound();
  await requireUser();
  const { account } = await searchParams;
  if (!account) notFound();
  return (
    <div className="container-x max-w-lg py-16">
      <div className="mb-6 flex items-center gap-3 rounded-2xl border-2 border-dashed border-amber-400/60 bg-amber-500/10 p-4 text-amber-100">
        <FlaskConical className="h-8 w-8 shrink-0" />
        <div className="text-sm">
          <div className="font-bold uppercase tracking-wider">Sandbox — test environment</div>
          In production, sellers complete identity checks and bank details with the payment provider (e.g. Stripe Connect).
        </div>
      </div>
      <Card className="p-6">
        <div className="font-semibold text-white">Connect test payout account</div>
        <p className="mt-2 text-sm text-slate-400">Account: <code className="text-slate-300">{account}</code></p>
        <form action={sandboxOnboardAction.bind(null, account)} className="mt-6">
          <Button className="w-full" size="lg">Complete sandbox onboarding</Button>
        </form>
      </Card>
    </div>
  );
}
