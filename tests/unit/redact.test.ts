import { describe, expect, it } from "vitest";
import { REDACTED, redact, redactString } from "@/core/redact";

describe("redact", () => {
  it("usuwa token Hermesa z URL-a WebSocket", () => {
    expect(redactString("ws://127.0.0.1:9119/api/ws?token=abc123&x=1")).toBe(`ws://127.0.0.1:9119/api/ws?token=${REDACTED}&x=1`);
  });

  it("usuwa nagłówek Bearer", () => {
    expect(redactString("Authorization: Bearer sk-abc.def")).toBe(`Authorization: Bearer ${REDACTED}`);
  });

  it("redaguje klucze sekretne w zagnieżdżonych obiektach", () => {
    const input = { user: "dominik", auth: { apiKey: "k", password: "p" }, list: [{ token: "t" }], url: "https://x?ticket=zz" };
    expect(redact(input)).toEqual({
      user: "dominik",
      auth: { apiKey: REDACTED, password: REDACTED },
      list: [{ token: REDACTED }],
      url: `https://x?ticket=${REDACTED}`,
    });
  });

  it("nie zmienia zwykłych wartości", () => {
    expect(redact({ folder: "WS Mokotów", count: 12, ok: true, none: null })).toEqual({ folder: "WS Mokotów", count: 12, ok: true, none: null });
  });
});
