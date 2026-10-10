import { Reveal } from "./motion";

export function ContentPage({ title, subtitle, updated, notice, children }: { title: string; subtitle?: string; updated?: string; notice?: string; children: React.ReactNode }) {
  return (
    <div className="container-x max-w-3xl py-16">
      <Reveal>
        <h1 className="font-display text-4xl font-semibold text-white sm:text-5xl">{title}</h1>
        {subtitle && <p className="mt-4 text-lg text-slate-400">{subtitle}</p>}
        {updated && <p className="mt-2 text-sm text-slate-500">Last updated: {updated}</p>}
        {notice && <p className="mt-4 rounded-xl bg-amber-500/10 px-4 py-3 text-sm text-amber-200 ring-1 ring-amber-500/20">{notice}</p>}
      </Reveal>
      <Reveal delay={0.1}>
        <div className="prose-vx mt-10">{children}</div>
      </Reveal>
    </div>
  );
}
