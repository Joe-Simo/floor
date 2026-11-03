import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/session/route";

const req = (body: unknown) => new Request("http://x/api/session", { method: "POST", body: JSON.stringify(body), headers: { "x-forwarded-for": `10.0.0.${Math.floor(Math.random() * 250)}` } });

describe("POST /api/session", () => {
  it("falls back to demo mode when Nexconn keys are not configured", async () => {
    const res = await POST(req({ code: "K7M2QX", userId: "u-abc123", name: "Ana" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ mode: "local" });
  });

  it("rejects a bad room code or user id", async () => {
    expect((await POST(req({ code: "nope", userId: "u-abc123" }))).status).toBe(400);
    expect((await POST(req({ code: "K7M2QX", userId: "admin" }))).status).toBe(400);
  });
});

describe("POST /api/session with Nexconn configured", () => {
  const api = (reply: (path: string, body: Record<string, unknown>) => [number, unknown]) => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (u: string, init: RequestInit) => {
      const path = new URL(u).pathname;
      calls.push(path);
      const [status, json] = reply(path, JSON.parse(String(init.body)));
      return new Response(JSON.stringify(json), { status });
    });
    return calls;
  };
  const live = () => {
    vi.stubEnv("NEXCONN_APP_KEY", "key123");
    vi.stubEnv("NEXCONN_APP_SECRET", "secret");
    vi.stubEnv("NEXCONN_API_BASE", "https://api.us-light-api.com");
  };
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("gives a host a token, the room's channel and the North America data center", async () => {
    live();
    const calls = api((p) => (p.endsWith("/issue") ? [200, { code: 0, result: { accessToken: "tok" } }] : [200, { code: 0 }]));
    const res = await POST(req({ code: "K7M2QX", userId: "u-host01", host: true, title: "All hands" }));
    expect(await res.json()).toEqual({ mode: "nexconn", appKey: "key123", area: "NA", token: "tok", groupId: "floor-K7M2QX", userId: "u-host01", hostId: "u-host01" });
    expect(calls).toEqual(["/v4/auth/access-token/issue", "/v4/group-channel/create"]);
  });

  it("joins instead when a returning host finds the channel already exists (HTTP 400, code 25409)", async () => {
    live();
    const calls = api((p) =>
      p.endsWith("/issue") ? [200, { code: 0, result: { accessToken: "tok" } }] : p.endsWith("/create") ? [400, { code: 25409, errorMessage: "Group channel ID already exists" }] : [200, { code: 0 }],
    );
    const res = await POST(req({ code: "K7M2QX", userId: "u-host01", host: true }));
    expect(res.status).toBe(200);
    expect((await res.json()).hostId).toBeUndefined();
    expect(calls).toEqual(["/v4/auth/access-token/issue", "/v4/group-channel/create", "/v4/group-channel/join"]);
  });

  it("tells a guest who the host is, from the channel owner", async () => {
    live();
    api((p) => (p.endsWith("/issue") ? [200, { code: 0, result: { accessToken: "tok" } }] : [200, { code: 0, result: { channelId: "floor-K7M2QX", owner: "u-host01", memberCount: 2 } }]));
    const body = await (await POST(req({ code: "K7M2QX", userId: "u-guest1" }))).json();
    expect(body).toMatchObject({ mode: "nexconn", userId: "u-guest1", hostId: "u-host01", groupId: "floor-K7M2QX" });
  });

  it("tells a guest plainly when the room has not been opened (code 25410)", async () => {
    live();
    api((p) => (p.endsWith("/issue") ? [200, { code: 0, result: { accessToken: "tok" } }] : [400, { code: 25410, errorMessage: "Group channel ID does not exist" }]));
    const res = await POST(req({ code: "K7M2QX", userId: "u-guest1" }));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toMatch(/not open yet/);
  });
});
