"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Button, Field } from "../ui";
import { useToast } from "../toast";
import { saveCommissionTiersAdmin, savePackageAdmin, savePlanAdmin, saveSettingsAdmin } from "@/app/actions/admin";
import { computeCommission, type Tier } from "@/lib/commission";

function useSave() {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const save = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) return toast.error(r.error ?? "Error");
      toast.success("Saved");
      router.refresh();
    });
  return { save, pending };
}

export function CommissionEditor({ initial }: { initial: Tier[] }) {
  const { save, pending } = useSave();
  const [rows, setRows] = useState(initial.map((t) => ({ minUsd: String(t.minUsd / 100), maxUsd: t.maxUsd === null ? "" : String(t.maxUsd / 100), ratePct: String(t.rateBps / 100) })));
  const [example, setExample] = useState("1000");
  const tiers: Tier[] = rows.map((r) => ({ minUsd: Math.round(Number(r.minUsd) * 100), maxUsd: r.maxUsd === "" ? null : Math.round(Number(r.maxUsd) * 100), rateBps: Math.round(Number(r.ratePct) * 100) }));
  const ex = Math.round(Number(example) * 100) || 0;
  const preview = ex ? computeCommission(ex, ex, tiers) : null;
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 text-xs uppercase tracking-wider text-slate-500"><span>From (USD, incl.)</span><span>To (USD, excl.; empty = no limit)</span><span>Rate %</span><span /></div>
        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2">
            {(["minUsd", "maxUsd", "ratePct"] as const).map((k) => (
              <input key={k} className="input" type="number" step="any" value={r[k]} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, [k]: e.target.value } : x)))} />
            ))}
            <button className="grid h-10 w-10 place-items-center rounded-lg text-slate-400 hover:bg-red-500/10 hover:text-red-300" onClick={() => setRows(rows.filter((_, j) => j !== i))} aria-label="Remove tier"><Trash2 className="h-4 w-4" /></button>
          </div>
        ))}
        <Button variant="ghost" size="sm" onClick={() => setRows([...rows, { minUsd: rows.at(-1)?.maxUsd || "0", maxUsd: "", ratePct: "4" }])}><Plus className="h-4 w-4" /> Add tier</Button>
      </div>
      <div className="flex flex-wrap items-end gap-3 rounded-xl bg-white/[0.03] p-4 ring-1 ring-white/10">
        <Field label="Preview a sale price (USD)"><input className="input w-40" type="number" value={example} onChange={(e) => setExample(e.target.value)} /></Field>
        {preview && <div className="pb-2 text-sm text-slate-300">Commission {preview.rateBps / 100}% = ${(preview.commission / 100).toFixed(2)} · seller receives ${(preview.sellerNet / 100).toFixed(2)}</div>}
      </div>
      <p className="text-xs text-slate-500">Changes apply to transactions created after saving. Existing transactions keep the rate captured at creation. Tiers must start at 0, be contiguous and end with no upper limit.</p>
      <Button loading={pending} onClick={() => save(() => saveCommissionTiersAdmin(rows.map((r) => ({ minUsd: Number(r.minUsd), maxUsd: r.maxUsd === "" ? null : Number(r.maxUsd), ratePct: Number(r.ratePct) }))))}>Save commission tiers</Button>
    </div>
  );
}

type PlanRow = { code: string; name: string; price: string; maxActiveListings: string; features: string; teamSeats: string; analyticsLevel: string; storefront: boolean; priorityReview: boolean; active: boolean };

export function PlanEditor({ plan }: { plan: PlanRow }) {
  const { save, pending } = useSave();
  const [f, setF] = useState(plan);
  const set = <K extends keyof PlanRow>(k: K, v: PlanRow[K]) => setF((x) => ({ ...x, [k]: v }));
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Name"><input className="input" value={f.name} onChange={(e) => set("name", e.target.value)} /></Field>
        <Field label="Price / month (USD)"><input className="input" type="number" disabled={f.code === "FREE"} value={f.price} onChange={(e) => set("price", e.target.value)} /></Field>
        <Field label="Active listings"><input className="input" type="number" value={f.maxActiveListings} onChange={(e) => set("maxActiveListings", e.target.value)} /></Field>
        <Field label="Team seats"><input className="input" type="number" value={f.teamSeats} onChange={(e) => set("teamSeats", e.target.value)} /></Field>
        <Field label="Analytics level (0–2)"><input className="input" type="number" min={0} max={2} value={f.analyticsLevel} onChange={(e) => set("analyticsLevel", e.target.value)} /></Field>
      </div>
      <Field label="Benefits (one per line)"><textarea className="input min-h-28" value={f.features} onChange={(e) => set("features", e.target.value)} /></Field>
      <div className="flex flex-wrap gap-4 text-sm text-slate-300">
        {(["storefront", "priorityReview", "active"] as const).map((k) => (
          <label key={k} className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4 accent-blue-500" checked={f[k]} disabled={k === "active" && f.code === "FREE"} onChange={(e) => set(k, e.target.checked)} /> {k}</label>
        ))}
      </div>
      <Button loading={pending} onClick={() => save(() => savePlanAdmin({ ...f, price: Number(f.price), maxActiveListings: Number(f.maxActiveListings), teamSeats: Number(f.teamSeats), analyticsLevel: Number(f.analyticsLevel) }))}>Save {f.code}</Button>
    </div>
  );
}

type PkgRow = { code: string; name: string; price: string; currency: "USD" | "GEL" | "EUR"; durationDays: string; features: string; active: boolean };

export function PackageEditor({ pkg }: { pkg: PkgRow }) {
  const { save, pending } = useSave();
  const [f, setF] = useState(pkg);
  const set = <K extends keyof PkgRow>(k: K, v: PkgRow[K]) => setF((x) => ({ ...x, [k]: v }));
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-4">
        <Field label="Name"><input className="input" value={f.name} onChange={(e) => set("name", e.target.value)} /></Field>
        <Field label="Price"><input className="input" type="number" value={f.price} onChange={(e) => set("price", e.target.value)} /></Field>
        <Field label="Currency"><select className="input" value={f.currency} onChange={(e) => set("currency", e.target.value as PkgRow["currency"])}>{["GEL", "USD", "EUR"].map((c) => <option key={c}>{c}</option>)}</select></Field>
        <Field label="Duration (days)"><input className="input" type="number" value={f.durationDays} onChange={(e) => set("durationDays", e.target.value)} /></Field>
      </div>
      <Field label="Benefits (one per line)"><textarea className="input min-h-24" value={f.features} onChange={(e) => set("features", e.target.value)} /></Field>
      <label className="flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" className="h-4 w-4 accent-blue-500" checked={f.active} onChange={(e) => set("active", e.target.checked)} /> Available for purchase</label>
      <Button loading={pending} onClick={() => save(() => savePackageAdmin({ ...f, price: Number(f.price), durationDays: Number(f.durationDays) }))}>Save {f.code}</Button>
    </div>
  );
}

type SettingsRow = { escrowThresholdUsd: string; adminReleaseThresholdUsd: string; inspectionHours: string; auctionPaymentHours: string; checkoutHoldMinutes: string; antiSnipeWindowMinutes: string; antiSnipeExtensionMinutes: string; requireListingApproval: boolean; autoStartAuctions: boolean; announcement: string; maintenanceMode: boolean; supportEmail: string };

export function SettingsEditor({ initial }: { initial: SettingsRow }) {
  const { save, pending } = useSave();
  const [f, setF] = useState(initial);
  const num = (k: keyof SettingsRow, label: string, hint?: string) => (
    <Field label={label} hint={hint}><input className="input" type="number" value={f[k] as string} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></Field>
  );
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        {num("escrowThresholdUsd", "Escrow required from (USD)", "High-value sales go through the escrow partner")}
        {num("adminReleaseThresholdUsd", "Admin release approval from (USD)", "Below this, release is auto-approved after both confirmations")}
        {num("inspectionHours", "Buyer inspection window (hours)")}
        {num("auctionPaymentHours", "Auction winner payment window (hours)")}
        {num("checkoutHoldMinutes", "Fixed-price checkout hold (minutes)")}
        {num("antiSnipeWindowMinutes", "Anti-sniping window (minutes)")}
        {num("antiSnipeExtensionMinutes", "Anti-sniping extension (minutes)")}
        <Field label="Support email"><input className="input" type="email" value={f.supportEmail} onChange={(e) => setF({ ...f, supportEmail: e.target.value })} /></Field>
      </div>
      <Field label="Site-wide announcement (empty = none)"><input className="input" value={f.announcement} onChange={(e) => setF({ ...f, announcement: e.target.value })} /></Field>
      <div className="flex flex-wrap gap-5 text-sm text-slate-300">
        <label className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4 accent-blue-500" checked={f.requireListingApproval} onChange={(e) => setF({ ...f, requireListingApproval: e.target.checked })} /> Require admin approval for new listings</label>
        <label className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4 accent-blue-500" checked={f.autoStartAuctions} onChange={(e) => setF({ ...f, autoStartAuctions: e.target.checked })} /> Start auctions automatically when the listing goes live (off = you start them from Admin → Auctions)</label>
        <label className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4 accent-red-500" checked={f.maintenanceMode} onChange={(e) => setF({ ...f, maintenanceMode: e.target.checked })} /> Maintenance mode (only admins can use the site)</label>
      </div>
      <Button loading={pending} onClick={() => save(() => saveSettingsAdmin({ ...f, escrowThresholdUsd: Number(f.escrowThresholdUsd), adminReleaseThresholdUsd: Number(f.adminReleaseThresholdUsd), inspectionHours: Number(f.inspectionHours), auctionPaymentHours: Number(f.auctionPaymentHours), checkoutHoldMinutes: Number(f.checkoutHoldMinutes), antiSnipeWindowMinutes: Number(f.antiSnipeWindowMinutes), antiSnipeExtensionMinutes: Number(f.antiSnipeExtensionMinutes) }))}>Save settings</Button>
    </div>
  );
}
