import { Link } from "@tanstack/react-router";
import { Button } from "@turflow/ui/components/button";

export function SiteNav() {
  return (
    <header className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-5 sm:px-6">
      <Link to="/" className="font-display text-lg font-bold text-primary">Noor's Farm Visits</Link>
      <nav className="flex items-center gap-1 sm:gap-2" aria-label="Main">
        <a href="#how" className="hidden rounded-md px-3 py-2 text-sm text-muted-foreground transition hover:text-foreground sm:inline-block">How it works</a>
        <Button asChild variant="outline" size="sm"><Link to="/demo">Open the demo</Link></Button>
      </nav>
    </header>
  );
}
