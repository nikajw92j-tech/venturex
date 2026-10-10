import Link from "next/link";
import { db } from "@/lib/db";
import { Card } from "@/components/ui";
import { PackageEditor } from "@/components/admin/editors";
import { ActionButton } from "@/components/admin/ui";
import { GenericBadge } from "@/components/dashboard/status";
import { cancelPromotionAdmin } from "@/app/actions/admin";
import { formatMoney, type CurrencyCode } from "@/lib/money";

export default async function AdminPromotions() {
  const [packages, promos] = await Promise.all([
    db.promotionPackage.findMany({ orderBy: { sortOrder: "asc" } }),
    db.promotion.findMany({ where: { status: { in: ["ACTIVE", "PENDING_PAYMENT", "EXPIRED"] } }, include: { listing: { select: { title: true, slug: true } }, seller: { select: { displayName: true } } }, orderBy: { createdAt: "desc" }, take: 50 }),
  ]);
  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl font-semibold text-white">Promotions</h1>
      <p className="text-sm text-slate-400">Edits apply to new purchases; paid promotions keep the package terms they were bought with.</p>
      <div className="grid gap-4 xl:grid-cols-3">
        {packages.map((p) => (
          <Card key={p.code} className="p-5">
            <h2 className="mb-3 font-display font-semibold text-white">{p.code}</h2>
            <PackageEditor pkg={{ code: p.code, name: p.name, price: String(p.price / 100), currency: p.currency as "USD" | "GEL" | "EUR", durationDays: String(p.durationDays), features: p.features.join("\n"), active: p.active }} />
          </Card>
        ))}
      </div>
      <Card className="overflow-hidden">
        <div className="border-b border-white/5 px-5 py-3 font-semibold text-white">Recent promotions</div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <tbody>
              {promos.map((p) => (
                <tr key={p.id} className="border-t border-white/5">
                  <td className="px-4 py-2.5"><Link href={`/listing/${p.listing.slug}`} className="text-white hover:underline">{p.listing.title}</Link><div className="text-xs text-slate-500">{p.seller.displayName}</div></td>
                  <td className="px-4 py-2.5 text-slate-300">{p.packageCode}</td>
                  <td className="px-4 py-2.5 text-slate-300">{formatMoney(p.price, p.currency as CurrencyCode)}</td>
                  <td className="px-4 py-2.5 text-xs text-slate-400">{p.impressions} imp · {p.clicks} clicks</td>
                  <td className="px-4 py-2.5 text-xs text-slate-500">{p.endsAt ? `ends ${p.endsAt.toLocaleDateString()}` : ""}</td>
                  <td className="px-4 py-2.5"><GenericBadge status={p.status} /></td>
                  <td className="px-4 py-2.5 text-right">{p.status === "ACTIVE" && <ActionButton label="Stop" variant="danger" confirm="Stops this promotion immediately (no automatic refund)." action={cancelPromotionAdmin.bind(null, p.id)} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
