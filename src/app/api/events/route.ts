import { getRuntime } from "@/server/context";
import { snapshot } from "@/server/tasks/view";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const POLL_MS = 1000;
const HEARTBEAT_MS = 15_000;

/**
 * SSE: wysyła migawkę zadań przy każdej zmianie w bazie. Źródłem prawdy jest baza (zapisuje ją
 * worker), więc strumień tylko odpytuje ją co sekundę — zerwanie połączenia niczego nie psuje.
 */
export function GET(request: Request) {
  const encoder = new TextEncoder();
  let timer: ReturnType<typeof setInterval> | undefined;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let last = "";
      let lastSent = 0;
      const send = (chunk: string) => {
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          stop();
        }
      };
      const tick = () => {
        try {
          const data = JSON.stringify(snapshot(getRuntime()));
          if (data !== last) {
            last = data;
            lastSent = Date.now();
            send(`event: snapshot\ndata: ${data}\n\n`);
          } else if (Date.now() - lastSent > HEARTBEAT_MS) {
            lastSent = Date.now();
            send(": ping\n\n");
          }
        } catch {
          send(`event: error\ndata: {}\n\n`);
        }
      };
      const stop = () => {
        if (timer) clearInterval(timer);
        timer = undefined;
        try {
          controller.close();
        } catch {
          // już zamknięty
        }
      };
      send("retry: 2000\n\n");
      tick();
      timer = setInterval(tick, POLL_MS);
      request.signal.addEventListener("abort", stop);
    },
    cancel() {
      if (timer) clearInterval(timer);
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
