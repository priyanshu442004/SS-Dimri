import { PageHeader, Section, Faq, Steps, Btn, Icon } from "@shared/ui";

const S = `${import.meta.env.BASE_URL}samples/`;

export default function Help() {
  return (
    <>
      <PageHeader eyebrow="Help & documents" title="How Financial Statement Analysis works" actions={<Btn to="/new" icon="plus">New analysis</Btn>}>
        What to upload, how the health score is built, and how the chat answers.
      </PageHeader>
      <Steps items={[["Upload in order", "Balance Sheet → P&L → Cash Flow → Ratio Analysis (text-based PDFs)."], ["Extract & check", "DeepSeek reads the line items; totals are checked (e.g. PAT = PBT − tax)."], ["Score", "Six dimensions rated; ratios from the auditor's note, computed if absent."], ["Report & chat", "PDF emailed automatically; chat answers from the documents."]]} />
      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <Section title="The health score" i={1}>
          <div className="space-y-3 p-5 text-sm">
            <p className="text-muted">Each dimension is rated, then the average of the points gives the score out of 100.</p>
            <table className="w-full"><tbody className="divide-y divide-ink/6">
              {[["Good", "90", "Healthy level and improving"], ["Watch", "77", "Acceptable but one indicator deteriorating"], ["Mixed", "64", "Some indicators up, others down"], ["Low", "45", "Below safe thresholds (e.g. current ratio < 1, DSCR < 1)"]].map(([s, p, d]) => (
                <tr key={s}><td className="py-2 font-medium">{s}</td><td className="py-2 font-mono">{p}</td><td className="py-2 text-muted">{d}</td></tr>
              ))}
            </tbody></table>
            <p className="text-muted">75+ = low risk · 50–74 = moderate risk · below 50 = high risk.</p>
          </div>
        </Section>
        <Section title="Sample statements" i={2}>
          <div className="p-5 text-sm">
            <p className="text-muted">A sample company's audited statements — download all four and upload them in order to see a full analysis.</p>
            <ul className="mt-4 grid grid-cols-2 gap-2">
              {[["balance_sheet", "Balance Sheet"], ["profit_and_loss", "Profit & Loss"], ["cash_flow", "Cash Flow"], ["ratio_analysis", "Ratio Analysis"]].map(([f, l], i) => (
                <li key={f}><a href={`${S}${f}.pdf`} download className="flex items-center gap-2 rounded-lg border border-ink/10 bg-white px-3 py-2.5 hover:border-ink/30"><span className="font-mono text-[11px] text-muted">0{i + 1}</span><Icon name="file" className="size-4 text-muted" />{l}</a></li>
              ))}
            </ul>
          </div>
        </Section>
      </div>
      <h2 className="mb-3 mt-10 text-xl font-medium">Questions</h2>
      <Faq items={[
        ["Why must all four documents be uploaded?", "The report combines all of them: growth and margins from the P&L, funding and liquidity from the Balance Sheet, cash burn from the Cash Flow, and audited ratios from the ratio note."],
        ["Is the AI calculating the ratios?", "No. DeepSeek only reads the figures from the PDFs. Every ratio, score and sentence in the report is computed by code, so the same documents always give the same report."],
        ["How does the chat know the answers?", "Each question is answered with the four statements and the computed metrics as context. Answers name the statement a number comes from; general CFO guidance is labelled as such."],
        ["Who receives the email?", "The recipients listed in Settings receive the PDF report as soon as the four documents are analysed."],
        ["Can I upload scanned PDFs?", "Not yet — the PDFs need a text layer (exported from accounting software or a digital audit report)."],
      ]} />
    </>
  );
}
