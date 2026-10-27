import { NextResponse } from "next/server";
import { z } from "zod";
import { groupIdFor, isRoomCode } from "@/lib/ids";
import { createGroup, issueToken, joinGroup, nexconnConfig, NexconnError } from "@/lib/nexconn-server";

export const dynamic = "force-dynamic";

const Body = z.object({
  code: z.string().refine(isRoomCode, "bad room code"),
  userId: z.string().regex(/^u-[a-z0-9]{3,40}$/),
  name: z.string().trim().max(40).default(""),
  host: z.boolean().default(false),
  title: z.string().trim().max(80).optional(),
});

const hits = new Map<string, { n: number; reset: number }>();
function limited(ip: string, max = 30, windowMs = 60_000): boolean {
  const now = Date.now();
  const h = hits.get(ip);
  if (!h || h.reset < now) {
    hits.set(ip, { n: 1, reset: now + windowMs });
    return false;
  }
  h.n++;
  return h.n > max;
}

/** Hands the browser what it needs to join a room: demo mode, or a Nexconn App Key plus a user token. */
export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (limited(ip)) return NextResponse.json({ error: "Too many joins from here. Try again in a minute." }, { status: 429 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "That room link does not look right." }, { status: 400 });
  const { code, userId, name, host, title } = parsed.data;

  const cfg = nexconnConfig();
  if (!cfg) return NextResponse.json({ mode: "local" as const });

  const groupId = groupIdFor(code);
  try {
    const token = await issueToken(cfg, userId, name || "Guest");
    if (host) {
      try {
        await createGroup(cfg, groupId, title || `Floor ${code}`, userId);
      } catch (e) {
        if (!(e instanceof NexconnError && e.status === 409)) throw e;
        await joinGroup(cfg, groupId, userId);
      }
    } else {
      await joinGroup(cfg, groupId, userId);
    }
    return NextResponse.json({ mode: "nexconn" as const, appKey: cfg.appKey, token, groupId });
  } catch (e) {
    const detail = e instanceof NexconnError ? `${e.path} ${e.status} ${e.code ?? ""}`.trim() : "unexpected";
    console.error("session failed", detail);
    return NextResponse.json({ error: "Could not reach the chat service. Try again in a moment.", detail }, { status: 502 });
  }
}
