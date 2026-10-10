import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { paymentsConfigured, isSandbox } from "@/lib/payments";
import { escrowConfigured } from "@/lib/payments/escrow";
import { aiEnabled } from "@/lib/ai";
import { env, googleEnabled } from "@/lib/env";
import { Badge, Card } from "@/components/ui";
import { SettingsEditor } from "@/components/admin/editors";
import { ActionButton } from "@/components/admin/ui";
import { markContactHandledAdmin, moderateTestimonialAdmin } from "@/app/actions/admin";

export default async function AdminSettings() {
  const [s, testimonials, contacts] = await Promise.all([
    getSettings(),
    db.testimonial.findMany({ where: { status: "PENDING" }, include: { user: { select: { displayName: true } }, deal: { select: { reference: true, status: true, listing: { select: { title: true } } } } } }),
    db.contactMessage.findMany({ where: { handled: false }, orderBy: { createdAt: "desc" }, take: 30 }),
  ]);
  const integrations = [
    ["Payments", paymentsConfigured() ? (isSandbox() ? "Sandbox (development only)" : `Live: ${env.paymentProvider}`) : "Not configured", paymentsConfigured() && !isSandbox()],
    ["Escrow (Escrow.com)", escrowConfigured() ? "Configured" : "Manual escrow workflow", escrowConfigured()],
    ["Email (SMTP)", env.smtpUrl ? "Configured" : "Not configured — emails are logged only", Boolean(env.smtpUrl)],
    ["File storage", env.s3.bucket ? `S3: ${env.s3.bucket}` : "Local disk (development only)", Boolean(env.s3.bucket)],
    ["Google sign-in", googleEnabled() ? "Configured" : "Disabled", googleEnabled()],
    ["AI valuation analysis", aiEnabled() ? `Model ${env.anthropic.model}` : "Disabled (model-only estimates)", aiEnabled()],
  ] as const;

  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl font-semibold text-white">Site settings</h1>
      <Card className="p-6">
        <h2 className="mb-4 font-display font-semibold text-white">Integrations</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {integrations.map(([k, v, ok]) => <div key={k} className="flex items-center justify-between rounded-xl bg-white/[0.03] px-4 py-2.5 text-sm ring-1 ring-white/5"><span className="text-slate-300">{k}</span><Badge tone={ok ? "green" : "amber"}>{v}</Badge></div>)}
        </div>
      </Card>
      <Card className="p-6">
        <SettingsEditor initial={{ escrowThresholdUsd: String(s.escrowThresholdUsd / 100), adminReleaseThresholdUsd: String(s.adminReleaseThresholdUsd / 100), inspectionHours: String(s.inspectionHours), auctionPaymentHours: String(s.auctionPaymentHours), checkoutHoldMinutes: String(s.checkoutHoldMinutes), antiSnipeWindowMinutes: String(s.antiSnipeWindowMinutes), antiSnipeExtensionMinutes: String(s.antiSnipeExtensionMinutes), requireListingApproval: s.requireListingApproval, autoStartAuctions: s.autoStartAuctions,announcement: s.announcement, maintenanceMode: s.maintenanceMode, supportEmail: s.supportEmail }} />
      </Card>
      <Card className="p-6">
        <h2 className="mb-1 font-display font-semibold text-white">Success stories awaiting review</h2>
        <p className="mb-4 text-xs text-slate-500">Only stories tied to completed sales can be submitted. Approved stories appear on the homepage.</p>
        {testimonials.length === 0 ? <p className="text-sm text-slate-500">None</p> : testimonials.map((t) => (
          <div key={t.id} className="flex flex-wrap items-start justify-between gap-3 border-t border-white/5 py-3">
            <div className="max-w-2xl text-sm"><div className="text-slate-200">“{t.quote}”</div><div className="text-xs text-slate-500">{t.user.displayName} · {t.deal.reference} · {t.deal.listing.title} · deal {t.deal.status.toLowerCase()}</div></div>
            <div className="flex gap-2"><ActionButton label="Approve" variant="primary" action={moderateTestimonialAdmin.bind(null, t.id, true)} /><ActionButton label="Reject" action={moderateTestimonialAdmin.bind(null, t.id, false)} /></div>
          </div>
        ))}
      </Card>
      <Card className="p-6">
        <h2 className="mb-4 font-display font-semibold text-white">Contact messages</h2>
        {contacts.length === 0 ? <p className="text-sm text-slate-500">Inbox zero.</p> : contacts.map((c) => (
          <div key={c.id} className="flex flex-wrap items-start justify-between gap-3 border-t border-white/5 py-3">
            <div className="max-w-2xl text-sm"><div className="font-medium text-white">{c.subject}</div><div className="text-xs text-slate-500">{c.name} · <a href={`mailto:${c.email}`} className="text-electric-400">{c.email}</a> · {c.createdAt.toLocaleString()}</div><p className="mt-1 whitespace-pre-line text-slate-300">{c.body}</p></div>
            <ActionButton label="Mark handled" action={markContactHandledAdmin.bind(null, c.id)} />
          </div>
        ))}
      </Card>
    </div>
  );
}
