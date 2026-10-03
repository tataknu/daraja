// The engine as a value: give it storage, an AI and a clock, get back the four things the app does.
// Tests build it with an in-memory repo and a scripted AI; index.server.ts builds the live one.
import { createContext } from "./context";
import { handleInbound } from "./inbound";
import { monthlyInsights } from "./insights";
import { runTimers } from "./timers";
import type { EngineDeps, InboundInput } from "./types";

export function createEngine(deps: EngineDeps) {
  const ctx = createContext(deps);
  return {
    /** Every inbound email or SMS, from a webhook or the simulator. */
    handleInbound: (input: InboundInput) => handleInbound(ctx, input),
    /** Reminders, expiries and feedback requests that are due at `asOf`. */
    runTimers: (asOf: Date = deps.now()) => runTimers(ctx, asOf),
    monthlyInsights: () => monthlyInsights(ctx),
    resetDemo: () => deps.repo.resetDemo(),
  };
}

export type Engine = ReturnType<typeof createEngine>;
