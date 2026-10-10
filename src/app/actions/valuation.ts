"use server";

import { z } from "zod";
import { run } from "@/lib/action";
import { getCurrentUser } from "@/lib/auth/session";
import { enforceRateLimit } from "@/lib/ratelimit";
import { clientIp } from "@/lib/audit";
import { db } from "@/lib/db";
import { estimateValue } from "@/lib/valuation";
import { aiValuationAnalysis } from "@/lib/ai";
import { ALL_CATEGORIES } from "@/lib/categories";

const schema = z.object({
  category: z.string().refine((c) => ALL_CATEGORIES.some((x) => x.key === c), "Choose a category"),
  monthlyRevenue: z.coerce.number().min(0).max(50_000_000),
  monthlyProfit: z.coerce.number().min(-50_000_000).max(50_000_000),
  ageMonths: z.coerce.number().int().min(0).max(600),
  growth: z.enum(["declining", "flat", "growing", "fast"]),
  monthlyTraffic: z.coerce.number().int().min(0).max(2_000_000_000),
  retention: z.union([z.literal(""), z.null(), z.coerce.number().min(0).max(100)]).transform((v) => (v === "" || v === null ? null : v)),
});

export async function valuationAction(input: z.input<typeof schema>) {
  return run(async () => {
    const user = await getCurrentUser();
    await enforceRateLimit(`valuation:${user?.id ?? (await clientIp())}`, 20, 3600);
    const v = schema.parse(input);
    const result = estimateValue(v);
    const analysis = await aiValuationAnalysis(v, result);
    await db.valuation.create({ data: { userId: user?.id ?? null, input: v, result: { ...result, analysis } } });
    return { ...result, analysis };
  });
}
