import { describe, expect, it } from "vitest";
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
