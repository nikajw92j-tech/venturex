import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/forms";
import { VerifyBanner } from "@/components/layout/verify-banner";
import { Alert, LinkButton } from "@/components/ui";
import { getI18n } from "@/i18n/server";
import { getCurrentUser } from "@/lib/auth/session";
import { verifyEmailToken } from "@/lib/auth/verify";

export const metadata: Metadata = { title: "Verify email", robots: { index: false } };

export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ token?: string; sent?: string }> }) {
  const sp = await searchParams;
  const { t } = await getI18n();
  if (sp.token) {
    const ok = await verifyEmailToken(sp.token);
    return (
      <AuthShell title={t("auth.verifyTitle")}>
        {ok ? <Alert tone="green">{t("auth.verified")}</Alert> : <Alert tone="red">{t("auth.invalidLink")}</Alert>}
        <LinkButton href={ok ? "/dashboard" : "/login"} className="mt-6 w-full">{t("common.continue")}</LinkButton>
      </AuthShell>
    );
  }
  const user = await getCurrentUser();
  return (
    <AuthShell title={t("auth.verifyTitle")}>
      {user?.emailVerifiedAt ? (
        <Alert tone="green">{t("auth.verified")}</Alert>
      ) : (
        <>
          <p className="text-slate-300">{t("auth.verifySent", { email: user?.email ?? "your inbox" })}</p>
          {user && <div className="mt-6 overflow-hidden rounded-xl"><VerifyBanner /></div>}
        </>
      )}
      <LinkButton href="/dashboard" variant="secondary" className="mt-6 w-full">{t("nav.dashboard")}</LinkButton>
    </AuthShell>
  );
}
