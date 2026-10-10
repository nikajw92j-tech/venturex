import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell, LoginForm } from "@/components/auth/forms";
import { getI18n } from "@/i18n/server";
import { getCurrentUser } from "@/lib/auth/session";
import { googleEnabled } from "@/lib/env";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; reset?: string; error?: string }> }) {
  const sp = await searchParams;
  if (await getCurrentUser()) redirect(sp.next?.startsWith("/") ? sp.next : "/dashboard");
  const { t } = await getI18n();
  const notice = sp.reset ? t("auth.resetDone") : sp.error === "google" ? "Google sign-in failed. Please try again." : undefined;
  return (
    <AuthShell title={t("auth.loginTitle")} subtitle={t("auth.loginSub")}>
      <LoginForm google={googleEnabled()} next={sp.next} notice={notice} />
    </AuthShell>
  );
}
