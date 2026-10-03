#!/usr/bin/env node
// End-to-end test against the local stack, through the real webhooks:
//   guest email (German) -> AI classifies -> booking PENDING_NOOR -> Noor gets a Swahili SMS
//   -> Noor replies "B<id> 1" (Twilio-signed) -> booking CONFIRMED -> guest gets a German email
//   -> cron hook runs.
// Usage: node scripts/e2e-local.mjs [--serve dev|worker]   (make e2e / make e2e-worker)
import { spawn } from "node:child_process";
import { createHmac, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

const ENV_FILE = "apps/web/.env.local";
if (!existsSync(ENV_FILE)) fail(`${ENV_FILE} missing: run \`make env\` first`);
const env = Object.fromEntries(
  readFileSync(ENV_FILE, "utf8")
    .split("\n")
    .filter((l) => /^[A-Z0-9_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
const serve = process.argv.includes("--serve") ? process.argv[process.argv.indexOf("--serve") + 1] : "none";
const BASE = process.env.BASE_URL ?? (serve === "worker" ? "http://localhost:8787" : "http://localhost:8080");
const NOOR = "+255700000001"; // seeded host contact
let server;
const results = [];

function fail(msg) {
  console.error(`FAIL  ${msg}`);
  server?.kill("SIGTERM");
  process.exit(1);
}
function check(name, ok, detail = "") {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function rest(path) {
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  if (!r.ok) fail(`REST ${path}: ${r.status} ${await r.text()}`);
  return r.json();
}

async function waitFor(what, fn, timeoutMs = 60000) {
  const t0 = Date.now();
  for (;;) {
    const v = await fn().catch(() => null);
    if (v) return v;
    if (Date.now() - t0 > timeoutMs) fail(`timed out waiting for ${what}`);
    await sleep(1000);
  }
}

async function startServer() {
  if (serve === "none") return;
  const [cmd, args] =
    serve === "worker"
      ? ["npx", ["--yes", "wrangler@4", "dev", "--config", "apps/web/.output/server/wrangler.json", "--port", "8787", "--local"]]
      : ["npx", ["--yes", "bun@1", "run", "--cwd", "apps/web", "dev"]];
  console.log(`starting ${serve} server: ${cmd} ${args.join(" ")}`);
  // Server output is kept quiet and only shown if the server fails to come up.
  let log = "";
  server = spawn(cmd, args, { env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"], detached: true });
  server.stdout.on("data", (d) => (log += d));
  server.stderr.on("data", (d) => (log += d));
  server.on("exit", (code) => code && !results.length && console.error(log.slice(-3000)));
  await waitFor(`${BASE} to answer`, async () => (await fetch(BASE)).status < 500, 120000);
}

function twilioSignature(url, params) {
  const payload = url + Object.keys(params).sort().map((k) => k + params[k]).join("");
  return createHmac("sha1", env.TWILIO_AUTH_TOKEN).update(payload).digest("base64");
}

async function main() {
  await startServer();
  console.log(`target: ${BASE}\n`);

  // 1. A guest emails in German (Postmark webhook, basic auth).
  const email = `e2e-${Date.now()}@example.de`;
  const text =
    "Hallo! Wir sind 3 Personen und möchten am Samstag, 10. Oktober, morgens die Kaffeetour machen. Viele Grüße, Lena";
  const auth = "Basic " + Buffer.from(`${env.POSTMARK_INBOUND_USER}:${env.POSTMARK_INBOUND_PASS}`).toString("base64");
  const r1 = await fetch(`${BASE}/api/public/inbound-email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: auth },
    body: JSON.stringify({ From: email, FromName: "Lena Schulz", TextBody: text, MessageID: randomUUID(), Subject: "Kaffeetour" }),
  });
  check("email webhook accepted", r1.status === 200, `HTTP ${r1.status}`);

  const [guest] = await waitFor("guest contact", async () => {
    const rows = await rest(`contacts?email=eq.${encodeURIComponent(email)}&select=id,language`);
    return rows.length ? rows : null;
  });
  const booking = await waitFor("booking", async () => {
    const rows = await rest(`bookings?guest_id=eq.${guest.id}&select=*`);
    return rows[0]?.status && rows[0].status !== "INCOMPLETE" ? rows[0] : null;
  });
  check("guest language detected as German", guest.language === "de", guest.language);
  check("booking waits for Noor", booking.status === "PENDING_NOOR", booking.status);
  check("party size and slot extracted", booking.party_size === 3 && booking.slot === "09:00", `${booking.party_size} ppl ${booking.slot} ${booking.date_from}`);

  const noorMsgs = () => rest(`messages?booking_id=eq.${booking.id}&direction=eq.out&channel=eq.sms&order=created_at&select=text_original`);
  const ask = (await noorMsgs())[0]?.text_original ?? "";
  check("Noor got a Swahili approval SMS", ask.includes(`B${booking.id}`) && ask.includes("1=Ndiyo"), ask);

  // 2. Noor approves from her basic phone (Twilio webhook, signed).
  const url = `${BASE}/api/public/inbound-sms`;
  const params = { From: NOOR, Body: `B${booking.id} 1`, MessageSid: `SM${randomUUID().replace(/-/g, "")}` };
  const r2 = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "X-Twilio-Signature": twilioSignature(url, params) },
    body: new URLSearchParams(params),
  });
  check("SMS webhook accepted Noor's reply", r2.status === 200, `HTTP ${r2.status}`);

  const confirmed = await waitFor("confirmation", async () => {
    const [b] = await rest(`bookings?id=eq.${booking.id}&select=status`);
    return b.status === "CONFIRMED" ? b : null;
  });
  check("booking confirmed by Noor", confirmed.status === "CONFIRMED");
  const emails = await rest(`messages?booking_id=eq.${booking.id}&direction=eq.out&channel=eq.email&order=created_at&select=text_original,lang`);
  const last = emails.at(-1);
  check("guest got a confirmation email in German", !!last && last.lang === "de" && last.text_original.includes(`B${booking.id}`), last?.text_original.slice(0, 80));

  // 3. The cron hook runs with its secret, and refuses without it.
  const r3 = await fetch(`${BASE}/api/public/hooks/run-timers`, { method: "POST", headers: { Authorization: `Bearer ${env.LOVABLE_CRON_SECRET}` } });
  const r4 = await fetch(`${BASE}/api/public/hooks/run-timers`, { method: "POST" });
  check("cron hook runs with its secret", r3.status === 200, `HTTP ${r3.status}`);
  check("cron hook refuses without it", r4.status === 401, `HTTP ${r4.status}`);

  console.log("\nTranscript:");
  for (const m of await rest(`messages?booking_id=eq.${booking.id}&order=created_at&select=direction,channel,text_original`)) {
    const who = m.channel === "sms" ? "Noor " : "guest";
    console.log(`  ${m.direction === "in" ? "<-" : "->"} ${who} ${m.channel.padEnd(5)} ${m.text_original.replace(/\s+/g, " ").slice(0, 110)}`);
  }
}

main()
  .catch((e) => fail(e.stack ?? String(e)))
  .finally(() => {
    if (server) process.kill(-server.pid, "SIGTERM");
    const passed = results.filter(Boolean).length;
    console.log(`\n${passed}/${results.length} checks passed`);
    process.exitCode = passed === results.length && results.length ? 0 : 1;
  });
