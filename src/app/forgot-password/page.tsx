import type { Metadata } from "next";
import { AuthShell, ForgotForm } from "@/components/auth/forms";
import { getI18n } from "@/i18n/server";

export const metadata: Metadata = { title: "Reset password", robots: { index: false } };

export default async function ForgotPage() {
  const { t } = await getI18n();
  return (
    <AuthShell title={t("auth.resetTitle")}>
      <ForgotForm />
    </AuthShell>
  );
}
