// The rows the metrics are computed from, read in the browser through the Supabase client (the
// simulator's read-only policies). Only the columns computeMetrics uses, every page of each table.
import type { MetricsInput } from "@daraja/engine/metrics";
import { supabase } from "@/integrations/supabase/client";

export type MetricsRows = Omit<MetricsInput, "pricing">;

/** PostgREST returns at most this many rows per request. */
const PAGE = 1000;

interface Page<T> {
  data: T[] | null;
  error: { message: string } | null;
}

async function everyRow<T>(page: (from: number, to: number) => PromiseLike<Page<T>>) {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if ((data?.length ?? 0) < PAGE) return rows;
  }
}

export async function loadMetricsRows(): Promise<MetricsRows> {
  const [aiCalls, bookings, messages, decisions, prompts] = await Promise.all([
    everyRow((from, to) =>
      supabase
        .from("ai_calls")
        .select(
          "task, model, source, message_id, booking_id, input_tokens, cached_tokens, output_tokens, reasoning_tokens, latency_ms, ok",
        )
        .order("created_at")
        .order("id")
        .range(from, to),
    ),
    everyRow((from, to) =>
      supabase.from("bookings").select("id, referred_by").order("id").range(from, to),
    ),
    everyRow((from, to) =>
      supabase
        .from("messages")
        .select("id, direction, channel, booking_id")
        .order("created_at")
        .order("id")
        .range(from, to),
    ),
    everyRow((from, to) =>
      supabase
        .from("decisions")
        .select("message_id, model, action_taken")
        .order("created_at")
        .order("id")
        .range(from, to),
    ),
    everyRow((from, to) =>
      supabase
        .from("pending_prompts")
        .select("kind, sent_at, resolved_at, resolution")
        .order("sent_at")
        .order("id")
        .range(from, to),
    ),
  ]);
  return { aiCalls, bookings, messages, decisions, prompts };
}
