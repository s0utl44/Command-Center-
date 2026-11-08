import { expect, test } from "@playwright/test";

/**
 * Kryteria instalowalności sprawdzane wprost. (`Page.getInstallabilityErrors` w headless Chromium
 * zwraca pustą listę nawet dla strony bez manifestu — sprawdzone, więc go nie używamy.)
 */
test("kryteria instalowalności: manifest sparsowany bez błędów i aktywny service worker", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('link[rel="manifest"]')).toHaveCount(1);

  const cdp = await page.context().newCDPSession(page);
  const parsed = (await cdp.send("Page.getAppManifest")) as { url: string; errors: { message: string }[] };
  expect(parsed.url).toMatch(/\/manifest\.webmanifest$/);
  expect(parsed.errors).toEqual([]);

  const manifest = (await (await page.request.get("/manifest.webmanifest")).json()) as Record<string, unknown>;
  expect(manifest).toMatchObject({ name: "Broski", short_name: "Broski", start_url: "/", display: "standalone" });

  const active = await page.evaluate(async () => Boolean((await navigator.serviceWorker.ready).active));
  expect(active).toBe(true);
  await page.reload();
  expect(await page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
});

test("manifest ma ikony PNG 192/512 i maskable", async ({ request }) => {
  const manifest = (await (await request.get("/manifest.webmanifest")).json()) as { icons: { src: string; sizes: string; purpose?: string }[] };
  const sizes = manifest.icons.map((i) => `${i.sizes}:${i.purpose ?? "any"}`);
  expect(sizes).toEqual(expect.arrayContaining(["192x192:any", "512x512:any", "512x512:maskable"]));
  for (const icon of manifest.icons) expect((await request.get(icon.src)).ok()).toBe(true);
  expect((await request.get("/icons/apple-touch-icon.png")).ok()).toBe(true);
});

test("bez sieci nawigacja pokazuje stronę offline", async ({ page, context }) => {
  await page.goto("/");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload(); // strona kontrolowana przez service worker
  await context.setOffline(true);
  await page.goto("/dzisiaj");
  await expect(page.getByRole("heading", { name: "Brak połączenia" })).toBeVisible();
  await context.setOffline(false);
});
