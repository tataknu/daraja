import { createFileRoute } from "@tanstack/react-router";
import { LandingPage } from "@/features/landing/landing-page";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Daraja — an AI front desk for small tourism hosts" },
      {
        name: "description",
        content:
          "Visitors write in any language. Hosts answer from a basic phone with one SMS. Nothing is confirmed until the host says yes.",
      },
      { property: "og:title", content: "Daraja" },
      {
        property: "og:description",
        content: "Visitors write in any language. Hosts answer from a basic phone.",
      },
    ],
  }),
  component: LandingPage,
});
