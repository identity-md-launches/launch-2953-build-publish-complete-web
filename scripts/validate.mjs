import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { createServer } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { checkRuntime } from "./check-runtime.mjs";
import { generateValidators } from "./generate-validators.mjs";

const require = createRequire(import.meta.url);
// Scratch fallback lets contributors check without changing a protected dependency directory.
const locations = [process.cwd(), resolve("test/scratch/toolchain")];
const dependency = (name) => require.resolve(name, { paths: locations });
const { build } = await import(pathToFileURL(dependency("esbuild")).href);
const { chromium, webkit } = process.env.IMD_PLAYWRIGHT
  ? await import(pathToFileURL(process.env.IMD_PLAYWRIGHT).href)
  : require(dependency("playwright"));
const { expect } = process.env.IMD_PLAYWRIGHT
  ? createRequire(process.env.IMD_PLAYWRIGHT)("playwright/test")
  : require(dependency("@playwright/test"));
const axeModule = require(dependency("@axe-core/playwright"));
const AxeBuilder = axeModule.default || axeModule;
const output = resolve("test/scratch/validation");
await mkdir(output, { recursive: true });
const checks = [];
const check = async (name, test) => {
  const started = Date.now();
  try {
    await test();
    checks.push({ name, passed: true, ms: Date.now() - started });
    console.log(`PASS ${name}`);
  } catch (error) {
    checks.push({
      name,
      passed: false,
      error: error.stack,
      ms: Date.now() - started,
    });
    console.error(`FAIL ${name}: ${error.message}`);
    throw error;
  }
};
const fixture = Object.fromEntries(
  await Promise.all(
    ["status", "core", "events"].map(async (channel) => [
      channel,
      JSON.parse(
        await readFile(
          new URL(`./fixtures/${channel}.json`, import.meta.url),
          "utf8",
        ),
      ),
    ]),
  ),
);
await build({
  entryPoints: ["src/api.ts"],
  outfile: `${output}/api.cjs`,
  platform: "node",
  format: "cjs",
  bundle: true,
  logLevel: "silent",
  alias: {
    react: dependency("react"),
    ajv: resolve(dependency("ajv"), "../.."),
    "ajv-formats": dependency("ajv-formats"),
  },
});
await build({
  entryPoints: ["src/model.ts"],
  outfile: `${output}/model.cjs`,
  platform: "node",
  format: "cjs",
  bundle: true,
  logLevel: "silent",
});
const api = require(`${output}/api.cjs`),
  model = require(`${output}/model.cjs`);
const clone = (value) => structuredClone(value);
const freshFixture = (channel, now = Date.now()) => {
  const value = clone(fixture[channel]);
  if ("generatedAt" in value) value.generatedAt = new Date(now).toISOString();
  if (channel === "status") {
    value.measurement.receivedAt = value.measurement.observedAt = new Date(
      now,
    ).toISOString();
    value.measurement.coreStatus = "ACTIVE";
    value.measurement.rpmMilli = 72400;
  }
  return value;
};
await check("Standalone generation is reproducible and the browser module has no runtime compiler or require", async () => {
  await generateValidators({ check: true });
  checkRuntime(await readFile("src/generated/validators.js", "utf8"), "validators.js");
  const { readdir } = await import("node:fs/promises");
  for (const name of await readdir("dist/assets"))
    if (name.endsWith(".js")) checkRuntime(await readFile(`dist/assets/${name}`, "utf8"), name);
});
await check(
  "Every template validates and survives a Unicode URL round trip",
  () => {
    for (const template of ["minimal", "cozy", "neon"]) {
      const config = model.templateConfig(template);
      config.name = "Night stream · 小轮子";
      assert.deepEqual(model.decodeConfig(model.encodeConfig(config)), config);
      assert.deepEqual(model.parseConfig(JSON.stringify(config)), config);
    }
  },
);
await check("Default presets and every widget's growing labels remain in the canonical safe area at every scale", () => {
  for (const template of ["minimal", "cozy", "neon"]) {
    for (const w of model.templateConfig(template).widgets) {
      const size = model.widgetSize(w);
      assert.ok(w.x + size.width * w.scale <= model.WIDTH);
      assert.ok(w.y + size.height * w.scale <= model.HEIGHT - 32);
    }
  }
  for (const type of Object.keys(model.WIDGETS))
    for (const label of ["W".repeat(20), "W".repeat(36), "A complete label with several words", "轮".repeat(36), "\n".repeat(36)])
      for (const scale of [0.5, 1, 1.6]) {
        const w = model.clampWidget({ ...model.createWidget(type), label, x: 1280, y: 720, scale });
        const size = model.widgetSize(w);
        assert.ok(w.x >= 0 && w.y >= 0);
        assert.ok(w.x + size.width * w.scale <= model.WIDTH);
        assert.ok(w.y + size.height * w.scale <= model.HEIGHT - 32);
        assert.deepEqual(model.clampWidget(w), w);
      }
});
await check("Standalone formats keep exact unsigned integer limits, valid timestamps and UUIDs", () => {
  for (const [field, bits] of [["blockHeight", 64], ["cumulativeBlockUnits", 96], ["authorizationNonce", 256]]) {
    const max = ((1n << BigInt(bits)) - 1n).toString();
    api.validateApi("core", { ...fixture.core, core: { ...fixture.core.core, [field]: max } });
    for (const value of [(1n << BigInt(bits)).toString(), "-1", "01", "1.1", "1e2", "", "9".repeat(79)])
      assert.throws(() => api.validateApi("core", { ...fixture.core, core: { ...fixture.core.core, [field]: value } }));
  }
  for (const value of ["not-a-date", "2026-02-30T00:00:00Z", "2026-11-04T25:00:00Z"])
    assert.throws(() => api.validateApi("status", { ...fixture.status, generatedAt: value }));
  assert.throws(() => api.validateApi("status", {
    ...fixture.status, measurement: { ...fixture.status.measurement, counterEpoch: "not-a-uuid" },
  }));
});
await check(
  "Reject corrupt, oversized, unsupported and out-of-bounds presets",
  () => {
    assert.throws(() => model.parseConfig("{oops"));
    assert.throws(() => model.parseConfig(" ".repeat(65537)));
    const c = model.templateConfig("cozy");
    for (const patch of [
      { version: 2 },
      { mode: "automatic" },
      { accent: "url(https://example.org)" },
      { name: "" },
      { background: "image" },
    ])
      assert.throws(() => model.validateConfig({ ...c, ...patch }));
    for (const patch of [
      { x: 1280 },
      { y: 720 },
      { scale: NaN },
      { scale: 2 },
      { opacity: 0 },
      { visible: "true" },
      { type: "iframe" },
      { text: "a\nb\nc\nd\ne" },
    ])
      assert.throws(() =>
        model.validateConfig({
          ...c,
          widgets: [{ ...c.widgets[0], ...patch }],
        }),
      );
    assert.throws(() =>
      model.validateConfig({ ...c, widgets: [c.widgets[0], c.widgets[0]] }),
    );
    assert.throws(() => model.decodeConfig("%%%"));
  },
);
await check(
  "Official JSON schemas accept public fixtures and reject wrong versions",
  () => {
    for (const channel of ["status", "core", "events"]) {
      api.validateApi(channel, fixture[channel]);
      assert.throws(() =>
        api.validateApi(channel, { ...fixture[channel], schemaVersion: 99 }),
      );
    }
    assert.throws(() =>
      api.validateApi("core", {
        ...fixture.core,
        core: { ...fixture.core.core, blockHeight: "18446744073709551616" },
      }),
    );
  },
);
const until = async (predicate) => {
  for (let n = 0; n < 200; n++) {
    if (predicate()) return;
    await new Promise((r) => setImmediate(r));
  }
  throw new Error("Expected update did not arrive");
};
let now = Date.now();
let latest,
  calls = [],
  client;
await check(
  "Live mapping preserves big heights, units, settled progress and event data",
  async () => {
    client = new api.SqueekClient(
      (feed) => {
        latest = feed;
      },
      async (url) => {
        const channel = new URL(url).pathname.split("/").at(-1);
        calls.push(channel);
        const value = freshFixture(channel, now);
        if (channel === "core") value.core.blockHeight = "9007199254740993123";
        return new Response(JSON.stringify(value), {
          status: 200,
          headers: { ETag: '"test-v1"' },
        });
      },
      () => now,
    );
    client.start();
    await until(
      () =>
        latest && latest.events.health === "ok" && latest.core.health === "ok",
    );
    client.stop();
    const data = api.liveView(latest);
    assert.equal(data.wheel, "running");
    assert.equal(data.rpm, 72.4);
    assert.equal(data.height, "9007199254740993123");
    assert.ok(Math.abs(data.progress - 47.8838171) < 1e-9);
    assert.equal(data.events.length, 5);
    assert.deepEqual(calls.sort(), ["core", "events", "status"]);
  },
);
await check(
  "Stale, faulty, mismatched and missing measurements stay unknown",
  () => {
    for (const update of [
      (feed) => {
        feed.now += 121000;
      },
      (feed) => {
        feed.status.data.measurement.coreStatus = "COUNTER_FAULT";
      },
      (feed) => {
        feed.status.data.measurement = null;
      },
      (feed) => {
        feed.status.data.installationId = "different-installation";
      },
      (feed) => {
        feed.status.health = "error";
      },
      (feed) => {
        feed.status.data.measurement.freshness = "stale";
      },
      (feed) => {
        feed.status.data.measurement.observedAt = new Date(
          feed.now + 60000,
        ).toISOString();
      },
    ]) {
      const feed = clone(latest);
      update(feed);
      const data = api.liveView(feed);
      assert.equal(data.wheel, "unknown");
      assert.equal(data.rpm, null);
    }
    const idle = clone(latest);
    idle.status.data.measurement.coreStatus = "IDLE";
    idle.status.data.measurement.rpmMilli = 0;
    assert.equal(api.liveView(idle).wheel, "idle");
    assert.equal(api.liveView(idle).rpm, 0);
    const stopped = clone(latest);
    stopped.now += 301000;
    stopped.core.checkedAt = stopped.events.checkedAt = stopped.now;
    assert.equal(api.liveView(stopped).height, null);
    assert.equal(api.liveView(stopped).events, null);
    const simulated = clone(latest);
    simulated.status.data.measurement.provenance = "simulated";
    assert.match(api.liveView(simulated).wheelNote, /simulated/);
  },
);
await check(
  "Partial failures preserve only healthy independent channels",
  () => {
    const feed = clone(latest);
    feed.events.health = "rate-limited";
    feed.events.message = "Cooldown";
    assert.equal(api.liveView(feed).events, null);
    assert.equal(api.liveView(feed).height, "9007199254740993123");
    feed.core.health = "unavailable";
    assert.equal(api.liveView(feed).height, null);
    const mismatch = clone(latest);
    mismatch.events.data.identities.core = "different-deployment";
    assert.equal(api.liveView(mismatch).events, null);
  },
);
await check(
  "429 Retry-After is respected, with ETag revalidation and 304 reuse",
  async () => {
    let state,
      statusCalls = 0,
      conditional = "";
    now = Date.now();
    const testClient = new api.SqueekClient(
      (feed) => {
        state = feed;
      },
      async (url, options) => {
        const channel = new URL(url).pathname.split("/").at(-1);
        if (channel !== "status")
          return new Response(JSON.stringify(freshFixture(channel, now)));
        statusCalls++;
        if (statusCalls === 1)
          return new Response("{}", {
            status: 429,
            headers: { "Retry-After": "60" },
          });
        if (statusCalls === 3) {
          conditional = options.headers["If-None-Match"];
          return new Response(null, { status: 304 });
        }
        return new Response(JSON.stringify(freshFixture(channel, now)), {
          headers: { ETag: '"wheel-v2"' },
        });
      },
      () => now,
    );
    testClient.start();
    await until(() => state?.status.health === "rate-limited");
    try {
      await testClient.poll("status");
      assert.equal(statusCalls, 1);
      now += 59000;
      await testClient.poll("status");
      assert.equal(statusCalls, 1);
      now += 1000;
      await testClient.poll("status");
      assert.equal(statusCalls, 2);
      assert.equal(state.status.health, "ok");
      now += 5000;
      await testClient.poll("status");
      assert.equal(conditional, '"wheel-v2"');
      assert.equal(state.status.health, "ok");
    } finally {
      testClient.stop();
    }
  },
);
await check("Delayed 429 and 503 cooldowns start at response receipt, for seconds, HTTP dates and fallback", async () => {
  for (const status of [429, 503]) for (const header of ["3", "date", null, "invalid"]) {
    const start = Date.UTC(2026, 10, 4, 12);
    let clock = start, attempts = 0;
    const testClient = new api.SqueekClient(() => {}, async () => {
      attempts++;
      clock += 8000; // a slow response; no real-time wait
      return new Response("{}", { status, headers: header === null ? {} : {
        "Retry-After": header === "date" ? new Date(start + 11000).toUTCString() : header,
      } });
    }, () => clock);
    await testClient.poll("status");
    const deadline = start + 8000 + (["3", "date"].includes(header) ? 3000 : 15000);
    clock = deadline - 1;
    await testClient.poll("status");
    assert.equal(attempts, 1, `${status} ${header}: retried early`);
    clock = deadline;
    await testClient.poll("status");
    assert.equal(attempts, 2);
    testClient.stop();
  }
});
await check(
  "HTTP-200 unavailable responses never become zero or empty success",
  async () => {
    let state;
    const unavailable = {
      schemaVersion: 1,
      installationId: fixture.core.installationId,
      status: "unavailable",
      reason: "indexer_unavailable",
    };
    const testClient = new api.SqueekClient(
      (feed) => {
        state = feed;
      },
      async (url) => {
        const channel = new URL(url).pathname.split("/").at(-1);
        return new Response(
          JSON.stringify(
            channel === "core" ? unavailable : freshFixture(channel),
          ),
        );
      },
    );
    testClient.start();
    await until(() => state?.core.health === "unavailable");
    testClient.stop();
    assert.equal(api.liveView(state).height, null);
    assert.match(state.core.message, /indexer_unavailable/);
    assert.equal(api.liveView(state).events.length, fixture.events.events.length);
    assert.equal(api.liveView(state).wheel, "running");
  },
);
await check("Unavailable, failed and stale endpoints supply no deployment metadata to healthy independent channels", () => {
  for (const health of ["unavailable", "error", "loading", "stale", "rate-limited"]) {
    const feed = clone(latest);
    feed.core.health = health;
    feed.core.data = { schemaVersion: 1, installationId: "different-outage-installation", status: "unavailable", reason: "indexer_unavailable" };
    let view = api.liveView(feed);
    assert.equal(view.height, null);
    assert.equal(view.wheel, "running");
    assert.equal(view.events.length, fixture.events.events.length);
    assert.doesNotMatch(view.eventsNote, /mismatch/);
    feed.status.health = "error";
    view = api.liveView(feed);
    assert.equal(view.wheel, "unknown");
    assert.equal(view.events.length, fixture.events.events.length);
  }
  const mismatch = clone(latest);
  mismatch.events.data.chain.chainId = "1";
  assert.equal(api.liveView(mismatch).events, null);
  assert.match(api.liveView(mismatch).eventsNote, /deployment mismatch/);
  mismatch.events.health = "unavailable";
  mismatch.events.message = "Source unavailable: indexer_unavailable";
  assert.doesNotMatch(api.liveView(mismatch).eventsNote, /mismatch/);
});

// Captured from the real IMD host. No unsafe-eval or bypassCSP is added for tests.
const hostingCsp = (await readFile("scripts/fixtures/hosting-csp.txt", "utf8")).trim();
assert.ok(!hostingCsp.split(";").find((d) => d.trim().startsWith("script-src ")).includes("'unsafe-eval'"));

const mime = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".json": "application/json",
};
const root = resolve("dist");
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(
      new URL(request.url, "http://localhost").pathname,
    );
    if (!pathname.startsWith("/preview/")) throw new Error("Outside preview");
    if (pathname === "/preview/csp-probe.js") {
      response.writeHead(200, { "Content-Type": "application/javascript", "Content-Security-Policy": hostingCsp });
      response.end('try { new Function("return 1")(); document.documentElement.dataset.evalProbe="allowed"; } catch (error) { document.documentElement.dataset.evalProbe=error.name; }');
      return;
    }
    const filename = resolve(
      root,
      pathname.slice("/preview/".length) || "index.html",
    );
    if (!filename.startsWith(root + sep)) throw new Error("Outside export");
    const body = await readFile(filename);
    response.writeHead(200, {
      "Content-Type": mime[extname(filename)] || "application/octet-stream",
      "Content-Security-Policy": hostingCsp,
    });
    response.end(body);
  } catch {
    response.writeHead(404);
    response.end("Not found");
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const url = `http://127.0.0.1:${server.address().port}/preview/`;
let browser;
const browserErrors = [],
  missingAssets = [];
try {
  browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--no-zygote"],
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 1,
    permissions: ["clipboard-read", "clipboard-write"],
  });
  let apiCalls = 0,
    responseMode = "ok";
  await context.route("https://api.squeekchain.com/**", async (route) => {
    apiCalls++;
    const headers = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,OPTIONS",
      "Access-Control-Allow-Headers": "If-None-Match",
      "Access-Control-Expose-Headers": "ETag,Retry-After",
    };
    if (route.request().method() === "OPTIONS")
      return route.fulfill({ status: 204, headers });
    const channel = new URL(route.request().url()).pathname.split("/").at(-1);
    if (responseMode === "offline") return route.abort("failed");
    if (responseMode === "limited")
      return route.fulfill({
        status: 429,
        headers: { ...headers, "Retry-After": "60" },
        body: '{"error":"rate_limited"}',
      });
    if ((responseMode === "core-outage" && channel === "core") ||
        (responseMode === "events-outage" && channel === "events"))
      return route.fulfill({
        status: 200, headers, contentType: "application/json",
        body: JSON.stringify({
          schemaVersion: channel === "core" ? 1 : 3,
          installationId: "unavailable-source-installation",
          status: "unavailable", reason: "indexer_unavailable",
        }),
      });
    if (responseMode === "schema-mismatch" && channel === "core")
      return route.fulfill({
        status: 200, headers, contentType: "application/json",
        body: JSON.stringify({ ...freshFixture(channel), schemaVersion: 99 }),
      });
    return route.fulfill({
      status: 200,
      headers,
      contentType: "application/json",
      body: JSON.stringify(freshFixture(channel)),
    });
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => browserErrors.push(e.message));
  page.on("response", (response) => {
    if (response.url().startsWith(url) && response.status() >= 400)
      missingAssets.push(response.url());
  });
  const draft = () =>
    page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)),
      model.DRAFT_KEY,
    );
  const labelBounds = async (tab) => {
    await tab.evaluate(() => document.fonts.ready);
    await tab.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    return tab.evaluate(() => {
      const stage = document.querySelector(".overlay-stage").getBoundingClientRect();
      const issues = [];
      for (const label of new Set(document.querySelectorAll(".widget-label-text, .custom-text > div"))) {
        const widget = label.closest(".overlay-widget");
        const box = widget.getBoundingClientRect();
        const range = document.createRange();
        range.selectNodeContents(label);
        const rects = [...range.getClientRects()];
        if (box.left < stage.left - .5 || box.right > stage.right + .5 || box.top < stage.top - .5 || box.bottom > stage.bottom - 32 * stage.width / 1280 + .5)
          issues.push({ type: widget.className, problem: "widget outside safe canvas" });
        for (const r of rects) if (r.width && (r.left < box.left - .5 || r.right > box.right + .5 || r.bottom > box.bottom + .5 || r.bottom > stage.bottom + .5))
          issues.push({ type: widget.className, label: label.textContent, problem: "label outside widget or canvas" });
        if (getComputedStyle(label).textOverflow === "ellipsis" || getComputedStyle(label).overflow === "hidden")
          issues.push({ problem: "label is clipped" });
      }
      return issues;
    });
  };
  await check(
    "Production export loads at a static subpath, with local font and metadata",
    async () => {
      await page.goto(url);
      await page.evaluate(() => document.fonts.ready);
      await expect(
        page.getByRole("heading", { name: "Customize your OBS overlay" }),
      ).toBeVisible();
      assert.equal(
        await page.evaluate(() => document.fonts.check('400 14px "DM Sans"')),
        true,
      );
      for (const selector of [
        'meta[name="description"]',
        'meta[property="og:title"]',
        'meta[property="og:image"]',
        'link[rel="icon"]',
      ])
        assert.ok(await page.locator(selector).count());
      assert.equal(apiCalls, 0);
      // A positive control proves CSP enforcement, instead of merely checking its header.
      await page.evaluate((src) => new Promise((resolve, reject) => {
        // Load asynchronously as an ordinary resource, outside DevTools' evaluation scope.
        const script = document.createElement("script");
        script.src = src;
        script.onload = resolve;
        script.onerror = reject;
        document.head.append(script);
      }), `${url}csp-probe.js`);
      assert.equal(await page.locator("html").getAttribute("data-eval-probe"), "EvalError");
    },
  );
  await check("All templates apply and can be undone", async () => {
    await page
      .getByRole("button", { name: /Minimal Wheel Just the essentials/ })
      .click();
    assert.equal((await draft()).widgets.length, 2);
    await page
      .getByRole("button", { name: /Neon Night For the late-night crew/ })
      .click();
    assert.equal((await draft()).accent, "#c5afff");
    await page.getByRole("button", { name: "Undo layout change" }).click();
    assert.equal((await draft()).template, "minimal");
    await page
      .getByRole("button", { name: /Cozy Broadcast A warm welcome/ })
      .click();
    assert.equal((await draft()).widgets.length, 6);
  });
  await check("Rendered default templates fit the editor and transparent OBS canvas under the hosting CSP", async () => {
    for (const template of ["minimal", "cozy", "neon"]) {
      const config = model.templateConfig(template);
      await page.locator('input[type="file"]').setInputFiles({ name: "default.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(config)) });
      await expect.poll(async () => (await draft()).template).toBe(template);
      assert.deepEqual(await labelBounds(page), []);
      const overlay = await context.newPage();
      const errors = [];
      overlay.on("pageerror", (error) => errors.push(error.message));
      await overlay.goto(`${url}#/overlay?config=${model.encodeConfig(config)}`);
      await expect(overlay.locator(".overlay-widget")).toHaveCount(config.widgets.length);
      assert.deepEqual(await labelBounds(overlay), []);
      assert.deepEqual(errors, []);
      await overlay.close();
    }
    await page.getByRole("button", { name: /Cozy Broadcast A warm welcome/ }).click();
  });
  await check("Every widget wraps 20 W characters, maximum labels and explicit newlines at the right/bottom edge", async () => {
    for (const label of ["W".repeat(20), "W".repeat(36), "A complete label with several words", "轮".repeat(36), "\n".repeat(36)])
      for (const scale of [.5, 1, 1.6]) {
        const config = model.templateConfig("cozy");
        config.widgets = Object.keys(model.WIDGETS).map((type) => model.clampWidget({
          ...model.createWidget(type), label, scale, x: 1280, y: 720,
          text: "W".repeat(29) + "\n" + "W".repeat(29) + "\n" + "W".repeat(29) + "\n" + "W".repeat(30),
        }));
        await page.locator('input[type="file"]').setInputFiles({ name: "edge.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(config)) });
        await expect.poll(async () => (await draft()).widgets[0].label).toBe(label);
        // The label may match the last scenario, so also wait for its expected geometry.
        await expect.poll(async () => (await draft()).widgets[0].scale).toBe(config.widgets[0].scale);
        assert.deepEqual(await labelBounds(page), [], `${JSON.stringify(label)} at ${scale}`);
      }
    await page.getByRole("button", { name: /Cozy Broadcast A warm welcome/ }).click();
    await page.locator(".overlay-widget.type-speed").click();
    await page.getByLabel("Label", { exact: true }).fill("W".repeat(20));
    await page.getByLabel("X position", { exact: true }).fill("1280");
    await page.getByLabel("Y position", { exact: true }).fill("720");
    assert.deepEqual(await labelBounds(page), []);
    const snapshot = await draft();
    // Isolate the edge case in the OBS evidence so another user-positioned layer
    // cannot obscure the label being inspected. Layer overlap is intentional editing behavior.
    snapshot.widgets = snapshot.widgets.filter((w) => w.type === "speed");
    const overlay = await context.newPage();
    await overlay.setViewportSize({ width: 1280, height: 720 });
    await overlay.goto(`${url}#/overlay?config=${model.encodeConfig(snapshot)}`);
    await expect(overlay.locator(".type-speed .widget-label-text")).toHaveText("W".repeat(20));
    assert.deepEqual(await labelBounds(overlay), []);
    await overlay.screenshot({ path: `${output}/long-label-right-edge.png`, omitBackground: true });
    await overlay.close();
    await page.getByRole("button", { name: /Cozy Broadcast A warm welcome/ }).click();
  });
  await check(
    "Add, edit, position, scale, reorder, hide, remove and restore a widget",
    async () => {
      await page.getByRole("button", { name: /^Add widget/ }).click();
      await page.getByRole("button", { name: /Custom text A title/ }).click();
      await page.getByLabel("Label", { exact: true }).fill("On air");
      await page.getByLabel("Text", { exact: true }).fill("Hello, wheel.");
      await page.getByLabel("X position", { exact: true }).fill("80");
      await page.getByLabel("Y position", { exact: true }).fill("100");
      const slider = page.getByRole("slider", { name: "Widget scale" });
      await slider.focus();
      await slider.press("Home");
      await slider.press("ArrowRight");
      let c = await draft(),
        w = c.widgets.at(-1);
      assert.equal(w.label, "On air");
      assert.equal(w.text, "Hello, wheel.");
      assert.equal(w.x, 80);
      assert.equal(w.scale, 0.55);
      const widget = page.getByRole("button", {
        name: "Select On air on canvas",
      });
      await widget.focus();
      await widget.press("ArrowRight");
      assert.equal((await draft()).widgets.at(-1).x, 81);
      const box = await widget.boundingBox();
      await page.mouse.move(box.x + 20, box.y + 20);
      await page.mouse.down();
      await page.mouse.move(box.x + 55, box.y + 40, { steps: 5 });
      await page.mouse.up();
      assert.ok((await draft()).widgets.at(-1).x > 81);
      await page
        .getByRole("button", { name: "Move selected widget earlier" })
        .click();
      c = await draft();
      assert.equal(c.widgets.at(-2).label, "On air");
      await page
        .getByRole("switch", { name: "Show widget", exact: true })
        .uncheck();
      assert.equal((await draft()).widgets.at(-2).visible, false);
      await page
        .getByRole("switch", { name: "Show widget", exact: true })
        .check();
      await page
        .getByRole("button", { name: "Remove widget", exact: true })
        .click();
      assert.equal((await draft()).widgets.length, 6);
      await page.getByRole("button", { name: "Undo layout change" }).click();
      assert.equal((await draft()).widgets.length, 7);
      await page.getByRole("button", { name: "Redo layout change" }).click();
      assert.equal((await draft()).widgets.length, 6);
    },
  );
  await check(
    "Canvas colors and backgrounds persist across a reload",
    async () => {
      await page.getByRole("button", { name: "Canvas", exact: true }).click();
      await page.getByRole("button", { name: "Use accent #a6dfc0" }).click();
      await page
        .getByLabel("Canvas background", { exact: true })
        .selectOption("solid");
      assert.equal((await draft()).background, "solid");
      assert.equal((await draft()).accent, "#a6dfc0");
      await page.reload();
      assert.equal((await draft()).background, "solid");
      await page.getByRole("button", { name: "Canvas", exact: true }).click();
      await page
        .getByLabel("Canvas background", { exact: true })
        .selectOption("transparent");
    },
  );
  await check(
    "Save, load and delete a local preset with modal keyboard focus",
    async () => {
      const trigger = page.getByRole("button", {
        name: "Save preset",
        exact: true,
      });
      await trigger.click();
      const dialog = page.getByRole("dialog");
      await dialog.getByLabel("Preset name").fill("Night shift · cozy");
      await dialog.getByRole("button", { name: "Save preset" }).click();
      await page
        .getByRole("button", { name: /Minimal Wheel Just the essentials/ })
        .click();
      await page
        .getByRole("button", { name: "My presets", exact: true })
        .click();
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Load", exact: true })
        .click();
      assert.equal((await draft()).name, "Night shift · cozy");
      await trigger.click();
      await page.keyboard.press("Escape");
      await expect(trigger).toBeFocused();
      await page
        .getByRole("button", { name: "My presets", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Delete preset Night shift · cozy" })
        .click();
      await page
        .getByRole("button", { name: "Delete preset", exact: true })
        .click();
      await expect(
        page.getByText("A home for your next stream."),
      ).toBeVisible();
      await page.keyboard.press("Escape");
    },
  );
  let exported;
  await check(
    "JSON download, validated import and invalid import recovery work",
    async () => {
      const downloadEvent = page.waitForEvent("download");
      await page
        .getByRole("button", { name: "Export JSON", exact: true })
        .click();
      const download = await downloadEvent;
      const path = `${output}/exported.json`;
      await download.saveAs(path);
      exported = await readFile(path, "utf8");
      model.parseConfig(exported);
      await page.locator('input[type="file"]').setInputFiles({
        name: "bad.json",
        mimeType: "application/json",
        buffer: Buffer.from('{"version":99}'),
      });
      await expect(page.getByRole("alert")).toContainText(
        "Unsupported preset version",
      );
      await page.locator('input[type="file"]').setInputFiles({
        name: "stream.json",
        mimeType: "application/json",
        buffer: Buffer.from(exported),
      });
      await expect(page.getByRole("alert")).toHaveCount(0);
      assert.equal((await draft()).name, "Night shift · cozy");
    },
  );
  await check(
    "OBS link copies a portable snapshot, with no editor chrome and true transparency",
    async () => {
      await page
        .getByRole("button", { name: "Get overlay link", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Copy overlay link", exact: true })
        .click();
      const link = await page.getByLabel("Your overlay URL").inputValue();
      assert.equal(
        await page.evaluate(() => navigator.clipboard.readText()),
        link,
      );
      const clean = await browser.newContext({
        viewport: { width: 1280, height: 720 },
      });
      const overlay = await clean.newPage();
      await overlay.goto(link);
      await expect(overlay.locator(".source-stamp")).toContainText(
        "Demo · simulated data",
      );
      await expect(overlay.locator("button,footer,header,dialog")).toHaveCount(
        0,
      );
      await expect(overlay.locator(".scene-art")).toHaveCount(0);
      assert.equal(
        await overlay.evaluate(
          () => getComputedStyle(document.documentElement).backgroundColor,
        ),
        "rgba(0, 0, 0, 0)",
      );
      await overlay.screenshot({
        path: `${output}/overlay.png`,
        omitBackground: true,
      });
      await clean.close();
      await page.keyboard.press("Escape");
    },
  );
  await check(
    "Live mode shows real-shaped schema-validated telemetry and events",
    async () => {
      await page.getByRole("button", { name: "Live", exact: true }).click();
      await expect(page.locator(".data-status")).toContainText("Live data");
      await expect(page.locator(".wheel-state")).toHaveText("Running");
      await expect(page.locator(".type-speed .numeric")).toContainText("72.4");
      await expect(page.locator(".source-stamp")).toContainText(
        "Live source · sepolia",
      );
      assert.ok(apiCalls >= 3);
    },
  );
  await check(
    "Unavailable and rate-limited live sources show unknown values and retry details",
    async () => {
      responseMode = "offline";
      await page.reload();
      await expect(page.locator(".wheel-state")).toHaveText("Unknown");
      await expect(page.locator(".data-status")).toContainText(
        "Source needs attention",
      );
      await page.locator(".source-details summary").click();
      await expect(page.locator(".source-list")).toContainText(
        "Cannot reach Squeekchain",
      );
      responseMode = "limited";
      await page.reload();
      await expect(page.locator(".data-status")).toContainText("Rate limited");
      await expect(page.locator(".type-block .numeric")).toHaveText("Unknown");
      await page.locator(".source-details summary").click();
      await expect(page.locator(".source-list")).toContainText("Retry in");
      responseMode = "ok";
      await page.getByRole("button", { name: "Demo", exact: true }).click();
    },
  );
  await check("Independent endpoint outages and schema mismatches are distinct in the rendered live editor", async () => {
    for (const mode of ["core-outage", "events-outage", "schema-mismatch"]) {
      responseMode = mode;
      await page.getByRole("button", { name: "Live", exact: true }).click();
      await page.reload();
      await expect(page.locator(".wheel-state")).toHaveText("Running");
      await expect(page.locator(".data-status")).toContainText("Source needs attention");
      await page.locator(".source-details summary").click();
      const sources = page.locator(".source-list");
      await expect(sources).not.toContainText("deployment mismatch");
      await expect(sources).not.toContainText("installation mismatch");
      if (mode === "events-outage") {
        await expect(page.locator(".type-block .numeric")).not.toHaveText("Unknown");
        await expect(page.locator(".type-events .event-empty")).toContainText("unavailable");
        await expect(sources).toContainText("Source unavailable: indexer_unavailable");
      } else {
        await expect(page.locator(".type-block .numeric")).toHaveText("Unknown");
        await expect(page.locator(".overlay-event")).toHaveCount(3);
        await expect(page.locator(".type-events .event-empty")).toHaveCount(0);
        if (mode === "schema-mismatch")
          await expect(sources).toContainText("Schema mismatch in core response");
        else await expect(sources).toContainText("Source unavailable: indexer_unavailable");
      }
    }
    responseMode = "ok";
    await page.getByRole("button", { name: "Demo", exact: true }).click();
  });
  await check(
    "Mobile layouts have no horizontal overflow and retain the primary action",
    async () => {
      await page
        .getByRole("button", { name: /Cozy Broadcast A warm welcome/ })
        .click();
      for (const width of [320, 390, 760, 1024, 1440]) {
        await page.setViewportSize({ width, height: width < 761 ? 844 : 1000 });
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.evaluate(() => new Promise(requestAnimationFrame));
        const size = await page.evaluate(() => ({
          scroll: document.documentElement.scrollWidth,
          client: document.documentElement.clientWidth,
        }));
        assert.ok(
          size.scroll <= size.client + 1,
          `Overflow at ${width}: ${size.scroll} > ${size.client}`,
        );
        await expect(
          page.getByRole("button", { name: "Get overlay link", exact: true }),
        ).toBeInViewport();
        if (width === 390) {
          await page.screenshot({
            path: `${output}/mobile.png`,
            fullPage: true,
          });
          await page.screenshot({ path: `${output}/mobile-first-screen.png` });
        }
      }
      await page.screenshot({ path: `${output}/desktop.png`, fullPage: true });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.getByRole("button", { name: "Widgets", exact: true }).click();
      await expect(
        page.getByRole("button", { name: /^Add widget/ }),
      ).toBeVisible();
      await page.getByRole("button", { name: "Style", exact: true }).click();
      await expect(
        page.getByRole("button", { name: "Canvas", exact: true }),
      ).toBeVisible();
      await page
        .getByRole("button", { name: "Get overlay link", exact: true })
        .click();
      await expect(
        page.getByRole("button", { name: "Copy overlay link", exact: true }),
      ).toBeVisible();
      await page.keyboard.press("Escape");
    },
  );
  await check("Reduced motion and keyboard focus remain usable", async () => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1440, height: 1000 });
    assert.equal(
      await page.evaluate(
        () =>
          document
            .getAnimations()
            .filter((a) => a.effect?.getTiming().iterations === Infinity)
            .length,
      ),
      0,
    );
    await page
      .getByRole("button", { name: "Get overlay link", exact: true })
      .focus();
    assert.equal(
      await page
        .getByRole("button", { name: "Get overlay link", exact: true })
        .evaluate((e) => getComputedStyle(e).outlineStyle),
      "solid",
    );
    await page.screenshot({ path: `${output}/keyboard-focus.png` });
  });
  await check("No page script errors or missing local assets", () => {
    assert.deepEqual(browserErrors, []);
    assert.deepEqual(missingAssets, []);
  });
  await check("Axe WCAG audit on desktop, mobile and OBS dialog", async () => {
    const audits = [];
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      const result = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze();
      audits.push({
        width,
        violations: result.violations,
        incomplete: result.incomplete,
      });
      await writeFile(`${output}/axe.json`, JSON.stringify(audits, null, 2));
      assert.deepEqual(
        result.violations.map((v) => ({
          id: v.id,
          nodes: v.nodes.map((n) => n.target),
        })),
        [],
      );
    }
    await page
      .getByRole("button", { name: "Get overlay link", exact: true })
      .click();
    for (let index = 0; index < 15; index++) {
      await page.keyboard.press("Tab");
      assert.equal(
        await page.evaluate(() =>
          document.querySelector("dialog").contains(document.activeElement),
        ),
        true,
      );
    }
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    audits.push({
      width: 390,
      view: "OBS dialog",
      violations: result.violations,
      incomplete: result.incomplete,
    });
    await writeFile(`${output}/axe.json`, JSON.stringify(audits, null, 2));
    assert.deepEqual(
      result.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => n.target),
      })),
      [],
    );
    await page.keyboard.press("Escape");
  });
  await context.close();
  // Run the same core action in WebKit when that runtime is installed.
  try {
    const safari = await webkit.launch({ headless: true });
    try {
      const tab = await safari.newPage({
        viewport: { width: 390, height: 844 },
      });
      await tab.goto(url);
      await tab
        .getByRole("button", { name: "Get overlay link", exact: true })
        .click();
      await expect(tab.getByRole("dialog")).toBeVisible();
      checks.push({ name: "WebKit primary OBS setup action", passed: true });
      console.log("PASS WebKit primary OBS setup action");
    } finally {
      await safari.close();
    }
  } catch (error) {
    checks.push({
      name: "WebKit primary OBS setup action",
      passed: null,
      limitation: error.message.split("\n")[0],
    });
    console.log("LIMITATION WebKit runtime unavailable");
  }
} finally {
  if (browser) await browser.close();
  await new Promise((r) => server.close(r));
  await writeFile(
    `${output}/results.json`,
    JSON.stringify({ checks, browserErrors, missingAssets }, null, 2),
  );
}
console.log(
  `${checks.filter((c) => c.passed).length} checks passed; ${checks.filter((c) => c.passed === null).length} runtime limitations.`,
);
