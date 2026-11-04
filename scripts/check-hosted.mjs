import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { loadDependency } from "./dependencies.mjs";
import * as validators from "../src/generated/validators.js";

const site = "https://squeek-studio-make-the-wheel-par.imd.site/";
const candidate = process.argv.includes("--candidate");
const label = candidate ? "candidate" : "published";
const output = resolve("test/scratch/hosted");
await mkdir(output, { recursive: true });
const { chromium } = process.env.IMD_PLAYWRIGHT
  ? await import(pathToFileURL(process.env.IMD_PLAYWRIGHT).href)
  : loadDependency("playwright");
// Use the supplied network proxy only for transport; never persist or print its configuration.
const proxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
const browser = await chromium.launch({
  headless: true, args: ["--no-sandbox", "--no-zygote"],
  ...(proxy ? { proxy: { server: proxy } } : {}),
});
const report = {
  checkedAt: new Date().toISOString(),
  site, overlay: `${site}#/overlay`,
  mode: candidate ? "Unpublished dist bytes at the existing HTTPS origin; real host document headers/CSP retained" : "Unmodified published site; no interception",
  publishedReplacementVerified: false,
  checks: [], endpoints: [],
};
const record = async (name, fn) => {
  try { const details = await fn(); report.checks.push({ name, passed: true, details }); console.log(`PASS ${label}: ${name}`); }
  catch (e) { report.checks.push({ name, passed: false, error: e.message }); console.log(`FAIL ${label}: ${name}: ${e.message.split("\n")[0]}`); }
};
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, permissions: ["clipboard-read", "clipboard-write"] });
  if (candidate) {
    const root = resolve("dist");
    const mime = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".txt": "text/plain" };
    await context.route(`${site}**`, async (route) => {
      const path = new URL(route.request().url()).pathname;
      const file = resolve(root, path === "/" ? "index.html" : path.slice(1));
      if (!file.startsWith(root + sep)) return route.abort();
      if (path === "/") {
        const original = await route.fetch();
        // Do not alter any security header. This is an origin/CSP test, not a publication.
        return route.fulfill({ response: original, body: await readFile(file), contentType: "text/html" });
      }
      try { return route.fulfill({ status: 200, body: await readFile(file), contentType: mime[extname(file)] || "application/octet-stream" }); }
      catch { return route.abort(); }
    });
  }
  const endpoints = [];
  const observe = (page) => {
    const errors = [], consoleErrors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text().slice(0, 300)); });
    page.on("response", (response) => {
      if (!response.url().startsWith("https://api.squeekchain.com/v1/")) return;
      endpoints.push((async () => {
        const channel = new URL(response.url()).pathname.split("/").at(-1);
        const item = { channel, http: response.status() };
        if (response.ok()) try {
          const data = await response.json();
          item.schemaValid = validators[channel](data);
          item.classification = !item.schemaValid ? "schema mismatch" : data.status === "unavailable" ? "source unavailable" : "valid response";
          item.reason = data.reason || null;
          if (!item.schemaValid) item.validationErrors = validators[channel].errors;
        } catch (e) { item.classification = "unreadable response"; item.error = e.message; }
        else item.classification = [429, 503].includes(response.status()) ? "source rate limit or outage" : "HTTP error";
        return item;
      })());
    });
    return { errors, consoleErrors };
  };
  const editor = await context.newPage();
  const editorLog = observe(editor);
  let link = `${site}#/overlay`;
  await record("hosted editor startup and primary action at 390", async () => {
    const response = await editor.goto(site, { waitUntil: "load", timeout: 60000 });
    const headers = await response.allHeaders();
    report.host = { status: response.status(), csp: headers["content-security-policy"], cid: headers["x-ipfs-cid"] };
    assert.equal(response.status(), 200);
    assert.ok(report.host.csp.includes("script-src 'self'"));
    assert.ok(!report.host.csp.split(";").find((d) => d.trim().startsWith("script-src ")).includes("'unsafe-eval'"));
    await editor.getByRole("heading", { name: "Customize your OBS overlay", exact: true }).waitFor({ timeout: 8000 });
    await editor.evaluate(() => document.fonts.ready);
    const primary = editor.getByRole("button", { name: "Get overlay link", exact: true });
    const box = await primary.boundingBox();
    assert.ok(box.y >= 0 && box.y + box.height <= 844);
    await primary.click();
    link = await editor.getByLabel("Your overlay URL").inputValue();
    await editor.getByRole("button", { name: "Copy overlay link", exact: true }).click();
    assert.equal(await editor.evaluate(() => navigator.clipboard.readText()), link);
    await editor.keyboard.press("Escape");
    assert.deepEqual(editorLog.errors, []);
    await editor.screenshot({ path: `${output}/${label}-editor-390.png` });
    await editor.setViewportSize({ width: 1440, height: 1000 });
    await editor.screenshot({ path: `${output}/${label}-editor-1440.png`, fullPage: true });
    return { copiedPortableLink: true, fatalErrors: editorLog.errors };
  });
  if (!report.checks.at(-1).passed)
    await editor.screenshot({ path: `${output}/${label}-editor-failure.png` });
  await record("real live API requests and endpoint diagnostics", async () => {
    await editor.getByRole("button", { name: "Live", exact: true }).click({ timeout: 5000 });
    await editor.waitForFunction(() => {
      const status = document.querySelector(".data-status");
      return status && !status.classList.contains("is-demo") && !status.textContent.includes("Connecting");
    }, null, { timeout: 15000 });
    await editor.locator(".source-details summary").click();
    const diagnostics = await editor.locator(".source-list").innerText();
    await editor.screenshot({ path: `${output}/${label}-live-sources.png`, fullPage: true });
    assert.deepEqual(editorLog.errors, []);
    return { diagnostics };
  });
  // A new document avoids treating a fragment navigation as a fresh HTTP response.
  const overlay = await context.newPage();
  const overlayLog = observe(overlay);
  await overlay.setViewportSize({ width: 1280, height: 720 });
  await record("hosted transparent OBS route", async () => {
    await overlay.goto(link, { waitUntil: "load", timeout: 60000 });
    await overlay.locator(".obs-output .overlay-widget").first().waitFor({ timeout: 8000 });
    assert.equal(await overlay.locator("header,footer,button,dialog,.scene-art").count(), 0);
    const colors = await overlay.evaluate(() => [document.documentElement, document.body, document.querySelector(".overlay-stage")].map((e) => getComputedStyle(e).backgroundColor));
    assert.deepEqual(colors, ["rgba(0, 0, 0, 0)", "rgba(0, 0, 0, 0)", "rgba(0, 0, 0, 0)"]);
    assert.deepEqual(overlayLog.errors, []);
    await overlay.screenshot({ path: `${output}/${label}-obs.png`, omitBackground: true });
    return { colors, fatalErrors: overlayLog.errors, demoSnapshot: link !== report.overlay };
  });
  await record("live OBS route renders independent of editor state", async () => {
    await overlay.goto(report.overlay, { waitUntil: "load", timeout: 60000 });
    await overlay.locator(".obs-output .overlay-widget").first().waitFor({ timeout: 8000 });
    await overlay.waitForFunction(() => !document.querySelector(".source-stamp")?.textContent.includes("loading"), null, { timeout: 15000 });
    const source = await overlay.locator(".source-stamp").innerText();
    assert.ok(source.startsWith("Live source"));
    assert.deepEqual(overlayLog.errors, []);
    assert.equal(await overlay.evaluate(() => getComputedStyle(document.documentElement).backgroundColor), "rgba(0, 0, 0, 0)");
    await overlay.screenshot({ path: `${output}/${label}-obs-live.png`, omitBackground: true });
    return { source, fatalErrors: overlayLog.errors };
  });
  if (report.checks.some((c) => !c.passed))
    await overlay.screenshot({ path: `${output}/${label}-obs-failure.png` });
  report.endpoints = await Promise.all(endpoints);
  report.console = { editor: editorLog, overlay: overlayLog };
  if (!candidate && report.checks.every((c) => c.passed)) report.publishedReplacementVerified = true;
  await context.close();
} finally {
  await browser.close();
  await writeFile(`${output}/${label}.json`, JSON.stringify(report, null, 2));
}
if (report.checks.some((c) => !c.passed)) process.exitCode = 1;
