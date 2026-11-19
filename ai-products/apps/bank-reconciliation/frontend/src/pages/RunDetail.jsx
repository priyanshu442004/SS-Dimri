import { useState } from "react";
import { useParams } from "react-router";
import { api, useApi } from "@shared/api";
import { Loading, ErrorNote, Btn, Empty } from "@shared/ui";
import Results from "../components/Results";

export default function RunDetail() {
  const { id } = useParams();
  const { data, error, loading, reload } = useApi(`/runs/${id}`);
  const [resending, setResending] = useState(false);

  const resend = async () => {
    setResending(true);
    try { await api(`/runs/${id}/email`, { method: "POST" }); await reload(); }
    finally { setResending(false); }
  };

  if (loading && !data) return <Loading label="Loading reconciliation…" />;
  if (error) return error.includes("not found")
    ? <Empty icon="history" title="Reconciliation not found" action={<Btn to="/runs" icon="back">All reconciliations</Btn>}>It may have been removed from this server.</Empty>
    : <ErrorNote>{error}</ErrorNote>;
  return (
    <>
      <div className="mb-5"><Btn to="/runs" variant="ghost" icon="back" className="-ml-3">All reconciliations</Btn></div>
      <Results meta={data.meta} result={data.result} onResend={resend} resending={resending} />
    </>
  );
}
