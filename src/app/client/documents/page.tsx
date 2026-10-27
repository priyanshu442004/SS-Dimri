import { prisma } from "@/lib/db";
import { requireClientContext } from "@/lib/session";
import { formatDate } from "@/lib/dates";
import { Card, PageHeader } from "@/components/ui";
import { uploadDocumentAction } from "../actions";
import { DocumentForm } from "../forms";
import { FolderOpen } from "lucide-react";

export default async function ClientDocuments() {
  const ctx = await requireClientContext();
  const docs = await prisma.clientDocument.findMany({
    where: { clientId: ctx.client.id },
    orderBy: { createdAt: "desc" },
    select: { id: true, title: true, type: true, createdAt: true, file: { select: { id: true, originalFileName: true } } },
  });
  return (
    <>
      <PageHeader icon={<FolderOpen />} title="Documents" description="Documents you have shared with us. Files are stored privately and are visible only to you and authorised staff." />
      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <Card title={`Your documents (${docs.length})`}>
          {docs.length === 0 ? <p className="text-sm text-muted">No documents yet.</p> : (
            <ul className="divide-y divide-line text-sm">
              {docs.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="min-w-0"><span className="block truncate">{d.title ?? d.file.originalFileName}</span><span className="text-xs text-muted">{formatDate(d.createdAt)}</span></span>
                  <a href={`/api/files/${d.file.id}`} target="_blank" rel="noopener noreferrer" className="shrink-0 font-medium text-brand-700 hover:underline">View</a>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Upload a document"><DocumentForm action={uploadDocumentAction} /></Card>
      </div>
    </>
  );
}
