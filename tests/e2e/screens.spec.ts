import { expect, test } from "@playwright/test";

test("Procesy pokazują proces WRE z kontem, parametrami i historią wersji", async ({ page }) => {
  await page.goto("/procesy");
  const card = page.getByTestId("process-wre-photo-edit");
  await expect(card.getByRole("heading", { name: "Obróbka zdjęć WRE" })).toBeVisible();
  await expect(card).toContainText("wre — d.lys@wrenieruchomosci.pl (WRE)");
  await expect(card).toContainText("real-estate-photo-workflow");
  await expect(card).toContainText("Folder nieruchomości");
  await card.getByText(/Historia wersji/).click();
  await expect(card).toContainText("Wersja początkowa");
});

test("Połączenia pokazują konta i uczciwy status „Nie sprawdzono”", async ({ page }) => {
  await page.goto("/polaczenia");
  const drive = page.getByTestId("connection-wre-google-drive");
  await expect(drive).toContainText("d.lys@wrenieruchomosci.pl");
  await expect(drive).toContainText("Obróbka zdjęć WRE");
  const states = await page.getByTestId("connection-state").allTextContents();
  expect(states.length).toBeGreaterThanOrEqual(3);
  expect(states.every((s) => s === "Nie sprawdzono")).toBe(true);
  await expect(page.getByText("Połączone", { exact: true })).toHaveCount(0);
});
