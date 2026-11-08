import { expect, test } from "@playwright/test";

test("Dzisiaj grupuje zadania, a szczegóły pokazują historię", async ({ page, request }) => {
  const done = await request.post("/api/commands", { data: { utterance: "Obrób zdjęcia z folderu Dzisiaj Test", idempotencyKey: `e2e-${Date.now()}-a` } });
  expect(done.ok()).toBe(true);
  const waiting = (await (
    await request.post("/api/commands", { data: { utterance: "Obrób zdjęcia", idempotencyKey: `e2e-${Date.now()}-b` } })
  ).json()) as { task: { id: string } };

  await page.goto("/dzisiaj");
  await expect(page.getByTestId("group-waiting").getByRole("link", { name: /Obrób zdjęcia/ })).toBeVisible();
  const item = page.getByTestId("group-done").getByRole("link", { name: /Dzisiaj Test/ });
  await expect(item).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("group-scheduled")).toContainText("Brak zaplanowanych");

  await item.click();
  await expect(page.getByTestId("task-status")).toHaveText("Gotowe");
  const timeline = page.getByTestId("timeline");
  for (const label of ["Przyjęto polecenie", "Zlecenie wysłane", "Hermes zakończył pracę", "Wynik zweryfikowany"]) {
    await expect(timeline).toContainText(label);
  }
  await page.getByRole("link", { name: "← Dzisiaj" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Dzisiaj" })).toBeVisible();

  // Sprzątanie: czekające zadanie blokowałoby ekran Mów w kolejnych uruchomieniach.
  expect((await request.post(`/api/tasks/${waiting.task.id}/cancel`)).ok()).toBe(true);
});
