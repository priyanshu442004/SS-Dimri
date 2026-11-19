import { Navigate } from "react-router";
import { useApi } from "@shared/api";
import { Loading, ErrorNote, Empty, Btn } from "@shared/ui";

/** "Ask AI" opens the chat of the most recent analysis (each analysis has its own chat tab). */
export default function Ask() {
  const { data, error, loading } = useApi("/runs");
  if (loading) return <Loading />;
  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!data.runs.length) return <Empty icon="cfo" title="No analyses yet" action={<Btn to="/new" variant="lime" icon="plus">Analyse a company</Btn>}>Upload the four financial statements, then chat with them here.</Empty>;
  return <Navigate to={`/runs/${data.runs[0].id}/chat`} replace />;
}
