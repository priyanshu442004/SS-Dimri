import { useApi } from "@shared/api";
import { PageHeader, Section, Badge, Loading, ErrorNote } from "@shared/ui";

export default function Settings() {
  const { data, error, loading } = useApi("/settings");
  return (
    <>
      <PageHeader eyebrow="Settings" title="Settings">
        How GST Reconciliation processes documents. Runtime configuration is managed by the Agarwal &amp; Saxena administrator; keys never reach the browser.
      </PageHeader>
      {loading && <Loading />}
      {error && <ErrorNote>{error}</ErrorNote>}
      {data && (
        <div className="grid gap-5 lg:grid-cols-2">
          <Section title="AI engine" i={1} aside={<Badge tone={data.ai_configured ? "good" : "bad"} dot>{data.ai_configured ? "Connected" : "Not configured"}</Badge>}>
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 p-5 text-sm">
              <dt className="text-muted">Provider</dt><dd>{data.provider}</dd>
              <dt className="text-muted">Model</dt><dd className="font-mono text-[13px]">{data.model}</dd>
              <dt className="text-muted">Used for</dt><dd>Document-layout mapping, exception explanations, Ask AI chat</dd>
              <dt className="text-muted">Never used for</dt><dd>Calculating or changing any return figure</dd>
            </dl>
          </Section>
          <Section title="Processing & limits" i={2}>
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 p-5 text-sm">
              <dt className="text-muted">Formats</dt><dd>{data.limits.formats.join(" · ")}</dd>
              <dt className="text-muted">Max file size</dt><dd>{data.limits.maxFileMb} MB</dd>
              <dt className="text-muted">Calculations</dt><dd>Python engine on this server (deterministic)</dd>
              <dt className="text-muted">Outputs</dt><dd>GSTR-9 & 9C draft workings — PDF, Excel, JSON</dd>
              <dt className="text-muted">Version</dt><dd className="font-mono text-[13px]">{data.version}</dd>
            </dl>
          </Section>
        </div>
      )}
    </>
  );
}
