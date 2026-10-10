"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="container-x grid min-h-[60vh] place-items-center py-20 text-center">
      <div>
        <h1 className="font-display text-3xl font-semibold text-white">Something went wrong</h1>
        <p className="mt-2 text-slate-400">The error has been logged. Please try again.</p>
        {error.digest && <p className="mt-1 font-mono text-xs text-slate-600">Ref: {error.digest}</p>}
        <Button className="mt-6" onClick={reset}>Try again</Button>
      </div>
    </div>
  );
}
