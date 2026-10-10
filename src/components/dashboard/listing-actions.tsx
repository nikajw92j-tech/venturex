"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Eye, Megaphone, Pencil, RefreshCw, Trash2, Undo2 } from "lucide-react";
import { Button } from "../ui";
import { useToast } from "../toast";
import { deleteDraftAction, recheckDemoAction, withdrawListingAction } from "@/app/actions/listings";
import { decideDocumentAccessAction } from "@/app/actions/engagement";
import { respondOfferAction } from "@/app/actions/trade";

export function ListingRowActions({ id, slug, status, hasDemo }: { id: string; slug: string; status: string; hasDemo: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) return toast.error(r.error ?? "Error");
      toast.success(ok);
      router.refresh();
    });
  return (
    <div className="flex flex-wrap justify-end gap-1">
      <Link href={`/listing/${slug}`} className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-white/5 hover:text-white" title="View"><Eye className="h-4 w-4" /></Link>
      {!["PENDING_SALE", "SOLD", "REMOVED"].includes(status) && <Link href={`/sell?edit=${id}`} className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-white/5 hover:text-white" title="Edit"><Pencil className="h-4 w-4" /></Link>}
      {status === "ACTIVE" && <Link href={`/dashboard/promotions?listing=${id}`} className="grid h-8 w-8 place-items-center rounded-lg text-amber-300 hover:bg-amber-500/10" title="Promote"><Megaphone className="h-4 w-4" /></Link>}
      {hasDemo && <button disabled={pending} onClick={() => run(async () => { const r = await recheckDemoAction(id); return r.ok && !r.data?.ok ? { ok: false, error: "Demo URL did not respond" } : r; }, "Demo verified")} className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-white/5 hover:text-white" title="Re-check demo"><RefreshCw className="h-4 w-4" /></button>}
      {["ACTIVE", "PENDING_REVIEW"].includes(status) && <button disabled={pending} onClick={() => confirm("Withdraw this listing from the marketplace?") && run(() => withdrawListingAction(id), "Listing withdrawn")} className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-white/5 hover:text-white" title="Withdraw"><Undo2 className="h-4 w-4" /></button>}
      {["DRAFT", "REJECTED", "WITHDRAWN", "EXPIRED"].includes(status) && <button disabled={pending} onClick={() => confirm("Delete this listing permanently?") && run(() => deleteDraftAction(id), "Deleted")} className="grid h-8 w-8 place-items-center rounded-lg text-red-300 hover:bg-red-500/10" title="Delete"><Trash2 className="h-4 w-4" /></button>}
    </div>
  );
}

export function AccessDecision({ id }: { id: string }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const go = (grant: boolean) =>
    start(async () => {
      const r = await decideDocumentAccessAction(id, grant);
      if (!r.ok) return toast.error(r.error);
      router.refresh();
    });
  return (
    <div className="flex gap-2">
      <Button size="sm" loading={pending} onClick={() => go(true)}>Grant</Button>
      <Button size="sm" variant="secondary" disabled={pending} onClick={() => go(false)}>Decline</Button>
    </div>
  );
}

export function OfferResponse({ id, canRespond, canWithdraw, currency }: { id: string; canRespond: boolean; canWithdraw: boolean; currency: string }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const go = (decision: "accept" | "reject" | "counter" | "withdraw", amount?: number) =>
    start(async () => {
      const r = await respondOfferAction(id, decision, amount);
      if (!r.ok) return toast.error(r.error);
      if (decision === "accept" && r.data?.dealId) {
        toast.success("Offer accepted — a pending purchase was created");
        router.push(`/dashboard/deals/${r.data.dealId}`);
        return;
      }
      router.refresh();
    });
  return (
    <div className="flex flex-wrap gap-2">
      {canRespond && (
        <>
          <Button size="sm" loading={pending} onClick={() => confirm("Accept this offer? It becomes a binding pending purchase.") && go("accept")}>Accept</Button>
          <Button size="sm" variant="secondary" disabled={pending} onClick={() => { const v = prompt(`Counter-offer amount (${currency})`); if (v && Number(v) > 0) go("counter", Number(v)); }}>Counter</Button>
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => go("reject")}>Decline</Button>
        </>
      )}
      {canWithdraw && <Button size="sm" variant="ghost" disabled={pending} onClick={() => go("withdraw")}>Withdraw</Button>}
    </div>
  );
}
