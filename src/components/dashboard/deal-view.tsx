"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { AlertOctagon, CheckCircle2, Circle, CircleDot, Clock, CreditCard, ExternalLink, FileText, Lock, MessageSquareWarning, ShieldCheck, Star } from "lucide-react";
import { Alert, Badge, Button, Card } from "../ui";
import { Modal } from "../modal";
import { useToast } from "../toast";
import { useRealtime } from "../realtime";
import { celebrate } from "../confetti";
import { Uploader, type Uploaded } from "../uploader";
import { DealStatusBadge } from "./status";
import { cancelDealAction, disputeMessageAction, handoverActionServer, openDisputeAction, payDealAction, reviewSellerAction, submitTestimonialAction } from "@/app/actions/trade";
import { formatMoney, type CurrencyCode } from "@/lib/money";
import { cn, timeAgo } from "@/lib/utils";

type Deal = {
  id: string;
  reference: string;
  status: string;
  source: string;
  currency: string;
  amount: number;
  commissionAmount: number;
  commissionRateBps: number;
  sellerNetAmount: number;
  amountUsd: number;
  escrowRequired: boolean;
  escrowStatus: string | null;
  paymentDueAt: string;
  inspectionEndsAt: string | null;
  buyerConfirmedAt: string | null;
  sellerConfirmedAt: string | null;
  releaseApprovedAt: string | null;
  payoutStatus: string;
  listing: { title: string; slug: string };
  buyer: { id: string; displayName: string; username: string };
  seller: { id: string; displayName: string; username: string; payoutsEnabled: boolean };
  stages: { stage: string; status: string; note: string | null; completedAt: string | null }[];
  checklist: { id: string; label: string; sellerDone: boolean; buyerVerified: boolean }[];
  disputes: { id: string; status: string; reason: string; description: string; resolution: string | null; createdAt: string; messages: { id: string; author: string; admin: boolean; body: string; file: { id: string; filename: string } | null; createdAt: string }[] }[];
  review: { rating: number; comment: string | null } | null;
  testimonial: { quote: string; status: string } | null;
};

const STAGE_LABEL: Record<string, { title: string; body: string }> = {
  PAYMENT_VERIFIED: { title: "Buyer completes verified payment", body: "Payment is confirmed by the payment provider — never by a button click." },
  SELLER_PREPARING: { title: "Seller prepares the business assets", body: "Credentials, documentation and accounts are gathered for handover." },
  DOMAIN_HOSTING: { title: "Domain & hosting transfer", body: "Domain moved to the buyer's registrar; hosting transferred or migrated." },
  CODE_AND_ASSETS: { title: "Source code & assets delivered", body: "Repositories, files, accounts and everything listed in the checklist." },
  BUYER_REVIEW: { title: "Buyer reviews the transferred assets", body: "The buyer verifies every checklist item works as described." },
  CONFIRMATION: { title: "Both parties confirm (or open a dispute)", body: "Funds stay protected until both sides confirm the handover." },
  FUNDS_RELEASE: { title: "Funds released by the payment provider", body: "Payout to the seller after documented release approval." },
  COMPLETE: { title: "Transaction complete", body: "Ownership has transferred. Commission is recorded as earned." },
};

export function DealView({ deal, me, locale, timeline, autoPay, checkout, escrowLink, escrowManual, inspectionHours, adminThresholdUsd }: {
  deal: Deal; me: string; locale: string; timeline: { id: string; action: string; actor: string; at: string }[]; autoPay: boolean; checkout: string | null; escrowLink: string | null; escrowManual: boolean; inspectionHours: number; adminThresholdUsd: number;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [modal, setModal] = useState<null | "dispute" | "cancel" | "review">(null);
  const [note, setNote] = useState("");
  const [dReason, setDReason] = useState("Assets not as described");
  const [dText, setDText] = useState("");
  const [msg, setMsg] = useState("");
  const [msgFile, setMsgFile] = useState<Uploaded[]>([]);
  const [rating, setRating] = useState(deal.review?.rating ?? 5);
  const [comment, setComment] = useState(deal.review?.comment ?? "");
  const [story, setStory] = useState(deal.testimonial?.quote ?? "");
  const paidOnce = useRef(false);
  // Optimistic checklist so ticks respond instantly; server state wins on refresh.
  const [checklist, setChecklist] = useState(deal.checklist);
  useEffect(() => setChecklist(deal.checklist), [deal.checklist]);
  const toggleItem = (itemId: string, field: "sellerDone" | "buyerVerified", value: boolean) => {
    setChecklist((c) => c.map((i) => (i.id === itemId ? { ...i, [field]: value } : i)));
    start(async () => {
      const r = await handoverActionServer(deal.id, { kind: "checklist", itemId, field, value });
      if (!r.ok) {
        toast.error(r.error);
        setChecklist((c) => c.map((i) => (i.id === itemId ? { ...i, [field]: !value } : i)));
      }
    });
  };

  const isBuyer = deal.buyer.id === me;
  const isSeller = deal.seller.id === me;
  const c = deal.currency as CurrencyCode;
  const fm = (n: number, cents = false) => formatMoney(n, c, { locale, cents });
  const openDispute = deal.disputes.find((d) => d.status === "OPEN" || d.status === "UNDER_REVIEW");

  useRealtime([`deal:${deal.id}`], () => router.refresh());

  useEffect(() => {
    if (checkout === "success" && deal.status !== "PENDING_PAYMENT" && !paidOnce.current) {
      paidOnce.current = true;
      celebrate();
    }
  }, [checkout, deal.status]);
  useEffect(() => {
    if (deal.status !== "COMPLETED") return;
    // Celebrate once per browser session, not on every visit.
    try {
      const k = `vx-celebrated-${deal.id}`;
      if (sessionStorage.getItem(k)) return;
      sessionStorage.setItem(k, "1");
    } catch {}
    celebrate();
  }, [deal.status, deal.id]);

  const act = (fn: () => Promise<{ ok: boolean; error?: string }>, success?: string) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) return toast.error(r.error ?? "Error");
      if (success) toast.success(success);
      setNote("");
      router.refresh();
    });

  const pay = () =>
    start(async () => {
      const r = await payDealAction(deal.id);
      if (!r.ok) return toast.error(r.error);
      window.location.href = r.data!.url;
    });

  useEffect(() => {
    if (autoPay && isBuyer && deal.status === "PENDING_PAYMENT" && !deal.escrowRequired) pay();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="mt-4 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="font-mono text-sm text-slate-500">{deal.reference}</div>
          <h1 className="font-display text-3xl font-semibold text-white">{deal.listing.title}</h1>
          <div className="mt-1 text-sm text-slate-400">Buyer <b className="text-slate-200">{deal.buyer.displayName}</b> · Seller <b className="text-slate-200">{deal.seller.displayName}</b> · {deal.source.replace("_", " ").toLowerCase()}</div>
        </div>
        <DealStatusBadge status={deal.status} />
      </div>

      {checkout === "success" && deal.status === "PENDING_PAYMENT" && <Alert tone="blue">Payment received by the provider — waiting for verification. This page updates automatically.</Alert>}
      {checkout === "cancelled" && deal.status === "PENDING_PAYMENT" && <Alert tone="amber">Checkout was cancelled. You can try again before the payment deadline.</Alert>}

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          {/* Next action */}
          {deal.status === "PENDING_PAYMENT" && (
            <Card className="p-6">
              <div className="flex items-center gap-2 font-display text-lg font-semibold text-white"><CreditCard className="h-5 w-5 text-electric-400" /> Payment</div>
              <p className="mt-2 text-sm text-slate-400"><Clock className="mr-1 inline h-4 w-4" /> Payment due {new Date(deal.paymentDueAt).toLocaleString(locale)} ({timeAgo(deal.paymentDueAt, locale)}).</p>
              {isBuyer ? (
                deal.escrowRequired ? (
                  <div className="mt-4 space-y-3">
                    <Alert tone="blue"><ShieldCheck className="mr-1 inline h-4 w-4" /> This is a high-value purchase, so payment goes through a licensed third-party escrow service.</Alert>
                    {escrowLink ? <a href={escrowLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-electric-400 hover:underline">Open escrow transaction <ExternalLink className="h-4 w-4" /></a> : escrowManual ? <p className="text-sm text-slate-400">Our team will contact you and the seller to open the escrow transaction. You&apos;ll be notified here.</p> : <Button onClick={pay} loading={pending}>Start escrow transaction</Button>}
                  </div>
                ) : (
                  <div className="mt-4 flex flex-wrap gap-3">
                    <Button size="lg" onClick={pay} loading={pending}>Pay {fm(deal.amount)} securely</Button>
                    <Button variant="ghost" onClick={() => setModal("cancel")}>Cancel purchase</Button>
                  </div>
                )
              ) : (
                <p className="mt-3 text-sm text-slate-400">Waiting for the buyer to complete payment. You&apos;ll be notified when the provider verifies it.</p>
              )}
            </Card>
          )}

          {openDispute && (
            <Card className="border-red-500/30 p-6">
              <div className="flex items-center gap-2 font-display text-lg font-semibold text-red-200"><AlertOctagon className="h-5 w-5" /> Dispute · {openDispute.reason}</div>
              <p className="mt-2 whitespace-pre-line text-sm text-slate-300">{openDispute.description}</p>
              <p className="mt-2 text-xs text-slate-500">Funds are frozen while an administrator reviews the case.</p>
              <div className="mt-4 space-y-2">
                {openDispute.messages.map((m) => (
                  <div key={m.id} className={cn("rounded-xl p-3 text-sm ring-1", m.admin ? "bg-violet/10 ring-violet/30" : "bg-white/[0.03] ring-white/5")}>
                    <div className="text-xs text-slate-500">{m.author}{m.admin && " · VENTUREX team"} · {timeAgo(m.createdAt, locale)}</div>
                    <div className="mt-1 whitespace-pre-line text-slate-200">{m.body}</div>
                    {m.file && <a href={`/api/files/${m.file.id}`} target="_blank" className="mt-1 inline-flex items-center gap-1 text-xs text-electric-400"><FileText className="h-3 w-3" /> {m.file.filename}</a>}
                  </div>
                ))}
              </div>
              <div className="mt-4 space-y-3">
                <textarea className="input min-h-20" placeholder="Add evidence or a reply…" value={msg} onChange={(e) => setMsg(e.target.value)} />
                <Uploader label="Attachment" purpose="dispute" multiple={false} max={1} files={msgFile} onChange={setMsgFile} onError={toast.error} />
                <Button size="sm" loading={pending} onClick={() => act(async () => { const r = await disputeMessageAction(openDispute.id, msg, msgFile[0]?.id ?? null); if (r.ok) { setMsg(""); setMsgFile([]); } return r; })}>Send</Button>
              </div>
            </Card>
          )}

          {/* Handover stages */}
          <Card className="p-6">
            <h2 className="mb-5 font-display text-lg font-semibold text-white">Secure business handover</h2>
            <ol className="relative space-y-5">
              {deal.stages.map((s, i) => {
                const info = STAGE_LABEL[s.stage];
                const done = s.status === "DONE" || s.status === "SKIPPED";
                const active = s.status === "IN_PROGRESS";
                return (
                  <motion.li key={s.stage} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }} className="relative flex gap-4">
                    {i < deal.stages.length - 1 && <span className={cn("absolute top-7 left-[11px] h-[calc(100%+4px)] w-px", done ? "bg-electric/60" : "bg-white/10")} />}
                    <span className="relative z-10 mt-0.5">
                      {done ? <CheckCircle2 className="h-6 w-6 text-electric-400" /> : active ? <CircleDot className="h-6 w-6 animate-pulse text-violet-400" /> : <Circle className="h-6 w-6 text-slate-600" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className={cn("font-medium", done || active ? "text-white" : "text-slate-500")}>{i + 1}. {info.title} {s.status === "SKIPPED" && <span className="text-xs text-slate-500">(not applicable)</span>}</div>
                      <div className="text-sm text-slate-500">{info.body}</div>
                      {s.note && <div className="mt-1 rounded-lg bg-white/[0.03] px-3 py-2 text-sm text-slate-300 ring-1 ring-white/5">{s.note}</div>}
                      {s.completedAt && <div className="mt-1 text-xs text-slate-600">{new Date(s.completedAt).toLocaleString(locale)}</div>}

                      {active && isSeller && !openDispute && s.stage === "SELLER_PREPARING" && deal.status === "PAID" && (
                        <div className="mt-3 space-y-2"><textarea className="input min-h-16" placeholder="Note for the buyer (optional)" value={note} onChange={(e) => setNote(e.target.value)} /><Button size="sm" loading={pending} onClick={() => act(() => handoverActionServer(deal.id, { kind: "seller_prepared", note }), "Buyer notified")}>Assets prepared — start transfer</Button></div>
                      )}
                      {active && isSeller && !openDispute && s.stage === "DOMAIN_HOSTING" && (
                        <div className="mt-3 space-y-2"><textarea className="input min-h-16" placeholder="e.g. Domain push initiated to buyer's Namecheap account" value={note} onChange={(e) => setNote(e.target.value)} /><div className="flex gap-2"><Button size="sm" loading={pending} onClick={() => act(() => handoverActionServer(deal.id, { kind: "domain_done", note }))}>Domain & hosting transferred</Button><Button size="sm" variant="ghost" onClick={() => act(() => handoverActionServer(deal.id, { kind: "domain_done", skip: true, note: "Not applicable" }))}>Not applicable</Button></div></div>
                      )}
                      {active && isSeller && !openDispute && s.stage === "CODE_AND_ASSETS" && (
                        <div className="mt-3 space-y-2"><textarea className="input min-h-16" placeholder="e.g. GitHub ownership transferred; credentials shared via the secure checklist" value={note} onChange={(e) => setNote(e.target.value)} /><Button size="sm" loading={pending} onClick={() => act(() => handoverActionServer(deal.id, { kind: "assets_delivered", note }), "Buyer review started")}>All assets delivered</Button></div>
                      )}
                    </div>
                  </motion.li>
                );
              })}
            </ol>
          </Card>

          {/* Checklist */}
          {deal.status !== "PENDING_PAYMENT" && deal.status !== "CANCELLED" && (
            <Card className="p-6">
              <h2 className="mb-1 font-display text-lg font-semibold text-white">Handover checklist</h2>
              <p className="mb-4 text-sm text-slate-500">Seller marks items delivered; the buyer verifies each one before confirming.</p>
              <div className="space-y-2">
                {checklist.map((item) => (
                  <div key={item.id} className="flex flex-wrap items-center gap-3 rounded-xl bg-white/[0.03] px-3 py-2.5 ring-1 ring-white/5">
                    <span className="min-w-0 flex-1 text-sm text-slate-200">{item.label}</span>
                    <label className={cn("flex items-center gap-1.5 text-xs", isSeller ? "cursor-pointer text-slate-300" : "text-slate-500")}>
                      <input type="checkbox" className="h-4 w-4 accent-blue-500" checked={item.sellerDone} disabled={!isSeller || !["PAID", "IN_TRANSFER", "BUYER_REVIEW"].includes(deal.status)} onChange={(e) => toggleItem(item.id, "sellerDone", e.target.checked)} /> Delivered
                    </label>
                    <label className={cn("flex items-center gap-1.5 text-xs", isBuyer ? "cursor-pointer text-slate-300" : "text-slate-500")}>
                      <input type="checkbox" className="h-4 w-4 accent-violet-500" checked={item.buyerVerified} disabled={!isBuyer || !["PAID", "IN_TRANSFER", "BUYER_REVIEW"].includes(deal.status)} onChange={(e) => toggleItem(item.id, "buyerVerified", e.target.checked)} /> Verified
                    </label>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {deal.status === "BUYER_REVIEW" && !openDispute && (
            <Card className="p-6">
              <h2 className="font-display text-lg font-semibold text-white">Confirm the handover</h2>
              {deal.inspectionEndsAt && <p className="mt-1 text-sm text-slate-400">Inspection window: {inspectionHours}h, ends {new Date(deal.inspectionEndsAt).toLocaleString(locale)}.</p>}
              <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                <div className="flex items-center gap-2">{deal.buyerConfirmedAt ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : <Circle className="h-4 w-4 text-slate-600" />} Buyer confirmation</div>
                <div className="flex items-center gap-2">{deal.sellerConfirmedAt ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : <Circle className="h-4 w-4 text-slate-600" />} Seller confirmation</div>
              </div>
              <div className="mt-5 flex flex-wrap gap-3">
                {((isBuyer && !deal.buyerConfirmedAt) || (isSeller && !deal.sellerConfirmedAt)) && (
                  <Button loading={pending} onClick={() => act(() => handoverActionServer(deal.id, { kind: "confirm" }), "Confirmation recorded")}>
                    {isBuyer ? "I received everything — confirm handover" : "Confirm handover complete"}
                  </Button>
                )}
                <Button variant="danger" onClick={() => setModal("dispute")}><MessageSquareWarning className="h-4 w-4" /> Open a dispute</Button>
              </div>
            </Card>
          )}
          {["PAID", "IN_TRANSFER", "RELEASE_PENDING"].includes(deal.status) && !openDispute && (
            <button onClick={() => setModal("dispute")} className="text-sm text-slate-500 underline-offset-4 hover:text-red-300 hover:underline">Problem with this transaction? Open a dispute</button>
          )}

          {deal.status === "RELEASE_PENDING" && (
            <Alert tone="blue">
              <Lock className="mr-1 inline h-4 w-4" />
              {deal.escrowRequired
                ? "Both parties confirmed. The escrow partner releases funds according to its rules."
                : !deal.releaseApprovedAt
                  ? deal.amountUsd >= adminThresholdUsd
                    ? "Both parties confirmed. Because of the transaction size, a VENTUREX administrator must approve the release."
                    : "Both parties confirmed. Release is being processed."
                  : deal.payoutStatus === "AWAITING_SELLER_ONBOARDING"
                    ? isSeller ? "Release approved. Connect your payout account in Dashboard → Payouts to receive the funds." : "Release approved — waiting for the seller to connect a payout account."
                    : deal.payoutStatus === "FAILED" ? "The payout failed and has been flagged for our team." : "Payout in progress."}
            </Alert>
          )}

          {deal.status === "COMPLETED" && isBuyer && (
            <Card className="p-6">
              <h2 className="font-display text-lg font-semibold text-white">Rate the seller</h2>
              <p className="text-sm text-slate-500">Only buyers of completed transactions can leave ratings.</p>
              <div className="mt-3 flex gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} onClick={() => setRating(n)} aria-label={`${n} stars`}><Star className={cn("h-7 w-7 transition", n <= rating ? "fill-amber-300 text-amber-300" : "text-slate-600")} /></button>
                ))}
              </div>
              <textarea className="input mt-3 min-h-20" placeholder="How was the handover?" value={comment} onChange={(e) => setComment(e.target.value)} />
              <Button className="mt-3" size="sm" loading={pending} onClick={() => act(() => reviewSellerAction(deal.id, rating, comment), "Thanks for your review")}>{deal.review ? "Update review" : "Submit review"}</Button>
            </Card>
          )}
          {deal.status === "COMPLETED" && isSeller && (
            <Card className="p-6">
              <h2 className="font-display text-lg font-semibold text-white">Share your success story</h2>
              <p className="text-sm text-slate-500">Stories from verified completed sales may be featured on the homepage after review.</p>
              {deal.testimonial && <Badge tone={deal.testimonial.status === "APPROVED" ? "green" : "amber"} className="mt-2">{deal.testimonial.status.toLowerCase()}</Badge>}
              <textarea className="input mt-3 min-h-20" value={story} onChange={(e) => setStory(e.target.value)} maxLength={600} />
              <Button className="mt-3" size="sm" loading={pending} onClick={() => act(() => submitTestimonialAction(deal.id, story), "Submitted for review")}>Submit</Button>
            </Card>
          )}
        </div>

        {/* Summary */}
        <aside className="space-y-6">
          <Card className="p-5">
            <div className="text-xs uppercase tracking-wider text-slate-500">Purchase price</div>
            <div className="font-display text-3xl font-semibold text-white">{fm(deal.amount, true)}</div>
            <div className="mt-1 text-xs text-slate-500">Contract currency: {deal.currency}. This amount never changes with display currency.</div>
            {(isSeller || !isBuyer) && (
              <div className="mt-4 space-y-2 border-t border-white/5 pt-4 text-sm">
                <div className="flex justify-between text-slate-400"><span>Platform commission ({deal.commissionRateBps / 100}%)</span><span className="tabular-nums">−{fm(deal.commissionAmount, true)}</span></div>
                <div className="flex justify-between font-semibold text-white"><span>You receive</span><span className="tabular-nums">{fm(deal.sellerNetAmount, true)}</span></div>
                <p className="text-xs text-slate-500">Commission applies only if the sale completes.</p>
              </div>
            )}
            {deal.escrowRequired && <div className="mt-4 flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200 ring-1 ring-emerald-500/20"><ShieldCheck className="h-4 w-4" /> Protected by third-party escrow{deal.escrowStatus ? ` · ${deal.escrowStatus.replace("_", " ")}` : ""}</div>}
          </Card>
          <Card className="p-5">
            <div className="mb-3 text-xs uppercase tracking-wider text-slate-500">Audit log</div>
            <ol className="max-h-96 space-y-2.5 overflow-y-auto text-xs">
              {timeline.map((l) => (
                <li key={l.id} className="flex gap-2">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-electric-400" />
                  <div><div className="text-slate-300">{l.action.replace("deal.", "").replace(/_/g, " ")}</div><div className="text-slate-600">{l.actor} · {new Date(l.at).toLocaleString(locale)}</div></div>
                </li>
              ))}
            </ol>
          </Card>
        </aside>
      </div>

      <Modal open={modal === "dispute"} onClose={() => setModal(null)} title="Open a dispute">
        <div className="space-y-4">
          <p className="text-sm text-slate-400">Funds will be frozen until an administrator reviews the case and the audit log. Provide as much detail as possible.</p>
          <select className="input" value={dReason} onChange={(e) => setDReason(e.target.value)}>
            {["Assets not as described", "Assets not delivered", "Access revoked after transfer", "Misrepresented financials", "Other"].map((r) => <option key={r}>{r}</option>)}
          </select>
          <textarea className="input min-h-32" placeholder="Describe the problem…" value={dText} onChange={(e) => setDText(e.target.value)} />
          <Button variant="danger" className="w-full" loading={pending} onClick={() => act(async () => { const r = await openDisputeAction(deal.id, dReason, dText); if (r.ok) setModal(null); return r; }, "Dispute opened")}>Open dispute</Button>
        </div>
      </Modal>
      <Modal open={modal === "cancel"} onClose={() => setModal(null)} title="Cancel purchase?">
        <p className="text-sm text-slate-400">The listing returns to the marketplace. No commission or fees are charged for cancelled transactions.</p>
        <div className="mt-6 flex gap-3">
          <Button variant="secondary" className="flex-1" onClick={() => setModal(null)}>Keep</Button>
          <Button variant="danger" className="flex-1" loading={pending} onClick={() => act(async () => { const r = await cancelDealAction(deal.id); if (r.ok) setModal(null); return r; }, "Purchase cancelled")}>Cancel purchase</Button>
        </div>
      </Modal>
    </div>
  );
}
