// Review analysis tasks: one review in, structured points and ideas out; ideas grouped across
// reviews; the computed summary phrased as SMS. Counting and quote checks happen in code
// (feedback.ts, insights.ts), not here.
import type { CallTool, IdeaGroups, InsightsSms, ReviewAnalysis } from "./types";

export async function analyzeReview(_call: CallTool, _text: string): Promise<ReviewAnalysis> {
  throw new Error("analyzeReview is not implemented yet");
}

export async function groupIdeas(
  _call: CallTool,
  _ideas: { id: string; idea: string }[],
): Promise<IdeaGroups> {
  throw new Error("groupIdeas is not implemented yet");
}

export async function writeInsightsSms(_call: CallTool, _summary: string): Promise<InsightsSms> {
  throw new Error("writeInsightsSms is not implemented yet");
}
