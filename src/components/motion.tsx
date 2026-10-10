"use client";

import { animate, motion, useInView, useMotionValue, useTransform } from "framer-motion";
import { useEffect, useRef } from "react";

export function Reveal({ children, delay = 0, className, y = 28 }: { children: React.ReactNode; delay?: number; className?: string; y?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function Stagger({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-60px" }}
      variants={{ hidden: {}, show: { transition: { staggerChildren: 0.08 } } }}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div
      className={className}
      variants={{ hidden: { opacity: 0, y: 24 }, show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] } } }}
    >
      {children}
    </motion.div>
  );
}

/** Counts up from 0 when scrolled into view. `format` renders the final string. */
export function CountUp({ value, format, className }: { value: number; format?: "number" | "usd"; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const mv = useMotionValue(0);
  const text = useTransform(mv, (v) => {
    if (format === "usd") {
      return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: v >= 100000 ? "compact" : "standard", maximumFractionDigits: v >= 100000 ? 1 : 0 }).format(v);
    }
    return new Intl.NumberFormat("en-US").format(Math.round(v));
  });
  useEffect(() => {
    if (!inView) return;
    const c = animate(mv, value, { duration: 2, ease: [0.16, 1, 0.3, 1] });
    return () => c.stop();
  }, [inView, value, mv]);
  return <motion.span ref={ref} className={className}>{text}</motion.span>;
}
