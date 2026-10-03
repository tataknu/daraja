import { useEffect, useRef, useState } from "react";
import { PhoneShell } from "@/components/phone-shell";
import type { Contact, Message } from "./types";

export function NoorPhone(props: { host: Contact | undefined; messages: Message[]; busy: boolean; onSend: (t: string) => void }) {
  const [text, setText] = useState("");
  const sms = props.messages.filter((m) => m.contact_id === props.host?.id && m.channel === "sms");
  const screenRef = useRef<HTMLDivElement>(null);
  useEffect(() => { const el = screenRef.current; if (el) el.scrollTop = el.scrollHeight; }, [sms.length]);
  return (
    <section className="flex flex-col items-center gap-3 lg:h-full lg:min-h-0" aria-labelledby="phone-title">
      <div className="text-center">
        <h2 id="phone-title" className="text-lg font-semibold">Noor's phone</h2>
        <p className="text-xs text-muted-foreground">Basic phone · SMS in Swahili, English below each message</p>
      </div>
      <PhoneShell
        fill
        screenRef={screenRef}
        label="Noor's SMS messages"
        footer={
          <form className="mt-4 space-y-3" onSubmit={(e) => { e.preventDefault(); if (text.trim()) { props.onSend(text); setText(""); } }}>
            <input
              aria-label="Noor's reply"
              className="lcd-screen w-full rounded-sm border-2 border-phone-bezel px-2 py-1 text-lg outline-none focus-visible:border-accent"
              placeholder="Andika… e.g. 1" value={text} maxLength={160} onChange={(e) => setText(e.target.value)}
            />
            <div className="grid grid-cols-3 gap-2">
              {["1", "2", "3"].map((k) => (
                <button type="button" key={k} onClick={() => setText((t) => (t + " " + k).trim())}
                  className="rounded-full bg-phone-bezel py-2 font-lcd text-xl text-primary-foreground transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">{k}</button>
              ))}
            </div>
            <button type="submit" disabled={props.busy || !text.trim()}
              className="w-full rounded-full bg-success py-2 font-lcd text-xl text-primary-foreground transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40">TUMA ✉</button>
          </form>
        }
      >
        {sms.length === 0 && <p className="pt-10 text-center opacity-70">Hakuna ujumbe</p>}
        {sms.map((m) => (
          <div key={m.id} className="mb-2">
            <div className="text-sm opacity-70">{m.direction === "in" ? "> Mimi" : "< Msaidizi"} {new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
            <p className={`whitespace-pre-wrap break-words ${m.direction === "in" ? "pl-3" : ""}`}>{m.text_original}</p>
            {m.text_en && <p className="mt-0.5 border-l-2 border-lcd-ink/40 pl-2 font-sans text-xs italic opacity-80">EN: {m.text_en}</p>}
          </div>
        ))}
      </PhoneShell>
    </section>
  );
}
