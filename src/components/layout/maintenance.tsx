import Link from "next/link";
import { Wrench } from "lucide-react";

export function Maintenance() {
  return (
    <div className="container-x grid min-h-[60vh] place-items-center py-20 text-center">
      <div>
        <Wrench className="mx-auto h-10 w-10 text-electric-400" />
        <h1 className="mt-4 font-display text-3xl font-semibold text-white">We&apos;ll be right back</h1>
        <p className="mt-2 text-slate-400">VENTUREX is undergoing scheduled maintenance. Your funds and transactions are safe — please check back shortly.</p>
        <Link href="/login" className="mt-6 inline-block text-sm text-electric-400 hover:underline">Administrator sign in</Link>
      </div>
    </div>
  );
}
