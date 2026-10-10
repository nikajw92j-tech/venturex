import { en } from "./en";
import { ka } from "./ka";
import { ru } from "./ru";
import type { Locale } from "../config";

export type TKey = keyof typeof en;
export type Dict = Record<TKey, string>;

// Georgian and Russian fall back to English for any key not yet translated.
export const dictionaries: Record<Locale, Dict> = {
  en,
  ka: { ...en, ...ka },
  ru: { ...en, ...ru },
};

export function translate(dict: Dict, key: TKey, params?: Record<string, string | number>) {
  const s = dict[key] ?? key;
  return params ? s.replace(/\{(\w+)\}/g, (_, k) => String(params[k] ?? `{${k}}`)) : s;
}
