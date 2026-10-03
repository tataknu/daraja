import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

export const Route = createFileRoute("/api/public/hooks/run-timers")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await authenticateCronRequest(request);
        if (denied) return denied;
        const { runTimers } = await import("@/lib/engine.server");
        const log = await runTimers(new Date());
        return Response.json({ ok: true, log });
      },
    },
  },
});
