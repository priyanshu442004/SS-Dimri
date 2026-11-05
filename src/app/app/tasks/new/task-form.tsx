"use client";

import { useCallback, useEffect, useState } from "react";
import { ActionForm, Checkbox, SelectField, SubmitButton, TextArea, TextField } from "@/components/form";
import { PeoplePicker, SearchSelect } from "@/components/pickers";
import { toast } from "@/components/toaster";
import { VoiceRecorder } from "@/components/voice-note";
import { dateTimeLocalInTz } from "@/lib/dates";
import { t } from "@/lib/i18n";
import { createTaskAction } from "../actions";
import { ReminderRows } from "../reminder-rows";

type Option = { value: string; label: string; level?: string | null };

/**
 * Start defaults to the current date and time and may not be earlier than now.
 * While the start is left at its default it keeps moving with the clock.
 */
function useStart(initialNow: string, timezone: string) {
  const [now, setNow] = useState(initialNow);
  const [start, setStart] = useState(initialNow);
  const [edited, setEdited] = useState(false);
  useEffect(() => {
    const tick = () => {
      const n = dateTimeLocalInTz(new Date(), timezone);
      setNow(n);
      if (!edited) setStart(n);
    };
    const id = setInterval(tick, 15_000);
    return () => clearInterval(id);
  }, [edited, timezone]);
  // datetime-local values compare correctly as strings (same fixed format).
  const tooEarly = !!start && start < now;
  return { now, start, tooEarly, change: (v: string) => { setStart(v); setEdited(true); } };
}

export function TaskForm({ employees, clients, defaultClient, now: initialNow, timezone = "Asia/Kolkata", canShare = true }: {
  employees: Option[];
  clients: Option[];
  defaultClient: string;
  now: string;
  timezone?: string;
  canShare?: boolean;
}) {
  const start = useStart(initialNow, timezone);
  // The maker follows the assignee when one person is deputed on the job, until it is set by hand.
  const [assignees, setAssignees] = useState<string[]>([]);
  const [maker, setMaker] = useState("");
  const [makerEdited, setMakerEdited] = useState(false);
  const onAssignees = useCallback((v: string[]) => setAssignees(v), []);
  const shownMaker = makerEdited ? maker : assignees.length === 1 ? assignees[0] : "";

  return (
    // Capture phase: a start in the past stops the submission before it reaches the server.
    <div
      onSubmitCapture={(e) => {
        if (!start.tooEarly) return;
        e.preventDefault();
        e.stopPropagation();
        toast(t("The start date and time cannot be earlier than now."), "error");
      }}
    >
      <ActionForm action={createTaskAction}>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Task" name="title" className="sm:col-span-2" placeholder="e.g. GSTR-3B for September" hint="Can be left blank if you record a voice note" />
          <div className="sm:col-span-2">
            <span className="mb-1 block text-sm font-medium text-ink">Voice note</span>
            <VoiceRecorder />
          </div>
          <SearchSelect label="Client" name="clientId" defaultValue={defaultClient} options={clients} placeholder="Search clients…" emptyLabel="No client (internal)" />
          <div className="grid grid-cols-2 gap-3">
            <SelectField label="Priority" name="priority" placeholder={null} defaultValue="MEDIUM" options={[
              { value: "HIGH", label: "High" }, { value: "MEDIUM", label: "Medium" }, { value: "LOW", label: "Low" },
            ]} />
            <div className="pt-7"><Checkbox name="isAsap" label="ASAP" /></div>
          </div>
          <div>
            <TextField
              label="Start"
              name="startAt"
              type="datetime-local"
              value={start.start}
              min={start.now}
              onChange={(e) => start.change(e.target.value)}
              aria-invalid={start.tooEarly || undefined}
              hint={start.tooEarly ? undefined : "Defaults to now; cannot be earlier than now"}
            />
            {start.tooEarly && <p role="alert" className="app-rise mt-1 text-xs text-danger">The start cannot be earlier than now ({start.now.replace("T", " ")}).</p>}
          </div>
          <TextField label="Due by" name="dueAt" type="datetime-local" />
          <TextArea label="Details / written work" name="description" rows={4} className="sm:col-span-2" />
        </div>

        <PeoplePicker label="Assign to (one or more)" name="assigneeIds[]" options={employees} onChange={onAssignees} hint="Type part of a name, then press Enter or click" />

        <div className="grid gap-4 sm:grid-cols-2">
          <SearchSelect
            label="Maker"
            name="makerEmployeeId"
            options={employees}
            value={shownMaker}
            onChange={(v) => { setMaker(v); setMakerEdited(true); }}
            emptyLabel="No maker"
            hint="Follows the assignee when only one person is deputed"
          />
          <SearchSelect label="Checker" name="checkerEmployeeId" options={employees} emptyLabel="No checker" hint="Reviews and approves the work. The same person can be maker and checker" />
          <TextArea label="Writing for (client side) — remark" name="writingForRemark" rows={2} />
          <TextArea label="Writing from (team side) — remark" name="writingFromRemark" rows={2} />
          <ReminderRows now={start.now} />
          <div>
            <label htmlFor="attachments" className="mb-1 block text-sm font-medium">Attach images or documents</label>
            <input id="attachments" name="attachments" type="file" multiple accept="application/pdf,image/*,.docx,.xlsx" className="block w-full text-sm file:mr-3 file:rounded-md file:border file:border-line file:bg-surface file:px-3 file:py-1.5 file:text-sm" />
          </div>
        </div>
        {canShare && <Checkbox name="clientVisible" label="Share with the client in their portal (title, status, due date and client-visible remarks only)" />}
        <SubmitButton>Create task</SubmitButton>
      </ActionForm>
    </div>
  );
}
