import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell, ResetForm } from "@/components/auth/forms";
import { Alert } from "@/components/ui";
import { getI18n } from "@/i18n/server";
import { peekToken } from "@/lib/auth/tokens";

export const metadata: Metadata = { title: "Choose a new password", robots: { index: false } };

export default async function ResetPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const { t } = await getI18n();
  const valid = token ? await peekToken(token, "PASSWORD_RESET") : false;
  return (
    <AuthShell title={t("auth.resetTitle")}>
      {valid && token ? <ResetForm token={token} /> : (
        <>
          <Alert tone="red">{t("auth.invalidLink")}</Alert>
          <Link href="/forgot-password" className="mt-4 inline-block text-sm text-electric-400 hover:underline">{t("auth.forgot")}</Link>
        </>
      )}
    </AuthShell>
  );
}
