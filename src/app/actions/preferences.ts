"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { CURRENCY_COOKIE, isLocale, LOCALE_COOKIE } from "@/i18n/config";
import { CURRENCIES, type CurrencyCode } from "@/lib/money";
import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";

const YEAR = 365 * 86400;

export async function setLocaleAction(locale: string) {
  if (!isLocale(locale)) return;
  (await cookies()).set(LOCALE_COOKIE, locale, { path: "/", maxAge: YEAR, sameSite: "lax" });
  const user = await getCurrentUser();
  if (user) await db.user.update({ where: { id: user.id }, data: { preferredLocale: locale } });
  revalidatePath("/", "layout");
}

export async function setCurrencyAction(currency: string) {
  if (!(CURRENCIES as readonly string[]).includes(currency)) return;
  (await cookies()).set(CURRENCY_COOKIE, currency, { path: "/", maxAge: YEAR, sameSite: "lax" });
  const user = await getCurrentUser();
  if (user) await db.user.update({ where: { id: user.id }, data: { preferredCurrency: currency as CurrencyCode } });
  revalidatePath("/", "layout");
}
