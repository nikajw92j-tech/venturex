import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { getI18n } from "@/i18n/server";
import { Card, EmptyState, LinkButton } from "@/components/ui";
import { DeleteSavedSearch } from "@/components/dashboard/misc";

export default async function SavedSearchesPage() {
  const user = await requireUser("/dashboard/saved");
  const { t, locale } = await getI18n();
  const searches = await db.savedSearch.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" } });
  return (
    <div>
      <h1 className="mb-2 font-display text-3xl font-semibold text-white">{t("dash.saved")}</h1>
      <p className="mb-6 text-sm text-slate-400">We notify you when new listings match these searches. They also power your recommendations.</p>
      {searches.length === 0 ? (
        <EmptyState title={t("common.noResults")} action={<LinkButton href="/marketplace">{t("nav.marketplace")}</LinkButton>} />
      ) : (
        <div className="space-y-3">
          {searches.map((s) => {
            const q = s.query as Record<string, string>;
            const params = new URLSearchParams(Object.entries(q).filter(([k]) => k !== "market"));
            const base = q.market === "STARTER" ? "/starter" : "/marketplace";
            return (
              <Card key={s.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <Link href={`${base}?${params}`} className="font-medium text-white hover:underline">{s.name}</Link>
                  <div className="text-xs text-slate-500">{Object.entries(q).map(([k, v]) => `${k}: ${v}`).join(" · ")} · {s.createdAt.toLocaleDateString(locale)}</div>
                </div>
                <DeleteSavedSearch id={s.id} />
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
