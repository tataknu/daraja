// Phase 2 stub: Twilio inbound SMS webhook. Disabled until PHASE2_ENABLED=true.
import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";

export const Route = createFileRoute("/api/public/inbound-sms")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (process.env["PHASE2_ENABLED"] !== "true") return new Response("Not enabled", { status: 503 });
        const token = process.env["TWILIO_AUTH_TOKEN"];
        if (!token) return new Response("Server configuration error", { status: 500 });
        const params = Object.fromEntries(new URLSearchParams(await request.text()));
        // Twilio signature: base64(HMAC-SHA1(url + sorted key/value pairs))
        const payload = request.url + Object.keys(params).sort().map((k) => k + params[k]).join("");
        const expected = createHmac("sha1", token).update(payload).digest("base64");
        const sig = request.headers.get("x-twilio-signature") ?? "";
        if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
          return new Response("Invalid signature", { status: 401 });
        }
        if (!params.From || !params.Body || !params.MessageSid) return new Response("Bad request", { status: 400 });
        const { handleInbound } = await import("@/lib/engine.server");
        await handleInbound({ channel: "sms", sender: params.From, text: params.Body.slice(0, 1600), provider_msg_id: params.MessageSid });
        return new Response("<Response/>", { headers: { "Content-Type": "text/xml" } });
      },
    },
  },
});
