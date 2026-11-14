"use client";

import { toast } from "./toaster";

// Checks attachments in the browser before a form is sent, so a wrong or too-large file
// gets a clear message at once instead of a failed submission. The server checks again.

const MB = 1024 * 1024;
/** One request may carry at most 12 MB; keep a little room for the other fields. */
export const MAX_FORM_UPLOAD_BYTES = 11 * MB;
const DOCS = /\.(pdf|jpe?g|png|webp|docx|xlsx)$/i;
const IMAGES = /\.(jpe?g|png|webp)$/i;

/** Clears the input and says why when a chosen file is too large or of a type the ERP does not keep. */
export function checkFileInput(input: HTMLInputElement, imagesOnly = false): boolean {
  for (const f of Array.from(input.files ?? [])) {
    const problem =
      f.size > 10 * MB ? `“${f.name}” is larger than 10 MB. Attach a smaller copy.`
      : !(imagesOnly ? IMAGES : DOCS).test(f.name) ? `“${f.name}” cannot be uploaded. Use ${imagesOnly ? "a JPG, PNG or WEBP image" : "PDF, JPG, PNG, WEBP, DOCX or XLSX"}.`
      : null;
    if (problem) {
      toast(problem, "error");
      input.value = "";
      return false;
    }
  }
  return true;
}

/** Total size of every file chosen in the form. */
export function chosenUploadBytes(form: HTMLFormElement): number {
  let total = 0;
  for (const el of Array.from(form.querySelectorAll<HTMLInputElement>('input[type="file"]'))) {
    for (const f of Array.from(el.files ?? [])) total += f.size;
  }
  return total;
}

/** Stops a submission whose files together exceed what one request can carry. */
export function uploadsTooLarge(form: HTMLFormElement): boolean {
  if (chosenUploadBytes(form) <= MAX_FORM_UPLOAD_BYTES) return false;
  toast("The attached files together are larger than 11 MB. Attach the main ones now and upload the rest later from the client's Documents tab.", "error");
  return true;
}
