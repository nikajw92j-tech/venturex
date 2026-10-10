import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { env } from "./env";
import type { ValuationInput, ValuationResult } from "./valuation";

let client: Anthropic | null = null;
function anthropic() {
  if (!env.anthropic.apiKey) return null;
  client ??= new Anthropic({ apiKey: env.anthropic.apiKey, timeout: 60_000, maxRetries: 1 });
  return client;
}

export function aiEnabled() {
  return Boolean(env.anthropic.apiKey);
}

const SYSTEM = `You are a valuation analyst at VENTUREX, a marketplace for buying and selling small online businesses.
You receive a business's self-reported metrics and an estimate already produced by a transparent multiple-based model.
Write a short analysis (120-200 words, plain text, no markdown headings, no bullet lists longer than 4 items) that:
- explains what drives the estimated range for this kind of business,
- names the 2-3 factors that would most move the price up or down during buyer due diligence,
- suggests concrete evidence the seller should prepare (e.g. payment-processor exports, analytics access).
Do not invent a different price range and do not promise any sale price. The figures are unverified and seller-reported.`;

/**
 * Optional AI commentary on top of the deterministic estimate. Returns null when
 * AI is not configured or the request fails — the valuation still works without it.
 */
export async function aiValuationAnalysis(input: ValuationInput, result: ValuationResult): Promise<string | null> {
  const c = anthropic();
  if (!c) return null;
  try {
    const response = await c.beta.messages.create({
      model: env.anthropic.model,
      max_tokens: 2000,
      output_config: { effort: "low" },
      // Re-run on a fallback model if the primary declines (routes by refusal category).
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: `Business metrics (USD, seller-reported):\n${JSON.stringify(input, null, 2)}\n\nModel estimate:\n${JSON.stringify({ low: result.low, high: result.high, method: result.method, multiple: result.multiple, assumptions: result.assumptions }, null, 2)}`,
        },
      ],
    });
    if (response.stop_reason === "refusal") return null;
    const text = response.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    return text || null;
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) console.warn("[ai] rate limited");
    else if (e instanceof Anthropic.APIError) console.error(`[ai] API error ${e.status}:`, e.message);
    else console.error("[ai] valuation analysis failed", e);
    return null;
  }
}
