"use client";

import { useState } from "react";
import { Area, AreaChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Table2, LineChart as LineIcon } from "lucide-react";
import { formatMoney, type CurrencyCode } from "@/lib/money";

// Validated (dataviz validator, dark surface #0a0f1f): adjacent CVD ΔE ≥ 8, contrast ≥ 3:1.
export const SERIES = { primary: "#3b82f6", secondary: "#c27a1c" };
const AXIS = "#64748b";
const GRID = "rgba(148,163,184,0.10)";

type Point = Record<string, number | string>;

function ChartTooltip({ active, payload, label, fmt }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string; fmt: (n: number) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass-strong rounded-lg px-3 py-2 text-xs shadow-xl">
      <div className="mb-1 font-semibold text-slate-200">{label}</div>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2 text-slate-300">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          <span className="text-slate-400">{p.name}</span>
          <span className="ml-auto font-semibold tabular-nums text-white">{fmt(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

function Frame({ title, legend, children, table }: { title: string; legend?: { label: string; color: string }[]; children: React.ReactNode; table: React.ReactNode }) {
  const [showTable, setShowTable] = useState(false);
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display font-semibold text-white">{title}</h3>
        <div className="flex items-center gap-3">
          {legend && legend.length > 1 && (
            <div className="flex items-center gap-3 text-xs text-slate-400">
              {legend.map((l) => (
                <span key={l.label} className="flex items-center gap-1.5">
                  <span className="h-0.5 w-4 rounded" style={{ background: l.color }} /> {l.label}
                </span>
              ))}
            </div>
          )}
          <button onClick={() => setShowTable((s) => !s)} className="grid h-7 w-7 place-items-center rounded-md text-slate-400 hover:bg-white/5 hover:text-white" aria-label={showTable ? "Show chart" : "Show data table"}>
            {showTable ? <LineIcon className="h-4 w-4" /> : <Table2 className="h-4 w-4" />}
          </button>
        </div>
      </div>
      {showTable ? <div className="max-h-64 overflow-auto rounded-lg ring-1 ring-white/5">{table}</div> : <div className="h-64">{children}</div>}
    </div>
  );
}

export function RevenueChart({ data, currency, labels }: { data: { month: string; revenue: number; profit: number }[]; currency: CurrencyCode; labels: { title: string; revenue: string; profit: string } }) {
  const fmt = (n: number) => formatMoney(n, currency, { compact: true });
  return (
    <Frame
      title={labels.title}
      legend={[{ label: labels.revenue, color: SERIES.primary }, { label: labels.profit, color: SERIES.secondary }]}
      table={
        <table className="w-full text-left text-xs">
          <thead className="bg-white/5 text-slate-400"><tr><th className="px-3 py-2">Month</th><th className="px-3 py-2 text-right">{labels.revenue}</th><th className="px-3 py-2 text-right">{labels.profit}</th></tr></thead>
          <tbody>{data.map((d) => <tr key={d.month} className="border-t border-white/5 text-slate-300"><td className="px-3 py-1.5">{d.month}</td><td className="px-3 py-1.5 text-right tabular-nums">{fmt(d.revenue)}</td><td className="px-3 py-1.5 text-right tabular-nums">{fmt(d.profit)}</td></tr>)}</tbody>
        </table>
      }
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data as Point[]} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="month" tick={{ fill: AXIS, fontSize: 11 }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fill: AXIS, fontSize: 11 }} tickLine={false} axisLine={false} width={64} tickFormatter={fmt} />
          <Tooltip content={<ChartTooltip fmt={fmt} />} cursor={{ stroke: "rgba(148,163,184,0.35)", strokeWidth: 1 }} />
          <Line type="monotone" dataKey="revenue" name={labels.revenue} stroke={SERIES.primary} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "#0a0f1f" }} />
          <Line type="monotone" dataKey="profit" name={labels.profit} stroke={SERIES.secondary} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "#0a0f1f" }} />
        </LineChart>
      </ResponsiveContainer>
    </Frame>
  );
}

export function TrafficChart({ data, title, label }: { data: { month: string; visitors: number }[]; title: string; label: string }) {
  const fmt = (n: number) => new Intl.NumberFormat("en", { notation: "compact" }).format(n);
  return (
    <Frame
      title={title}
      table={
        <table className="w-full text-left text-xs">
          <thead className="bg-white/5 text-slate-400"><tr><th className="px-3 py-2">Month</th><th className="px-3 py-2 text-right">{label}</th></tr></thead>
          <tbody>{data.map((d) => <tr key={d.month} className="border-t border-white/5 text-slate-300"><td className="px-3 py-1.5">{d.month}</td><td className="px-3 py-1.5 text-right tabular-nums">{d.visitors.toLocaleString()}</td></tr>)}</tbody>
        </table>
      }
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data as Point[]} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="trafficFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={SERIES.primary} stopOpacity={0.35} />
              <stop offset="100%" stopColor={SERIES.primary} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="month" tick={{ fill: AXIS, fontSize: 11 }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fill: AXIS, fontSize: 11 }} tickLine={false} axisLine={false} width={48} tickFormatter={fmt} />
          <Tooltip content={<ChartTooltip fmt={(n) => n.toLocaleString()} />} cursor={{ stroke: "rgba(148,163,184,0.35)", strokeWidth: 1 }} />
          <Area type="monotone" dataKey="visitors" name={label} stroke={SERIES.primary} strokeWidth={2} fill="url(#trafficFill)" activeDot={{ r: 4, strokeWidth: 2, stroke: "#0a0f1f" }} />
        </AreaChart>
      </ResponsiveContainer>
    </Frame>
  );
}

/** Generic single-series bar/area for dashboards (money or counts). */
export function MiniArea({ data, xKey, yKey, name, format }: { data: Point[]; xKey: string; yKey: string; name: string; format?: "money-usd" | "count" }) {
  const fmt = (n: number) => (format === "money-usd" ? formatMoney(n, "USD", { compact: true }) : new Intl.NumberFormat("en", { notation: "compact" }).format(n));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={`fill-${yKey}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={SERIES.primary} stopOpacity={0.3} />
            <stop offset="100%" stopColor={SERIES.primary} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey={xKey} tick={{ fill: AXIS, fontSize: 11 }} tickLine={false} axisLine={false} />
        <YAxis tick={{ fill: AXIS, fontSize: 11 }} tickLine={false} axisLine={false} width={56} tickFormatter={fmt} />
        <Tooltip content={<ChartTooltip fmt={fmt} />} cursor={{ stroke: "rgba(148,163,184,0.35)", strokeWidth: 1 }} />
        <Area type="monotone" dataKey={yKey} name={name} stroke={SERIES.primary} strokeWidth={2} fill={`url(#fill-${yKey})`} activeDot={{ r: 4, strokeWidth: 2, stroke: "#0a0f1f" }} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
