// Generuje ikony PNG z SVG (Chromium z Playwright). Uruchom: node scripts/generate-icons.mjs
import { readFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const targets = [
  { src: "public/icon.svg", out: "public/icons/icon-192.png", size: 192 },
  { src: "public/icon.svg", out: "public/icons/icon-512.png", size: 512 },
  { src: "public/icons/icon-maskable.svg", out: "public/icons/icon-maskable-512.png", size: 512 },
  { src: "public/icons/icon-maskable.svg", out: "public/icons/apple-touch-icon.png", size: 180 },
];

const browser = await chromium.launch();
for (const t of targets) {
  const page = await browser.newPage({ viewport: { width: t.size, height: t.size }, deviceScaleFactor: 1 });
  const svg = readFileSync(t.src, "utf8").replace("<svg ", `<svg width="${t.size}" height="${t.size}" `);
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`);
  await page.screenshot({ path: t.out, omitBackground: true, clip: { x: 0, y: 0, width: t.size, height: t.size } });
  await page.close();
  console.log(t.out);
}
await browser.close();
