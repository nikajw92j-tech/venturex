import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { getI18n } from "@/i18n/server";
import { userPlan } from "@/lib/listing-service";
import { Card } from "@/components/ui";
import { MatchingPrefs, PasswordForm, ProfileForm } from "@/components/dashboard/misc";

export default async function SettingsPage() {
  const session = await requireUser("/dashboard/settings");
  const { t } = await getI18n();
  const [u, plan] = await Promise.all([db.user.findUniqueOrThrow({ where: { id: session.id } }), userPlan(session.id)]);
  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl font-semibold text-white">{t("dash.settings")}</h1>
      <Card className="p-6">
        <h2 className="mb-5 font-display text-lg font-semibold text-white">Profile</h2>
        <ProfileForm
          storefront={plan.storefront}
          branding={plan.code === "BUSINESS"}
          initial={{ displayName: u.displayName, bio: u.bio ?? "", country: u.country ?? "", githubUrl: u.githubUrl ?? "", websiteUrl: u.websiteUrl ?? "", skills: u.skills.join(", "), storefrontTitle: u.storefrontTitle ?? "", storefrontAccent: u.storefrontAccent ?? "", avatarUrl: u.avatarUrl }}
        />
      </Card>
      <Card className="p-6">
        <h2 className="mb-1 font-display text-lg font-semibold text-white">{t("market.recommended")}</h2>
        <p className="mb-5 text-sm text-slate-500">{t("market.recommendedSub")}</p>
        <MatchingPrefs categories={u.preferredCategories} budget={u.budgetMaxUsd} />
      </Card>
      <Card className="p-6">
        <h2 className="mb-5 font-display text-lg font-semibold text-white">Security</h2>
        <div className="mb-4 text-sm text-slate-400">Email: <span className="text-white">{u.email}</span> {u.googleId && <span className="ml-2 text-xs text-slate-500">· Google sign-in linked</span>}</div>
        <PasswordForm hasPassword={Boolean(u.passwordHash)} />
      </Card>
    </div>
  );
}
