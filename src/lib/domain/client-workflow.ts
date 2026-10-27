// Client lifecycle (pure). Quick registration creates PENDING_APPROVAL; only an
// authorized administrator activates it. Rejection keeps the record + reason.
//
//   PENDING_APPROVAL ─approve─▶ ACTIVE ─hold─▶ ON_HOLD ─resume─▶ ACTIVE
//          │                      │                 │
//        reject                deactivate        deactivate
//          ▼                      ▼                 ▼
//       REJECTED ─resubmit─▶ PENDING_APPROVAL    INACTIVE ─reactivate─▶ ACTIVE

import { can, type Capability, type Role } from "@/lib/permissions";

export type ClientStatus = "DRAFT" | "PENDING_APPROVAL" | "ACTIVE" | "ON_HOLD" | "REJECTED" | "INACTIVE";
export type ClientAction = "approve" | "reject" | "hold" | "resume" | "deactivate" | "reactivate" | "resubmit";

const RULES: Record<ClientAction, { from: ClientStatus[]; to: ClientStatus; cap: Capability; label: string }> = {
  approve: { from: ["DRAFT", "PENDING_APPROVAL"], to: "ACTIVE", cap: "clients.approve", label: "Approve & activate" },
  reject: { from: ["DRAFT", "PENDING_APPROVAL"], to: "REJECTED", cap: "clients.approve", label: "Reject" },
  hold: { from: ["ACTIVE"], to: "ON_HOLD", cap: "clients.approve", label: "Put on hold" },
  resume: { from: ["ON_HOLD"], to: "ACTIVE", cap: "clients.approve", label: "Resume" },
  deactivate: { from: ["ACTIVE", "ON_HOLD"], to: "INACTIVE", cap: "clients.approve", label: "Discontinue" },
  reactivate: { from: ["INACTIVE"], to: "ACTIVE", cap: "clients.approve", label: "Reactivate" },
  resubmit: { from: ["REJECTED"], to: "PENDING_APPROVAL", cap: "clients.edit", label: "Resubmit for approval" },
};

export function clientTransition(current: ClientStatus, action: ClientAction, role: Role): ClientStatus | null {
  const r = RULES[action];
  return r.from.includes(current) && can(role, r.cap) ? r.to : null;
}

export function clientActions(current: ClientStatus, role: Role) {
  return (Object.keys(RULES) as ClientAction[])
    .filter((a) => clientTransition(current, a, role) !== null)
    .map((a) => ({ action: a, label: RULES[a].label }));
}
