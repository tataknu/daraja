import { describe, expect, it } from "vitest";
import { parseEnv } from "./env";
import { END, formatMetric, renderResults, replaceBlock, START, type SuiteResult } from "./report";

const run = (model: string, intent: number): SuiteResult => ({
  kind: "model",
  suite: "guest",
  task: "classify_guest",
  title: "Guest emails",
  model,
  effort: "low",
  answered_at: "2026-10-05T10:00:00.000Z",
  dataset: { source: "packages/eval/data/guest.json", sha256: "x", cases: 2, total: 2 },
  partial: false,
  prices: null,
  metrics: [
    { key: "intent", label: "Intent", format: "pct", value: intent / 2, num: intent, den: 2 },
  ],
  usage: [
    { key: "calls", label: "Model calls", format: "int", value: 2 },
    { key: "latency_p50", label: "Latency p50", format: "ms", value: 812.4 },
    { key: "cost_per_1k", label: "Cost per 1,000 messages", format: "usd", value: null },
  ],
  cases: [],
});

describe("docs", () => {
  it("formats rates with their counts", () => {
    expect(
      formatMetric({ key: "k", label: "K", format: "pct", value: 0.9583, num: 46, den: 48 }),
    ).toBe("95.8% (46/48)");
    expect(formatMetric({ key: "k", label: "K", format: "pct", value: null, num: 0, den: 0 })).toBe(
      "not scored",
    );
    expect(formatMetric({ key: "k", label: "K", format: "usd", value: 0.01234 })).toBe("$0.0123");
    expect(formatMetric(undefined)).toBe("–");
  });

  it("puts runs side by side and says when prices are missing", () => {
    const md = renderResults([run("model-b", 1), run("model-a", 2)], null);
    expect(md).toContain("| Metric | model-a, effort low | model-b, effort low |");
    expect(md).toContain("| Intent | 100.0% (2/2) | 50.0% (1/2) |");
    expect(md).toContain("no prices set");
    expect(md).toContain("812 ms");
  });

  it("replaces only the generated block", () => {
    const doc = `# Eval\n\nintro\n\n${START}\nold\n${END}\n\nlimits\n`;
    const out = replaceBlock(doc, "new");
    expect(out).toBe(`# Eval\n\nintro\n\n${START}\n\nnew\n\n${END}\n\nlimits\n`);
    expect(() => replaceBlock("# no markers", "x")).toThrow(/markers/);
  });
});

describe("env file", () => {
  it("reads KEY=VALUE lines, quotes, comments and export", () => {
    const env = parseEnv(
      "# comment\nAI_MODEL=gpt-x\nexport AI_GATEWAY_URL=\"https://example.com/v1?a=b\"\nKEY='s3cret' \nEMPTY=\nNOTE=abc # trailing\n",
    );
    expect(env).toEqual({
      AI_MODEL: "gpt-x",
      AI_GATEWAY_URL: "https://example.com/v1?a=b",
      KEY: "s3cret",
      EMPTY: "",
      NOTE: "abc",
    });
  });
});
