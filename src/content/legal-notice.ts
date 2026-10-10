import type { Locale } from "@/i18n/config";

/** Shown on legal pages in non-English locales: the English text is authoritative. */
export const LEGAL_NOTICE: Record<Locale, string | undefined> = {
  en: undefined,
  ka: "ეს დოკუმენტი წარმოდგენილია ინგლისურ ენაზე. იურიდიული ძალა აქვს ინგლისურ ვერსიას.",
  ru: "Этот документ представлен на английском языке. Юридическую силу имеет английская версия.",
};
