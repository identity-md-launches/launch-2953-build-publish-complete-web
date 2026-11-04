import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, CSSProperties, FormEvent } from "react";
import {
  Canvas,
  DataStatus,
  MiniTemplate,
  typeIcon,
} from "./components/Canvas";
import type { PreviewBackground } from "./components/Canvas";
import { BrandMark, Icon } from "./components/Icons";
import type { IconName } from "./components/Icons";
import { Modal } from "./components/Modal";
import { API_BASE, resourceHealth, useSqueekData } from "./api";
import type { Channel, ViewData } from "./api";
import {
  DRAFT_KEY,
  MAX_JSON_BYTES,
  MAX_WIDGETS,
  PRESETS_KEY,
  TEMPLATES,
  WIDGETS,
  clampWidget,
  createWidget,
  decodeConfig,
  overlayUrl,
  parseConfig,
  readDraft,
  readPresets,
  templateConfig,
} from "./model";
import type { Preset, StudioConfig, Widget, WidgetType } from "./model";

type Dialog =
  | "obs"
  | "add"
  | "save"
  | "presets"
  | "preview"
  | "delete-preset"
  | null;
interface History {
  current: StudioConfig;
  past: StudioConfig[];
  future: StudioConfig[];
}
function IconButton({
  icon,
  label,
  onClick,
  disabled = false,
}: {
  icon: IconName;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className="icon-button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
    >
      <Icon name={icon} />
    </button>
  );
}
function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="toggle-row">
      <span>{label}</span>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="switch-track" aria-hidden="true" />
    </label>
  );
}
function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="color-field">
      <span>{label}</span>
      <span className="color-input">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label={label}
        />
        <span>{value.toUpperCase()}</span>
      </span>
    </label>
  );
}
function Sources({ data }: { data: ViewData }) {
  return (
    <details className="source-details">
      <summary>
        <span>
          <Icon name="events" size={16} />
          Data source
        </span>
        <span>
          {data.mode === "demo" ? "Simulated" : "Squeekchain API"}
          <Icon name="down" size={14} />
        </span>
      </summary>
      {data.mode === "demo" ? (
        <p>
          This preview uses simulated wheel activity, blocks and events. Switch
          to Live to use the public Squeekchain API. Demo labels stay visible in
          OBS.
        </p>
      ) : (
        <>
          <p>
            Public read-only data. The API currently serves Sepolia, with chain
            reads delayed by 12 confirmations.
          </p>
          <div className="source-list">
            {(["status", "core", "events"] as Channel[]).map((channel) => {
              const resource = data.feed![channel],
                health = resourceHealth(resource, data.feed!.now);
              return (
                <div key={channel}>
                  <a
                    href={`${API_BASE}/v1/${channel}${channel === "events" ? "?limit=5" : ""}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    /v1/{channel}
                    <Icon name="external" size={12} />
                  </a>
                  <span className={health === "ok" ? "mint" : "secondary"}>
                    {health}
                  </span>
                  <p>
                    {channel === "status"
                      ? data.wheelNote
                      : channel === "core"
                        ? data.coreNote
                        : data.eventsNote}
                    {resource.retryAt > data.feed!.now
                      ? ` Retry in ${Math.ceil((resource.retryAt - data.feed!.now) / 1000)}s.`
                      : ""}
                  </p>
                  {resource.checkedAt > 0 && (
                    <small>
                      Last checked{" "}
                      {new Date(resource.checkedAt).toLocaleTimeString()}
                    </small>
                  )}
                </div>
              );
            })}
          </div>
          <p>
            Unknown values mean missing, invalid, stale or unavailable data.
            Cached values are hidden when their source needs attention. An
            unchanged safe chain frontier is marked stale after 5 minutes.
          </p>
        </>
      )}
      <a
        className="text-link"
        href="https://docs.squeekchain.com/developers/api/"
        target="_blank"
        rel="noreferrer"
      >
        Read the API reference
        <Icon name="external" size={14} />
      </a>
    </details>
  );
}
function Overlay() {
  const parsed = useMemo(() => {
    try {
      const encoded = new URLSearchParams(
        location.hash.split("?")[1] || "",
      ).get("config");
      return {
        config: encoded
          ? decodeConfig(encoded)
          : templateConfig("minimal", "live"),
        error: "",
      };
    } catch (error) {
      return {
        config: templateConfig("minimal", "live"),
        error: error instanceof Error ? error.message : "Invalid overlay link.",
      };
    }
  }, []);
  const data = useSqueekData(parsed.config.mode);
  useEffect(() => {
    document.documentElement.dataset.view = "overlay";
    document.title = `${parsed.config.name} · Squeek Studio Overlay`;
    return () => {
      delete document.documentElement.dataset.view;
    };
  }, [parsed.config.name]);
  if (parsed.error)
    return (
      <div className="overlay-error" role="alert">
        {parsed.error} Generate a fresh overlay link in Squeek Studio.
      </div>
    );
  return (
    <main className="obs-output" aria-label="Squeek Studio broadcast overlay">
      <Canvas config={parsed.config} data={data} />
    </main>
  );
}
function Editor() {
  const [initial] = useState(readDraft);
  const [initialPresets] = useState(readPresets);
  const [history, setHistory] = useState<History>({
    current: initial.config,
    past: [],
    future: [],
  });
  const config = history.current;
  const [selectedId, setSelectedId] = useState(config.widgets[0]?.id || "");
  const selected = config.widgets.find((widget) => widget.id === selectedId);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [presets, setPresets] = useState<Preset[]>(initialPresets.presets);
  const [deleteId, setDeleteId] = useState("");
  const [presetName, setPresetName] = useState(config.name);
  const [saveError, setSaveError] = useState("");
  const [notice, setNotice] = useState("");
  const [warning, setWarning] = useState(
    initial.warning || initialPresets.warning,
  );
  const [importError, setImportError] = useState("");
  const [background, setBackground] = useState<PreviewBackground>("scene");
  const [guides, setGuides] = useState(false);
  const [paused, setPaused] = useState(false);
  const [styleTab, setStyleTab] = useState<"widget" | "canvas">("widget");
  const [mobilePane, setMobilePane] = useState<
    "templates" | "widgets" | "style"
  >("templates");
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const data = useSqueekData(config.mode, paused);
  const closeDialog = useCallback(() => setDialog(null), []);
  const update = useCallback(
    (
      change: Partial<StudioConfig> | ((current: StudioConfig) => StudioConfig),
      record = true,
    ) => {
      setHistory((h) => ({
        current:
          typeof change === "function"
            ? change(h.current)
            : { ...h.current, ...change },
        past: record ? [...h.past.slice(-49), h.current] : h.past,
        future: [],
      }));
    },
    [],
  );
  const beginDrag = useCallback(
    () =>
      setHistory((h) => ({
        ...h,
        past: [...h.past.slice(-49), h.current],
        future: [],
      })),
    [],
  );
  const updateWidget = useCallback(
    (id: string, patch: Partial<Widget>, record = true) =>
      update(
        (c) => ({
          ...c,
          widgets: c.widgets.map((w) =>
            w.id === id ? clampWidget({ ...w, ...patch }) : w,
          ),
        }),
        record,
      ),
    [update],
  );
  const undo = useCallback(
    () =>
      setHistory((h) =>
        h.past.length
          ? {
              current: h.past[h.past.length - 1],
              past: h.past.slice(0, -1),
              future: [h.current, ...h.future],
            }
          : h,
      ),
    [],
  );
  const redo = useCallback(
    () =>
      setHistory((h) =>
        h.future.length
          ? {
              current: h.future[0],
              past: [...h.past, h.current],
              future: h.future.slice(1),
            }
          : h,
      ),
    [],
  );
  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(config));
    } catch {
      setWarning(
        "Local storage is unavailable or full. Export JSON to keep a copy of this layout.",
      );
    }
  }, [config]);
  useEffect(() => {
    if (!config.widgets.some((w) => w.id === selectedId))
      setSelectedId(config.widgets[0]?.id || "");
  }, [config.widgets, selectedId]);
  useEffect(() => {
    const keyboard = (event: globalThis.KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (
        target.closest("input,textarea,select,dialog") ||
        target.isContentEditable
      )
        return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        event.shiftKey ? redo() : undo();
      }
    };
    window.addEventListener("keydown", keyboard);
    return () => window.removeEventListener("keydown", keyboard);
  }, [undo, redo]);
  function select(id: string) {
    setSelectedId(id);
    setStyleTab("widget");
  }
  function addWidget(type: WidgetType) {
    if (config.widgets.length >= MAX_WIDGETS) return;
    const widget = createWidget(type, config.widgets.length);
    update({ widgets: [...config.widgets, widget] });
    select(widget.id);
    setDialog(null);
    setMobilePane("style");
    setNotice(
      `${WIDGETS[type].name} added. Drag it in the preview or edit its position.`,
    );
  }
  function reorder(id: string, direction: number) {
    const index = config.widgets.findIndex((w) => w.id === id),
      target = index + direction;
    if (target < 0 || target >= config.widgets.length) return;
    const widgets = [...config.widgets];
    [widgets[index], widgets[target]] = [widgets[target], widgets[index]];
    update({ widgets });
  }
  function exportJson() {
    const blob = new Blob([JSON.stringify(config, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob),
      link = document.createElement("a");
    link.href = url;
    link.download = `${
      config.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || "squeek-overlay"
    }.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice("Preset JSON exported.");
  }
  async function importJson(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      if (file.size > MAX_JSON_BYTES)
        throw new Error("Choose a JSON preset smaller than 64 KiB.");
      const next = parseConfig(await file.text());
      update(next);
      setSelectedId(next.widgets[0]?.id || "");
      setImportError("");
      setNotice(`Imported “${next.name}”. You can undo this change.`);
    } catch (error) {
      setImportError(
        error instanceof Error
          ? error.message
          : "Unable to read the preset. Choose a valid JSON export.",
      );
      setMobilePane("widgets");
    }
    event.target.value = "";
  }
  function storePresets(next: Preset[]) {
    try {
      localStorage.setItem(PRESETS_KEY, JSON.stringify(next));
      setPresets(next);
      return true;
    } catch {
      setSaveError("Unable to save in this browser. Export JSON as a backup.");
      return false;
    }
  }
  function savePreset(event: FormEvent) {
    event.preventDefault();
    const name = presetName.trim();
    if (!name) {
      setSaveError("Give this preset a name.");
      return;
    }
    if (presets.length >= 20) {
      setSaveError("You have 20 saved presets. Delete one or export JSON.");
      return;
    }
    const next = { ...config, name };
    if (
      storePresets([
        {
          id: crypto.randomUUID(),
          savedAt: new Date().toISOString(),
          config: next,
        },
        ...presets,
      ])
    ) {
      update({ name });
      setDialog(null);
      setNotice(`“${name}” saved in this browser.`);
    }
  }
  const link = useMemo(() => overlayUrl(config), [config]);
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setNotice("Overlay link copied. Paste it into an OBS Browser source.");
    } catch {
      setNotice(
        "Automatic copy is unavailable. Select and copy the overlay URL below.",
      );
      document.querySelector<HTMLInputElement>("#overlay-url")?.select();
    }
  }
  useEffect(() => setCopied(false), [link]);
  function openSave() {
    setPresetName(config.name);
    setSaveError("");
    setDialog("save");
  }
  const selectionIndex = config.widgets.findIndex((w) => w.id === selectedId);

  return (
    <div className="studio-app">
      <a className="skip-link" href="#workspace">
        Skip to overlay editor
      </a>
      <header className="app-header">
        <a className="brand" href="#" aria-label="Squeek Studio home">
          <BrandMark />
          <span>
            Squeek<span className="brand-studio"> Studio</span>
            <span className="brand-tagline">
              A little wheel. A better broadcast.
            </span>
          </span>
        </a>
        <div className="header-actions">
          <button
            type="button"
            className="button quiet help-button"
            onClick={() => setDialog("obs")}
          >
            <Icon name="help" />
            <span>OBS setup</span>
          </button>
          <button
            type="button"
            className="button quiet presets-button"
            aria-label="My presets"
            onClick={() => setDialog("presets")}
          >
            <Icon name="folder" />
            <span>My presets</span>
            {presets.length > 0 && (
              <span className="count">{presets.length}</span>
            )}
          </button>
          <button
            type="button"
            className="button primary"
            onClick={() => {
              setCopied(false);
              setDialog("obs");
            }}
          >
            <Icon name="link" />
            <span>Get overlay link</span>
          </button>
        </div>
      </header>
      <main id="workspace">
        <div className="workspace-heading">
          <div>
            <h1>Customize your OBS overlay</h1>
            <p>Make the wheel part of your stream.</p>
          </div>
          <div className="project-tools">
            <span className="draft-state">
              <span className="status-dot" />
              {warning ? "Local save needs attention" : "Draft saved locally"}
            </span>
            <button
              type="button"
              className="button secondary-button"
              aria-label="Save preset"
              onClick={openSave}
            >
              <Icon name="save" />
              <span>Save preset</span>
            </button>
          </div>
        </div>
        {warning && (
          <div className="warning-banner" role="alert">
            <Icon name="info" />
            <span>{warning}</span>
            <IconButton
              icon="close"
              label="Dismiss storage warning"
              onClick={() => setWarning("")}
            />
          </div>
        )}
        <div className={`workspace mobile-pane-${mobilePane}`}>
          <section className="preview-column" aria-label="Overlay preview">
            <div className="preview-toolbar">
              <div className="preview-label">
                <Icon name="monitor" />
                <h2>Stream preview</h2>
                <span className="resolution">1280 × 720</span>
              </div>
              <div className="preview-tools">
                <IconButton
                  icon="undo"
                  label="Undo layout change"
                  onClick={undo}
                  disabled={!history.past.length}
                />
                <IconButton
                  icon="redo"
                  label="Redo layout change"
                  onClick={redo}
                  disabled={!history.future.length}
                />
                <span className="tool-separator" />
                <IconButton
                  icon="expand"
                  label="Open large preview"
                  onClick={() => setDialog("preview")}
                />
              </div>
            </div>
            <div className="preview-mat">
              <Canvas
                config={config}
                data={data}
                editable
                selected={selectedId}
                background={background}
                guides={guides}
                onSelect={select}
                onChangeWidget={updateWidget}
                onDragStart={beginDrag}
              />
            </div>
            <div className="canvas-tools">
              <label className="background-select">
                <Icon name="layers" size={16} />
                <select
                  aria-label="Preview background"
                  value={background}
                  onChange={(e) =>
                    setBackground(e.target.value as PreviewBackground)
                  }
                >
                  <option value="scene">Forest scene</option>
                  <option value="checker">Transparency grid</option>
                  <option value="dark">Dark background</option>
                </select>
              </label>
              <div className="canvas-utilities">
                <button
                  type="button"
                  className={`small-button ${guides ? "active" : ""}`}
                  aria-pressed={guides}
                  onClick={() => setGuides(!guides)}
                >
                  <Icon name="grid" size={16} />
                  <span>Guides</span>
                </button>
                <span className="zoom-label">Fit to view</span>
              </div>
            </div>
            <div className="mode-bar">
              <DataStatus data={data} />
              <div
                className="segmented mode-switch"
                role="group"
                aria-label="Data mode"
              >
                <button
                  type="button"
                  aria-pressed={config.mode === "demo"}
                  className={config.mode === "demo" ? "selected" : ""}
                  onClick={() => update({ mode: "demo" })}
                >
                  Demo
                </button>
                <button
                  type="button"
                  aria-pressed={config.mode === "live"}
                  className={config.mode === "live" ? "selected" : ""}
                  onClick={() => update({ mode: "live" })}
                >
                  Live
                </button>
              </div>
              {config.mode === "demo" && (
                <IconButton
                  icon={paused ? "play" : "pause"}
                  label={
                    paused ? "Resume demo animation" : "Pause demo animation"
                  }
                  onClick={() => setPaused(!paused)}
                />
              )}
            </div>
            <p className="preview-hint">
              <Icon name="info" size={15} />
              {config.mode === "demo"
                ? "Simulated data for styling. Switch to Live for Squeekchain."
                : data.health === "ok"
                  ? `Reading ${data.source}. Wheel: ${data.wheel}.`
                  : "Some live data is unavailable. Open Data source for details."}
            </p>
            <nav className="mobile-tabs" aria-label="Editor panels">
              {(["templates", "widgets", "style"] as const).map((pane) => (
                <button
                  key={pane}
                  type="button"
                  className={mobilePane === pane ? "selected" : ""}
                  aria-pressed={mobilePane === pane}
                  onClick={() => setMobilePane(pane)}
                >
                  <Icon
                    name={
                      pane === "templates"
                        ? "grid"
                        : pane === "widgets"
                          ? "layers"
                          : "settings"
                    }
                    size={16}
                  />
                  {pane[0].toUpperCase() + pane.slice(1)}
                </button>
              ))}
            </nav>
            <div className="preview-bottom">
              <span>
                <Icon name="eye" size={16} />
                Your stream stays yours.
              </span>
              <span>Transparent. Wallet-free. Ready for OBS.</span>
            </div>
            <Sources data={data} />
          </section>
          <aside className="library-column" aria-label="Templates and widgets">
            <section className="templates-section">
              <div className="section-heading">
                <h2>Start with a template</h2>
                <span className="secondary">03</span>
              </div>
              <div className="template-list">
                {TEMPLATES.map((template) => (
                  <button
                    type="button"
                    className={`template-option ${config.template === template.id ? "selected" : ""}`}
                    aria-pressed={config.template === template.id}
                    key={template.id}
                    onClick={() => {
                      const next = templateConfig(template.id, config.mode);
                      update(next);
                      setSelectedId(next.widgets[0]?.id || "");
                      setNotice(
                        `${template.name} applied. Your previous layout is available with Undo.`,
                      );
                    }}
                  >
                    <MiniTemplate template={template.id} />
                    <span className="template-copy">
                      <span>{template.name}</span>
                      <span>{template.description}</span>
                    </span>
                    <span className="template-check">
                      {config.template === template.id && (
                        <Icon name="check" size={14} />
                      )}
                    </span>
                  </button>
                ))}
              </div>
              <p className="section-note">
                A starting point. Make it your own.
              </p>
            </section>
            <section className="widgets-section">
              <div className="section-heading">
                <h2>Widgets</h2>
                <span className="count">{config.widgets.length}</span>
              </div>
              <p className="section-note widget-instruction">
                Select to edit. Later rows sit on top.
              </p>
              <div className="widget-list">
                {config.widgets.length === 0 ? (
                  <p className="empty-note">
                    A clean canvas. Add your first widget to get started.
                  </p>
                ) : (
                  config.widgets.map((widget, index) => (
                    <div
                      className={`widget-row ${selectedId === widget.id ? "selected" : ""} ${widget.visible ? "" : "is-hidden"}`}
                      key={widget.id}
                    >
                      <button
                        type="button"
                        className="widget-select"
                        onClick={() => {
                          select(widget.id);
                          setMobilePane("style");
                        }}
                        aria-pressed={selectedId === widget.id}
                      >
                        <Icon name={typeIcon(widget.type)} />
                        <span>{widget.label || WIDGETS[widget.type].name}</span>
                      </button>
                      <div className="row-actions">
                        <IconButton
                          icon={widget.visible ? "eye" : "hidden"}
                          label={`${widget.visible ? "Hide" : "Show"} ${WIDGETS[widget.type].name}`}
                          onClick={() =>
                            updateWidget(widget.id, {
                              visible: !widget.visible,
                            })
                          }
                        />
                        <IconButton
                          icon="up"
                          label={`Move ${WIDGETS[widget.type].name} earlier`}
                          disabled={index === 0}
                          onClick={() => reorder(widget.id, -1)}
                        />
                        <IconButton
                          icon="down"
                          label={`Move ${WIDGETS[widget.type].name} later`}
                          disabled={index === config.widgets.length - 1}
                          onClick={() => reorder(widget.id, 1)}
                        />
                      </div>
                    </div>
                  ))
                )}
              </div>
              <button
                type="button"
                className="button add-widget-button"
                onClick={() => setDialog("add")}
                disabled={config.widgets.length >= MAX_WIDGETS}
              >
                <Icon name="plus" />
                Add widget
                <span className="key-hint">
                  {config.widgets.length}/{MAX_WIDGETS}
                </span>
              </button>
              {config.widgets.length >= MAX_WIDGETS && (
                <p className="section-note">Remove a widget to add another.</p>
              )}
            </section>
            <div className="file-tools">
              <button
                type="button"
                className="small-button"
                onClick={() => inputRef.current?.click()}
              >
                <Icon name="import" size={16} />
                Import JSON
              </button>
              <button
                type="button"
                className="small-button"
                onClick={exportJson}
              >
                <Icon name="export" size={16} />
                Export JSON
              </button>
              <input
                ref={inputRef}
                type="file"
                accept="application/json,.json"
                className="visually-hidden"
                tabIndex={-1}
                aria-label="Import preset JSON file"
                onChange={importJson}
              />
            </div>
            {importError && (
              <div className="inline-error" role="alert">
                {importError}
                <button
                  type="button"
                  className="text-link"
                  onClick={() => inputRef.current?.click()}
                >
                  Choose another file
                </button>
              </div>
            )}
          </aside>
          <aside className="inspector-column" aria-label="Customize overlay">
            <div className="section-heading">
              <h2>Make it yours</h2>
              <Icon name="settings" size={16} />
            </div>
            <div className="segmented inspector-tabs">
              <button
                type="button"
                className={styleTab === "widget" ? "selected" : ""}
                aria-pressed={styleTab === "widget"}
                onClick={() => setStyleTab("widget")}
              >
                Widget
              </button>
              <button
                type="button"
                className={styleTab === "canvas" ? "selected" : ""}
                aria-pressed={styleTab === "canvas"}
                onClick={() => setStyleTab("canvas")}
              >
                Canvas
              </button>
            </div>
            {styleTab === "widget" ? (
              selected ? (
                <div className="inspector-fields">
                  <div className="selected-widget-heading">
                    <span className="widget-type-icon">
                      <Icon name={typeIcon(selected.type)} size={22} />
                    </span>
                    <div>
                      <h3>{WIDGETS[selected.type].name}</h3>
                      <p>
                        {selected.visible
                          ? "Visible in your overlay"
                          : "Hidden in your overlay"}
                      </p>
                    </div>
                  </div>
                  <label className="field">
                    Label
                    <input
                      value={selected.label}
                      maxLength={36}
                      onChange={(e) =>
                        updateWidget(selected.id, { label: e.target.value })
                      }
                    />
                  </label>
                  {selected.type === "text" && (
                    <label className="field">
                      Text
                      <textarea
                        aria-label="Text"
                        aria-describedby="custom-text-help"
                        rows={4}
                        value={selected.text}
                        maxLength={120}
                        onChange={(e) =>
                          updateWidget(selected.id, {
                            text: e.target.value
                              .split("\n")
                              .slice(0, 4)
                              .join("\n"),
                          })
                        }
                      />
                      <span id="custom-text-help" className="section-note">
                        Up to 120 characters across four lines.
                      </span>
                    </label>
                  )}
                  <div className="field-group">
                    <span className="field-group-label">Position</span>
                    <div className="position-inputs">
                      <label>
                        <span>X</span>
                        <input
                          type="number"
                          aria-label="X position"
                          min={0}
                          max={1280}
                          step={1}
                          value={selected.x}
                          onChange={(e) =>
                            updateWidget(selected.id, {
                              x: Number(e.target.value),
                            })
                          }
                        />
                        <span>px</span>
                      </label>
                      <label>
                        <span>Y</span>
                        <input
                          type="number"
                          aria-label="Y position"
                          min={0}
                          max={720}
                          step={1}
                          value={selected.y}
                          onChange={(e) =>
                            updateWidget(selected.id, {
                              y: Number(e.target.value),
                            })
                          }
                        />
                        <span>px</span>
                      </label>
                    </div>
                  </div>
                  <label className="range-field">
                    <span>
                      Scale<span>{Math.round(selected.scale * 100)}%</span>
                    </span>
                    <input
                      aria-label="Widget scale"
                      type="range"
                      min="50"
                      max="160"
                      step="5"
                      value={Math.round(selected.scale * 100)}
                      onChange={(e) =>
                        updateWidget(selected.id, {
                          scale: Number(e.target.value) / 100,
                        })
                      }
                    />
                  </label>
                  <label className="range-field">
                    <span>
                      Opacity<span>{Math.round(selected.opacity * 100)}%</span>
                    </span>
                    <input
                      aria-label="Widget opacity"
                      type="range"
                      min="30"
                      max="100"
                      step="5"
                      value={Math.round(selected.opacity * 100)}
                      onChange={(e) =>
                        updateWidget(selected.id, {
                          opacity: Number(e.target.value) / 100,
                        })
                      }
                    />
                  </label>
                  <div className="control-group">
                    <Toggle
                      label="Widget background"
                      checked={selected.background}
                      onChange={(v) =>
                        updateWidget(selected.id, { background: v })
                      }
                    />
                    <Toggle
                      label="Show widget"
                      checked={selected.visible}
                      onChange={(v) =>
                        updateWidget(selected.id, { visible: v })
                      }
                    />
                  </div>
                  <div className="layer-order">
                    <span>Layer order</span>
                    <div>
                      <IconButton
                        icon="up"
                        label="Move selected widget earlier"
                        onClick={() => reorder(selected.id, -1)}
                        disabled={selectionIndex === 0}
                      />
                      <IconButton
                        icon="down"
                        label="Move selected widget later"
                        onClick={() => reorder(selected.id, 1)}
                        disabled={selectionIndex === config.widgets.length - 1}
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    className="button remove-button"
                    onClick={() => {
                      update({
                        widgets: config.widgets.filter(
                          (w) => w.id !== selected.id,
                        ),
                      });
                      setNotice("Widget removed. Use Undo to bring it back.");
                    }}
                  >
                    <Icon name="trash" size={16} />
                    Remove widget
                  </button>
                  <p className="inspector-help">
                    Drag to position, or use arrow keys on a canvas widget. Hold
                    Shift to move 10 px.
                  </p>
                </div>
              ) : (
                <div className="empty-inspector">
                  <Icon name="layers" size={28} />
                  <p>
                    Select a widget to customize its text, size and position.
                  </p>
                  <button
                    type="button"
                    className="button secondary-button"
                    onClick={() => setDialog("add")}
                  >
                    Add a widget
                  </button>
                </div>
              )
            ) : (
              <div className="inspector-fields">
                <label className="field">
                  Layout name
                  <input
                    value={config.name}
                    maxLength={48}
                    onChange={(e) =>
                      update({
                        name: e.target.value.trim()
                          ? e.target.value
                          : "Untitled overlay",
                      })
                    }
                  />
                </label>
                <div className="canvas-colors">
                  <ColorField
                    label="Accent color"
                    value={config.accent}
                    onChange={(v) => update({ accent: v })}
                  />
                  <div
                    className="swatch-row"
                    role="group"
                    aria-label="Accent color suggestions"
                  >
                    {[
                      "#f2c078",
                      "#a6dfc0",
                      "#c5afff",
                      "#e6a7ad",
                      "#f5f0e6",
                    ].map((color) => (
                      <button
                        type="button"
                        key={color}
                        aria-label={`Use accent ${color}`}
                        aria-pressed={config.accent === color}
                        className={`color-swatch ${config.accent === color ? "selected" : ""}`}
                        style={{ "--swatch": color } as CSSProperties}
                        onClick={() => update({ accent: color })}
                      >
                        {config.accent === color && (
                          <Icon name="check" size={14} />
                        )}
                      </button>
                    ))}
                  </div>
                  <ColorField
                    label="Text color"
                    value={config.textColor}
                    onChange={(v) => update({ textColor: v })}
                  />
                  <ColorField
                    label="Widget background color"
                    value={config.panelColor}
                    onChange={(v) => update({ panelColor: v })}
                  />
                </div>
                <label className="field">
                  Canvas background
                  <select
                    aria-label="Canvas background"
                    value={config.background}
                    onChange={(e) =>
                      update({
                        background: e.target
                          .value as StudioConfig["background"],
                      })
                    }
                  >
                    <option value="transparent">Transparent for OBS</option>
                    <option value="solid">Solid color</option>
                  </select>
                </label>
                {config.background === "solid" && (
                  <ColorField
                    label="Canvas color"
                    value={config.backgroundColor}
                    onChange={(v) => update({ backgroundColor: v })}
                  />
                )}
                <p className="inspector-help">
                  The forest scene is a preview backdrop. Transparent canvases
                  stay transparent in OBS.
                </p>
                <div className="canvas-info">
                  <Icon name="monitor" />
                  <span>
                    16:9 canvas
                    <br />
                    <span className="secondary">1280 × 720 pixels</span>
                  </span>
                </div>
                <p className="inspector-help">
                  Colors apply to every widget. Custom colors and opacity can
                  reduce readability; check your actual stream background.
                </p>
              </div>
            )}
          </aside>
        </div>
        <div
          className={`notice ${notice ? "has-notice" : ""}`}
          role="status"
          aria-live="polite"
        >
          {notice && (
            <>
              <Icon name="check" size={16} />
              <span>{notice}</span>
              <IconButton
                icon="close"
                label="Dismiss notification"
                onClick={() => setNotice("")}
              />
            </>
          )}
        </div>
      </main>
      <footer className="app-footer">
        <span>
          <span className="footer-wheel">
            <BrandMark size={20} />
          </span>
          Built for little wheels & big streams.
        </span>
        <a
          className="attribution"
          href="https://x.com/sina_133"
          target="_blank"
          rel="noreferrer"
        >
          <Icon name="x" size={13} />
          Developed by @sina_133
          <Icon name="external" size={12} />
        </a>
      </footer>

      {dialog === "add" && (
        <Modal title="Add a little something" onClose={closeDialog}>
          <p className="modal-description">
            Pick a widget for your broadcast. You can add up to {MAX_WIDGETS}.
          </p>
          <div className="widget-picker">
            {(Object.keys(WIDGETS) as WidgetType[]).map((type) => (
              <button type="button" key={type} onClick={() => addWidget(type)}>
                <span className="widget-type-icon">
                  <Icon name={typeIcon(type)} size={24} />
                </span>
                <span>
                  <strong>{WIDGETS[type].name}</strong>
                  <span>{WIDGETS[type].description}</span>
                </span>
                <Icon name="plus" />
              </button>
            ))}
          </div>
        </Modal>
      )}
      {dialog === "save" && (
        <Modal title="Save your preset" onClose={closeDialog}>
          <form onSubmit={savePreset}>
            <p className="modal-description">
              Keep this layout in this browser. Export JSON to take it
              elsewhere.
            </p>
            <label className="field">
              Preset name
              <input
                autoFocus
                value={presetName}
                maxLength={48}
                aria-invalid={!!saveError}
                aria-describedby={saveError ? "save-error" : undefined}
                onChange={(e) => {
                  setPresetName(e.target.value);
                  setSaveError("");
                }}
              />
            </label>
            {saveError && (
              <p id="save-error" className="inline-error" role="alert">
                {saveError}
              </p>
            )}
            <div className="modal-actions">
              <button
                type="button"
                className="button secondary-button"
                onClick={closeDialog}
              >
                Cancel
              </button>
              <button type="submit" className="button primary">
                <Icon name="save" />
                Save preset
              </button>
            </div>
          </form>
        </Modal>
      )}
      {dialog === "presets" && (
        <Modal title="Your saved presets" onClose={closeDialog}>
          <p className="modal-description">
            Saved in this browser only. Import and export JSON to move layouts
            between devices.
          </p>
          {presets.length === 0 ? (
            <div className="empty-presets">
              <Icon name="folder" size={40} />
              <h3>A home for your next stream.</h3>
              <p>Save your first preset to keep it here.</p>
              <button
                type="button"
                className="button primary"
                onClick={openSave}
              >
                Save current layout
              </button>
            </div>
          ) : (
            <div className="preset-list">
              {presets.map((preset) => (
                <div className="preset-row" key={preset.id}>
                  <MiniTemplate template={preset.config.template} />
                  <div>
                    <strong>{preset.config.name}</strong>
                    <span>
                      {preset.config.widgets.length} widgets ·{" "}
                      {new Date(preset.savedAt).toLocaleDateString()}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="button secondary-button"
                    onClick={() => {
                      update(preset.config);
                      setSelectedId(preset.config.widgets[0]?.id || "");
                      setDialog(null);
                      setNotice(
                        `Loaded “${preset.config.name}”. You can undo this change.`,
                      );
                    }}
                  >
                    Load
                  </button>
                  <IconButton
                    icon="trash"
                    label={`Delete preset ${preset.config.name}`}
                    onClick={() => {
                      setDeleteId(preset.id);
                      setSaveError("");
                      setDialog("delete-preset");
                    }}
                  />
                </div>
              ))}
            </div>
          )}
        </Modal>
      )}
      {dialog === "delete-preset" && (
        <Modal
          title="Delete this saved preset?"
          onClose={() => setDialog("presets")}
        >
          <p className="modal-description">
            “{presets.find((p) => p.id === deleteId)?.config.name}” will be
            removed from this browser. Your current editor layout stays
            available.
          </p>
          {saveError && (
            <p className="inline-error" role="alert">
              {saveError}
            </p>
          )}
          <div className="modal-actions">
            <button
              type="button"
              className="button secondary-button"
              onClick={() => setDialog("presets")}
            >
              Cancel
            </button>
            <button
              type="button"
              className="button danger-button"
              onClick={() => {
                if (storePresets(presets.filter((p) => p.id !== deleteId))) {
                  setDialog("presets");
                  setNotice("Saved preset deleted.");
                }
              }}
            >
              Delete preset
            </button>
          </div>
        </Modal>
      )}
      {dialog === "obs" && (
        <Modal title="Bring your wheel to OBS" onClose={closeDialog}>
          <p className="modal-description">
            One browser source. A little more personality.
          </p>
          <div
            className={`obs-mode-note ${config.mode === "demo" ? "demo-note" : ""}`}
          >
            <DataStatus data={data} />
            <p>
              {config.mode === "demo"
                ? "This link uses simulated demo data. Switch to Live before using it for a live Squeekchain broadcast."
                : "This link reads the public Squeekchain API. Unknown or stale data is labelled in the overlay."}
            </p>
            {config.mode === "demo" && (
              <button
                type="button"
                className="button secondary-button"
                onClick={() => update({ mode: "live" })}
              >
                Switch link to live data
              </button>
            )}
          </div>
          <label className="field">
            Your overlay URL
            <input
              id="overlay-url"
              readOnly
              value={link}
              onFocus={(e) => e.target.select()}
            />
          </label>
          <div className="overlay-link-actions">
            <button type="button" className="button primary" onClick={copyLink}>
              <Icon name={copied ? "check" : "copy"} />
              {copied ? "Link copied" : "Copy overlay link"}
            </button>
            <a
              className="button secondary-button"
              href={link}
              target="_blank"
              rel="noreferrer"
            >
              Open overlay
              <Icon name="external" size={16} />
            </a>
          </div>
          <ol className="obs-steps">
            <li>
              <span>1</span>
              <div>
                <strong>Add a Browser source</strong>
                <p>
                  In OBS, select + under Sources, then Browser. Give it a name.
                </p>
              </div>
            </li>
            <li>
              <span>2</span>
              <div>
                <strong>Paste your overlay URL</strong>
                <p>
                  Set width to <b>1280</b> and height to <b>720</b>. Keep the
                  default transparent browser-source background.
                </p>
              </div>
            </li>
            <li>
              <span>3</span>
              <div>
                <strong>Make it part of your scene</strong>
                <p>
                  Place it above your video source. For a 1920 × 1080 scene,
                  right-click → Transform → Fit to screen.
                </p>
              </div>
            </li>
          </ol>
          <p className="link-note">
            <Icon name="info" size={16} />
            Links contain a layout snapshot. After editing, copy a new link and
            replace the URL in OBS. Keep the full URL, including everything
            after #.
          </p>
          <p className="link-note">
            No editor controls or footer appear in the OBS view. The data-mode
            label remains visible. OBS needs internet access for live reads.
          </p>
        </Modal>
      )}
      {dialog === "preview" && (
        <Modal title="Your broadcast preview" onClose={closeDialog} wide>
          <Canvas config={config} data={data} />
          <p className="modal-description">
            Transparent areas show the dark dialog background here. Your OBS
            source uses the canvas background setting.
          </p>
          <div className="modal-actions">
            <DataStatus data={data} />
            <button
              type="button"
              className="button primary"
              onClick={() => setDialog("obs")}
            >
              <Icon name="link" />
              Get overlay link
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
export default function App() {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const change = () => setHash(location.hash);
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, []);
  return hash.startsWith("#/overlay") ? <Overlay key={hash} /> : <Editor />;
}
