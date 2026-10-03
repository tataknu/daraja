import { Link } from "@tanstack/react-router";
import { DarajaLogo } from "@/components/logo";

export function SiteFooter() {
  return (
    <footer className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-10 text-sm text-muted-foreground sm:px-6">
      <p className="max-w-2xl">
        <DarajaLogo className="mb-2 flex w-fit text-base" />
        Built for the Hack-Nation × World Bank Youth Summit, Small AI for Development. Phase 1
        simulator: messages stay inside the demo; no real SMS or email is sent.
      </p>
      <Link to="/demo" className="font-medium text-foreground underline-offset-4 hover:underline">
        Open the demo →
      </Link>
    </footer>
  );
}
