// The engine as a value: give it storage, an AI and a clock, get back the things the app does.
// Tests build it with an in-memory repo and a scripted AI; index.server.ts builds the live one.
// Each call gets its own context, so the AI usage it causes is logged against the right message.
import { createContext } from "./context";
import { importReviews } from "./feedback";
import { handleInbound } from "./inbound";
import { monthlyInsights } from "./insights";
import { runTimers } from "./timers";
import type { EngineDeps, InboundInput, ReviewInput } from "./types";

export function createEngine(deps: EngineDeps) {
  return {
    /** Every inbound email or SMS, from a webhook or the simulator. */
    async handleInbound(input: InboundInput) {
      const ctx = createContext(deps);
      try {
        const result = await handleInbound(ctx, input);
        if ("booking_id" in result && result.booking_id) ctx.trace.booking_id = result.booking_id;
        return result;
      } finally {
        await ctx.flushUsage("inbound");
      }
    },
    /** Reminders, expiries and feedback requests that are due at `asOf`. */
    runTimers: (asOf: Date = deps.now()) => runTimers(createContext(deps), asOf),
    /** Reviews in, the brief's three questions answered, and Noor's SMS sent. */
    async monthlyInsights() {
      const ctx = createContext(deps);
      try {
        return await monthlyInsights(ctx);
      } finally {
        await ctx.flushUsage("insights");
      }
    },
    /** Reviews from outside email (sample sets, other platforms), analysed and stored. */
    async importReviews(reviews: ReviewInput[], source: "guest" | "sample" = "sample") {
      const ctx = createContext(deps);
      try {
        return await importReviews(ctx, reviews, source);
      } finally {
        await ctx.flushUsage("import");
      }
    },
    resetDemo: () => deps.repo.resetDemo(),
  };
}

export type Engine = ReturnType<typeof createEngine>;
