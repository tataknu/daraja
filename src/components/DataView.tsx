import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

const TABLES = [
  { name: "contacts", order: "created_at", desc: "Guests and the host" },
  { name: "farm_settings", order: "id", desc: "Farm configuration (one row)" },
  { name: "bookings", order: "id", desc: "Visits and their status" },
  { name: "messages", order: "created_at", desc: "Every email and SMS, both directions" },
  { name: "pending_prompts", order: "sent_at", desc: "Questions waiting for Noor's reply" },
  { name: "decisions", order: "created_at", desc: "What the assistant decided and why" },
  { name: "feedback", order: "created_at", desc: "Guest feedback, translated and themed" },
  { name: "reminders_sent", order: null, desc: "Which reminders have already gone out" },
] as const;

type Row = Record<string, unknown>;

function cell(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "object") return JSON.stringify(v);
  const s = String(v);
  return s.length > 80 ? s.slice(0, 77) + "…" : s;
}

export function DataView() {
  const [data, setData] = useState<Record<string, Row[]>>({});
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const entries = await Promise.all(
      TABLES.map(async (t) => {
        let q = supabase.from(t.name).select("*").limit(200);
        q = t.order ? q.order(t.order, { ascending: false }) : q;

        const { data: rows } = await q;
        return [t.name, rows ?? []] as const;
      }),
    );
    setData(Object.fromEntries(entries));
    setLoading(false);
  };

  useEffect(() => {
    load();
    let t: ReturnType<typeof setTimeout> | undefined;
    const debounced = () => {
      clearTimeout(t);
      t = setTimeout(load, 300);
    };
    const ch = supabase.channel("data");
    for (const { name } of TABLES) {
      ch.on("postgres_changes", { event: "*", schema: "public", table: name }, debounced);
    }
    ch.subscribe();
    return () => {
      clearTimeout(t);
      supabase.removeChannel(ch);
    };
  }, []);

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-6 py-8">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Everything the system stores — guests, bookings, messages, decisions and more. Updates live.
        </p>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          {loading ? "Loading…" : "Refresh"}
        </Button>
      </div>
      {TABLES.map((t) => {
        const rows = data[t.name] ?? [];
        const cols = rows.length ? Object.keys(rows[0] ?? {}) : [];
        return (
          <section key={t.name} className="paper overflow-hidden">
            <div className="flex flex-wrap items-baseline gap-3 border-b border-border px-5 py-3">
              <h3 className="font-semibold">{t.name}</h3>
              <span className="text-xs text-muted-foreground">{t.desc}</span>
              <span className="ml-auto text-xs text-muted-foreground">
                {rows.length} row{rows.length === 1 ? "" : "s"}
                {rows.length === 200 ? " (showing latest 200)" : ""}
              </span>
            </div>
            {rows.length === 0 ? (
              <p className="px-5 py-4 text-sm text-muted-foreground">No rows{loading ? " yet" : ""}.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-border bg-secondary/60">
                      {cols.map((c) => (
                        <th key={c} className="whitespace-nowrap px-3 py-2 font-medium text-muted-foreground">{c}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, i) => (
                      <tr key={i} className="border-b border-border/50 align-top last:border-0 hover:bg-secondary/30">
                        {cols.map((c) => (
                          <td key={c} className="max-w-[260px] whitespace-pre-wrap break-words px-3 py-2">
                            {cell(row?.[c])}

                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
