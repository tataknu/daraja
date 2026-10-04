// Transport for every AI call: an OpenAI Responses-compatible endpoint with strict JSON output.
// A local stack (e.g. an intent classifier + NLLB-200 for translation) can replace it later
// without touching workflow code.
import { createAi } from "./tasks";
import type { AiUsage, CallTool } from "./types";

// Lovable's AI gateway by default. Any OpenAI Responses-compatible endpoint works too, which is how
// local runs use OpenAI directly: AI_GATEWAY_URL=https://api.openai.com/v1/responses + AI_MODEL + OPENAI_API_KEY.
const LOVABLE_GATEWAY = "https://ai.gateway.lovable.dev/v1/responses";

export interface GatewayConfig {
  url: string;
  model: string;
  headers: () => Record<string, string>;
  /** Reasoning effort for reasoning models; lower is cheaper and faster. Omitted when undefined. */
  reasoningEffort?: string | undefined;
}

/** The gateway settings from the environment (AI_GATEWAY_URL, AI_MODEL, AI_REASONING_EFFORT). */
export function gatewayConfigFromEnv(
  env: Record<string, string | undefined> = process.env,
): GatewayConfig {
  const url = env["AI_GATEWAY_URL"] || LOVABLE_GATEWAY;
  const model = env["AI_MODEL"] || "openai/gpt-6-astra";
  const effort = env["AI_REASONING_EFFORT"] || "low";
  return {
    url,
    model,
    reasoningEffort: effort === "none" ? undefined : effort,
    headers: () => authHeaders(url, env),
  };
}

function authHeaders(url: string, env: Record<string, string | undefined>): Record<string, string> {
  if (url === LOVABLE_GATEWAY) {
    const key = env["LOVABLE_API_KEY"];
    if (!key) throw new Error("AI key missing");
    return { "Lovable-API-Key": key, "X-Lovable-AIG-SDK": "fetch" };
  }
  const key = env["OPENAI_API_KEY"];
  if (!key) throw new Error("AI key missing");
  return { Authorization: `Bearer ${key}` };
}
interface JsonSchema {
  type?: string | string[];
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  [key: string]: unknown;
}

interface ResponseUsage {
  input_tokens?: number;
  output_tokens?: number;
  input_tokens_details?: { cached_tokens?: number };
  output_tokens_details?: { reasoning_tokens?: number };
}

interface StreamEvent {
  type?: string;
  delta?: string;
  error?: unknown;
  response?: { error?: unknown; usage?: ResponseUsage };
}

// Strict structured output: every object has additionalProperties:false and all keys required.
function strict(schema: JsonSchema): JsonSchema {
  if (
    schema?.type === "object" ||
    (Array.isArray(schema?.type) && schema.type.includes("object"))
  ) {
    const props = schema.properties ?? {};
    for (const [k, v] of Object.entries(props)) props[k] = strict(v);
    return {
      ...schema,
      properties: props,
      required: Object.keys(props),
      additionalProperties: false,
    };
  }
  if (schema?.type === "array" && schema.items) return { ...schema, items: strict(schema.items) };
  return schema;
}

/** A CallTool over one gateway: streams the structured output and reports usage and latency. */
export function createCallTool(config: GatewayConfig): CallTool {
  return async <T>(
    system: string,
    user: string,
    name: string,
    parameters: object,
    onUsage?: (u: AiUsage) => void,
  ): Promise<T> => {
    const started = Date.now();
    let usage: ResponseUsage | undefined;
    const report = (ok: boolean) => {
      try {
        onUsage?.({
          task: name,
          model: config.model,
          input_tokens: usage?.input_tokens ?? 0,
          cached_tokens: usage?.input_tokens_details?.cached_tokens ?? 0,
          output_tokens: usage?.output_tokens ?? 0,
          reasoning_tokens: usage?.output_tokens_details?.reasoning_tokens ?? 0,
          latency_ms: Date.now() - started,
          ok,
        });
      } catch {
        // Metering must never break a call.
      }
    };
    try {
      const res = await fetch(config.url, {
        method: "POST",
        headers: { ...config.headers(), "Content-Type": "application/json" },
        body: JSON.stringify({
          model: config.model,
          instructions: system,
          input: [{ role: "user", content: user }],
          stream: true,
          store: false,
          ...(config.reasoningEffort ? { reasoning: { effort: config.reasoningEffort } } : {}),
          text: {
            format: {
              type: "json_schema",
              name,
              strict: true,
              schema: strict(parameters as JsonSchema),
            },
          },
        }),
      });
      if (!res.ok || !res.body) throw new Error(`AI error ${res.status}: ${await res.text()}`);
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "",
        out = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data:")) continue;
          const data = line.slice(5).trim();
          if (!data || data === "[DONE]") continue;
          let ev: StreamEvent;
          try {
            ev = JSON.parse(data);
          } catch {
            continue;
          }
          if (ev.type === "response.output_text.delta") out += ev.delta ?? "";
          // An incomplete or failed response is billed too: its usage is reported with the failure.
          else if (ev.type === "response.completed" || ev.type === "response.incomplete")
            usage = ev.response?.usage ?? usage;
          else if (ev.type === "error" || ev.type === "response.failed") {
            usage = ev.response?.usage ?? usage;
            throw new Error(
              `AI stream error: ${JSON.stringify(ev.error ?? ev.response?.error ?? ev)}`,
            );
          }
        }
      }
      if (!out) throw new Error("AI returned empty output");
      const value = JSON.parse(out) as T;
      report(true);
      return value;
    } catch (e) {
      report(false);
      throw e;
    }
  };
}

const env = gatewayConfigFromEnv();
export const MODEL = env.model;
export const callTool = createCallTool(env);
export const gatewayAi = createAi(callTool, MODEL);
