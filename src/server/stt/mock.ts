import type { SpeechToText } from "@/core/stt";

/**
 * SYMULACJA rozpoznawania mowy: NIE słucha nagrania, zwraca stały tekst (MOCK_STT_TEXT).
 * Służy wyłącznie do przetestowania przepływu; UI oznacza wynik jako symulowany.
 */
export function createMockStt(text: string): SpeechToText {
  return {
    mode: "mock",
    transcribe: async (audio) => {
      if (audio.byteLength === 0) throw new Error("Puste nagranie");
      return { text, simulated: true };
    },
  };
}
