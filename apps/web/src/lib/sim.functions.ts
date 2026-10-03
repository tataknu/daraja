import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const inbound = z.object({
  channel: z.enum(["email", "sms"]),
  sender: z.string().min(1).max(255),
  sender_name: z.string().max(100).nullable().optional(),
  text: z.string().min(1).max(4000),
  provider_msg_id: z.string().min(1).max(200),
  thread_ref: z.string().max(100).nullable().optional(),
});

// Same handler the real webhooks call in Phase 2.
export const postInbound = createServerFn({ method: "POST" })
  .inputValidator((d) => inbound.parse(d))
  .handler(async ({ data }) => {
    const { handleInbound } = await import("@turflow/engine");
    return handleInbound(data);
  });

export const createGuest = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ name: z.string().trim().min(1).max(100), email: z.string().trim().email().max(255) }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@turflow/db/client.server");
    const { data: row, error } = await supabaseAdmin.from("contacts")
      .upsert({ role: "guest", name: data.name, email: data.email.toLowerCase() }, { onConflict: "email" })
      .select("id").single();
    if (error) throw new Error(error.message);
    return row;
  });

export const runTimersNow = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ asOf: z.string().datetime().nullable() }).parse(d))
  .handler(async ({ data }) => {
    const { runTimers } = await import("@turflow/engine");
    return runTimers(data.asOf ? new Date(data.asOf) : new Date());
  });

export const generateInsights = createServerFn({ method: "POST" }).handler(async () => {
  const { monthlyInsights } = await import("@turflow/engine");
  return monthlyInsights();
});

export const resetDemo = createServerFn({ method: "POST" }).handler(async () => {
  const { resetDemo } = await import("@turflow/engine");
  await resetDemo();
  return { ok: true };
});
