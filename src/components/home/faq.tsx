"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Plus } from "lucide-react";
import { useState } from "react";

export function Faq({ items }: { items: { q: string; a: string }[] }) {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className="divide-y divide-white/5 overflow-hidden rounded-2xl glass">
      {items.map((it, i) => (
        <div key={i}>
          <button className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left sm:px-6" onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i}>
            <span className="font-medium text-white">{it.q}</span>
            <motion.span animate={{ rotate: open === i ? 45 : 0 }} className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white/5">
              <Plus className="h-4 w-4 text-slate-300" />
            </motion.span>
          </button>
          <AnimatePresence initial={false}>
            {open === i && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}>
                <p className="px-5 pb-5 text-sm leading-relaxed text-slate-400 sm:px-6">{it.a}</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      ))}
    </div>
  );
}
