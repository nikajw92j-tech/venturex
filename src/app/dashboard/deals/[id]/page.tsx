import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { getI18n } from "@/i18n/server";
import { getSettings } from "@/lib/settings";
import { STAGES } from "@/lib/deals";
import { escrowConfigured, escrowDashboardUrl } from "@/lib/payments/escrow";
import { DealView } from "@/components/dashboard/deal-view";

export default async function DealPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ checkout?: string; pay?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await requireUser(`/dashboard/deals/${id}`);
  const { locale } = await getI18n();
  const deal = await db.deal.findUnique({
    where: { id },
    include: {
      listing: { select: { title: true, slug: true, category: true } },
      buyer: { select: { id: true, displayName: true, username: true } },
      seller: { select: { id: true, displayName: true, username: true, payoutsEnabled: true } },
      stages: true,
      checklist: { orderBy: { sortOrder: "asc" } },
      disputes: { include: { messages: { include: { author: { select: { displayName: true, role: true } }, file: { select: { id: true, filename: true } } }, orderBy: { createdAt: "asc" } } }, orderBy: { createdAt: "desc" } },
      review: true,
      testimonial: true,
    },
  });
  if (!deal || (deal.buyerId !== user.id && deal.sellerId !== user.id && user.role !== "ADMIN")) notFound();
  const [settings, logs] = await Promise.all([
    getSettings(),
    db.auditLog.findMany({ where: { entityType: "Deal", entityId: id }, orderBy: { createdAt: "asc" }, include: { actor: { select: { displayName: true } } } }),
  ]);
  const stages = STAGES.map((s) => deal.stages.find((x) => x.stage === s)!).filter(Boolean);

  return (
    <div>
      <Link href="/dashboard/deals" className="text-sm text-slate-400 hover:text-white">← Transactions</Link>
      <DealView
        me={user.id}
        locale={locale}
        autoPay={sp.pay === "1"}
        checkout={sp.checkout ?? null}
        escrowLink={deal.escrowReference ? escrowDashboardUrl(deal.escrowReference) : null}
        escrowManual={deal.escrowRequired && !escrowConfigured()}
        inspectionHours={settings.inspectionHours}
        adminThresholdUsd={settings.adminReleaseThresholdUsd}
        deal={{
          id: deal.id,
          reference: deal.reference,
          status: deal.status,
          source: deal.source,
          currency: deal.currency,
          amount: deal.amount,
          commissionAmount: deal.commissionAmount,
          commissionRateBps: deal.commissionRateBps,
          sellerNetAmount: deal.sellerNetAmount,
          amountUsd: deal.amountUsd,
          escrowRequired: deal.escrowRequired,
          escrowStatus: deal.escrowStatus,
          paymentDueAt: deal.paymentDueAt.toISOString(),
          inspectionEndsAt: deal.inspectionEndsAt?.toISOString() ?? null,
          buyerConfirmedAt: deal.buyerConfirmedAt?.toISOString() ?? null,
          sellerConfirmedAt: deal.sellerConfirmedAt?.toISOString() ?? null,
          releaseApprovedAt: deal.releaseApprovedAt?.toISOString() ?? null,
          payoutStatus: deal.payoutStatus,
          listing: deal.listing,
          buyer: deal.buyer,
          seller: { ...deal.seller },
          stages: stages.map((s) => ({ stage: s.stage, status: s.status, note: s.note, completedAt: s.completedAt?.toISOString() ?? null })),
          checklist: deal.checklist.map((c) => ({ id: c.id, label: c.label, sellerDone: c.sellerDone, buyerVerified: c.buyerVerified })),
          disputes: deal.disputes.map((d) => ({ id: d.id, status: d.status, reason: d.reason, description: d.description, resolution: d.resolution, createdAt: d.createdAt.toISOString(), messages: d.messages.map((m) => ({ id: m.id, author: m.author.displayName, admin: m.author.role === "ADMIN", body: m.body, file: m.file, createdAt: m.createdAt.toISOString() })) })),
          review: deal.review ? { rating: deal.review.rating, comment: deal.review.comment } : null,
          testimonial: deal.testimonial ? { quote: deal.testimonial.quote, status: deal.testimonial.status } : null,
        }}
        timeline={logs.map((l) => ({ id: l.id, action: l.action, actor: l.actor?.displayName ?? "System", at: l.createdAt.toISOString() }))}
      />
    </div>
  );
}
