// A small map under a confirmation email: the farm's pin, and directions in Google Maps.
import type { Directions } from "./directions";

export function MapCard({ url, lat, lng }: Directions) {
  return (
    <figure className="mt-3 w-full max-w-sm overflow-hidden rounded-md border border-border bg-background">
      <iframe
        title="Map of the farm's location"
        src={`https://www.google.com/maps?q=${lat},${lng}&z=13&output=embed`}
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        className="block h-40 w-full border-0"
      />
      <figcaption className="flex items-center justify-between gap-3 px-3 py-2 text-xs">
        <span className="text-muted-foreground">Where the farm is</span>
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          Directions in Google Maps ↗
        </a>
      </figcaption>
    </figure>
  );
}
