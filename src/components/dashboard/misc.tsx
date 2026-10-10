"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button, Field } from "../ui";
import { useToast } from "../toast";
import { Uploader, type Uploaded } from "../uploader";
import { deleteSavedSearchAction, updateMatchingPrefsAction } from "@/app/actions/engagement";
import { addTeamMemberAction, cancelSubscriptionAction, changePasswordAction, removeTeamMemberAction, startPayoutOnboardingAction, submitVerificationAction, subscribeAction, updateProfileAction } from "@/app/actions/account";
import { useLocale } from "@/i18n/client";
import { ALL_CATEGORIES, COUNTRIES } from "@/lib/categories";
import { cn } from "@/lib/utils";

function useAct() {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const act = (fn: () => Promise<{ ok: boolean; error?: string; data?: unknown }>, ok?: string, after?: (d: unknown) => void) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) return toast.error(r.error ?? "Error");
      if (ok) toast.success(ok);
      after?.(r.data);
      router.refresh();
    });
  return { act, pending, toast };
}

export function DeleteSavedSearch({ id }: { id: string }) {
  const { act, pending } = useAct();
  return <button disabled={pending} onClick={() => act(() => deleteSavedSearchAction(id))} className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-red-500/10 hover:text-red-300" aria-label="Delete"><Trash2 className="h-4 w-4" /></button>;
}

export function PayoutConnectButton({ connected }: { connected: boolean }) {
  const { pending, toast } = useAct();
  const [busy, start] = useTransition();
  return (
    <Button loading={pending || busy} onClick={() => start(async () => {
      const r = await startPayoutOnboardingAction();
      if (!r.ok) return toast.error(r.error);
      window.location.href = r.data!.url;
    })}>{connected ? "Update payout details" : "Connect payout account"}</Button>
  );
}

export function SubscribeButton({ code, label, variant = "primary" }: { code: string; label: string; variant?: "primary" | "secondary" | "gold" }) {
  const { toast } = useAct();
  const [busy, start] = useTransition();
  return (
    <Button variant={variant} className="w-full" loading={busy} onClick={() => start(async () => {
      const r = await subscribeAction(code);
      if (!r.ok) return toast.error(r.error);
      window.location.href = r.data!.url;
    })}>{label}</Button>
  );
}

export function CancelSubscriptionButton() {
  const { act, pending } = useAct();
  return <Button variant="ghost" loading={pending} onClick={() => confirm("Cancel at the end of the current billing period?") && act(() => cancelSubscriptionAction(), "Your plan will end at the end of the billing period")}>Cancel subscription</Button>;
}

export function TeamManager({ members, seats }: { members: { id: string; name: string; email: string }[]; seats: number }) {
  const { act, pending } = useAct();
  const [email, setEmail] = useState("");
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {members.map((m) => (
          <div key={m.id} className="flex items-center justify-between rounded-xl bg-white/[0.03] px-4 py-3 ring-1 ring-white/5">
            <div><div className="text-sm font-medium text-white">{m.name}</div><div className="text-xs text-slate-500">{m.email}</div></div>
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => act(() => removeTeamMemberAction(m.id))}>Remove</Button>
          </div>
        ))}
        {members.length === 0 && <p className="text-sm text-slate-500">No team members yet.</p>}
      </div>
      {members.length < seats && (
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); act(() => addTeamMemberAction(email), "Team member added", () => setEmail("")); }}>
          <input className="input" type="email" placeholder="colleague@company.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <Button type="submit" loading={pending}>Add</Button>
        </form>
      )}
    </div>
  );
}

export function VerificationForm({ listings }: { listings: { id: string; title: string }[] }) {
  const { act, pending, toast } = useAct();
  const [type, setType] = useState<"IDENTITY" | "BUSINESS" | "FINANCIALS" | "TRAFFIC">("IDENTITY");
  const [listingId, setListingId] = useState(listings[0]?.id ?? "");
  const [files, setFiles] = useState<Uploaded[]>([]);
  const [notes, setNotes] = useState("");
  const needsListing = type === "FINANCIALS" || type === "TRAFFIC";
  const help: Record<string, string> = {
    IDENTITY: "Government-issued ID (passport or ID card) and a selfie holding it. Required for high-value transactions.",
    BUSINESS: "Company registration extract, or proof you control the business (registrar, hosting, payment processor account).",
    FINANCIALS: "Payment processor exports (Stripe, PayPal, Shopify) or bank statements covering at least 6 months.",
    TRAFFIC: "Google Analytics / Plausible exports, or grant read-only analytics access and describe it in the notes.",
  };
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {(["IDENTITY", "BUSINESS", "FINANCIALS", "TRAFFIC"] as const).map((t) => (
          <button key={t} type="button" onClick={() => setType(t)} className={cn("rounded-xl py-2 text-xs font-semibold ring-1 transition", type === t ? "bg-brand text-white ring-transparent" : "text-slate-300 ring-white/10")}>{t.toLowerCase()}</button>
        ))}
      </div>
      <p className="text-sm text-slate-400">{help[type]}</p>
      {needsListing && (
        <Field label="Listing">
          <select className="input" value={listingId} onChange={(e) => setListingId(e.target.value)}>
            {listings.map((l) => <option key={l.id} value={l.id}>{l.title}</option>)}
          </select>
        </Field>
      )}
      <Uploader label="Documents" purpose="verification" files={files} onChange={setFiles} max={6} privateNote="Private — visible to you and VENTUREX reviewers only" onError={toast.error} />
      <Field label="Notes"><textarea className="input min-h-20" value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      <Button loading={pending} onClick={() => act(() => submitVerificationAction(type, files.map((f) => f.id), notes, needsListing ? listingId : undefined), "Submitted for review", () => { setFiles([]); setNotes(""); })}>Submit for verification</Button>
    </div>
  );
}

export function ProfileForm({ initial, storefront, branding }: { initial: { displayName: string; bio: string; country: string; githubUrl: string; websiteUrl: string; skills: string; storefrontTitle: string; storefrontAccent: string; avatarUrl: string | null }; storefront: boolean; branding: boolean }) {
  const { act, pending, toast } = useAct();
  const [f, setF] = useState(initial);
  const [avatar, setAvatar] = useState<Uploaded[]>([]);
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));
  return (
    <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); act(() => updateProfileAction(f), "Profile saved"); }}>
      <Uploader label="Profile picture" purpose="avatar" multiple={false} max={1} files={avatar} onChange={(x) => { setAvatar(x); if (x.length) toast.success("Profile picture updated"); }} onError={toast.error} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Display name"><input className="input" value={f.displayName} onChange={(e) => set("displayName", e.target.value)} /></Field>
        <Field label="Country">
          <select className="input" value={f.country} onChange={(e) => set("country", e.target.value)}>
            <option value="">—</option>
            {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Bio"><textarea className="input min-h-24" value={f.bio} onChange={(e) => set("bio", e.target.value)} /></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="GitHub"><input className="input" value={f.githubUrl} onChange={(e) => set("githubUrl", e.target.value)} placeholder="https://github.com/you" /></Field>
        <Field label="Website"><input className="input" value={f.websiteUrl} onChange={(e) => set("websiteUrl", e.target.value)} placeholder="https://" /></Field>
      </div>
      <Field label="Skills (developer profile, comma separated)"><input className="input" value={f.skills} onChange={(e) => set("skills", e.target.value)} /></Field>
      <div className={cn("grid gap-4 rounded-2xl p-4 ring-1 sm:grid-cols-2", storefront ? "ring-electric/30" : "opacity-60 ring-white/10")}>
        <Field label="Storefront title (Pro & Business)"><input className="input" disabled={!storefront} value={f.storefrontTitle} onChange={(e) => set("storefrontTitle", e.target.value)} /></Field>
        <Field label="Brand accent color (Business)"><input className="input" disabled={!branding} value={f.storefrontAccent} onChange={(e) => set("storefrontAccent", e.target.value)} placeholder="#3b82f6" /></Field>
      </div>
      <Button type="submit" loading={pending}>Save profile</Button>
    </form>
  );
}

export function MatchingPrefs({ categories, budget }: { categories: string[]; budget: number | null }) {
  const { act, pending } = useAct();
  const locale = useLocale();
  const [sel, setSel] = useState<string[]>(categories);
  const [b, setB] = useState(budget ? String(budget / 100) : "");
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {ALL_CATEGORIES.map((c) => (
          <button key={c.key} type="button" onClick={() => setSel((s) => (s.includes(c.key) ? s.filter((x) => x !== c.key) : [...s, c.key]))} className={cn("rounded-full px-3 py-1 text-xs font-medium transition", sel.includes(c.key) ? "bg-brand text-white" : "bg-white/5 text-slate-300 hover:bg-white/10")}>
            {c.label[locale]}
          </button>
        ))}
      </div>
      <Field label="Maximum budget (USD)" className="max-w-xs"><input className="input" type="number" min={0} value={b} onChange={(e) => setB(e.target.value)} /></Field>
      <Button loading={pending} onClick={() => act(() => updateMatchingPrefsAction(sel, b ? Number(b) : null), "Preferences saved")}>Save preferences</Button>
    </div>
  );
}

export function PasswordForm({ hasPassword }: { hasPassword: boolean }) {
  const { act, pending } = useAct();
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  return (
    <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); act(() => changePasswordAction(cur, next), "Password updated — other sessions were signed out", () => { setCur(""); setNext(""); }); }}>
      {hasPassword && <Field label="Current password"><input className="input" type="password" value={cur} onChange={(e) => setCur(e.target.value)} autoComplete="current-password" /></Field>}
      <Field label={hasPassword ? "New password" : "Set a password"}><input className="input" type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" /></Field>
      <div className="sm:col-span-2"><Button type="submit" variant="secondary" loading={pending}>Update password</Button></div>
    </form>
  );
}
