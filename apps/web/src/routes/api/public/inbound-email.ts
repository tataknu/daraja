// Phase 2 stub: Postmark inbound email webhook (basic auth). Disabled until PHASE2_ENABLED=true.
import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "crypto";
import { z } from "zod";

const Postmark = z.object({
  From: z.string().email(),
  FromName: z.string().optional(),
  TextBody: z.string().max(20000),
  MessageID: z.string(),
  Subject: z.string().optional(),
  Headers: z.array(z.object({ Name: z.string(), Value: z.string() })).optional(),
});

export const Route = createFileRoute("/api/public/inbound-email")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (process.env["PHASE2_ENABLED"] !== "true")
          return new Response("Not enabled", { status: 503 });
        const user = process.env["POSTMARK_INBOUND_USER"],
          pass = process.env["POSTMARK_INBOUND_PASS"];
        if (!user || !pass) return new Response("Server configuration error", { status: 500 });
        const expected = "Basic " + Buffer.from(`${user}:${pass}`).toString("base64");
        const got = request.headers.get("authorization") ?? "";
        if (
          got.length !== expected.length ||
          !timingSafeEqual(Buffer.from(got), Buffer.from(expected))
        ) {
          return new Response("Unauthorized", { status: 401 });
        }
        const p = Postmark.safeParse(await request.json());
        if (!p.success) return new Response("Bad request", { status: 400 });
        const ref = p.data.Subject?.match(/B\d+/)?.[0] ?? null;
        const { handleInbound } = await import("@daraja/engine");
        await handleInbound({
          channel: "email",
          sender: p.data.From,
          sender_name: p.data.FromName ?? null,
          text: p.data.TextBody.slice(0, 4000),
          provider_msg_id: p.data.MessageID,
          thread_ref: ref,
        });
        return new Response("ok");
      },
    },
  },
});
