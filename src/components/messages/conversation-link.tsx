"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function ConversationLink({ href, children }: { href: string; children: React.ReactNode }) {
  const active = usePathname() === href;
  return (
    <Link href={href} className={cn("flex items-center gap-3 border-b border-white/5 px-4 py-3 transition", active ? "bg-electric/10" : "hover:bg-white/[0.03]")}>
      {children}
    </Link>
  );
}
