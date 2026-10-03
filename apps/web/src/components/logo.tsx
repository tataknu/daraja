import { cn } from "@daraja/ui/lib/utils";

// The Daraja mark: one arch built from two halves (the visitor's side and the host's side) that
// meet in the middle, standing on a road that runs past both ends. Source files: docs/brand/.
const LEFT = "M10 45V36A22 22 0 0 1 30.8 14.03V22.05A14 14 0 0 0 18 36V45Z";
const RIGHT = "M54 45V36A22 22 0 0 0 33.2 14.03V22.05A14 14 0 0 1 46 36V45Z";
const ROAD = "M6.5 44.5h51a2.5 2.5 0 0 1 0 5h-51a2.5 2.5 0 0 1 0-5Z";

export function DarajaMark({
  className,
  reversed = false,
}: {
  className?: string;
  /** For dark backgrounds: the host's half and the road turn cream. */
  reversed?: boolean;
}) {
  const ink = reversed ? "fill-primary-foreground" : "fill-primary";
  return (
    <svg viewBox="2 12 60 40" aria-hidden="true" className={cn("h-6 w-auto shrink-0", className)}>
      <path d={LEFT} className="fill-accent" />
      <path d={RIGHT} className={ink} />
      <path d={ROAD} className={ink} />
    </svg>
  );
}

/** Mark + wordmark, for the site header and footer. */
export function DarajaLogo({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 font-display font-bold text-primary",
        className,
      )}
    >
      <DarajaMark className="h-[1.1em]" />
      Daraja
    </span>
  );
}
