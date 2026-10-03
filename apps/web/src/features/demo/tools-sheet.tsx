import { useState } from "react";
import { Button } from "@turflow/ui/components/button";
import { Input } from "@turflow/ui/components/input";
import { Label } from "@turflow/ui/components/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@turflow/ui/components/sheet";

export function ToolsSheet(props: { busy: boolean; onTimers: (asOf: string | null) => void; onInsights: () => void; onReset: () => void }) {
  const [asOf, setAsOf] = useState("");
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline">Tools</Button>
      </SheetTrigger>
      <SheetContent className="flex flex-col gap-6">
        <SheetHeader>
          <SheetTitle>Demo tools</SheetTitle>
          <SheetDescription>Move time forward, send Noor her monthly summary, or start over.</SheetDescription>
        </SheetHeader>
        <section className="space-y-2 px-4">
          <Label htmlFor="as-of">Pretend it is</Label>
          <Input id="as-of" type="datetime-local" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
          <p className="text-xs text-muted-foreground">Leave empty for now. Reminders go out after 24 h, requests expire after 48 h.</p>
          <Button variant="outline" className="w-full" disabled={props.busy}
            onClick={() => props.onTimers(asOf ? new Date(asOf).toISOString() : null)}>Run timers</Button>
        </section>
        <section className="space-y-2 px-4">
          <p className="text-sm font-medium">Monthly insights</p>
          <p className="text-xs text-muted-foreground">Summarises visitor feedback into a short Swahili SMS for Noor.</p>
          <Button variant="outline" className="w-full" disabled={props.busy} onClick={props.onInsights}>Send insights to Noor</Button>
        </section>
        <section className="mt-auto space-y-2 border-t border-border px-4 pt-4 pb-4">
          <p className="text-xs text-muted-foreground">Clears every message and booking, and restores the starting data.</p>
          <Button variant="ghost" className="w-full text-destructive hover:text-destructive" disabled={props.busy} onClick={props.onReset}>Reset demo</Button>
        </section>
      </SheetContent>
    </Sheet>
  );
}
