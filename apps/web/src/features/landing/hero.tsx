import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import RotatingText from "@/components/reactbits/RotatingText";
import TextType from "@/components/reactbits/TextType";
import { PhoneShell } from "@/components/phone-shell";
import { Button } from "@turflow/ui/components/button";

const LANGUAGES = ["German", "French", "Japanese", "Spanish", "Dutch", "Italian"];
// Real messages from a local end-to-end run of this app.
const SAMPLE_EMAIL = "Hallo! Wir sind 3 Personen und möchten am Samstag, 10. Oktober, morgens die Kaffeetour machen. Viele Grüße, Lena";
const SAMPLE_SMS = "B14: Lena (Ujerumani), watu 3, Jumamosi 10 Okt asubuhi. Jibu 1=Ndiyo 2=Hapana 3=Siku nyingine";
const TYPING_SPEED = 32;
const TYPING_DELAY = 900;

export function Hero() {
  const reduce = useReducedMotion();
  return (
    <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 pt-6 pb-20 sm:px-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:pt-12">
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-accent">Coffee-farm visits · Ondera highlands</p>
        <h1 className="mt-4 text-4xl font-bold leading-[1.08] text-primary text-balance sm:text-5xl lg:text-6xl">
          Visitors write in{" "}
          {reduce ? (
            <span className="text-accent">any language</span>
          ) : (
            <RotatingText
              texts={LANGUAGES}
              mainClassName="inline-flex overflow-hidden text-accent"
              splitLevelClassName="overflow-hidden pb-1"
              staggerFrom="last"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "-120%" }}
              staggerDuration={0.02}
              transition={{ type: "spring", damping: 30, stiffness: 400 }}
              rotationInterval={2200}
            />
          )}
          .
          <br />
          Noor answers from her basic phone.
        </h1>
        <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
          An AI front desk for a smallholder coffee farm. It reads every email in the visitor's language and sends Noor
          one short SMS in Swahili. Nothing is confirmed until she replies.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Button asChild size="lg"><a href="#try">Try it with a real message</a></Button>
          <Button asChild size="lg" variant="ghost"><Link to="/demo">Open the demo</Link></Button>
        </div>
        <p className="mt-6 text-sm text-muted-foreground">No app for Noor. No form for visitors. Just email and SMS.</p>
      </div>
      <HeroVisual reduce={!!reduce} />
    </section>
  );
}

function HeroVisual({ reduce }: { reduce: boolean }) {
  const [replied, setReplied] = useState(reduce);
  useEffect(() => {
    if (reduce) return;
    const t = setTimeout(() => setReplied(true), TYPING_DELAY + SAMPLE_SMS.length * TYPING_SPEED + 900);
    return () => clearTimeout(t);
  }, [reduce]);

  return (
    <div className="relative mx-auto w-full max-w-md lg:mx-0 lg:justify-self-end">
      {/* The card overlaps only the phone's top edge, never its screen. */}
      <figure className="paper relative z-10 mr-10 p-4 text-sm sm:mr-24 lg:-ml-8 lg:mr-0 lg:w-72">
        <figcaption className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Lena · email in German</span>
          <span>09:41</span>
        </figcaption>
        <p className="leading-relaxed">{SAMPLE_EMAIL}</p>
      </figure>
      <PhoneShell className="relative -mt-6 ml-auto" screenClassName="h-[300px]" label="Noor's SMS: a booking request and her reply">
        <div className="text-sm opacity-70">&lt; Msaidizi</div>
        {reduce ? (
          <p className="whitespace-pre-wrap">{SAMPLE_SMS}</p>
        ) : (
          <TextType
            as="p"
            text={SAMPLE_SMS}
            typingSpeed={TYPING_SPEED}
            initialDelay={TYPING_DELAY}
            loop={false}
            showCursor={!replied}
            cursorCharacter="▌"
            className="font-lcd"
          />
        )}
        <AnimatePresence>
          {replied && (
            <motion.div initial={reduce ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
              <div className="mt-3 text-sm opacity-70">&gt; Mimi</div>
              <p className="pl-3">1</p>
              <div className="mt-3 text-sm opacity-70">&lt; Msaidizi</div>
              <p>B14 imethibitishwa. Mgeni ametumiwa maelekezo.</p>
            </motion.div>
          )}
        </AnimatePresence>
      </PhoneShell>
      <p className="mt-3 text-right text-xs text-muted-foreground">Real messages from a test run of this demo.</p>
    </div>
  );
}
