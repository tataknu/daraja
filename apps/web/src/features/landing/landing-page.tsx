import { Hero } from "./hero";
import { HowItWorks } from "./how-it-works";
import { Principles } from "./principles";
import { SiteFooter } from "./site-footer";
import { SiteNav } from "./site-nav";
import { TryIt } from "./try-it";

export function LandingPage() {
  return (
    <div className="min-h-screen overflow-x-clip">
      <SiteNav />
      <main>
        <Hero />
        <HowItWorks />
        <Principles />
        <TryIt />
      </main>
      <SiteFooter />
    </div>
  );
}
