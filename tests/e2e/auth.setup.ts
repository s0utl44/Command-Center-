import { expect, test as setup } from "@playwright/test";
import { AUTH_STATE } from "../../playwright.config";

/** Loguje się raz (tryb testowy, bez Google) i zapisuje sesję dla pozostałych testów. */
setup("logowanie testowe", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: /Zaloguj/ }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.context().storageState({ path: AUTH_STATE });
});
