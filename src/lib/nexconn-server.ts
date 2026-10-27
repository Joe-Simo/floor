import "server-only";
import { createHash, randomBytes } from "node:crypto";

/**
 * Thin Nexconn Server API client: only the three calls Floor needs.
 * Signing follows @nexconn/server-sdk: Signature = sha1(AppSecret + Nonce + Timestamp), hex.
 */

export type NexconnConfig = { appKey: string; appSecret: string; apiBase: string };

export function nexconnConfig(env: Record<string, string | undefined> = process.env): NexconnConfig | null {
  const appKey = env.NEXCONN_APP_KEY?.trim();
  const appSecret = env.NEXCONN_APP_SECRET?.trim();
  const apiBase = env.NEXCONN_API_BASE?.trim().replace(/\/+$/, "");
  if (!appKey || !appSecret || !apiBase) return null;
  return { appKey, appSecret, apiBase: apiBase.startsWith("http") ? apiBase : `https://${apiBase}` };
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

async function call<T>(cfg: NexconnConfig, path: string, body: unknown, f: Fetch = fetch): Promise<T & { code: number }> {
  const res = await f(`${cfg.apiBase}${path}`, { method: "POST", headers: signedHeaders(cfg), body: JSON.stringify(body), cache: "no-store" });
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

export async function joinGroup(cfg: NexconnConfig, channelId: string, userId: string, f?: Fetch): Promise<void> {
  await call(cfg, "/v4/group-channel/join", { channelId, userIds: [userId] }, f);
}
