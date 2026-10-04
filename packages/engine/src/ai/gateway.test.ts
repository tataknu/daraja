// The gateway transport against a stubbed fetch: every billed response reports its tokens, also
// one that ends incomplete or failed. No network.
import { afterEach, describe, expect, it, vi } from "vitest";
import { createCallTool } from "./gateway.server";
import type { AiUsage } from "./types";

const USAGE = {
  input_tokens: 1200,
  output_tokens: 300,
  input_tokens_details: { cached_tokens: 200 },
  output_tokens_details: { reasoning_tokens: 250 },
};
const REPORTED = {
  input_tokens: 1200,
  cached_tokens: 200,
  output_tokens: 300,
  reasoning_tokens: 250,
};

/** A streamed Responses API answer made of these events. */
const stream = (...events: object[]) =>
  new Response(events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join(""));

function callAnswering(response: Response) {
  vi.stubGlobal("fetch", async () => response);
  const usage: AiUsage[] = [];
  const call = createCallTool({
    url: "https://gateway.test/v1/responses",
    model: "test-model",
    headers: () => ({}),
  });
  const run = () => call("Classify.", "Hallo!", "classify_guest", {}, (u) => usage.push(u));
  return { usage, run };
}

describe("gateway usage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reports the tokens of a completed response", async () => {
    const t = callAnswering(
      stream(
        { type: "response.output_text.delta", delta: '{"ok":true}' },
        { type: "response.completed", response: { usage: USAGE } },
      ),
    );
    expect(await t.run()).toEqual({ ok: true });
    expect(t.usage).toEqual([expect.objectContaining({ ...REPORTED, ok: true })]);
  });

  it("reports the tokens of an incomplete response, which are billed", async () => {
    const t = callAnswering(
      stream(
        { type: "response.output_text.delta", delta: '{"intent":"boo' },
        { type: "response.incomplete", response: { usage: USAGE } },
      ),
    );
    await expect(t.run()).rejects.toThrow();
    expect(t.usage).toEqual([expect.objectContaining({ ...REPORTED, ok: false })]);
  });

  it("reports the tokens of a failed response, which are billed", async () => {
    const t = callAnswering(
      stream({
        type: "response.failed",
        response: { error: { code: "server_error" }, usage: USAGE },
      }),
    );
    await expect(t.run()).rejects.toThrow("AI stream error");
    expect(t.usage).toEqual([expect.objectContaining({ ...REPORTED, ok: false })]);
  });
});
