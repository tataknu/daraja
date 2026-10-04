import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { InsightReport } from "@daraja/engine";
import { parseReport } from "./report";
import { ReportView } from "./report-view";
import { NoReportState, NoReviewsState } from "./states";

const quote = (lang: string, text: string, en: string, id = "f") => ({
  feedback_id: id,
  lang,
  quote: text,
  quote_en: en,
});

function fixture(over: Record<string, unknown> = {}): InsightReport {
  const report = parseReport({
    review_count: 9,
    sentiment: { positive: 7, neutral: 1, negative: 1 },
    keep: [
      {
        key: "host",
        label_en: "Noor's warmth and storytelling",
        label_sw: "Ukarimu wa Noor na hadithi zake",
        count: 7,
        quotes: [
          quote("de", "Noor erklärt alles sehr lebendig", "Noor explains everything very vividly"),
          quote("en", "Noor is a wonderful storyteller", "Noor is a wonderful storyteller"),
        ],
      },
    ],
    improve: [
      {
        key: "access",
        label_en: "Finding the farm",
        label_sw: "Kupata shamba kwa urahisi",
        count: 4,
        quotes: [quote("ja", "案内の看板があると助かります", "a guide sign would help")],
      },
    ],
    next: [],
    sms_sw: ["Maoni ya wageni 9: wanapenda ukarimu wako (7)."],
    sms_en: ["Feedback from 9 visitors: they love your welcome (7)."],
    dropped_quotes: 2,
    generated_at: "2026-10-03T10:00:00.000Z",
    ...over,
  });
  if (!report) throw new Error("fixture is not a report");
  return report;
}

describe("ReportView", () => {
  it("answers the three questions, with counts and quotes", () => {
    render(<ReportView report={fixture()} smsFallback={[]} newReviews={0} />);
    for (const name of ["Keep doing", "Improve", "Build next"]) {
      expect(screen.getByRole("heading", { name })).toBeInTheDocument();
    }
    const keep = within(screen.getByRole("region", { name: "Keep doing" }));
    expect(keep.getByRole("heading", { name: "Noor's warmth and storytelling" })).toBeVisible();
    expect(keep.getByText("Ukarimu wa Noor na hadithi zake")).toHaveAttribute("lang", "sw");
    expect(keep.getByText((_, el) => el?.textContent === "7 of 9 reviews")).toBeVisible();
    expect(keep.getByText("German")).toBeVisible();
    expect(keep.getByText("“Noor erklärt alles sehr lebendig”")).toHaveAttribute("lang", "de");
    expect(keep.getByText(/Noor explains everything very vividly/)).toBeVisible();
  });

  it("gives an English quote no second line", () => {
    render(<ReportView report={fixture()} smsFallback={[]} newReviews={0} />);
    expect(screen.getAllByText(/Noor is a wonderful storyteller/)).toHaveLength(1);
  });

  it("says so when a list is empty", () => {
    render(<ReportView report={fixture()} smsFallback={[]} newReviews={0} />);
    const next = within(screen.getByRole("region", { name: "Build next" }));
    expect(next.getByText("No suggestions came up in these reviews.")).toBeVisible();
  });

  it("shows what Noor received, each Swahili line with its English", () => {
    render(<ReportView report={fixture()} smsFallback={[]} newReviews={0} />);
    const sms = within(screen.getByRole("region", { name: "What Noor received" }));
    expect(sms.getByText(/Maoni ya wageni 9/)).toHaveAttribute("lang", "sw");
    expect(sms.getByText(/Feedback from 9 visitors/)).toBeVisible();
  });

  it("falls back to the SMS stored with the report", () => {
    render(
      <ReportView
        report={fixture({ sms_sw: [], sms_en: [] })}
        smsFallback={["Habari za mwezi huu."]}
        newReviews={0}
      />,
    );
    expect(screen.getByText("Habari za mwezi huu.")).toBeVisible();
  });

  it("explains how it was made, including what was dropped", () => {
    render(<ReportView report={fixture()} smsFallback={[]} newReviews={0} />);
    const how = within(screen.getByRole("region", { name: "How this report is made" }));
    expect(how.getByText(/Counted in code/)).toBeVisible();
    expect(how.getByText(/The AI extracts and phrases/)).toBeVisible();
    expect(how.getByText(/2 quotes the AI returned were not found/)).toBeVisible();
    expect(how.getByText((_, el) => el?.textContent === "3 shown")).toBeVisible();
    expect(how.getByText((_, el) => el?.textContent === "2 dropped")).toBeVisible();
  });

  it("says when nothing had to be dropped", () => {
    render(<ReportView report={fixture({ dropped_quotes: 0 })} smsFallback={[]} newReviews={0} />);
    expect(screen.getByText(/None of the quotes the AI returned had to be dropped/)).toBeVisible();
  });

  it("flags reviews that arrived after the report", () => {
    const { rerender } = render(<ReportView report={fixture()} smsFallback={[]} newReviews={0} />);
    expect(screen.queryByText(/arrived after this report/)).not.toBeInTheDocument();
    rerender(<ReportView report={fixture()} smsFallback={[]} newReviews={2} />);
    expect(screen.getByRole("status")).toHaveTextContent(
      "2 reviews arrived after this report was written. Generate insights to include them.",
    );
    rerender(<ReportView report={fixture()} smsFallback={[]} newReviews={1} />);
    expect(screen.getByRole("status")).toHaveTextContent(
      "1 review arrived after this report was written. Generate insights to include it.",
    );
  });

  it("copes with a report that has nothing in it", () => {
    const empty = parseReport({}, 0);
    if (!empty) throw new Error("expected a report");
    render(<ReportView report={empty} smsFallback={[]} newReviews={0} />);
    expect(screen.getByText("No SMS was written for this report.")).toBeVisible();
    expect(screen.getByText("No favourites came up in these reviews.")).toBeVisible();
  });
});

describe("empty states", () => {
  it("offers to load sample reviews when there are none", () => {
    const onLoadSamples = vi.fn();
    render(<NoReviewsState busy={false} onLoadSamples={onLoadSamples} />);
    expect(screen.getByRole("heading", { name: "Nothing to summarise yet" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Load sample reviews" }));
    expect(onLoadSamples).toHaveBeenCalledOnce();
  });

  it("offers to generate insights when reviews are waiting", () => {
    const onGenerate = vi.fn();
    const corpus = { total: 11, guest: 4, sample: 7, languages: 9 };
    render(<NoReportState corpus={corpus} busy={false} onGenerate={onGenerate} />);
    expect(screen.getByText(/11 reviews in 9 languages are waiting/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Generate insights" }));
    expect(onGenerate).toHaveBeenCalledOnce();
  });

  it("disables the offer while something is running", () => {
    render(<NoReviewsState busy onLoadSamples={() => {}} />);
    expect(screen.getByRole("button", { name: "Load sample reviews" })).toBeDisabled();
  });
});
