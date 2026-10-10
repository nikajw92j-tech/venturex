import { db } from "@/lib/db";
import { Card } from "@/components/ui";
import { PlanEditor } from "@/components/admin/editors";

export default async function AdminPlans() {
  const [plans, counts] = await Promise.all([
    db.plan.findMany({ orderBy: { sortOrder: "asc" } }),
    db.subscription.groupBy({ by: ["planCode"], where: { status: "ACTIVE" }, _count: true }),
  ]);
  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl font-semibold text-white">Subscription plans</h1>
      <p className="text-sm text-slate-400">Price changes apply to new subscriptions. Commission rates are the same for every plan.</p>
      {plans.map((p) => (
        <Card key={p.code} className="p-6">
          <div className="mb-4 flex items-center justify-between"><h2 className="font-display text-lg font-semibold text-white">{p.code}</h2><span className="text-sm text-slate-400">{counts.find((c) => c.planCode === p.code)?._count ?? 0} active subscribers</span></div>
          <PlanEditor plan={{ code: p.code, name: p.name, price: String(p.priceMonthly / 100), maxActiveListings: String(p.maxActiveListings), features: p.features.join("\n"), teamSeats: String(p.teamSeats), analyticsLevel: String(p.analyticsLevel), storefront: p.storefront, priorityReview: p.priorityReview, active: p.active }} />
        </Card>
      ))}
    </div>
  );
}
