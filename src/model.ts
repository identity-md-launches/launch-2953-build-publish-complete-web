export const WIDTH = 1280;
export const HEIGHT = 720;
export const MAX_WIDGETS = 12;
export const MAX_JSON_BYTES = 65536;
export const DRAFT_KEY = "squeek-studio:draft:v1";
export const PRESETS_KEY = "squeek-studio:presets:v1";
export type WidgetType =
  | "wheel"
  | "speed"
  | "block"
  | "progress"
  | "events"
  | "text";
export type TemplateId = "minimal" | "cozy" | "neon";
export type DataMode = "demo" | "live";
export interface Widget {
  id: string;
  type: WidgetType;
  label: string;
  text: string;
  x: number;
  y: number;
  scale: number;
  opacity: number;
  background: boolean;
  visible: boolean;
}
export interface StudioConfig {
  version: 1;
  name: string;
  template: TemplateId;
  mode: DataMode;
  accent: string;
  textColor: string;
  panelColor: string;
  background: "transparent" | "solid";
  backgroundColor: string;
  widgets: Widget[];
}
export interface Preset {
  id: string;
  savedAt: string;
  config: StudioConfig;
}
export const WIDGETS: Record<
  WidgetType,
  { name: string; description: string; width: number; height: number }
> = {
  wheel: {
    name: "Wheel status",
    description: "Running, idle or unknown",
    width: 304,
    height: 140,
  },
  speed: {
    name: "Wheel speed",
    description: "RPM and running speed",
    width: 204,
    height: 140,
  },
  block: {
    name: "Settled blocks",
    description: "Confirmed Squeek block height",
    width: 262,
    height: 140,
  },
  progress: {
    name: "Block progress",
    description: "Settled progress to the next block",
    width: 318,
    height: 140,
  },
  events: {
    name: "Recent events",
    description: "The latest from Squeekchain",
    width: 338,
    height: 228,
  },
  text: {
    name: "Custom text",
    description: "A title, a note, a little personality",
    width: 540,
    height: 286,
  },
};
export const TEMPLATES: {
  id: TemplateId;
  name: string;
  description: string;
  accent: string;
}[] = [
  {
    id: "minimal",
    name: "Minimal Wheel",
    description: "Just the essentials",
    accent: "#f2c078",
  },
  {
    id: "cozy",
    name: "Cozy Broadcast",
    description: "A warm welcome",
    accent: "#f2c078",
  },
  {
    id: "neon",
    name: "Neon Night",
    description: "For the late-night crew",
    accent: "#c5afff",
  },
];
export function createWidget(type: WidgetType, index = 0): Widget {
  return {
    id: crypto.randomUUID(),
    type,
    label: WIDGETS[type].name,
    text: "A little wheel.\nA whole lot of heart.",
    x: 32 + (index % 5) * 24,
    y: 32 + (index % 5) * 24,
    scale: 1,
    opacity: 1,
    background: true,
    visible: true,
  };
}
export function templateConfig(
  template: TemplateId,
  mode: DataMode = "demo",
): StudioConfig {
  const c: StudioConfig = {
    version: 1,
    name: "My cozy stream",
    template,
    mode,
    accent: template === "neon" ? "#c5afff" : "#f2c078",
    textColor: "#f5f0e6",
    panelColor: template === "neon" ? "#191527" : "#1b211b",
    background: "transparent",
    backgroundColor: "#101612",
    widgets: [],
  };
  const add = (type: WidgetType, x: number, y: number, background = true) =>
    c.widgets.push({ ...createWidget(type), x, y, background });
  if (template === "minimal") {
    c.name = "My minimal stream";
    add("wheel", 32, 536);
    add("block", 356, 536);
  } else {
    if (template === "neon") c.name = "My midnight stream";
    add("wheel", 32, 536);
    add("speed", 352, 536);
    add("block", 572, 536);
    add("progress", 850, 536);
    add("text", 40, 44, false);
    add("events", 902, 36);
    if (template === "neon")
      c.widgets[4].text = "One more round.\nOne more squeek.";
  }
  return c;
}
export function clampWidget(widget: Widget): Widget {
  const size = widgetSize(widget);
  const scale = Math.max(0.5, Math.min(1.6, widget.scale));
  return {
    ...widget,
    scale,
    x: Math.round(Math.max(0, Math.min(WIDTH - size.width * scale, widget.x))),
    y: Math.round(
      Math.max(0, Math.min(HEIGHT - size.height * scale - 32, widget.y)),
    ),
  };
}
export function widgetSize(widget: Widget) {
  const size = WIDGETS[widget.type];
  return {
    width: size.width,
    height: size.height + (widget.label.length > 20 ? 70 : 0),
  };
}
function obj(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Expected a JSON object.");
  return value as Record<string, unknown>;
}
function str(v: unknown, label: string, max = 80) {
  if (
    typeof v !== "string" ||
    v.length > max ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v)
  )
    throw new Error(`${label} must be text of at most ${max} characters.`);
  return v;
}
function num(v: unknown, min: number, max: number, label: string) {
  if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max)
    throw new Error(`${label} must be between ${min} and ${max}.`);
  return v;
}
function bool(v: unknown, label: string) {
  if (typeof v !== "boolean")
    throw new Error(`${label} must be true or false.`);
  return v;
}
function choice<T extends string>(
  v: unknown,
  choices: readonly T[],
  label: string,
): T {
  if (typeof v !== "string" || !choices.includes(v as T))
    throw new Error(`${label} is not supported.`);
  return v as T;
}
function color(v: unknown) {
  const s = str(v, "Color", 7);
  if (!/^#[0-9a-fA-F]{6}$/.test(s))
    throw new Error("Colors must use six-digit hex values, such as #f2c078.");
  return s;
}
export function validateConfig(value: unknown): StudioConfig {
  const c = obj(value);
  if (c.version !== 1)
    throw new Error(
      "Unsupported preset version. Import a Squeek Studio version 1 preset.",
    );
  if (!Array.isArray(c.widgets) || c.widgets.length > MAX_WIDGETS)
    throw new Error(`Use at most ${MAX_WIDGETS} widgets.`);
  const ids = new Set<string>();
  const widgets = c.widgets.map((item) => {
    const w = obj(item);
    const id = str(w.id, "Widget ID", 64);
    if (!/^[\w-]{1,64}$/.test(id) || ids.has(id))
      throw new Error(
        "Widget IDs must be unique and contain only letters, numbers, underscores or hyphens.",
      );
    ids.add(id);
    const type = choice(
      w.type,
      Object.keys(WIDGETS) as WidgetType[],
      "Widget type",
    );
    const widget: Widget = {
      id,
      type,
      label: str(w.label, "Widget label", 36),
      text: str(w.text, "Widget text", 120),
      x: num(w.x, 0, WIDTH, "X position"),
      y: num(w.y, 0, HEIGHT, "Y position"),
      scale: num(w.scale, 0.5, 1.6, "Scale"),
      opacity: num(w.opacity, 0.3, 1, "Opacity"),
      background: bool(w.background, "Widget background"),
      visible: bool(w.visible, "Widget visibility"),
    };
    if (widget.text.split("\n").length > 4)
      throw new Error("Custom text can have up to four lines.");
    const clamped = clampWidget(widget);
    if (
      Math.abs(clamped.x - widget.x) > 0.51 ||
      Math.abs(clamped.y - widget.y) > 0.51
    )
      throw new Error(
        "A widget is outside the canvas. Move it inside the 1280 × 720 safe area.",
      );
    return widget;
  });
  const name = str(c.name, "Preset name", 48).trim();
  if (!name) throw new Error("Give the preset a name.");
  return {
    version: 1,
    name,
    template: choice(c.template, ["minimal", "cozy", "neon"], "Template"),
    mode: choice(c.mode, ["live", "demo"], "Data mode"),
    accent: color(c.accent),
    textColor: color(c.textColor),
    panelColor: color(c.panelColor),
    background: choice(c.background, ["transparent", "solid"], "Background"),
    backgroundColor: color(c.backgroundColor),
    widgets,
  };
}
export function parseConfig(json: string): StudioConfig {
  if (new TextEncoder().encode(json).length > MAX_JSON_BYTES)
    throw new Error("Preset files must be 64 KiB or smaller.");
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    throw new Error(
      "This file is not valid JSON. Choose a Squeek Studio preset export.",
    );
  }
  return validateConfig(value);
}
export function encodeConfig(config: StudioConfig) {
  const bytes = new TextEncoder().encode(
    JSON.stringify(validateConfig(config)),
  );
  return btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(""))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
export function decodeConfig(encoded: string) {
  if (encoded.length > MAX_JSON_BYTES * 1.4 || !/^[\w-]+$/.test(encoded))
    throw new Error("The overlay link contains an invalid preset.");
  try {
    return parseConfig(
      new TextDecoder("utf-8", { fatal: true }).decode(
        Uint8Array.from(
          atob(encoded.replace(/-/g, "+").replace(/_/g, "/")),
          (c) => c.charCodeAt(0),
        ),
      ),
    );
  } catch (e) {
    throw new Error(
      `Unable to open this overlay. ${e instanceof Error ? e.message : "Invalid link."}`,
    );
  }
}
export function overlayUrl(config: StudioConfig) {
  return `${location.href.split("#")[0]}#/overlay?config=${encodeConfig(config)}`;
}
export function readDraft(): { config: StudioConfig; warning: string } {
  try {
    const saved = localStorage.getItem(DRAFT_KEY);
    return {
      config: saved ? parseConfig(saved) : templateConfig("cozy"),
      warning: "",
    };
  } catch {
    return {
      config: templateConfig("cozy"),
      warning:
        "The saved draft could not be restored. A fresh layout is ready; local storage may be unavailable.",
    };
  }
}
export function readPresets(): { presets: Preset[]; warning: string } {
  try {
    const json = localStorage.getItem(PRESETS_KEY);
    if (!json) return { presets: [], warning: "" };
    if (json.length > MAX_JSON_BYTES * 20) throw new Error("Too large");
    const list: unknown = JSON.parse(json);
    if (!Array.isArray(list) || list.length > 20)
      throw new Error("Invalid list");
    return {
      presets: list.map((p) => {
        const v = obj(p);
        return {
          id: str(v.id, "Preset ID", 64),
          savedAt: str(v.savedAt, "Date", 40),
          config: validateConfig(v.config),
        };
      }),
      warning: "",
    };
  } catch {
    return {
      presets: [],
      warning:
        "Saved presets could not be read. Export a JSON backup before clearing browser storage.",
    };
  }
}
