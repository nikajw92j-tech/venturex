import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { getI18n } from "@/i18n/server";
import { markAllReadAction } from "@/app/actions/notifications";
import { Button, Card, EmptyState } from "@/components/ui";
import { cn, timeAgo } from "@/lib/utils";

export const metadata: Metadata = { title: "Notifications", robots: { index: false } };

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const user = await requireUser("/notifications");
  const { t, locale } = await getI18n();
  const page = Math.max(1, Number((await searchParams).page) || 1);
  const [items, total, unread] = await Promise.all([
    db.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, skip: (page - 1) * 30, take: 30 }),
    db.notification.count({ where: { userId: user.id } }),
    db.notification.count({ where: { userId: user.id, readAt: null } }),
  ]);
  return (
    <div className="container-x max-w-3xl py-10">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-3xl font-semibold text-white">{t("notif.title")} {unread > 0 && <span className="ml-2 rounded-full bg-brand px-2 py-0.5 align-middle text-sm">{unread}</span>}</h1>
        <form action={markAllReadAction}><Button variant="secondary" size="sm">{t("notif.markAll")}</Button></form>
      </div>
      {items.length === 0 ? <EmptyState title={t("notif.empty")} /> : (
        <Card className="divide-y divide-white/5 overflow-hidden">
          {items.map((n) => (
            <Link key={n.id} href={n.link ?? "#"} className={cn("flex gap-3 px-5 py-4 transition hover:bg-white/[0.03]", !n.readAt && "bg-electric/[0.05]")}>
              <span className={cn("mt-2 h-2 w-2 shrink-0 rounded-full", n.readAt ? "bg-transparent" : "bg-electric-400")} />
              <div className="min-w-0">
                <div className="font-medium text-white">{n.title}</div>
                <div className="text-sm text-slate-400">{n.body}</div>
                <div className="mt-1 text-xs text-slate-500">{timeAgo(n.createdAt, locale)}</div>
              </div>
            </Link>
          ))}
        </Card>
      )}
      <div className="mt-6 flex justify-between text-sm">
        {page > 1 ? <Link href={`/notifications?page=${page - 1}`} className="text-electric-400">← {t("common.back")}</Link> : <span />}
        {page * 30 < total && <Link href={`/notifications?page=${page + 1}`} className="text-electric-400">{t("common.next")} →</Link>}
      </div>
    </div>
  );
}
