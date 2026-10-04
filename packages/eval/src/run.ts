// The eval runner: `make eval`, or `npx --yes bun@1 run eval --suite guest --limit 3`. Flags: --help.
// Prints how many paid calls a run needs before making any, and caches every answer.
import { mkdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import {
  createAi,
  createCallTool,
  gatewayConfigFromEnv,
  type Ai,
  type AiUsage,
} from "@daraja/engine/ai";
import {
  cacheKey,
  cachePath,
  captureRequest,
  readCache,
  slug,
  writeCache,
  type CacheEntry,
} from "./cache";
import { priceOf } from "@daraja/engine/metrics";
import { loadEnv } from "./env";
import { formatMetric, updateDocs, writeJson, type SafetyReport, type SuiteResult } from "./report";
import { usageMetrics, type Prices } from "./score";
import { guestSuite, hostSuite, reviewSuite, type ModelSuiteName, type Suite } from "./suites";

const PKG = fileURLToPath(new URL("..", import.meta.url));
const ROOT = join(PKG, "..", "..");
const DATA = join(PKG, "data");
const RESULTS = join(PKG, "results");
const CACHE = join(RESULTS, ".cache");
const DOCS = join(ROOT, "docs", "eval.md");
const ENV_FILE = join(ROOT, "apps", "web", ".env.local");

const HELP = `Usage: npx --yes bun@1 run eval [flags]   (or: make eval ARGS="...")

  --suite <name>      guest | host | reviews | safety | all (default all)
  --model <id>        model id sent to the gateway (default AI_MODEL)
  --effort <level>    reasoning effort, e.g. none | minimal | low | medium (default
                      AI_REASONING_EFFORT, else low); "none" sends no reasoning setting
  --limit <n>         only the first n cases of each suite (a partial run stays out of docs/eval.md)
  --concurrency <n>   calls in flight at once (default 4)
  --max-calls <n>     refuse to start when a run needs more uncached calls (default 120)
  --fresh             ignore the cache and ask the model again
  --dry-run           print the calls a run would make, then stop
  --report            only regenerate docs/eval.md from packages/eval/results/*.json`;

const SUITES = ["guest", "host", "reviews", "safety"] as const;
type SuiteName = (typeof SUITES)[number];

class UsageError extends Error {}
/** The gateway refused the request (bad key, no quota, unknown model): stop, don't fail every case. */
class FatalError extends Error {}

interface Options {
  ai: Ai;
  model: string;
  effort: string;
  limit: number | null;
  concurrency: number;
  fresh: boolean;
  prices: Prices | null;
}

interface Plan {
  name: ModelSuiteName;
  total: number;
  cases: number;
  uncached: number;
  /** Why the suite can't run yet, e.g. no labelled samples. */
  skip: string | null;
  execute(): Promise<SuiteResult | null>;
}

interface Item<C, O> {
  c: C;
  key: string;
  path: string;
  hit: CacheEntry<O> | null;
}

interface Done<O> {
  out: O | null;
  usage: AiUsage[];
  cached: boolean;
  error: string | null;
  /** When the model answered (for a cached answer, when it was first asked). */
  at: string;
}

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const CALL_TIMEOUT_MS = 120_000;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`no answer after ${ms / 1000} s`)), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}

/** One case's call. Network and 5xx errors are retried once; a 4xx (key, quota, model) stops the run. */
async function callModel<O>(
  call: (ai: Ai) => Promise<O>,
  ai: Ai,
): Promise<Omit<Done<O>, "cached" | "at">> {
  for (let attempt = 1; ; attempt++) {
    const usage: AiUsage[] = [];
    try {
      const out = await withTimeout(call(ai.withUsage((u) => usage.push(u))), CALL_TIMEOUT_MS);
      return { out, usage, error: null };
    } catch (e) {
      const text = errorText(e);
      const status = /AI error (\d{3})/.exec(text)?.[1];
      if (status?.startsWith("4"))
        throw new FatalError(`the gateway answered ${status}: ${text.slice(0, 300)}`);
      const transient =
        status?.startsWith("5") ||
        /fetch failed|ECONNRESET|ETIMEDOUT|socket|network|Unable to connect/i.test(text);
      if (transient && attempt < 2) {
        await sleep(2000);
        continue;
      }
      return { out: null, usage, error: text.slice(0, 300) };
    }
  }
}

/** Runs tasks with at most `concurrency` at once; after a failure, starts no new ones. */
async function pool(tasks: (() => Promise<void>)[], concurrency: number): Promise<void> {
  let next = 0;
  const failures: unknown[] = [];
  const worker = async () => {
    while (!failures.length && next < tasks.length) {
      const task = tasks[next++]!;
      try {
        await task();
      } catch (error) {
        failures.push(error);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, worker));
  if (failures.length) throw failures[0];
}

const resultName = (suite: string, o: Options) =>
  `${suite}__${slug(o.model)}__${slug(o.effort)}.json`;

/** Captures each case's request (no tokens), looks it up in the cache, and counts what's left. */
async function planSuite<C, O, S>(suite: Suite<C, O, S>, o: Options): Promise<Plan> {
  const { cases: all, sha256 } = suite.load();
  const cases = o.limit ? all.slice(0, o.limit) : all;
  const base = { name: suite.name, total: all.length, cases: cases.length };
  const skip = (why: string): Plan => ({
    ...base,
    uncached: 0,
    skip: why,
    execute: async () => null,
  });
  if (!all.length) return skip("no labelled cases yet");

  const items: Item<C, O>[] = [];
  for (const c of cases) {
    let request;
    try {
      request = await captureRequest((ai) => suite.call(ai, c));
    } catch (e) {
      return skip(`${suite.task} is not available in the engine yet (${errorText(e)})`);
    }
    const key = cacheKey(request, o.model, o.effort);
    const where = {
      suite: suite.name,
      model: o.model,
      effort: o.effort,
      case_id: suite.id(c),
      key,
    };
    const path = cachePath(CACHE, where);
    items.push({ c, key, path, hit: o.fresh ? null : readCache<O>(path, key) });
  }
  return {
    ...base,
    uncached: items.filter((i) => !i.hit).length,
    skip: null,
    execute: () => executeSuite(suite, items, o, { sha256, total: all.length }),
  };
}

async function executeSuite<C, O, S>(
  suite: Suite<C, O, S>,
  items: Item<C, O>[],
  o: Options,
  dataset: { sha256: string; total: number },
): Promise<SuiteResult> {
  const done: Done<O>[] = [];
  const toCall = items.filter((i) => !i.hit).length;
  let called = 0;
  await pool(
    items.map((item, i) => async () => {
      const { hit } = item;
      if (hit) {
        done[i] = {
          out: hit.output,
          usage: hit.usage,
          cached: true,
          error: null,
          at: hit.created_at,
        };
        return;
      }
      const r = await callModel((ai) => suite.call(ai, item.c), o.ai);
      const at = new Date().toISOString();
      if (r.out !== null)
        writeCache(item.path, {
          key: item.key,
          suite: suite.name,
          case_id: suite.id(item.c),
          model: o.model,
          effort: o.effort,
          created_at: at,
          output: r.out,
          usage: r.usage,
        });
      done[i] = { ...r, cached: false, at };
      const ms = r.usage.reduce((s, u) => s + u.latency_ms, 0);
      console.log(
        `  ${suite.name} ${++called}/${toCall} ${suite.id(item.c)}: ${r.error ? `error: ${r.error}` : `${(ms / 1000).toFixed(1)} s`}`,
      );
    }),
    o.concurrency,
  );

  const outcomes = items.map((item, i) => {
    const d = done[i]!;
    return { item, d, score: suite.score(item.c, d.out) };
  });
  return {
    kind: "model",
    suite: suite.name,
    task: suite.task,
    title: suite.title,
    model: o.model,
    effort: o.effort,
    // The newest answer, not the time of this run: a run from the cache rewrites the same file.
    answered_at:
      outcomes
        .map((x) => x.d.at)
        .sort()
        .at(-1) ?? "",
    dataset: {
      source: suite.source,
      sha256: dataset.sha256,
      cases: items.length,
      total: dataset.total,
    },
    partial: items.length < dataset.total,
    prices: o.prices,
    metrics: suite.metrics(
      outcomes.map((x) => x.item.c),
      outcomes.map((x) => x.score),
    ),
    usage: usageMetrics(
      outcomes.map((x) => x.d.usage),
      o.prices,
    ),
    cases: outcomes.map(({ item, d, score }) => ({
      ...suite.record(item.c, d.out, score),
      id: suite.id(item.c),
      cached: d.cached,
      error: d.error,
      usage: d.usage,
    })),
  };
}

function positive(v: string | undefined, flag: string, fallback: number | null): number | null {
  if (v === undefined) return fallback;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1) throw new UsageError(`--${flag} needs a positive integer`);
  return n;
}

/** Prices from AI_PRICE_*_PER_MTOK when set, else the engine's table (official prices, dated). */
function pricesFrom(env: Record<string, string | undefined>, model: string): Prices | null {
  const pin = env["AI_PRICE_IN_PER_MTOK"];
  const pout = env["AI_PRICE_OUT_PER_MTOK"];
  if (!pin || !pout) {
    const listed = priceOf(model);
    return listed ? { in: listed.input, out: listed.output } : null;
  }
  const prices = { in: Number(pin), out: Number(pout) };
  if (!Number.isFinite(prices.in) || !Number.isFinite(prices.out))
    throw new UsageError("AI_PRICE_IN_PER_MTOK / AI_PRICE_OUT_PER_MTOK must be numbers (USD)");
  return prices;
}

function printResult(r: SuiteResult) {
  console.log(`\n${r.title}: ${r.model}, effort ${r.effort}, ${r.dataset.cases} cases`);
  for (const m of [...r.metrics, ...r.usage])
    console.log(`  ${m.label.padEnd(34)} ${formatMetric(m)}`);
}

const FLAGS = {
  suite: { type: "string", default: "all" },
  model: { type: "string" },
  effort: { type: "string" },
  limit: { type: "string" },
  concurrency: { type: "string" },
  "max-calls": { type: "string" },
  fresh: { type: "boolean", default: false },
  "dry-run": { type: "boolean", default: false },
  report: { type: "boolean", default: false },
  help: { type: "boolean", default: false },
} as const;

function parseFlags() {
  try {
    return parseArgs({ options: FLAGS }).values;
  } catch (e) {
    throw new UsageError(errorText(e));
  }
}

async function main(): Promise<number> {
  const values = parseFlags();
  if (values.help) {
    console.log(HELP);
    return 0;
  }
  if (values.report) {
    await updateDocs(DOCS, RESULTS);
    console.log(`Regenerated ${relative(ROOT, DOCS)}`);
    return 0;
  }
  const suiteArg = values.suite;
  if (suiteArg !== "all" && !(SUITES as readonly string[]).includes(suiteArg))
    throw new UsageError(`unknown suite "${suiteArg}"`);
  const wanted: SuiteName[] = suiteArg === "all" ? [...SUITES] : [suiteArg as SuiteName];

  const env = loadEnv(ENV_FILE);
  const gateway = gatewayConfigFromEnv(env);
  const model = values.model ?? gateway.model;
  const effort = values.effort ?? env["AI_REASONING_EFFORT"] ?? "low";
  const o: Options = {
    ai: createAi(
      createCallTool({
        ...gateway,
        model,
        reasoningEffort: effort === "none" ? undefined : effort,
      }),
      model,
    ),
    model,
    effort,
    limit: positive(values.limit, "limit", null),
    concurrency: positive(values.concurrency, "concurrency", 4) ?? 4,
    fresh: values.fresh,
    prices: pricesFrom(env, model),
  };
  const maxCalls = positive(values["max-calls"], "max-calls", 120) ?? 120;

  const modelSuites = wanted.filter((s): s is ModelSuiteName => s !== "safety");
  const plans: Plan[] = [];
  for (const name of modelSuites)
    plans.push(
      await (name === "guest"
        ? planSuite(guestSuite(DATA), o)
        : name === "host"
          ? planSuite(hostSuite(DATA), o)
          : planSuite(reviewSuite(), o)),
    );

  if (plans.length) {
    console.log(`Model ${model}, effort ${effort}, via ${new URL(gateway.url).host}`);
    for (const p of plans)
      console.log(
        p.skip
          ? `  ${p.name.padEnd(8)} skipped: ${p.skip}`
          : `  ${p.name.padEnd(8)} ${p.cases} cases: ${p.cases - p.uncached} cached, ${p.uncached} to call`,
      );
  }
  const uncached = plans.reduce((n, p) => n + p.uncached, 0);
  if (plans.length) console.log(`Calls to make: ${uncached} (limit ${maxCalls})`);
  if (uncached > maxCalls) {
    console.error(`Refusing: ${uncached} calls is more than --max-calls ${maxCalls}.`);
    return 2;
  }
  if (values["dry-run"]) return 0;
  if (uncached > 0) {
    try {
      gateway.headers();
    } catch {
      console.error("No AI key: set OPENAI_API_KEY (or LOVABLE_API_KEY) in apps/web/.env.local.");
      return 2;
    }
  }

  let docsChanged = false;
  let exit = 0;
  for (const p of plans) {
    if (p.skip) continue;
    let result: SuiteResult | null;
    try {
      result = await p.execute();
    } catch (e) {
      if (!(e instanceof FatalError)) throw e;
      console.error(`\nStopped ${p.name}: ${e.message}\nAnswers received so far are cached.`);
      exit = 1;
      break;
    }
    if (!result) continue;
    const file = result.partial
      ? join(CACHE, "partial", resultName(result.suite, o))
      : join(RESULTS, resultName(result.suite, o));
    mkdirSync(dirname(file), { recursive: true });
    await writeJson(file, result);
    printResult(result);
    console.log(
      `  -> ${relative(ROOT, file)}${result.partial ? " (partial run, not in the docs)" : ""}`,
    );
    docsChanged ||= !result.partial;
  }

  if (wanted.includes("safety")) {
    // Loaded only here: it pulls in the whole engine (and its server modules).
    const { runSafety } = await import("./safety");
    const scenarios = await runSafety();
    const passed = scenarios.filter((s) => s.pass).length;
    const report: SafetyReport = { kind: "safety", passed, total: scenarios.length, scenarios };
    await writeJson(join(RESULTS, "safety.json"), report);
    console.log(`\nSafety: ${passed}/${scenarios.length} scenarios pass`);
    for (const s of scenarios)
      console.log(
        `  ${s.pass ? "pass" : "FAIL"}  ${s.id}: ${s.bookings}${s.failure ? ` (${s.failure})` : ""}`,
      );
    if (passed < scenarios.length) exit = 1;
    docsChanged = true;
  }

  if (docsChanged) {
    await updateDocs(DOCS, RESULTS);
    console.log(`\nUpdated ${relative(ROOT, DOCS)}`);
  }
  return exit;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (e: unknown) => {
    if (e instanceof UsageError) console.error(`${e.message}\n\n${HELP}`);
    else console.error(e);
    process.exitCode = e instanceof UsageError ? 2 : 1;
  },
);
