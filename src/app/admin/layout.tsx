import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { AdminNav } from "@/components/admin/ui";

export const metadata: Metadata = { title: "Admin", robots: { index: false, follow: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  const [review, release, disputes, reports, verifications] = await Promise.all([
    db.listing.count({ where: { status: "PENDING_REVIEW" } }),
    db.deal.count({ where: { status: "RELEASE_PENDING", releaseApprovedAt: null } }),
    db.dispute.count({ where: { status: { in: ["OPEN", "UNDER_REVIEW"] } } }),
    db.report.count({ where: { status: "OPEN" } }),
    db.verificationRequest.count({ where: { status: "PENDING" } }),
  ]);
  return (
    <div className="container-x grid gap-6 py-8 lg:grid-cols-[230px_1fr]">
      <aside><AdminNav counts={{ review, release, disputes, reports, verifications }} /></aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
