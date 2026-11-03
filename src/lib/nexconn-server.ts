import "server-only";
import { createHash, randomBytes } from "node:crypto";

/**
 * Thin Nexconn Server API client: only the three calls Floor needs.
 * Signing follows @nexconn/server-sdk: Signature = sha1(AppSecret + Nonce + Timestamp), hex.
 */

/** Client SDK data center (AreaCode in @nexconn/chat). It must match the app's data center in the Console. */
export type Area = "SG" | "NA" | "SA" | "OM";
const AREAS: readonly Area[] = ["SG", "NA", "SA", "OM"];

export type NexconnConfig = { appKey: string; appSecret: string; apiBase: string; apiBackup?: string; area: Area };

/** Server API error codes Floor reacts to. */
export const GROUP_EXISTS = 25409;
export const GROUP_MISSING = 25410;

function url(v: string | undefined): string | undefined {
  const s = v?.trim().replace(/\/+$/, "");
  if (!s) return undefined;
  return s.startsWith("http") ? s : `https://${s}`;
}

/** NEXCONN_AREA wins; otherwise the area follows the server API domain (api.us-light-api.com is North America). */
export function areaFor(apiBase: string, explicit?: string): Area {
  const e = explicit?.trim().toUpperCase() as Area | undefined;
  if (e && AREAS.includes(e)) return e;
  const host = apiBase.replace(/^https?:\/\//, "");
  if (/(^|\.)us-light-api\.com/.test(host)) return "NA";
  return "SG";
}

export function nexconnConfig(env: Record<string, string | undefined> = process.env): NexconnConfig | null {
  const appKey = env.NEXCONN_APP_KEY?.trim();
  const appSecret = env.NEXCONN_APP_SECRET?.trim();
  const apiBase = url(env.NEXCONN_API_BASE);
  if (!appKey || !appSecret || !apiBase) return null;
  const apiBackup = url(env.NEXCONN_API_BASE_BACKUP);
  return { appKey, appSecret, apiBase, ...(apiBackup ? { apiBackup } : {}), area: areaFor(apiBase, env.NEXCONN_AREA) };
}

export function sign(appSecret: string, nonce: string, timestamp: string): string {
  return createHash("sha1").update(appSecret + nonce + timestamp, "utf8").digest("hex");
}

export function signedHeaders(cfg: NexconnConfig, now = Date.now(), nonce = randomBytes(8).toString("hex")): Record<string, string> {
  const timestamp = String(now);
  return {
    "App-Key": cfg.appKey,
    Nonce: nonce,
    Timestamp: timestamp,
    Signature: sign(cfg.appSecret, nonce, timestamp),
    "Content-Type": "application/json",
  };
}

export class NexconnError extends Error {
  constructor(public path: string, public status: number, public code: number | null, message: string) {
    super(message);
  }
}

type Fetch = typeof fetch;

/** Primary domain first. On a timeout, network error or 5xx, try the backup domain once (Nexconn's failover advice). */
async function post(cfg: NexconnConfig, path: string, body: unknown, f: Fetch): Promise<Response> {
  const bases = [cfg.apiBase, ...(cfg.apiBackup ? [cfg.apiBackup] : [])];
  let last: unknown;
  for (const base of bases) {
    try {
      const res = await f(`${base}${path}`, { method: "POST", headers: signedHeaders(cfg), body: JSON.stringify(body), cache: "no-store", signal: AbortSignal.timeout(5000) });
      if (res.status < 500 || base === bases[bases.length - 1]) return res;
      last = new NexconnError(path, res.status, null, `HTTP ${res.status}`);
    } catch (e) {
      last = e;
    }
  }
  if (last instanceof NexconnError) throw last;
  throw new NexconnError(path, 0, null, "Chat service unreachable");
}

async function call<T>(cfg: NexconnConfig, path: string, body: unknown, f: Fetch = fetch): Promise<T & { code: number }> {
  const res = await post(cfg, path, body, f);
  const text = await res.text();
  let json: (T & { code: number; errorMessage?: string; msg?: string }) | null = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* fall through */
  }
  const ok = res.ok && json && (json.code === 200 || json.code === 0);
  if (!ok) throw new NexconnError(path, res.status, json?.code ?? null, json?.errorMessage || json?.msg || `HTTP ${res.status}`);
  return json as T & { code: number };
}

export async function issueToken(cfg: NexconnConfig, userId: string, name: string, f?: Fetch): Promise<string> {
  const r = await call<{ result?: { accessToken?: string } }>(cfg, "/v4/auth/access-token/issue", { userId, name }, f);
  const token = r.result?.accessToken;
  if (!token) throw new NexconnError("/v4/auth/access-token/issue", 200, r.code, "No token in response");
  return token;
}

export async function createGroup(cfg: NexconnConfig, channelId: string, name: string, owner: string, f?: Fetch): Promise<void> {
  await call(cfg, "/v4/group-channel/create", { channelId, name, owner, userIds: [owner] }, f);
}

/** Adds the user to the channel and returns the channel owner (the room's host), when Nexconn reports it. */
export async function joinGroup(cfg: NexconnConfig, channelId: string, userId: string, f?: Fetch): Promise<string | undefined> {
  const r = await call<{ result?: { owner?: string } }>(cfg, "/v4/group-channel/join", { channelId, userIds: [userId] }, f);
  return typeof r.result?.owner === "string" ? r.result.owner : undefined;
}
