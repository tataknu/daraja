import { createFileRoute } from "@tanstack/react-router";
import { DemoPage } from "@/features/demo/demo-page";

interface DemoSearch {
  persona?: string | undefined;
  message?: string | undefined;
}

export const Route = createFileRoute("/demo")({
  validateSearch: (s: Record<string, unknown>): DemoSearch => ({
    persona: typeof s["persona"] === "string" ? s["persona"] : undefined,
    message: typeof s["message"] === "string" ? s["message"] : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Live demo — Noor's Farm Visits" },
      { name: "description", content: "Guests email in any language; Noor approves coffee-farm tours by SMS. Live simulator of the booking assistant." },
      { property: "og:title", content: "Live demo — Noor's Farm Visits" },
      { property: "og:description", content: "Guests email in any language; Noor approves coffee-farm tours by SMS." },
    ],
  }),
  component: DemoPage,
});
