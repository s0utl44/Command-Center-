import { expect, test } from "@playwright/test";

test("ekran Mów jest startowy i ma mikrofon", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: /Mikrofon/ })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Główna nawigacja" })).toBeVisible();
});

test("nawigacja prowadzi do wszystkich czterech ekranów", async ({ page }) => {
  await page.goto("/");
  for (const [label, heading] of [["Dzisiaj", "Dzisiaj"], ["Procesy", "Procesy"], ["Połączenia", "Połączenia"]] as const) {
    await page.getByRole("link", { name: label }).click();
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
  }
});

test("Połączenia nie udają statusu „połączone”", async ({ page }) => {
  await page.goto("/polaczenia");
  await expect(page.getByText(/żadne konto nie jest oznaczone jako połączone/)).toBeVisible();
});

test("manifest PWA jest dostępny", async ({ request }) => {
  const res = await request.get("/manifest.webmanifest");
  expect(res.ok()).toBe(true);
  const manifest = (await res.json()) as { display: string; start_url: string; icons: unknown[] };
  expect(manifest.display).toBe("standalone");
  expect(manifest.start_url).toBe("/");
  expect(manifest.icons.length).toBeGreaterThan(0);
});
