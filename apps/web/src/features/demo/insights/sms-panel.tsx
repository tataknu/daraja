/** What Noor received: each Swahili SMS on an LCD, with its English underneath. */
export function SmsPanel({ sw, en }: { sw: string[]; en: string[] }) {
  // The two arrays are parallel: line i of one translates line i of the other.
  const lines = sw.flatMap((line, i) => (line ? [{ sw: line, en: en[i] ?? "" }] : []));
  return (
    <section aria-labelledby="insights-sms" className="paper p-4 sm:p-6">
      <div className="grid grid-cols-1 gap-x-10 gap-y-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <div>
          <h3 id="insights-sms" className="text-xl font-semibold">
            What Noor received
          </h3>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            A short summary, sent to her basic phone in Swahili. The English underneath is for you
            to read along.
          </p>
        </div>
        {lines.length === 0 ? (
          <p className="text-sm text-muted-foreground">No SMS was written for this report.</p>
        ) : (
          <ol className="min-w-0 space-y-5">
            {lines.map((line, i) => (
              <li key={i} className="min-w-0">
                <div className="lcd-screen rounded-md px-4 py-3 text-xl leading-tight [overflow-wrap:anywhere]">
                  <div
                    className="mb-2 flex justify-between border-b border-lcd-ink/40 pb-1 text-base"
                    aria-hidden="true"
                  >
                    <span>▮▮▮▯ Noor</span>
                    <span>
                      SMS {i + 1}/{lines.length}
                    </span>
                  </div>
                  <p lang="sw">{line.sw}</p>
                </div>
                {line.en && (
                  <p lang="en" className="mt-2 text-sm leading-snug text-muted-foreground">
                    <span className="font-medium text-foreground">In English: </span>
                    {line.en}
                  </p>
                )}
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
