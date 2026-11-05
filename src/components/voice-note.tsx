"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { clsx } from "clsx";
import { Mic, Square, Trash2 } from "lucide-react";
import { toast } from "@/components/toaster";
import { t } from "@/lib/i18n";

// WhatsApp-style voice notes: press to record, press to stop, listen back, send with the
// form. Clips are placed in a hidden file input, so they go through the same validated,
// private upload as any other attachment. The file name carries the length in seconds.

const MAX_SECONDS = 5 * 60;

/** MP4 plays on every phone; WebM is the fallback for browsers that cannot record it. */
function pickMimeType() {
  if (typeof MediaRecorder === "undefined") return null;
  return ["audio/mp4", "audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"].find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
}

const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

type Clip = { id: number; file: File; url: string; seconds: number };

export function VoiceRecorder({ name = "voiceNotes", compact = false }: { name?: string; compact?: boolean }) {
  const [supported, setSupported] = useState(true);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [clips, setClips] = useState<Clip[]>([]);
  const input = useRef<HTMLInputElement>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const started = useRef(0);
  const nextId = useRef(1);

  // Keep the hidden file input in step with the list, so the form posts the clips.
  useEffect(() => {
    if (!input.current) return;
    const dt = new DataTransfer();
    for (const c of clips) dt.items.add(c.file);
    input.current.files = dt.files;
  }, [clips]);

  const releaseMic = useCallback(() => {
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
  }, []);

  const clear = useCallback(() => {
    setClips((list) => {
      list.forEach((c) => URL.revokeObjectURL(c.url));
      return [];
    });
  }, []);

  // A successful submit resets the form: the sent clips are gone too.
  useEffect(() => {
    const form = input.current?.closest("form");
    if (!form) return;
    form.addEventListener("reset", clear);
    return () => form.removeEventListener("reset", clear);
  }, [clear]);

  useEffect(() => () => releaseMic(), [releaseMic]);

  // Tick while recording; stop on its own at the limit.
  useEffect(() => {
    if (!recording) return;
    const timer = setInterval(() => {
      const s = Math.floor((Date.now() - started.current) / 1000);
      setSeconds(s);
      if (s >= MAX_SECONDS) recorder.current?.stop();
    }, 250);
    return () => clearInterval(timer);
  }, [recording]);

  async function start() {
    const mime = pickMimeType();
    if (mime === null || !navigator.mediaDevices?.getUserMedia) {
      setSupported(false);
      return;
    }
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      toast(t("Microphone access was not allowed. Allow it in your browser's site settings, then try again."), "error");
      return;
    }
    const rec = new MediaRecorder(stream.current, { ...(mime ? { mimeType: mime } : {}), audioBitsPerSecond: 64_000 });
    chunks.current = [];
    rec.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data); };
    rec.onstop = () => {
      releaseMic();
      setRecording(false);
      const secs = Math.max(1, Math.round((Date.now() - started.current) / 1000));
      const type = (rec.mimeType || mime || "audio/webm").split(";")[0];
      const ext = type === "audio/mp4" ? "m4a" : type === "audio/ogg" ? "ogg" : "webm";
      const blob = new Blob(chunks.current, { type });
      if (blob.size === 0) return;
      const file = new File([blob], `voice-note-${secs}s.${ext}`, { type });
      setClips((list) => [...list, { id: nextId.current++, file, url: URL.createObjectURL(blob), seconds: secs }]);
    };
    recorder.current = rec;
    started.current = Date.now();
    setSeconds(0);
    rec.start();
    setRecording(true);
  }

  const remove = (id: number) => setClips((list) => {
    const gone = list.find((c) => c.id === id);
    if (gone) URL.revokeObjectURL(gone.url);
    return list.filter((c) => c.id !== id);
  });

  return (
    <div className={clsx(!compact && "rounded-lg border border-line bg-paper/60 p-3")}>
      <input ref={input} type="file" name={name} multiple hidden tabIndex={-1} aria-hidden />
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => (recording ? recorder.current?.stop() : start())}
          disabled={!supported}
          aria-pressed={recording}
          className={clsx(
            "app-btn inline-flex h-9 items-center gap-2 rounded-full border px-3.5 text-sm font-medium transition-[background-color,border-color,color] duration-200 disabled:opacity-50",
            recording ? "border-danger bg-danger text-white" : "border-line bg-surface text-ink hover:border-ink/30",
          )}
        >
          {recording ? <Square className="size-3.5 fill-current" aria-hidden /> : <Mic className="size-4" aria-hidden />}
          {recording ? "Stop" : clips.length ? "Record another" : "Record voice note"}
        </button>
        {recording ? (
          <span role="status" className="inline-flex items-center gap-2 text-sm text-danger">
            <span aria-hidden className="size-2 animate-ping rounded-full bg-danger" />
            <span className="font-mono tabular-nums">{clock(seconds)}</span>
            <span className="text-xs text-muted">max {clock(MAX_SECONDS)}</span>
          </span>
        ) : !supported ? (
          <span className="text-xs text-warn">This browser cannot record audio. Use a recent Chrome, Edge or Safari.</span>
        ) : !compact && clips.length === 0 ? (
          <span className="text-xs text-muted">Speak the instructions instead of typing them.</span>
        ) : null}
      </div>
      {clips.length > 0 && (
        <ul className="mt-3 space-y-2">
          {clips.map((c, i) => (
            <li key={c.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-surface p-1.5 pr-2 ring-1 ring-line">
              <audio controls src={c.url} preload="metadata" className="h-9 min-w-0 flex-1 basis-48" aria-label={`Voice note ${i + 1}`} />
              <span className="font-mono text-xs text-muted">{clock(c.seconds)}</span>
              <button type="button" onClick={() => remove(c.id)} aria-label={`Delete voice note ${i + 1}`} title="Delete this recording" className="rounded p-1 text-muted transition-colors hover:text-danger">
                <Trash2 className="size-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Playback of a stored voice note. The file is fetched only when someone presses play. */
export function VoicePlayer({ fileId, seconds, label }: { fileId: string; seconds?: number | null; label: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <audio controls preload="none" src={`/api/files/${fileId}`} className="h-9 min-w-0 flex-1 basis-56" aria-label={label} />
      {seconds ? <span className="font-mono text-xs text-muted">{clock(seconds)}</span> : null}
    </div>
  );
}
