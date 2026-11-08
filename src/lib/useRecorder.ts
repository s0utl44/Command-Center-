"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

export type RecorderState = "idle" | "recording" | "unsupported";

const MAX_SECONDS = 60;

const noopSubscribe = () => () => undefined;
function detectSupport(): boolean {
  return typeof MediaRecorder !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia);
}

function pickMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  for (const type of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"]) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return "";
}

/** Nagrywanie przez MediaRecorder. Chrome: audio/webm, iOS Safari: audio/mp4. */
export function useRecorder(onRecorded: (audio: Blob) => void) {
  const supported = useSyncExternalStore(noopSubscribe, detectSupport, () => true);
  const [recState, setState] = useState<"idle" | "recording">("idle");
  const state: RecorderState = supported ? recState : "unsupported";
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const onRecordedRef = useRef(onRecorded);

  useEffect(() => {
    onRecordedRef.current = onRecorded;
  }, [onRecorded]);

  useEffect(() => {
    return () => {
      if (timer.current) clearInterval(timer.current);
      recorder.current?.stream.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const stop = useCallback(() => {
    if (recorder.current?.state === "recording") recorder.current.stop();
  }, []);

  const start = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = pickMimeType();
      const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        if (timer.current) clearInterval(timer.current);
        setState("idle");
        const blob = new Blob(chunks, { type: (rec.mimeType || mimeType || "audio/webm").split(";")[0] });
        if (blob.size > 0) onRecordedRef.current(blob);
        else setError("Nagranie jest puste — spróbuj jeszcze raz.");
      };
      recorder.current = rec;
      rec.start(250);
      setSeconds(0);
      setState("recording");
      const startedAt = Date.now();
      timer.current = setInterval(() => {
        const s = Math.floor((Date.now() - startedAt) / 1000);
        setSeconds(s);
        if (s >= MAX_SECONDS) stop();
      }, 250);
    } catch (e) {
      const denied = e instanceof DOMException && (e.name === "NotAllowedError" || e.name === "SecurityError");
      setError(denied ? "Brak dostępu do mikrofonu. Zezwól w ustawieniach przeglądarki albo wpisz polecenie." : "Nie udało się uruchomić mikrofonu.");
      setState("idle");
    }
  }, [stop]);

  return { state, seconds, error, start, stop };
}
