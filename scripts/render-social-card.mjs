import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { loadDependency } from "./dependencies.mjs";

const { chromium } = process.env.IMD_PLAYWRIGHT
  ? await import(pathToFileURL(process.env.IMD_PLAYWRIGHT).href)
  : loadDependency("playwright");
const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--no-zygote"] });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await page.setContent(`<style>body{margin:0}svg{display:block;width:1200px;height:630px}</style>${await readFile("public/social-card.svg", "utf8")}`);
  await page.evaluate(() => document.fonts.ready);
  const fits = await page.evaluate(() => {
    const text = [...document.querySelectorAll("text")].find((t) => t.textContent === "Made for OBS").getBBox();
    const badge = [...document.querySelectorAll("rect")].find((r) => r.getAttribute("y") === "475").getBBox();
    return text.x >= badge.x && text.x + text.width <= badge.x + badge.width && text.y >= badge.y && text.y + text.height <= badge.y + badge.height;
  });
  if (!fits) throw new Error("Social badge text is outside its badge");
  await page.screenshot({ path: "public/social-card.png" });
  console.log("Regenerated public/social-card.png from SVG: 1200 × 630; Made for OBS fits its badge");
} finally { await browser.close(); }
