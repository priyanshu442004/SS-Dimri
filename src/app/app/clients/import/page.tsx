import { FileUp } from "lucide-react";
import { can } from "@/lib/permissions";
import { requireCapability } from "@/lib/session";
import { PageHeader } from "@/components/ui";
import { ImportFlow } from "./import-flow";

export default async function ImportClientsPage() {
  const ctx = await requireCapability("clients.import");
  return (
    <>
      <PageHeader
        icon={<FileUp />}
        title="Import clients from Excel"
        back={{ href: "/app/clients", label: "Clients" }}
        description="Bring your whole client list in at once. You see exactly what will happen before anything is saved."
      />
      <ImportFlow canApprove={can(ctx, "clients.approve")} />
    </>
  );
}
