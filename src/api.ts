import { useEffect, useReducer } from "react";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import statusSchema from "./schemas/status.json";
import coreSchema from "./schemas/core.json";
import eventsSchema from "./schemas/events.json";
import type { DataMode } from "./model";

export const API_BASE = "https://api.squeekchain.com";
export type Channel = "status" | "core" | "events";
export type Health =
  | "loading"
  | "ok"
  | "stale"
  | "unavailable"
  | "rate-limited"
  | "error";
export interface EventItem {
  id: string;
  type: string;
  occurredAt: string;
  eventVersion: number;
  payload: Record<string, unknown>;
}
export interface StatusData {
  schemaVersion: 1;
  installationId: string;
  generatedAt: string;
  measurement: {
    freshness: string;
    coreStatus: string;
    rpmMilli?: number;
    speedMmPerSecond?: number;
    receivedAt: string;
    observedAt: string;
    staleAfterSeconds: number;
    provenance: string;
  } | null;
}
export interface CoreData {
  schemaVersion: 1;
  installationId: string;
  status: string;
  reason?: string;
  chain?: { target: string; chainId: string; safeThroughBlock: string };
  core?: { blockHeight: string; blockProgress: string };
  identities?: { core: string };
}
export interface EventsData {
  schemaVersion: 3;
  installationId: string;
  generatedAt?: string;
  status: string;
  reason?: string;
  events?: EventItem[];
  chain?: { target: string; chainId: string; safeThroughBlock: string };
  identities?: { core: string };
}
export interface Resource<T> {
  data: T | null;
  health: Health;
  message: string;
  checkedAt: number;
  retryAt: number;
  unchangedSince: number;
}
export interface Feed {
  status: Resource<StatusData>;
  core: Resource<CoreData>;
  events: Resource<EventsData>;
  now: number;
}
const fresh = <T>(): Resource<T> => ({
  data: null,
  health: "loading",
  message: "Connecting to Squeekchain…",
  checkedAt: 0,
  retryAt: 0,
  unchangedSince: 0,
});
export const emptyFeed = (): Feed => ({
  status: fresh(),
  core: fresh(),
  events: fresh(),
  now: Date.now(),
});
const ajv = new Ajv2020({
  strict: false,
  allErrors: false,
  validateFormats: true,
});
addFormats(ajv);
for (const bits of [64, 96, 256])
  ajv.addFormat(`uint${bits}-decimal`, {
    type: "string",
    validate: (v: string) =>
      /^(0|[1-9]\d*)$/.test(v) &&
      v.length <= 78 &&
      BigInt(v) < 1n << BigInt(bits),
  });
const validators = {
  status: ajv.compile(statusSchema),
  core: ajv.compile(coreSchema),
  events: ajv.compile(eventsSchema),
};
export function validateApi(channel: Channel, value: unknown) {
  if (!validators[channel](value))
    throw new Error(
      `Unsupported or invalid ${channel} response. Waiting for a compatible API response.`,
    );
  return value as StatusData | CoreData | EventsData;
}
function retryTime(header: string | null, now: number, fallback: number) {
  if (!header) return now + fallback;
  const seconds = Number(header);
  const millis = Number.isFinite(seconds)
    ? now + Math.max(0, seconds) * 1000
    : Date.parse(header);
  return Number.isFinite(millis)
    ? Math.max(now + 1000, millis)
    : now + fallback;
}
export class SqueekClient {
  private cache = new Map<Channel, { data: unknown; etag: string | null }>();
  private failures = new Map<Channel, number>();
  private next = new Map<Channel, number>();
  private current = emptyFeed();
  private active = false;
  private timer?: ReturnType<typeof setTimeout>;
  private controllers = new Set<AbortController>();
  constructor(
    private onUpdate: (feed: Feed) => void,
    private fetcher: typeof fetch = (input, init) => fetch(input, init),
    private clock = Date.now,
  ) {}
  start() {
    this.active = true;
    void this.tick();
  }
  stop() {
    this.active = false;
    clearTimeout(this.timer);
    for (const c of this.controllers) c.abort();
  }
  async tick() {
    if (!this.active) return;
    const now = this.clock();
    const channels: Channel[] = ["status", "core", "events"];
    await Promise.all(
      channels
        .filter((channel) => now >= (this.next.get(channel) || 0))
        .map((channel) => this.poll(channel)),
    );
    if (!this.active) return;
    this.current = { ...this.current, now: this.clock() };
    this.onUpdate(this.current);
    this.timer = setTimeout(() => void this.tick(), 1000);
  }
  async poll(channel: Channel) {
    const now = this.clock();
    if (now < (this.next.get(channel) || 0)) return;
    const controller = new AbortController();
    this.controllers.add(controller);
    const timeout = setTimeout(() => controller.abort(), 10000);
    const old = this.current[channel];
    const cached = this.cache.get(channel);
    const interval = channel === "status" ? 5000 : 15000;
    this.next.set(channel, now + interval);
    try {
      const response = await this.fetcher(
        `${API_BASE}/v1/${channel}${channel === "events" ? "?category=all&limit=5" : ""}`,
        {
          headers: cached?.etag ? { "If-None-Match": cached.etag } : {},
          signal: controller.signal,
          credentials: "omit",
          cache: "no-cache",
        },
      );
      if (response.status === 429 || response.status === 503) {
        const failures = (this.failures.get(channel) || 0) + 1;
        this.failures.set(channel, failures);
        const retryAt = retryTime(
          response.headers.get("Retry-After"),
          now,
          Math.min(300000, 15000 * 2 ** Math.min(failures - 1, 4)),
        );
        this.next.set(channel, retryAt);
        this.set(channel, {
          ...old,
          health: response.status === 429 ? "rate-limited" : "unavailable",
          message:
            response.status === 429
              ? "Rate limited. Retrying after the API cooldown."
              : "Squeekchain is temporarily unavailable. Retrying automatically.",
          retryAt,
        });
        return;
      }
      let data: unknown;
      if (response.status === 304) {
        if (!cached)
          throw new Error(
            "The API returned an empty cached response. Retrying automatically.",
          );
        data = cached.data;
      } else {
        if (!response.ok)
          throw new Error(
            `Squeekchain returned HTTP ${response.status}. Retrying automatically.`,
          );
        const json: unknown = await response.json();
        data = validateApi(channel, json);
        this.cache.set(channel, { data, etag: response.headers.get("ETag") });
      }
      const value = data as CoreData | StatusData | EventsData;
      const unavailable = "status" in value && value.status === "unavailable";
      const oldSafe = (old.data as CoreData | EventsData | null)?.chain
        ?.safeThroughBlock;
      const newSafe = (value as CoreData | EventsData).chain?.safeThroughBlock;
      const unchangedSince =
        oldSafe && oldSafe === newSafe ? old.unchangedSince || now : now;
      this.failures.delete(channel);
      this.set(channel, {
        data,
        health: unavailable ? "unavailable" : "ok",
        message: unavailable
          ? `Source unavailable: ${("reason" in value ? value.reason : "") || "No reason supplied"}. Retrying automatically.`
          : "",
        checkedAt: now,
        retryAt: 0,
        unchangedSince,
      } as Resource<never>);
    } catch (error) {
      if (!this.active && controller.signal.aborted) return;
      const failures = (this.failures.get(channel) || 0) + 1;
      this.failures.set(channel, failures);
      const retryAt =
        now + Math.min(300000, interval * 2 ** Math.min(failures, 5));
      this.next.set(channel, retryAt);
      this.set(channel, {
        ...old,
        health: "error",
        message: controller.signal.aborted
          ? "Request timed out. Retrying automatically."
          : error instanceof TypeError
            ? "Cannot reach Squeekchain. Check your connection; retry is automatic."
            : error instanceof Error
              ? error.message
              : "Unable to read the source. Retrying automatically.",
        retryAt,
      });
    } finally {
      clearTimeout(timeout);
      this.controllers.delete(controller);
    }
  }
  private set(channel: Channel, resource: Resource<unknown>) {
    this.current = { ...this.current, [channel]: resource, now: this.clock() };
    if (this.active) this.onUpdate(this.current);
  }
}
export function resourceHealth(
  resource: Resource<unknown>,
  now: number,
): Health {
  if (resource.health !== "ok") return resource.health;
  if (now - resource.checkedAt > 45000) return "stale";
  if (resource.unchangedSince && now - resource.unchangedSince > 300000)
    return "stale";
  return "ok";
}
export interface ViewData {
  mode: DataMode;
  wheel: "running" | "idle" | "unknown";
  rpm: number | null;
  speed: number | null;
  height: string | null;
  progress: number | null;
  events: EventItem[] | null;
  wheelNote: string;
  coreNote: string;
  eventsNote: string;
  source: string;
  health: Health;
  feed: Feed | null;
}
function goodMeasurement(feed: Feed) {
  const m = feed.status.data?.measurement;
  return (
    resourceHealth(feed.status, feed.now) === "ok" &&
    m &&
    m.freshness === "online" &&
    Number.isFinite(Date.parse(m.receivedAt)) &&
    feed.now - Date.parse(m.receivedAt) <= m.staleAfterSeconds * 1000 &&
    feed.now - Date.parse(m.observedAt) <= m.staleAfterSeconds * 1000 &&
    Date.parse(m.receivedAt) - feed.now < 30000 &&
    Date.parse(m.observedAt) - feed.now < 30000
  );
}
export function liveView(feed: Feed): ViewData {
  const m = feed.status.data?.measurement;
  const measurementOk = goodMeasurement(feed);
  const coreOk =
    resourceHealth(feed.core, feed.now) === "ok" &&
    feed.core.data?.status === "available";
  const eventsOk =
    resourceHealth(feed.events, feed.now) === "ok" &&
    feed.events.data?.status === "available";
  const core = feed.core.data;
  const events = feed.events.data;
  const sameInstallation =
    !feed.status.data ||
    !core ||
    feed.status.data.installationId === core.installationId;
  const sameEvents =
    !events ||
    !core ||
    (events.installationId === core.installationId &&
      events.identities?.core === core.identities?.core &&
      events.chain?.chainId === core.chain?.chainId);
  const validWheel =
    measurementOk &&
    sameInstallation &&
    (m?.coreStatus === "ACTIVE" || m?.coreStatus === "IDLE");
  const wheelNote = !sameInstallation
    ? "Source installation mismatch"
    : feed.status.health !== "ok"
      ? feed.status.message
      : !m
        ? "No measurement available"
        : !measurementOk
          ? "Telemetry stale"
          : m.coreStatus === "COUNTER_FAULT"
            ? "Device counter fault"
            : m.provenance !== "hardware"
              ? `API provenance: ${m.provenance}`
              : "Hardware measurement";
  const channelHealth = [
    resourceHealth(feed.core, feed.now),
    resourceHealth(feed.events, feed.now),
    resourceHealth(feed.status, feed.now),
  ];
  const health =
    !sameEvents || !sameInstallation
      ? "unavailable"
      : channelHealth.find((h) => h !== "ok") || (!validWheel ? "stale" : "ok");
  return {
    mode: "live",
    wheel: validWheel
      ? m!.coreStatus === "ACTIVE"
        ? "running"
        : "idle"
      : "unknown",
    rpm:
      validWheel && Number.isFinite(m?.rpmMilli) ? m!.rpmMilli! / 1000 : null,
    speed:
      validWheel && Number.isFinite(m?.speedMmPerSecond)
        ? m!.speedMmPerSecond! / 1000
        : null,
    height: coreOk ? core?.core?.blockHeight || null : null,
    progress:
      coreOk && core?.core
        ? (Number(BigInt(core.core.blockProgress)) / 1e9) * 100
        : null,
    events: eventsOk && sameEvents ? events?.events || [] : null,
    wheelNote,
    coreNote: coreOk
      ? "12-confirmation settled state"
      : feed.core.message || "Settled state stale",
    eventsNote: !sameEvents
      ? "Source deployment mismatch"
      : feed.events.message ||
        (eventsOk
          ? "Confirmed chain and accepted measurement events"
          : "Event source stale"),
    source: core?.chain?.target || "Squeekchain API",
    health,
    feed,
  };
}
export function demoView(tick: number): ViewData {
  return {
    mode: "demo",
    wheel: tick % 36 > 29 ? "idle" : "running",
    rpm: tick % 36 > 29 ? 0 : 72.4 + Math.sin(tick / 3) * 8.5,
    speed: tick % 36 > 29 ? 0 : 1.1,
    height: "8430",
    progress: 47.9,
    events: [
      {
        id: "demo-settlement",
        type: "system.settlement_completed",
        eventVersion: 2,
        occurredAt: new Date(Date.now() - 120000).toISOString(),
        payload: { completedBlockCount: "24" },
      },
      {
        id: "demo-distance",
        type: "measurement.distance_milestone",
        eventVersion: 1,
        occurredAt: new Date(Date.now() - 300000).toISOString(),
        payload: { thresholdDistanceMm: "5000000" },
      },
      {
        id: "demo-speed",
        type: "measurement.speed_record",
        eventVersion: 1,
        occurredAt: new Date(Date.now() - 480000).toISOString(),
        payload: { recordMmPerSecond: 1628 },
      },
    ],
    wheelNote: "Simulated wheel activity",
    coreNote: "Simulated settled state",
    eventsNote: "Simulated recent events",
    source: "Simulated data",
    health: "ok",
    feed: null,
  };
}
export function useSqueekData(mode: DataMode, paused = false): ViewData {
  const [tick, advance] = useReducer((n: number) => n + 1, 0);
  const [feed, update] = useReducer(
    (_: Feed, value: Feed) => value,
    undefined,
    emptyFeed,
  );
  useEffect(() => {
    if (mode === "live") {
      update(emptyFeed());
      const client = new SqueekClient(update);
      client.start();
      return () => client.stop();
    }
    if (!paused) {
      const timer = setInterval(advance, 2000);
      return () => clearInterval(timer);
    }
  }, [mode, paused]);
  return mode === "demo" ? demoView(tick) : liveView(feed);
}
export function eventLabel(event: EventItem) {
  const known: Record<string, string> = {
    "system.settlement_completed": "Blocks settled",
    "system.mining_checkpointed": "Mining checkpoint",
    "measurement.distance_milestone": "Distance milestone",
    "measurement.daily_distance_milestone": "Daily distance milestone",
    "measurement.speed_record": "New speed record",
    "measurement.speed_milestone": "Speed milestone",
    "measurement.distance_streak": "Distance streak",
    "account.rewards_claimed": "Rewards claimed",
    "account.sqk_staked": "SQK staked",
    "account.sqk_unstaked": "SQK unstaked",
    "nft.merged": "Squeeks merged",
    "nft.deposited": "Squeek deposited",
    "nft.withdrawn": "Squeek withdrawn",
  };
  return known[event.type] || event.type.replace(/[._]/g, " ").slice(0, 64);
}
export function relativeTime(time: string) {
  const seconds = Math.max(
    0,
    Math.floor((Date.now() - Date.parse(time)) / 1000),
  );
  return seconds < 60
    ? "Just now"
    : seconds < 3600
      ? `${Math.floor(seconds / 60)}m ago`
      : seconds < 86400
        ? `${Math.floor(seconds / 3600)}h ago`
        : `${Math.floor(seconds / 86400)}d ago`;
}
