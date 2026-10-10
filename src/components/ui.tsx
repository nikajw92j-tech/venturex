import Link from "next/link";
import { forwardRef } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "gold" | "outline";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary:
    "bg-brand text-white shadow-[0_8px_30px_-8px_rgba(99,102,241,0.7)] hover:shadow-[0_10px_40px_-6px_rgba(99,102,241,0.9)] hover:brightness-110",
  secondary: "glass text-slate-100 hover:bg-white/[0.07] hover:border-white/20",
  outline: "border border-white/15 text-slate-100 hover:border-electric-400/60 hover:bg-electric/10",
  ghost: "text-slate-300 hover:text-white hover:bg-white/5",
  danger: "bg-red-500/15 text-red-300 border border-red-500/30 hover:bg-red-500/25",
  gold: "bg-gradient-to-r from-amber-300 via-yellow-200 to-amber-400 text-ink-950 hover:brightness-105 shadow-[0_8px_30px_-8px_rgba(245,196,81,0.7)]",
};
const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-xs rounded-lg gap-1.5",
  md: "h-10 px-4 text-sm rounded-xl gap-2",
  lg: "h-12 px-6 text-base rounded-xl gap-2.5",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md", className?: string) {
  return cn(
    "relative inline-flex select-none items-center justify-center font-semibold transition-all duration-200 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-electric/30",
    variants[variant],
    sizes[size],
    className,
  );
}

export const Button = forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; loading?: boolean }
>(function Button({ variant = "primary", size = "md", loading, className, children, disabled, ...props }, ref) {
  return (
    <button ref={ref} className={buttonClass(variant, size, className)} disabled={disabled || loading} {...props}>
      {loading && <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />}
      {children}
    </button>
  );
});

export function LinkButton({
  href,
  variant = "primary",
  size = "md",
  className,
  children,
  ...rest
}: { href: string; variant?: Variant; size?: Size; className?: string; children: React.ReactNode } & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href">) {
  return (
    <Link href={href} className={buttonClass(variant, size, className)} {...rest}>
      {children}
    </Link>
  );
}

export function Card({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("glass card-shadow rounded-2xl", className)} {...props}>
      {children}
    </div>
  );
}

const badgeTones = {
  neutral: "bg-white/5 text-slate-300 border-white/10",
  blue: "bg-electric/10 text-electric-400 border-electric/30",
  violet: "bg-violet/10 text-violet-400 border-violet/30",
  green: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30",
  red: "bg-red-500/10 text-red-300 border-red-500/30",
  amber: "bg-amber-500/10 text-amber-300 border-amber-500/30",
  gold: "bg-gradient-to-r from-amber-300/20 to-yellow-200/10 text-amber-200 border-amber-300/40",
  cyan: "bg-cyan/10 text-cyan border-cyan/30",
} as const;

export function Badge({
  tone = "neutral",
  className,
  children,
}: {
  tone?: keyof typeof badgeTones;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold tracking-wide whitespace-nowrap", badgeTones[tone], className)}>
      {children}
    </span>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  subtitle,
  action,
  className,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="max-w-2xl">
        {eyebrow && <div className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-electric-400">{eyebrow}</div>}
        <h2 className="font-display text-2xl font-semibold tracking-tight text-white sm:text-3xl">{title}</h2>
        {subtitle && <p className="mt-2 text-slate-400">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Stat({ label, value, hint, className }: { label: string; value: React.ReactNode; hint?: React.ReactNode; className?: string }) {
  return (
    <Card className={cn("p-5", className)}>
      <div className="text-xs font-medium uppercase tracking-wider text-slate-400">{label}</div>
      <div className="mt-2 font-display text-2xl font-semibold text-white">{value}</div>
      {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
    </Card>
  );
}

export function EmptyState({ title, body, action }: { title: string; body?: string; action?: React.ReactNode }) {
  return (
    <div className="glass flex flex-col items-center justify-center rounded-2xl px-6 py-14 text-center">
      <div className="mb-4 h-12 w-12 rounded-2xl bg-brand opacity-80 blur-[1px]" aria-hidden />
      <div className="font-display text-lg font-semibold text-white">{title}</div>
      {body && <p className="mt-2 max-w-md text-sm text-slate-400">{body}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function Field({ label, hint, error, children, className }: { label?: string; hint?: string; error?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      {label && <label className="label">{label}</label>}
      {children}
      {hint && !error && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
      {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
    </div>
  );
}

export function Alert({ tone = "blue", children, className }: { tone?: "blue" | "amber" | "red" | "green"; children: React.ReactNode; className?: string }) {
  const tones = {
    blue: "border-electric/30 bg-electric/10 text-blue-200",
    amber: "border-amber-500/30 bg-amber-500/10 text-amber-200",
    red: "border-red-500/30 bg-red-500/10 text-red-200",
    green: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
  };
  return <div className={cn("rounded-xl border px-4 py-3 text-sm", tones[tone], className)}>{children}</div>;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton rounded-xl", className)} aria-hidden />;
}
