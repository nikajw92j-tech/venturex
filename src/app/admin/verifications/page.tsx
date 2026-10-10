import Link from "next/link";
import { db } from "@/lib/db";
import { Badge, Card } from "@/components/ui";
import { ActionButton } from "@/components/admin/ui";
import { reviewVerificationAdmin } from "@/app/actions/admin";

export default async function AdminVerifications() {
  const reqs = await db.verificationRequest.findMany({
    where: { status: "PENDING" },
    include: { user: { select: { displayName: true, username: true, email: true, country: true, createdAt: true } }, listing: { select: { title: true, slug: true } }, documents: { include: { file: { select: { id: true, filename: true, mimeType: true } } } } },
    orderBy: { createdAt: "asc" },
  });
  return (
    <div className="space-y-5">
      <h1 className="font-display text-3xl font-semibold text-white">Verification requests</h1>
      {reqs.length === 0 && <p className="glass rounded-2xl p-8 text-center text-sm text-slate-500">No pending requests.</p>}
      {reqs.map((r) => (
        <Card key={r.id} className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2"><Badge tone="violet">{r.type.toLowerCase()}</Badge><Link href={`/u/${r.user.username}`} className="font-medium text-white hover:underline">{r.user.displayName}</Link><span className="text-sm text-slate-500">{r.user.email}</span></div>
              {r.listing && <div className="mt-1 text-sm text-slate-400">Listing: <Link href={`/listing/${r.listing.slug}`} className="text-electric-400 hover:underline">{r.listing.title}</Link></div>}
              {r.notes && <p className="mt-2 max-w-2xl text-sm text-slate-300">{r.notes}</p>}
              <div className="mt-2 flex flex-wrap gap-2">{r.documents.map((d) => <a key={d.id} href={`/api/files/${d.file.id}`} target="_blank" className="rounded-md bg-white/5 px-2 py-1 text-xs text-electric-400 ring-1 ring-white/10 hover:underline">{d.file.filename}</a>)}</div>
              <div className="mt-2 text-xs text-slate-500">Submitted {r.createdAt.toLocaleString()} · account since {r.user.createdAt.toLocaleDateString()}</div>
            </div>
            <div className="flex gap-2">
              <ActionButton label="Approve" variant="primary" prompt promptLabel="Note (optional)" action={reviewVerificationAdmin.bind(null, r.id, true)} />
              <ActionButton label="Reject" variant="danger" prompt promptLabel="What was missing?" action={reviewVerificationAdmin.bind(null, r.id, false)} />
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
