// Settings from apps/web/.env.local, the same file the app uses. Values are never printed.
import { readFileSync } from "node:fs";

/** KEY=VALUE lines; comments, blank lines and an `export ` prefix are allowed, quotes are removed. */
export function parseEnv(text: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    let value = m[2] ?? "";
    const quoted = /^(["'])(.*)\1$/.exec(value);
    if (quoted) value = quoted[2] ?? "";
    else value = value.replace(/\s+#.*$/, "");
    env[m[1]!] = value;
  }
  return env;
}

/** The env file's values with the process environment on top (an explicit `AI_MODEL=… make eval` wins). */
export function loadEnv(file: string): Record<string, string | undefined> {
  let fromFile: Record<string, string> = {};
  try {
    fromFile = parseEnv(readFileSync(file, "utf8"));
  } catch {
    // No env file: the process environment alone (enough for cached results and the safety suite).
  }
  return { ...fromFile, ...process.env };
}
