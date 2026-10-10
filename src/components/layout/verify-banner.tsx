"use client";

import { useState, useTransition } from "react";
import { MailWarning } from "lucide-react";
import { useT } from "@/i18n/client";
import { resendVerificationAction } from "@/app/actions/auth";
import { useToast } from "../toast";

export function VerifyBanner() {
  const t = useT();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [sent, setSent] = useState(false);
  return (
    <div className="border-b border-amber-500/20 bg-amber-500/10">
      <div className="container-x flex flex-wrap items-center justify-between gap-2 py-2 text-sm text-amber-200">
        <span className="flex items-center gap-2">
          <MailWarning className="h-4 w-4" /> {t("auth.verifyBanner")}
        </span>
        <button
          disabled={pending || sent}
          className="text-xs font-semibold underline-offset-4 hover:underline disabled:opacity-60"
          onClick={() =>
            start(async () => {
              const r = await resendVerificationAction();
              if (r.ok) {
                setSent(true);
                toast.success("Verification email sent");
              } else toast.error(r.error);
            })
          }
        >
          {t("auth.verifyResend")}
        </button>
      </div>
    </div>
  );
}
