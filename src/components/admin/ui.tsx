"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, BarChart3, CheckSquare, FileSearch, Flag, Gavel, Layers, Megaphone, Percent, Repeat, Scale, Settings, ShieldAlert, Users } from "lucide-react";
import { Button } from "../ui";
import { Modal } from "../modal";
import { useToast } from "../toast";
import { cn } from "@/lib/utils";

export function AdminNav({ counts }: { counts: Record<string, number> }) {
  const path = usePathname();
  const items = [
    { href: "/admin", label: "Analytics", icon: BarChart3 },
    { href: "/admin/listings", label: "Listings", icon: Layers, badge: counts.review },
    { href: "/admin/users", label: "Users", icon: Users },
    { href: "/admin/auctions", label: "Auctions", icon: Gavel },
    { href: "/admin/transactions", label: "Transactions", icon: Repeat, badge: counts.release },
    { href: "/admin/disputes", label: "Disputes", icon: Scale, badge: counts.disputes },
    { href: "/admin/reports", label: "Reports", icon: Flag, badge: counts.reports },
    { href: "/admin/verifications", label: "Verifications", icon: CheckSquare, badge: counts.verifications },
    { href: "/admin/suspicious", label: "Suspicious activity", icon: ShieldAlert },
    { href: "/admin/commissions", label: "Commission", icon: Percent },
    { href: "/admin/plans", label: "Plans", icon: AlertTriangle },
    { href: "/admin/promotions", label: "Promotions", icon: Megaphone },
    { href: "/admin/settings", label: "Settings", icon: Settings },
    { href: "/admin/audit", label: "Audit log", icon: FileSearch },
  ];
  return (
    <nav className="glass flex gap-1 overflow-x-auto rounded-2xl p-2 lg:sticky lg:top-20 lg:flex-col lg:p-3">
      <div className="hidden px-3 pt-1 pb-2 text-[11px] font-semibold uppercase tracking-wider text-violet-400 lg:block">Administration</div>
      {items.map((i) => {
        const active = i.href === "/admin" ? path === "/admin" : path.startsWith(i.href);
        return (
          <Link key={i.href} href={i.href} className={cn("relative flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium whitespace-nowrap transition", active ? "text-white" : "text-slate-400 hover:text-white")}>
            {active && <motion.span layoutId="admin-active" className="absolute inset-0 -z-10 rounded-xl bg-gradient-to-r from-violet/25 to-electric/15 ring-1 ring-violet/30" />}
            <i.icon className="h-4 w-4" /> {i.label}
            {i.badge ? <span className="ml-auto rounded-full bg-red-500/80 px-1.5 text-[10px] font-bold text-white">{i.badge}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}

type Result = { ok: boolean; error?: string };

/** Button that runs an admin action, optionally asking for a confirmation and/or a text reason first. */
export function ActionButton({
  label,
  action,
  confirm,
  prompt,
  promptLabel,
  variant = "secondary",
  size = "sm",
  success,
}: {
  label: string;
  action: (text: string) => Promise<Result>;
  confirm?: string;
  prompt?: boolean;
  promptLabel?: string;
  variant?: "primary" | "secondary" | "ghost" | "danger" | "gold" | "outline";
  size?: "sm" | "md";
  success?: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const exec = (t: string) =>
    start(async () => {
      const r = await action(t);
      if (!r.ok) return toast.error(r.error ?? "Error");
      toast.success(success ?? "Done");
      setOpen(false);
      setText("");
      router.refresh();
    });
  return (
    <>
      <Button size={size} variant={variant} loading={pending} onClick={() => (prompt || confirm ? setOpen(true) : exec(""))}>{label}</Button>
      <Modal open={open} onClose={() => setOpen(false)} title={label}>
        {confirm && <p className="mb-4 text-sm text-slate-300">{confirm}</p>}
        {prompt && <textarea className="input mb-4 min-h-24" placeholder={promptLabel ?? "Reason / note"} value={text} onChange={(e) => setText(e.target.value)} />}
        <div className="flex gap-3">
          <Button variant="secondary" className="flex-1" onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant={variant === "danger" ? "danger" : "primary"} className="flex-1" loading={pending} onClick={() => exec(text)}>Confirm</Button>
        </div>
      </Modal>
    </>
  );
}

/** For "datetime" fields, defaultValue is an ISO timestamp. */
type FormField = { name: string; label: string; type?: "text" | "number" | "datetime"; defaultValue?: string; hint?: string };

/** Datetime-local value ("YYYY-MM-DDTHH:mm") in the viewer's timezone. */
function toLocalInput(d: Date | string | null | undefined) {
  if (!d) return "";
  const x = new Date(d);
  return new Date(x.getTime() - x.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

/** Button that opens a small form and runs an admin action with its values. Datetimes are sent as ISO strings. */
export function FormButton({
  label,
  title,
  fields,
  action,
  description,
  variant = "secondary",
  success,
}: {
  label: string;
  title?: string;
  fields: FormField[];
  action: (values: Record<string, string>) => Promise<Result>;
  description?: string;
  variant?: "primary" | "secondary" | "ghost" | "danger" | "gold" | "outline";
  success?: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const initial = () => Object.fromEntries(fields.map((f) => [f.name, f.type === "datetime" ? toLocalInput(f.defaultValue) : (f.defaultValue ?? "")]));
  const [values, setValues] = useState<Record<string, string>>(initial);
  const exec = () =>
    start(async () => {
      const out: Record<string, string> = {};
      for (const f of fields) out[f.name] = f.type === "datetime" && values[f.name] ? new Date(values[f.name]).toISOString() : values[f.name];
      const r = await action(out);
      if (!r.ok) return toast.error(r.error ?? "Error");
      toast.success(success ?? "Done");
      setOpen(false);
      router.refresh();
    });
  return (
    <>
      <Button size="sm" variant={variant} loading={pending} onClick={() => { setValues(initial()); setOpen(true); }}>{label}</Button>
      <Modal open={open} onClose={() => setOpen(false)} title={title ?? label}>
        <form onSubmit={(e) => { e.preventDefault(); exec(); }} className="space-y-4">
          {description && <p className="text-sm text-slate-300">{description}</p>}
          {fields.map((f) => (
            <div key={f.name}>
              <label className="label" htmlFor={`fb-${f.name}`}>{f.label}</label>
              <input
                id={`fb-${f.name}`}
                className="input"
                type={f.type === "datetime" ? "datetime-local" : f.type === "number" ? "number" : "text"}
                step={f.type === "number" ? "any" : undefined}
                value={values[f.name] ?? ""}
                onChange={(e) => setValues({ ...values, [f.name]: e.target.value })}
              />
              {f.hint && <div className="mt-1 text-xs text-slate-500">{f.hint}</div>}
            </div>
          ))}
          <div className="flex gap-3">
            <Button type="button" variant="secondary" className="flex-1" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" variant={variant === "danger" ? "danger" : "primary"} className="flex-1" loading={pending}>Confirm</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

export function AdminSearch({ placeholder, param = "q" }: { placeholder: string; param?: string }) {
  const router = useRouter();
  const path = usePathname();
  const [q, setQ] = useState("");
  return (
    <form onSubmit={(e) => { e.preventDefault(); router.push(`${path}?${param}=${encodeURIComponent(q)}`); }} className="max-w-sm flex-1">
      <input className="input" placeholder={placeholder} value={q} onChange={(e) => setQ(e.target.value)} />
    </form>
  );
}
