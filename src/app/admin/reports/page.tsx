import Link from "next/link";
import { db } from "@/lib/db";
import { Card } from "@/components/ui";
import { GenericBadge } from "@/components/dashboard/status";
import { ActionButton } from "@/components/admin/ui";
import { resolveReportAdmin } from "@/app/actions/admin";

async function targetLink(type: string, id: string) {
  if (type === "LISTING") {
    const l = await db.listing.findUnique({ where: { id }, select: { slug: true, title: true } });
    return l ? { href: `/listing/${l.slug}`, label: l.title } : null;
  }
  if (type === "USER") {
    const u = await db.user.findUnique({ where: { id }, select: { username: true } });
    return u ? { href: `/u/${u.username}`, label: `@${u.username}` } : null;
  }
  return { href: `#conversation-${id}`, label: `Conversation ${id.slice(-6)}` };
}

export default async function AdminReports() {
  const reports = await db.report.findMany({ where: { status: "OPEN" }, include: { reporter: { select: { displayName: true } } }, orderBy: { createdAt: "asc" }, take: 100 });
  const links = await Promise.all(reports.map((r) => targetLink(r.targetType, r.targetId)));
  // For reported conversations, admins can read the thread to investigate.
  const convos = await db.message.findMany({ where: { conversationId: { in: reports.filter((r) => r.targetType === "CONVERSATION").map((r) => r.targetId) } }, include: { sender: { select: { displayName: true } } }, orderBy: { createdAt: "asc" }, take: 300 });

  return (
    <div className="space-y-5">
      <h1 className="font-display text-3xl font-semibold text-white">Reports</h1>
      {reports.length === 0 && <p className="glass rounded-2xl p-8 text-center text-sm text-slate-500">No open reports.</p>}
      {reports.map((r, i) => (
        <Card key={r.id} className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2"><GenericBadge status={r.targetType} /> {links[i] && <Link href={links[i]!.href} target="_blank" className="font-medium text-white hover:underline">{links[i]!.label}</Link>}</div>
              <div className="mt-1 text-sm text-slate-300">{r.reason}</div>
              {r.details && <p className="mt-1 text-sm text-slate-400">{r.details}</p>}
              <div className="text-xs text-slate-500">Reported by {r.reporter.displayName} · {r.createdAt.toLocaleString()}</div>
              {r.targetType === "CONVERSATION" && (
                <details className="mt-3 text-sm">
                  <summary className="cursor-pointer text-electric-400">View conversation</summary>
                  <div className="mt-2 max-h-72 space-y-1 overflow-y-auto rounded-lg bg-white/[0.03] p-3">
                    {convos.filter((m) => m.conversationId === r.targetId).map((m) => <div key={m.id} className={m.flagged ? "text-amber-300" : "text-slate-300"}><b>{m.sender.displayName}:</b> {m.body}</div>)}
                  </div>
                </details>
              )}
            </div>
            <div className="flex gap-2">
              <ActionButton label="Resolve" variant="primary" prompt promptLabel="Action taken" action={resolveReportAdmin.bind(null, r.id, "RESOLVED")} />
              <ActionButton label="Dismiss" prompt promptLabel="Why no action is needed" action={resolveReportAdmin.bind(null, r.id, "DISMISSED")} />
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
