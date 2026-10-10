import { BadgeCheck, Building2, CheckCircle2 } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { getI18n } from "@/i18n/server";
import { Card } from "@/components/ui";
import { VerificationForm } from "@/components/dashboard/misc";
import { GenericBadge } from "@/components/dashboard/status";

export default async function VerificationPage() {
  const user = await requireUser("/dashboard/verification");
  const { t, locale } = await getI18n();
  const [requests, listings] = await Promise.all([
    db.verificationRequest.findMany({ where: { userId: user.id }, include: { listing: { select: { title: true } } }, orderBy: { createdAt: "desc" } }),
    db.listing.findMany({ where: { sellerId: user.id, status: { in: ["DRAFT", "PENDING_REVIEW", "ACTIVE", "REJECTED"] } }, select: { id: true, title: true } }),
  ]);
  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl font-semibold text-white">{t("dash.verification")}</h1>
      <div className="grid gap-3 sm:grid-cols-2">
        <Card className="flex items-center gap-3 p-5">
          <BadgeCheck className={user.identityVerified ? "h-6 w-6 text-emerald-400" : "h-6 w-6 text-slate-600"} />
          <div><div className="font-medium text-white">Identity</div><div className="text-sm text-slate-400">{user.identityVerified ? "Verified" : "Not verified — recommended for high-value sales"}</div></div>
        </Card>
        <Card className="flex items-center gap-3 p-5">
          <Building2 className={user.businessVerified ? "h-6 w-6 text-emerald-400" : "h-6 w-6 text-slate-600"} />
          <div><div className="font-medium text-white">Business</div><div className="text-sm text-slate-400">{user.businessVerified ? "Verified" : "Optional business verification"}</div></div>
        </Card>
      </div>
      <Card className="p-6">
        <h2 className="mb-4 font-display text-lg font-semibold text-white">Request verification</h2>
        <VerificationForm listings={listings} />
      </Card>
      <Card className="p-6">
        <h2 className="mb-4 font-display text-lg font-semibold text-white">History</h2>
        {requests.length === 0 ? <p className="text-sm text-slate-500">{t("common.noResults")}</p> : (
          <div className="space-y-2">
            {requests.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white/[0.03] px-4 py-3 ring-1 ring-white/5">
                <div className="text-sm"><span className="font-medium text-white">{r.type.toLowerCase()}</span>{r.listing && <span className="text-slate-400"> · {r.listing.title}</span>}<div className="text-xs text-slate-500">{r.createdAt.toLocaleDateString(locale)}{r.reviewerNote && ` · ${r.reviewerNote}`}</div></div>
                <span className="flex items-center gap-2">{r.status === "APPROVED" && <CheckCircle2 className="h-4 w-4 text-emerald-400" />}<GenericBadge status={r.status} /></span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
