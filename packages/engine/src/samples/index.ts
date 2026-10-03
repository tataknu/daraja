// Sample reviews for the demo and the eval: multilingual, written for Noor's farm, with labels.
import type { Aspect, ReviewAnalysis } from "../ai/types";

export interface SampleReview {
  id: string;
  lang: string;
  text: string;
  /** Ground truth for the eval: what a careful reader finds in the review. */
  labels: {
    sentiment: "positive" | "neutral" | "negative";
    loved: Aspect[];
    wished: Aspect[];
    /** Short English descriptions of the visitor's suggestions. */
    ideas: string[];
  };
  /** A verified model analysis, so loading the samples costs no tokens. Filled by a script. */
  analysis?: ReviewAnalysis;
}

export const SAMPLE_REVIEWS: SampleReview[] = [];
