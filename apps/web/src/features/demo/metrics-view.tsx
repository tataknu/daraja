// What the system costs and how it behaves: AI calls, tokens, latency and cost per booking,
// hand-offs to the host, time to her answer, referrals. The rows are read in the browser and the
// numbers come from the engine's computeMetrics, the same definitions the tests check.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { computeMetrics, PRICES } from "@daraja/engine/metrics";
import { Button } from "@daraja/ui/components/button";
import { supabase } from "@/integrations/supabase/client";
import { loadMetricsRows, type MetricsRows } from "./metrics/load";
import {
  BehaviourKpis,
  CostKpis,
  EmptyState,
  HowMeasured,
  TaskTable,
  TokenBars,
} from "./metrics/sections";

/**
 * Tables whose changes move a metric without an AI call: keypad replies, timers. Only tables in the
 * supabase_realtime publication: one that isn't fails the whole channel. pending_prompts isn't, but
 * a prompt is resolved together with a decision (Noor's reply) or a booking update (expiry).
 */
const ALSO_WATCHED = ["bookings", "messages", "decisions"] as const;

export function MetricsView() {
  const [rows, setRows] = useState<MetricsRows | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const latest = useRef(0);

  const load = useCallback(async () => {
    const run = ++latest.current;
    setLoading(true);
    try {
      const next = await loadMetricsRows();
      if (run !== latest.current) return;
      setRows(next);
      setError(null);
      setUpdatedAt(new Date());
    } catch (e) {
      if (run === latest.current) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (run === latest.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    let t: ReturnType<typeof setTimeout> | undefined;
    const debounced = () => {
      clearTimeout(t);
      t = setTimeout(load, 400);
    };
    // A unit of work writes its AI calls last, so an ai_calls insert means its rows are all in.
    const ch = supabase
      .channel("metrics")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "ai_calls" }, debounced);
    for (const table of ALSO_WATCHED) {
      ch.on("postgres_changes", { event: "*", schema: "public", table }, debounced);
    }
    ch.subscribe();
    return () => {
      clearTimeout(t);
      supabase.removeChannel(ch);
    };
  }, [load]);

  const metrics = useMemo(() => rows && computeMetrics({ ...rows, pricing: PRICES }), [rows]);

  return (
    <div className="mx-auto min-h-0 w-full max-w-7xl flex-1 space-y-8 overflow-y-auto px-6 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted-foreground">
          What each booking costs in AI, and how the system behaves. Computed from the stored rows;
          updates live.
        </p>
        <div className="flex items-center gap-3">
          {updatedAt && (
            <span className="text-xs tabular-nums text-muted-foreground">
              Updated {updatedAt.toLocaleTimeString()}
            </span>
          )}
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            {loading ? "Loading…" : "Refresh"}
          </Button>
        </div>
      </div>

      {error && (
        <div className="paper px-5 py-4 text-sm">
          <p className="font-medium text-destructive">Couldn't load the metrics</p>
          <p className="mt-1 text-muted-foreground">{error}</p>
        </div>
      )}
      {!metrics ? (
        !error && <p className="text-sm text-muted-foreground">Loading metrics…</p>
      ) : metrics.totals.calls === 0 ? (
        <EmptyState />
      ) : (
        <>
          <CostKpis m={metrics} />
          <BehaviourKpis m={metrics} />
          <div className="grid gap-6 lg:grid-cols-5 lg:items-start">
            <TaskTable m={metrics} />
            <TokenBars m={metrics} />
          </div>
          <HowMeasured m={metrics} />
        </>
      )}
    </div>
  );
}
