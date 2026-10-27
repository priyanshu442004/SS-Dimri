// Task lifecycle and maker/checker rules (pure; enforced by the task service).
//
//   PENDING ──assign──▶ ASSIGNED ──start──▶ IN_PROGRESS ──submit──▶ PENDING_REVIEW
//                                    ▲            │  ▲                 │      │
//                                    │          hold │               approve  request_changes
//                                    │            ▼  │                 ▼      ▼
//                                    └─────── ON_HOLD            COMPLETED  CHANGES_REQUESTED ─start─▶ IN_PROGRESS
//   ASSIGNED/IN_PROGRESS/CHANGES_REQUESTED ──wait_client / wait_team──▶ AWAITING_CLIENT / AWAITING_TEAM_MEMBER ─start─▶ IN_PROGRESS
//   any open state ──cancel──▶ CANCELLED;  COMPLETED/CANCELLED ──reopen──▶ IN_PROGRESS
//
// "Overdue" is not a status: it is derived from due_at (see derived.ts).

import type { Role } from "@/lib/permissions";
import { can } from "@/lib/permissions";

export type TaskStatus =
  | "PENDING"
  | "ASSIGNED"
  | "IN_PROGRESS"
  | "ON_HOLD"
  | "PENDING_REVIEW"
  | "CHANGES_REQUESTED"
  | "AWAITING_CLIENT"
  | "AWAITING_TEAM_MEMBER"
  | "COMPLETED"
  | "CANCELLED";

export type TaskAction = "start" | "hold" | "wait_client" | "wait_team" | "submit" | "approve" | "request_changes" | "cancel" | "reopen";

const TRANSITIONS: Record<TaskAction, { from: TaskStatus[]; to: TaskStatus }> = {
  start: { from: ["PENDING", "ASSIGNED", "ON_HOLD", "CHANGES_REQUESTED", "AWAITING_CLIENT", "AWAITING_TEAM_MEMBER"], to: "IN_PROGRESS" },
  hold: { from: ["ASSIGNED", "IN_PROGRESS"], to: "ON_HOLD" },
  wait_client: { from: ["ASSIGNED", "IN_PROGRESS", "CHANGES_REQUESTED"], to: "AWAITING_CLIENT" },
  wait_team: { from: ["ASSIGNED", "IN_PROGRESS", "CHANGES_REQUESTED"], to: "AWAITING_TEAM_MEMBER" },
  submit: { from: ["IN_PROGRESS", "CHANGES_REQUESTED"], to: "PENDING_REVIEW" },
  approve: { from: ["PENDING_REVIEW"], to: "COMPLETED" },
  request_changes: { from: ["PENDING_REVIEW"], to: "CHANGES_REQUESTED" },
  cancel: { from: ["PENDING", "ASSIGNED", "IN_PROGRESS", "ON_HOLD", "PENDING_REVIEW", "CHANGES_REQUESTED", "AWAITING_CLIENT", "AWAITING_TEAM_MEMBER"], to: "CANCELLED" },
  reopen: { from: ["COMPLETED", "CANCELLED"], to: "IN_PROGRESS" },
};

export const TASK_ACTION_LABELS: Record<TaskAction, string> = {
  start: "Start / resume work",
  hold: "Put on hold",
  wait_client: "Waiting for client",
  wait_team: "Waiting for team member",
  submit: "Submit for review",
  approve: "Approve (checker)",
  request_changes: "Request changes",
  cancel: "Cancel task",
  reopen: "Reopen",
};

export const OPEN_STATUSES: TaskStatus[] = ["PENDING", "ASSIGNED", "IN_PROGRESS", "ON_HOLD", "PENDING_REVIEW", "CHANGES_REQUESTED", "AWAITING_CLIENT", "AWAITING_TEAM_MEMBER"];

export function nextStatus(current: TaskStatus, action: TaskAction): TaskStatus | null {
  const t = TRANSITIONS[action];
  return t.from.includes(current) ? t.to : null;
}

export type TaskActor = {
  role: Role;
  employeeId: string | null;
  isAssignee: boolean;
};

export type TaskParties = {
  makerEmployeeId: string | null;
  checkerEmployeeId: string | null;
};

/**
 * Whether `actor` may perform `action`. Team members can only move their own
 * assigned work forward; review actions need the review capability and, when
 * a checker is named, must be performed by that checker. A maker may never
 * approve their own work (separation of duties).
 */
export function canPerform(actor: TaskActor, task: TaskParties, action: TaskAction): boolean {
  const isMaker = !!actor.employeeId && actor.employeeId === task.makerEmployeeId;
  const isChecker = !!actor.employeeId && actor.employeeId === task.checkerEmployeeId;
  switch (action) {
    case "start":
    case "hold":
    case "wait_client":
    case "wait_team":
    case "submit":
      return actor.isAssignee || isMaker || can(actor.role, "tasks.review");
    case "approve":
    case "request_changes":
      if (isMaker) return false;
      if (task.checkerEmployeeId) return isChecker || can(actor.role, "org.manage");
      return can(actor.role, "tasks.review");
    case "cancel":
      return can(actor.role, "tasks.cancel");
    case "reopen":
      return can(actor.role, "tasks.review");
  }
}

export function availableActions(current: TaskStatus, actor: TaskActor, task: TaskParties): TaskAction[] {
  return (Object.keys(TRANSITIONS) as TaskAction[]).filter(
    (a) => nextStatus(current, a) !== null && canPerform(actor, task, a),
  );
}
