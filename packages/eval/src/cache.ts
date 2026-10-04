// Every model answer is cached on disk, so nothing is paid for twice. The key is a hash of the exact
// request (system prompt, user text, schema) plus model and effort: editing a prompt in the engine
// or a case in the dataset makes a new key, and only that case is asked again.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createAi, type Ai, type AiUsage, type CallTool } from "@daraja/engine/ai";

/** Bump when the harness changes how it asks, to re-run everything once. */
export const HARNESS_VERSION = 1;

export interface CapturedRequest {
  system: string;
  user: string;
  name: string;
  parameters: object;
}

class Captured extends Error {
  constructor(readonly request: CapturedRequest) {
    super("captured");
  }
}

/** The request a task would send, captured without sending it (no network, no tokens). */
export async function captureRequest(task: (ai: Ai) => Promise<unknown>): Promise<CapturedRequest> {
  const transport: CallTool = async (system, user, name, parameters) => {
    throw new Captured({ system, user, name, parameters });
  };
  try {
    await task(createAi(transport, "capture"));
  } catch (e) {
    if (e instanceof Captured) return e.request;
    throw e;
  }
  throw new Error("the task made no model call");
}

export function cacheKey(req: CapturedRequest, model: string, effort: string): string {
  const material = JSON.stringify({ v: HARNESS_VERSION, model, effort, ...req });
  return createHash("sha256").update(material).digest("hex").slice(0, 16);
}

export interface CacheEntry<O> {
  key: string;
  suite: string;
  case_id: string;
  model: string;
  effort: string;
  created_at: string;
  output: O;
  usage: AiUsage[];
}

/** File names keep the model readable: "openai/gpt-5" becomes "openai_gpt-5". */
export const slug = (s: string) => s.replace(/[^A-Za-z0-9._-]+/g, "_");

export function cachePath(
  dir: string,
  e: Pick<CacheEntry<unknown>, "suite" | "model" | "effort" | "case_id" | "key">,
): string {
  return join(
    dir,
    e.suite,
    `${slug(e.model)}__${slug(e.effort)}`,
    `${slug(e.case_id)}.${e.key}.json`,
  );
}

export function readCache<O>(path: string, key: string): CacheEntry<O> | null {
  try {
    const entry = JSON.parse(readFileSync(path, "utf8")) as CacheEntry<O>;
    return entry.key === key ? entry : null;
  } catch {
    return null; // not cached yet, or unreadable: ask again
  }
}

export function writeCache<O>(path: string, entry: CacheEntry<O>): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(entry, null, 2) + "\n");
}
