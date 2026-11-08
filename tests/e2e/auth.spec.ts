import { expect, test } from "@playwright/test";

test.describe("bez logowania", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("strony przekierowują na logowanie, a API odpowiada 401", async ({ page, request }) => {
    for (const path of ["/", "/dzisiaj", "/procesy", "/polaczenia"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login$/);
    }
    await expect(page.getByRole("heading", { name: "Broski" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Główna nawigacja" })).toHaveCount(0);

    for (const [method, path] of [
      ["GET", "/api/tasks"],
      ["GET", "/api/events"],
      ["POST", "/api/commands"],
      ["POST", "/api/transcribe"],
    ] as const) {
      const res = await request.fetch(path, { method, data: method === "POST" ? {} : undefined });
      expect(res.status(), `${method} ${path}`).toBe(401);
    }
    expect((await request.get("/api/health")).ok()).toBe(true);
    expect((await request.get("/manifest.webmanifest")).ok()).toBe(true);
  });

  test("podrobione ciasteczko sesji nie daje dostępu", async ({ page, context, baseURL }) => {
    await context.addCookies([{ name: "broski_session", value: "eyJlbWFpbCI6InNvdHVsZHJvcEBnbWFpbC5jb20iLCJleHAiOjk5OTk5OTk5OTk5OTl9.podpis", url: baseURL! }]);
    await page.goto("/");
    await expect(page).toHaveURL(/\/login$/);
  });
});

test("zalogowany widzi aplikację i może się wylogować", async ({ page, request }) => {
  const me = await request.get("/api/auth/me");
  expect(await me.json()).toMatchObject({ email: "sotuldrop@gmail.com", authMode: "dev" });

  await page.goto("/polaczenia");
  await expect(page.getByText("Zalogowano jako sotuldrop@gmail.com")).toBeVisible();
  await page.getByRole("button", { name: "Wyloguj" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
});

test("żądanie zmieniające stan z obcego źródła jest odrzucane", async ({ request }) => {
  const res = await request.post("/api/commands", {
    headers: { Origin: "https://zly.example" },
    data: { utterance: "Obrób zdjęcia", idempotencyKey: "csrf-test-12345" },
  });
  expect(res.status()).toBe(403);
});
