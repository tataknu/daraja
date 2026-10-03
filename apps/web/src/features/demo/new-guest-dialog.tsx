import { useState } from "react";
import { Button } from "@turflow/ui/components/button";
import { Input } from "@turflow/ui/components/input";
import { Label } from "@turflow/ui/components/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@turflow/ui/components/dialog";

export function NewGuestDialog({ busy, onCreate }: { busy: boolean; onCreate: (n: string, e: string) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm">New guest</Button>
      </DialogTrigger>
      <DialogContent>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (name && email) { onCreate(name, email); setName(""); setEmail(""); setOpen(false); } }}>
          <DialogHeader>
            <DialogTitle>New guest</DialogTitle>
            <DialogDescription>Write to Noor as someone new. They can write in any language.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="guest-name">Name</Label>
            <Input id="guest-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Lena Schulz" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="guest-email">Email</Label>
            <Input id="guest-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="lena@example.de" required />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={busy || !name || !email}>Add guest</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
