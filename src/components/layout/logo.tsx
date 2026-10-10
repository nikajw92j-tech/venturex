import Link from "next/link";

export function Logo({ className = "" }: { className?: string }) {
  return (
    <Link href="/" className={`group inline-flex items-center gap-2.5 ${className}`} aria-label="VENTUREX home">
      <span className="relative grid h-8 w-8 place-items-center overflow-hidden rounded-lg bg-brand shadow-[0_0_24px_-4px_rgba(99,102,241,0.8)]">
        <svg viewBox="0 0 24 24" className="h-4.5 w-4.5 text-white transition-transform duration-500 group-hover:rotate-90" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden>
          <path d="M5 5l14 14M19 5L5 19" />
        </svg>
      </span>
      <span className="font-display text-[15px] font-bold tracking-[0.22em] text-white">
        VENTURE<span className="text-gradient">X</span>
      </span>
    </Link>
  );
}
