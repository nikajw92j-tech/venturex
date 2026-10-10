import "server-only";
import { cache } from "react";
import { db } from "./db";
import { env } from "./env";
import { FALLBACK_RATES, type CurrencyCode, type Rates } from "./money";

const STALE_MS = 6 * 60 * 60 * 1000;

export type RateInfo = { rates: Rates; fetchedAt: Date | null; approximate: boolean };

async function refresh(): Promise<boolean> {
  try {
    const res = await fetch(env.exchangeRateUrl, { cache: "no-store", signal: AbortSignal.timeout(5000) });
    if (!res.ok) return false;
    const json = (await res.json()) as { rates?: Record<string, number> };
    const r = json.rates;
    if (!r) return false;
    const now = new Date();
    const codes: CurrencyCode[] = ["GEL", "EUR", "RUB"];
    for (const c of codes) {
      const v = Number(r[c]);
      if (!Number.isFinite(v) || v <= 0) return false;
    }
    await db.$transaction([
      ...codes.map((c) =>
        db.exchangeRate.upsert({
          where: { currency: c },
          create: { currency: c, perUsd: Number(r[c]), source: env.exchangeRateUrl, fetchedAt: now },
          update: { perUsd: Number(r[c]), source: env.exchangeRateUrl, fetchedAt: now },
        }),
      ),
      db.exchangeRate.upsert({
        where: { currency: "USD" },
        create: { currency: "USD", perUsd: 1, source: "fixed", fetchedAt: now },
        update: { fetchedAt: now },
      }),
    ]);
    return true;
  } catch (e) {
    console.error("[rates] refresh failed", e);
    return false;
  }
}

/** Display-only exchange rates. Contract amounts are never converted with these. */
export const getRates = cache(async (): Promise<RateInfo> => {
  let rows = await db.exchangeRate.findMany();
  const oldest = rows.reduce<Date | null>((acc, r) => (!acc || r.fetchedAt < acc ? r.fetchedAt : acc), null);
  if (!rows.length || !oldest || Date.now() - oldest.getTime() > STALE_MS) {
    if (await refresh()) rows = await db.exchangeRate.findMany();
  }
  if (rows.length < 4) return { rates: FALLBACK_RATES, fetchedAt: null, approximate: true };
  const rates = { ...FALLBACK_RATES };
  for (const r of rows) rates[r.currency] = r.perUsd;
  return { rates, fetchedAt: oldest, approximate: false };
});

export async function refreshRates() {
  return refresh();
}
