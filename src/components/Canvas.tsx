import { useEffect, useRef, useState } from "react";
import type { CSSProperties, PointerEvent, KeyboardEvent } from "react";
import { HEIGHT, WIDTH, WIDGETS, clampWidget, widgetSize } from "../model";
import type { StudioConfig, Widget, WidgetType } from "../model";
import { eventLabel, relativeTime } from "../api";
import type { ViewData } from "../api";
import { BrandMark, Icon } from "./Icons";

export const WIDGET_ICONS = {
  wheel: "wheel",
  speed: "speed",
  block: "block",
  progress: "progress",
  events: "events",
  text: "text",
} as const;
export type PreviewBackground = "scene" | "checker" | "dark";
export function WidgetContent({
  widget,
  data,
}: {
  widget: Widget;
  data: ViewData;
}) {
  const status =
    data.wheel === "running"
      ? "Running"
      : data.wheel === "idle"
        ? "Idle"
        : "Unknown";
  const formatHeight = (height: string) =>
    BigInt(height).toLocaleString("en-US");
  switch (widget.type) {
    case "wheel":
      return (
        <>
          <div className="widget-label">{widget.label}</div>
          <div className="wheel-content">
            <div className={`wheel-symbol ${data.wheel}`}>
              <BrandMark size={66} />
            </div>
            <div>
              <div className="widget-value wheel-state">{status}</div>
              <div className="widget-caption">
                <span
                  className={`status-dot ${data.wheel === "unknown" ? "muted" : ""}`}
                />
                {data.mode === "demo"
                  ? "Demo wheel"
                  : data.wheel === "unknown"
                    ? "Check data source"
                    : "Squeektoshi’s wheel"}
              </div>
            </div>
          </div>
        </>
      );
    case "speed":
      return (
        <>
          <div className="widget-label">
            {widget.label}
            <Icon name="speed" size={22} />
          </div>
          <div className="widget-value numeric">
            {data.rpm === null ? "Unknown" : data.rpm.toFixed(1)}
            {data.rpm !== null && <span className="unit">rpm</span>}
          </div>
          <div className="widget-caption">
            {data.speed === null
              ? "Speed unavailable"
              : `${data.speed.toFixed(2)} m/s`}
          </div>
        </>
      );
    case "block":
      return (
        <>
          <div className="widget-label">
            {widget.label}
            <Icon name="block" size={22} />
          </div>
          <div
            className={`widget-value numeric ${data.height && data.height.length > 12 ? "long-number" : data.height && data.height.length > 8 ? "medium-number" : ""}`}
          >
            {data.height === null ? "Unknown" : formatHeight(data.height)}
          </div>
          <div className="widget-caption">
            <span
              className={`status-dot ${data.height === null ? "muted" : ""}`}
            />
            {data.mode === "demo"
              ? "Demo settled blocks"
              : data.height === null
                ? "Source unavailable or stale"
                : "Settled on Sepolia"}
          </div>
        </>
      );
    case "progress":
      return (
        <>
          <div className="widget-label">
            {widget.label}
            <span>
              {data.progress === null
                ? "Unknown"
                : `${data.progress.toFixed(1)}%`}
            </span>
          </div>
          <div className="overlay-progress">
            <div style={{ width: `${data.progress || 0}%` }} />
          </div>
          <div className="widget-caption">
            {data.progress === null
              ? "Settled progress unavailable"
              : data.mode === "demo"
                ? "Demo progress to next block"
                : "Settled units into the next block"}
          </div>
        </>
      );
    case "events":
      return (
        <>
          <div className="widget-label">
            {widget.label}
            <Icon name="events" size={22} />
          </div>
          <div className="overlay-events">
            {data.events === null ? (
              <div className="event-empty">Events unavailable or stale</div>
            ) : data.events.length === 0 ? (
              <div className="event-empty">No recent events reported</div>
            ) : (
              data.events.slice(0, 3).map((event) => (
                <div className="overlay-event" key={event.id}>
                  <span className="event-marker" />
                  <div>
                    <div>{eventLabel(event)}</div>
                    <div className="widget-caption">
                      {relativeTime(event.occurredAt)}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      );
    case "text":
      return (
        <div
          className={`custom-text ${widget.text.length > 60 || widget.text.split("\n").length > 2 ? "long-text" : ""}`}
        >
          <div className="custom-text-label">
            {widget.label === WIDGETS.text.name
              ? "Welcome to the stream"
              : widget.label}
          </div>
          <div>{widget.text}</div>
        </div>
      );
  }
}
interface CanvasProps {
  config: StudioConfig;
  data: ViewData;
  editable?: boolean;
  selected?: string;
  background?: PreviewBackground;
  guides?: boolean;
  onSelect?: (id: string) => void;
  onChangeWidget?: (
    id: string,
    patch: Partial<Widget>,
    record?: boolean,
  ) => void;
  onDragStart?: () => void;
}
export function Canvas({
  config,
  data,
  editable = false,
  selected,
  background = "checker",
  guides = false,
  onSelect,
  onChangeWidget,
  onDragStart,
}: CanvasProps) {
  const viewport = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const drag = useRef<{
    id: string;
    x: number;
    y: number;
    px: number;
    py: number;
    moved: boolean;
  } | null>(null);
  useEffect(() => {
    if (!viewport.current) return;
    const resize = () => setScale(viewport.current!.clientWidth / WIDTH);
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(viewport.current);
    return () => observer.disconnect();
  }, []);
  function down(event: PointerEvent<HTMLElement>, widget: Widget) {
    if (!editable || event.button !== 0) return;
    onSelect?.(widget.id);
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      id: widget.id,
      x: widget.x,
      y: widget.y,
      px: event.clientX,
      py: event.clientY,
      moved: false,
    };
  }
  function move(event: PointerEvent<HTMLElement>, widget: Widget) {
    const d = drag.current;
    if (!d || d.id !== widget.id) return;
    const dx = (event.clientX - d.px) / scale,
      dy = (event.clientY - d.py) / scale;
    if (!d.moved && Math.abs(dx) + Math.abs(dy) < 3) return;
    if (!d.moved) {
      onDragStart?.();
      d.moved = true;
    }
    const next = clampWidget({ ...widget, x: d.x + dx, y: d.y + dy });
    onChangeWidget?.(widget.id, { x: next.x, y: next.y }, false);
  }
  function key(event: KeyboardEvent<HTMLElement>, widget: Widget) {
    if (
      !editable ||
      !["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)
    )
      return;
    event.preventDefault();
    const step = event.shiftKey ? 10 : 1;
    const next = clampWidget({
      ...widget,
      x:
        widget.x +
        (event.key === "ArrowRight"
          ? step
          : event.key === "ArrowLeft"
            ? -step
            : 0),
      y:
        widget.y +
        (event.key === "ArrowDown"
          ? step
          : event.key === "ArrowUp"
            ? -step
            : 0),
    });
    onChangeWidget?.(widget.id, { x: next.x, y: next.y });
  }
  return (
    <div
      ref={viewport}
      className={`canvas-viewport ${editable ? "is-editable" : ""} ${editable && config.background === "transparent" ? `preview-${background}` : ""}`}
      data-testid="canvas"
    >
      <div
        className={`overlay-stage theme-${config.template} ${guides && editable ? "with-guides" : ""}`}
        style={
          {
            width: WIDTH,
            height: HEIGHT,
            transform: `scale(${scale})`,
            backgroundColor:
              config.background === "solid"
                ? config.backgroundColor
                : "transparent",
            "--overlay-accent": config.accent,
            "--overlay-text": config.textColor,
            "--overlay-panel": config.panelColor,
          } as CSSProperties
        }
      >
        {editable &&
          background === "scene" &&
          config.background === "transparent" && (
            <img
              className="scene-art"
              src="./scene.svg"
              alt=""
              draggable="false"
            />
          )}
        {config.widgets
          .filter((widget) => widget.visible)
          .map((widget, index) => {
            const size = widgetSize(widget);
            const style = {
              left: widget.x,
              top: widget.y,
              width: size.width,
              height: size.height,
              transform: `scale(${widget.scale})`,
              opacity: widget.opacity,
              zIndex: index + 1,
            } as CSSProperties;
            const className = `overlay-widget type-${widget.type} ${widget.label.length > 20 ? "has-long-label" : ""} ${widget.background ? "with-background" : ""} ${editable && selected === widget.id ? "is-selected" : ""}`;
            return editable ? (
              <button
                type="button"
                key={widget.id}
                className={className}
                style={style}
                aria-label={`Select ${widget.label || WIDGETS[widget.type].name} on canvas`}
                onPointerDown={(e) => down(e, widget)}
                onPointerMove={(e) => move(e, widget)}
                onPointerUp={() => {
                  drag.current = null;
                }}
                onPointerCancel={() => {
                  drag.current = null;
                }}
                onClick={() => onSelect?.(widget.id)}
                onKeyDown={(e) => key(e, widget)}
              >
                <WidgetContent widget={widget} data={data} />
                {selected === widget.id && (
                  <span className="selection-corner" aria-hidden="true" />
                )}
              </button>
            ) : (
              <div key={widget.id} className={className} style={style}>
                <WidgetContent widget={widget} data={data} />
              </div>
            );
          })}
        <div
          className={`source-stamp ${data.mode === "demo" ? "demo" : data.health === "ok" ? "live" : "uncertain"}`}
        >
          <span className="status-dot" />
          {data.mode === "demo"
            ? "Demo · simulated data"
            : `Live source · ${data.source}${data.health !== "ok" ? ` · ${data.health}` : ""}`}
          {data.mode === "live" && data.wheelNote.startsWith("API provenance:")
            ? ` · ${data.wheelNote}`
            : ""}
        </div>
      </div>
    </div>
  );
}
export function MiniTemplate({
  template,
}: {
  template: "minimal" | "cozy" | "neon";
}) {
  return (
    <div className={`mini-template mini-${template}`} aria-hidden="true">
      <div className="mini-moon" />
      <div className="mini-mountain" />
      <div className="mini-widget">
        <span />
        <i />
      </div>
      {template !== "minimal" && (
        <>
          <div className="mini-lines">
            <i />
            <i />
          </div>
          <div className="mini-extra">
            <i />
            <i />
          </div>
        </>
      )}
    </div>
  );
}
export function DataStatus({ data }: { data: ViewData }) {
  return (
    <div
      className={`data-status ${data.mode === "demo" ? "is-demo" : data.health === "ok" ? "is-live" : "is-uncertain"}`}
    >
      <span className="status-dot" />
      {data.mode === "demo"
        ? "Demo data"
        : data.health === "loading"
          ? "Connecting…"
          : data.health === "ok"
            ? "Live data"
            : data.health === "rate-limited"
              ? "Rate limited"
              : "Source needs attention"}
    </div>
  );
}
export function typeIcon(type: WidgetType) {
  return WIDGET_ICONS[type];
}
