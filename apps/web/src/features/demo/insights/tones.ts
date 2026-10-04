// What each of the report's three sections is called and how it is coloured.
export type Tone = "keep" | "improve" | "next";

// Whole class names, so Tailwind sees them. Colour is a second cue: every section is also named.
export const TONES: Record<
  Tone,
  { title: string; question: string; empty: string; dot: string; bar: string; rule: string }
> = {
  keep: {
    title: "Keep doing",
    question: "What visitors keep returning to",
    empty: "No favourites came up in these reviews.",
    dot: "bg-success",
    bar: "bg-success",
    rule: "border-success/50",
  },
  improve: {
    title: "Improve",
    question: "What they wish had been different",
    empty: "No wishes came up in these reviews.",
    dot: "bg-accent",
    bar: "bg-accent",
    rule: "border-accent/50",
  },
  next: {
    title: "Build next",
    question: "What visitors suggest you add",
    empty: "No suggestions came up in these reviews.",
    dot: "bg-primary",
    bar: "bg-primary",
    rule: "border-primary/40",
  },
};
