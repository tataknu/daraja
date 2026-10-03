import { createFileRoute } from "@tanstack/react-router";
import { LandingPage } from "@/features/landing/landing-page";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Noor's Farm Visits — an AI front desk for a smallholder coffee farm" },
      {
        name: "description",
        content:
          "Visitors write in any language. Noor answers from her basic phone by SMS in Swahili. Nothing is confirmed until she says yes.",
      },
      { property: "og:title", content: "Noor's Farm Visits" },
      {
        property: "og:description",
        content: "Visitors write in any language. Noor answers from her basic phone.",
      },
    ],
  }),
  component: LandingPage,
});
