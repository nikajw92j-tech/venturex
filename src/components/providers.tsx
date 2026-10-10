"use client";

import { MotionConfig } from "framer-motion";
import { I18nProvider } from "@/i18n/client";
import { ToastProvider } from "./toast";
import type { Locale } from "@/i18n/config";
import type { Dict } from "@/i18n/dictionaries";
import type { CurrencyCode, Rates } from "@/lib/money";

export function Providers(props: {
  children: React.ReactNode;
  locale: Locale;
  dict: Dict;
  currency: CurrencyCode;
  rates: Rates;
  ratesApproximate: boolean;
}) {
  const { children, ...i18n } = props;
  return (
    <I18nProvider {...i18n}>
      {/* Respects the OS "reduce motion" setting for every Framer Motion animation */}
      <MotionConfig reducedMotion="user">
        <ToastProvider>{children}</ToastProvider>
      </MotionConfig>
    </I18nProvider>
  );
}
