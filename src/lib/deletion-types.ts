// Shared between the delete dialog (browser) and the deletion service (server).

export type DeletionEntity =
  | "client"
  | "employee"
  | "task"
  | "allocation"
  | "timesheet"
  | "attendance"
  | "leave"
  | "pending"
  | "observation"
  | "due"
  | "dayreport"
  | "compliance"
  | "trackerline";

export type DeletionPreview = {
  title: string;
  /** Plain-language consequences, e.g. "3 tasks and their remarks are deleted". */
  lines: string[];
  /** A safer alternative worth considering first. */
  advice?: string;
  /** When set, the user must type this text to enable the button. */
  confirmText?: string;
  /** When set, this record cannot be deleted, and this says why. */
  blocked?: string;
};
