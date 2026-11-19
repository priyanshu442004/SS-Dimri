import { useApi } from "./api";
import { PageHeader, Section, Loading, ErrorNote, Badge, Icon } from "./ui";

/** Generic settings page: report email delivery + product-specific rows. */
export default function SettingsPage({ productName, rows = [], children }) {
  const { data, error, loading } = useApi("/settings");
  return (
    <>
      <PageHeader eyebrow="Settings" title="Settings">
        How {productName} delivers reports and the defaults it runs with. Delivery settings are managed by the Agarwal & Saxena administrator.
      </PageHeader>
      {loading && <Loading />}
      {error && <ErrorNote>{error}</ErrorNote>}
      {data && (
        <div className="grid gap-5 lg:grid-cols-2">
          <Section title="Report email" i={1} aside={<Badge tone={data.mailConfigured ? "good" : "bad"} dot>{data.mailConfigured ? "Active" : "Not configured"}</Badge>}>
            <div className="space-y-4 p-5 text-sm">
              <p className="text-muted">Every generated report is emailed automatically to:</p>
              <ul className="space-y-2">
                {data.recipients.map((r) => (
                  <li key={r} className="flex items-center gap-3 rounded-xl border border-ink/8 bg-white px-3.5 py-2.5">
                    <span className="grid size-8 place-items-center rounded-full bg-teal/12 text-teal-ink"><Icon name="mail" className="size-4" /></span>
                    <span className="font-mono text-[13px]">{r}</span>
                  </li>
                ))}
                {!data.recipients.length && <li className="text-rose">No recipients configured.</li>}
              </ul>
              <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 border-t border-ink/8 pt-4">
                <dt className="text-muted">Subject</dt><dd>{data.subject}</dd>
                <dt className="text-muted">Sender</dt><dd>AI Reporting System</dd>
              </dl>
            </div>
          </Section>
          <Section title="Defaults & limits" i={2}>
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 p-5 text-sm">
              {rows.map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-muted">{k}</dt><dd>{typeof v === "function" ? v(data) : v}</dd>
                </div>
              ))}
              <dt className="text-muted">Version</dt><dd className="font-mono text-[13px]">{data.version}</dd>
            </dl>
          </Section>
          {children}
        </div>
      )}
    </>
  );
}
