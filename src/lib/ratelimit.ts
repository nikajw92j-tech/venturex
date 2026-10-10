import "server-only";
import { UserError } from "./errors";
import { db } from "./db";

/**
 * Fixed-window rate limiter backed by Postgres so it works across multiple
 * app instances. Returns true when the action is allowed.
 */
export async function rateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
  const now = new Date();
  const windowStart = new Date(Math.floor(now.getTime() / (windowSeconds * 1000)) * windowSeconds * 1000);
  const rows = await db.$queryRaw<{ count: number }[]>`
    INSERT INTO "RateLimit" ("key", "count", "windowStart")
    VALUES (${key}, 1, ${windowStart})
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "RateLimit"."windowStart" = ${windowStart} THEN "RateLimit"."count" + 1 ELSE 1 END,
      "windowStart" = ${windowStart}
    RETURNING "count"`;
  return (rows[0]?.count ?? 0) <= limit;
}

export class RateLimitError extends UserError {
  constructor() {
    super("Too many requests. Please slow down and try again shortly.");
  }
}

export async function enforceRateLimit(key: string, limit: number, windowSeconds: number) {
  if (!(await rateLimit(key, limit, windowSeconds))) throw new RateLimitError();
}
