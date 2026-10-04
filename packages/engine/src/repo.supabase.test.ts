// The Supabase repo's usage log, against a stand-in for supabase-js that answers like Postgres: a
// broken link comes back as { error }, it doesn't throw.
import { describe, expect, it } from "vitest";
import type { NewAiCall } from "./repo";
import { supabaseRepo } from "./repo.supabase.server";

type Db = Parameters<typeof supabaseRepo>[0];

const call = (booking_id: number | null, message_id: string | null): NewAiCall => ({
  task: "translate",
  model: "test-model",
  input_tokens: 100,
  cached_tokens: 0,
  output_tokens: 20,
  reasoning_tokens: 0,
  latency_ms: 5,
  ok: true,
  source: "inbound",
  message_id,
  booking_id,
});

/** The ai_calls table, with the bookings and messages its foreign keys point to. */
function aiCalls(bookings: number[], messages: string[]) {
  const stored: NewAiCall[] = [];
  const brokenLink = (column: string, value: unknown, table: string) => ({
    code: "23503",
    message: `insert or update on table "ai_calls" violates foreign key constraint "ai_calls_${column}_fkey"`,
    details: `Key (${column})=(${String(value)}) is not present in table "${table}".`,
  });
  const insert = async (rows: NewAiCall[]) => {
    const booking = rows.find((r) => r.booking_id !== null && !bookings.includes(r.booking_id));
    if (booking) return { error: brokenLink("booking_id", booking.booking_id, "bookings") };
    const message = rows.find((r) => r.message_id !== null && !messages.includes(r.message_id));
    if (message) return { error: brokenLink("message_id", message.message_id, "messages") };
    stored.push(...rows);
    return { error: null };
  };
  const db = { from: () => ({ insert }) };
  return { repo: supabaseRepo(db as unknown as Db), stored };
}

describe("logging AI usage in Supabase", () => {
  it("keeps the usage of a call about a booking that doesn't exist, without the link", async () => {
    // Noor's "B99 1 sawa": its translation is billed, and logged against B99.
    const t = aiCalls([14], ["m1"]);
    await t.repo.logAiCalls([call(99, "m1"), call(99, "m1")]);
    expect(t.stored).toEqual([call(null, "m1"), call(null, "m1")]);
  });

  it("drops only the links that are broken", async () => {
    const t = aiCalls([14], []);
    await t.repo.logAiCalls([call(14, "deleted")]);
    expect(t.stored).toEqual([call(14, null)]);

    const u = aiCalls([], []);
    await u.repo.logAiCalls([call(99, "deleted")]);
    expect(u.stored).toEqual([call(null, null)]);
  });

  it("never throws, and doesn't retry other errors", async () => {
    const failing = (insert: () => Promise<unknown>) =>
      supabaseRepo({ from: () => ({ insert }) } as unknown as Db).logAiCalls([call(14, "m1")]);
    await expect(
      failing(async () => {
        throw new Error("network down");
      }),
    ).resolves.toBeUndefined();

    let inserts = 0;
    await expect(
      failing(async () => {
        inserts++;
        return { error: { code: "42501", message: "permission denied", details: "" } };
      }),
    ).resolves.toBeUndefined();
    expect(inserts).toBe(1);
  });
});
