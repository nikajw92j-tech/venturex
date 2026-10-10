import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { DashboardNav } from "@/components/dashboard/sidebar";

export const metadata: Metadata = { title: "Dashboard", robots: { index: false } };

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser("/dashboard");
  const [offers, deals] = await Promise.all([
    db.offer.count({ where: { status: "PENDING", OR: [{ sellerId: user.id, fromSeller: false }, { buyerId: user.id, fromSeller: true }] } }),
    db.deal.count({ where: { OR: [{ buyerId: user.id }, { sellerId: user.id }], status: { in: ["PENDING_PAYMENT", "PAID", "IN_TRANSFER", "BUYER_REVIEW", "RELEASE_PENDING", "DISPUTED"] } } }),
  ]);
  return (
    <div className="container-x grid gap-6 py-8 lg:grid-cols-[230px_1fr]">
      <aside>
        <DashboardNav counts={{ offers, deals }} />
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
