// The parts of the Metrics tab: KPI cards, the table by task, where the tokens go, and how each
// number is measured. Each takes the output of computeMetrics.
import { Fragment, type ReactNode } from "react";
import {
  AI_ERROR,
  AI_UNSURE_ACTIONS,
  HOST_ANSWER_RESOLUTIONS,
  KEYPAD_MODEL,
  PRICES,
  PRICING_SOURCE,
  priceOf,
  type Metrics,
  type UsageGroup,
} from "@daraja/engine/metrics";
import {
  count,
  fmtAvg,
  fmtDuration,
  fmtInt,
  fmtLatency,
  fmtPct,
  fmtUsd,
  sourceName,
  taskName,
} from "./format";

function Kpi({ label, value, detail }: { label: string; value: string; detail: ReactNode }) {
  return (
    // Subgrid rows line up labels, values and details across a row of cards.
    <div className="paper row-span-3 grid min-w-0 grid-rows-subgrid gap-y-1 p-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-2xl font-semibold tracking-tight sm:text-3xl">{value}</p>
      <p className="text-xs leading-snug text-muted-foreground">{detail}</p>
    </div>
  );
}

function KpiRow({
  title,
  intro,
  children,
}: {
  title: string;
  intro: ReactNode;
  children: ReactNode;
}) {
  return (
    <section>
      <h2 className="text-xl font-semibold text-primary">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{intro}</p>
      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">{children}</div>
    </section>
  );
}

export function CostKpis({ m }: { m: Metrics }) {
  const { perBooking: pb, totals } = m;
  const atLeast = pb.usage.unpricedCalls > 0;
  return (
    <KpiRow
      title="What a booking costs"
      intro={
        pb.bookings
          ? `Averages over ${count(pb.bookings, "booking")}${pb.withoutAiCalls ? ` (leaving out ${count(pb.withoutAiCalls, "older booking")} with no logged AI calls)` : ""}. Each one sends Noor ${fmtAvg(pb.smsToHost)} SMS and the guest ${fmtAvg(pb.emailsToGuest)} emails.`
          : "No bookings yet: per-booking numbers start with the first one."
      }
    >
      <Kpi
        label="AI cost per booking"
        value={fmtUsd(pb.cost, atLeast)}
        detail={
          !pb.bookings
            ? "No bookings yet"
            : pb.usage.cost === null
              ? "Prices not set"
              : `${fmtUsd(pb.usage.cost, atLeast)} for all bookings`
        }
      />
      <Kpi
        label="AI calls per booking"
        value={fmtAvg(pb.aiCalls)}
        detail={`${count(totals.calls, "call")} in all · ${fmtPct(totals.failureRate)} failed`}
      />
      <Kpi
        label="Tokens per booking"
        value={fmtInt(pb.tokens)}
        detail={`${fmtInt(pb.inputTokens)} in · ${fmtInt(pb.outputTokens)} out`}
      />
      <Kpi
        label="Median AI latency"
        value={fmtLatency(totals.latency.p50)}
        detail={`p95 ${fmtLatency(totals.latency.p95)} · mean ${fmtLatency(totals.latency.avg)}`}
      />
    </KpiRow>
  );
}

export function BehaviourKpis({ m }: { m: Metrics }) {
  const { handoff, keypad, timeToAnswer: wait, referrals } = m;
  return (
    <KpiRow
      title="How it behaves"
      intro="When a person has to step in, how often no AI is needed, and how fast Noor answers."
    >
      <Kpi
        label="AI-unsure hand-off rate"
        value={fmtPct(handoff.rate)}
        detail={`${fmtInt(handoff.unsure)} of ${count(handoff.aiRead, "message")} the AI read${handoff.errors ? `, ${fmtInt(handoff.errors)} failed` : ""}`}
      />
      <Kpi
        label="Keypad replies without AI"
        value={fmtPct(keypad.share)}
        detail={`${fmtInt(keypad.withoutAi)} of Noor's ${count(keypad.hostReplies, "reply", "replies")}`}
      />
      <Kpi
        label="Median time to Noor's answer"
        value={fmtDuration(wait.p50)}
        detail={`p90 ${fmtDuration(wait.p90)} · ${count(wait.answered, "answer")}${wait.expired ? `, ${fmtInt(wait.expired)} expired` : ""}`}
      />
      <Kpi
        label="Referral bookings"
        value={fmtInt(referrals.referred)}
        detail={`${fmtPct(referrals.share)} of ${count(referrals.bookings, "booking")}`}
      />
    </KpiRow>
  );
}

const perCall = (n: number | null, calls: number) => (n === null || !calls ? null : n / calls);

export function TaskTable({ m }: { m: Metrics }) {
  // Share of cost once there is a cost; until then, share of tokens.
  const byCost = !!m.totals.cost;
  const rows = [
    ...m.byTask.map((g) => ({ ...g, name: taskName(g.key), total: false })),
    { ...m.totals, key: "", name: "All tasks", tokenShare: 1, costShare: 1, total: true },
  ];
  return (
    <section className="paper min-w-0 overflow-hidden lg:col-span-3">
      <div className="border-b border-border px-4 py-3 sm:px-5">
        <h2 className="text-lg font-semibold text-primary">By task</h2>
        <p className="text-xs text-muted-foreground">
          Each kind of AI call. Tokens, latency and cost are averages per call; the share is of all
          calls.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary/60 text-xs text-muted-foreground">
              <th className="py-2 pl-4 pr-2 text-left font-medium sm:pl-5">Task</th>
              <th className="px-2 py-2 text-right font-medium">Calls</th>
              <th className="px-2 py-2 text-right font-medium">
                <span className="sm:hidden">In</span>
                <span className="hidden sm:inline">Tokens in</span>
              </th>
              <th className="px-2 py-2 text-right font-medium">
                <span className="sm:hidden">Out</span>
                <span className="hidden sm:inline">Tokens out</span>
              </th>
              <th className="hidden px-2 py-2 text-right font-medium sm:table-cell">Latency</th>
              <th className="hidden px-2 py-2 text-right font-medium md:table-cell">Cost</th>
              <th className="py-2 pl-2 pr-4 text-right font-medium sm:pr-5">
                <span className="sm:hidden">Share</span>
                <span className="hidden sm:inline">Share of {byCost ? "cost" : "tokens"}</span>
              </th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {rows.map((g) => (
              <tr
                key={g.total ? "total" : `task:${g.key}`}
                className={
                  g.total
                    ? "border-t border-border bg-secondary/30 font-medium"
                    : "border-b border-border/50 last:border-0 hover:bg-secondary/30"
                }
              >
                <td className="py-2.5 pl-4 pr-2 align-top sm:pl-5">
                  <div>{g.name}</div>
                  {!g.total && (
                    <code className="block text-[11px] text-muted-foreground [overflow-wrap:anywhere]">
                      {g.key}
                    </code>
                  )}
                  {g.failed > 0 && (
                    <div className="text-[11px] text-destructive">{fmtInt(g.failed)} failed</div>
                  )}
                </td>
                <td className="px-2 py-2.5 text-right align-top">{fmtInt(g.calls)}</td>
                <td className="px-2 py-2.5 text-right align-top">
                  {fmtInt(perCall(g.inputTokens, g.calls))}
                </td>
                <td className="px-2 py-2.5 text-right align-top">
                  {fmtInt(perCall(g.outputTokens, g.calls))}
                </td>
                <td className="hidden px-2 py-2.5 text-right align-top sm:table-cell">
                  {fmtLatency(g.latency.avg)}
                </td>
                <td className="hidden px-2 py-2.5 text-right align-top md:table-cell">
                  {fmtUsd(perCall(g.cost, g.calls), g.unpricedCalls > 0)}
                </td>
                <td className="py-2.5 pl-2 pr-4 text-right align-top sm:pr-5">
                  {fmtPct(byCost ? g.costShare : g.tokenShare)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

const breakdown = (g: UsageGroup) =>
  [
    count(g.calls, "call"),
    `${fmtInt(g.inputTokens)} in (${fmtInt(g.cachedTokens)} cached)`,
    `${fmtInt(g.outputTokens)} out (${fmtInt(g.reasoningTokens)} reasoning)`,
    ...(g.cost === null ? [] : [fmtUsd(g.cost, g.unpricedCalls > 0)]),
  ].join(" · ");

function Bars({
  label,
  groups,
  name,
}: {
  label: string;
  groups: UsageGroup[];
  name: (key: string) => string;
}) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      <ul className="mt-2 space-y-3">
        {groups.map((g) => (
          <li key={g.key} title={`${name(g.key)}: ${breakdown(g)}`}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 truncate">{name(g.key)}</span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {fmtInt(g.tokens)} · {fmtPct(g.tokenShare)}
              </span>
            </div>
            <div className="mt-1 h-2 bg-secondary">
              <div
                className="h-full rounded-r-[4px] bg-chart-1"
                style={{ width: `${(g.tokenShare ?? 0) * 100}%`, minWidth: g.tokens ? 2 : 0 }}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function TokenBars({ m }: { m: Metrics }) {
  return (
    <section className="paper min-w-0 overflow-hidden lg:col-span-2">
      <div className="border-b border-border px-4 py-3 sm:px-5">
        <h2 className="text-lg font-semibold text-primary">Where the tokens go</h2>
        <p className="text-xs text-muted-foreground">
          Input and output tokens of every AI call, {fmtInt(m.totals.tokens)} in all. Hover a bar
          for its breakdown.
        </p>
      </div>
      <div className="space-y-5 px-4 py-4 sm:px-5">
        <Bars label="By task" groups={m.byTask} name={taskName} />
        <Bars label="By source" groups={m.bySource} name={sourceName} />
      </div>
    </section>
  );
}

function Code({ children }: { children: string }) {
  return (
    <code className="rounded bg-secondary px-1 py-px text-[12px] text-foreground">{children}</code>
  );
}

function CodeList({ items }: { items: readonly string[] }) {
  return items.map((s, i) => (
    <Fragment key={s}>
      {i > 0 && ", "}
      <Code>{s}</Code>
    </Fragment>
  ));
}

const perMillion = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 3,
});
const checked = new Date(`${PRICING_SOURCE.checked}T00:00:00Z`).toLocaleDateString("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

function Prices({ m }: { m: Metrics }) {
  const priced = m.models.flatMap((model) => {
    const p = priceOf(model, PRICES);
    return p ? [{ model, p }] : [];
  });
  return (
    <>
      {priced.map(({ model, p }) => (
        <Fragment key={model}>
          <Code>{model}</Code>: {perMillion.format(p.input)} input,{" "}
          {perMillion.format(p.cachedInput)} cached input, {perMillion.format(p.output)} output per
          1M tokens.{" "}
        </Fragment>
      ))}
      {m.unpricedModels.length > 0 && (
        <>
          Prices not set for <CodeList items={m.unpricedModels} />, so their cost isn't
          counted.{" "}
        </>
      )}
      OpenAI list prices, {PRICING_SOURCE.tier} tier, from{" "}
      <a
        href={PRICING_SOURCE.url}
        target="_blank"
        rel="noreferrer"
        className="underline underline-offset-2 hover:text-foreground"
      >
        {new URL(PRICING_SOURCE.url).host}
      </a>
      , checked {checked}. Reasoning tokens are billed as output.
    </>
  );
}

export function HowMeasured({ m }: { m: Metrics }) {
  const off = m.notOnBooking;
  const lines: [string, ReactNode][] = [
    [
      "AI cost per booking",
      <>
        Cost of the AI calls tied to a booking (by the call, or by its message) ÷ the bookings with
        such calls, whatever their status. Every booking starts with a guest email the AI reads, so
        only bookings from before calls were logged are left out.
        {off.calls > 0 &&
          ` Left out: ${count(off.calls, "call")} tied to no booking (such as review insights and imports)${off.cost === null ? "" : `, ${fmtUsd(off.cost, off.unpricedCalls > 0)}`}.`}
      </>,
    ],
    [
      "AI calls per booking",
      "AI calls tied to a booking ÷ those bookings. SMS to Noor and emails to the guest are counted over the same bookings.",
    ],
    [
      "Tokens per booking",
      "Input + output tokens of those calls ÷ bookings. Cached tokens are part of the input, reasoning tokens part of the output.",
    ],
    [
      "Median AI latency",
      "From request to last streamed token, for each AI call that succeeded. p95: 95% of calls were faster.",
    ],
    [
      "AI-unsure hand-off rate",
      <>
        Inbound messages where the AI was unsure or failed (
        <CodeList items={[...AI_UNSURE_ACTIONS, `${AI_ERROR}: …`]} />) ÷ inbound messages the AI
        read. Requests and questions that go to Noor by design don't count.
      </>,
    ],
    [
      "Keypad replies without AI",
      <>
        Noor's SMS replies understood by code alone (decision model <Code>{KEYPAD_MODEL}</Code>: 1,
        2, 3, a booking code with a date, or yes/no to a read-back) ÷ all her replies.
      </>,
    ],
    [
      "Time to Noor's answer",
      <>
        From the booking-request SMS to the reply that resolved it (
        <CodeList items={HOST_ANSWER_RESOLUTIONS} />
        ): median and p90. Expired and superseded requests are left out.
      </>,
    ],
    [
      "Referral bookings",
      <>
        Bookings with <Code>referred_by</Code> set, that is brought in by a past guest's referral
        code.
      </>,
    ],
    ["Prices", <Prices m={m} />],
  ];
  return (
    <section className="paper p-4 sm:p-5">
      <h2 className="text-lg font-semibold text-primary">How these are measured</h2>
      <p className="text-xs text-muted-foreground">
        Every AI call is logged with its task, model, tokens and latency (table{" "}
        <Code>ai_calls</Code>); the rest comes from bookings, messages, decisions and prompts.
      </p>
      <dl className="mt-4 grid gap-x-6 gap-y-3 text-sm md:grid-cols-[13rem_minmax(0,1fr)]">
        {lines.map(([term, definition]) => (
          <Fragment key={term}>
            <dt className="font-medium">{term}</dt>
            <dd className="-mt-2 leading-relaxed text-muted-foreground md:mt-0">{definition}</dd>
          </Fragment>
        ))}
      </dl>
    </section>
  );
}

export function EmptyState() {
  return (
    <div className="paper px-6 py-12 text-center">
      <h2 className="text-xl font-semibold text-primary">No AI calls yet</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
        Send a guest email from the Conversation tab. Every AI call is logged with its tokens and
        latency, and the numbers show up here as they come in.
      </p>
    </div>
  );
}
