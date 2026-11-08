import { expect, test, type Page } from "@playwright/test";

const status = (page: Page) => page.getByTestId("task-status");

test("polecenie tekstem → pytanie o folder → wynik widoczny po przeładowaniu", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("sim-banner")).toBeVisible();
  await page.getByLabel("Polecenie").fill("Obrób zdjęcia");
  await page.getByRole("button", { name: "Wykonaj" }).click();

  await expect(status(page)).toHaveText("Potrzebuję informacji");
  await page.getByLabel("Z którego folderu obrobić zdjęcia?").fill("Zyndrama 20 52");
  await page.getByRole("button", { name: "Dalej" }).click();
  await expect(status(page)).toHaveText(/W kolejce|Wykonuję|Sprawdzam wynik/);

  await page.reload();
  await expect(status(page)).toHaveText("Gotowe", { timeout: 20_000 });
  await expect(page.getByTestId("task-summary")).toHaveText(/^Obrobiono (\d+)\/\1 zdjęć z folderu Zyndrama 20 52\.$/);
  await expect(page.getByTestId("task-card").getByText("SYMULACJA")).toBeVisible();
  await expect(page.getByRole("link", { name: "Otwórz wynik" })).toBeVisible();
});

test("mikrofon → transkrypcja (SYMULACJA) → zadanie", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Mikrofon/ }).click();
  await expect(page.getByTestId("mic-hint")).toHaveText(/Nagrywam/);
  await page.waitForTimeout(1200);
  await page.getByRole("button", { name: "Zakończ nagrywanie" }).click();

  await expect(page.getByLabel("Polecenie")).toHaveValue("Obrób zdjęcia z Mickiewicza 5");
  await expect(page.getByText("SYMULACJA — ten tekst nie pochodzi z Twojego nagrania")).toBeVisible();
  await page.getByRole("button", { name: "Wykonaj" }).click();
  // Karta od razu pokazuje NOWE zadanie, a nie poprzednie zakończone.
  await expect(page.getByTestId("task-card")).toHaveAttribute("data-utterance", "Obrób zdjęcia z Mickiewicza 5");
  await expect(status(page)).toHaveText(/W kolejce|Wykonuję/);
  await expect(status(page)).toHaveText("Gotowe", { timeout: 20_000 });
  await expect(page.getByTestId("task-summary")).toContainText("Mickiewicza 5");
});

test("zamknięcie karty nie przerywa zadania", async ({ page, context }) => {
  await page.goto("/");
  await page.getByLabel("Polecenie").fill("Obrób fotki WS Wola 12");
  await page.getByRole("button", { name: "Wykonaj" }).click();
  await expect(page.getByTestId("task-card")).toHaveAttribute("data-utterance", "Obrób fotki WS Wola 12");
  await expect(status(page)).toHaveText(/W kolejce|Wykonuję/);
  await page.close();

  await new Promise((r) => setTimeout(r, 4000));
  const again = await context.newPage();
  await again.goto("/");
  await expect(status(again)).toHaveText("Gotowe", { timeout: 20_000 });
  await expect(again.getByTestId("task-summary")).toContainText("WS Wola 12");
});

test("niepełny wynik → Wymaga uwagi → Dokończ → Gotowe", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Polecenie").fill("Obrób zdjęcia z folderu WS CZESC");
  await page.getByRole("button", { name: "Wykonaj" }).click();
  await expect(page.getByTestId("task-card")).toHaveAttribute("data-utterance", "Obrób zdjęcia z folderu WS CZESC");

  await expect(status(page)).toHaveText("Wymaga uwagi", { timeout: 20_000 });
  await expect(page.getByTestId("task-summary")).toContainText("Weryfikacja nie przeszła");
  // Gdy zadanie czeka na decyzję, mikrofon jest ukryty.
  await expect(page.getByRole("button", { name: /Mikrofon/ })).toHaveCount(0);

  await page.getByRole("button", { name: "Dokończ" }).click();
  await expect(status(page)).toHaveText("Gotowe", { timeout: 20_000 });
});

test("nierozpoznane polecenie nie tworzy zadania", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Polecenie").fill("Jaka jest jutro pogoda?");
  await page.getByRole("button", { name: "Wykonaj" }).click();
  await expect(page.getByTestId("speak-message")).toContainText("Nie rozpoznałem");
});
