// Public API of @daraja/engine, wired to Supabase and the AI gateway. Server-only.
//
// Rules the code enforces (see AGENTS.md):
// - AI only classifies and translates (ai/); it never changes state.
// - Booking transitions go through booking-state.ts; only Noor's approval confirms.
// - Every outbound message goes through sendMessage() in context.ts.
// - Webhooks and the simulator share handleInbound().
import { supabaseAdmin } from "@daraja/db/client.server";
import { gatewayAi } from "./ai/gateway.server";
import { createEngine, type Engine } from "./engine";
import { supabaseRepo } from "./repo.supabase.server";
import { SAMPLE_REVIEWS } from "./samples";
import { SAMPLE_ANALYSES } from "./samples/analyses";
import type { InboundInput, ReviewInput } from "./types";

export { createEngine, type Engine } from "./engine";
export type {
  InboundInput,
  InboundResult,
  InsightItem,
  InsightQuote,
  InsightReport,
  ReviewInput,
} from "./types";

let live: Engine | undefined;
const engine = () =>
  (live ??= createEngine({
    repo: supabaseRepo(supabaseAdmin),
    ai: gatewayAi,
    now: () => new Date(),
  }));

export const handleInbound = (input: InboundInput) => engine().handleInbound(input);
export const runTimers = (asOf?: Date) => engine().runTimers(asOf);
export const monthlyInsights = () => engine().monthlyInsights();
export const resetDemo = () => engine().resetDemo();
export const importReviews = (reviews: ReviewInput[], source?: "guest" | "sample") =>
  engine().importReviews(reviews, source);
/** The sample review set, analysed with the stored analyses where present (no tokens spent). */
export const loadSampleReviews = () =>
  engine().importReviews(
    SAMPLE_REVIEWS.map((r) => ({
      text: r.text,
      lang: r.lang,
      analysis: r.analysis ?? SAMPLE_ANALYSES[r.id],
    })),
    "sample",
  );
