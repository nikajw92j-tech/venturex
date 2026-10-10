import Link from "next/link";
import { db } from "@/lib/db";
import { Badge, Card } from "@/components/ui";
import { ActionButton, AdminSearch } from "@/components/admin/ui";
import { setUserFlagsAdmin, suspendUserAdmin } from "@/app/actions/admin";
import { countryName } from "@/lib/categories";

export default async function AdminUsers({ searchParams }: { searchParams: Promise<{ q?: string; filter?: string }> }) {
  const sp = await searchParams;
  const users = await db.user.findMany({
    where: {
      ...(sp.q ? { OR: [{ email: { contains: sp.q, mode: "insensitive" } }, { username: { contains: sp.q, mode: "insensitive" } }, { displayName: { contains: sp.q, mode: "insensitive" } }] } : {}),
      ...(sp.filter === "suspended" ? { status: "SUSPENDED" } : sp.filter === "sellers" ? { listings: { some: {} } } : sp.filter === "admins" ? { role: "ADMIN" } : {}),
    },
    include: { subscription: { select: { planCode: true, status: true } }, _count: { select: { listings: true, purchases: true, sales: true, bids: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return (
    <div className="space-y-5">
      <h1 className="font-display text-3xl font-semibold text-white">Users</h1>
      <div className="flex flex-wrap items-center gap-3">
        <AdminSearch placeholder="Search email, username, name" />
        {["all", "sellers", "suspended", "admins"].map((f) => <Link key={f} href={`/admin/users?filter=${f}`} className="text-sm text-slate-400 hover:text-white">{f}</Link>)}
      </div>
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="bg-white/[0.03] text-left text-xs uppercase tracking-wider text-slate-500"><tr><th className="px-4 py-3">User</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Activity</th><th className="px-4 py-3">Plan</th><th className="px-4 py-3">Joined</th><th className="px-4 py-3" /></tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-t border-white/5 align-top">
                  <td className="px-4 py-3">
                    <Link href={`/u/${u.username}`} className="font-medium text-white hover:underline">{u.displayName}</Link>
                    <div className="text-xs text-slate-500">{u.email} · @{u.username} · {countryName(u.country)}</div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {u.role === "ADMIN" && <Badge tone="violet">admin</Badge>}
                      {u.identityVerified && <Badge tone="green">ID verified</Badge>}
                      {u.businessVerified && <Badge tone="green">business verified</Badge>}
                      {!u.emailVerifiedAt && <Badge tone="amber">email unverified</Badge>}
                    </div>
                  </td>
                  <td className="px-4 py-3">{u.status === "SUSPENDED" ? <><Badge tone="red">suspended</Badge><div className="mt-1 max-w-48 text-xs text-slate-500">{u.suspendedReason}</div></> : <Badge tone="green">active</Badge>}</td>
                  <td className="px-4 py-3 text-xs text-slate-400">{u._count.listings} listings · {u._count.sales} sales · {u._count.purchases} purchases · {u._count.bids} bids</td>
                  <td className="px-4 py-3 text-xs text-slate-400">{u.subscription?.status === "ACTIVE" ? u.subscription.planCode : "FREE"}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">{u.createdAt.toLocaleDateString()}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap justify-end gap-1.5">
                      {u.status === "ACTIVE" ? <ActionButton label="Suspend" variant="danger" prompt confirm="Signs the user out, withdraws their live listings and cancels their live auctions." action={suspendUserAdmin.bind(null, u.id, true)} /> : <ActionButton label="Reinstate" action={suspendUserAdmin.bind(null, u.id, false, "")} />}
                      <ActionButton label={u.identityVerified ? "Revoke ID" : "Verify ID"} action={setUserFlagsAdmin.bind(null, u.id, { identityVerified: !u.identityVerified })} />
                      <ActionButton label={u.businessVerified ? "Revoke business" : "Verify business"} action={setUserFlagsAdmin.bind(null, u.id, { businessVerified: !u.businessVerified })} />
                      <ActionButton label={u.role === "ADMIN" ? "Remove admin" : "Make admin"} variant="ghost" confirm="Change this user's administrator access?" action={setUserFlagsAdmin.bind(null, u.id, { role: u.role === "ADMIN" ? "USER" : "ADMIN" })} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
