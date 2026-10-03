import { Link } from "@tanstack/react-router";
import { DarajaLogo } from "@/components/logo";

export function SiteFooter() {
  return (
    <footer className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-10 text-sm sm:px-6">
      <Link to="/" aria-label="Daraja home" className="text-base">
        <DarajaLogo />
      </Link>
      <Link to="/demo" className="font-medium text-foreground underline-offset-4 hover:underline">
        Open the demo →
      </Link>
    </footer>
  );
}
