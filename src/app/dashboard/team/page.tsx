import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { getI18n } from "@/i18n/server";
import { userPlan } from "@/lib/listing-service";
import { Alert, Card } from "@/components/ui";
import { TeamManager } from "@/components/dashboard/misc";

export default async function TeamPage() {
  const user = await requireUser("/dashboard/team");
  const { t } = await getI18n();
  const [plan, members, memberOf] = await Promise.all([
    userPlan(user.id),
    db.teamMember.findMany({ where: { ownerId: user.id }, include: { member: { select: { displayName: true, email: true } } } }),
    db.teamMember.findMany({ where: { memberId: user.id }, include: { owner: { select: { displayName: true, username: true, listings: { where: { status: { in: ["ACTIVE", "PENDING_SALE", "PENDING_REVIEW"] } }, select: { id: true, title: true, slug: true, status: true } } } } } }),
  ]);
  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl font-semibold text-white">{t("dash.team")}</h1>
      {plan.teamSeats > 0 ? (
        <Card className="p-6">
          <h2 className="mb-1 font-display font-semibold text-white">Team members ({members.length}/{plan.teamSeats})</h2>
          <p className="mb-4 text-sm text-slate-500">Team members can view your listings, offers and transactions overview here, so your team can coordinate buyer communication.</p>
          <TeamManager seats={plan.teamSeats} members={members.map((m) => ({ id: m.id, name: m.member.displayName, email: m.member.email }))} />
        </Card>
      ) : (
        <Alert tone="blue">Team account access is included in the <Link href="/pricing" className="font-semibold underline">Business Seller</Link> plan.</Alert>
      )}
      {memberOf.length > 0 && (
        <Card className="p-6">
          <h2 className="mb-4 font-display font-semibold text-white">Teams you belong to</h2>
          {memberOf.map((m) => (
            <div key={m.id} className="mb-4">
              <div className="font-medium text-white">{m.owner.displayName} <span className="text-sm text-slate-500">@{m.owner.username}</span></div>
              <ul className="mt-2 space-y-1 text-sm">
                {m.owner.listings.map((l) => <li key={l.id}><Link href={`/listing/${l.slug}`} className="text-electric-400 hover:underline">{l.title}</Link> <span className="text-slate-500">· {l.status.toLowerCase()}</span></li>)}
                {m.owner.listings.length === 0 && <li className="text-slate-500">No active listings</li>}
              </ul>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
