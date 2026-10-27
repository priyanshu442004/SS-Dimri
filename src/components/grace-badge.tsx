import { formatDateTime } from "@/lib/dates";
import type { AccessInfo } from "@/lib/domain/approval-access";
import { Badge } from "@/components/ui";

/** For approvers: how long a pending account can still be used. */
export function GraceBadge({ info }: { info: AccessInfo }) {
  if (info.state === "grace" && info.graceEndsAt) return <Badge tone="warn">Access until {formatDateTime(info.graceEndsAt)}</Badge>;
  if (info.state === "locked" && info.graceEndsAt) return <Badge tone="danger">Access paused since {formatDateTime(info.graceEndsAt)}</Badge>;
  return null;
}
