import { isSupportedAudioType, MAX_AUDIO_BYTES } from "@/core/stt";
import { getRuntime } from "@/server/context";
import { handle, UserError } from "@/server/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Nagranie → tekst. Audio nie jest zapisywane na dysku ani w bazie. */
export function POST(request: Request) {
  return handle(request, async () => {
    const form = await request.formData().catch(() => {
      throw new UserError("Oczekiwano formularza z nagraniem");
    });
    const audio = form.get("audio");
    if (!(audio instanceof Blob)) throw new UserError("Brak nagrania");
    if (audio.size === 0) throw new UserError("Puste nagranie");
    if (audio.size > MAX_AUDIO_BYTES) throw new UserError("Nagranie jest za długie", 413);
    if (!isSupportedAudioType(audio.type)) throw new UserError(`Nieobsługiwany format nagrania: ${audio.type || "brak"}`, 415);
    const result = await getRuntime().stt.transcribe(new Uint8Array(await audio.arrayBuffer()), audio.type);
    return Response.json(result);
  });
}
