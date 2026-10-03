import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import Stepper, { Step } from "@/components/reactbits/Stepper";
import { PERSONAS, personaById } from "@/lib/personas";
import { Label } from "@daraja/ui/components/label";
import { Textarea } from "@daraja/ui/components/textarea";

/** The 3-step wizard: pick a visitor, edit their email, open the demo with it already sent. */
export function TryIt() {
  const navigate = useNavigate();
  const [personaId, setPersonaId] = useState(PERSONAS[0]!.id);
  const persona = personaById(personaId) ?? PERSONAS[0]!;
  const [message, setMessage] = useState(persona.message);
  const first = persona.name.split(" ")[0];

  const pick = (id: string) => {
    setPersonaId(id);
    setMessage(personaById(id)?.message ?? "");
  };

  return (
    <section id="try" className="bg-secondary/40 scroll-mt-4">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-20 sm:px-6 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <div>
          <h2 className="text-3xl font-bold text-primary text-balance sm:text-4xl">
            Try it as Noor's farm
          </h2>
          <p className="mt-3 text-muted-foreground">
            The live demo runs Noor's coffee farm as the example host. Pick a visitor, edit their
            email, and watch it reach Noor's phone. Then answer as Noor.
          </p>
        </div>
        <Stepper
          initialStep={1}
          backButtonText="Back"
          nextButtonText="Continue"
          completeButtonText="Send and open the demo"
          nextButtonProps={{ disabled: !message.trim() }}
          onFinalStepCompleted={() =>
            navigate({ to: "/demo", search: { persona: persona.id, message: message.trim() } })
          }
        >
          <Step>
            <fieldset>
              <legend className="text-lg font-semibold">Who's writing to Noor?</legend>
              <div
                className="mt-4 grid gap-2 sm:grid-cols-2"
                role="radiogroup"
                aria-label="Visitor"
              >
                {PERSONAS.map((p) => {
                  const selected = p.id === personaId;
                  return (
                    <button
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      key={p.id}
                      onClick={() => pick(p.id)}
                      className={`rounded-lg border px-4 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                        selected
                          ? "border-accent bg-accent/10"
                          : "border-border bg-background hover:border-primary/40"
                      }`}
                    >
                      <span className="block font-medium">{p.name}</span>
                      <span className="block text-sm text-muted-foreground">
                        Writes in {p.language}
                      </span>
                    </button>
                  );
                })}
              </div>
            </fieldset>
          </Step>
          <Step>
            <Label htmlFor="wizard-message" className="text-lg font-semibold">
              {first}'s email, in {persona.language}
            </Label>
            <Textarea
              id="wizard-message"
              rows={7}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="mt-3 bg-background"
            />
            {message.trim() === persona.message.trim() ? (
              <p className="mt-2 text-sm text-muted-foreground">In English: {persona.english}</p>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">
                Write anything, in any language. The assistant will read it.
              </p>
            )}
          </Step>
          <Step>
            <h3 className="text-lg font-semibold">What happens next</h3>
            <ol className="mt-4 space-y-3 text-sm">
              {[
                `${first}'s email goes to the assistant, which reads it in ${persona.language}.`,
                "Noor's phone gets one SMS in Swahili with the date and group size.",
                "In the demo, tap 1 on her phone, then TUMA, to accept.",
                `${first} gets the confirmation in ${persona.language}, with directions to the farm.`,
              ].map((t, i) => (
                <li key={t} className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold tabular-nums">
                    {i + 1}
                  </span>
                  <span className="pt-0.5">{t}</span>
                </li>
              ))}
            </ol>
          </Step>
        </Stepper>
      </div>
    </section>
  );
}
