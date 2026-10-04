import { Link } from "@tanstack/react-router";
import { Button } from "@daraja/ui/components/button";
import { GitHubLink } from "@/components/github-link";
import { DarajaLogo } from "@/components/logo";

export function SiteNav() {
  return (
    <header className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-5 sm:px-6">
      <Link to="/" aria-label="Daraja home" className="text-xl">
        <DarajaLogo />
      </Link>
      <nav className="flex items-center gap-1 sm:gap-2" aria-label="Main">
        <a
          href="#how"
          className="hidden rounded-md px-3 py-2 text-sm text-muted-foreground transition hover:text-foreground sm:inline-block"
        >
          How it works
        </a>
        <a
          href="#use-case"
          className="hidden rounded-md px-3 py-2 text-sm text-muted-foreground transition hover:text-foreground sm:inline-block"
        >
          Use case
        </a>
        <GitHubLink className="p-2" />
        <Button asChild variant="outline" size="sm">
          <Link to="/demo">Open the demo</Link>
        </Button>
      </nav>
    </header>
  );
}
