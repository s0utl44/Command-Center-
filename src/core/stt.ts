import type { AdapterMode } from "./execution";

export interface Transcription {
  text: string;
  /** Tekst nie pochodzi z rozpoznania mowy (mock) — UI musi to pokazać. */
  simulated: boolean;
}

export interface SpeechToText {
  readonly mode: AdapterMode;
  transcribe(audio: Uint8Array, mimeType: string): Promise<Transcription>;
}

export const MAX_AUDIO_BYTES = 10 * 1024 * 1024;

export function isSupportedAudioType(mimeType: string): boolean {
  const base = mimeType.split(";")[0]?.trim().toLowerCase() ?? "";
  return ["audio/webm", "audio/mp4", "audio/mpeg", "audio/ogg", "audio/wav", "audio/x-m4a", "audio/aac"].includes(base);
}
