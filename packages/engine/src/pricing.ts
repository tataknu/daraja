// What a model costs per 1M tokens, so logged token counts (ai_calls) can be turned into dollars.
//
// Source: OpenAI API pricing, Standard tier, https://developers.openai.com/api/docs/pricing
// (platform.openai.com/docs/pricing redirects there), checked 2026-10-03. These are OpenAI's list
// prices for direct API use; a gateway in between (e.g. Lovable's) may bill differently.
//
// Reasoning tokens are "billed as output tokens" (https://developers.openai.com/api/docs/guides/reasoning).
// The Responses API already counts them in usage.output_tokens (output_tokens_details.reasoning_tokens
// is a breakdown), just as input_tokens_details.cached_tokens is part of input_tokens. So a call costs
//   (input − cached) × input price + cached × cached-input price + output × output price
// and reasoning tokens are never added on top.
//
// Only prices read from the source are listed. A model that isn't here has no cost (null), never a guess.

export interface ModelPrice {
  /** USD per 1M input tokens that were not served from the prompt cache. */
  input: number;
  /** USD per 1M cached input tokens. */
  cachedInput: number;
  /** USD per 1M output tokens, reasoning tokens included. */
  output: number;
}

/** Prices by model id, as logged in ai_calls.model. */
export type Pricing = Readonly<Record<string, ModelPrice>>;

export const PRICING_SOURCE = {
  url: "https://developers.openai.com/api/docs/pricing",
  checked: "2026-10-03",
  tier: "Standard",
} as const;

export const PRICES: Pricing = {
  // Short-context price (prompts under 272K tokens); ours are a few hundred tokens.
  "gpt-5.4": { input: 2.5, cachedInput: 0.25, output: 15 },
  // The configured model (AI_MODEL).
  "gpt-5.4-mini": { input: 0.75, cachedInput: 0.075, output: 4.5 },
  "gpt-5.4-nano": { input: 0.2, cachedInput: 0.02, output: 1.25 },
};

/**
 * The price of a model id as logged: exact, else without the gateway's "openai/" prefix, else
 * without a dated snapshot suffix ("gpt-5.4-mini-2026-03-17"). Null when there is none.
 */
export function priceOf(model: string, pricing: Pricing = PRICES): ModelPrice | null {
  const bare = model.replace(/^openai\//, "");
  const undated = bare.replace(/-\d{4}-\d{2}-\d{2}$/, "");
  return pricing[model] ?? pricing[bare] ?? pricing[undated] ?? null;
}

/** USD for one call's tokens at `price`. */
export function callCost(
  usage: { input_tokens: number; cached_tokens: number; output_tokens: number },
  price: ModelPrice,
): number {
  const cached = Math.min(usage.cached_tokens, usage.input_tokens);
  return (
    ((usage.input_tokens - cached) * price.input +
      cached * price.cachedInput +
      usage.output_tokens * price.output) /
    1e6
  );
}
