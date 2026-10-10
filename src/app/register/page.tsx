import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell, RegisterForm } from "@/components/auth/forms";
import { getI18n } from "@/i18n/server";
import { getCurrentUser } from "@/lib/auth/session";
import { googleEnabled } from "@/lib/env";

export const metadata: Metadata = { title: "Create your account", robots: { index: false } };

export default async function RegisterPage() {
  if (await getCurrentUser()) redirect("/dashboard");
  const { t } = await getI18n();
  return (
    <AuthShell title={t("auth.registerTitle")} subtitle={t("auth.registerSub")}>
      <RegisterForm google={googleEnabled()} />
    </AuthShell>
  );
}
