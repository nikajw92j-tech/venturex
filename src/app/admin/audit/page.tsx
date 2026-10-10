import Link from "next/link";
import { db } from "@/lib/db";
import { Card } from "@/components/ui";
import { AdminSearch } from "@/components/admin/ui";

export default async function AdminAudit({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const where = sp.q ? { OR: [{ action: { contains: sp.q } }, { entityId: sp.q }, { entityType: sp.q }] } : {};
  const logs = await db.auditLog.findMany({ where, include: { actor: { select: { displayName: true, username: true } } }, orderBy: { createdAt: "desc" }, skip: (page - 1) * 100, take: 100 });
  return (
    <div className="space-y-5">
      <h1 className="font-display text-3xl font-semibold text-white">Audit log</h1>
      <AdminSearch placeholder="Filter by action (e.g. deal.), entity type or id" />
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-xs">
            <thead className="bg-white/[0.03] text-left uppercase tracking-wider text-slate-500"><tr><th className="px-3 py-2">Time</th><th className="px-3 py-2">Actor</th><th className="px-3 py-2">Action</th><th className="px-3 py-2">Entity</th><th className="px-3 py-2">Data</th><th className="px-3 py-2">IP</th></tr></thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id} className="border-t border-white/5 align-top">
                  <td className="px-3 py-2 whitespace-nowrap text-slate-500">{l.createdAt.toLocaleString()}</td>
                  <td className="px-3 py-2 text-slate-300">{l.actor?.displayName ?? "system"}</td>
                  <td className="px-3 py-2 font-mono text-electric-400">{l.action}</td>
                  <td className="px-3 py-2 text-slate-400">{l.entityType === "Deal" ? <Link href={`/dashboard/deals/${l.entityId}`} className="hover:underline">{l.entityType} {l.entityId.slice(-8)}</Link> : `${l.entityType} ${l.entityId.slice(-8)}`}</td>
                  <td className="max-w-md truncate px-3 py-2 font-mono text-slate-500" title={JSON.stringify(l.data)}>{l.data ? JSON.stringify(l.data) : ""}</td>
                  <td className="px-3 py-2 text-slate-600">{l.ip ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <div className="flex justify-between text-sm">
        {page > 1 ? <Link href={`/admin/audit?page=${page - 1}${sp.q ? `&q=${sp.q}` : ""}`} className="text-electric-400">← Newer</Link> : <span />}
        {logs.length === 100 && <Link href={`/admin/audit?page=${page + 1}${sp.q ? `&q=${sp.q}` : ""}`} className="text-electric-400">Older →</Link>}
      </div>
    </div>
  );
}
