import { FileUp } from "lucide-react";
import { requireCapability } from "@/lib/session";
import { PageHeader } from "@/components/ui";
import { AllocationImportFlow } from "./import-flow";

export default async function ImportAllocationsPage() {
  await requireCapability("allocations.manage");
  return (
    <>
      <PageHeader
        icon={<FileUp />}
        title="Import team allocation"
        back={{ href: "/app/allocations", label: "Team allocation" }}
        description="Allocate many team members to clients at once from the firm's Team Allocation sheet. You see every row's result before anything is saved."
      />
      <AllocationImportFlow />
    </>
  );
}
