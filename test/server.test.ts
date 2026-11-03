import { describe, expect, it, vi } from "vitest";
import { areaFor, createGroup, GROUP_EXISTS, issueToken, nexconnConfig, NexconnError, sign, signedHeaders } from "@/lib/nexconn-server";
import { isRoomCode, normalizeCode, roomCode } from "@/lib/ids";

const cfg = { appKey: "key123", appSecret: "secret", apiBase: "https://api.example.test", area: "SG" as const };

describe("signing", () => {
  it("matches sha1(secret + nonce + timestamp) computed independently", () => {
    // python3: hashlib.sha1(b"secretABCnonce1231700000000000").hexdigest()
    expect(sign("secret", "ABCnonce123", "1700000000000")).toBe("1cedeb7feeac9edc3f03ad6194281fdafaa8bf71");
  });

  it("sends App-Key, Nonce, Timestamp and Signature headers", () => {
    const h = signedHeaders(cfg, 1700000000000, "ABCnonce123");
    expect(h).toMatchObject({ "App-Key": "key123", Nonce: "ABCnonce123", Timestamp: "1700000000000", Signature: sign("secret", "ABCnonce123", "1700000000000") });
  });
});

describe("config", () => {
  it("is null unless all three values are set", () => {
    expect(nexconnConfig({})).toBeNull();
    expect(nexconnConfig({ NEXCONN_APP_KEY: "k", NEXCONN_APP_SECRET: "s" })).toBeNull();
    expect(nexconnConfig({ NEXCONN_APP_KEY: "k", NEXCONN_APP_SECRET: "s", NEXCONN_API_BASE: "api.x.test/" })?.apiBase).toBe("https://api.x.test");
  });
});

describe("data center", () => {
  it("picks North America for the us-light-api domain and Singapore otherwise", () => {
    expect(areaFor("https://api.us-light-api.com")).toBe("NA");
    expect(areaFor("https://api-b.us-light-api.com")).toBe("NA");
    expect(areaFor("https://api.sg-light-api.com")).toBe("SG");
    expect(areaFor("https://evil-us-light-api.com.example")).toBe("SG");
  });

  it("lets NEXCONN_AREA override the guess and ignores junk", () => {
    expect(areaFor("https://api.sg-light-api.com", "na")).toBe("NA");
    expect(areaFor("https://api.us-light-api.com", "mars")).toBe("NA");
  });

  it("carries the area and backup domain through config", () => {
    const c = nexconnConfig({ NEXCONN_APP_KEY: "k", NEXCONN_APP_SECRET: "s", NEXCONN_API_BASE: "https://api.us-light-api.com", NEXCONN_API_BASE_BACKUP: "api-b.us-light-api.com/" });
    expect(c).toMatchObject({ area: "NA", apiBackup: "https://api-b.us-light-api.com" });
  });
});

describe("server calls", () => {
  it("fails over to the backup domain on a 5xx and keeps the answer", async () => {
    const f = vi.fn(async (u: string) =>
      u.startsWith("https://main.test") ? new Response("down", { status: 503 }) : new Response(JSON.stringify({ code: 0, result: { accessToken: "tok" } })),
    );
    const c = { ...cfg, apiBase: "https://main.test", apiBackup: "https://backup.test" };
    await expect(issueToken(c, "u-a", "Ana", f as unknown as typeof fetch)).resolves.toBe("tok");
    expect(f.mock.calls.map((x) => String(x[0]))).toEqual(["https://main.test/v4/auth/access-token/issue", "https://backup.test/v4/auth/access-token/issue"]);
  });

  it("fails over when the primary is unreachable, but not on a 4xx", async () => {
    const down = vi.fn(async (u: string) => {
      if (u.startsWith("https://main.test")) throw new TypeError("fetch failed");
      return new Response(JSON.stringify({ code: 0, result: { accessToken: "tok" } }));
    });
    const c = { ...cfg, apiBase: "https://main.test", apiBackup: "https://backup.test" };
    await expect(issueToken(c, "u-a", "Ana", down as unknown as typeof fetch)).resolves.toBe("tok");
    const bad = vi.fn(async () => new Response(JSON.stringify({ code: GROUP_EXISTS, errorMessage: "Group channel ID already exists" }), { status: 400 }));
    const err = await createGroup(c, "floor-ABCDEF", "x", "u-a", bad as unknown as typeof fetch).catch((e) => e);
    expect(bad).toHaveBeenCalledTimes(1);
    expect(err.code).toBe(GROUP_EXISTS);
  });

  it("issues a token and posts the right body", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ code: 200, result: { userId: "u-a", accessToken: "tok" } })));
    await expect(issueToken(cfg, "u-a", "Ana", f as unknown as typeof fetch)).resolves.toBe("tok");
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.example.test/v4/auth/access-token/issue");
    expect(JSON.parse(String(init.body))).toEqual({ userId: "u-a", name: "Ana" });
  });

  it("raises a typed error with the HTTP status on failure", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ code: 40901, errorMessage: "exists" }), { status: 409 }));
    const err = await createGroup(cfg, "floor-ABCDEF", "x", "u-a", f as unknown as typeof fetch).catch((e) => e);
    expect(err).toBeInstanceOf(NexconnError);
    expect(err.status).toBe(409);
    expect(err.code).toBe(40901);
  });
});

describe("room codes", () => {
  it("generates readable six character codes", () => {
    for (let i = 0; i < 200; i++) expect(isRoomCode(roomCode())).toBe(true);
    expect(isRoomCode("ABC10I")).toBe(false);
    expect(normalizeCode(" k7m-2qx ")).toBe("K7M2QX");
  });
});
