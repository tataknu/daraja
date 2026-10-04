import { useCallback, useEffect, useRef, useState } from "react";
import type { InsightReport } from "@daraja/engine";
import { supabase } from "@/integrations/supabase/client";
import { countSince, parseReport, summariseFeedback, type Corpus } from "./report";

/** The newest row of insight_reports. */
export interface LatestReport {
  id: string;
  createdAt: string;
  report: InsightReport;
  /** The SMS lines as stored with the report; a fallback if the report itself has none. */
  smsLines: string[];
}

export interface InsightsData {
  corpus: Corpus;
  latest: LatestReport | null;
  /** Reviews that arrived after the latest report was written, so it doesn't cover them. */
  newReviews: number;
}

export type InsightsState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: InsightsData };

/**
 * The latest report and the feedback counts, read-only from the browser and refreshed whenever
 * either table changes. `reload` resolves once fresh data is in, for callers that just acted.
 */
export function useInsights() {
  const [state, setState] = useState<InsightsState>({ status: "loading" });
  // A newer load supersedes an older one still in flight, and nothing loads once the view is gone
  // (an action can finish after the visitor has switched tabs).
  const latestLoad = useRef(0);
  const mounted = useRef(false);

  const load = useCallback(async () => {
    if (!mounted.current) return;
    const mine = ++latestLoad.current;
    try {
      const [reports, feedback] = await Promise.all([
        supabase
          .from("insight_reports")
          .select("id, created_at, review_count, report, sms_lines")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        // A farm's reviews are few; the first thousand rows are all of them.
        supabase.from("feedback").select("lang, source, created_at").limit(1000),
      ]);
      if (mine !== latestLoad.current) return;
      const failure = reports.error ?? feedback.error;
      if (failure) throw new Error(failure.message);

      const row = reports.data;
      const report = row ? parseReport(row.report, row.review_count) : null;
      const latest: LatestReport | null =
        row && report
          ? { id: row.id, createdAt: row.created_at, report, smsLines: row.sms_lines }
          : null;
      const reviews = feedback.data ?? [];
      setState({
        status: "ready",
        data: {
          corpus: summariseFeedback(reviews),
          latest,
          newReviews: row ? countSince(reviews, row.created_at) : 0,
        },
      });
    } catch (e) {
      if (mine !== latestLoad.current) return;
      // Once something is on screen, a failed refresh keeps it rather than replacing it with an error.
      setState((s) =>
        s.status === "ready"
          ? s
          : { status: "error", message: e instanceof Error ? e.message : String(e) },
      );
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void load();
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Loading a sample set inserts dozens of rows; refresh once after the burst.
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void load(), 300);
    };
    const channel = supabase
      .channel("insights-view")
      .on("postgres_changes", { event: "*", schema: "public", table: "insight_reports" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "feedback" }, refresh)
      .subscribe();
    return () => {
      mounted.current = false;
      clearTimeout(timer);
      latestLoad.current += 1;
      void supabase.removeChannel(channel);
    };
  }, [load]);

  const retry = useCallback(() => {
    setState({ status: "loading" });
    return load();
  }, [load]);

  return { state, reload: load, retry };
}
