import { Link } from "@tanstack/react-router";
import { GitHubLink } from "@/components/github-link";
import { DarajaLogo } from "@/components/logo";

export function SiteFooter() {
  return (
    <footer className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-10 text-sm sm:px-6">
      <Link to="/" aria-label="Daraja home" className="text-base">
        <DarajaLogo />
      </Link>
      <div className="flex items-center gap-5">
        <GitHubLink label="Code on GitHub" />
        <Link to="/demo" className="font-medium text-foreground underline-offset-4 hover:underline">
          Open the demo →
        </Link>
      </div>
    </footer>
  );
}
